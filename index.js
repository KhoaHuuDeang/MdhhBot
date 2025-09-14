require('dotenv').config(); // Load biến môi trường
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js'); // Import Discord.js

const fs = require('node:fs');
const path = require('node:path');

const countDown = require('./utils/countDown');

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
        GatewayIntentBits.MessageContent         // Đọc nội dung tin nhắn
    ]
});

// Tạo collection để lưu commands
client.commands = new Collection();

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
    } else {
        console.log('look like guild id not exists, please check again')
    }

    //khởi tạo map, lưu thông tin user 
    const channelSession = new Map()

    // Lắng nghe sự kiện voice
    client.on('voiceStateUpdate', async (lastTime, thisTime) => {
        // ...existing code...
        // Lấy user trong discord
        const user = thisTime.member.user

        // có trong discord là 1 chuyện, database là 1 chuyện 
        UserService.getOrCreateUser(user.id)

        if (!user) return;
        if (user.bot) return; // Bỏ qua bot

        // có user trong database thì mới check được 
        let balance = await getUserBalance(user.id)

        // User join voice (standard) -  
        if (thisTime.channelId && (!lastTime.channelId || lastTime.channelId === '1357199605955039363')) {
            //lấy ra channel user join hiện tại
            let currentChannel = thisTime.channel

            // Xóa interval để cleanup tránh gọi infinite khi user out 
            // muốn xóa interval thì phải có timmer, giữ nó lại truyền vào channelSession
            const timmer = countDown(user.id) // New version with database integration

            let minutesLeft = 60;
            let countdownMessage = null
            let coin = 0;
            countdownMessage = await currentChannel.send(`<a:a_g_Cheer:1301431655503892531> Xinn chào bạn học ${thisTime.member.displayName}! Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay ! \n Bạn còn **${minutesLeft}** phút để nhận thưởng ! \n trong phiên học này bạn đã kiếm được ${coin} MĐCoin!`);
            const countdownTimer = setInterval(async () => {
                minutesLeft--
                await countdownMessage.edit(`<a:a_g_Cheer:1301431655503892531> Xin chào bạn học ${thisTime.member.displayName}! Từ bây giờ nếu bạn tham gia VC, mỗi 1 tiếng học sẽ quy đổi ra thành một 1MĐ Coin Yay ! \n Bạn còn **${minutesLeft}** phút để nhận thưởng ! \n trong phiên học này bạn đã kiếm được ${coin} MĐCoin!`);

                if (minutesLeft === 0) {
                    coin++
                    await currentChannel.send(`<a:a_b_gojotwerk:1288783436718411776> ${thisTime.member.displayName} +1 MĐCoin!`);
                    minutesLeft = 60; // Reset để đếm tiếp
                }
            }, 60 * 1000);

            channelSession.set(user.id, { currentChannel, timmer, balance, countdownTimer })
        }

        // User rời voice
        if (lastTime.channelId && !thisTime.channelId) {
            const data = channelSession.get(user.id);
            if (data) {
                clearInterval(data.countdownTimer); // stop UI countdown
                clearInterval(data.timmer);         // stop DB update
                channelSession.delete(user.id);
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

// Xử lý sự kiện slash command
client.on(Events.InteractionCreate, async interaction => {
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
            ephemeral: true
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