require('dotenv').config(); // Load biến môi trường
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js'); // Import Discord.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ffmpegPath = require('ffmpeg-static');

const fs = require('node:fs');
const path = require('node:path');

const countDown = require('./utils/countDown');
const PrismaService = require('./utils/prismaService');  // UNIFIED: All functions in one service


// Tạo client Discord với intents cần thiết
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,                // Info server
        GatewayIntentBits.GuildMembers,          // Sự kiện thành viên
        GatewayIntentBits.GuildVoiceStates,      // Sự kiện voice
        GatewayIntentBits.GuildMessages,         // Đọc tin nhắn
        GatewayIntentBits.MessageContent,        // Đọc nội dung tin nhắn
        GatewayIntentBits.GuildInvites           // Theo dõi invite (NEW)
    ]
});

// Tạo collection để lưu commands
client.commands = new Collection();

// Initialize InviteManager - now part of PrismaService
// PrismaService is exported as singleton instance
const prismaService = PrismaService;
client.prismaService = prismaService;

// Load command files
const commandsPath = path.join(__dirname, 'commands');
try {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Command at ${filePath} is missing "data" or "execute" property.`);
        }
    }
} catch (error) {
    console.error('❌ Error loading commands:', error);
}

// Khi bot đã sẵn sàng
client.once('clientReady', async () => {
    console.log('🚀 Bot is online!'); // Log trạng thái bot
    let user = client.users.cache.size // Số user đã cache
    console.log('Bot serve for ', user, ' users ')

    // Prisma handles database connection automatically
    console.log('✅ Database connection managed by Prisma ORM');

    // Set trạng thái bot
    // client.user.setActivity('Đang nấu con bot', { type: 0 }) // Old status
    client.user.setActivity('Vào voicechat học đi mấy cậu ơi', { type: 0 })

    // Xác nhận guild
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID)
    if (guild) {
        console.log(`✅ Bot is on  ${guild.name}`);
        console.log(`📈 Guild has ${guild.memberCount} members`);

        // Initialize invite manager - now part of PrismaService
        try {
            await prismaService.initializeInviteCache(guild, client);
            console.log('✅ Invite manager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize invite manager:', error);
        }
    } else {
        console.log('look like guild id not exists, please check again')
    }

    //khởi tạo map, lưu thông tin user 
    const channelSession = new Map()

    // Event handler for new members (INVITE TRACKING)
    client.on('guildMemberAdd', async (member) => {
        console.log(`👋 New member joined: ${member.user.tag}`);

        // Skip bots
        if (member.user.bot) return;

        try {
            // Ensure new user exists in database
            await prismaService.getOrCreateUser(member.user.id);

            // Find which invite was used - now in PrismaService
            const usedInvite = await prismaService.findUsedInvite(member.guild);

            if (usedInvite && usedInvite.inviter) {
                // Don't reward self-invites
                if (usedInvite.inviter.id === member.user.id) {
                    console.log(`🚫 Self-invite detected for ${member.user.tag}, no reward given`);
                    return;
                }

                // Don't reward bot invites
                if (usedInvite.inviter.bot) {
                    console.log(`🚫 Bot invite detected (${usedInvite.inviter.tag}), no reward given`);
                    return;
                }

                // Reward the inviter - now in PrismaService
                await prismaService.rewardInviter(
                    usedInvite.inviter,
                    member,
                    usedInvite.code,
                    3 // 3 MĐCoin reward
                );

                // Send welcome message with inviter mention
                const welcomeChannel = member.guild.channels.cache.get('1420345924751855719');

                if (welcomeChannel) {
                    await welcomeChannel.send(
                        `Chào mừng ${member} đến với ${member.guild.name}!\n` +
                        `Được mời bởi: ${usedInvite.inviter} (+3 MĐCoin) YAY !!! \n` +
                        `Invite code: \`${usedInvite.code}\``
                    );
                }

                // Send private notification to inviter
                try {
                    await usedInvite.inviter.send(
                        `**Chúc mừng!** Bạn vừa nhận được **3 MĐCoin** vì đã mời ${member.user.tag} tham gia server!\n` +
                        `Invite code: \`${usedInvite.code}\``
                    );
                } catch (error) {
                    console.log(`📩 Could not send DM to ${usedInvite.inviter.tag}:`, error.message);
                }

            } else {
                console.log(`❓ Could not determine invite used by ${member.user.tag}`);

                // Send generic welcome message
                const welcomeChannel = member.guild.systemChannel ||
                    member.guild.channels.cache.find(c => c.name.includes('welcome') || c.name.includes('general'));

                if (welcomeChannel) {
                    await welcomeChannel.send(
                        `🎉 Chào mừng ${member} đến với ${member.guild.name}!`
                    );
                }
            }

        } catch (error) {
            console.error('❌ Error processing member join for invite tracking:', error);
        }
    });

    //khởi tạo map, lưu thông tin user

    // Helper function to play audio file in voice channel
    async function playAudio(channel, audioFile) {
        try {
            // Check if user is in voice channel
            const voiceChannel = channel;
            if (!voiceChannel || voiceChannel.type !== 2) { // 2 = GUILD_VOICE
                console.log(`Cannot play audio: ${channel.name} is not a voice channel`);
                return;
            }

            // Join voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            // Wait for connection to be ready
            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log(`Voice connection ready in ${voiceChannel.name}`);
            });

            // Create audio player and resource
            const player = createAudioPlayer();
            const audioPath = path.join(__dirname, audioFile);

            if (!fs.existsSync(audioPath)) {
                console.error(`Audio file not found: ${audioPath}`);
                await channel.send(`File âm thanh không tồn tại: ${audioFile}`);
                return;
            }

            // Use ffmpeg-static for audio processing
            const resource = createAudioResource(audioPath, {
                metadata: {
                    title: audioFile,
                }
            });

            // Play audio
            player.play(resource);
            connection.subscribe(player);
            console.log(`Playing audio: ${audioFile} in ${voiceChannel.name}`);

            // Auto-disconnect after audio finishes
            player.on(AudioPlayerStatus.Idle, () => {
                connection.destroy();
                console.log(`Audio finished, disconnected from ${voiceChannel.name}`);
            });

            // Handle errors
            player.on('error', error => {
                console.error(`Audio player error:`, error);
                connection.destroy();
            });

        } catch (error) {
            console.error(`Failed to play audio ${audioFile}:`, error);
            await channel.send(`Lỗi khi phát âm thanh: ${error.message}`);
        }
    }

    // Lắng nghe sự kiện voice
    client.on('voiceStateUpdate', async (lastTime, thisTime) => {
        console.log(`Voice state updated: ${lastTime.channelId} -> ${thisTime.channelId}`);
        // ...existing code...
        // Lấy user trong discord
        const user = thisTime.member.user

        // có trong discord là 1 chuyện, database là 1 chuyện 
        prismaService.getOrCreateUser(user.id)

        if (!user) return;
        if (user.bot) return; // Bỏ qua bot

        // có user trong database thì mới check được 
        let balance = await prismaService.getUserBalance(user.id)

        // ✅ GLOBAL CLEANUP FIRST - đảm bảo không có timer nào còn chạy cho user này
        // NEW: Lưu sessionCounter và totalMinutes trước khi cleanup
        let preservedSessionCounter = 1;
        let preservedTotalMinutes = 0;
        let preservedCoin = 0;

        const existingData = channelSession.get(user.id);
        if (existingData) {
            // NEW: Lưu dữ liệu quan trọng trước khi cleanup
            preservedSessionCounter = existingData.sessionCounter || 1;
            preservedTotalMinutes = existingData.totalMinutes || 0;
            preservedCoin = existingData.coin || 0;

            clearInterval(existingData.countdownTimer);
            clearInterval(existingData.timmer);
            if (existingData.countdownMessage) {
                await existingData.countdownMessage.delete().catch(console.error);
            }
            channelSession.delete(user.id);
            console.log(`🧹 Force cleanup for ${user.id} before processing voice update - preserved session: ${preservedSessionCounter}, total time: ${preservedTotalMinutes}m`);
        }

        // User join voice (standard) - exclude intermediate channel
        if (thisTime.channelId && thisTime.channelId !== '1357199605955039363' && (!lastTime.channelId || lastTime.channelId === '1357199605955039363')) {
            //lấy ra channel user join hiện tại
            let currentChannel = thisTime.channel

            // Xóa interval để cleanup tránh gọi infinite khi user out 
            // muốn xóa interval thì phải có timmer, giữ nó lại truyền vào channelSession
            const timmer = countDown(user.id, prismaService) // Pass prisma instance

            let minutesLeft = 60;
            let countdownMessage = null
            let coin = 0;
            let sessionCounter = 1; // NEW: Bộ đếm session bắt đầu từ 1
            let totalMinutes = 0; // NEW: Tổng số phút đã học
            countdownMessage = await currentChannel.send(`<a:a_g_Cheer:1301431655503892531> Xinn chào bạn học ${thisTime.member.displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay !`);
            const countdownTimer = setInterval(async () => {
                minutesLeft--;
                totalMinutes++; // NEW: Tăng tổng số phút

                try {
                    // NEW: Kiểm tra kick user ở 4h5p (245 phút)
                    if (totalMinutes >= 245) {
                        await currentChannel.send(`<:p_tinhtam:1385515547990687755>**Bạn đã học liên tục 4 tiếng rồi đấy !,** ${thisTime.member.displayName}  Hãy nghỉ ngơi! và ra ngoài chạm cỏ đi nhé`);
                        try {
                            await thisTime.member.voice.disconnect('Đã học quá 4 giờ - cần nghỉ ngơi!');
                            console.log(`⚠️ Kicked user ${user.tag} after 4h5m of study time`);
                        } catch (kickError) {
                            console.error(`❌ Failed to kick user ${user.id}:`, kickError);
                        }
                        return;
                    }

                    // NEW: Logic audio playback
                    if (sessionCounter === 30 && minutesLeft === 3) {
                        await playAudio(currentChannel, '30.mp3');
                        await countdownMessage.edit(`<:p_tinhtam:1385515547990687755> Bạn đã học được 3 tiếng 30p, ${thisTime.member.displayName} - còn ${minutesLeft} phút nữa để giải lao`);
                    } else if (sessionCounter === 4) {
                        await playAudio(currentChannel, '4.mp3');
                        await countdownMessage.edit(`<:p_tinhtam:1385515547990687755> Chúc mừng bạn đã hoàn thành 4 tiếng học liên tục, ${thisTime.member.displayName} hãy nghỉ nghơi và ra ngoài chạm cỏ đi nhé !\n trong phiên học này bạn đã kiếm được ${coin} MĐCoin (Phiên #${sessionCounter}) - Tổng: ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m`);
                    } else {
                        await countdownMessage.edit(`<a:a_g_Cheer:1301431655503892531> Xin chào bạn học ${thisTime.member.displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay \n Bạn còn ${minutesLeft} phút để nhận thưởng`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to edit countdown message for ${user.id}:`, error.message);
                    // Không crash bot nếu message edit fails
                }

                if (minutesLeft === 0) {
                    coin++;
                    sessionCounter++; // NEW: Tăng bộ đếm phiên
                    await currentChannel.send(`<a:a_b_gojotwerk:1288783436718411776> ${thisTime.member.displayName} +1 MĐCoin! (Hoàn thành phiên #${sessionCounter - 1})`);
                    minutesLeft = 60; // Reset để đếm tiếp
                    console.log(`📊 User ${user.id} completed session #${sessionCounter - 1}, now on session #${sessionCounter}, total time: ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m`);
                }
            }, 60 * 1000);

            channelSession.set(user.id, { currentChannel, timmer, balance, countdownTimer, countdownMessage, sessionCounter, totalMinutes, coin })
        }

        // User chuyển từ voice channel này sang voice channel khác (không qua intermediate channel)
        if (lastTime.channelId && thisTime.channelId &&
            lastTime.channelId !== '1357199605955039363' &&
            thisTime.channelId !== '1357199605955039363' &&
            lastTime.channelId !== thisTime.channelId) {

            console.log(`User ${user.tag} switching from ${lastTime.channelId} to ${thisTime.channelId}`);

            // ✅ Global cleanup đã được thực hiện ở đầu function, không cần cleanup riêng nữa
            // Note: Cleanup was already done at the start of this function to prevent multiple timers

            // Define currentChannel for the new channel user switched to
            let currentChannel = thisTime.channel;

            // Xóa interval để cleanup tránh gọi infinite khi user out 
            // muốn xóa interval thì phải có timmer, giữ nó lại truyền vào channelSession
            const timmer = countDown(user.id, prismaService) // Pass prisma instance

            // Start new session in new channel
            let minutesLeft = 60;
            let countdownMessage = null
            let coin = 0;
            let sessionCounter = 1; // NEW: Bộ đếm session bắt đầu từ 1
            let totalMinutes = 0; // NEW: Tổng số phút đã học
            countdownMessage = await currentChannel.send(`<a:a_g_Cheer:1301431655503892531> Xinn chào bạn học ${thisTime.member.displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay !`);
            const countdownTimer = setInterval(async () => {
                minutesLeft--;
                totalMinutes++; // NEW: Tăng tổng số phút

                try {
                    // NEW: Kiểm tra kick user ở 4h5p (245 phút)
                    if (totalMinutes >= 245) {
                        await currentChannel.send(`<:p_tinhtam:1385515547990687755>**Bạn đã học liên tục 4 tiếng rồi đấy !,** ${thisTime.member.displayName}  Hãy nghỉ ngơi! và ra ngoài chạm cỏ đi nhé`);
                        try {
                            await thisTime.member.voice.disconnect('Đã học quá 4 giờ - cần nghỉ ngơi!');
                            console.log(`⚠️ Kicked user ${user.tag} after 4h5m of study time`);
                        } catch (kickError) {
                            console.error(`❌ Failed to kick user ${user.id}:`, kickError);
                        }
                        return;
                    }

                    // NEW: Logic audio playback
                    if (sessionCounter === 30 && minutesLeft === 3) {
                        await playAudio(currentChannel, '30.mp3');
                        await countdownMessage.edit(`<:p_tinhtam:1385515547990687755> Bạn đã học được 3 tiếng 30p, ${thisTime.member.displayName} - còn ${minutesLeft} phút nữa để giải lao`);
                    } else if (sessionCounter === 4) {
                        await playAudio(currentChannel, '4.mp3');
                        await countdownMessage.edit(`<:p_tinhtam:1385515547990687755> Chúc mừng bạn đã hoàn thành 4 tiếng học liên tục, ${thisTime.member.displayName} hãy nghỉ nghơi và ra ngoài chạm cỏ đi nhé !\n trong phiên học này bạn đã kiếm được ${coin} MĐCoin (Phiên #${sessionCounter}) - Tổng: ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m`);
                    } else {
                        await countdownMessage.edit(`<a:a_g_Cheer:1301431655503892531> Xin chào bạn học ${thisTime.member.displayName} Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay \n Bạn còn ${minutesLeft} phút để nhận thưởng`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to edit countdown message for ${user.id}:`, error.message);
                    // Không crash bot nếu message edit fails
                }

                if (minutesLeft === 0) {
                    coin++;
                    sessionCounter++; // NEW: Tăng bộ đếm phiên
                    await currentChannel.send(`<a:a_b_gojotwerk:1288783436718411776> ${thisTime.member.displayName} +1 MĐCoin!`);
                    minutesLeft = 60; // Reset để đếm tiếp
                    console.log(`📊 User ${user.id} completed session #${sessionCounter - 1}, now on session #${sessionCounter}, total time: ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m`);
                }
            }, 60 * 1000);

            channelSession.set(user.id, { currentChannel, timmer, balance, countdownTimer, countdownMessage, sessionCounter, totalMinutes, coin });
        }

        // User rời voice
        if (lastTime.channelId && !thisTime.channelId) {
            // ✅ Global cleanup đã được thực hiện ở đầu function
            // Note: Cleanup was already done at the start of this function
            console.log(`Cleanup intervals for ${user.id}`);
        }

        // // Xác định user bấm vào sự kiện tạo phòng với id được quy ước như dưới 
        // if (lastTime.channel && lastTime.channel.id === '1357199605955039363') {
        //     let currentChannel = thisTime.channel
        //     let currentChannelVoice = thisTime.channel

        //     // Stop old session
        //     const oldSession = channelSession.get(user.id);
        //     if (oldSession) {
        //         clearInterval(oldSession.timmer);
        //     }

        //     // Start new session
        //     const timmer = countDown(user.id)

        //     currentChannelVoice.send(`${user.tag} chuyển từ **${lastChannelVoice.name}** sang **${currentChannelVoice.name}** - tiếp tục kiếm MĐCoin! 🎯`);
        //     channelSession.set(user.id, { currentChannel: currentChannelVoice, timmer, balance })
    })
})

// Xử lý sự kiện slash command và autocomplete
client.on(Events.InteractionCreate, async interaction => {
    // Xử lý autocomplete interactions
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found for autocomplete.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Error executing autocomplete for ${interaction.commandName}:`, error);
        }
        return;
    }

    // Chỉ xử lý lệnh chat input
    if (!interaction.isChatInputCommand()) return;

    // Lấy command từ collection
    const command = client.commands.get(interaction.commandName)

    // Nếu không tìm thấy command, log lỗi
    if (!command) {
        // cần xử yls chỗ này 
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        // Thực thi lệnh
        await command.execute(interaction);
        console.log(`✅ Command ${interaction.commandName} executed by ${interaction.user.username}`);
    } catch (error) {
        // Nếu lỗi, log và trả về thông báo lỗi cho user
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);

        const errorMessage = {
            content: 'Có lỗi xảy ra khi thực hiện command này!',
            flags: MessageFlags.Ephemeral
        };

        // Nếu đã reply hoặc defer, edit lại reply
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN)