const { Pool } = require('pg');

// Tạo connection pool PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    ssl: { rejectUnauthorized: false }, // For cloud databases
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL database error:', err);
    process.exit(-1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    pool.end(() => {
        console.log('🔌 PostgreSQL connection pool closed');
        process.exit(0);
    });
});

// Initialize database tables
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(20) PRIMARY KEY,
                balance INTEGER DEFAULT 0,
                total_earned INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create transaction types enum
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE transaction_type AS ENUM ('voice_earn', 'gift', 'admin');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Create transactions table (no foreign keys for better performance)
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                from_user_id VARCHAR(20),
                to_user_id VARCHAR(20) NOT NULL,
                amount INTEGER NOT NULL,
                type transaction_type NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC);
            CREATE INDEX IF NOT EXISTS idx_users_total_earned ON users(total_earned DESC);
            CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
        `);

        console.log('✅ Database tables initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    initializeDatabase
};