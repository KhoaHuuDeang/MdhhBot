const { CONFIG, MESSAGES } = require('../constants');
const countDown = require('./countDown');
const voiceService = require('./voiceService');

const FOUR_HOUR_MARK = CONFIG.TIME.SESSION_DURATION * 4; // 240 minutes

class VoiceStateManager {
  constructor(prismaService) {
    this.prismaService = prismaService;
    this.channelSession = new Map(); // Store user session data
  }

  // Main voice state update handler
  async handleVoiceStateUpdate(lastTime, thisTime) {
    console.log(MESSAGES.LOG.VOICE_STATE_UPDATE(lastTime.channelId, thisTime.channelId));

    const user = thisTime.member.user;

    if (!user || user.bot) return;

    // Ensure user exists in database
    await this.prismaService.getOrCreateUser(user.id);

    // ✅ GLOBAL CLEANUP FIRST - prevent multiple timers
    await this.forceCleanupUser(user.id);

    // User joins voice channel (excluding intermediate channel)
    if (this.isUserJoiningVoice(lastTime, thisTime)) {
      console.log(`✅ [VoiceStateManager] User ${user.tag} is joining voice channel`);
      await this.handleUserJoinVoice(thisTime, false);
    }
    // User switches between voice channels (not leaving voice entirely)
    else if (this.isUserSwitchingChannels(lastTime, thisTime)) {
      console.log(`🔄 [VoiceStateManager] User ${user.tag} is switching voice channels`);
      await this.handleUserJoinVoice(thisTime, true); // Pass true for channel switch
    }
    else {
      console.log(`ℹ️ [VoiceStateManager] User ${user.tag} is not joining valid voice channel`);
    }

    // User leaves voice entirely (not switching)
    if (this.isUserLeavingVoiceEntirely(lastTime, thisTime)) {
      console.log(`❌ [VoiceStateManager] User ${user.tag} is leaving voice entirely`);
      await this.handleUserLeaveVoice(user.id);
    }
    
    console.log(`📊 [VoiceStateManager] Current active sessions: ${this.getActiveSessionsCount()}`);
  }
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~













  // Check if user is joining a valid voice channel (first time or from intermediate)
  isUserJoiningVoice(lastTime, thisTime) {
    const isJoining = thisTime.channelId && 
           thisTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL && 
           (!lastTime.channelId || lastTime.channelId === CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL);
    
    console.log(`🔍 [VoiceStateManager] Checking if joining voice (first time):`);
    console.log(`   - Current channel: ${thisTime.channelId}`);
    console.log(`   - Previous channel: ${lastTime.channelId}`);
    console.log(`   - Intermediate channel: ${CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL}`);
    console.log(`   - Result: ${isJoining}`);
    
    return isJoining;
  }

  // Check if user is switching between voice channels (both valid channels)
  isUserSwitchingChannels(lastTime, thisTime) {
    const isSwitching = lastTime.channelId && 
           thisTime.channelId &&
           lastTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL &&
           thisTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL &&
           lastTime.channelId !== thisTime.channelId;
           
    if (isSwitching) {
      console.log(`🔄 [VoiceStateManager] Channel switch detected:`);
      console.log(`   - From: ${lastTime.channelId} → To: ${thisTime.channelId}`);
    }
    
    return isSwitching;
  }

  // Check if user is leaving voice entirely (not switching to another voice channel)
  isUserLeavingVoiceEntirely(lastTime, thisTime) {
    const isLeavingEntirely = lastTime.channelId && 
           lastTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL && 
           (!thisTime.channelId || thisTime.channelId === CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL);
           
    if (isLeavingEntirely) {
      console.log(`❌ [VoiceStateManager] User leaving voice entirely:`);
      console.log(`   - From: ${lastTime.channelId} → To: ${thisTime.channelId || 'null'}`);
    }
    
    return isLeavingEntirely;
  }

  // Check if user is switching between voice channels (both valid channels)
  isUserSwitchingChannels(lastTime, thisTime) {
    const isSwitching = lastTime.channelId && 
           thisTime.channelId &&
           lastTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL &&
           thisTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL &&
           lastTime.channelId !== thisTime.channelId;
           
    if (isSwitching) {
      console.log(`🔄 [VoiceStateManager] Channel switch detected:`);
      console.log(`   - From: ${lastTime.channelId} → To: ${thisTime.channelId}`);
    }
    
    return isSwitching;
  }

  // Check if user is leaving voice entirely (not switching to another voice channel)
  isUserLeavingVoiceEntirely(lastTime, thisTime) {
    const isLeavingEntirely = lastTime.channelId && 
           lastTime.channelId !== CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL && 
           (!thisTime.channelId || thisTime.channelId === CONFIG.VOICE_CHANNELS.INTERMEDIATE_CHANNEL);
           
    if (isLeavingEntirely) {
      console.log(`❌ [VoiceStateManager] User leaving voice entirely:`);
      console.log(`   - From: ${lastTime.channelId} → To: ${thisTime.channelId || 'null'}`);
    }
    
    return isLeavingEntirely;
  }

  // Handle user joining voice channel
  async handleUserJoinVoice(thisTime, isChannelSwitch = false) {
    const user = thisTime.member.user;
    const currentChannel = thisTime.channel;

    console.log(`🎉 [VoiceStateManager] Processing user ${isChannelSwitch ? 'channel switch' : 'join'} for ${user.tag} in ${currentChannel.name}`);

    // Get existing session data if switching channels (to preserve progress)
    const existingData = this.channelSession.get(user.id);
    let preservedSessionCounter = 1;
    let preservedTotalMinutes = 0;
    let preservedCoin = 0;

    if (isChannelSwitch && existingData) {
      preservedSessionCounter = existingData.sessionCounter;
      preservedTotalMinutes = existingData.totalMinutes;
      preservedCoin = existingData.coin;
      console.log(`🔄 [VoiceStateManager] Preserving session data: session #${preservedSessionCounter}, ${preservedTotalMinutes}min total, ${preservedCoin} coins`);
    }

    // Setup SINGLE timer for both earnings and countdown (every minute)
    console.log(`⏲️ [VoiceStateManager] Setting up unified timer for ${user.tag}`);
    
    // Initialize session data
    const sessionData = {
      currentChannel,
      timer: null, // Will be set below
      balance: await this.prismaService.getUserBalance(user.id),
      countdownTimer: null,
      countdownMessage: null,
      sessionCounter: preservedSessionCounter,
      totalMinutes: preservedTotalMinutes,
      coin: preservedCoin,
      minutesInCurrentSession: 0, // Track minutes in current hour
      lastEarningsTime: Date.now(), // Track last time we gave earnings
      break30AudioPlayed: false,
      break4AudioPlayed: false,
      break30MessageSent: false,
      break4MessageSent: false
    };

    console.log(`💾 [VoiceStateManager] Session data initialized for ${user.tag}:`, {
      sessionCounter: sessionData.sessionCounter,
      totalMinutes: sessionData.totalMinutes,
      coin: sessionData.coin,
      channel: currentChannel.name,
      isChannelSwitch,
      minutesInCurrentSession: sessionData.minutesInCurrentSession
    });

    // Send welcome message
    console.log(`💬 [VoiceStateManager] Sending ${isChannelSwitch ? 'switch' : 'welcome'} message to ${currentChannel.name}`);
    try {
      const welcomeMessage = isChannelSwitch 
        ? MESSAGES.VOICE.WELCOME_SWITCH(thisTime.member.displayName, currentChannel.name)
        : MESSAGES.VOICE.WELCOME(thisTime.member.displayName);
        
      sessionData.countdownMessage = await currentChannel.send(welcomeMessage);
      console.log(`✅ [VoiceStateManager] ${isChannelSwitch ? 'Switch' : 'Welcome'} message sent successfully`);
    } catch (error) {
      console.error(`❌ [VoiceStateManager] Failed to send welcome message:`, error);
    }

    // Start countdown timer (UNIFIED - handles both UI and earnings)
    console.log(`⏰ [VoiceStateManager] Starting unified countdown timer for ${user.tag}`);
    sessionData.countdownTimer = this.startCountdownTimer(sessionData, thisTime);

    // Store session data
    this.channelSession.set(user.id, sessionData);
    console.log(`✅ [VoiceStateManager] Session stored for ${user.tag}. Total sessions: ${this.channelSession.size}`);
  }

  // Start countdown timer for user session (UNIFIED TIMER)
  startCountdownTimer(sessionData, thisTime) {
    let minutesLeft = CONFIG.TIME.SESSION_DURATION - sessionData.minutesInCurrentSession;
    console.log(`⏱️ [VoiceStateManager] Starting countdown with ${minutesLeft} minutes remaining in current session for ${thisTime.member.user.tag}`);

    return setInterval(async () => {
      try {
        minutesLeft--;
        sessionData.totalMinutes++;
        sessionData.minutesInCurrentSession++;
        
        console.log(`⏰ [VoiceStateManager] Timer tick for ${thisTime.member.user.tag}: ${minutesLeft}min left in session, ${sessionData.totalMinutes}min total, session #${sessionData.sessionCounter}`);

        // Check if user should be kicked after 4h5m
        if (sessionData.totalMinutes >= CONFIG.TIME.MAX_STUDY_TIME) {
          console.log(`⚠️ [VoiceStateManager] Max study time reached for ${thisTime.member.user.tag} (${sessionData.totalMinutes}min)`);
          await this.kickUserAfterMaxTime(thisTime, sessionData);
          return;
        }

        // Handle audio playback based on session progress
        await this.handleSessionAudio(sessionData, thisTime);

        // Update countdown message
        await this.updateCountdownMessage(sessionData, thisTime, minutesLeft);

        // Complete session when timer reaches 0 (60 minutes)
        if (minutesLeft === 0) {
          console.log(`🎯 [VoiceStateManager] Session completed for ${thisTime.member.user.tag} - session #${sessionData.sessionCounter}`);
          
          // Give database earnings (1 MĐC per hour)
          try {
            await this.prismaService.addVoiceEarnings(thisTime.member.user.id, 1);
            console.log(`💰 [VoiceStateManager] Awarded 1 MĐC to ${thisTime.member.user.tag} for completing session #${sessionData.sessionCounter}`);
          } catch (error) {
            console.error(`❌ [VoiceStateManager] Error awarding earnings to ${thisTime.member.user.tag}:`, error);
          }
          
          await this.completeSession(sessionData, thisTime);
          minutesLeft = CONFIG.TIME.SESSION_DURATION; // Reset to 60 minutes
          sessionData.minutesInCurrentSession = 0; // Reset current session minutes
          sessionData.lastEarningsTime = Date.now(); // Update earnings time
        }

      } catch (error) {
        console.error(`❌ [VoiceStateManager] Countdown timer error for ${thisTime.member.user.tag}:`, error);
        console.error(`❌ [VoiceStateManager] Error stack:`, error.stack);
      }
    }, CONFIG.TIME.COUNTDOWN_INTERVAL);
  }

  // Handle audio playback during session
  async handleSessionAudio(sessionData, thisTime) {
    const { totalMinutes } = sessionData;

    if (!sessionData.break30AudioPlayed && totalMinutes === CONFIG.TIME.BREAK_WARNING_TIME) {
      sessionData.break30AudioPlayed = true;
      console.log(`?? [VoiceStateManager] Playing 3h30m break audio for ${thisTime.member.user.tag}`);
      await voiceService.playAudio(sessionData.currentChannel, CONFIG.AUDIO.BREAK_30MIN);
    } else if (!sessionData.break4AudioPlayed && totalMinutes === FOUR_HOUR_MARK) {
      sessionData.break4AudioPlayed = true;
      console.log(`?? [VoiceStateManager] Playing 4h completion audio for ${thisTime.member.user.tag}`);
      await voiceService.playAudio(sessionData.currentChannel, CONFIG.AUDIO.BREAK_4HOUR);
    }
  }

  // Update countdown message based on session progress
  async updateCountdownMessage(sessionData, thisTime, minutesLeft) {
    if (!sessionData.countdownMessage) return;

    try {
      const totalMinutes = sessionData.totalMinutes;
      let messageContent;

      if (!sessionData.break30MessageSent && totalMinutes === CONFIG.TIME.BREAK_WARNING_TIME) {
        sessionData.break30MessageSent = true;
        messageContent = MESSAGES.VOICE.BREAK_WARNING_3H30(
          thisTime.member.displayName,
          minutesLeft
        );
      } else if (!sessionData.break4MessageSent && totalMinutes === FOUR_HOUR_MARK) {
        sessionData.break4MessageSent = true;
        const totalHours = Math.floor(totalMinutes / 60);
        const totalMins = totalMinutes % 60;
        messageContent = MESSAGES.VOICE.BREAK_WARNING_4H(
          thisTime.member.displayName,
          sessionData.coin,
          totalHours,
          totalMins
        );
      } else {
        messageContent = MESSAGES.VOICE.COUNTDOWN(thisTime.member.displayName, minutesLeft);
      }

      await sessionData.countdownMessage.edit(messageContent);
    } catch (error) {
      console.error(`❌ Failed to edit countdown message for ${thisTime.member.user.id}:`, error.message);
    }
  }

  // Complete a study session
  async completeSession(sessionData, thisTime) {
    sessionData.coin++;
    sessionData.sessionCounter++;

    await sessionData.currentChannel.send(
      MESSAGES.VOICE.SESSION_COMPLETE(thisTime.member.displayName)
    );

    const totalHours = Math.floor(sessionData.totalMinutes / 60);
    const totalMins = sessionData.totalMinutes % 60;

    console.log(MESSAGES.LOG.SESSION_COMPLETED(
      thisTime.member.user.id,
      sessionData.sessionCounter - 1,
      sessionData.sessionCounter,
      totalHours,
      totalMins
    ));
  }

  // Kick user after maximum study time
  async kickUserAfterMaxTime(thisTime, sessionData) {
    await sessionData.currentChannel.send(
      MESSAGES.VOICE.KICK_WARNING(thisTime.member.displayName)
    );

    try {
      await thisTime.member.voice.disconnect('Đã học quá 4 giờ - cần nghỉ ngơi!');
      console.log(MESSAGES.LOG.USER_KICKED_4H(thisTime.member.user.tag));
    } catch (kickError) {
      console.error(`❌ Failed to kick user ${thisTime.member.user.id}:`, kickError);
    }
  }

  // Handle user leaving voice channel
  async handleUserLeaveVoice(userId) {
    console.log(MESSAGES.LOG.CLEANUP_INTERVALS(userId));
    // Cleanup is already done by forceCleanupUser at the beginning
  }

  // Force cleanup user session data
  async forceCleanupUser(userId) {
    const existingData = this.channelSession.get(userId);
    if (existingData) {
      console.log(`🧹 [VoiceStateManager] Force cleaning up existing session for user ${userId}`);
      console.log(`📊 [VoiceStateManager] Session data being cleaned:`, {
        sessionCounter: existingData.sessionCounter,
        totalMinutes: existingData.totalMinutes,
        minutesInCurrentSession: existingData.minutesInCurrentSession || 0,
        coin: existingData.coin
      });
      
      // Clear timers - ONLY the countdownTimer now (unified)
      if (existingData.countdownTimer) {
        clearInterval(existingData.countdownTimer);
        console.log(`⏰ [VoiceStateManager] Cleared unified countdown timer for ${userId}`);
      }
      
      // Legacy timer cleanup (in case old sessions still have it)
      if (existingData.timer) {
        clearInterval(existingData.timer);
        console.log(`⏲️ [VoiceStateManager] Cleared legacy timer for ${userId}`);
      }

      // Delete countdown message
      if (existingData.countdownMessage) {
        await existingData.countdownMessage.delete().catch(error => {
          console.error(`❌ [VoiceStateManager] Failed to delete countdown message for ${userId}:`, error.message);
        });
        console.log(`💬 [VoiceStateManager] Deleted countdown message for ${userId}`);
      }

      // Remove from session map
      this.channelSession.delete(userId);
      
      console.log(MESSAGES.LOG.FORCE_CLEANUP(userId, existingData));
      console.log(`📊 [VoiceStateManager] Sessions after cleanup: ${this.channelSession.size}`);
    } else {
      console.log(`ℹ️ [VoiceStateManager] No existing session found for user ${userId} - nothing to clean`);
    }
  }

  // Get session data for debugging
  getSessionData(userId) {
    return this.channelSession.get(userId);
  }

  // Get active sessions count
  getActiveSessionsCount() {
    return this.channelSession.size;
  }

  // Cleanup all sessions (for bot shutdown)
  cleanup() {
    for (const [userId, sessionData] of this.channelSession) {
      if (sessionData.countdownTimer) {
        clearInterval(sessionData.countdownTimer);
      }
      if (sessionData.timer) {
        clearInterval(sessionData.timer);
      }
    }
    this.channelSession.clear();
    console.log('🧹 VoiceStateManager cleanup completed');
  }
}

module.exports = VoiceStateManager;





