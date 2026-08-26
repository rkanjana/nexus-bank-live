require("dotenv").config(); // Load environment variables from .env file
const mysql = require("mysql2/promise"); // Use MySQL2 with promises

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,       // MySQL server address
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,       // MySQL username
    password: process.env.DB_PASSWORD, // MySQL password
    database: process.env.DB_NAME, // Database name
    waitForConnections: true,
    connectionLimit: 10,  // Max number of connections in the pool
    queueLimit: 0
});

module.exports = pool; // Export the pool for use in other files
