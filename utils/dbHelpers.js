const { pool } = require('../db/database');

// User-related database operations
class UserService {
    // Tạo user mới hoặc lấy user hiện có
    static async getOrCreateUser(userId, username = null) {
        const client = await pool.connect();
        try {
            // Kiểm tra user đã tồn tại chưa
            const existingUser = await client.query(
                'SELECT * FROM users WHERE user_id = $1',
                [userId]
            );

            if (existingUser.rows.length > 0) {
                return existingUser.rows[0];
            }

            // Tạo user mới
            const newUser = await client.query(
                `INSERT INTO users (user_id, balance, total_earned)
                 VALUES ($1, 0, 0)
                 RETURNING *`,
                [userId]
            );

            console.log(`🆕 Created new user: ${userId}`);
            return newUser.rows[0];
        } catch (error) {
            console.error('Error in getOrCreateUser:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Lấy thông tin balance của user
    static async getUserBalance(userId) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'SELECT balance, total_earned FROM users WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return { balance: 0, total_earned: 0, exists: false };
            }

            return { ...result.rows[0], exists: true };
        } catch (error) {
            console.error('Error in getUserBalance:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    // Transfer coins từ user này sang user khác
    static async transferCoins(fromUserId, toUserId, amount, reason = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Kiểm tra người gửi có đủ balance không
            const fromUser = await client.query(
                'SELECT balance FROM users WHERE user_id = $1',
                [fromUserId]
            );

            if (fromUser.rows.length === 0 || fromUser.rows[0].balance < amount) {
                throw new Error('Insufficient balance');
            }

            // Đảm bảo người nhận tồn tại
            await this.getOrCreateUser(toUserId);

            // Trừ tiền người gửi
            await client.query(
                `UPDATE users
                 SET balance = balance - $2, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [fromUserId, amount]
            );

            // Cộng tiền người nhận
            await client.query(
                `UPDATE users
                 SET balance = balance + $2, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [toUserId, amount]
            );

            // Ghi transaction log
            const description = reason ? `Gift: ${reason}` : 'Coin transfer';
            await client.query(
                `INSERT INTO transactions (from_user_id, to_user_id, amount, type, description)
                 VALUES ($1, $2, $3, 'gift', $4)`,
                [fromUserId, toUserId, amount, description]
            );

            await client.query('COMMIT');
            console.log(`💸 ${fromUserId} gifted ${amount} SCP to ${toUserId}`);

            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in transferCoins:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Lấy leaderboard
    static async getLeaderboard(orderBy = 'balance', limit = 10) {
        const client = await pool.connect();
        try {
            const validColumns = ['balance', 'total_earned'];
            if (!validColumns.includes(orderBy)) {
                orderBy = 'balance';
            }

            const result = await client.query(
                `SELECT user_id, balance, total_earned
                 FROM users
                 WHERE balance > 0 OR total_earned > 0
                 ORDER BY ${orderBy} DESC
                 LIMIT $1`,
                [limit]
            );

            return result.rows;
        } catch (error) {
            console.error('Error in getLeaderboard:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Lấy transaction history của user
    static async getUserTransactions(userId, limit = 10) {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM transactions
                 WHERE from_user_id = $1 OR to_user_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [userId, limit]
            );

            return result.rows;
        } catch (error) {
            console.error('Error in getUserTransactions:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Cập nhật balance của user (voice earning)
    static async addVoiceEarnings(userId, amount) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Đảm bảo user tồn tại
            await this.getOrCreateUser(userId);

            // Cập nhật balance và total_earned
            const result = await client.query(
                `UPDATE users
               SET balance = balance + $2,
                   total_earned = total_earned + $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE user_id = $1
               RETURNING balance, total_earned`,
                [userId, amount]
            );

            // Ghi transaction log
            await client.query(
                `INSERT INTO transactions (to_user_id, amount, type, description)
               VALUES ($1, $2, 'voice_earn', 'Earned from voice channel activity')`,
                [userId, amount]
            );

            await client.query('COMMIT');
            return result.rows[0]
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = UserService;