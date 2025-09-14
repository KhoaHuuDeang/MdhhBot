const UserService = require('./dbHelpers');

module.exports = function countDown( userId) {
    return setInterval(async () => {
      await UserService.addVoiceEarnings(userId,1)
    }, 3600000);
}