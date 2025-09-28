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
                balance_vip INTEGER DEFAULT 0,
                total_earned INTEGER DEFAULT 0,
                total_earned_vip INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create transaction types enum (if not exists) and add new value
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE transaction_type AS ENUM ('voice_earn', 'gift', 'admin', 'coin_vip');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Safely add new enum values if they don't exist (EXTENDS ENUM)
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'daily_checkin'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
                ) THEN
                    ALTER TYPE transaction_type ADD VALUE 'daily_checkin';
                END IF;
            END $$;
        `);

        // Add invite_reward enum value
        await client.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'invite_reward'
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
                ) THEN
                    ALTER TYPE transaction_type ADD VALUE 'invite_reward';
                END IF;
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
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create daily_checkins table
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_checkins (
                user_id VARCHAR(20) PRIMARY KEY,
                last_checkin_date DATE NOT NULL,
                current_streak INTEGER DEFAULT 1,
                total_checkins INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create invites table for tracking invite usage
        await client.query(`
            CREATE TABLE IF NOT EXISTS invites (
                code VARCHAR(10) PRIMARY KEY,
                inviter_id VARCHAR(20) NOT NULL,
                uses INTEGER DEFAULT 0,
                max_uses INTEGER DEFAULT 0,
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create invite_rewards table for tracking who got rewarded for which invite
        await client.query(`
            CREATE TABLE IF NOT EXISTS invite_rewards (
                id SERIAL PRIMARY KEY,
                inviter_id VARCHAR(20) NOT NULL,
                invitee_id VARCHAR(20) NOT NULL,
                invite_code VARCHAR(10) NOT NULL,
                reward_amount INTEGER DEFAULT 3,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC);
            CREATE INDEX IF NOT EXISTS idx_users_total_earned ON users(total_earned DESC);
            CREATE INDEX IF NOT EXISTS idx_transactions_to_user ON transactions(to_user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_from_user ON transactions(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_daily_checkins_date ON daily_checkins(last_checkin_date DESC);
            CREATE INDEX IF NOT EXISTS idx_daily_checkins_streak ON daily_checkins(current_streak DESC);
            CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
            CREATE INDEX IF NOT EXISTS idx_invites_updated ON invites(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_invite_rewards_inviter ON invite_rewards(inviter_id);
            CREATE INDEX IF NOT EXISTS idx_invite_rewards_invitee ON invite_rewards(invitee_id);
            CREATE INDEX IF NOT EXISTS idx_invite_rewards_created ON invite_rewards(created_at DESC);
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