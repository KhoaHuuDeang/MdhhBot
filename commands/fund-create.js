const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const UserService = require('../utils/prismaService');  // CHANGED: From dbHelpers to PrismaService

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fund-create')
        .setDescription('Tạo quỹ mới để nhận donations')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Tên quỹ (ví dụ: "Quỹ Học Bổng")')
                .setRequired(true)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Mô tả mục đích của quỹ')
                .setRequired(true)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        try {
            const fundName = interaction.options.getString('name').trim();
            const description = interaction.options.getString('description').trim();
            const user = interaction.user;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Tạo quỹ mới
            const newFund = await interaction.client.prismaService.createFund(fundName, description);

            // Tạo embed thành công với UI đẹp hơn
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle('Quỹ Được Tạo Thành Công!')
                .setDescription(`**${fundName}** đã sẵn sàng nhận quyên góp\n\u2000`)
                .addFields(
                    {
                        name: 'Mô Tả Quỹ',
                        value: `*${description}*\n\u2000`,
                        inline: false
                    },
                    {
                        name: 'Tình Trạng Hiện Tại',
                        value: `**0** MĐCoin\n**0** MĐV\n\u2000`,
                        inline: true
                    },
                    {
                        name: 'Bắt Đầu Quyên Góp',
                        value: `\`/donate fund:${fundName}\`\n\u2000`,
                        inline: true
                    },
                    {
                        name: 'Hướng Dẫn Tiếp Theo',
                        value: '• Chia sẻ quỹ với cộng đồng\n• Theo dõi donations qua `/fund`\n• Xem tất cả quỹ qua `/fund-list`',
                        inline: false
                    }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund System' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in fund-create command:', error);

            let errorMessage = 'Có lỗi xảy ra khi tạo quỹ. Vui lòng thử lại sau.';

            if (error.message === 'Fund name already exists') {
                errorMessage = 'Tên quỹ này đã tồn tại! Vui lòng chọn tên khác.';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('Lỗi Tạo Quỹ')
                .setDescription(errorMessage)
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
