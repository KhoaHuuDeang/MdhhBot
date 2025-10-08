require('dotenv').config(); // Load biến môi trường
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js'); // Import Discord.js
const fs = require('node:fs');
const path = require('node:path');

// Import services and constants
const { CONFIG, MESSAGES } = require('./constants');
const PrismaService = require('./utils/prismaService');
const VoiceStateManager = require('./utils/voiceStateManager');


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

// Initialize services
const prismaService = PrismaService;
const voiceStateManager = new VoiceStateManager(prismaService);
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
            console.log(MESSAGES.LOG.COMMAND_LOADED(command.data.name));
        } else {
            console.log(`⚠️ Command at ${filePath} is missing "data" or "execute" property.`);
        }
    }
} catch (error) {
    console.error('❌ Error loading commands:', error);
}

// Khi bot đã sẵn sàng
client.once('clientReady', async () => {
    console.log(MESSAGES.LOG.BOT_ONLINE); // Log trạng thái bot
    let user = client.users.cache.size // Số user đã cache
    console.log(MESSAGES.LOG.BOT_SERVE_USERS(user))

    // Prisma handles database connection automatically
    console.log(MESSAGES.LOG.DATABASE_CONNECTED);

    // Set trạng thái bot
    client.user.setActivity(CONFIG.BOT_STATUS, { type: 0 })

    // Xác nhận guild
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID)
    if (guild) {
        console.log(MESSAGES.LOG.GUILD_CONNECTED(guild.name, guild.memberCount));

        // Initialize invite manager - now part of PrismaService
        try {
            await prismaService.initializeInviteCache(guild, client);
            console.log(MESSAGES.LOG.INVITE_MANAGER_INITIALIZED);
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
        console.log(`👋 [Main] New member joined: ${member.user.tag} (${member.user.id})`);

        // Skip bots
        if (member.user.bot) {
            console.log(`🤖 [Main] Skipping bot user: ${member.user.tag}`);
            return;
        }

        try {
            // Ensure new user exists in database
            console.log(`💾 [Main] Creating/ensuring user ${member.user.tag} exists in database`);
            await prismaService.getOrCreateUser(member.user.id);

            // Find which invite was used - now in PrismaService
            console.log(`🔍 [Main] Looking for used invite for ${member.user.tag}`);
            const usedInvite = await prismaService.findUsedInvite(member.guild);

            if (usedInvite && usedInvite.inviter) {
                console.log(`🎯 [Main] Found invite used by ${member.user.tag}: code ${usedInvite.code} by ${usedInvite.inviter.tag}`);
                
                // Don't reward self-invites
                if (usedInvite.inviter.id === member.user.id) {
                    console.log(`🚫 [Main] Self-invite detected for ${member.user.tag}, no reward given`);
                    return;
                }

                // Don't reward bot invites
                if (usedInvite.inviter.bot) {
                    console.log(`🚫 [Main] Bot invite detected (${usedInvite.inviter.tag}), no reward given`);
                    return;
                }

                // Reward the inviter - now in PrismaService
                console.log(`💰 [Main] Rewarding inviter ${usedInvite.inviter.tag} with ${CONFIG.REWARDS.INVITE_BONUS} MĐC`);
                await prismaService.rewardInviter(
                    usedInvite.inviter,
                    member,
                    usedInvite.code,
                    CONFIG.REWARDS.INVITE_BONUS // Use constant instead of hardcoded 3
                );

                // Send welcome message with inviter mention
                const welcomeChannel = member.guild.channels.cache.get(CONFIG.VOICE_CHANNELS.WELCOME_CHANNEL);

                if (welcomeChannel) {
                    console.log(`💬 [Main] Sending welcome message with inviter to ${welcomeChannel.name}`);
                    await welcomeChannel.send(
                        MESSAGES.INVITE.WELCOME_WITH_INVITER(member, member.guild.name, usedInvite.inviter, usedInvite.code)
                    );
                } else {
                    console.log(`❌ [Main] Welcome channel not found: ${CONFIG.VOICE_CHANNELS.WELCOME_CHANNEL}`);
                }

                // Send private notification to inviter
                try {
                    console.log(`💌 [Main] Sending DM to inviter ${usedInvite.inviter.tag}`);
                    await usedInvite.inviter.send(
                        MESSAGES.INVITE.REWARD_DM(member.user.tag, usedInvite.code)
                    );
                    console.log(`✅ [Main] DM sent successfully to ${usedInvite.inviter.tag}`);
                } catch (error) {
                    console.log(`📩 [Main] Could not send DM to ${usedInvite.inviter.tag}:`, error.message);
                }

            } else {
                console.log(`❓ [Main] Could not determine invite used by ${member.user.tag}`);

                // Send generic welcome message
                const welcomeChannel = member.guild.systemChannel ||
                    member.guild.channels.cache.find(c => c.name.includes('welcome') || c.name.includes('general'));

                if (welcomeChannel) {
                    console.log(`💬 [Main] Sending generic welcome message to ${welcomeChannel.name}`);
                    await welcomeChannel.send(
                        MESSAGES.INVITE.WELCOME_GENERIC(member, member.guild.name)
                    );
                } else {
                    console.log(`❌ [Main] No welcome channel found for generic message`);
                }
            }

        } catch (error) {
            console.error('❌ [Main] Error processing member join for invite tracking:', error);
            console.error('❌ [Main] Error stack:', error.stack);
        }
    });

    // Lắng nghe sự kiện voice state update với service manager
    client.on('voiceStateUpdate', async (lastTime, thisTime) => {
        try {
            console.log(`🎤 [Main] Voice state event received for ${thisTime.member.user.tag}`);
            await voiceStateManager.handleVoiceStateUpdate(lastTime, thisTime);
            console.log(`✅ [Main] Voice state event processed successfully for ${thisTime.member.user.tag}`);
        } catch (error) {
            console.error('❌ [Main] Error in voice state update:', error);
            console.error('❌ [Main] Error stack:', error.stack);
        }
    });
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
        console.log(MESSAGES.LOG.COMMAND_EXECUTED(interaction.commandName, interaction.user.username));
    } catch (error) {
        // Nếu lỗi, log và trả về thông báo lỗi cho user
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);

        const errorMessage = {
            content: MESSAGES.ERROR.COMMAND_EXECUTION,
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

// Cleanup on bot shutdown
process.on('SIGINT', () => {
    console.log('🛑 [Main] Bot shutdown initiated via SIGINT...');
    console.log('🧹 [Main] Starting cleanup process...');
    voiceStateManager.cleanup();
    console.log('🔌 [Main] Destroying Discord client...');
    client.destroy();
    console.log('✅ [Main] Bot shutdown completed');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 [Main] Bot termination initiated via SIGTERM...');
    console.log('🧹 [Main] Starting cleanup process...');
    voiceStateManager.cleanup();
    console.log('🔌 [Main] Destroying Discord client...');
    client.destroy();
    console.log('✅ [Main] Bot termination completed');
    process.exit(0);
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN)