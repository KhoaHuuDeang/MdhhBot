const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Kiểm tra số dư MĐPoints của bạn hoặc người khác')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User muốn kiểm tra (để trống để xem balance của bạn)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Lấy target user (nếu không có thì dùng user hiện tại)
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const isOwnBalance = targetUser.id === interaction.user.id;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply({ ephemeral: isOwnBalance });

            // Lấy thông tin balance từ database
            const userBalance = await UserService.getUserBalance(targetUser.id);

            if (!userBalance.exists) {
                // User chưa có trong database - welcome design
                const embed = new EmbedBuilder()
                    .setColor('#6A994E') // Softer green for welcome message
                    .setTitle('🎓 Chào Mừng Đến Study Community!')
                    .setDescription(`${isOwnBalance ? 'Bạn' : targetUser.username} chưa bắt đầu hành trình học tập.`)
                    .addFields(
                        {
                            name: '💎 Balance Hiện Tại',
                            value: '**0 MĐC**',
                            inline: false
                        },
                        {
                            name: '🎯 Bắt Đầu Ngay',
                            value: '• Tham gia voice channel học tập\n• Kiếm 1 MĐC mỗi 1 giờ\n• Xây dựng thói quen học tập tốt',
                            inline: false
                        }
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp()
                    .setFooter({ text: 'Study Community • Hãy bắt đầu học tập!' });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Calculate spent amount
            const spentAmount = userBalance.total_earned - userBalance.balance;

            // Tạo embed hiển thị thông tin balance với design mới
            const embed = new EmbedBuilder()
                .setColor('#386641') // Primary green for financial info
                .setTitle(`💰 MĐCoins ${targetUser.username} đang có : **${userBalance.balance.toLocaleString()} MĐC** `)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp()
                .setFooter({
                    text: 'Cộng đồng MDHH • MĐCoin System',
                    iconURL: 'https://cdn.discordapp.com/emojis/1234567890.png' // Optional: study icon
                });

            // Add secondary information in softer green
            embed.addFields(
                {
                    name: '📈 Tổng Đã Kiếm',
                    value: `${userBalance.total_earned.toLocaleString()} MĐC`,
                    inline: true
                },
                {
                    name: '📊 Đã Sử Dụng',
                    value: `${spentAmount.toLocaleString()} MĐC`,
                    inline: true
                },
                {
                    name: '⏱️ Thời Gian Học',
                    value: `~${Math.floor(userBalance.total_earned / 12)} phút`,
                    inline: true
                }
            );

            // Thêm thông tin hướng dẫn cho người dùng mới
            if (isOwnBalance && userBalance.balance === 0) {
                embed.setColor('#6A994E'); // Softer green for new users
                embed.addFields({
                    name: '🎓 Hướng Dẫn Kiếm MĐCoin',
                    value: '• Tham gia bất kỳ VC học tập nào trên hệ thống (1 MĐC/1h)\n• Nhận gift từ các thành viên khác\n• Tích cực tham gia hoạt động cộng đồng',
                    inline: false
                });
            }

            // Thêm progress bar cho việc học tập (visual engagement)
            if (userBalance.total_earned > 0) {
                const studyHours = Math.floor(userBalance.total_earned / 720); // 720 = 60*12 (1 hour)
                let progressBar = '';
                const barLength = 10;
                const progress = Math.min(studyHours / 10, 1); // Max at 10 hours for full bar
                const filledBars = Math.floor(progress * barLength);

                for (let i = 0; i < barLength; i++) {
                    progressBar += i < filledBars ? '🟢' : '⚫';
                }

                embed.addFields({
                    name: '📚 Tiến Độ Học Tập',
                    value: `${progressBar} ${studyHours}h`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in balance command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi')
                .setDescription('Có lỗi xảy ra khi kiểm tra balance. Vui lòng thử lại sau.')
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};