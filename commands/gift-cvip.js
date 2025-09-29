const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const UserService = require('../utils/prismaService');  // CHANGED: From dbHelpers to PrismaService

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift-cvip')
        .setDescription('Tặng MĐV (VIP coins) cho thành viên khác')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người nhận MĐV')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Số MĐV muốn tặng')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do tặng (tùy chọn)')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        try {
            const sender = interaction.user;
            const receiver = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const reason = interaction.options.getString('reason')?.trim() || null;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Không cho phép tự tặng
            if (sender.id === receiver.id) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Không Thể Tự Tặng')
                    .setDescription('Bạn không thể tặng MĐV cho chính mình!')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • VIP Gift System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Không cho phép tặng cho bot
            if (receiver.bot) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Không Thể Tặng Bot')
                    .setDescription('Bạn không thể tặng MĐV cho bot!')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • VIP Gift System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Lấy thông tin balance của người gửi
            const senderBalance = await interaction.client.prismaService.getUserBalance(sender.id);
            if (!senderBalance.exists || senderBalance.balance_vip < amount) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Không Đủ MĐV')
                    .setDescription(
                        `Bạn chỉ có **${senderBalance.balance_vip || 0} MĐV** nhưng muốn tặng **${amount} MĐV**.`
                    )
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • VIP Gift System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Lấy display names
            const senderDisplayName = interaction.member?.displayName || sender.username;
            let receiverDisplayName = receiver.username;
            try {
                const receiverMember = await interaction.guild.members.fetch(receiver.id).catch(() => null);
                receiverDisplayName = receiverMember?.displayName || receiver.username;
            } catch (error) {
                // Sử dụng username nếu không fetch được member
            }

            // Thực hiện transfer VIP coins
            await interaction.client.prismaService.transferVipCoins(sender.id, receiver.id, amount, reason);

            // Tạo embed thành công
            const embed = new EmbedBuilder()
                .setColor('#6A994E')
                .setTitle('💴 VIP Gift Thành Công!')
                .setDescription(`**${senderDisplayName}** đã tặng **${amount.toLocaleString()} MĐV** cho **${receiverDisplayName}**!`)
                .addFields(
                    {
                        name: '🎁 Người Tặng',
                        value: `${sender}`,
                        inline: true
                    },
                    {
                        name: '🎯 Người Nhận',
                        value: `${receiver}`,
                        inline: true
                    },
                    {
                        name: '💴 Số Tiền',
                        value: `**${amount.toLocaleString()} MĐV**`,
                        inline: true
                    }
                )
                .setThumbnail(sender.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Cảm ơn sự hào phóng!' });

            // Thêm lý do nếu có
            if (reason) {
                embed.addFields({
                    name: '💭 Lời Nhắn',
                    value: reason,
                    inline: false
                });
            }

            // Thêm balance còn lại của người gửi
            const remainingVip = (senderBalance.balance_vip || 0) - amount;
            embed.addFields({
                name: '💴 MĐVIP Còn Lại',
                value: `**${remainingVip.toLocaleString()} MĐV**`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

            // Gửi DM cho người nhận (nếu có thể)
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#6A994E')
                    .setTitle('💴 Bạn Nhận Được VIP Gift!')
                    .setDescription(`**${senderDisplayName}** đã tặng bạn **${amount.toLocaleString()} MĐV**!`)
                    .addFields({
                        name: '💭 Lời Nhắn',
                        value: reason || 'Không có lời nhắn',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • VIP Gift System' });

                await receiver.send({ embeds: [dmEmbed] });
            } catch (error) {
                // Không gửi được DM, không sao
                console.log(`Could not send DM to ${receiver.tag}`);
            }

        } catch (error) {
            console.error('Error in gift-cvip command:', error);

            let errorMessage = 'Có lỗi xảy ra khi tặng MĐV. Vui lòng thử lại sau.';

            if (error.message === 'Insufficient VIP balance') {
                errorMessage = 'Bạn không đủ MĐV để tặng!';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi VIP Gift')
                .setDescription(errorMessage)
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • VIP Gift System' });

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    },
};
