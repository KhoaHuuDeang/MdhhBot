const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Lấy link mời để nhận 3 MĐCoin cho mỗi người tham gia'),
                
    async execute(interaction) {
        try {
            // Check if user can create invites
            if (!interaction.member.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
                return await interaction.reply({
                    content: '❌ Bạn không có quyền tạo link mời!',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Fixed settings: 7 days, unlimited uses
            const maxUses = 0; // 0 = unlimited
            const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

            // Get a suitable channel to create invite from
            const targetChannel = interaction.guild.systemChannel || 
                                 interaction.guild.channels.cache.find(c => 
                                     c.type === 0 && // Text channel
                                     c.permissionsFor(interaction.guild.members.me)
                                        .has(PermissionFlagsBits.CreateInstantInvite)
                                 ) ||
                                 interaction.channel;

            if (!targetChannel) {
                return await interaction.reply({
                    content: '❌ Không tìm thấy channel phù hợp để tạo invite!',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Create the invite
            const invite = await targetChannel.createInvite({
                maxAge: maxAge,
                maxUses: maxUses,
                unique: true, // Create a unique invite even if one with same settings exists
                reason: `Invite created by ${interaction.user.tag} for referral rewards`
            });

            // Create embed with invite info
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🔗 Link Mời Của Bạn')
                .setDescription(
                    `**${invite.url}**\n\n` +
                    `🎯 **Cách sử dụng:**\n` +
                    `1. Copy link trên\n` +
                    `2. Share với bạn bè\n` +
                    `3. Nhận **3 MĐCoin** mỗi người join! 💎\n\n`
                )
                .addFields(
                    { name: '💫 Code', value: `\`${invite.code}\``, inline: true },
                    { name: '⏰ Hết hạn', value: `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>`, inline: true },
                    { name: '🎁 Phần thưởng', value: '**3 MĐCoin** mỗi invite', inline: true }
                )
                .setFooter({ 
                    text: `Link của ${interaction.user.tag} • Không giới hạn lượt dùng • 7 ngày`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Lưu thông tin user thực tế vào database (override bot inviter)
            try {
                const { pool } = require('../db/database');
                await pool.query(`
                    INSERT INTO invites (code, inviter_id, uses, max_uses, expires_at, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    ON CONFLICT (code) DO UPDATE SET
                        inviter_id = $2,
                        uses = $3,
                        max_uses = $4,
                        expires_at = $5,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    invite.code,
                    interaction.user.id, // User thực tế, không phải bot
                    invite.uses || 0,
                    invite.maxUses || 0,
                    invite.expiresAt,
                    invite.createdAt
                ]);
                
                console.log(`📝 Saved invite ${invite.code} with real inviter: ${interaction.user.tag}`);
            } catch (dbError) {
                console.error('❌ Error saving invite to database:', dbError);
            }

            console.log(`✅ ${interaction.user.tag} created invite: ${invite.code} (7 days, unlimited uses)`);

        } catch (error) {
            console.error('❌ Error creating invite:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Lỗi Tạo Link Mời')
                .setDescription(
                    'Không thể tạo link mời. Có thể do:\n' +
                    '• Bot không có quyền tạo invite\n' +
                    '• Server đã đạt giới hạn invite\n' +
                    '• Lỗi kết nối Discord API'
                )
                .setFooter({ text: 'Vui lòng thử lại sau hoặc liên hệ admin' });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
