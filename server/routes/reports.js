const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('admin', 'staff'));

/**
 * GET /api/reports/distribution
 * Real database-backed distribution, purok coverage, and fund-flow report.
 * Zero hard-coded household baselines or estimated cash figures.
 */
router.get('/distribution', async (req, res) => {
  try {
    const [purokRes, fundFlowRes, goodsPoolRes, itemRes, donorRes] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(h.purok, 'Unassigned') AS purok,
          COUNT(DISTINCT h.id)::int AS registered_households,
          COUNT(DISTINCT CASE WHEN c.status = 'released' THEN h.id END)::int AS served_households,
          COUNT(c.id) FILTER (WHERE c.status = 'released')::int AS claims_fulfilled,
          COUNT(c.id) FILTER (WHERE c.status = 'approved')::int AS claims_awaiting_release,
          COUNT(c.id) FILTER (WHERE c.status = 'pending')::int AS pending_claims,
          COALESCE(SUM(COALESCE(c.approved_quantity, c.requested_quantity)) FILTER (WHERE c.status = 'released'), 0)::int AS goods_units_distributed,
          COALESCE(SUM(COALESCE(c.approved_quantity, c.requested_quantity)) FILTER (WHERE c.status = 'approved'), 0)::int AS goods_units_allocated
        FROM households h
        LEFT JOIN claims c ON c.household_id = h.id
        GROUP BY COALESCE(h.purok, 'Unassigned')
        ORDER BY COALESCE(h.purok, 'Unassigned')
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_donations,
          COALESCE(SUM(amount) FILTER (WHERE amount IS NOT NULL), 0)::numeric(15,2) AS total_cash_received,
          COALESCE((
            SELECT SUM(cd.amount)
            FROM cash_disbursements cd
          ), 0)::numeric(15,2) AS total_cash_spent
        FROM donations
      `),
      pool.query(`
        SELECT
          COALESCE((
            SELECT SUM(ib.quantity)::int
            FROM inventory_batches ib
            JOIN inventory_items ii ON ii.id = ib.item_id
            WHERE ii.is_active = true
              AND ib.quantity > 0
              AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
          ), 0)::int AS goods_units_remaining,
          COALESCE((
            SELECT SUM(ib.quantity)::int
            FROM inventory_batches ib
            JOIN inventory_items ii ON ii.id = ib.item_id
            WHERE ii.is_active = true
              AND ib.quantity > 0
              AND ib.expiry_date < CURRENT_DATE
          ), 0)::int AS expired_units_quarantined,
          COALESCE((
            SELECT SUM(cbd.quantity_deducted)::int
            FROM claim_batch_deductions cbd
            JOIN claims c ON c.id = cbd.claim_id
            WHERE c.status = 'released'
          ), 0)::int AS goods_units_distributed,
          COALESCE((
            SELECT SUM(cbd.quantity_deducted)::int
            FROM claim_batch_deductions cbd
            JOIN claims c ON c.id = cbd.claim_id
            WHERE c.status = 'approved'
          ), 0)::int AS goods_units_allocated
      `),
      pool.query(`
        SELECT
          ii.id,
          ii.name,
          ii.category,
          ii.unit,
          COALESCE(SUM(cbd.quantity_deducted) FILTER (WHERE c.status = 'released'), 0)::int AS units_distributed,
          COALESCE(SUM(cbd.quantity_deducted) FILTER (WHERE c.status = 'approved'), 0)::int AS units_allocated
        FROM inventory_items ii
        LEFT JOIN inventory_batches ib ON ib.item_id = ii.id
        LEFT JOIN claim_batch_deductions cbd ON cbd.batch_id = ib.id
        LEFT JOIN claims c ON c.id = cbd.claim_id
        WHERE ii.is_active = true
        GROUP BY ii.id
        ORDER BY units_distributed DESC, ii.name ASC
      `),
      pool.query(`
        SELECT
          donor_name,
          donor_type,
          COUNT(*)::int AS contribution_count,
          COALESCE(SUM(amount), 0)::numeric(15,2) AS cash_total
        FROM donations
        GROUP BY donor_name, donor_type
        ORDER BY cash_total DESC, donor_name ASC
      `),
    ]);

    const purokRows = purokRes.rows.map((row) => ({
      ...row,
      remaining_unserved: Math.max(0, row.registered_households - row.served_households),
      coverage_pct:
        row.registered_households > 0
          ? Number(((row.served_households / row.registered_households) * 100).toFixed(1))
          : 0,
    }));

    const totalRegistered = purokRows.reduce((s, r) => s + r.registered_households, 0);
    const totalServed = purokRows.reduce((s, r) => s + r.served_households, 0);
    const totalDistributed = goodsPoolRes.rows[0].goods_units_distributed;
    const totalAllocated = goodsPoolRes.rows[0].goods_units_allocated;
    const totalRemaining = goodsPoolRes.rows[0].goods_units_remaining;
    const totalGoodsPool = totalDistributed + totalAllocated + totalRemaining;

    const fundFlow = fundFlowRes.rows[0];
    const cashReceived = Number(fundFlow.total_cash_received || 0);
    const cashSpent = Number(fundFlow.total_cash_spent || 0);
    const cashRemaining = cashReceived - cashSpent;

    res.json({
      summary: {
        registered_households: totalRegistered,
        served_households: totalServed,
        coverage_rate_pct:
          totalRegistered > 0 ? Number(((totalServed / totalRegistered) * 100).toFixed(1)) : 0,
        goods_units_distributed: totalDistributed,
        goods_units_allocated: totalAllocated,
        goods_units_remaining: totalRemaining,
        expired_units_quarantined: goodsPoolRes.rows[0].expired_units_quarantined,
        goods_utilization_pct:
          totalGoodsPool > 0 ? Number(((totalDistributed / totalGoodsPool) * 100).toFixed(1)) : 0,
        total_donations: fundFlow.total_donations,
        total_cash_received: cashReceived,
        total_cash_spent: cashSpent,
        cash_remaining_balance: cashRemaining,
        cash_disbursed_pct:
          cashReceived > 0 ? Number(((cashSpent / cashReceived) * 100).toFixed(1)) : 0,
      },
      purok_breakdown: purokRows,
      item_breakdown: itemRes.rows,
      donor_summary: donorRes.rows,
    });
  } catch (err) {
    console.error('Distribution report error:', err);
    res.status(500).json({ error: 'Failed to generate distribution report' });
  }
});

module.exports = router;
