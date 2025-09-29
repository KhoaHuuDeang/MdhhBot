const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const UserService = require('../utils/prismaService');  // CHANGED: From dbHelpers to PrismaService

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
                const funds = await interaction.client.prismaService.getFundsList();
                
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
            const fund = await interaction.client.prismaService.getFundByName(fundName);
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

            // Lấy leaderboard donations - hiển thị tất cả
            const donations = await interaction.client.prismaService.getFundDonations(fundName, 50);

            // Tạo embed hiển thị thông tin quỹ với layout thoáng đẹp
            const embed = new EmbedBuilder()
                .setColor('#386641')
                .setTitle(`🏛️ ${fund.name}`)
                .setDescription(`*${fund.description}*\n\u2000`)
                .addFields(
                    {
                        name: '💵 Tổng Quyên Góp',
                        value: `**${(fund.total_donated || 0).toLocaleString()}** MĐCoin\n**${(fund.total_donated_vip || 0).toLocaleString()}** MĐV\n\u2000`,
                        inline: true
                    },
                    {
                        name: '📊 Tổng Đóng Góp',
                        value: `**${donations.length}** người tham gia\n\u2000`,
                        inline: true
                    },
                    {
                        name: '📅 Ngày Tạo',
                        value: `${new Date(fund.created_at).toLocaleDateString('vi-VN')}\n\u2000`,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'MDHH Community • Fund Leaderboard' });

            if (donations.length === 0) {
                embed.addFields({
                    name: '💗 Trở Thành Người Đầu Tiên!',
                    value: `Chưa có ai quyên góp cho quỹ này.\n\u2000\n🎯 Hãy sử dụng \`/donate fund:${fundName}\` để trở thành người đầu tiên!\n\u2000`,
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
                    leaderboardText += `💵 **${donation.total_donated.toLocaleString()}** MĐC • 💴 **${donation.total_donated_vip.toLocaleString()}** MĐV\n\u2000\n\u2000\n`;
                }

                // Chia leaderboard thành các field nhỏ để hiển thị nhiều người hơn
                const maxPerField = 8; // Khoảng 8 người mỗi field để đảm bảo không vượt 1024 chars
                
                for (let fieldIndex = 0; fieldIndex < Math.ceil(donations.length / maxPerField); fieldIndex++) {
                    const startIndex = fieldIndex * maxPerField;
                    const endIndex = Math.min(startIndex + maxPerField, donations.length);
                    const fieldDonations = donations.slice(startIndex, endIndex);
                    
                    let fieldText = '';
                    fieldDonations.forEach((donation, index) => {
                        const rank = startIndex + index + 1;
                        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
                        
                        // Tạo display name
                        let displayName = `<@${donation.donor_id}>`;
                        
                        fieldText += `${medal} **${displayName}**\n`;
                        fieldText += `💵 **${donation.total_donated.toLocaleString()}** MĐC • 💴 **${donation.total_donated_vip.toLocaleString()}** MĐV\n\u2000\n`;
                    });
                    
                    const fieldName = fieldIndex === 0 ? '🏆 Bảng Xếp Hạng Đóng Góp' : `🏆 Bảng Xếp Hạng (tiếp)`;
                    
                    embed.addFields({
                        name: fieldName,
                        value: fieldText || 'Chưa có dữ liệu\n\u2000',
                        inline: false
                    });
                }
            }

            // Thêm hướng dẫn donation với khoảng trống
            embed.addFields({
                name: '💡 Cách Quyên Góp',
                value: `\`/donate fund:${fundName} mdcoin:100 mdv:50 reason:"Ủng hộ"\`\n\u2000\n🎯 **Mẹo**: Bạn có thể donate chỉ MĐC, chỉ MĐV, hoặc cả hai!\n\u2000`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in fund command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Lỗi Hệ Thống')
                .setDescription('Có lỗi xảy ra khi lấy thông tin quỹ.\n\u2000\n🔄 Vui lòng thử lại sau ít phút.\n\u2000')
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
