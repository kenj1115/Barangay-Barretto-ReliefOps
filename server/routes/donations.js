const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { writeAuditLog } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/donations
 */
router.get('/', async (req, res) => {
  try {
    const { status, donor_type, page = 1, limit = 50 } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }
    if (donor_type) {
      params.push(donor_type);
      conditions.push(`d.donor_type = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const result = await pool.query(
      `SELECT d.*, u.full_name AS received_by_name
       FROM donations d
       LEFT JOIN users u ON d.received_by = u.id
       ${where}
       ORDER BY d.received_date DESC, d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Fetch donations error:', err);
    res.status(500).json({ error: 'Failed to fetch donations' });
  }
});

/**
 * GET /api/donations/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_donations,
        COALESCE(SUM(amount) FILTER (WHERE amount IS NOT NULL), 0)::numeric(15,2) AS total_cash,
        COUNT(*) FILTER (WHERE donor_type = 'government')::int AS government_donations,
        COUNT(*) FILTER (WHERE donor_type = 'ngo')::int AS ngo_donations,
        COUNT(*) FILTER (WHERE donor_type = 'organization')::int AS organization_donations,
        COUNT(*) FILTER (WHERE donor_type = 'individual')::int AS individual_donations,
        COUNT(*) FILTER (WHERE status = 'received')::int AS pending_verification
      FROM donations
    `);

    const monthly = await pool.query(`
      SELECT
        DATE_TRUNC('month', received_date) AS month,
        COALESCE(SUM(amount), 0)::numeric(15,2) AS total,
        COUNT(*)::int AS count
      FROM donations
      WHERE received_date >= NOW() - INTERVAL '6 months'
      GROUP BY 1 ORDER BY 1
    `);

    res.json({ summary: stats.rows[0], monthly: monthly.rows });
  } catch (err) {
    console.error('Donation stats error:', err);
    res.status(500).json({ error: 'Failed to fetch donation stats' });
  }
});

/**
 * POST /api/donations
 * Atomic ACID transaction: logs cash or in-kind donation, creates linked FEFO inventory batch
 * (when item_id + quantity are provided), syncs unexpired inventory total, and writes audit log.
 */
router.post('/', authorize('admin', 'staff'), async (req, res) => {
  const {
    donor_name,
    donor_type,
    category,
    amount,
    received_date,
    items_description,
    notes,
    item_id,
    quantity,
    batch_number,
    expiry_date,
  } = req.body;

  if (!donor_name || !category || !received_date) {
    return res.status(400).json({ error: 'donor_name, category, and received_date are required' });
  }

  const isInKindWithStock = item_id !== undefined && item_id !== null && item_id !== '';
  const amountText = amount == null ? '' : String(amount).trim();
  if (
    amountText &&
    (!/^\d+(\.\d{1,2})?$/.test(amountText) ||
      !Number.isFinite(Number(amountText)) ||
      Number(amountText) <= 0 ||
      Number(amountText) > 9999999999999.99)
  ) {
    return res.status(400).json({ error: 'amount must be positive and have at most two decimal places' });
  }
  if (
    !isInKindWithStock &&
    typeof category === 'string' &&
    category.trim().toLowerCase() === 'cash' &&
    !amountText
  ) {
    return res.status(400).json({ error: 'amount is required for cash donations' });
  }
  if (isInKindWithStock) {
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'quantity must be positive for in-kind inventory donations' });
    }
    if (expiry_date) {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (String(expiry_date).slice(0, 10) < todayIso) {
        return res.status(400).json({ error: 'Cannot log an already-expired batch' });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let lockedItem = null;
    if (isInKindWithStock) {
      const itemRes = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1 AND is_active = true FOR UPDATE',
        [item_id]
      );
      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Target inventory item not found' });
      }
      lockedItem = itemRes.rows[0];
    }

    const effectiveBatchNumber =
      isInKindWithStock && (!batch_number || !String(batch_number).trim())
        ? `DON-${Date.now().toString().slice(-6)}`
        : batch_number
        ? String(batch_number).trim()
        : null;

    const effectiveDescription =
      items_description ||
      (lockedItem
        ? `${Number(quantity)}x ${lockedItem.name} (Batch ${effectiveBatchNumber})`
        : amount
        ? `Cash Donation PHP ${Number(amount).toLocaleString()}`
        : category);

    const donationResult = await client.query(
      `INSERT INTO donations
         (donor_name, donor_type, category, amount, received_date, received_by, items_description, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        donor_name.trim(),
        donor_type || 'individual',
        category,
        amountText ? amountText : null,
        received_date,
        req.user.id,
        effectiveDescription,
        notes || null,
        isInKindWithStock ? 'allocated' : 'verified',
      ]
    );

    const donation = donationResult.rows[0];
    let createdBatch = null;
    let updatedItem = null;

    if (isInKindWithStock) {
      const batchResult = await client.query(
        `INSERT INTO inventory_batches
           (item_id, batch_number, quantity, expiry_date, received_date, donation_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          item_id,
          effectiveBatchNumber,
          Number(quantity),
          expiry_date || null,
          received_date,
          donation.id,
          notes || `Donation from ${donor_name.trim()}`,
        ]
      );
      createdBatch = batchResult.rows[0];

      const usableRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS usable_quantity
         FROM inventory_batches
         WHERE item_id = $1 AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`,
        [item_id]
      );

      const itemUpdateRes = await client.query(
        'UPDATE inventory_items SET total_quantity = $1 WHERE id = $2 RETURNING *',
        [usableRes.rows[0].usable_quantity, item_id]
      );
      updatedItem = itemUpdateRes.rows[0];
    }

    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: 'DONATION_LOGGED',
      entityType: 'donation',
      entityId: donation.id,
      newValue: {
        donor_name: donation.donor_name,
        category: donation.category,
        amount: donation.amount,
        batch_id: createdBatch?.id || null,
        quantity_added: createdBatch?.quantity || null,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to('staff').emit('donation:created', donation);
      if (updatedItem) {
        io.emit('inventory:update', updatedItem);
      }
    }

    res.status(201).json({
      ...donation,
      batch: createdBatch,
      inventory_item: updatedItem,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create donation error (rolled back):', err);
    res.status(500).json({ error: 'Failed to create donation. Transaction rolled back.' });
  } finally {
    client.release();
  }
});

module.exports = router;
