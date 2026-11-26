const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/dashboard/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const [claimsStats, inventoryStats, donationStats, recentClaims, recentAudit] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total_claims,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_claims,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved_claims,
          COUNT(*) FILTER (WHERE status = 'denied') AS denied_claims,
          COUNT(*) FILTER (WHERE status = 'released') AS released_claims,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS claims_today
        FROM claims
      `),
      pool.query(`
        WITH item_usable AS (
          SELECT
            ii.id,
            ii.low_stock_threshold,
            COALESCE(SUM(ib.quantity) FILTER (
              WHERE ib.quantity > 0 AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
            ), 0)::int AS usable_quantity
          FROM inventory_items ii
          LEFT JOIN inventory_batches ib ON ib.item_id = ii.id AND ib.quantity > 0
          WHERE ii.is_active = true
          GROUP BY ii.id
        )
        SELECT
          COUNT(*)::int AS total_items,
          COUNT(*) FILTER (WHERE usable_quantity <= low_stock_threshold)::int AS low_stock_count,
          COUNT(*) FILTER (WHERE usable_quantity = 0)::int AS out_of_stock,
          COALESCE(SUM(usable_quantity), 0)::int AS total_units
        FROM item_usable
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total_donations,
          COALESCE(SUM(amount) FILTER (WHERE amount IS NOT NULL), 0)::numeric(15,2) AS total_cash_received_php,
          COALESCE((SELECT SUM(amount) FROM cash_disbursements), 0)::numeric(15,2) AS total_cash_spent_php,
          (
            COALESCE(SUM(amount) FILTER (WHERE amount IS NOT NULL), 0) -
            COALESCE((SELECT SUM(amount) FROM cash_disbursements), 0)
          )::numeric(15,2) AS cash_balance_php
        FROM donations
      `),
      pool.query(`
        SELECT c.*, h.household_code, h.head_name, ii.name AS item_name, u.full_name AS resident_name
        FROM claims c
        LEFT JOIN households h ON c.household_id = h.id
        LEFT JOIN inventory_items ii ON c.item_id = ii.id
        LEFT JOIN users u ON c.resident_id = u.id
        ORDER BY c.created_at DESC LIMIT 5
      `),
      pool.query(`
        SELECT al.*, u.full_name AS performer_name
        FROM audit_logs al
        LEFT JOIN users u ON al.performed_by = u.id
        ORDER BY al.created_at DESC LIMIT 5
      `),
    ]);

    res.json({
      claims: claimsStats.rows[0],
      inventory: inventoryStats.rows[0],
      donations: donationStats.rows[0],
      recent_claims: recentClaims.rows,
      recent_audit: recentAudit.rows,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;
