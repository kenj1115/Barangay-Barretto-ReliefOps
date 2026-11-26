const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/notifications
 * Residents see notifications targeted to their user ID; staff/admin see staff/admin role alerts or their own.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || '30', 10));
    let result;

    if (req.user.role === 'resident') {
      result = await pool.query(
        `SELECT * FROM notifications
         WHERE recipient_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.user.id, limit]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM notifications
         WHERE recipient_id = $1 OR recipient_role IN ('staff', 'admin')
         ORDER BY created_at DESC
         LIMIT $2`,
        [req.user.id, limit]
      );
    }

    const unreadCount = result.rows.filter((n) => !n.is_read).length;
    res.json({ notifications: result.rows, unread_count: unreadCount });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PUT /api/notifications/read-all
 */
router.put('/read-all', async (req, res) => {
  try {
    if (req.user.role === 'resident') {
      await pool.query(
        'UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false',
        [req.user.id]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = true
         WHERE (recipient_id = $1 OR recipient_role IN ('staff', 'admin')) AND is_read = false`,
        [req.user.id]
      );
    }
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Read-all notifications error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

/**
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1
         AND (recipient_id = $2 OR ($3 IN ('admin', 'staff') AND recipient_role IN ('staff', 'admin')))
       RETURNING *`,
      [req.params.id, req.user.id, req.user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

module.exports = router;
