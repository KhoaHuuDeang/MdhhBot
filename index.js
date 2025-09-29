require('dotenv').config(); // Load biến môi trường
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js'); // Import Discord.js

const fs = require('node:fs');
const path = require('node:path');

const countDown = require('./utils/countDown');
const InviteManager = require('./utils/InviteManager');

const { initializeDatabase } = require('./db/database');
const { getUserBalance } = require('./utils/dbHelpers');
const UserService = require('./utils/dbHelpers');


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

// Initialize InviteManager
const inviteManager = new InviteManager(client);
// Expose inviteManager to client so commands can access it
client.inviteManager = inviteManager;

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

    // Initialize database
    try {
        await initializeDatabase();
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }

    // Set trạng thái bot
    // client.user.setActivity('Đang nấu con bot', { type: 0 }) // Old status
    client.user.setActivity('Vào voicechat học đi mấy cậu ơi', { type: 0 })

    // Xác nhận guild
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID)
    if (guild) {
        console.log(`✅ Bot is on  ${guild.name}`);
        console.log(`📈 Guild has ${guild.memberCount} members`);

        // Initialize invite manager
        try {
            await inviteManager.initializeCache(guild);
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
            await UserService.getOrCreateUser(member.user.id);

            // Find which invite was used
            const usedInvite = await inviteManager.findUsedInvite(member.guild);

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

                // Reward the inviter
                await inviteManager.rewardInviter(
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

    // Lắng nghe sự kiện voice
    client.on('voiceStateUpdate', async (lastTime, thisTime) => {
        console.log(`Voice state updated: ${lastTime.channelId} -> ${thisTime.channelId}`);
        // ...existing code...
        // Lấy user trong discord
        const user = thisTime.member.user

        // có trong discord là 1 chuyện, database là 1 chuyện 
        UserService.getOrCreateUser(user.id)

        if (!user) return;
        if (user.bot) return; // Bỏ qua bot

        // có user trong database thì mới check được 
        let balance = await getUserBalance(user.id)

        // User join voice (standard) - exclude intermediate channel
        if (thisTime.channelId && thisTime.channelId !== '1357199605955039363' && (!lastTime.channelId || lastTime.channelId === '1357199605955039363')) {
            //lấy ra channel user join hiện tại
            let currentChannel = thisTime.channel

            // Xóa interval để cleanup tránh gọi infinite khi user out 
            // muốn xóa interval thì phải có timmer, giữ nó lại truyền vào channelSession
            const timmer = countDown(user.id) // New version with database integration

            let minutesLeft = 60;
            let countdownMessage = null
            let coin = 0;
            countdownMessage = await currentChannel.send(`<a:a_g_Cheer:1301431655503892531> Xinn chào bạn học ${thisTime.member.displayName}! Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay ! \n Bạn còn **${minutesLeft}** phút để nhận thưởng ! \n trong phiên học này bạn đã kiếm được **${coin} MĐCoin!**`);
            const countdownTimer = setInterval(async () => {
                minutesLeft--
                await countdownMessage.edit(`<a:a_g_Cheer:1301431655503892531> Xin chào bạn học ${thisTime.member.displayName}! Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay ! \n Bạn còn **${minutesLeft}** phút để nhận thưởng ! \n trong phiên học này bạn đã kiếm được **${coin} MĐCoin!**`);

                if (minutesLeft === 0) {
                    coin++
                    await currentChannel.send(`<a:a_b_gojotwerk:1288783436718411776> ${thisTime.member.displayName} +1 MĐCoin!`);
                    minutesLeft = 60; // Reset để đếm tiếp
                }
            }, 60 * 1000);

            channelSession.set(user.id, { currentChannel, timmer, balance, countdownTimer, countdownMessage })
        }

        // User rời voice
        if (lastTime.channelId && !thisTime.channelId) {
            const data = channelSession.get(user.id);
            if (data) {
                clearInterval(data.countdownTimer); // stop UI countdown
                clearInterval(data.timmer);         // stop DB update
                channelSession.delete(user.id);
                if (data.countdownMessage) {
                    await data.countdownMessage.delete()
                }

                console.log(`Cleanup intervals for ${user.id}`);
            }
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
            flags: true
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