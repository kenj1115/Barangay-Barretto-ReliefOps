const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

const targetDb = process.env.DB_NAME || 'barangay_reliefops';

async function ensureDatabaseExists() {
  const adminPool = new Pool({ ...dbConfig, database: 'postgres' });
  try {
    const res = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb]
    );
    if (res.rows.length === 0) {
      if (!/^[a-zA-Z0-9_]+$/.test(targetDb)) {
        throw new Error(`Unsafe database name: ${targetDb}`);
      }
      await adminPool.query(`CREATE DATABASE ${targetDb}`);
      console.log(`✅ Created database "${targetDb}"`);
    }
  } finally {
    await adminPool.end();
  }
}

async function setup() {
  console.log('🔧 Setting up database...');
  let pool;
  try {
    await ensureDatabaseExists();
    pool = new Pool({ ...dbConfig, database: targetDb });
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema created and seed data inserted!');
    console.log('\n🔑 Demo credentials:');
    console.log('   Admin:    admin / admin123');
    console.log('   Staff:    staff1 / staff123');
    console.log('   Resident: resident1 / resident123');
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.log('\n💡 Tip: Update DB_PASSWORD (and DB_USER/DATABASE_URL) in .env to match your local PostgreSQL credentials.');
    } else if (err.message.includes('does not exist')) {
      console.log('\n💡 Tip: Create the database first:');
      console.log(`   createdb ${targetDb}`);
      console.log(`   Or via psql: CREATE DATABASE ${targetDb};`);
    }
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

setup();
