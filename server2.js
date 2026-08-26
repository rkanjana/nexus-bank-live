require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production.");
}

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(express.json());

// credentials: true + explicit origin (not "*") because we're
// now relying on a session cookie for auth, and cookies don't
// get sent cross-origin unless the server names the origin.
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    credentials: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 4 // 4 hours
    }
}));

// Serve static files from the "public" directory
app.use(express.static("public"));

// Connect to MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function initializeDatabase() {
    const schemaPath = path.join(__dirname, "SQL files", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8").replace(/^\s*--.*$/gm, "");
    const statements = schema
        .split(";")
        .map(statement => statement.trim())
        .filter(Boolean);

    for (const statement of statements) {
        await db.promise().query(statement);
    }
}

// ---------------------------------------------------------------
// Auth middleware
// Sensitive routes trust req.session, never a client-supplied
// account_number/emp_id. Previously any request could read or
// act on ANY account just by passing a different account_number
// in the query string (IDOR) — this closes that gap.
// ---------------------------------------------------------------
function requireCustomerAuth(req, res, next) {
    if (!req.session.account_number) {
        return res.status(401).json({ error: "Not authenticated. Please log in again." });
    }
    next();
}

function requireEmployeeAuth(req, res, next) {
    if (!req.session.emp_id) {
        return res.status(401).json({ error: "Not authenticated. Please log in again." });
    }
    next();
}

//In-memory storage for OTPs (Temporary)
const otpStore = {};

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Generate and send OTP
app.post('/send-otp', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP
    otpStore[email] = otp; // Store OTP temporarily

    setTimeout(() => {
        delete otpStore[email]; // OTP expires in 5 minutes
    }, 5 * 60 * 1000);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP for Login",
        text: `Your OTP is: ${otp}. It is valid for 5 minutes.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("Error sending OTP:", error);
            return res.status(500).json({ error: "Failed to send OTP" });
        }
        res.json({ message: "OTP sent successfully!" });
    });
});

// Verify OTP, create the account, and store a HASHED password
app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    if (!(otpStore[email] && otpStore[email] == otp)) {
        return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    delete otpStore[email]; // Remove OTP after verification

    // Fetch customer ID using email
    db.query(`SELECT customer_id FROM customer_registration1 WHERE email = ?`, [email], async (err, results) => {
        if (err) {
            console.error("Error fetching customer ID:", err);
            return res.status(500).json({ error: "Failed to fetch customer details" });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        const customer_id = results[0].customer_id;
        const account_number = Math.floor(1000000000 + Math.random() * 900000000);
        const ifsc_code = "NEXS0BANK1";
        const account_type = "Savings";
        const plainPassword = Math.random().toString(36).slice(-8); // shown to user once, via email

        try {
            const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);

            const insertAccountSQL = `
                INSERT INTO customer_account3 (account_number, customer_id, balance, account_type, ifsc_code, password)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(insertAccountSQL, [account_number, customer_id, 0.00, account_type, ifsc_code, passwordHash], async (err) => {
                if (err) {
                    console.error("Error creating account:", err);
                    return res.status(500).json({ error: "Failed to create account" });
                }

                try {
                    await sendAccountEmail(email, account_number, plainPassword);
                } catch (error) {
                    console.error("Error sending email:", error);
                }

                return res.json({
                    message: "OTP verified! Account created successfully.",
                    account_number,
                    // The plaintext password is returned ONCE here (and emailed) so the
                    // user can log in for the first time — it is never stored anywhere.
                    password: plainPassword
                });
            });
        } catch (hashErr) {
            console.error("Error hashing password:", hashErr);
            res.status(500).json({ error: "Failed to create account" });
        }
    });
});

// Function to Send Email
async function sendAccountEmail(email, account_number, password) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your New NEXUS Bank Account Details",
        text: `Welcome to NEXUS Bank!\n\nYour Account Number: ${account_number}\nYour Temporary Password: ${password}\n\nPlease log in and change your password. Keep these details secure.`
    };

    return transporter.sendMail(mailOptions);
}

//submit form
app.post('/submit', (req, res) => {
    const { accountHolderName, dob, nationality, Status, city, address, mailingAddress, contactNumber, branch, min_bal, currency, document, documentnumber } = req.body;

    if (!accountHolderName || !dob || !nationality || !Status || !city || !address || !mailingAddress || !contactNumber || !branch || min_bal === undefined || !currency || !document || !documentnumber) {
        return res.status(400).json({ error: "All required fields must be filled" });
    }

    const defaultState = "Andhra Pradesh"; // Set the default state

    const insertCustomerSQL = `INSERT INTO customer_registration1
    (name, dob, nationality, current_status, city, state, address, email, phone_no, branch, min_bal, document_type, verification_num, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(insertCustomerSQL,
        [accountHolderName, dob, nationality, Status, city, defaultState, address, mailingAddress, contactNumber, branch, min_bal, document, documentnumber, currency],
        (err, result) => {
            if (err) {
                console.error("Error inserting customer registration:", err.sqlMessage || err);
                return res.status(500).json({ error: "Failed to register customer", details: err.sqlMessage });
            }
            res.json({ message: "Customer registered successfully!", customer_id: result.insertId });
        }
    );
});

// Customer login — verifies against the bcrypt hash and starts a session
app.post('/login', (req, res) => {
    const { account_number, password } = req.body;

    if (!account_number || !password) {
        return res.status(400).json({ message: 'Account number and password are required' });
    }

    db.query('SELECT * FROM customer_account3 WHERE account_number = ?', [account_number], async (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        if (result.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const account = result[0];
        const stored = account.password || "";
        // Legacy rows created before hashing was added are plaintext.
        // bcrypt hashes always start with "$2"; anything else we
        // compare directly once, then re-hash and upgrade it.
        const isBcryptHash = stored.startsWith("$2");
        const matches = isBcryptHash
            ? await bcrypt.compare(password, stored)
            : password === stored;

        if (!matches) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!isBcryptHash) {
            const upgraded = await bcrypt.hash(password, SALT_ROUNDS);
            db.query('UPDATE customer_account3 SET password = ? WHERE account_number = ?', [upgraded, account_number]);
        }

        req.session.account_number = String(account_number);
        res.status(200).json({ message: 'Login successful' });
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out' });
    });
});

// Employee Deposit Money into Customer Account
app.post("/deposit", requireEmployeeAuth, (req, res) => {
    const { account_number, amount } = req.body;
    const emp_id = req.session.emp_id;

    if (!account_number || !amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid deposit details" });
    }

    db.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({ error: "Transaction start failed" });
        }

        const updateBalanceQuery = `UPDATE customer_account3 SET balance = balance + ? WHERE account_number = ?`;
        db.query(updateBalanceQuery, [amount, account_number], (err, updateResult) => {
            if (err || updateResult.affectedRows === 0) {
                return db.rollback(() => {
                    res.status(500).json({ error: "Account not found or balance update failed" });
                });
            }

            const insertTransactionQuery = `INSERT INTO transactions1 (account_number, transaction_type, amount) VALUES (?, 'Deposit', ?)`;
            db.query(insertTransactionQuery, [account_number, amount], (err) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: "Transaction log failed" });
                    });
                }

                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: "Transaction commit failed" });
                        });
                    }

                    res.json({ message: `Successfully deposited ₹${amount} into account ${account_number}. (by employee ${emp_id})` });
                });
            });
        });
    });
});

// Employee Registration (POST) — password hashed before storage
app.post('/register', async (req, res) => {
    const { emp_id, password, name, designation, salary, location, address, email, phonenumber, manager_id } = req.body;
    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const sql = `INSERT INTO employee2 (emp_id, password, name, designation, salary, location, address, email, phonenumber, manager_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(sql, [emp_id, passwordHash, name, designation, salary, location, address, email, phonenumber, manager_id], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: "Employee registered successfully!" });
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to hash password" });
    }
});

// Employee Login (POST) — verifies bcrypt hash, starts a session
app.post('/employee-login', (req, res) => {
    const { emp_id, password } = req.body;
    const sql = `SELECT * FROM employee2 WHERE emp_id = ?`;
    db.query(sql, [emp_id], async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) {
            return res.status(401).json({ error: "Invalid Employee ID or Password" });
        }

        const employee = result[0];
        const stored = employee.password || "";
        const isBcryptHash = stored.startsWith("$2");
        const matches = isBcryptHash
            ? await bcrypt.compare(password, stored)
            : password === stored;

        if (!matches) {
            return res.status(401).json({ error: "Invalid Employee ID or Password" });
        }

        if (!isBcryptHash) {
            const upgraded = await bcrypt.hash(password, SALT_ROUNDS);
            db.query('UPDATE employee2 SET password = ? WHERE emp_id = ?', [upgraded, emp_id]);
        }

        req.session.emp_id = String(employee.emp_id);
        req.session.designation = employee.designation;
        const { password: _pw, ...safeEmployee } = employee;
        res.json({ message: "Login successful!", employee: safeEmployee });
    });
});

// Fetch logged-in user's profile — account number comes from the
// session, never from the query string, so account A can't read account B.
app.get('/user-profile', requireCustomerAuth, (req, res) => {
    const account_number = req.session.account_number;

    const sql = `
        SELECT
            c.name,
            c.email,
            ca.account_number,
            ca.balance,
            ca.account_type,
            ca.ifsc_code,
            t.transaction_type,
            t.amount AS transaction_amount,
            t.transaction_date
        FROM
            customer_registration1 c
        JOIN
            customer_account3 ca ON c.customer_id = ca.customer_id
        LEFT JOIN
            transactions1 t ON ca.account_number = t.account_number
        WHERE
            ca.account_number = ?
        ORDER BY
            t.transaction_date DESC;
    `;

    db.query(sql, [account_number], (err, results) => {
        if (err) {
            console.error("Error fetching user profile:", err.message);
            return res.status(500).json({ error: "Failed to fetch profile details" });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const data = results[0];
        const transactions = results[0].transaction_type ? results.map(row => ({
            transaction_type: row.transaction_type,
            transaction_amount: row.transaction_amount,
            transaction_date: row.transaction_date
        })) : [];

        res.json({
            message: "User profile fetched successfully",
            profile: {
                name: data.name,
                email: data.email,
                account_number: data.account_number,
                balance: data.balance,
                account_type: data.account_type,
                ifsc_code: data.ifsc_code,
                transactions: transactions
            }
        });
    });
});

// Get account statements — session-scoped, same IDOR fix as above
app.get('/statements', requireCustomerAuth, (req, res) => {
    const accountNumber = req.session.account_number;
    const sql = `SELECT
                    transaction_date AS date,
                    account_number AS sender,
                    releated_account AS receiver,
                    transaction_type AS type,
                    amount
                 FROM transactions1
                 WHERE account_number = ?
                 ORDER BY transaction_date DESC`;
    db.query(sql, [accountNumber], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ transactions: results });
    });
});

// Money Transfer Endpoint — sender is always the session account,
// never trusted from the request body.
app.post('/transfer', requireCustomerAuth, async (req, res) => {
    try {
        const sender_account = req.session.account_number;
        const { receiver_account, amount } = req.body;

        if (!receiver_account || !amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: "Receiver account and a positive amount are required"
            });
        }

        if (String(receiver_account) === String(sender_account)) {
            return res.status(400).json({ success: false, error: "Cannot transfer to your own account" });
        }

        await db.promise().beginTransaction();

        const [sender] = await db.promise().query(
            `SELECT balance FROM customer_account3 WHERE account_number = ? FOR UPDATE`,
            [sender_account]
        );

        if (sender.length === 0) {
            throw new Error("Sender account not found");
        }

        if (sender[0].balance < amount) {
            throw new Error("Insufficient funds");
        }

        const [receiver] = await db.promise().query(
            `SELECT account_number FROM customer_account3 WHERE account_number = ? FOR UPDATE`,
            [receiver_account]
        );

        if (receiver.length === 0) {
            throw new Error("Receiver account not found");
        }

        await db.promise().query(
            `UPDATE customer_account3 SET balance = balance - ? WHERE account_number = ?`,
            [amount, sender_account]
        );

        await db.promise().query(
            `UPDATE customer_account3 SET balance = balance + ? WHERE account_number = ?`,
            [amount, receiver_account]
        );

        await db.promise().query(
            `INSERT INTO transactions1
            (account_number, transaction_type, amount, releated_account)
            VALUES (?, 'Transfer', ?, ?)`,
            [sender_account, amount, receiver_account]
        );

        await db.promise().commit();

        res.json({
            success: true,
            message: `Successfully transferred ₹${amount} to account ${receiver_account}`
        });

    } catch (error) {
        await db.promise().rollback();
        console.error("Transfer error:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Transfer failed"
        });
    }
});

app.get('/user-profile-full', requireCustomerAuth, (req, res) => {
    const account_number = req.session.account_number;

    const sql = `
        SELECT
            cr.name, cr.nationality, cr.address, cr.city, cr.state,
            cr.phone_no, cr.email, cr.dob, cr.branch, cr.currency,
            ca.account_number, ca.ifsc_code, ca.account_type, ca.balance
        FROM customer_account3 ca
        JOIN customer_registration1 cr ON ca.customer_id = cr.customer_id
        WHERE ca.account_number = ?
        LIMIT 1`;

    db.query(sql, [account_number], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database query failed", details: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Account not found" });
        }
        res.json({ success: true, profile: results[0] });
    });
});

// ---------------------------------------------------------------
// Beneficiaries (saved payees)
// ---------------------------------------------------------------
app.get('/beneficiaries', requireCustomerAuth, (req, res) => {
    const owner = req.session.account_number;
    db.query(
        `SELECT beneficiary_id, beneficiary_account_number, nickname, created_at
         FROM beneficiaries WHERE owner_account_number = ? ORDER BY created_at DESC`,
        [owner],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ beneficiaries: results });
        }
    );
});

app.post('/beneficiaries', requireCustomerAuth, (req, res) => {
    const owner = req.session.account_number;
    const { beneficiary_account_number, nickname } = req.body;

    if (!beneficiary_account_number || !nickname) {
        return res.status(400).json({ error: "Account number and nickname are required" });
    }
    if (String(beneficiary_account_number) === String(owner)) {
        return res.status(400).json({ error: "You can't add your own account as a beneficiary" });
    }

    db.query(
        `SELECT account_number FROM customer_account3 WHERE account_number = ?`,
        [beneficiary_account_number],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            if (results.length === 0) return res.status(404).json({ error: "That account number doesn't exist" });

            db.query(
                `INSERT INTO beneficiaries (owner_account_number, beneficiary_account_number, nickname) VALUES (?, ?, ?)`,
                [owner, beneficiary_account_number, nickname],
                (err) => {
                    if (err) {
                        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: "Already saved as a beneficiary" });
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json({ message: "Beneficiary added" });
                }
            );
        }
    );
});

app.delete('/beneficiaries/:id', requireCustomerAuth, (req, res) => {
    const owner = req.session.account_number;
    db.query(
        `DELETE FROM beneficiaries WHERE beneficiary_id = ? AND owner_account_number = ?`,
        [req.params.id, owner],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Not found" });
            res.json({ message: "Beneficiary removed" });
        }
    );
});

// ---------------------------------------------------------------
// Fixed Deposits
// Simple interest, tiered by tenure — long enough to be a real
// feature, simple enough to explain and defend in an interview.
// ---------------------------------------------------------------
function fdRateForTenure(months) {
    if (months < 6) return 4.5;
    if (months < 12) return 5.5;
    if (months < 24) return 6.5;
    return 7.25;
}

app.get('/fixed-deposits', requireCustomerAuth, (req, res) => {
    const account_number = req.session.account_number;
    db.query(
        `SELECT * FROM fixed_deposits WHERE account_number = ? ORDER BY opened_at DESC`,
        [account_number],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ fixed_deposits: results });
        }
    );
});

app.post('/fixed-deposits', requireCustomerAuth, async (req, res) => {
    const account_number = req.session.account_number;
    const { amount, tenure_months } = req.body;

    if (!amount || amount <= 0 || !tenure_months || tenure_months <= 0) {
        return res.status(400).json({ error: "Amount and tenure (months) are required" });
    }

    try {
        await db.promise().beginTransaction();

        const [rows] = await db.promise().query(
            `SELECT balance FROM customer_account3 WHERE account_number = ? FOR UPDATE`,
            [account_number]
        );
        if (rows.length === 0) throw new Error("Account not found");
        if (rows[0].balance < amount) throw new Error("Insufficient funds to open this FD");

        const rate = fdRateForTenure(tenure_months);
        // simple interest: I = P * r * t(years) / 100
        const maturityAmount = Number(amount) + (Number(amount) * rate * (tenure_months / 12) / 100);

        await db.promise().query(
            `UPDATE customer_account3 SET balance = balance - ? WHERE account_number = ?`,
            [amount, account_number]
        );

        const [fdResult] = await db.promise().query(
            `INSERT INTO fixed_deposits (account_number, principal, interest_rate, tenure_months, maturity_amount, matures_at)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? MONTH))`,
            [account_number, amount, rate, tenure_months, maturityAmount.toFixed(2), tenure_months]
        );

        await db.promise().query(
            `INSERT INTO transactions1 (account_number, transaction_type, amount) VALUES (?, 'FD Open', ?)`,
            [account_number, amount]
        );

        await db.promise().commit();

        res.status(201).json({
            message: "Fixed deposit opened successfully",
            fd_id: fdResult.insertId,
            interest_rate: rate,
            maturity_amount: maturityAmount.toFixed(2)
        });
    } catch (error) {
        await db.promise().rollback();
        res.status(400).json({ error: error.message || "Failed to open fixed deposit" });
    }
});

app.post('/fixed-deposits/:id/close', requireCustomerAuth, async (req, res) => {
    const account_number = req.session.account_number;
    const fd_id = req.params.id;
    const EARLY_CLOSURE_PENALTY_PCT = 1.0; // shaved off the promised rate

    try {
        await db.promise().beginTransaction();

        const [rows] = await db.promise().query(
            `SELECT * FROM fixed_deposits WHERE fd_id = ? AND account_number = ? AND status = 'Active' FOR UPDATE`,
            [fd_id, account_number]
        );
        if (rows.length === 0) throw new Error("Active fixed deposit not found");

        const fd = rows[0];
        const daysHeld = Math.max(1, Math.floor((Date.now() - new Date(fd.opened_at)) / 86400000));
        const yearsHeld = daysHeld / 365;
        const effectiveRate = Math.max(0, Number(fd.interest_rate) - EARLY_CLOSURE_PENALTY_PCT);
        const payout = Number(fd.principal) + (Number(fd.principal) * effectiveRate * yearsHeld / 100);
        const roundedPayout = Math.min(payout, Number(fd.maturity_amount)).toFixed(2);

        await db.promise().query(
            `UPDATE fixed_deposits SET status = 'Closed_Early', closed_at = NOW() WHERE fd_id = ?`,
            [fd_id]
        );

        await db.promise().query(
            `UPDATE customer_account3 SET balance = balance + ? WHERE account_number = ?`,
            [roundedPayout, account_number]
        );

        await db.promise().query(
            `INSERT INTO transactions1 (account_number, transaction_type, amount) VALUES (?, 'FD Closure', ?)`,
            [account_number, roundedPayout]
        );

        await db.promise().commit();

        res.json({ message: "Fixed deposit closed early", payout: roundedPayout });
    } catch (error) {
        await db.promise().rollback();
        res.status(400).json({ error: error.message || "Failed to close fixed deposit" });
    }
});

// Request Leave (POST)
app.post("/request-leave", requireEmployeeAuth, (req, res) => {
    const { start_date, end_date, reason, manager_id } = req.body;
    const emp_id = req.session.emp_id;

    if (!manager_id) {
        return res.status(400).json({ error: "Manager ID is missing" });
    }

    const sql = `INSERT INTO leave_requests (emp_id, start_date, end_date, reason, manager_id, status) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [emp_id, start_date, end_date, reason, manager_id, 'Pending'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "Leave request submitted successfully!" });
    });
});

// Fetch Latest Leave Status for the logged-in employee (GET)
app.get("/get-leave-status", requireEmployeeAuth, (req, res) => {
    const emp_id = req.session.emp_id;
    const sql = `SELECT start_date, end_date, status FROM leave_requests WHERE emp_id = ? ORDER BY request_id DESC LIMIT 1`;

    db.query(sql, [emp_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        if (results.length > 0) {
            const { start_date, end_date, status } = results[0];
            res.json({ message: `Your leave from ${start_date} to ${end_date} is ${status}.` });
        } else {
            res.json({ message: "No leave requests found." });
        }
    });
});

// Manager fetches pending leave requests for their team (GET)
app.get("/manager-requests", requireEmployeeAuth, (req, res) => {
    const manager_id = req.session.emp_id;
    const sql = `SELECT * FROM leave_requests WHERE manager_id = ? AND status = 'Pending'`;

    db.query(sql, [manager_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Manager approves or rejects leave request (PUT)
app.put("/approve-leave/:request_id", requireEmployeeAuth, (req, res) => {
    const { request_id } = req.params;
    const { status } = req.body; // 'Approved' or 'Denied'

    if (!['Approved', 'Denied'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Use 'Approved' or 'Denied'." });
    }

    const checkQuery = `SELECT status FROM leave_requests WHERE request_id = ?`;
    db.query(checkQuery, [request_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) return res.status(404).json({ error: "Leave request not found." });

        if (result[0].status !== 'Pending') {
            return res.status(400).json({ error: `Request is already ${result[0].status}.` });
        }

        const updateQuery = `UPDATE leave_requests SET status = ? WHERE request_id = ?`;
        db.query(updateQuery, [status, request_id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `Leave request ${status.toLowerCase()} successfully!` });
        });
    });
});

db.connect(async err => {
    if (err) {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    }

    try {
        await initializeDatabase();
        console.log("Connected to MySQL database.");
        app.listen(PORT, () => {
            console.log(`NEXUS Bank server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Database initialization failed:", error.message);
        process.exit(1);
    }
});
