require('dotenv').config(); // Load biến môi trường
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Đọc tất cả command files
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

try {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Command at ${filePath} is missing "data" or "execute" property.`);
        }
    }
} catch (error) {
    console.error('❌ Error reading commands directory:', error);
    process.exit(1);
}

// Tạo REST instance
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands function
async function deployCommands() {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        // Kiểm tra environment variables
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('DISCORD_TOKEN is not set in environment variables');
        }
        if (!process.env.DISCORD_CLIENT_ID) {
            throw new Error('DISCORD_CLIENT_ID is not set in environment variables');
        }

        // Deploy commands globally hoặc guild-specific
        let data;

        if (process.env.DISCORD_GUILD_ID) {
            // Guild-specific deployment (for development)
            console.log(`🔧 Deploying commands to guild: ${process.env.DISCORD_GUILD_ID}`);
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
                { body: commands }
            );
        } else {
            // Global deployment (for production)
            console.log('🌍 Deploying commands globally...');
            data = await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                { body: commands }
            );
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);

        // Hiển thị danh sách commands đã deploy
        console.log('\n📋 Deployed commands:');
        data.forEach(command => {
            console.log(`   • /${command.name} - ${command.description}`);
        });

    } catch (error) {
        console.error('❌ Error deploying commands:', error);

        if (error.code === 50001) {
            console.error('   → Bot missing access. Check bot permissions and guild ID.');
        } else if (error.code === 50013) {
            console.error('   → Bot missing permissions. Check bot has application.commands scope.');
        } else if (error.status === 401) {
            console.error('   → Invalid bot token. Check DISCORD_TOKEN in .env file.');
        }

        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--delete') || args.includes('-d')) {
    // Delete all commands
    (async () => {
        try {
            console.log('🗑️ Deleting all application commands...');

            if (process.env.DISCORD_GUILD_ID) {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
                    { body: [] }
                );
            } else {
                await rest.put(
                    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
                    { body: [] }
                );
            }

            console.log('✅ Successfully deleted all application commands.');
        } catch (error) {
            console.error('❌ Error deleting commands:', error);
        }
    })();
} else {
    // Deploy commands
    deployCommands();
}

// Script usage help
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📖 Command Deployment Script Usage:

Basic deployment:
   node deploy-commands.js

Delete all commands:
   node deploy-commands.js --delete
   node deploy-commands.js -d

Show help:
   node deploy-commands.js --help
   node deploy-commands.js -h

Environment Variables Required:
   DISCORD_TOKEN      - Your bot token
   DISCORD_CLIENT_ID  - Your bot application ID
   DISCORD_GUILD_ID   - Guild ID for development (optional)

Note: If DISCORD_GUILD_ID is set, commands will be deployed to that specific guild.
      If not set, commands will be deployed globally (takes up to 1 hour to update).
    `);
}