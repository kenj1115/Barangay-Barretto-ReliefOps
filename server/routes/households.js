const express = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('admin', 'staff'));

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, household_code, head_name, purok
       FROM households
       ORDER BY household_code ASC
       LIMIT 500`
    );
    res.json({ households: result.rows });
  } catch (err) {
    console.error('Household fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

module.exports = router;
