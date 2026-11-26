const pool = require('../db');

/**
 * Write an audit log entry.
 * This should be called WITHIN an existing transaction client
 * when atomicity is required (e.g., during claim approval).
 */
async function writeAuditLog(client, {
  performedBy,
  action,
  entityType,
  entityId,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  const query = `
    INSERT INTO audit_logs
      (performed_by, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, created_at
  `;
  const values = [
    performedBy || null,
    action,
    entityType,
    entityId || null,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    ipAddress || null,
    userAgent || null,
    metadata ? JSON.stringify(metadata) : null,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Convenience: write audit log using pool (auto-connection, outside transaction)
 */
async function logAction(params) {
  const client = await pool.connect();
  try {
    return await writeAuditLog(client, params);
  } finally {
    client.release();
  }
}

module.exports = { writeAuditLog, logAction };
