module.exports = function countDown(userId, prismaServiceInstance) {
    return setInterval(async () => {
            await prismaServiceInstance.addVoiceEarnings(userId, 1);  // CHANGED: Using instance
    }, 3600000);
};