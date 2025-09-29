const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const UserService = require('../utils/dbHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fund')
        .setDescription('Xem leaderboard donations của một quỹ cụ thể')
        .addStringOption(option =>
            option.setName('fund_name')
                .setDescription('Tên quỹ muốn xem')
                .setRequired(true)
                .setAutocomplete(true)
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
                console.error('Error in fund autocomplete:', error);
                await interaction.respond([]);
                return;
            }
        }

        try {
            const fundName = interaction.options.getString('fund_name').trim();

            // Defer reply để có thời gian xử lý
            await interaction.deferReply();

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

            // Lấy leaderboard donations
            const donations = await UserService.getFundDonations(fundName, 10);

            // Tạo embed hiển thị thông tin quỹ
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle(`🏛️ ${fund.name}`)
                .setDescription(fund.description)
                .addFields(
                    {
                        name: '💰 Tổng Donations',
                        value: `**${fund.total_donated.toLocaleString()} MĐCoin** | **${fund.total_donated_vip.toLocaleString()} MĐV**`,
                        inline: true
                    },
                    {
                        name: '📊 Tổng Contributors',
                        value: `**${donations.length}** người`,
                        inline: true
                    },
                    {
                        name: '📅 Ngày Tạo',
                        value: new Date(fund.created_at).toLocaleDateString('vi-VN'),
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund Leaderboard' });

            if (donations.length === 0) {
                embed.addFields({
                    name: '🎯 Trở Thành Người Đầu Tiên!',
                    value: `Chưa có ai donate cho quỹ này. Hãy sử dụng \`/donate fund:${fundName}\` để trở thành người đầu tiên!`,
                    inline: false
                });
            } else {
                // Tạo leaderboard string
                let leaderboardText = '';
                for (let i = 0; i < donations.length; i++) {
                    const donation = donations[i];
                    const rank = i + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
                    
                    // Fetch Discord user để hiển thị tên
                    let displayName = `<@${donation.donor_id}>`;
                    try {
                        const discordUser = await interaction.client.users.fetch(donation.donor_id);
                        const member = await interaction.guild.members.fetch(donation.donor_id).catch(() => null);
                        displayName = member?.displayName || discordUser.username;
                    } catch (error) {
                        // Nếu không fetch được user, dùng ID
                        displayName = `User#${donation.donor_id}`;
                    }

                    const totalDonated = donation.total_donated + donation.total_donated_vip;
                    const lastDonation = new Date(donation.last_donation).toLocaleDateString('vi-VN');

                    leaderboardText += `${medal} **${displayName}**\n`;
                    leaderboardText += `${donation.total_donated.toLocaleString()} MĐC | ${donation.total_donated_vip.toLocaleString()} MĐV | ${donation.donation_count} lần\n`;
                    leaderboardText += `📅 Gần nhất: ${lastDonation}\n\n`;
                }

                embed.addFields({
                    name: '🏆 Top Contributors',
                    value: leaderboardText.slice(0, 1024), // Discord limit 1024 chars per field
                    inline: false
                });
            }

            // Thêm hướng dẫn donation
            embed.addFields({
                name: '💡 Hướng Dẫn Donate',
                value: `\`/donate fund:${fundName} mdcoin:100 mdv:50 reason:"Ủng hộ"\``,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in fund command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi')
                .setDescription('Có lỗi xảy ra khi lấy thông tin quỹ. Vui lòng thử lại sau.')
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