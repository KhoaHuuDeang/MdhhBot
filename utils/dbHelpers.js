const { pool } = require('../db/database');

// User-related database operations
class UserService {
    constructor() {
        this.pool = pool; // Dùng chung pool
    }

    // Tạo user mới hoặc lấy user hiện có
    static async getOrCreateUser(userId, username = null, client = null) {
        try {
            const queryClient = client || pool;
            
            // Kiểm tra user đã tồn tại chưa
            const existingUser = await queryClient.query(
                'SELECT * FROM users WHERE user_id = $1',
                [userId]
            );

            if (existingUser.rows.length > 0) {
                return existingUser.rows[0];
            }

            // Tạo user mới
            const newUser = await queryClient.query(
                `INSERT INTO users (user_id, balance, balance_vip, total_earned, total_earned_vip)
                 VALUES ($1, 0, 0, 0, 0)
                 RETURNING *`,
                [userId]
            );

            console.log(`🆕 Created new user: ${userId}`);
            return newUser.rows[0];
        } catch (error) {
            console.error('Error in getOrCreateUser:', error);
            throw error;
        }
    }

    // Lấy thông tin balance của user
    static async getUserBalance(userId) {
        try {
            // Chỉ đọc dữ liệu → dùng pool.query()
            const result = await pool.query(
                'SELECT balance, balance_vip, total_earned, total_earned_vip FROM users WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return { balance: 0, balance_vip: 0, total_earned: 0, total_earned_vip: 0, exists: false };
            }

            return { ...result.rows[0], exists: true };
        } catch (error) {
            console.error('Error in getUserBalance:', error);
            throw error;
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

            // Đảm bảo người nhận tồn tại - truyền client vào để cùng transaction
            await this.getOrCreateUser(toUserId, null, client);

            // Trừ tiền người gửi
            await client.query(
                `UPDATE users
                 SET balance = balance - $2, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [fromUserId, amount]
            );

            // Cộng tiền người nhận (cả balance và total_earned)
            await client.query(
                `UPDATE users
                 SET balance = balance + $2,
                     total_earned = total_earned + $2,
                     updated_at = CURRENT_TIMESTAMP
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
            console.log(`💸 ${fromUserId} gifted ${amount} MĐ Coin to ${toUserId}`);

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
        try {
            const validColumns = ['balance', 'total_earned'];
            if (!validColumns.includes(orderBy)) orderBy = 'balance';

            const excludeIds = process.env.LEADERBOARD_EXCLUDE_IDS
                ? process.env.LEADERBOARD_EXCLUDE_IDS.split(',').map(id => id.trim())
                : [];

            const placeholders = excludeIds.map((_, i) => `$${i + 1}`).join(',');
            const limitPlaceholder = `$${excludeIds.length + 1}`;

            const sql = `
            SELECT user_id, balance, total_earned
            FROM users
            WHERE (balance > 0 OR total_earned > 0)
              ${excludeIds.length ? `AND user_id NOT IN (${placeholders})` : ''}
            ORDER BY ${orderBy} DESC
            LIMIT ${limitPlaceholder}
        `;

            const params = [...excludeIds, limit];
            const result = await pool.query(sql, params);

            return result.rows;
        } catch (error) {
            console.error('Error in getLeaderboard:', error);
            throw error;
        }
    }

    // Lấy transaction history của user
    static async getUserTransactions(userId, limit = 10) {
        try {
            const result = await pool.query(
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
        }
    }

    // Cập nhật balance của user (voice earning)
    static async addVoiceEarnings(userId, amount) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Đảm bảo user tồn tại - truyền client vào để cùng transaction
            await this.getOrCreateUser(userId, null, client);

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

    // ===== DAILY CHECKIN FUNCTIONS =====

    // Lấy thông tin daily checkin của user
    static async getDailyCheckinStatus(userId) {
        try {
            const result = await pool.query(
                'SELECT * FROM daily_checkins WHERE user_id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return { exists: false, canCheckIn: true };
            }

            const checkin = result.rows[0];

            // So sánh date strings đơn giản
            const today = new Date().toISOString().split('T')[0];
            const lastCheckinDate = checkin.last_checkin_date.toISOString().split('T')[0];

            return {
                ...checkin,
                exists: true,
                canCheckIn: today !== lastCheckinDate, // Có thể checkin nếu không phải hôm nay
                isToday: today === lastCheckinDate     // Đã checkin hôm nay
            };
        } catch (error) {
            console.error('Error in getDailyCheckinStatus:', error);
            throw error;
        }
    }

    // Xử lý daily checkin và tính toán streak
    static async processDailyCheckin(userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Đảm bảo user tồn tại - truyền client vào để cùng transaction
            await this.getOrCreateUser(userId, null, client);

            const checkinStatus = await this.getDailyCheckinStatus(userId);

            if (!checkinStatus.canCheckIn) {
                throw new Error('Bạn đã điểm danh hôm nay rồi ! chờ đến ngày mai nhé');
            }

            // Sử dụng JavaScript Date đơn giản
            const today = new Date().toISOString().split('T')[0];
            let newStreak = 1;

            if (checkinStatus.exists) {
                const lastCheckin = checkinStatus.last_checkin_date.toISOString().split('T')[0];
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (lastCheckin === yesterdayStr) {
                    // Consecutive day
                    newStreak = checkinStatus.current_streak + 1;

                    // Reset if yesterday was Sunday (end of week)
                    if (yesterday.getDay() === 0) { // 0 = Sunday
                        newStreak = 1; // Reset to start new week
                    }
                } else {
                    // Streak broken, reset to 1
                    newStreak = 1;
                }
            }

            // Calculate reward based on streak
            const rewardAmount = newStreak;

            if (checkinStatus.exists) {
                // Update existing record
                await client.query(
                    `UPDATE daily_checkins
                     SET last_checkin_date = $2,
                         current_streak = $3,
                         total_checkins = total_checkins + 1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = $1`,
                    [userId, today, newStreak]
                );
            } else {
                // Create new record
                await client.query(
                    `INSERT INTO daily_checkins (user_id, last_checkin_date, current_streak, total_checkins)
                     VALUES ($1, $2, $3, 1)`,
                    [userId, today, newStreak]
                );
            }

            // Add daily reward - truyền client vào để cùng transaction
            await this.addDailyReward(userId, rewardAmount, `Daily checkin Day ${newStreak}`, client);

            await client.query('COMMIT');

            return {
                reward: rewardAmount,
                streak: newStreak,
                totalCheckins: checkinStatus.exists ? checkinStatus.total_checkins + 1 : 1
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in processDailyCheckin:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    // Thêm MĐCoins từ daily reward
    static async addDailyReward(userId, amount, description = null, client = null) {
        try {
            const queryClient = client || pool;
            
            // Cập nhật balance và total_earned
            await queryClient.query(
                `UPDATE users
                 SET balance = balance + $2,
                     total_earned = total_earned + $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [userId, amount]
            );

            // Ghi transaction log
            await queryClient.query(
                `INSERT INTO transactions (to_user_id, amount, type, description)
                 VALUES ($1, $2, 'daily_checkin', $3)`,
                [userId, amount, description || `Daily checkin reward - Day ${amount}`]
            );

            console.log(`📅 ${userId} received ${amount} MĐC from daily checkin`);
            return true;
        } catch (error) {
            console.error('Error in addDailyReward:', error);
            throw error;
        }
    }

    // Lấy daily checkin leaderboard
    static async getDailyCheckinLeaderboard(orderBy = 'current_streak', limit = 10) {
        try {
            const validColumns = ['current_streak', 'total_checkins'];
            if (!validColumns.includes(orderBy)) {
                orderBy = 'current_streak';
            }

            const result = await pool.query(
                `SELECT dc.user_id, dc.current_streak, dc.total_checkins, dc.last_checkin_date
                 FROM daily_checkins dc
                 WHERE dc.user_id != $1
                 ORDER BY dc.${orderBy} DESC
                 LIMIT $2`,
                ['1344241813074083913', limit]
            );

            return result.rows;
        } catch (error) {
            console.error('Error in getDailyCheckinLeaderboard:', error);
            throw error;
        }
    }

    // ===== INVITE REWARD FUNCTIONS =====

    // Thêm MĐCoins từ invite reward
    static async addInviteReward(userId, amount, description) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Đảm bảo user tồn tại - truyền client vào để cùng transaction
            await this.getOrCreateUser(userId, null, client);

            // Cập nhật balance và total_earned
            await client.query(
                `UPDATE users
                 SET balance = balance + $2,
                     total_earned = total_earned + $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $1`,
                [userId, amount]
            );

            // Ghi transaction log
            await client.query(
                `INSERT INTO transactions (to_user_id, amount, type, description)
                 VALUES ($1, $2, 'invite_reward', $3)`,
                [userId, amount, description]
            );

            await client.query('COMMIT');
            console.log(`🎁 ${userId} received ${amount} MĐC from invite reward`);
            
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in addInviteReward:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = UserService;