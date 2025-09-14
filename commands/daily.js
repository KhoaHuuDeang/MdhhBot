const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Điểm danh hàng ngày để nhận MĐCoin - streak bonus từ 1-7 MĐC!'),

    async execute(interaction) {
        try {
            const user = interaction.user;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Kiểm tra trạng thái checkin hiện tại
            const checkinStatus = await UserService.getDailyCheckinStatus(user.id);

            if (!checkinStatus.canCheckIn) {
                // User đã checkin hôm nay
                const embed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('⏰ Đã Điểm Danh Hôm Nay!')
                    .setDescription('Bạn đã điểm danh hôm nay rồi. Hãy quay lại vào ngày mai!')
                    .addFields(
                        {
                            name: '🔥 Streak Hiện Tại',
                            value: `**${checkinStatus.current_streak}/7** ngày`,
                            inline: true
                        },
                        {
                            name: '🎯 Tổng Điểm Danh',
                            value: `**${checkinStatus.total_checkins}** lần`,
                            inline: true
                        },
                        {
                            name: '🌅 Điểm Danh Tiếp Theo',
                            value: `**${Math.min(checkinStatus.current_streak + 1, 7)} MĐC** (${checkinStatus.current_streak + 1 > 7 ? 'Reset về 1' : 'Ngày ' + (checkinStatus.current_streak + 1)})`,
                            inline: true
                        }
                    )
                    .setThumbnail(user.displayAvatarURL())
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Daily Checkin System' });

                // Thêm progress bar
                let progressBar = '';
                for (let i = 1; i <= 7; i++) {
                    if (i <= checkinStatus.current_streak) {
                        progressBar += '🟢';
                    } else {
                        progressBar += '⚪';
                    }
                }

                embed.addFields({
                    name: '📊 Tiến Độ Tuần',
                    value: `${progressBar}\n**T2** **T3** **T4** **T5** **T6** **T7** **CN**`,
                    inline: false
                });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Xử lý daily checkin
            const result = await UserService.processDailyCheckin(user.id);

            // Tạo embed thành công
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle('🎉 Điểm Danh Thành Công!')
                .setDescription(`Chào mừng ngày mới! Bạn nhận được **${result.reward} MĐCoin** 🪙`)
                .addFields(
                    {
                        name: '🔥 Streak Hiện Tại',
                        value: `**${result.streak}/7** ngày liên tiếp`,
                        inline: true
                    },
                    {
                        name: '🎯 Tổng Điểm Danh',
                        value: `**${result.totalCheckins}** lần`,
                        inline: true
                    },
                    {
                        name: '💰 Đã Nhận',
                        value: `**+${result.reward} MĐC**`,
                        inline: true
                    }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Cảm ơn bạn đã tích cực!' });

            // Progress bar cho week streak
            let progressBar = '';
            for (let i = 1; i <= 7; i++) {
                if (i <= result.streak) {
                    progressBar += '🟢';
                } else {
                    progressBar += '⚪';
                }
            }

            embed.addFields({
                name: '📊 Tiến Độ Tuần',
                value: `${progressBar}\n**T2** **T3** **T4** **T5** **T6** **T7** **CN**`,
                inline: false
            });

            // Thông tin next day reward
            let nextReward = result.streak + 1;
            let nextLabel = `Ngày ${nextReward}`;

            if (nextReward > 7) {
                nextReward = 1;
                nextLabel = 'Reset về Ngày 1';
            }

            embed.addFields({
                name: '🌅 Ngày Mai Sẽ Nhận',
                value: `**${nextReward} MĐC** (${nextLabel})`,
                inline: false
            });

            // Thêm tips cho user
            if (result.streak === 1) {
                embed.addFields({
                    name: '💡 Mẹo Hay',
                    value: 'Điểm danh liên tiếp mỗi ngày để nhận thưởng tăng dần từ 1-7 MĐC! 🚀',
                    inline: false
                });
            } else if (result.streak === 7) {
                embed.addFields({
                    name: '🎊 Hoàn Thành Tuần!',
                    value: 'Bạn đã hoàn thành streak 7 ngày! Ngày mai sẽ bắt đầu tuần mới.',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in daily command:', error);

            let errorMessage = 'Có lỗi xảy ra khi xử lý điểm danh. Vui lòng thử lại sau.';

            if (error.message === 'Already checked in today') {
                errorMessage = 'Bạn đã điểm danh hôm nay rồi!';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi điểm danh')
                .setDescription(errorMessage)
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Daily System' });

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};