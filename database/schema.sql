-- ============================================================
-- Barangay Barretto ReliefOps - PostgreSQL Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS (Staff & Residents)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'staff', 'resident')),
  household_id VARCHAR(100),
  purok VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DONATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  donor_name VARCHAR(200) NOT NULL,
  donor_type VARCHAR(50) CHECK (donor_type IN ('individual', 'organization', 'government', 'ngo')),
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(15,2),
  currency VARCHAR(10) DEFAULT 'PHP',
  items_description TEXT,
  received_date DATE NOT NULL,
  received_by UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'received' CHECK (status IN ('received', 'verified', 'allocated', 'spent')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY ITEMS (master catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT qty_non_negative CHECK (total_quantity >= 0),
  CONSTRAINT reserved_non_negative CHECK (reserved_quantity >= 0)
);

-- ============================================================
-- INVENTORY BATCHES (FEFO - First Expiry First Out)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number VARCHAR(100),
  quantity INTEGER NOT NULL,
  expiry_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  donation_id UUID REFERENCES donations(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT batch_qty_non_negative CHECK (quantity >= 0)
);

-- Index for FEFO ordering (earliest expiry first)
CREATE INDEX IF NOT EXISTS idx_batches_fefo ON inventory_batches (item_id, expiry_date ASC NULLS LAST, received_date ASC);

-- ============================================================
-- HOUSEHOLDS
-- ============================================================
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_code VARCHAR(100) UNIQUE NOT NULL,
  head_name VARCHAR(200) NOT NULL,
  address TEXT NOT NULL,
  purok VARCHAR(50),
  member_count INTEGER NOT NULL DEFAULT 1,
  contact_number VARCHAR(20),
  priority_level VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('critical', 'high', 'normal', 'low')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLAIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id),
  resident_id UUID REFERENCES users(id),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  requested_quantity INTEGER NOT NULL,
  approved_quantity INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'released', 'denied', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up latest claim per household/item (cooldown check)
CREATE INDEX IF NOT EXISTS idx_claims_household_item ON claims (household_id, item_id, created_at DESC);

-- ============================================================
-- CLAIM BATCH DEDUCTIONS (FEFO tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS claim_batch_deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id),
  quantity_deducted INTEGER NOT NULL,
  deducted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  performed_by UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (performed_by, created_at DESC);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES users(id),
  recipient_role VARCHAR(50),
  type VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, is_read, created_at DESC);

-- ============================================================
-- CASH ASSISTANCE DISBURSEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_disbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  purpose VARCHAR(500) NOT NULL CHECK (length(trim(purpose)) > 0),
  payment_reference VARCHAR(100),
  notes TEXT,
  disbursed_by UUID REFERENCES users(id),
  disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_disbursements_household_date
  ON cash_disbursements (household_id, disbursed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_disbursements_date
  ON cash_disbursements (disbursed_at DESC);

-- ============================================================
-- TRIGGERS: auto-update updated_at timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','donations','inventory_items','inventory_batches','households','claims']
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trigger_update_%s ON %s;
      CREATE TRIGGER trigger_update_%s
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- SEED DATA (Demo)
-- ============================================================

-- Demo users: admin/admin123, staff1/staff123, resident1/resident123
INSERT INTO users (id, username, password_hash, full_name, email, role, household_id, purok) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', '$2a$10$0VqfmwZNfNQ955ZwvmqZH.2XstufjwdOBRLsyg3cXvAjX4/meuzNi', 'Admin User', 'admin@barangay-barretto.gov.ph', 'admin', NULL, NULL),
  ('00000000-0000-0000-0000-000000000002', 'staff1', '$2a$10$F0sm3ukn7GPzf/NNEl/BJe78CDwzkzJST0pgPPAuiU7nxNDMcdqkm', 'Maria Santos', 'maria@barangay-barretto.gov.ph', 'staff', NULL, NULL),
  ('00000000-0000-0000-0000-000000000003', 'resident1', '$2a$10$TKVMd3GP2f4R1H2HFsJwE.x8KCZhjJk.KR0Gn4XrXWqdPKUqn8DE.', 'Juan dela Cruz', 'juan@email.com', 'resident', '10000000-0000-0000-0000-000000000001', 'Purok 1')
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  household_id = EXCLUDED.household_id,
  purok = EXCLUDED.purok;

-- Households
INSERT INTO households (id, household_code, head_name, address, purok, member_count, contact_number, priority_level) VALUES
  ('10000000-0000-0000-0000-000000000001', 'HH-001', 'Juan dela Cruz', '123 Rizal St., Barangay Barretto', 'Purok 1', 5, '09171234567', 'high'),
  ('10000000-0000-0000-0000-000000000002', 'HH-002', 'Maria Reyes', '456 Mabini Ave., Barangay Barretto', 'Purok 2', 3, '09181234567', 'normal'),
  ('10000000-0000-0000-0000-000000000003', 'HH-003', 'Pedro Santos', '789 Bonifacio Blvd., Barangay Barretto', 'Purok 3', 7, '09191234567', 'critical')
ON CONFLICT (household_code) DO NOTHING;

-- Inventory items
INSERT INTO inventory_items (id, name, category, unit, total_quantity, low_stock_threshold) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Instant Noodles', 'Food', 'pack', 500, 50),
  ('20000000-0000-0000-0000-000000000002', 'Canned Goods (Sardines)', 'Food', 'can', 300, 30),
  ('20000000-0000-0000-0000-000000000003', 'Rice (5kg bag)', 'Food', 'bag', 150, 20),
  ('20000000-0000-0000-0000-000000000004', 'Bottled Water (1.5L)', 'Water', 'bottle', 1000, 100),
  ('20000000-0000-0000-0000-000000000005', 'Hygiene Kit', 'Hygiene', 'kit', 80, 10),
  ('20000000-0000-0000-0000-000000000006', 'First Aid Kit', 'Medical', 'kit', 25, 5),
  ('20000000-0000-0000-0000-000000000007', 'Blanket', 'Shelter', 'piece', 60, 10),
  ('20000000-0000-0000-0000-000000000008', 'Emergency Candle', 'Supplies', 'piece', 15, 20)
ON CONFLICT DO NOTHING;

-- Batches (FEFO ordering) — idempotent seed with safe deduplication on rerun
DELETE FROM inventory_batches a
USING inventory_batches b
WHERE a.ctid <> b.ctid
  AND a.item_id = b.item_id
  AND a.batch_number = b.batch_number
  AND a.batch_number IN ('BATCH-001','BATCH-002','BATCH-003','BATCH-004','BATCH-005','BATCH-006','BATCH-007','BATCH-008','BATCH-009','BATCH-010')
  AND NOT EXISTS (SELECT 1 FROM claim_batch_deductions cbd WHERE cbd.batch_id = a.id)
  AND (
    EXISTS (SELECT 1 FROM claim_batch_deductions cbd WHERE cbd.batch_id = b.id)
    OR a.ctid > b.ctid
  );

INSERT INTO inventory_batches (id, item_id, batch_number, quantity, expiry_date, received_date)
SELECT v.id, v.item_id, v.batch_number, v.quantity, v.expiry_date, v.received_date
FROM (VALUES
  ('30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'BATCH-001', 200, (CURRENT_DATE + INTERVAL '18 days')::date, CURRENT_DATE - INTERVAL '14 days'),
  ('30000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'BATCH-002', 300, (CURRENT_DATE + INTERVAL '120 days')::date, CURRENT_DATE - INTERVAL '5 days'),
  ('30000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'BATCH-003', 150, (CURRENT_DATE + INTERVAL '5 days')::date, CURRENT_DATE - INTERVAL '25 days'),
  ('30000000-0000-0000-0000-000000000004'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'BATCH-004', 150, (CURRENT_DATE + INTERVAL '90 days')::date, CURRENT_DATE - INTERVAL '10 days'),
  ('30000000-0000-0000-0000-000000000005'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 'BATCH-005', 150, NULL::date, CURRENT_DATE - INTERVAL '14 days'),
  ('30000000-0000-0000-0000-000000000006'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, 'BATCH-006', 1000, (CURRENT_DATE + INTERVAL '180 days')::date, CURRENT_DATE - INTERVAL '14 days'),
  ('30000000-0000-0000-0000-000000000007'::uuid, '20000000-0000-0000-0000-000000000005'::uuid, 'BATCH-007', 80, NULL::date, CURRENT_DATE - INTERVAL '10 days'),
  ('30000000-0000-0000-0000-000000000008'::uuid, '20000000-0000-0000-0000-000000000006'::uuid, 'BATCH-008', 25, (CURRENT_DATE + INTERVAL '240 days')::date, CURRENT_DATE - INTERVAL '10 days'),
  ('30000000-0000-0000-0000-000000000009'::uuid, '20000000-0000-0000-0000-000000000007'::uuid, 'BATCH-009', 60, NULL::date, CURRENT_DATE - INTERVAL '7 days'),
  ('30000000-0000-0000-0000-000000000010'::uuid, '20000000-0000-0000-0000-000000000008'::uuid, 'BATCH-010', 15, NULL::date, CURRENT_DATE - INTERVAL '7 days')
) AS v(id, item_id, batch_number, quantity, expiry_date, received_date)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_batches ib
  WHERE ib.id = v.id OR (ib.item_id = v.item_id AND ib.batch_number = v.batch_number)
);

-- Sync inventory_items.total_quantity to strictly unexpired batch totals
UPDATE inventory_items ii
SET total_quantity = COALESCE((
  SELECT SUM(ib.quantity)::int
  FROM inventory_batches ib
  WHERE ib.item_id = ii.id
    AND ib.quantity > 0
    AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
), 0);

-- Sample donations — idempotent seed
DELETE FROM donations a
USING donations b
WHERE a.ctid > b.ctid
  AND a.donor_name = b.donor_name
  AND a.received_date = b.received_date
  AND a.donor_name IN ('Red Cross Philippines', 'DSWD Region III', 'Jollibee Foundation');

INSERT INTO donations (id, donor_name, donor_type, category, amount, received_date, status)
SELECT v.id, v.donor_name, v.donor_type, v.category, v.amount, v.received_date, v.status
FROM (VALUES
  ('40000000-0000-0000-0000-000000000001'::uuid, 'Red Cross Philippines', 'ngo', 'Cash', 50000.00::numeric, '2024-11-01'::date, 'allocated'),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'DSWD Region III', 'government', 'Food & Supplies', NULL::numeric, '2024-11-05'::date, 'verified'),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'Jollibee Foundation', 'organization', 'Food', 25000.00::numeric, '2024-11-10'::date, 'received')
) AS v(id, donor_name, donor_type, category, amount, received_date, status)
WHERE NOT EXISTS (
  SELECT 1 FROM donations d
  WHERE d.id = v.id OR (d.donor_name = v.donor_name AND d.received_date = v.received_date)
);
