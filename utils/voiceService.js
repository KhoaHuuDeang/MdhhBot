const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG, MESSAGES } = require('../constants');

class VoiceService {
  constructor() {
    this.activeConnections = new Map(); // Track active voice connections
    this.audioCooldowns = new Map();    // Prevent audio spam
  }

  // Helper function to play audio file in voice channel (with cooldown protection)
  async playAudio(channel, audioFile) {
    try {
      console.log(`🎵 [VoiceService] Attempting to play audio: ${audioFile} in channel: ${channel.name} (ID: ${channel.id})`);
      
      const cooldownKey = `${channel.id}-${audioFile}`;
      const now = Date.now();
      
      // Check cooldown (5 minutes between same audio in same channel)
      if (this.audioCooldowns.has(cooldownKey)) {
        const lastPlayed = this.audioCooldowns.get(cooldownKey);
        const timeSinceLastPlay = now - lastPlayed;
        const cooldownRemaining = (5 * 60 * 1000) - timeSinceLastPlay;
        
        if (timeSinceLastPlay < 5 * 60 * 1000) { // 5 minutes cooldown
          console.log(`🔇 [VoiceService] Audio ${audioFile} in cooldown for ${channel.name} - ${Math.round(cooldownRemaining/1000)}s remaining`);
          return;
        } else {
          console.log(`✅ [VoiceService] Cooldown expired for ${audioFile} in ${channel.name}`);
        }
      } else {
        console.log(`🆕 [VoiceService] First time playing ${audioFile} in ${channel.name}`);
      }

      // Check if user is in voice channel
      const voiceChannel = channel;
      if (!voiceChannel || voiceChannel.type !== 2) { // 2 = GUILD_VOICE
        console.log(MESSAGES.ERROR.NOT_VOICE_CHANNEL(channel.name));
        return;
      }

      // Check if already connected to this channel
      if (this.activeConnections.has(voiceChannel.id)) {
        console.log(`🚫 [VoiceService] Already connected to ${voiceChannel.name}, skipping audio. Active connections: ${this.activeConnections.size}`);
        return;
      }

      // Join voice channel
      console.log(`🔗 [VoiceService] Joining voice channel ${voiceChannel.name} (${voiceChannel.id})`);
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      // Track this connection
      this.activeConnections.set(voiceChannel.id, connection);
      console.log(`📊 [VoiceService] Active connections count: ${this.activeConnections.size}`);

      // Wait for connection to be ready
      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log(MESSAGES.LOG.VOICE_CONNECTION_READY(voiceChannel.name));
      });

      // Create audio player and resource
      const player = createAudioPlayer();
      const audioPath = path.join(__dirname, '..', audioFile);

      if (!fs.existsSync(audioPath)) {
        console.error(MESSAGES.ERROR.AUDIO_FILE_NOT_FOUND(audioFile));
        this.activeConnections.delete(voiceChannel.id);
        connection.destroy();
        return;
      }

      // Create audio resource
      const resource = createAudioResource(audioPath, {
        metadata: {
          title: audioFile,
        }
      });

      // Play audio
      player.play(resource);
      connection.subscribe(player);
      console.log(MESSAGES.LOG.AUDIO_PLAYING(audioFile, voiceChannel.name));

      // Set cooldown
      this.audioCooldowns.set(cooldownKey, now);
      console.log(`⏰ [VoiceService] Cooldown set for ${cooldownKey} - next play allowed at: ${new Date(now + 5 * 60 * 1000).toLocaleTimeString()}`);

      // Auto-disconnect after audio finishes
      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`🎵 [VoiceService] Audio player became idle for ${voiceChannel.name}`);
        this.activeConnections.delete(voiceChannel.id);
        connection.destroy();
        console.log(`📊 [VoiceService] Connection cleaned up. Active connections: ${this.activeConnections.size}`);
        console.log(MESSAGES.LOG.AUDIO_FINISHED(voiceChannel.name));
      });

      // Handle errors
      player.on('error', error => {
        console.error(`❌ [VoiceService] Audio player error in ${voiceChannel.name}:`, error);
        this.activeConnections.delete(voiceChannel.id);
        connection.destroy();
        console.log(`📊 [VoiceService] Error cleanup. Active connections: ${this.activeConnections.size}`);
      });

      // Handle connection errors
      connection.on('error', error => {
        console.error(`❌ [VoiceService] Voice connection error in ${voiceChannel.name}:`, error);
        this.activeConnections.delete(voiceChannel.id);
        connection.destroy();
        console.log(`📊 [VoiceService] Error cleanup. Active connections: ${this.activeConnections.size}`);
      });

      // Auto cleanup after 30 seconds (failsafe)
      setTimeout(() => {
        if (this.activeConnections.has(voiceChannel.id)) {
          console.log(`⏰ [VoiceService] 30s timeout reached for ${voiceChannel.name} - force cleanup`);
          this.activeConnections.delete(voiceChannel.id);
          connection.destroy();
          console.log(`🧹 [VoiceService] Force cleanup audio connection for ${voiceChannel.name}. Active connections: ${this.activeConnections.size}`);
        }
      }, 30000);

    } catch (error) {
      console.error(`❌ [VoiceService] Failed to play audio ${audioFile} in ${channel.name}:`, error);
      console.error(`❌ [VoiceService] Error stack:`, error.stack);
      if (channel.send) {
        await channel.send(MESSAGES.ERROR.AUDIO_PLAYBACK_ERROR(error.message));
      }
    }
  }

  // Clean up all connections
  cleanup() {
    for (const [channelId, connection] of this.activeConnections) {
      connection.destroy();
    }
    this.activeConnections.clear();
    console.log('🧹 VoiceService cleanup completed');
  }

  // Get active connections count (for debugging)
  getActiveConnectionsCount() {
    return this.activeConnections.size;
  }
}

module.exports = new VoiceService();