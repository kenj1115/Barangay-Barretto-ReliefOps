const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/audit-logs
 */
router.get('/', authorize('admin', 'staff'), async (req, res) => {
  try {
    const { action, entity_type, performed_by, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (action) { params.push(`%${action}%`); conditions.push(`al.action ILIKE $${params.length}`); }
    if (entity_type) { params.push(entity_type); conditions.push(`al.entity_type = $${params.length}`); }
    if (performed_by) { params.push(performed_by); conditions.push(`al.performed_by = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);

    const query = `
      SELECT al.*, u.full_name AS performer_name, u.role AS performer_role
      FROM audit_logs al
      LEFT JOIN users u ON al.performed_by = u.id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `SELECT COUNT(*) FROM audit_logs al ${where}`;

    const [logs, count] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)),
    ]);

    res.json({
      logs: logs.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
