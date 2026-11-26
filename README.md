# Barangay Barretto ReliefOps

ReliefOps is a web application for managing barangay relief donations, inventory, household assistance claims, cash assistance, distribution reporting, and audit history.

## Features

- Staff dashboard with live inventory and claim updates
- Cash and in-kind donation intake
- Batch-level inventory, expiry monitoring, FEFO stock allocation, and low-stock alerts
- Resident assistance requests with household eligibility and cooldown checks
- Staff claim approval, denial, and physical-release recording
- Household cash-disbursement ledger and balance reporting
- Purok-level distribution reports, CSV exports, and audit history
- Resident portal with claim status and notifications

See the [User Manual](USER_MANUAL.md) for role-based operating instructions.

## Requirements

- Node.js 18 or later and npm
- PostgreSQL

## Local setup

1. Install the root dependencies:

   ```powershell
   npm install
   ```

2. Install the frontend dependencies:

   ```powershell
   npm --prefix client install
   ```

3. Create a local environment file and edit it with your PostgreSQL settings:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` for your local database. Set `JWT_SECRET` to a strong, private value. Keep `.env` out of version control.

4. Create the local database schema and seed data:

   ```powershell
   npm run db:setup
   ```

   Database setup prints the local demo account details. Use demo accounts only for local development; replace or disable seeded accounts before exposing an instance to the internet.

5. Start the API and frontend:

   ```powershell
   npm run dev:all
   ```

6. Open [http://localhost:5173](http://localhost:5173). The API listens on port `3001` by default.

For a separately hosted frontend and API, configure `FRONTEND_URL` on the server and set the frontend build-time variable `VITE_SOCKET_URL` to the public Socket.IO/API origin. Leave `VITE_SOCKET_URL` blank when the frontend and backend are served through the same origin and `/socket.io` is proxied to the backend.

## Verification

Run the integration tests:

```powershell
npm test
```

The tests require a PostgreSQL database configured in `.env` and create temporary records. Run them against a development/test database, never a production database.

Build the frontend:

```powershell
npm --prefix client run build
```

## Security and data handling

- Never commit `.env`, database credentials, JWT secrets, access tokens, or real resident data.
- `.env.example` contains development placeholders; do not use its sample secrets in production.
- Use HTTPS, strong secrets, secure database credentials, and production-specific environment values when deploying.
- Back up the database according to your organization's retention and privacy requirements.
