const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const UserService = require('../utils/prismaService');  // CHANGED: From dbHelpers to PrismaService

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Xem bảng xếp hạng thành viên học tập xuất sắc')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại bảng xếp hạng')
                .setRequired(false)
                .addChoices(
                    { name: '💎 MĐCoin hiện tại', value: 'balance' },
                    { name: '🎓 Tổng thời gian học', value: 'total_earned' }
                )
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Số lượng thành viên hiển thị (tối đa 20)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(20)
        ),

    async execute(interaction) {
        try {
            const type = interaction.options.getString('type') || 'balance';
            const limit = interaction.options.getInteger('limit') || 10;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Lấy dữ liệu leaderboard từ database
            const leaderboard = await interaction.client.prismaService.getLeaderboard(type, limit);

            if (leaderboard.length === 0) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#6A994E')
                    .setTitle('🎓 Study Community Leaderboard')
                    .setDescription('Cộng đồng học tập đang chờ những thành viên tích cực đầu tiên!')
                    .addFields({
                        name: '🟩 Hãy Là Người Đầu Tiên',
                        value: '• Tham gia voice channel học tập\n• Duy trì thói quen học tập\n• Xuất hiện trong bảng xếp hạng danh giá!',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'Study Community • Hành trình học tập bắt đầu từ đây' });

                await interaction.editReply({ embeds: [emptyEmbed] });
                return;
            }

            // Tạo description cho leaderboard với design mới
            let description = '';
            let topPerformers = ''; // For top 3 with special highlighting
            let otherMembers = ''; // For positions 4+

            const medals = ['🏅', '🥈', '🥉'];
            const rankEmojis = ['4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

            for (let i = 0; i < leaderboard.length; i++) {
                const user = leaderboard[i];
                const position = i + 1;

                // Lấy username từ Discord client
                // let username = user.user_id;
                const guild = interaction.guild;
                try {
                    const member = guild.members.cache.get(user.user_id);
                    const discordUser = await interaction.client.users.fetch(user.user_id);
                    username = discordUser.username;
                    if (member) {
                        username = member.displayName;
                    } else {
                        const discordUser = await interaction.client.users.fetch(user.user_id);
                        username = discordUser.username;
                    }
                } catch (error) {
                    // Nếu không lấy được username, giữ nguyên user_id
                    username = `User ${user.user_id.slice(-4)}`;
                }

                const value = type === 'balance' ? user.balance : user.total_earned;
                const displayValue = type === 'balance' ?
                    `${value.toLocaleString()} MĐC` :
                    `${value.toLocaleString()} MĐC (~${Math.floor(value / 12)} phút)`;

                if (position <= 3) {
                    // Top 3 get special treatment
                    topPerformers += `${medals[position - 1]} **${username}** - ${displayValue}\n\n`;
                } else {
                    // Others get standard treatment
                    const emoji = position <= 10 ? rankEmojis[position - 4] : `**${position}.**`;
                    otherMembers += `${emoji} ${username} - ${displayValue}\n\n`;
                }
            }

            description = topPerformers + (otherMembers ? '\n━━━━━━━━━━━━━━\n' + otherMembers : '');

            // Tạo embed với academic aesthetic
            const titleMap = {
                'balance': 'Bảng Xếp Hạng MĐCoin',
                'totalEarned': '🎓 Bảng Xếp Hạng Thời Gian Học'
            };

            const embed = new EmbedBuilder()
                .setColor('#386641') // Primary green for leaderboard
                .setTitle(`🏆 ${titleMap[type]}`)
                .setDescription(`**Top ${leaderboard.length} Thành Viên Xuất Sắc**\n\n${description}`)
                .setTimestamp()
                .setFooter({
                    text: `MDHH Community • Leaderboards${type === 'balance' ? ' Balance' : ' Study'}`,
                    iconURL: 'https://cdn.discordapp.com/emojis/1234567890.png'
                });

            // Add study streak indicator for total_earned type
            if (type === 'total_earned' && leaderboard.length > 0) {
                const topUser = leaderboard[0];
                const totalHours = Math.floor(topUser.total_earned / 720);
                embed.addFields({
                    name: '⭐ Kỷ Lục Hiện Tại',
                    value: `Thành viên hàng đầu đã học **${totalHours} giờ**!`,
                    inline: false
                });
            }

            // Thêm thông tin về user hiện tại nếu họ không có trong top
            try {
                const currentUserBalance = await interaction.client.prismaService.getUserBalance(interaction.user.id);
                if (currentUserBalance.exists) {
                    const currentUserValue = type === 'balance' ? currentUserBalance.balance : currentUserBalance.total_earned;

                    // Kiểm tra xem user có trong top không
                    const userInTop = leaderboard.find(u => u.user_id === interaction.user.id);

                    if (!userInTop && currentUserValue > 0) {
                        const displayValue = type === 'balance' ?
                            `${currentUserValue.toLocaleString()} MĐC` :
                            `${currentUserValue.toLocaleString()} MĐC (~${Math.floor(currentUserValue / 12)} phút)`;

                        embed.addFields({
                            name: '📍 Vị Trí Của Bạn',
                            value: `**${interaction.user.username}** - ${displayValue}`,
                            inline: false
                        });
                    }
                }
            } catch (error) {
                // Không hiển thị thông tin user nếu có lỗi
                console.error('Error getting current user position:', error);
            }

            // Thêm thông tin khuyến khích học tập
            embed.addFields({
                name: '🎯 Cách Tham Gia Bảng Xếp Hạng',
                value: '• Tham gia voice channel học tập (1 MĐC/1h)\n• Duy trì thói quen học tập đều đặn\n• Nhận gift từ các thành viên khác',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in leaderboard command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi')
                .setDescription('Có lỗi xảy ra khi tải bảng xếp hạng. Vui lòng thử lại sau.')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },
};
