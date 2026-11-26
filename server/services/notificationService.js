const pool = require('../db');

/**
 * Insert a persistent notification into the notifications table.
 * Call inside a transaction client when atomicity is required.
 */
async function createNotification(
  clientOrPool,
  {
    recipientId = null,
    recipientRole = null,
    type,
    title,
    message,
    entityType = null,
    entityId = null,
  }
) {
  const executor = clientOrPool || pool;
  const result = await executor.query(
    `INSERT INTO notifications
       (recipient_id, recipient_role, type, title, message, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [recipientId, recipientRole, type, title, message, entityType, entityId]
  );
  return result.rows[0];
}

module.exports = { createNotification };
