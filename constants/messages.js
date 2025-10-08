// Message templates để dễ bảo trì
const MESSAGES = {
  // Voice Channel Messages
  VOICE: {
    WELCOME: (displayName) => 
      `<a:a_g_Cheer:1301431655503892531> Xinn chào bạn học ${displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay !`,
    
    WELCOME_SWITCH: (displayName, channelName) => 
      `🔄 Chào ${displayName}! Bạn đã chuyển sang **${channelName}** - Tiếp tục kiếm MĐCoin! 🎯`,
    
    COUNTDOWN: (displayName, minutesLeft) => 
      `<a:a_g_Cheer:1301431655503892531> Xin chào bạn học ${displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay \n Bạn còn ${minutesLeft} phút để nhận thưởng`,
    
    SESSION_COMPLETE: (displayName) => 
      `<a:a_b_gojotwerk:1288783436718411776> ${displayName} +1 MĐCoin! (Hoàn thành phiên học)`,
    
    BREAK_WARNING_3H30: (displayName, minutesLeft) => 
      `<:p_tinhtam:1385515547990687755> Bạn đã học được 3 tiếng 30p, ${displayName} - còn ${minutesLeft} phút nữa để giải lao`,
    
    BREAK_WARNING_4H: (displayName, totalCoin, totalHours, totalMinutes) => 
      `<:p_tinhtam:1385515547990687755> Chúc mừng bạn đã hoàn thành 4 tiếng học liên tục, ${displayName} hãy nghỉ nghơi và ra ngoài chạm cỏ đi nhé !\n trong phiên học này bạn đã kiếm được ${totalCoin} MĐCoin - Tổng: ${totalHours}h${totalMinutes}m`,
    
    KICK_WARNING: (displayName) => 
      `<:p_tinhtam:1385515547990687755>**Bạn đã học liên tục 4 tiếng rồi đấy !,** ${displayName}  Hãy nghỉ ngơi! và ra ngoài chạm cỏ đi nhé`
  },

  // Invite Messages
  INVITE: {
    WELCOME_WITH_INVITER: (member, guild, inviter, code) => 
      `Chào mừng ${member} đến với ${guild}!\nĐược mời bởi: ${inviter} (+3 MĐCoin) YAY !!! \nInvite code: \`${code}\``,
    
    WELCOME_GENERIC: (member, guild) => 
      `🎉 Chào mừng ${member} đến với ${guild}!`,
    
    REWARD_DM: (memberTag, code) => 
      `**Chúc mừng!** Bạn vừa nhận được **3 MĐCoin** vì đã mời ${memberTag} tham gia server!\nInvite code: \`${code}\``
  },

  // Error Messages
  ERROR: {
    COMMAND_EXECUTION: 'Có lỗi xảy ra khi thực hiện command này!',
    AUDIO_FILE_NOT_FOUND: (audioFile) => `File âm thanh không tồn tại: ${audioFile}`,
    AUDIO_PLAYBACK_ERROR: (error) => `Lỗi khi phát âm thanh: ${error}`,
    NOT_VOICE_CHANNEL: (channelName) => `Cannot play audio: ${channelName} is not a voice channel`
  },

  // Log Messages  
  LOG: {
    BOT_ONLINE: '🚀 Bot is online!',
    BOT_SERVE_USERS: (userCount) => `Bot serve for ${userCount} users`,
    DATABASE_CONNECTED: '✅ Database connection managed by Prisma ORM',
    GUILD_CONNECTED: (guildName, memberCount) => `✅ Bot is on ${guildName} - 📈 Guild has ${memberCount} members`,
    INVITE_MANAGER_INITIALIZED: '✅ Invite manager initialized successfully',
    COMMAND_LOADED: (commandName) => `✅ Loaded command: ${commandName}`,
    COMMAND_EXECUTED: (commandName, username) => `✅ Command ${commandName} executed by ${username}`,
    
    VOICE_STATE_UPDATE: (oldChannel, newChannel) => `Voice state updated: ${oldChannel} -> ${newChannel}`,
    FORCE_CLEANUP: (userId, sessionData) => `🧹 Force cleanup for ${userId} before processing voice update - preserved session: ${sessionData.sessionCounter || 0}, total time: ${Math.floor((sessionData.totalMinutes || 0) / 60)}h${(sessionData.totalMinutes || 0) % 60}m`,
    CLEANUP_INTERVALS: (userId) => `Cleanup intervals for ${userId}`,
    USER_KICKED_4H: (userTag) => `⚠️ Kicked user ${userTag} after 4h5m of study time`,
    
    AUDIO_PLAYING: (audioFile, channelName) => `Playing audio: ${audioFile} in ${channelName}`,
    AUDIO_FINISHED: (channelName) => `Audio finished, disconnected from ${channelName}`,
    VOICE_CONNECTION_READY: (channelName) => `Voice connection ready in ${channelName}`,
    
    SESSION_COMPLETED: (userId, sessionNumber, nextSession, totalHours, totalMinutes) => 
      `📊 User ${userId} completed session #${sessionNumber}, now on session #${nextSession}, total time: ${totalHours}h${totalMinutes}m`
  }
};

module.exports = MESSAGES;