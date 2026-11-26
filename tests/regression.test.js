const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../server/db');
const { io: createSocketClient } = require('../client/node_modules/socket.io-client');

const TEST_PORT = process.env.TEST_PORT || '3099';
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProc;
let adminToken;
let residentToken;
let residentUserId;
let residentHouseholdId;
const createdItemIds = [];
const createdClaimIds = [];
const createdDonationIds = [];
const createdCashDisbursementIds = [];

async function apiFetch(route, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connectRealtime(token) {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['server/index.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: TEST_PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Server startup timed out'));
    }, 10000);

    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Running at:')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString();
      if (msg.includes('EADDRINUSE')) {
        clearTimeout(timer);
        reject(new Error(`Port ${TEST_PORT} already in use before running tests`));
      }
    });
  });
}

describe('Barangay Barretto ReliefOps Regression Suite', () => {
  before(async () => {
    serverProc = await startServer();

    const adminLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' },
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.data.token;

    const residentLogin = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username: 'resident1', password: 'resident123' },
    });
    assert.equal(residentLogin.status, 200);
    residentToken = residentLogin.data.token;
    residentUserId = residentLogin.data.user.id;
    residentHouseholdId = residentLogin.data.user.household_id;
  });

  after(async () => {
    try {
      if (createdClaimIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE entity_id = ANY($1::uuid[])', [createdClaimIds]);
        await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])', [createdClaimIds]);
        await pool.query('DELETE FROM claims WHERE id = ANY($1::uuid[])', [createdClaimIds]);
      }
      if (createdDonationIds.length > 0) {
        await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])', [createdDonationIds]);
        await pool.query('DELETE FROM inventory_batches WHERE donation_id = ANY($1::uuid[])', [createdDonationIds]);
        await pool.query('DELETE FROM donations WHERE id = ANY($1::uuid[])', [createdDonationIds]);
      }
      if (createdCashDisbursementIds.length > 0) {
        await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])', [createdCashDisbursementIds]);
        await pool.query('DELETE FROM cash_disbursements WHERE id = ANY($1::uuid[])', [createdCashDisbursementIds]);
      }
      if (createdItemIds.length > 0) {
        await pool.query('DELETE FROM notifications WHERE entity_id = ANY($1::uuid[])', [createdItemIds]);
        await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::uuid[])', [createdItemIds]);
        await pool.query('DELETE FROM inventory_items WHERE id = ANY($1::uuid[])', [createdItemIds]);
      }
    } finally {
      if (serverProc) serverProc.kill();
      await pool.end();
    }
  });

  it('keeps seed inventory batches and donations idempotent when schema.sql is rerun', async () => {
    const schemaSql = fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf8');
    await pool.query(schemaSql);
    const firstBatchCount = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM inventory_batches WHERE batch_number LIKE 'BATCH-0%'"
    );
    const firstDonCount = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM donations WHERE donor_name IN ('Red Cross Philippines', 'DSWD Region III', 'Jollibee Foundation')"
    );

    await pool.query(schemaSql);
    const secondBatchCount = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM inventory_batches WHERE batch_number LIKE 'BATCH-0%'"
    );
    const secondDonCount = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM donations WHERE donor_name IN ('Red Cross Philippines', 'DSWD Region III', 'Jollibee Foundation')"
    );

    assert.equal(firstBatchCount.rows[0].cnt, 10);
    assert.equal(secondBatchCount.rows[0].cnt, 10);
    assert.equal(firstDonCount.rows[0].cnt, 3);
    assert.equal(secondDonCount.rows[0].cnt, 3);
  });

  it('enforces authentication, API RBAC, and Resident Portal route restriction', async () => {
    const unauth = await apiFetch('/api/inventory');
    assert.equal(unauth.status, 401);

    const residentCreateItem = await apiFetch('/api/inventory', {
      method: 'POST',
      token: residentToken,
      body: { name: 'Blocked', category: 'Food', unit: 'pack' },
    });
    assert.equal(residentCreateItem.status, 403);

    const residentReport = await apiFetch('/api/reports/distribution', { token: residentToken });
    assert.equal(residentReport.status, 403);

    const appSource = fs.readFileSync(path.resolve(__dirname, '../client/src/App.jsx'), 'utf8');
    assert.match(appSource, /path="\/portal"[\s\S]*?<ProtectedRoute roles=\{\['resident'\]\}>/);
  });

  it('rejects claims from residents for households they do not belong to', async () => {
    const inv = await apiFetch('/api/inventory', { token: adminToken });
    const validItem = inv.data.find((i) => i.available_quantity > 0);
    assert.ok(validItem);

    const spoofed = await apiFetch('/api/claims', {
      method: 'POST',
      token: residentToken,
      body: {
        household_id: '10000000-0000-0000-0000-000000000002',
        item_id: validItem.id,
        requested_quantity: 1,
        reason: 'Cross-household attempt',
      },
    });
    assert.equal(spoofed.status, 403);

    const missingHH = await apiFetch('/api/claims', {
      method: 'POST',
      token: adminToken,
      body: {
        household_id: '99999999-9999-9999-9999-999999999999',
        item_id: validItem.id,
        requested_quantity: 1,
        reason: 'Missing household',
      },
    });
    assert.equal(missingHH.status, 404);
  });

  it('executes in-kind donation + FEFO batch creation + audit log atomically with rollback on invalid batch', async () => {
    const invalidCash = await apiFetch('/api/donations', {
      method: 'POST',
      token: adminToken,
      body: {
        donor_name: `INVALID-CASH-${Date.now()}`,
        donor_type: 'individual',
        category: 'Cash',
        received_date: '2026-11-26',
        amount: '-5.00',
      },
    });
    assert.equal(invalidCash.status, 400);

    const itemRes = await apiFetch('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: { name: 'TEST Atomic Donation Item', category: 'Food', unit: 'pack', low_stock_threshold: 5 },
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.id;
    createdItemIds.push(itemId);

    // Invalid nonexistent item_id must roll back and leave zero donation rows
    const badDonorName = `ROLLBACK-DONOR-${Date.now()}`;
    const badRes = await apiFetch('/api/donations', {
      method: 'POST',
      token: adminToken,
      body: {
        donor_name: badDonorName,
        donor_type: 'organization',
        category: 'Food',
        received_date: '2026-11-26',
        item_id: '99999999-9999-9999-9999-999999999999',
        quantity: 25,
      },
    });
    assert.equal(badRes.status, 404);
    const orphanCheck = await pool.query('SELECT COUNT(*)::int AS cnt FROM donations WHERE donor_name = $1', [
      badDonorName,
    ]);
    assert.equal(orphanCheck.rows[0].cnt, 0);

    // Valid atomic in-kind donation
    const goodRes = await apiFetch('/api/donations', {
      method: 'POST',
      token: adminToken,
      body: {
        donor_name: 'Subic Civic Test Donor',
        donor_type: 'ngo',
        category: 'Food',
        received_date: '2026-11-26',
        item_id: itemId,
        quantity: 40,
        batch_number: 'ATOMIC-01',
      },
    });
    assert.equal(goodRes.status, 201);
    assert.ok(goodRes.data.batch);
    assert.equal(goodRes.data.inventory_item.total_quantity, 40);
    createdDonationIds.push(goodRes.data.id);
  });

  it('rejects registering an already-expired batch via POST /api/inventory/:id/batches', async () => {
    const itemRes = await apiFetch('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: { name: 'TEST Expiry Guard Item', category: 'Food', unit: 'pack', low_stock_threshold: 2 },
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.id;
    createdItemIds.push(itemId);

    const badBatch = await apiFetch(`/api/inventory/${itemId}/batches`, {
      method: 'POST',
      token: adminToken,
      body: { batch_number: 'EXP-TEST', quantity: 10, expiry_date: '2020-01-01' },
    });
    assert.equal(badBatch.status, 400);
    assert.match(badBatch.data.error, /expired/i);
  });

  it('excludes expired stock, supports atomic approve+release, persists resident notifications, and enforces concurrent row locking', async () => {
    const itemRes = await apiFetch('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: { name: 'TEST FEFO Safety Item', category: 'Food', unit: 'pack', low_stock_threshold: 2 },
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.id;
    createdItemIds.push(itemId);

    // Insert 1 expired batch (qty 50) directly in DB and 1 unexpired batch (qty 5)
    const expBatch = await pool.query(
      `INSERT INTO inventory_batches (item_id, batch_number, quantity, expiry_date)
       VALUES ($1, 'EXP-50', 50, CURRENT_DATE - INTERVAL '3 days') RETURNING id`,
      [itemId]
    );
    const validBatch = await pool.query(
      `INSERT INTO inventory_batches (item_id, batch_number, quantity, expiry_date)
       VALUES ($1, 'VALID-5', 5, CURRENT_DATE + INTERVAL '10 days') RETURNING id`,
      [itemId]
    );
    await pool.query('UPDATE inventory_items SET total_quantity = 55 WHERE id = $1', [itemId]);

    // GET /api/inventory/:id should only expose 5 unexpired units, and quarantine 50
    const getItem = await apiFetch(`/api/inventory/${itemId}`, { token: adminToken });
    assert.equal(getItem.status, 200);
    assert.equal(getItem.data.total_quantity, 5);
    assert.equal(getItem.data.available_quantity, 5);
    assert.equal(getItem.data.expired_quantity, 50);
    assert.equal(getItem.data.batches.length, 1);
    assert.equal(getItem.data.batches[0].batch_number, 'VALID-5');
    assert.equal(getItem.data.expired_batches.length, 1);

    // Claim requesting 10 units must fail because 50 expired units cannot be used
    const overClaim = await apiFetch('/api/claims', {
      method: 'POST',
      token: residentToken,
      body: {
        household_id: residentHouseholdId,
        item_id: itemId,
        requested_quantity: 10,
        reason: 'Over unexpired limit',
      },
    });
    assert.equal(overClaim.status, 400);

    // Valid claim for 4 units succeeds
    const validClaim = await apiFetch('/api/claims', {
      method: 'POST',
      token: residentToken,
      body: {
        household_id: residentHouseholdId,
        item_id: itemId,
        requested_quantity: 4,
        reason: 'Valid unexpired request',
      },
    });
    assert.equal(validClaim.status, 201);
    createdClaimIds.push(validClaim.data.id);

    // Double-claim within cooldown returns 409 Conflict
    const dupClaim = await apiFetch('/api/claims', {
      method: 'POST',
      token: residentToken,
      body: {
        household_id: residentHouseholdId,
        item_id: itemId,
        requested_quantity: 1,
        reason: 'Duplicate within cooldown',
      },
    });
    assert.equal(dupClaim.status, 409);

    // Approve + release atomically -> deducts ONLY from VALID-5, writes persistent notification
    const approveRes = await apiFetch(`/api/claims/${validClaim.data.id}/approve`, {
      method: 'PUT',
      token: adminToken,
      body: { approved_quantity: 4, release_immediately: true },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.claim.status, 'released');
    assert.equal(approveRes.data.deductions.length, 1);
    assert.equal(approveRes.data.deductions[0].batch_id, validBatch.rows[0].id);

    // Verify persistent notification created for resident1
    const notifRes = await apiFetch('/api/notifications', { token: residentToken });
    assert.equal(notifRes.status, 200);
    const claimNotif = notifRes.data.notifications.find(
      (n) => n.entity_id === validClaim.data.id && n.recipient_id === residentUserId
    );
    assert.ok(claimNotif);
    assert.equal(claimNotif.type, 'CLAIM_RELEASED');

    // Verify dedicated distributions and reports APIs reflect real DB records
    const distRes = await apiFetch('/api/distributions', { token: adminToken });
    assert.equal(distRes.status, 200);
    assert.ok(distRes.data.distributions.some((d) => d.claim_id === validClaim.data.id));

    const repRes = await apiFetch('/api/reports/distribution', { token: adminToken });
    assert.equal(repRes.status, 200);
    assert.ok(Array.isArray(repRes.data.purok_breakdown));
    assert.ok(repRes.data.summary.registered_households >= 3);

    const releasedUnits = await pool.query(`
      SELECT COALESCE(SUM(cbd.quantity_deducted), 0)::int AS total
      FROM claim_batch_deductions cbd
      JOIN claims c ON c.id = cbd.claim_id
      WHERE c.status = 'released'
    `);
    const allocatedUnits = await pool.query(`
      SELECT COALESCE(SUM(cbd.quantity_deducted), 0)::int AS total
      FROM claim_batch_deductions cbd
      JOIN claims c ON c.id = cbd.claim_id
      WHERE c.status = 'approved'
    `);
    assert.equal(repRes.data.summary.goods_units_distributed, releasedUnits.rows[0].total);
    assert.equal(repRes.data.summary.goods_units_allocated, allocatedUnits.rows[0].total);

    const releaseLedger = await apiFetch('/api/distributions', { token: adminToken });
    assert.equal(releaseLedger.status, 200);
    assert.ok(releaseLedger.data.distributions.every((d) => d.status === 'released'));

    const expRow = await pool.query('SELECT quantity FROM inventory_batches WHERE id = $1', [
      expBatch.rows[0].id,
    ]);
    const validRow = await pool.query('SELECT quantity FROM inventory_batches WHERE id = $1', [
      validBatch.rows[0].id,
    ]);
    assert.equal(expRow.rows[0].quantity, 50);
    assert.equal(validRow.rows[0].quantity, 1);

    // Concurrent approval race test on the last 1 unexpired unit
    const hh2 = '10000000-0000-0000-0000-000000000002';
    const hh3 = '10000000-0000-0000-0000-000000000003';
    const [c2, c3] = await Promise.all([
      apiFetch('/api/claims', {
        method: 'POST',
        token: adminToken,
        body: { household_id: hh2, item_id: itemId, requested_quantity: 1, reason: 'Race 1' },
      }),
      apiFetch('/api/claims', {
        method: 'POST',
        token: adminToken,
        body: { household_id: hh3, item_id: itemId, requested_quantity: 1, reason: 'Race 2' },
      }),
    ]);
    assert.equal(c2.status, 201);
    assert.equal(c3.status, 201);
    createdClaimIds.push(c2.data.id, c3.data.id);

    const [a2, a3] = await Promise.all([
      apiFetch(`/api/claims/${c2.data.id}/approve`, {
        method: 'PUT',
        token: adminToken,
        body: { approved_quantity: 1 },
      }),
      apiFetch(`/api/claims/${c3.data.id}/approve`, {
        method: 'PUT',
        token: adminToken,
        body: { approved_quantity: 1 },
      }),
    ]);

    const statuses = [a2.status, a3.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 400]);

    const finalValidRow = await pool.query('SELECT quantity FROM inventory_batches WHERE id = $1', [
      validBatch.rows[0].id,
    ]);
    assert.equal(finalValidRow.rows[0].quantity, 0);
  });

  it('serializes simultaneous cooldown checks for the same household and item', async () => {
    const itemRes = await apiFetch('/api/inventory', {
      method: 'POST',
      token: adminToken,
      body: { name: `TEST Cooldown Race ${Date.now()}`, category: 'Food', unit: 'pack' },
    });
    assert.equal(itemRes.status, 201);
    const itemId = itemRes.data.id;
    createdItemIds.push(itemId);

    const batchRes = await apiFetch(`/api/inventory/${itemId}/batches`, {
      method: 'POST',
      token: adminToken,
      body: { batch_number: 'COOLDOWN-RACE', quantity: 10 },
    });
    assert.equal(batchRes.status, 201);

    const requests = await Promise.all([
      apiFetch('/api/claims', {
        method: 'POST',
        token: residentToken,
        body: {
          household_id: residentHouseholdId,
          item_id: itemId,
          requested_quantity: 1,
          reason: 'Concurrent cooldown test A',
        },
      }),
      apiFetch('/api/claims', {
        method: 'POST',
        token: residentToken,
        body: {
          household_id: residentHouseholdId,
          item_id: itemId,
          requested_quantity: 1,
          reason: 'Concurrent cooldown test B',
        },
      }),
    ]);

    assert.deepEqual(requests.map((r) => r.status).sort((a, b) => a - b), [201, 409]);
    createdClaimIds.push(requests.find((r) => r.status === 201).data.id);
  });

  it('records cash assistance atomically, enforces available balance, and reports actual disbursements', async () => {
    const before = await apiFetch('/api/reports/distribution', { token: adminToken });
    assert.equal(before.status, 200);
    const householdsRes = await apiFetch('/api/households', { token: adminToken });
    assert.equal(householdsRes.status, 200);
    assert.ok(householdsRes.data.households.length > 0);

    const payment = await apiFetch('/api/cash-disbursements', {
      method: 'POST',
      token: adminToken,
      body: {
        household_id: householdsRes.data.households[0].id,
        amount: '1.23',
        purpose: 'Regression test cash aid',
        payment_reference: `TEST-${Date.now()}`,
      },
    });
    assert.equal(payment.status, 201);
    createdCashDisbursementIds.push(payment.data.disbursement.id);
    assert.equal(Number(payment.data.cash_balance).toFixed(2), (Number(before.data.summary.cash_remaining_balance) - 1.23).toFixed(2));

    const ledger = await apiFetch('/api/cash-disbursements', { token: adminToken });
    assert.equal(ledger.status, 200);
    assert.ok(ledger.data.disbursements.some((entry) => entry.id === payment.data.disbursement.id));

    const after = await apiFetch('/api/reports/distribution', { token: adminToken });
    assert.equal(after.status, 200);
    assert.equal(
      Number(after.data.summary.total_cash_spent).toFixed(2),
      (Number(before.data.summary.total_cash_spent) + 1.23).toFixed(2)
    );
    assert.equal(
      Number(after.data.summary.cash_remaining_balance).toFixed(2),
      (Number(after.data.summary.total_cash_received) - Number(after.data.summary.total_cash_spent)).toFixed(2)
    );

    const excessive = await apiFetch('/api/cash-disbursements', {
      method: 'POST',
      token: adminToken,
      body: {
        household_id: householdsRes.data.households[0].id,
        amount: '9999999999999.99',
        purpose: 'Must not overdraw the cash fund',
      },
    });
    assert.equal(excessive.status, 400);

    const invalidPrecision = await apiFetch('/api/cash-disbursements', {
      method: 'POST',
      token: adminToken,
      body: {
        household_id: householdsRes.data.households[0].id,
        amount: '1.234',
        purpose: 'Invalid precision',
      },
    });
    assert.equal(invalidPrecision.status, 400);

    const raceBalance = Number(after.data.summary.cash_remaining_balance);
    const raceAmount = Number((raceBalance * 0.6).toFixed(2));
    assert.ok(raceAmount > 0);
    const racedPayments = await Promise.all([
      apiFetch('/api/cash-disbursements', {
        method: 'POST',
        token: adminToken,
        body: {
          household_id: householdsRes.data.households[0].id,
          amount: raceAmount.toFixed(2),
          purpose: 'Concurrent balance guard A',
        },
      }),
      apiFetch('/api/cash-disbursements', {
        method: 'POST',
        token: adminToken,
        body: {
          household_id: householdsRes.data.households[0].id,
          amount: raceAmount.toFixed(2),
          purpose: 'Concurrent balance guard B',
        },
      }),
    ]);
    assert.deepEqual(racedPayments.map((result) => result.status).sort((a, b) => a - b), [201, 400]);
    createdCashDisbursementIds.push(
      racedPayments.find((result) => result.status === 201).data.disbursement.id
    );
  });

  it('authenticates realtime connections and restricts staff events to staff sockets', async () => {
    const unauthenticatedError = await new Promise((resolve, reject) => {
      const socket = createSocketClient(BASE_URL, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 3000,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('Unauthenticated realtime connection was not rejected'));
      }, 3000);
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        socket.close();
        resolve(err);
      });
    });
    assert.match(unauthenticatedError.message, /Authentication required/);

    const adminSocket = await connectRealtime(adminToken);
    const residentSocket = await connectRealtime(residentToken);
    try {
      adminSocket.emit('join:staff');
      residentSocket.emit('join:staff');
      residentSocket.emit('join:resident', '99999999-9999-9999-9999-999999999999');

      const staffEventPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Staff socket did not receive donation event')), 3000);
        adminSocket.once('donation:created', (donation) => {
          clearTimeout(timer);
          resolve(donation);
        });
      });
      let residentReceivedStaffEvent = false;
      residentSocket.once('donation:created', () => {
        residentReceivedStaffEvent = true;
      });

      const donation = await apiFetch('/api/donations', {
        method: 'POST',
        token: adminToken,
        body: {
          donor_name: `SOCKET-EVENT-${Date.now()}`,
          donor_type: 'individual',
          category: 'Cash',
          amount: '1.00',
          received_date: new Date().toISOString().slice(0, 10),
        },
      });
      assert.equal(donation.status, 201);
      createdDonationIds.push(donation.data.id);

      const staffEvent = await staffEventPromise;
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(staffEvent.id, donation.data.id);
      assert.equal(residentReceivedStaffEvent, false);
    } finally {
      adminSocket.close();
      residentSocket.close();
    }
  });
});
