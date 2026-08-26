-- NEXUS Bank demo schema. Run against the selected application database.
-- This intentionally creates no default staff or customer accounts.

CREATE TABLE IF NOT EXISTS employee2 (
    emp_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    salary DECIMAL(10,2) NOT NULL,
    location VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    phonenumber VARCHAR(15),
    manager_id INT UNSIGNED NULL,
    last_paid_salary DATE NULL,
    CONSTRAINT fk_employee_manager
        FOREIGN KEY (manager_id) REFERENCES employee2(emp_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_registration1 (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone_no VARCHAR(15) UNIQUE NOT NULL,
    dob DATE NOT NULL,
    nationality VARCHAR(100) NOT NULL,
    current_status VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    min_bal DECIMAL(10,2) NOT NULL,
    verification_num VARCHAR(255) UNIQUE NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    state VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_account3 (
    account_number BIGINT PRIMARY KEY,
    customer_id INT UNIQUE,
    balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    account_type ENUM('Savings', 'Current') NOT NULL,
    ifsc_code VARCHAR(15) NOT NULL,
    password VARCHAR(255) NOT NULL,
    CONSTRAINT fk_account_customer
        FOREIGN KEY (customer_id) REFERENCES customer_registration1(customer_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions1 (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    account_number BIGINT NOT NULL,
    transaction_type ENUM('Deposit', 'Withdraw', 'Transfer', 'FD Open', 'FD Closure') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    releated_account BIGINT NULL,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transaction_account
        FOREIGN KEY (account_number) REFERENCES customer_account3(account_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS beneficiaries (
    beneficiary_id INT AUTO_INCREMENT PRIMARY KEY,
    owner_account_number BIGINT NOT NULL,
    beneficiary_account_number BIGINT NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_beneficiary_owner
        FOREIGN KEY (owner_account_number) REFERENCES customer_account3(account_number) ON DELETE CASCADE,
    CONSTRAINT uniq_owner_beneficiary UNIQUE (owner_account_number, beneficiary_account_number)
);

CREATE TABLE IF NOT EXISTS fixed_deposits (
    fd_id INT AUTO_INCREMENT PRIMARY KEY,
    account_number BIGINT NOT NULL,
    principal DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT NOT NULL,
    maturity_amount DECIMAL(15,2) NOT NULL,
    status ENUM('Active', 'Matured', 'Closed_Early') DEFAULT 'Active',
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    matures_at DATE NOT NULL,
    closed_at TIMESTAMP NULL,
    CONSTRAINT fk_fd_account
        FOREIGN KEY (account_number) REFERENCES customer_account3(account_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    emp_id VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    manager_id VARCHAR(255) NOT NULL,
    status ENUM('Pending', 'Approved', 'Denied') DEFAULT 'Pending'
);
