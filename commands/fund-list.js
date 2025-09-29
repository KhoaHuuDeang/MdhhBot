const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const UserService = require('../utils/prismaService');  // CHANGED: From dbHelpers to PrismaService

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fund-list')
        .setDescription('Xem danh sách tất cả các quỹ hiện có'),

    async execute(interaction) {
        try {
            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Lấy danh sách các quỹ
            const funds = await interaction.client.prismaService.getFundsList();

            if (funds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#6A994E')
                    .setTitle('Danh Sách Quỹ')
                    .setDescription('Chưa có quỹ nào được tạo\n\nHãy tạo quỹ đầu tiên với `/fund-create`')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Tạo embed hiển thị danh sách quỹ
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle('🏛️ Danh Sách Quỹ Hiện Có')
                .setDescription(`📊 Có **${funds.length}** quỹ đang hoạt động\n\u2000`) // Thêm khoảng trắng
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund System' });

            // Thêm thông tin từng quỹ với layout user-centric
            for (let i = 0; i < Math.min(funds.length, 8); i++) {
                const fund = funds[i];
                const totalValue = (fund.total_donated || 0) + (fund.total_donated_vip || 0);
                const createdDate = new Date(fund.created_at).toLocaleDateString('vi-VN');
                const isLast = i === Math.min(funds.length, 8) - 1;

                // Tạo separator line
                const separator = isLast ? '' : '\n━━━━━━━━━━━━━━━━━━━━━━━━━━';

                embed.addFields({
                    name: `${i + 1}. ${fund.name}`,
                    value: `> *${fund.description}*\n\n` +
                           `💵 **${(fund.total_donated || 0).toLocaleString()}** MĐCoin\n` +
                           `💴 **${(fund.total_donated_vip || 0).toLocaleString()}** MĐV\n` +
                           `📅 Ngày tạo: **${createdDate}**\n\n` +
                           `🔗 Quyên góp: \`/donate fund:${fund.name}\`\n` +
                           `📊 Chi tiết: \`/fund fund_name:${fund.name}\`` +
                           separator,
                    inline: false
                });
            }

            // Thêm hướng dẫn nếu có nhiều hơn 8 quỹ
            if (funds.length > 8) {
                embed.addFields({
                    name: 'Lưu Ý',
                    value: `Hiển thị 8/${funds.length} quỹ gần nhất\n\u2000`,
                    inline: false
                });
            }

            // Thêm hướng dẫn sử dụng với layout đẹp hơn
            embed.addFields({
                name: 'Hướng Dẫn Sử Dụng',
                value: '`/donate` - Quyên góp cho quỹ\n' +
                       '`/fund fund_name:tên_quỹ` - Xem bảng xếp hạng\n' +
                       '`/fund-create` - Tạo quỹ mới',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in fund-list command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('Lỗi')
                .setDescription('Có lỗi xảy ra khi lấy danh sách quỹ. Vui lòng thử lại sau.')
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund System' });

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },
};
