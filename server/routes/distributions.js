const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { writeAuditLog } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');

const router = express.Router();
router.use(authenticate, authorize('admin', 'staff'));

/**
 * GET /api/distributions
 * Official distribution / release records with FEFO batch deductions per fulfilled claim
 */
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let statusClause = `c.status = 'released'`;

    if (status === 'approved' || status === 'released') {
      params.push(status);
      statusClause = `c.status = $${params.length}`;
    } else if (status === 'all') {
      statusClause = `c.status IN ('approved', 'released')`;
    } else if (status) {
      return res.status(400).json({ error: 'status must be approved, released, or all' });
    }

    params.push(parseInt(limit, 10), offset);

    const query = `
      SELECT
        c.id AS claim_id,
        c.status,
        c.requested_quantity,
        c.approved_quantity,
        c.reviewed_at,
        c.released_at,
        c.created_at,
        h.household_code,
        h.head_name,
        h.purok,
        ii.name AS item_name,
        ii.unit AS item_unit,
        ii.category AS item_category,
        reviewer.full_name AS approved_by_name,
        COALESCE(
          json_agg(
            json_build_object(
              'batch_id', ib.id,
              'batch_number', ib.batch_number,
              'expiry_date', ib.expiry_date,
              'quantity_deducted', cbd.quantity_deducted,
              'deducted_at', cbd.deducted_at
            ) ORDER BY ib.expiry_date ASC NULLS LAST
          ) FILTER (WHERE cbd.id IS NOT NULL),
          '[]'::json
        ) AS batch_deductions
      FROM claims c
      JOIN households h ON c.household_id = h.id
      JOIN inventory_items ii ON c.item_id = ii.id
      LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
      LEFT JOIN claim_batch_deductions cbd ON cbd.claim_id = c.id
      LEFT JOIN inventory_batches ib ON ib.id = cbd.batch_id
      WHERE ${statusClause}
      GROUP BY c.id, h.id, ii.id, reviewer.full_name
      ORDER BY COALESCE(c.released_at, c.reviewed_at, c.created_at) DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);
    res.json({ distributions: result.rows });
  } catch (err) {
    console.error('Distributions fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch distribution records' });
  }
});

/**
 * POST /api/distributions/:claimId/release
 * Dedicated release-record endpoint transitioning an approved claim to released atomically
 */
router.post('/:claimId/release', async (req, res) => {
  const { claimId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const claimRes = await client.query('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [claimId]);
    if (claimRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimRes.rows[0];
    if (claim.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Claim must be approved before release (current: ${claim.status})` });
    }

    const updated = await client.query(
      `UPDATE claims SET status = 'released', released_at = NOW() WHERE id = $1 RETURNING *`,
      [claimId]
    );

    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: 'DISTRIBUTION_RELEASED',
      entityType: 'claim',
      entityId: claimId,
      oldValue: { status: 'approved' },
      newValue: { status: 'released' },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    let notification = null;
    if (claim.resident_id) {
      notification = await createNotification(client, {
        recipientId: claim.resident_id,
        recipientRole: 'resident',
        type: 'CLAIM_RELEASED',
        title: 'Relief Assistance Released',
        message: 'Your approved relief assistance has been physically released.',
        entityType: 'claim',
        entityId: claimId,
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      const payload = { ...updated.rows[0], action: 'released' };
      io.to('staff').emit('claim:update', payload);
      if (claim.resident_id) {
        io.to(`resident:${claim.resident_id}`).emit('claim:update', payload);
        if (notification) {
          io.to(`resident:${claim.resident_id}`).emit('notification:new', notification);
        }
      }
    }

    res.status(200).json({
      message: 'Distribution release recorded',
      distribution: updated.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Distribution release error:', err);
    res.status(500).json({ error: 'Failed to record distribution release' });
  } finally {
    client.release();
  }
});

module.exports = router;
