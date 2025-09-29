const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('donate')
        .setDescription('Donate MĐCoin hoặc MĐV cho quỹ')
        .addStringOption(option =>
            option.setName('fund')
                .setDescription('Tên quỹ muốn donate')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('mdcoin')
                .setDescription('Số MĐCoin muốn donate (mặc định: 0)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option.setName('mdv')
                .setDescription('Số MĐV muốn donate (mặc định: 0)')
                .setRequired(false)
                .setMinValue(0)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Lý do donate (tùy chọn)')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const focusedValue = interaction.options.getFocused();
            
            try {
                // Get list of funds for autocomplete
                const funds = await UserService.getFundsList();
                
                // Filter funds based on user input
                const filtered = funds.filter(fund => 
                    fund.name.toLowerCase().includes(focusedValue.toLowerCase())
                ).slice(0, 25); // Discord limit is 25 choices
                
                // Create choices array
                const choices = filtered.map(fund => ({
                    name: `${fund.name} (${fund.total_donated + fund.total_donated_vip} total)`,
                    value: fund.name
                }));
                
                await interaction.respond(choices);
                return;
            } catch (error) {
                console.error('Error in donate autocomplete:', error);
                await interaction.respond([]);
                return;
            }
        }

        try {
            const fundName = interaction.options.getString('fund').trim();
            const mdcoinAmount = interaction.options.getInteger('mdcoin') || 0;
            const mdvAmount = interaction.options.getInteger('mdv') || 0;
            const reason = interaction.options.getString('reason')?.trim() || null;
            const user = interaction.user;

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

            // Validate input
            if (mdcoinAmount <= 0 && mdvAmount <= 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Số Tiền Không Hợp Lệ')
                    .setDescription('Bạn phải donate ít nhất 1 MĐCoin hoặc 1 MĐV!')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Kiểm tra quỹ có tồn tại không
            const fund = await UserService.getFundByName(fundName);
            if (!fund) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Quỹ Không Tồn Tại')
                    .setDescription(`Không tìm thấy quỹ **${fundName}**. Sử dụng \`/fund-list\` để xem danh sách quỹ.`)
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Lấy balance hiện tại của user
            const userBalance = await UserService.getUserBalance(user.id);
            if (!userBalance.exists) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Chưa Có Tài Khoản')
                    .setDescription('Bạn chưa có MĐCoin! Hãy tham gia voice channel để kiếm MĐCoin.')
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Kiểm tra đủ balance không
            if (mdcoinAmount > userBalance.balance) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Không Đủ MĐCoin')
                    .setDescription(`Bạn chỉ có **${userBalance.balance} MĐCoin** nhưng muốn donate **${mdcoinAmount} MĐCoin**.`)
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            if (mdvAmount > userBalance.balance_vip) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Không Đủ MĐV')
                    .setDescription(`Bạn chỉ có **${userBalance.balance_vip} MĐV** nhưng muốn donate **${mdvAmount} MĐV**.`)
                    .setTimestamp()
                    .setFooter({ text: 'MDHH Community • Fund System' });

                await interaction.editReply({ embeds: [errorEmbed] });
                return;
            }

            // Thực hiện donation
            await UserService.donateToFund(user.id, fundName, mdcoinAmount, mdvAmount, reason);

            // Lấy thông tin quỹ sau khi donate
            const updatedFund = await UserService.getFundByName(fundName);

            // Tạo embed thành công
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle('🎉 Donation Thành Công!')
                .setDescription(`Cảm ơn **${interaction.member?.displayName || user.username}** đã đóng góp cho **${fundName}**!`)
                .addFields(
                    {
                        name: '💰 Số Tiền Donate',
                        value: `**${mdcoinAmount.toLocaleString()} MĐCoin** | **${mdvAmount.toLocaleString()} MĐV**`,
                        inline: true
                    },
                    {
                        name: '🏛️ Tổng Quỹ Hiện Tại',
                        value: `**${updatedFund.total_donated.toLocaleString()} MĐC** | **${updatedFund.total_donated_vip.toLocaleString()} MĐV**`,
                        inline: true
                    }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Cảm ơn sự đóng góp!' });

            // Thêm lý do nếu có
            if (reason) {
                embed.addFields({
                    name: '💭 Lời Nhắn',
                    value: reason,
                    inline: false
                });
            }

            // Thêm balance còn lại
            const remainingBalance = userBalance.balance - mdcoinAmount;
            const remainingVip = userBalance.balance_vip - mdvAmount;
            
            embed.addFields({
                name: '💳 Balance Còn Lại',
                value: `**${remainingBalance.toLocaleString()} MĐCoin** | **${remainingVip.toLocaleString()} MĐV**`,
                inline: false
            });

            // Thêm link xem leaderboard
            embed.addFields({
                name: '🏆 Xem Ranking',
                value: `Sử dụng \`/fund fund_name:${fundName}\` để xem bảng xếp hạng`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in donate command:', error);

            let errorMessage = 'Có lỗi xảy ra khi thực hiện donation. Vui lòng thử lại sau.';

            if (error.message === 'Fund not found') {
                errorMessage = 'Không tìm thấy quỹ này!';
            } else if (error.message === 'Insufficient MĐCoin balance') {
                errorMessage = 'Bạn không đủ MĐCoin để donate!';
            } else if (error.message === 'Insufficient MĐV balance') {
                errorMessage = 'Bạn không đủ MĐV để donate!';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi Donation')
                .setDescription(errorMessage)
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