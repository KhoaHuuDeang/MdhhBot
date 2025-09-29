const { PrismaClient } = require('@prisma/client');

class PrismaService {
  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    // Invite cache for Discord invite tracking
    this.inviteCache = new Map(); // Map<invite_code, inviteData>
    this.inviteInitialized = false;

    console.log('✅ PrismaService initialized with optimized connection pooling');
  }

  // ===== USER OPERATIONS =====

  async getOrCreateUser(userId) {
    return await this.prisma.users.upsert({
      where: { user_id: userId },
      update: {},
      create: {
        user_id: userId,
        balance: 0,
        balance_vip: 0,
        total_earned: 0,
        total_earned_vip: 0
      }
    });
  }

  async getUserBalance(userId) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: {
        balance: true,
        balance_vip: true,
        total_earned: true,
        total_earned_vip: true
      }
    });
    
    return user ? { 
      balance: user.balance,
      balance_vip: user.balance_vip,
      total_earned: user.total_earned,
      total_earned_vip: user.total_earned_vip,
      exists: true 
    } : { 
      exists: false, 
      balance: 0, 
      balance_vip: 0, 
      total_earned: 0, 
      total_earned_vip: 0 
    };
  }

  // ===== VOICE EARNINGS (CRITICAL FOR COUNTDOWN FIX) =====
  
  async addVoiceEarnings(userId, amount) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Ensure user exists
        await tx.users.upsert({
          where: { user_id: userId },
          update: {},
          create: {
            user_id: userId,
            balance: 0,
            balance_vip: 0,
            total_earned: 0,
            total_earned_vip: 0
          }
        });

        // Update balance and total earned
        const updatedUser = await tx.users.update({
          where: { user_id: userId },
          data: {
            balance: { increment: amount },
            total_earned: { increment: amount }
          },
          select: {
            balance: true,
            total_earned: true
          }
        });

        // Create transaction log
        await tx.transactions.create({
          data: {
            to_user_id: userId,
            amount,
            type: 'voice_earn',
            description: 'Earned from voice channel activity'
          }
        });

        console.log(`💰 User ${userId} earned ${amount} MĐC (Total: ${updatedUser.total_earned})`);
        return updatedUser;
      });
    } catch (error) {
      console.error(`❌ Voice earning failed for user ${userId}:`, error);
      throw error;
    }
  }

  // ===== TRANSFER OPERATIONS =====

  async transferCoins(from_user_id, to_user_id, amount, reason) {
    return await this.prisma.$transaction(async (tx) => {
      // Check sender balance
      const sender = await tx.users.findUnique({
        where: { user_id: from_user_id },
        select: { balance: true }
      });

      if (!sender || sender.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Ensure receiver exists
      await tx.users.upsert({
        where: { user_id: to_user_id },
        update: {},
        create: {
          user_id: to_user_id,
          balance: 0,
          balance_vip: 0,
          total_earned: 0,
          total_earned_vip: 0
        }
      });

      // Update balances
      await tx.users.update({
        where: { user_id: from_user_id },
        data: { balance: { decrement: amount } }
      });

      await tx.users.update({
        where: { user_id: to_user_id },
        data: {
          balance: { increment: amount },
          total_earned: { increment: amount }
        }
      });

      // Create transaction log
      await tx.transactions.create({
        data: {
          from_user_id,
          to_user_id,
          amount,
          type: 'gift',
          description: reason ? `Gift: ${reason}` : 'Coin transfer'
        }
      });

      console.log(`💸 ${from_user_id} gifted ${amount} MĐC to ${to_user_id}`);
      return true;
    });
  }

  async transferVipCoins(from_user_id, to_user_id, amount, reason) {
    return await this.prisma.$transaction(async (tx) => {
      // Check sender VIP balance
      const sender = await tx.users.findUnique({
        where: { user_id: from_user_id },
        select: { balance_vip: true }
      });

      if (!sender || sender.balance_vip < amount) {
        throw new Error('Insufficient VIP balance');
      }

      // Ensure receiver exists
      await tx.users.upsert({
        where: { user_id: to_user_id },
        update: {},
        create: {
          user_id: to_user_id,
          balance: 0,
          balance_vip: 0,
          total_earned: 0,
          total_earned_vip: 0
        }
      });

      // Update VIP balances
      await tx.users.update({
        where: { user_id: from_user_id },
        data: { balance_vip: { decrement: amount } }
      });

      await tx.users.update({
        where: { user_id: to_user_id },
        data: {
          balance_vip: { increment: amount },
          total_earned_vip: { increment: amount }
        }
      });

      // Create transaction log
      await tx.transactions.create({
        data: {
          from_user_id,
          to_user_id,
          amount,
          type: 'vip_transfer',
          description: reason ? `VIP Gift: ${reason}` : 'VIP coin transfer'
        }
      });

      console.log(`💎 ${from_user_id} gifted ${amount} MĐV to ${to_user_id}`);
      return true;
    });
  }

  // ===== FUND OPERATIONS =====

  async createFund(name, description) {
    try {
      const fund = await this.prisma.funds.create({
        data: { name, description }
      });
      console.log(`🏛️ Created fund: ${name}`);
      return fund;
    } catch (error) {
      if (error.code === 'P2002') { // Unique constraint violation
        throw new Error('Fund name already exists');
      }
      throw error;
    }
  }

  async getFundsList() {
    const funds = await this.prisma.funds.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        name: true,
        description: true,
        total_donated: true,
        total_donated_vip: true,
        created_at: true
      }
    });
    
    // Convert to camelCase for commands
    return funds.map(fund => ({
      name: fund.name,
      description: fund.description,
      total_donated: fund.total_donated,
      total_donated_vip: fund.total_donated_vip,
      created_at: fund.created_at
    }));
  }

  async getFundByName(name) {
    const fund = await this.prisma.funds.findUnique({
      where: { name }
    });
    
    if (!fund) return null;
    
    // Convert to camelCase for commands
    return {
      id: fund.id,
      name: fund.name,
      description: fund.description,
      total_donated: fund.total_donated,
      total_donated_vip: fund.total_donated_vip,
      created_at: fund.created_at
    };
  }

  async donateToFund(user_id, fund_name, amount, amount_vip, reason) {
    return await this.prisma.$transaction(async (tx) => {
      // Validate fund exists
      const fund = await tx.funds.findUnique({
        where: { name: fund_name }
      });

      if (!fund) {
        throw new Error('Fund not found');
      }

      // Check user balances
      const user = await tx.users.findUnique({
        where: { user_id },
        select: { balance: true, balance_vip: true }
      });

      if (!user || (amount > 0 && user.balance < amount) || (amount_vip > 0 && user.balance_vip < amount_vip)) {
        throw new Error('Insufficient balance');
      }

      // Update user balances
      if (amount > 0) {
        await tx.users.update({
          where: { user_id },
          data: { balance: { decrement: amount } }
        });
      }

      if (amount_vip > 0) {
        await tx.users.update({
          where: { user_id },
          data: { balance_vip: { decrement: amount_vip } }
        });
      }

      // Update fund totals
      await tx.funds.update({
        where: { name: fund_name },
        data: {
          total_donated: { increment: amount },
          total_donated_vip: { increment: amount_vip }
        }
      });

      // Create donation record
      await tx.fund_donations.create({
        data: {
          fund_name,
          donor_id: user_id,
          amount,
          amount_vip
        }
      });

      // Create transaction logs
      if (amount > 0) {
        await tx.transactions.create({
          data: {
            from_user_id: user_id,
            to_user_id: user_id, // Special case for donations
            amount,
            type: 'fund_donation',
            description: reason ? `Fund donation to ${fund_name}: ${reason}` : `Donated to ${fund_name}`
          }
        });
      }

      console.log(`🏛️ ${user_id} donated ${amount} MĐC + ${amount_vip} MĐV to ${fund_name}`);
      return true;
    });
  }

  async getFundDonations(fund_name, limit = 10) {
    const donations = await this.prisma.fund_donations.groupBy({
      by: ['donor_id'],
      where: { fund_name },
      _sum: {
        amount: true,
        amount_vip: true
      },
      _count: {
        id: true
      },
      _max: {
        created_at: true
      },
      orderBy: {
        _sum: {
          amount: 'desc'
        }
      },
      take: limit
    });

    return donations.map(donation => ({
      donor_id: donation.donor_id,
      total_donated: donation._sum.amount || 0,
      total_donated_vip: donation._sum.amount_vip || 0,
      donation_count: donation._count.id,
      last_donation: donation._max.created_at
    }));
  }

  // ===== LEADERBOARD =====

  async getLeaderboard(orderBy = 'balance', limit = 10) {
    const excludeIds = process.env.LEADERBOARD_EXCLUDE_IDS?.split(',') || [];
    
    return await this.prisma.users.findMany({
      where: {
        user_id: { notIn: excludeIds },
        OR: [
          { balance: { gt: 0 } },
          { total_earned: { gt: 0 } }
        ]
      },
      select: {
        user_id: true,
        balance: true,
        total_earned: true
      },
      orderBy: { [orderBy]: 'desc' },
      take: limit
    });
  }

  // ===== DAILY CHECKIN =====

  async getDailyCheckinStatus(userId) {
    const checkin = await this.prisma.daily_checkins.findUnique({
      where: { user_id: userId }
    });

    if (!checkin) {
      return { exists: false, canCheckIn: true };
    }

    const today = new Date().toISOString().split('T')[0];
    const last_checkin_date = checkin.last_checkin_date.toISOString().split('T')[0];

    return {
      ...checkin,
      exists: true,
      canCheckIn: today !== last_checkin_date,
      isToday: today === last_checkin_date
    };
  }

  async processDailyCheckin(userId) {
    return await this.prisma.$transaction(async (tx) => {
      // Ensure user exists
      await tx.users.upsert({
        where: { user_id },
        update: {},
        create: {
          user_id,
          balance: 0,
          balance_vip: 0,
          total_earned: 0,
          total_earned_vip: 0
        }
      });

      const checkinStatus = await this.getDailyCheckinStatus(userId);

      if (!checkinStatus.canCheckIn) {
        throw new Error('Already checked in today');
      }

      const today = new Date().toISOString().split('T')[0];
      let newStreak = 1;

      if (checkinStatus.exists) {
        const lastCheckin = checkinStatus.last_checkin_date.toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastCheckin === yesterdayStr) {
          newStreak = checkinStatus.current_streak + 1;
          if (yesterday.getDay() === 0) { // Sunday reset
            newStreak = 1;
          }
        }
      }

      const rewardAmount = newStreak;

      // Update or create checkin record
      await tx.daily_checkins.upsert({
        where: { user_id },
        update: {
          last_checkin_date: today,
          current_streak: newStreak,
          total_checkins: { increment: 1 }
        },
        create: {
          user_id,
          last_checkin_date: today,
          current_streak: newStreak,
          total_checkins: 1
        }
      });

      // Add daily reward
      await tx.users.update({
        where: { user_id },
        data: {
          balance: { increment: reward_amount },
          total_earned: { increment: reward_amount }
        }
      });

      // Create transaction log
      await tx.transactions.create({
        data: {
          to_user_id: userId,
          amount: reward_amount,
          type: 'daily_checkin',
          description: `Daily checkin Day ${newStreak}`
        }
      });

      return {
        reward: reward_amount,
        streak: newStreak,
        total_checkins: checkinStatus.exists ? checkinStatus.totalCheckins + 1 : 1
      };
    });
  }

  // ===== INVITE REWARDS =====

  async addInviteReward(user_id, amount, description) {
    return await this.prisma.$transaction(async (tx) => {
      // Ensure user exists
      await tx.users.upsert({
        where: { user_id },
        update: {},
        create: {
          user_id,
          balance: 0,
          balance_vip: 0,
          total_earned: 0,
          total_earned_vip: 0
        }
      });

      // Update balance
      await tx.users.update({
        where: { user_id },
        data: {
          balance: { increment: amount },
          total_earned: { increment: amount }
        }
      });

      // Create transaction log
      await tx.transactions.create({
        data: {
          to_user_id: userId,
          amount,
          type: 'invite_reward',
          description
        }
      });

      console.log(`🎁 ${userId} received ${amount} MĐC from invite reward`);
      return true;
    });
  }

  // ===== INVITE MANAGEMENT SYSTEM =====

  /**
   * Initialize invite cache for a guild (Discord bot client needed)
   */
  async initializeInviteCache(guild, client) {
    try {
      console.log(`🔄 Initializing invite cache for guild: ${guild.name}`);
      
      // Store client reference for future use
      this.client = client;
      
      // Fetch all current invites from Discord
      const invites = await guild.invites.fetch();
      
      // Clear existing cache
      this.inviteCache.clear();
      
      // Populate cache with current invites
      for (const [code, invite] of invites) {
        this.inviteCache.set(code, {
          code: invite.code,
          uses: invite.uses || 0,
          inviter_id: invite.inviter?.id,
          max_uses: invite.maxUses || 0,
          expires_at: invite.expires_at,
          created_at: invite.createdAt
        });
      }

      // Sync cache with database
      await this.syncInvitesWithDatabase(invites);
      
      this.inviteInitialized = true;
      console.log(`✅ Invite cache initialized with ${this.inviteCache.size} invites`);
      
    } catch (error) {
      console.error('❌ Error initializing invite cache:', error);
      throw error;
    }
  }

  /**
   * Sync invite cache with database
   */
  async syncInvitesWithDatabase(discordInvites) {
    try {
      // Update database with current Discord invites using Prisma upsert
      for (const [code, invite] of discordInvites) {
        await this.prisma.invites.upsert({
          where: { code: invite.code },
          update: {
            uses: invite.uses || 0,
            max_uses: invite.maxUses || 0,
            expires_at: invite.expires_at,
            updated_at: new Date()
          },
          create: {
            code: invite.code,
            inviter_id: invite.inviter?.id || 'unknown',
            uses: invite.uses || 0,
            max_uses: invite.maxUses || 0,
            expires_at: invite.expires_at,
            created_at: invite.createdAt || new Date()
          }
        });
      }

      console.log(`📊 Synced ${discordInvites.size} invites with database`);

    } catch (error) {
      console.error('❌ Error syncing invites with database:', error);
      throw error;
    }
  }

  /**
   * Find which invite was used when a member joins
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
            inviter_id: newInvite.inviter?.id,
            max_uses: newInvite.maxUses || 0,
            expires_at: newInvite.expires_at,
            created_at: newInvite.createdAt
          });

          // Get real inviter from database
          let realInviter = newInvite.inviter;
          try {
            const dbInvite = await this.prisma.invites.findUnique({
              where: { code: code }
            });

            if (dbInvite && dbInvite.inviter_id !== newInvite.inviter?.id) {
              // Get the real inviter from Discord
              realInviter = await this.client.users.fetch(dbInvite.inviterId).catch(() => newInvite.inviter);
              console.log(`📋 Real inviter found from DB: ${realInviter?.tag || dbInvite.inviterId}`);
            }
          } catch (dbError) {
            console.log(`📋 Using Discord API inviter: ${newInvite.inviter?.tag}`);
          }

          // Update database usage count
          await this.prisma.invites.update({
            where: { code: code },
            data: {
              uses: newUses,
              updated_at: new Date()
            }
          }).catch(err => console.log('Could not update invite usage in DB:', err.message));

          return {
            code: code,
            inviter: realInviter,
            usesIncrement: newUses - cachedUses
          };
        }
      }

      // Check for deleted invites
      for (const [code, cachedInvite] of this.inviteCache) {
        if (!newInvites.has(code) && cachedInvite.uses > 0) {
          console.log(`🗑️ Invite deleted after use: ${code}`);
          
          try {
            const dbInvite = await this.prisma.invites.findUnique({
              where: { code: code }
            });

            if (dbInvite) {
              const inviter = await this.client.users.fetch(dbInvite.inviterId).catch(() => null);
              
              // Remove from cache
              this.inviteCache.delete(code);
              
              return {
                code: code,
                inviter: inviter,
                usesIncrement: 1,
                deleted: true
              };
            }
          } catch (dbError) {
            console.log('Could not fetch deleted invite from DB:', dbError.message);
          }
        }
      }

      // Update cache with new invites
      this.inviteCache.clear();
      for (const [code, invite] of newInvites) {
        this.inviteCache.set(code, {
          code: invite.code,
          uses: invite.uses || 0,
          inviter_id: invite.inviter?.id,
          max_uses: invite.maxUses || 0,
          expires_at: invite.expires_at,
          created_at: invite.createdAt
        });
      }

      return null; // No used invite found

    } catch (error) {
      console.error('❌ Error finding used invite:', error);
      return null;
    }
  }

  /**
   * Reward inviter with coins
   */
  async rewardInviter(inviter, newMember, invite_code, reward = 3) {
    try {
      console.log(`🎁 Rewarding inviter ${inviter.tag} with ${reward} MĐC for inviting ${newMember.user.tag}`);

      // Give reward using addInviteReward
      await this.addInviteReward(
        inviter.id,
        reward,
        `Invited ${newMember.user.tag} using code ${inviteCode}`
      );

      // Record invite reward in database
      await this.prisma.invite_rewards.create({
        data: {
          inviter_id: inviter.id,
          invitee_id: newMember.user.id,
          invite_code: inviteCode,
          reward_amount: reward
        }
      });

      console.log(`✅ Invite reward completed: ${inviter.tag} → ${reward} MĐC`);

    } catch (error) {
      console.error('❌ Error rewarding inviter:', error);
      throw error;
    }
  }

  /**
   * Get invite statistics for a user
   */
  async getUserInviteStats(userId) {
    try {
      // Get invites created by user
      const userInvites = await this.prisma.invites.findMany({
        where: { inviter_id: userId }
      });

      // Get invite rewards earned
      const inviteRewards = await this.prisma.invite_rewards.findMany({
        where: { inviter_id: userId }
      });

      // Calculate statistics
      const totalInvites = userInvites.reduce((sum, invite) => sum + invite.uses, 0);
      const totalRewards = inviteRewards.reduce((sum, reward) => sum + reward.reward_amount, 0);
      const activeInvites = userInvites.filter(invite => 
        !invite.expires_at || invite.expires_at > new Date()
      ).length;

      return {
        totalInvites,
        totalRewards,
        activeInvites,
        inviteCount: userInvites.length,
        rewardHistory: inviteRewards.slice(-5) // Last 5 rewards
      };

    } catch (error) {
      console.error('❌ Error getting invite stats:', error);
      return {
        totalInvites: 0,
        totalRewards: 0,
        activeInvites: 0,
        inviteCount: 0,
        rewardHistory: []
      };
    }
  }

  /**
   * Get invite leaderboard
   */
  async getInviteLeaderboard(limit = 10) {
    try {
      const leaderboard = await this.prisma.invite_rewards.groupBy({
        by: ['inviter_id'],
        _sum: {
          reward_amount: true
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: limit
      });

      return leaderboard.map(entry => ({
        inviter_id: entry.inviter_id,
        totalInvites: entry._count.id,
        totalRewards: entry._sum.rewardAmount || 0
      }));

    } catch (error) {
      console.error('❌ Error getting invite leaderboard:', error);
      return [];
    }
  }

  // ===== UTILITY =====

  async getUserTransactions(userId, limit = 10) {
    return await this.prisma.transactions.findMany({
      where: {
        OR: [
          { from_user_id: userId },
          { to_user_id: userId }
        ]
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });
  }

  // Cleanup connections
  async disconnect() {
    await this.prisma.$disconnect();
    console.log('🔌 Prisma disconnected');
  }
}

// Export singleton instance
module.exports = new PrismaService();