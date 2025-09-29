module.exports = function countDown(userId, prismaServiceInstance) {
    let attemptCount = 0;
    const maxRetries = 3;
    
    return setInterval(async () => {
        try {
            console.log(`⏰ [${userId}] Processing voice earning...`);
            const startTime = Date.now();
            
            await prismaServiceInstance.addVoiceEarnings(userId, 1);  // CHANGED: Using instance
            
            const duration = Date.now() - startTime;
            console.log(`✅ [${userId}] Voice earning successful in ${duration}ms`);
            attemptCount = 0; // Reset on success
            
        } catch (error) {
            attemptCount++;
            console.error(`❌ [${userId}] Voice earning failed (attempt ${attemptCount}/${maxRetries}):`, error.message);
            
            // Don't stop timer - retry on next interval
            if (attemptCount >= maxRetries) {
                console.error(`🔥 [${userId}] Max retries reached, but timer continues...`);
                attemptCount = 0; // Reset for next cycle
            }
        }
    }, 3600000);
};