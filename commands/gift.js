const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('Tặng MĐCoin cho thành viên khác trong cộng đồng học tập')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Thành viên nhận MĐCoin')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Số lượng MĐCoin muốn tặng')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000000)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do tặng (khuyến khích, hỗ trợ học tập, v.v.)')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        try {
            const sender = interaction.user;
            const recipient = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const reason = interaction.options.getString('reason');

            // Lấy member objects để có displayName
            const senderMember = interaction.member;
            const recipientMember = await interaction.guild.members.fetch(recipient.id).catch(() => null);

            // Sử dụng displayName thay vì username
            const senderName = senderMember?.displayName || sender.username;
            const recipientName = recipientMember?.displayName || recipient.username;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Validation: Không thể tự tặng cho mình
            if (sender.id === recipient.id) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🚫 Không Thể Thực Hiện')
                    .setDescription('Bạn không thể tự tặng MĐCoin cho chính mình!')
                    .addFields({
                        name: '💡 Gợi Ý',
                        value: 'Hãy tặng cho các thành viên khác để khuyến khích học tập!',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'Study Community • Gift System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Validation: Không thể tặng cho bot
            if (recipient.bot) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🤖 Không Thể Tặng Bot')
                    .setDescription('Bot không cần MĐCoin để hoạt động!')
                    .addFields({
                        name: '👥 Thay Vào Đó',
                        value: 'Hãy tặng cho các thành viên đang học tập tích cực',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'Study Community • Gift System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Kiểm tra balance của người gửi
            const senderBalance = await UserService.getUserBalance(sender.id);

            if (!senderBalance.exists || senderBalance.balance < amount) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('💸 Không Đủ MĐCoin')
                    .setDescription('Balance của bạn không đủ để thực hiện giao dịch này.')
                    .addFields(
                        {
                            name: '💎 Balance Hiện Tại',
                            value: `**${senderBalance.balance?.toLocaleString() || 0} MĐC**`,
                            inline: true
                        },
                        {
                            name: '💰 Số Tiền Cần',
                            value: `**${amount.toLocaleString()} MĐC**`,
                            inline: true
                        },
                        {
                            name: '📊 Còn Thiếu',
                            value: `**${(amount - (senderBalance.balance || 0)).toLocaleString()} MĐC**`,
                            inline: true
                        },
                        {
                            name: '🎓 Cách Kiếm Thêm',
                            value: '• Tham gia voice channel học tập\n• Duy trì thời gian học ổn định\n• Nhận gift từ thành viên khác',
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Study Community • Hãy tiếp tục học tập!' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Thực hiện transfer
            await UserService.transferCoins(sender.id, recipient.id, amount, reason);

            // Lấy balance mới của người gửi để hiển thị
            const newSenderBalance = await UserService.getUserBalance(sender.id);

            // Tạo embed thông báo thành công với design học tập
            const successEmbed = new EmbedBuilder()
                .setColor('#386641') // Primary green for important transaction
                .setTitle('🎁 Gift MĐCoin Thành Công!')
                .setDescription(`Giao dịch hỗ trợ học tập đã được hoàn tất`)
                .addFields(
                    {
                        name: '🤝 Thông Tin Giao Dịch',
                        value: `**${senderName}** → **${recipientName}**\n💰 **${amount.toLocaleString()} MĐC**`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Study Community • Cảm ơn sự hỗ trợ!' });

            // Add balance information in secondary layout
            successEmbed.addFields(
                {
                    name: '👤 Người Tặng',
                    value: `${senderName}\n💎 Còn lại: **${newSenderBalance.balance.toLocaleString()} MĐC**`,
                    inline: true
                },
                {
                    name: '🎯 Người Nhận',
                    value: `${recipientName}\n🆔 ${recipient.id.slice(-4)}...`,
                    inline: true
                },
                {
                    name: '📈 Ý Nghĩa',
                    value: `Tương đương ~${Math.floor(amount / 720)} giờ học`,
                    inline: true
                }
            );

            // Thêm reason với styling phù hợp
            if (reason) {
                successEmbed.addFields({
                    name: '💬 Lời Nhắn Khuyến Khích',
                    value: `"${reason}"`,
                    inline: false
                });
            }

            // Add motivational message
            successEmbed.addFields({
                name: '🌟 Tinh Thần Cộng Đồng',
                value: 'Cảm ơn bạn đã hỗ trợ và khuyến khích các thành viên học tập!',
                inline: false
            });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log transaction
            console.log(`🎁 Gift transaction: ${senderName} (${sender.id}) -> ${recipientName} (${recipient.id}): ${amount} MĐ Coin`);

        } catch (error) {
            console.error('Error in gift command:', error);

            let errorMessage = 'Có lỗi xảy ra khi thực hiện giao dịch. Vui lòng thử lại sau.';

            if (error.message === 'Insufficient balance') {
                errorMessage = 'Bạn không có đủ SCP để thực hiện giao dịch này.';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi giao dịch')
                .setDescription(errorMessage)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};