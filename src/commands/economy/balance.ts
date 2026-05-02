import { SlashCommandBuilder, EmbedBuilder} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Affiche ton solde de pièces.')
    .addUserOption((opt) =>
      opt.setName('utilisateur').setDescription('Voir le solde de quelqu\'un d\'autre'),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser('utilisateur') ?? interaction.user;
    const member = await prisma.member.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: target.id } },
    });

    const coins = member?.coins ?? 0;
    const bank = member?.bank ?? 0;

    const embed = new EmbedBuilder()
      .setTitle(`💰 Solde de ${target.username}`)
      .setColor(0xfee75c)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Portefeuille', value: `${coins} pièces`, inline: true },
        { name: 'Banque', value: `${bank} pièces`, inline: true },
        { name: 'Total', value: `${coins + bank} pièces`, inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
