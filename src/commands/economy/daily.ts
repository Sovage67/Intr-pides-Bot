import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const DAILY_AMOUNT = 250;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Récupère ta récompense quotidienne.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Upsert User et Member
    await prisma.user.upsert({
      where: { id: interaction.user.id },
      create: { id: interaction.user.id, username: interaction.user.username },
      update: { username: interaction.user.username },
    });

    const member = await prisma.member.upsert({
      where: {
        guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id },
      },
      create: { guildId: interaction.guildId, userId: interaction.user.id },
      update: {},
    });

    const now = new Date();
    if (member.lastDaily) {
      const elapsed = now.getTime() - member.lastDaily.getTime();
      if (elapsed < DAILY_COOLDOWN_MS) {
        const remainingMs = DAILY_COOLDOWN_MS - elapsed;
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
        await interaction.reply({
          content: `⏳ Tu as déjà récupéré ta récompense ! Reviens dans **${hours}h ${minutes}m**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const updated = await prisma.member.update({
      where: {
        guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id },
      },
      data: { coins: { increment: DAILY_AMOUNT }, lastDaily: now },
    });

    const embed = new EmbedBuilder()
      .setTitle('💰 Récompense quotidienne')
      .setColor(0x57f287)
      .setDescription(
        `Tu as reçu **${DAILY_AMOUNT}** pièces !\nTon nouveau solde : **${updated.coins}** pièces.`,
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
