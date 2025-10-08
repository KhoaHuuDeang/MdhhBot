module.exports = function countDown(userId, prismaServiceInstance) {
    console.log(`⏰ [CountDown] Setting up earnings timer for user ${userId}`);
    return setInterval(async () => {
        try {
            console.log(`💰 [CountDown] Processing hourly earnings for user ${userId}`);
            await prismaServiceInstance.addVoiceEarnings(userId, 1);
            console.log(`✅ [CountDown] Earnings processed successfully for user ${userId}`);
        } catch (error) {
            console.error(`❌ [CountDown] Error processing earnings for user ${userId}:`, error);
        }
    }, 3600000);
};