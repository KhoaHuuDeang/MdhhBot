const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const PrismaService = require('../utils/prismaService');  // UNIFIED: All functions in one service

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-stats')
        .setDescription('Xem thống kê invite và phần thưởng của bạn hoặc người khác')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người dùng cần xem thống kê (mặc định là bạn)')
                .setRequired(false)),
                
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const isOwnStats = targetUser.id === interaction.user.id;
            
            // Lấy member objects để có displayName
            let targetMember;
            if (isOwnStats) {
                targetMember = interaction.member;
            } else {
                targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            }
            
            const targetDisplayName = targetMember?.displayName || targetUser.username;
            const currentUserDisplayName = interaction.member?.displayName || interaction.user.username;
            
            await interaction.deferReply({ flags: isOwnStats ? MessageFlags.Ephemeral : undefined });

            // Get invite manager instance (we'll need to access it from the client)
            const inviteManager = interaction.client.inviteManager;
            
            if (!inviteManager || !inviteManager.isInitialized()) {
                return await interaction.editReply({
                    content: '❌ Hệ thống invite chưa được khởi tạo. Vui lòng thử lại sau!',
                });
            }

            // Get invite statistics - now from unified PrismaService
            const stats = await interaction.client.prismaService.getUserInviteStats(targetUser.id);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(isOwnStats ? 0x00ff00 : 0x3498db)
                .setTitle(`📊 Thống Kê Invite${isOwnStats ? '' : ` - ${targetDisplayName}`}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { 
                        name: 'Tổng Lời Mời Thành Công', 
                        value: `**${stats.totalInvites}** người`, 
                        inline: true 
                    },
                    { 
                        name: 'Tổng MĐCoin Nhận Được', 
                        value: `**${stats.totalRewards}** MĐCoin`, 
                        inline: true 
                    },
                    { 
                        name: 'Hiệu Suất', 
                        value: `**${stats.totalInvites * 3}** MĐC potential\n**${stats.totalRewards}** MĐC earned`, 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: isOwnStats ? 'Sử dụng /invite để tạo link mời mới!' : `Requested by ${currentUserDisplayName}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            // Add active invites section if user has any
            if (stats.activeInvites.length > 0) {
                const activeInvitesText = stats.activeInvites
                    .slice(0, 5) // Show max 5 most recent
                    .map(invite => {
                        const expiresText = invite.expires_at 
                            ? `<t:${Math.floor(new Date(invite.expires_at).getTime() / 1000)}:R>`
                            : 'Không bao giờ';
                        const usesText = invite.max_uses > 0 
                            ? `${invite.uses}/${invite.max_uses}`
                            : `${invite.uses}/∞`;
                        
                        return `\`${invite.code}\` - ${usesText} uses - Expires ${expiresText}`;
                    })
                    .join('\n');

                embed.addFields({
                    name: `🔗 Invite Links Đang Hoạt Động (${stats.activeInvites.length})`,
                    value: activeInvitesText || 'Không có invite nào đang hoạt động',
                    inline: false
                });

                if (stats.activeInvites.length > 5) {
                    embed.setFooter({ 
                        text: `${embed.data.footer.text} • Showing 5/${stats.activeInvites.length} invites` 
                    });
                }
            }

            // Add tips for improvement if stats are low
            if (isOwnStats && stats.totalInvites < 5) {
                embed.addFields({
                    name: '💡 Mẹo Tăng Invite',
                    value: 
                        '• Chia sẻ link trên mạng xã hội\n' +
                        '• Mời bạn bè trong lớp học\n' +
                        '• Tham gia group học tập\n' +
                        '• Tạo invite với thời hạn dài hơn',
                    inline: false
                });
            }

            // Show ranking if stats are good
            if (stats.totalInvites > 0) {
                try {
                    const leaderboard = await inviteManager.getInviteLeaderboard(100);
                    const userRank = leaderboard.findIndex(entry => entry.inviter_id === targetUser.id) + 1;
                    
                    if (userRank > 0) {
                        embed.addFields({
                            name: '🏆 Thứ Hạng',
                            value: `**#${userRank}** trong top inviter`,
                            inline: true
                        });
                    }
                } catch (error) {
                    console.error('Error getting invite ranking:', error);
                }
            }

            await interaction.editReply({ embeds: [embed] });

            console.log(`✅ ${currentUserDisplayName} checked invite stats for ${targetDisplayName}: ${stats.totalInvites} invites, ${stats.totalRewards} rewards`);

        } catch (error) {
            console.error('❌ Error getting invite stats:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Lỗi Lấy Thống Kê')
                .setDescription('Không thể lấy thống kê invite. Vui lòng thử lại sau!')
                .setFooter({ text: 'Nếu lỗi tiếp tục xảy ra, hãy liên hệ admin' });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};
