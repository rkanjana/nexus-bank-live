# NEXUS Bank — Interview Prep

## 1. The 30-second pitch

> "NEXUS Bank is a full-stack online banking system I built with Node.js,
> Express, and MySQL. It supports customer onboarding with email OTP
> verification, session-authenticated login, money transfers with row-level
> locking to prevent race conditions, fixed deposits with tenure-based
> interest, saved beneficiaries, and a separate employee/manager portal for
> deposits and leave approvals. I recently did a security and UX pass on
> it — moved passwords from plaintext to bcrypt hashes, replaced
> client-trusted account numbers with real server-side sessions to close an
> IDOR vulnerability, and rebuilt the frontend around one shared design
> system instead of copy-pasted inline styles."

Say this, then let them steer with follow-ups — don't dump the whole doc on them unprompted.

---

## 2. Architecture

```
Browser (HTML/CSS/JS, no framework)
        │  fetch() with credentials:'include'
        ▼
Express server (server2.js)
        │  express-session (cookie) ── auth
        │  bcryptjs                 ── password hashing
        │  nodemailer                ── OTP + account emails
        ▼
MySQL ("company" database)
  customer_registration1 ──< customer_account3 ──< transactions1
                                      │
                                      ├──< beneficiaries
                                      └──< fixed_deposits
  employee2 ──< leave_requests
```

- **Frontend:** static HTML/CSS/JS served by Express (`express.static('public')`). No framework — deliberate, see §4.
- **Backend:** a single Express app (`server2.js`) with route handlers, no separate service/controller layers yet (see limitations).
- **Auth:** `express-session` issues an httpOnly cookie; the server keeps `account_number` / `emp_id` server-side in the session store, never trusting the client for "who is this."
- **DB access:** raw parameterized SQL via `mysql2`, not an ORM.

---

## 3. Why these technology choices (be ready to defend, not just list)

| Choice | Why | Trade-off you should be able to name |
|---|---|---|
| Express over Nest/Fastify | Small surface area, minimal boilerplate, easy to reason about every line | No built-in structure — discipline (or a framework) needed as it grows |
| MySQL over a NoSQL store | Banking data is inherently relational (accounts→transactions→customers) and needs ACID transactions | Less flexible schema; migrations are manual here |
| Raw SQL over an ORM (Sequelize/Prisma) | Full control over exactly which queries run and when — important for the row-locking in `/transfer` | More boilerplate, more manual injection-safety discipline (mitigated with parameterized queries throughout) |
| Vanilla JS over React | Small enough app that a framework's overhead (bundler, build step) wasn't worth it; every page is independently servable | No component reuse — solved instead with a shared `nexus-theme.css` + `nexus-app.js` "poor man's design system" |
| Sessions over JWT | Server can invalidate a session instantly (logout, ban) without a token-blocklist; simpler for a same-origin app | Doesn't scale horizontally without a shared session store (e.g. Redis) — fine at this project's scale, a real limitation at larger scale |
| bcrypt over SHA-256 | bcrypt is deliberately slow and salts automatically — resistant to rainbow tables and brute force | Slightly slower auth checks (acceptable trade for security) |

---

## 4. Money transfer — the piece most likely to get grilled

```js
await db.promise().beginTransaction();
const [sender] = await db.promise().query(
  `SELECT balance FROM customer_account3 WHERE account_number = ? FOR UPDATE`, [sender_account]
);
// ... balance check ...
const [receiver] = await db.promise().query(
  `SELECT account_number FROM customer_account3 WHERE account_number = ? FOR UPDATE`, [receiver_account]
);
// ... update both balances, insert transaction row ...
await db.promise().commit();
```

**Why `FOR UPDATE`:** without it, two simultaneous transfers from the same
account could both read the same starting balance, both pass the
"sufficient funds" check, and both deduct — overdrawing the account. `FOR
UPDATE` takes a row lock so the second transaction blocks until the first
commits or rolls back.

**Why a DB transaction at all:** if the process crashes between debiting
the sender and crediting the receiver, money would vanish. Wrapping both
writes (+ the transaction-log insert) in one commit/rollback makes the
whole operation atomic — either all three writes happen or none do.

**A question they might ask:** *"What if two transfers lock the same two
accounts in opposite order?"* → That's a deadlock risk (classic transfer-A→B
and transfer-B→A at the same time). MySQL's deadlock detector kills one
transaction and it retries. **This is a genuine known gap** — the code
doesn't currently retry on deadlock, it just surfaces the error. Good
answer: *"I'd add a locking order (always lock the lower account number
first) or a retry-on-deadlock wrapper if this went to production."* Saying
this unprompted is a strong signal — it shows you understand the failure
mode even though you haven't shipped the fix.

---

## 5. Security — what changed and why it matters

Frame this as a **before/after story**, interviewers like seeing the "before" as much as the fix — it shows you can spot real vulnerabilities, not just recite security terms.

**Before → After:**
- Passwords stored in plaintext in MySQL → bcrypt hashes (cost factor 10), with a transparent upgrade path: any legacy plaintext row gets re-hashed automatically the next time that user logs in successfully.
- Any endpoint accepted an `account_number` as a query parameter and trusted it → this is an **IDOR (Insecure Direct Object Reference)**: account A could read account B's profile/statement just by changing a URL parameter. Fixed by moving to `express-session`: the server reads `req.session.account_number`, set only at login, and ignores anything the client claims.
- `.env` (real DB + email credentials) was committed to the public GitHub repo → added to `.gitignore`, replaced with `.env.example`. **Important nuance if asked:** deleting a file in a new commit does not remove it from git history — the fix also required rotating the actual credentials, not just untracking the file.
- CORS was wide-open (`cors()` with no options, meaning any origin) → scoped to a specific origin with `credentials: true`, required once sessions (cookies) are in play — browsers won't send credentialed cookies to a wildcard-CORS origin anyway, so this was also a functional fix, not just a hardening one.

**If asked "what's still not production-ready":** be honest, this is a strong answer:
- No rate limiting on login/OTP endpoints (brute-force / OTP-spam risk)
- No CSRF protection on state-changing POST routes (cookies + a same-site form could be tricked into firing a request) — would add a CSRF token or SameSite=strict cookies
- No input validation library (e.g. Zod/Joi) — validation is manual `if (!x)` checks
- Session store is in-memory (default) — would move to Redis/MySQL-backed store for anything multi-instance
- No HTTPS/TLS configured at the app layer (would sit behind a reverse proxy like Nginx in production)

---

## 6. Database design

**Tables:**
- `customer_registration1` — KYC/personal data (name, DOB, nationality, address, document info)
- `customer_account3` — the actual bank account (balance, account type, IFSC, password hash), FK to `customer_registration1`
- `transactions1` — every deposit/withdraw/transfer/FD event, FK to `customer_account3`
- `beneficiaries` — saved payees per account, FK to `customer_account3`, unique constraint on (owner, beneficiary) so you can't save the same payee twice
- `employee2` — staff records with self-referencing FK (`manager_id → employee2.emp_id`) for the reporting hierarchy
- `leave_requests` — FK to both the requesting employee and their manager

**Honest talking point about the naming (`customer_account3`, `employee2`, `transactions1`):** these numeric suffixes are a visible artifact of iterative development in a student group project — earlier versions were superseded but not cleanly renamed. If asked, the right answer is: *"I know it's not clean, it happened because we iterated on the schema live rather than through migrations, and I've since documented it and would rename it via a proper migration if I revisited this."* Don't pretend it's intentional — but do have the fix ready (a migration script that renames tables and updates FKs together, done once with the app down).

**Why 3NF-ish normalization:** account data is separate from personal/KYC data so an account can theoretically point to different account "products" (e.g. a customer with both a Savings and a Current account) without duplicating name/address everywhere.

---

## 7. Fixed Deposits — good feature to walk through live

Simple interest, tiered by tenure:
```
maturity = principal + principal * rate * (months/12) / 100
```
Rate tiers: <6mo → 4.5%, <12mo → 5.5%, <24mo → 6.5%, ≥24mo → 7.25%.

**If asked "why simple interest, not compound?"** — honest answer: simplicity for a defensible, easy-to-explain implementation; real banks vary (many FDs do use compound/quarterly-compounded interest). Good follow-up: *"I'd generalize this to a configurable compounding frequency if this were a real product — it's a formula change, not an architecture change."*

**Early closure** applies a 1% rate penalty and pro-rates interest by days
held (not a flat forfeiture) — this is a genuine design choice worth
mentioning: it rewards but doesn't fully punish early withdrawal, mirroring
how most real banks handle it.

---

## 8. What you'd do with more time (have 3–4 ready, don't over-list)

1. Move to an ORM or query builder (Knex/Prisma) for migration tracking instead of a hand-run `.sql` scratch file.
2. Add automated tests — currently zero test coverage; would start with the transfer/FD money-math logic since that's the highest-stakes code.
3. Rate limiting + CSRF protection before this could be internet-facing.
4. A real migration history instead of one big `everything.sql` — the current file literally has `CREATE TABLE`, `ALTER TABLE`, and ad-hoc `UPDATE`/`SELECT` scratch statements mixed together, an artifact of building it live during a group project.
5. Extract routes into controllers/services instead of one large `server2.js` — fine at this size, wouldn't scale past a few more modules.

---

## 9. Likely interview questions, with the short answer to give

**"Walk me through what happens when a user logs in."**
Client POSTs account_number+password → server looks up the account → bcrypt-compares (or, for legacy rows, does a one-time plaintext compare then upgrades to a hash) → on match, `req.session.account_number` is set → session cookie sent back → every subsequent request includes that cookie, and protected routes read the account number from the session instead of trusting the client.

**"How do you prevent SQL injection?"**
Every query uses parameterized placeholders (`?`) via `mysql2`, never string concatenation — the driver escapes values, so user input can never break out of the intended query structure.

**"How would you scale this?"**
Move session storage to Redis (currently in-memory, which breaks with multiple server instances); add a read replica for MySQL since reads (profile, statements) vastly outnumber writes (transfers); put a reverse proxy/load balancer in front of stateless app instances.

**"What was the hardest bug / trickiest part?"**
Good honest answer: the transfer race condition (§4) — realizing that "check balance, then update balance" as two separate queries is unsafe under concurrency unless you lock the row, and that both accounts need locking, not just the sender's.

**"Why didn't you use TypeScript / a framework / an ORM?"**
Answer honestly with a reason, not an excuse: it's a learning project scoped to get a working, understandable full-stack system end-to-end; the trade-offs are named in §3 and you'd choose differently for a larger team/codebase.

**"Tell me about a mistake you found and fixed."**
The `.env` leak and the IDOR — both are strong stories because they show you can *audit your own code critically*, not just write features. Frame it as: found it, understood the blast radius, fixed the root cause (not just the symptom), and know what's still not fully hardened.

---

## 10. Resume bullet suggestions

- Built NEXUS Bank, a full-stack banking system (Node.js/Express/MySQL) supporting account onboarding, authenticated transfers, fixed deposits, and an employee approval workflow.
- Identified and remediated an IDOR vulnerability and plaintext password storage; migrated auth to server-side sessions with bcrypt-hashed credentials.
- Implemented transactional money transfers with row-level locking (`SELECT ... FOR UPDATE`) to prevent race conditions on concurrent balance updates.
- Designed a reusable frontend design system (shared CSS/JS) replacing per-page inline styling across 20+ pages, improving consistency and maintainability.
