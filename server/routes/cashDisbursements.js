const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { writeAuditLog } = require('../services/auditService');

const router = express.Router();
router.use(authenticate, authorize('admin', 'staff'));

router.get('/', async (req, res) => {
  const page = Number.parseInt(req.query.page || '1', 10);
  const limit = Number.parseInt(req.query.limit || '50', 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'page must be positive and limit must be between 1 and 100' });
  }

  const offset = (page - 1) * limit;
  try {
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT cd.*, h.household_code, h.head_name, h.purok, u.full_name AS disbursed_by_name
         FROM cash_disbursements cd
         JOIN households h ON h.id = cd.household_id
         LEFT JOIN users u ON u.id = cd.disbursed_by
         ORDER BY cd.disbursed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM cash_disbursements'),
    ]);

    res.json({
      disbursements: rows.rows,
      total: count.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error('Cash disbursement fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch cash disbursements' });
  }
});

router.post('/', async (req, res) => {
  const {
    household_id,
    amount,
    purpose,
    payment_reference,
    notes,
  } = req.body;

  const amountText = String(amount ?? '').trim();
  const numericAmount = Number(amountText);
  if (
    !/^\d+(\.\d{1,2})?$/.test(amountText) ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    numericAmount > 9999999999999.99
  ) {
    return res.status(400).json({ error: 'amount must be a positive value with at most two decimal places' });
  }
  if (typeof household_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(household_id)) {
    return res.status(400).json({ error: 'A valid household_id is required' });
  }
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.trim().length > 500) {
    return res.status(400).json({ error: 'purpose is required and must be 500 characters or fewer' });
  }
  if (payment_reference != null && String(payment_reference).length > 100) {
    return res.status(400).json({ error: 'payment_reference must be 100 characters or fewer' });
  }

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cash-disbursement-balance']);

    const household = await client.query('SELECT id FROM households WHERE id = $1', [household_id]);
    if (household.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Household not found' });
    }

    const balanceResult = await client.query(`
      SELECT
        COALESCE((SELECT SUM(amount) FROM donations WHERE amount > 0), 0)::numeric(15,2) AS cash_received,
        COALESCE((SELECT SUM(amount) FROM cash_disbursements), 0)::numeric(15,2) AS cash_spent
    `);
    const cashReceived = Number(balanceResult.rows[0].cash_received);
    const cashSpent = Number(balanceResult.rows[0].cash_spent);
    const cashBalance = cashReceived - cashSpent;
    if (numericAmount > cashBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient cash balance. Available: ${cashBalance.toFixed(2)}`,
        available: cashBalance,
      });
    }

    const inserted = await client.query(
      `INSERT INTO cash_disbursements
         (household_id, amount, purpose, payment_reference, notes, disbursed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        household_id,
        amountText,
        purpose.trim(),
        payment_reference ? String(payment_reference).trim() : null,
        notes ? String(notes).trim() : null,
        req.user.id,
      ]
    );

    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: 'CASH_ASSISTANCE_DISBURSED',
      entityType: 'cash_disbursement',
      entityId: inserted.rows[0].id,
      newValue: {
        household_id,
        amount: amountText,
        purpose: purpose.trim(),
        payment_reference: payment_reference ? String(payment_reference).trim() : null,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    await client.query('COMMIT');
    committed = true;

    const remainingBalance = Number((cashBalance - numericAmount).toFixed(2));
    const io = req.app.get('io');
    if (io) {
      io.to('staff').emit('cash:disbursement', {
        ...inserted.rows[0],
        cash_balance: remainingBalance,
      });
    }

    res.status(201).json({
      disbursement: inserted.rows[0],
      cash_balance: remainingBalance,
    });
  } catch (err) {
    if (!committed) {
      await client.query('ROLLBACK');
    }
    console.error('Cash disbursement creation error:', err);
    res.status(500).json({ error: 'Failed to record cash disbursement' });
  } finally {
    client.release();
  }
});

module.exports = router;
