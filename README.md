# NEXUS Bank

A full-stack online banking system: customer accounts, money transfers, fixed
deposits, saved beneficiaries, and an employee/manager portal for deposits
and leave management.

## Stack

- **Backend:** Node.js, Express, MySQL (`mysql2`), `express-session` for auth, `bcryptjs` for password hashing, Nodemailer for OTP/account emails
- **Frontend:** Plain HTML/CSS/JS (no framework) — a shared design system in `public/css/nexus-theme.css` and a shared sidebar/session helper in `public/js/nexus-app.js`
- **Database:** MySQL, schema in `SQL files/`

## Features

- Customer onboarding with email OTP verification, auto-generated account number
- Session-based login (customer + employee), passwords hashed with bcrypt
- Money transfer between accounts (row-locked, transactional)
- Saved beneficiaries (payees) for faster repeat transfers
- Fixed deposits with tenure-based interest rates and early-closure penalty
- Transaction statements
- Employee portal: deposits, leave requests, manager approvals

## Setup

```bash
npm install
cp .env.example .env   # then fill in your own DB + email credentials
```

Create an empty database named `company` locally, then run the app. On a fresh
deployment, the application initializes its required tables automatically from
`SQL files/schema.sql`.

```bash
mysql -u root -p -e "CREATE DATABASE company;"
```

Run it:

```bash
npm start
# → http://localhost:3000/login.html
```

## Security notes

- `.env` is gitignored — never commit real credentials. If you're working from
  a fork where a `.env` was committed in the past, **rotate those credentials**;
  removing the file in a new commit does not erase it from git history.
- Passwords are stored as bcrypt hashes. Any legacy plaintext row is
  transparently upgraded to a hash the next time that user logs in.
- Sensitive endpoints (profile, statements, transfers, deposits, beneficiaries,
  fixed deposits, leave approvals) require a valid session — the server never
  trusts a client-supplied account number for "whose data is this."

## Project structure

```
public/
  css/nexus-theme.css   — shared design system (colors, cards, forms, tables)
  js/nexus-app.js        — sidebar nav + session-aware fetch wrapper
  useraccount.html        — customer dashboard
  tranfer.html            — money transfer
  beneficiaries.html      — saved payees
  fixed-deposits.html     — fixed deposits
  statement.html          — transaction history
  Accountdetails.html     — profile
  employeeloginpage.html, manager.html, timeoff.html, emplyeepage.html — staff portal
server2.js                — Express app / all API routes
  pool.js                   — MySQL connection-pool helper
  SQL files/schema.sql       — clean, idempotent MySQL schema
```
