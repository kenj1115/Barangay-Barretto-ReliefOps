const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();
router.use(authenticate);

const UNEXPIRED_CONDITION = '(ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)';

/**
 * GET /api/inventory
 * Returns active inventory items with strictly unexpired stock totals and FEFO batches.
 * Expired batches (expiry_date < CURRENT_DATE) are excluded from available stock and
 * returned separately under `expired_batches` / `expired_quantity` for quarantine visibility.
 */
router.get('/', async (req, res) => {
  try {
    const { category, low_stock, search } = req.query;
    const conditions = ['ii.is_active = true'];
    const params = [];

    if (category) {
      params.push(category);
      conditions.push(`ii.category = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`ii.name ILIKE $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const havingClause =
      low_stock === 'true'
        ? `HAVING COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0) <= ii.low_stock_threshold`
        : '';

    const query = `
      SELECT
        ii.id,
        ii.name,
        ii.category,
        ii.unit,
        COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::int AS total_quantity,
        ii.reserved_quantity,
        GREATEST(0, COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::int - ii.reserved_quantity) AS available_quantity,
        COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ib.expiry_date < CURRENT_DATE), 0)::int AS expired_quantity,
        ii.low_stock_threshold,
        ii.description,
        ii.image_url,
        ii.is_active,
        ii.created_at,
        ii.updated_at,
        (COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::float / NULLIF(ii.low_stock_threshold, 0) * 100)::int AS stock_pct,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ib.id,
              'batch_number', ib.batch_number,
              'quantity', ib.quantity,
              'expiry_date', ib.expiry_date,
              'received_date', ib.received_date
            ) ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date ASC
          ) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}),
          '[]'::json
        ) AS batches,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ib.id,
              'batch_number', ib.batch_number,
              'quantity', ib.quantity,
              'expiry_date', ib.expiry_date,
              'received_date', ib.received_date
            ) ORDER BY ib.expiry_date ASC
          ) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ib.expiry_date < CURRENT_DATE),
          '[]'::json
        ) AS expired_batches
      FROM inventory_items ii
      LEFT JOIN inventory_batches ib ON ib.item_id = ii.id AND ib.quantity > 0
      ${where}
      GROUP BY ii.id
      ${havingClause}
      ORDER BY
        CASE
          WHEN COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0) <= ii.low_stock_threshold
          THEN 0 ELSE 1
        END,
        ii.name
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Inventory fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

/**
 * GET /api/inventory/stats/summary
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await pool.query(`
      WITH item_usable AS (
        SELECT
          ii.id,
          ii.category,
          ii.low_stock_threshold,
          COALESCE(SUM(ib.quantity) FILTER (WHERE ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::int AS usable_quantity
        FROM inventory_items ii
        LEFT JOIN inventory_batches ib ON ib.item_id = ii.id AND ib.quantity > 0
        WHERE ii.is_active = true
        GROUP BY ii.id
      )
      SELECT
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE usable_quantity <= low_stock_threshold)::int AS low_stock_items,
        COUNT(*) FILTER (WHERE usable_quantity = 0)::int AS out_of_stock_items,
        COALESCE(SUM(usable_quantity), 0)::int AS total_units,
        COUNT(DISTINCT category)::int AS categories
      FROM item_usable
    `);

    const batchCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE expiry_date IS NOT NULL
            AND expiry_date >= CURRENT_DATE
            AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
            AND quantity > 0
        )::int AS expiring_soon,
        COUNT(*) FILTER (
          WHERE expiry_date IS NOT NULL
            AND expiry_date < CURRENT_DATE
            AND quantity > 0
        )::int AS expired_batches
      FROM inventory_batches
    `);

    res.json({
      ...stats.rows[0],
      expiring_soon: batchCounts.rows[0].expiring_soon,
      expired_batches: batchCounts.rows[0].expired_batches,
    });
  } catch (err) {
    console.error('Inventory summary error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory stats' });
  }
});

/**
 * GET /api/inventory/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        ii.id,
        ii.name,
        ii.category,
        ii.unit,
        COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::int AS total_quantity,
        ii.reserved_quantity,
        GREATEST(0, COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}), 0)::int - ii.reserved_quantity) AS available_quantity,
        COALESCE(SUM(ib.quantity) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ib.expiry_date < CURRENT_DATE), 0)::int AS expired_quantity,
        ii.low_stock_threshold,
        ii.description,
        ii.image_url,
        ii.is_active,
        ii.created_at,
        ii.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ib.id,
              'batch_number', ib.batch_number,
              'quantity', ib.quantity,
              'expiry_date', ib.expiry_date,
              'received_date', ib.received_date
            ) ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date ASC
          ) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ${UNEXPIRED_CONDITION}),
          '[]'::json
        ) AS batches,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ib.id,
              'batch_number', ib.batch_number,
              'quantity', ib.quantity,
              'expiry_date', ib.expiry_date,
              'received_date', ib.received_date
            ) ORDER BY ib.expiry_date ASC
          ) FILTER (WHERE ib.id IS NOT NULL AND ib.quantity > 0 AND ib.expiry_date < CURRENT_DATE),
          '[]'::json
        ) AS expired_batches
       FROM inventory_items ii
       LEFT JOIN inventory_batches ib ON ib.item_id = ii.id AND ib.quantity > 0
       WHERE ii.id = $1
       GROUP BY ii.id`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

/**
 * POST /api/inventory
 */
router.post('/', authorize('admin', 'staff'), async (req, res) => {
  const { name, category, unit, total_quantity = 0, low_stock_threshold = 10, description } = req.body;

  if (!name || !category || !unit) {
    return res.status(400).json({ error: 'name, category, and unit are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO inventory_items (name, category, unit, total_quantity, low_stock_threshold, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, category, unit, total_quantity, low_stock_threshold, description]
    );

    await logAction({
      performedBy: req.user.id,
      action: 'ITEM_CREATED',
      entityType: 'inventory_item',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

/**
 * PUT /api/inventory/:id
 */
router.put('/:id', authorize('admin', 'staff'), async (req, res) => {
  const { name, category, unit, low_stock_threshold, description } = req.body;

  try {
    const old = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    const result = await pool.query(
      `UPDATE inventory_items
       SET name = COALESCE($1, name), category = COALESCE($2, category),
           unit = COALESCE($3, unit), low_stock_threshold = COALESCE($4, low_stock_threshold),
           description = COALESCE($5, description)
       WHERE id = $6 RETURNING *`,
      [name, category, unit, low_stock_threshold, description, req.params.id]
    );

    await logAction({
      performedBy: req.user.id,
      action: 'ITEM_UPDATED',
      entityType: 'inventory_item',
      entityId: req.params.id,
      oldValue: old.rows[0],
      newValue: result.rows[0],
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item' });
  }
});

/**
 * POST /api/inventory/:id/batches
 * Add a new unexpired batch to an existing item
 */
router.post('/:id/batches', authorize('admin', 'staff'), async (req, res) => {
  const { batch_number, quantity, expiry_date, donation_id, notes } = req.body;

  if (!quantity || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'quantity must be positive' });
  }

  if (expiry_date) {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (String(expiry_date).slice(0, 10) < todayIso) {
      return res.status(400).json({ error: 'Cannot register an already-expired batch' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemLock = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (itemLock.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    const batch = await client.query(
      `INSERT INTO inventory_batches (item_id, batch_number, quantity, expiry_date, donation_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, batch_number, Number(quantity), expiry_date || null, donation_id || null, notes]
    );

    // Sync cached total_quantity with strictly unexpired batch quantities
    const usableRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS usable_quantity
       FROM inventory_batches
       WHERE item_id = $1 AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`,
      [req.params.id]
    );

    const updatedItem = await client.query(
      'UPDATE inventory_items SET total_quantity = $1 WHERE id = $2 RETURNING *',
      [usableRes.rows[0].usable_quantity, req.params.id]
    );

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.emit('inventory:update', updatedItem.rows[0]);
    }

    res.status(201).json(batch.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to add batch' });
  } finally {
    client.release();
  }
});

module.exports = router;
