// Configuration constants
const CONFIG = {
  // Voice Channel IDs
  VOICE_CHANNELS: {
    INTERMEDIATE_CHANNEL: '1357199605955039363', // Channel tạo phòng
    WELCOME_CHANNEL: '1420345924751855719'       // Channel chào mừng
  },

  // Time constants (in milliseconds)
  TIME: {
    MINUTE: 60 * 1000,           // 1 phút
    HOUR: 60 * 60 * 1000,        // 1 giờ
    COUNTDOWN_INTERVAL: 60 * 1000, // Interval countdown timer
    BREAK_WARNING_TIME: 210,      // 3h30m (210 phút)
    MAX_STUDY_TIME: 245,          // 4h5m (245 phút)
    SESSION_DURATION: 60          // 60 phút mỗi session
  },

  // Reward amounts
  REWARDS: {
    VOICE_HOURLY: 1,    // 1 MĐC mỗi giờ voice
    INVITE_BONUS: 3,    // 3 MĐC khi invite
    DAILY_CHECKIN: 1    // 1 MĐC daily checkin
  },

  // Audio files
  AUDIO: {
    BREAK_30MIN: '30.mp3',  // Audio cảnh báo 3h30m
    BREAK_4HOUR: '4.mp3'    // Audio cảnh báo 4h
  },

  // Bot activity status
  BOT_STATUS: 'Vào voicechat học đi mấy cậu ơi'
};

module.exports = CONFIG;