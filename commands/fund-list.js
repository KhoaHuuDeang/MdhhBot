const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fund-list')
        .setDescription('Xem danh sách tất cả các quỹ hiện có'),

    async execute(interaction) {
        try {
            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Lấy danh sách các quỹ
            const funds = await UserService.getFundsList();

            if (funds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#6A994E')
                    .setTitle('🏛️ Danh Sách Quỹ')
                    .setDescription('Chưa có quỹ nào được tạo. Hãy tạo quỹ đầu tiên với `/fund-create`!')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Tạo embed hiển thị danh sách quỹ
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle('🏛️ Danh Sách Quỹ Hiện Có')
                .setDescription(`Có **${funds.length}** quỹ đang hoạt động`)
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund System' });

            // Thêm thông tin từng quỹ
            for (const fund of funds.slice(0, 10)) { // Giới hạn 10 quỹ để không quá dài
                const totalValue = fund.total_donated + fund.total_donated_vip;
                const createdDate = new Date(fund.created_at).toLocaleDateString('vi-VN');

                embed.addFields({
                    name: `💰 ${fund.name}`,
                    value: `${fund.description}\n` +
                           `**${fund.total_donated.toLocaleString()} MĐC** | **${fund.total_donated_vip.toLocaleString()} MĐV**\n` +
                           `📅 Tạo: ${createdDate} | 🔍 \`/fund fund_name:${fund.name}\``,
                    inline: false
                });
            }

            // Thêm hướng dẫn nếu có nhiều hơn 10 quỹ
            if (funds.length > 10) {
                embed.addFields({
                    name: '📋 Lưu Ý',
                    value: `Chỉ hiển thị 10 quỹ gần nhất. Tổng cộng: **${funds.length}** quỹ`,
                    inline: false
                });
            }

            // Thêm hướng dẫn sử dụng
            embed.addFields({
                name: '💡 Hướng Dẫn',
                value: '• `/donate` - Donate cho quỹ\n' +
                       '• `/fund fund_name:tên_quỹ` - Xem leaderboard\n' +
                       '• `/fund-create` - Tạo quỹ mới',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in fund-list command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi')
                .setDescription('Có lỗi xảy ra khi lấy danh sách quỹ. Vui lòng thử lại sau.')
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund System' });

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
        }
    },
};