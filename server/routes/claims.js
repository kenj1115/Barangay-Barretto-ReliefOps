const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { writeAuditLog } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

function emitTargetedClaimEvents(io, claimRow, action, notification) {
  if (!io || !claimRow) return;
  const payload = { ...claimRow, action };
  io.to('staff').emit('claim:update', payload);
  if (claimRow.resident_id) {
    io.to(`resident:${claimRow.resident_id}`).emit('claim:update', payload);
    if (notification) {
      io.to(`resident:${claimRow.resident_id}`).emit('notification:new', notification);
    }
  }
}

/**
 * GET /api/claims
 * List all claims (staff/admin), or own/household claims (resident)
 */
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    const params = [];

    if (req.user.role === 'resident') {
      const userRes = await pool.query(
        'SELECT id, household_id FROM users WHERE id = $1 AND is_active = true',
        [req.user.id]
      );
      if (userRes.rows.length === 0) {
        return res.status(403).json({ error: 'Resident account not active' });
      }
      const { household_id } = userRes.rows[0];
      if (household_id) {
        params.push(req.user.id, household_id);
        whereClause = `WHERE (c.resident_id = $1 OR c.household_id = $2)`;
      } else {
        params.push(req.user.id);
        whereClause = `WHERE c.resident_id = $1`;
      }
    }

    if (status) {
      params.push(status);
      whereClause += whereClause
        ? ` AND c.status = $${params.length}`
        : `WHERE c.status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);

    const query = `
      SELECT
        c.*,
        h.household_code, h.head_name, h.purok, h.priority_level,
        ii.name AS item_name, ii.unit AS item_unit, ii.category AS item_category,
        reviewer.full_name AS reviewer_name,
        u.full_name AS resident_name
      FROM claims c
      LEFT JOIN households h ON c.household_id = h.id
      LEFT JOIN inventory_items ii ON c.item_id = ii.id
      LEFT JOIN users reviewer ON c.reviewed_by = reviewer.id
      LEFT JOIN users u ON c.resident_id = u.id
      ${whereClause}
      ORDER BY
        CASE c.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        c.created_at ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `SELECT COUNT(*) FROM claims c ${whereClause}`;

    const [claimsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, params.length - 2)),
    ]);

    res.json({
      claims: claimsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

/**
 * POST /api/claims
 * Submit a new claim (resident or staff) with server-side household eligibility,
 * cooldown enforcement, and unexpired stock validation.
 */
router.post('/', async (req, res) => {
  const { household_id, item_id, requested_quantity, reason, priority = 'normal' } = req.body;

  if (!item_id || !requested_quantity || Number(requested_quantity) <= 0) {
    return res.status(400).json({ error: 'item_id and positive requested_quantity are required' });
  }

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');

    // 1. Server-side household eligibility validation
    const userRes = await client.query(
      'SELECT id, role, household_id, is_active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'User account is inactive or not found' });
    }
    const dbUser = userRes.rows[0];

    let effectiveHouseholdId = household_id;
    if (dbUser.role === 'resident') {
      if (!dbUser.household_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Your resident account is not linked to a verified barangay household.',
        });
      }
      if (household_id && String(household_id) !== String(dbUser.household_id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Residents can only submit aid claims for their own verified household.',
        });
      }
      effectiveHouseholdId = dbUser.household_id;
    }

    if (!effectiveHouseholdId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'household_id is required' });
    }

    const householdCheck = await client.query(
      'SELECT id, household_code, purok FROM households WHERE id = $1',
      [effectiveHouseholdId]
    );
    if (householdCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Verified household record not found' });
    }

    // Serialize requests for the same household/item until the claim is committed.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [String(effectiveHouseholdId), String(item_id)]
    );

    // 2. Check cooldown after acquiring the lock to prevent concurrent duplicates.
    const cooldownHours = parseInt(process.env.CLAIM_COOLDOWN_HOURS || '24', 10);
    const cooldownCheck = await client.query(
      `SELECT id, created_at FROM claims
       WHERE household_id = $1 AND item_id = $2
         AND status NOT IN ('denied', 'cancelled')
         AND created_at > NOW() - INTERVAL '${cooldownHours} hours'
       ORDER BY created_at DESC LIMIT 1`,
      [effectiveHouseholdId, item_id]
    );

    if (cooldownCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Cooldown active. This household already has a recent claim for this item. Please wait ${cooldownHours} hours.`,
        last_claim: cooldownCheck.rows[0].created_at,
      });
    }

    // 3. Check strictly unexpired available stock from inventory_batches
    const stockCheck = await client.query(
      `SELECT
         ii.id,
         ii.reserved_quantity,
         COALESCE(SUM(ib.quantity) FILTER (
           WHERE ib.quantity > 0 AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
         ), 0)::int AS unexpired_quantity
       FROM inventory_items ii
       LEFT JOIN inventory_batches ib ON ib.item_id = ii.id
       WHERE ii.id = $1 AND ii.is_active = true
       GROUP BY ii.id`,
      [item_id]
    );

    if (stockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    const { unexpired_quantity, reserved_quantity } = stockCheck.rows[0];
    const available = Math.max(0, Number(unexpired_quantity) - Number(reserved_quantity || 0));

    if (Number(requested_quantity) > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient unexpired stock. Available: ${available}`,
        available,
      });
    }

    const result = await client.query(
      `INSERT INTO claims (household_id, resident_id, item_id, requested_quantity, reason, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [effectiveHouseholdId, req.user.id, item_id, Number(requested_quantity), reason, priority]
    );

    await client.query('COMMIT');
    committed = true;

    const createdClaim = result.rows[0];
    const io = req.app.get('io');
    if (io) {
      io.to('staff').emit('claim:update', { ...createdClaim, action: 'submitted' });
    }

    res.status(201).json(createdClaim);
  } catch (err) {
    if (!committed) {
      await client.query('ROLLBACK');
    }
    console.error('Error creating claim:', err);
    res.status(500).json({ error: 'Failed to create claim' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/claims/:id/approve
 * ACID transaction with strictly unexpired FEFO deduction, row-level locking,
 * optional immediate release (`release_immediately: true`), audit logging, and persistent notification.
 */
router.put('/:id/approve', authorize('admin', 'staff'), async (req, res) => {
  const { id } = req.params;
  const { approved_quantity, notes, release_immediately = false } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the claim row to prevent concurrent approvals
    const claimResult = await client.query('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [id]);
    if (claimResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimResult.rows[0];
    if (claim.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Claim is already ${claim.status}` });
    }

    const qty = Number(approved_quantity || claim.requested_quantity);
    if (!qty || qty <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Approved quantity must be positive' });
    }

    // 2. Lock inventory item row
    const itemResult = await client.query(
      'SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE',
      [claim.item_id]
    );
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    const item = itemResult.rows[0];

    // 3. FEFO: Lock and select ONLY unexpired batches
    const batchesResult = await client.query(
      `SELECT * FROM inventory_batches
       WHERE item_id = $1
         AND quantity > 0
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
       ORDER BY expiry_date ASC NULLS LAST, received_date ASC
       FOR UPDATE`,
      [claim.item_id]
    );

    const unexpiredTotal = batchesResult.rows.reduce((sum, b) => sum + Number(b.quantity), 0);
    const available = Math.max(0, unexpiredTotal - Number(item.reserved_quantity || 0));

    if (qty > available) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient unexpired stock. Available: ${available}, Requested: ${qty}`,
        available,
      });
    }

    let remaining = qty;
    const deductions = [];

    for (const batch of batchesResult.rows) {
      if (remaining <= 0) break;
      const deduct = Math.min(Number(batch.quantity), remaining);

      await client.query('UPDATE inventory_batches SET quantity = quantity - $1 WHERE id = $2', [
        deduct,
        batch.id,
      ]);

      deductions.push({
        batch_id: batch.id,
        batch_number: batch.batch_number,
        quantity_deducted: deduct,
        expiry_date: batch.expiry_date,
      });
      remaining -= deduct;
    }

    if (remaining > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough unexpired batch stock after FEFO check' });
    }

    // 4. Record FEFO deductions
    for (const d of deductions) {
      await client.query(
        `INSERT INTO claim_batch_deductions (claim_id, batch_id, quantity_deducted)
         VALUES ($1, $2, $3)`,
        [id, d.batch_id, d.quantity_deducted]
      );
    }

    // 5. Sync inventory_items.total_quantity to remaining unexpired stock
    const newUnexpiredTotal = unexpiredTotal - qty;
    await client.query('UPDATE inventory_items SET total_quantity = $1 WHERE id = $2', [
      newUnexpiredTotal,
      claim.item_id,
    ]);

    // 6. Update claim status ('approved' or immediately 'released')
    const nextStatus = release_immediately ? 'released' : 'approved';
    const releasedAt = release_immediately ? new Date() : null;
    const updatedClaim = await client.query(
      `UPDATE claims
       SET status = $1,
           approved_quantity = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           released_at = COALESCE($4, released_at),
           notes = $5
       WHERE id = $6
       RETURNING *`,
      [nextStatus, qty, req.user.id, releasedAt, notes || null, id]
    );

    // 7. Write audit log inside transaction
    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: release_immediately ? 'CLAIM_APPROVED_AND_RELEASED' : 'CLAIM_APPROVED',
      entityType: 'claim',
      entityId: id,
      oldValue: { status: 'pending', quantity: claim.requested_quantity },
      newValue: { status: nextStatus, approved_quantity: qty, deductions },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // 8. Persist resident notification inside transaction
    let residentNotification = null;
    if (claim.resident_id) {
      residentNotification = await createNotification(client, {
        recipientId: claim.resident_id,
        recipientRole: 'resident',
        type: release_immediately ? 'CLAIM_RELEASED' : 'CLAIM_APPROVED',
        title: release_immediately ? 'Relief Claim Released' : 'Relief Claim Approved',
        message: release_immediately
          ? `Your request for ${qty} ${item.unit}(s) of ${item.name} has been approved and released.`
          : `Your request for ${qty} ${item.unit}(s) of ${item.name} is approved and ready for pickup at Barangay Barretto Hall.`,
        entityType: 'claim',
        entityId: id,
      });
    }

    // Persist staff low-stock notification if threshold reached
    let lowStockAlert = null;
    if (newUnexpiredTotal <= Number(item.low_stock_threshold || 0)) {
      lowStockAlert = await createNotification(client, {
        recipientRole: 'staff',
        type: 'LOW_STOCK',
        title: `Low Stock Alert: ${item.name}`,
        message: `${item.name} dropped to ${newUnexpiredTotal} ${item.unit}(s) (threshold: ${item.low_stock_threshold}).`,
        entityType: 'inventory_item',
        entityId: item.id,
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      const updatedItemRes = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [
        claim.item_id,
      ]);
      const updated = updatedItemRes.rows[0];
      io.emit('inventory:update', updated);
      emitTargetedClaimEvents(io, updatedClaim.rows[0], nextStatus, residentNotification);

      if (lowStockAlert) {
        io.to('staff').emit('inventory:low-stock', {
          item_id: updated.id,
          item_name: updated.name,
          quantity: updated.total_quantity,
          threshold: updated.low_stock_threshold,
          notification: lowStockAlert,
        });
      }
    }

    res.json({
      message: release_immediately
        ? 'Claim approved, FEFO deducted, and released successfully'
        : 'Claim approved successfully',
      claim: updatedClaim.rows[0],
      deductions,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve claim error (rolled back):', err);
    res.status(500).json({ error: 'Failed to approve claim. Transaction rolled back.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/claims/:id/deny
 */
router.put('/:id/deny', authorize('admin', 'staff'), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const claimResult = await client.query('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [id]);
    if (claimResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimResult.rows[0];
    if (claim.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Claim is already ${claim.status}` });
    }

    const updated = await client.query(
      `UPDATE claims SET status = 'denied', reviewed_by = $1, reviewed_at = NOW(), notes = $2
       WHERE id = $3 RETURNING *`,
      [req.user.id, notes || null, id]
    );

    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: 'CLAIM_DENIED',
      entityType: 'claim',
      entityId: id,
      oldValue: { status: 'pending' },
      newValue: { status: 'denied', notes },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    let residentNotification = null;
    if (claim.resident_id) {
      residentNotification = await createNotification(client, {
        recipientId: claim.resident_id,
        recipientRole: 'resident',
        type: 'CLAIM_DENIED',
        title: 'Relief Claim Denied',
        message: notes
          ? `Your relief claim was denied: ${notes}`
          : 'Your relief claim was denied by the BDRRMC verification team.',
        entityType: 'claim',
        entityId: id,
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    emitTargetedClaimEvents(io, updated.rows[0], 'denied', residentNotification);

    res.json({ message: 'Claim denied', claim: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Deny claim error:', err);
    res.status(500).json({ error: 'Failed to deny claim. Transaction rolled back.' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/claims/:id/release
 * Mark an approved claim as physically released to resident
 */
router.put('/:id/release', authorize('admin', 'staff'), async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const claimResult = await client.query('SELECT * FROM claims WHERE id = $1 FOR UPDATE', [id]);
    if (claimResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimResult.rows[0];
    if (claim.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Claim must be approved before releasing' });
    }

    const updated = await client.query(
      `UPDATE claims SET status = 'released', released_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    await writeAuditLog(client, {
      performedBy: req.user.id,
      action: 'CLAIM_RELEASED',
      entityType: 'claim',
      entityId: id,
      oldValue: { status: 'approved' },
      newValue: { status: 'released' },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    let residentNotification = null;
    if (claim.resident_id) {
      residentNotification = await createNotification(client, {
        recipientId: claim.resident_id,
        recipientRole: 'resident',
        type: 'CLAIM_RELEASED',
        title: 'Relief Assistance Released',
        message: 'Your approved relief assistance has been marked as released.',
        entityType: 'claim',
        entityId: id,
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    emitTargetedClaimEvents(io, updated.rows[0], 'released', residentNotification);

    res.json({ message: 'Claim released to resident', claim: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Release claim error:', err);
    res.status(500).json({ error: 'Failed to release claim' });
  } finally {
    client.release();
  }
});

module.exports = router;
