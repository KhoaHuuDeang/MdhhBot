const { pool } = require('../db/database');
const UserService = require('./dbHelpers');

class InviteManager {
    constructor(client) {
        this.client = client;
        this.inviteCache = new Map(); // Map<inviteCode, inviteData>
        this.initialized = false;
    }

    /**
     * Initialize invite cache for a guild
     * @param {Guild} guild - Discord guild object
     */
    async initializeCache(guild) {
        try {
            console.log(`🔄 Initializing invite cache for guild: ${guild.name}`);
            
            // Fetch all current invites from Discord
            const invites = await guild.invites.fetch();
            
            // Clear existing cache
            this.inviteCache.clear();
            
            // Populate cache with current invites
            for (const [code, invite] of invites) {
                this.inviteCache.set(code, {
                    code: invite.code,
                    uses: invite.uses || 0,
                    inviterId: invite.inviter?.id,
                    maxUses: invite.maxUses || 0,
                    expiresAt: invite.expiresAt,
                    createdAt: invite.createdAt
                });
            }

            // Sync cache with database
            await this.syncCacheWithDatabase(invites);
            
            this.initialized = true;
            console.log(`✅ Invite cache initialized with ${this.inviteCache.size} invites`);
            
        } catch (error) {
            console.error('❌ Error initializing invite cache:', error);
            throw error;
        }
    }

    /**
     * Sync invite cache with database
     * @param {Collection} discordInvites - Discord invites collection
     */
    async syncCacheWithDatabase(discordInvites) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update database with current Discord invites
            for (const [code, invite] of discordInvites) {
                await client.query(`
                    INSERT INTO invites (code, inviter_id, uses, max_uses, expires_at, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    ON CONFLICT (code) DO UPDATE SET
                        uses = $3,
                        max_uses = $4,
                        expires_at = $5,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    invite.code,
                    invite.inviter?.id,
                    invite.uses || 0,
                    invite.maxUses || 0,
                    invite.expiresAt,
                    invite.createdAt
                ]);
            }

            await client.query('COMMIT');
            console.log(`📊 Synced ${discordInvites.size} invites with database`);

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error syncing invites with database:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Find which invite was used when a member joins
     * @param {Guild} guild - Discord guild object
     * @returns {Object|null} Used invite info or null if not found
     */
    async findUsedInvite(guild) {
        try {
            const newInvites = await guild.invites.fetch();
            
            // Compare with cache to find increased usage
            for (const [code, newInvite] of newInvites) {
                const cachedInvite = this.inviteCache.get(code);
                const newUses = newInvite.uses || 0;
                const cachedUses = cachedInvite ? cachedInvite.uses : 0;

                if (newUses > cachedUses) {
                    console.log(`🎯 Found used invite: ${code} (${cachedUses} -> ${newUses})`);
                    
                    // Update cache
                    this.inviteCache.set(code, {
                        code: newInvite.code,
                        uses: newUses,
                        inviterId: newInvite.inviter?.id,
                        maxUses: newInvite.maxUses || 0,
                        expiresAt: newInvite.expiresAt,
                        createdAt: newInvite.createdAt
                    });

                    // Get real inviter from database (not Discord API inviter which could be bot)
                    let realInviter = newInvite.inviter;
                    try {
                        const dbInvite = await pool.query(
                            'SELECT inviter_id FROM invites WHERE code = $1',
                            [code]
                        );
                        
                        if (dbInvite.rows.length > 0) {
                            const realInviterId = dbInvite.rows[0].inviter_id;
                            // Get real user from guild
                            const realUser = await guild.members.fetch(realInviterId);
                            if (realUser) {
                                realInviter = realUser.user;
                                console.log(`🔄 Using real inviter from DB: ${realInviter.tag} instead of ${newInvite.inviter?.tag}`);
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error getting real inviter from database:', error);
                        // Fallback to Discord API inviter
                    }

                    return {
                        code: newInvite.code,
                        inviter: realInviter,
                        uses: newUses,
                        previousUses: cachedUses
                    };
                }
            }

            // Also update cache with all new invite data
            await this.updateCacheFromDiscord(newInvites);
            
            return null; // No used invite found

        } catch (error) {
            console.error('❌ Error finding used invite:', error);
            return null;
        }
    }

    /**
     * Update cache from Discord API data
     * @param {Collection} discordInvites - Current Discord invites
     */
    async updateCacheFromDiscord(discordInvites) {
        for (const [code, invite] of discordInvites) {
            this.inviteCache.set(code, {
                code: invite.code,
                uses: invite.uses || 0,
                inviterId: invite.inviter?.id,
                maxUses: invite.maxUses || 0,
                expiresAt: invite.expiresAt,
                createdAt: invite.createdAt
            });
        }
    }

    /**
     * Reward inviter with MĐCoin for successful invite
     * @param {User} inviter - Discord user who created invite
     * @param {GuildMember} invitee - New guild member who joined
     * @param {string} inviteCode - Invite code used
     * @param {number} rewardAmount - Amount to reward (default: 3)
     */
    async rewardInviter(inviter, invitee, inviteCode, rewardAmount = 3) {
        try {
            // Ensure both users exist in database using UserService
            await UserService.getOrCreateUser(inviter.id);
            await UserService.getOrCreateUser(invitee.id);

            // Use UserService method to add invite reward (handles balance + transaction)
            const description = `Invite reward for ${invitee.user.tag} joining via ${inviteCode}`;
            await UserService.addInviteReward(inviter.id, rewardAmount, description);

            // Record invite reward in invite_rewards table and update invite uses (cần transaction)
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                await client.query(`
                    INSERT INTO invite_rewards (inviter_id, invitee_id, invite_code, reward_amount)
                    VALUES ($1, $2, $3, $4)
                `, [inviter.id, invitee.id, inviteCode, rewardAmount]);

                await client.query(`
                    UPDATE invites 
                    SET uses = uses + 1, updated_at = CURRENT_TIMESTAMP 
                    WHERE code = $1
                `, [inviteCode]);

                await client.query('COMMIT');
                
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
            
            console.log(`💰 Rewarded ${inviter.tag} with ${rewardAmount} MĐCoin for invite ${inviteCode}`);
            return true;

        } catch (error) {
            console.error('❌ Error rewarding inviter:', error);
            throw error;
        }
    }

    /**
     * Get invite statistics for a user
     * @param {string} userId - Discord user ID
     * @returns {Object} Invite stats
     */
    async getInviteStats(userId) {
        try {
            // Chỉ đọc dữ liệu → dùng pool.query() trực tiếp
            
            // Get total successful invites and rewards earned
            const inviteResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_invites,
                    COALESCE(SUM(reward_amount), 0) as total_rewards
                FROM invite_rewards 
                WHERE inviter_id = $1
            `, [userId]);

            // Get active invites created by user
            const activeInvites = await pool.query(`
                SELECT code, uses, max_uses, expires_at, created_at
                FROM invites 
                WHERE inviter_id = $1 
                ORDER BY created_at DESC
            `, [userId]);

            return {
                totalInvites: parseInt(inviteResult.rows[0].total_invites) || 0,
                totalRewards: parseInt(inviteResult.rows[0].total_rewards) || 0,
                activeInvites: activeInvites.rows
            };

        } catch (error) {
            console.error('❌ Error getting invite stats:', error);
            return { totalInvites: 0, totalRewards: 0, activeInvites: [] };
        }
    }

    /**
     * Get leaderboard of top inviters
     * @param {number} limit - Number of top inviters to return
     * @returns {Array} Top inviters
     */
    async getInviteLeaderboard(limit = 10) {
        try {
            // Chỉ đọc dữ liệu → dùng pool.query() trực tiếp
            const queryResult = await pool.query(`
                SELECT 
                    inviter_id,
                    COUNT(*) as total_invites,
                    SUM(reward_amount) as total_rewards
                FROM invite_rewards 
                GROUP BY inviter_id 
                ORDER BY total_invites DESC, total_rewards DESC
                LIMIT $1
            `, [limit]);

            return queryResult.rows;

        } catch (error) {
            console.error('❌ Error getting invite leaderboard:', error);
            return [];
        }
    }

    /**
     * Check if invite cache is initialized
     * @returns {boolean} True if initialized
     */
    isInitialized() {
        return this.initialized;
    }
}

module.exports = InviteManager;