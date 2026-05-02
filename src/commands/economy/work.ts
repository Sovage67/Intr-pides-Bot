import { SlashCommandBuilder, EmbedBuilder} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const WORK_COOLDOWN_MS = 60 * 60 * 1000; // 1h
const WORK_MIN = 50;
const WORK_MAX = 200;

const JOBS = [
  { name: 'développeur', emoji: '💻' },
  { name: 'pizzaiolo', emoji: '🍕' },
  { name: 'streamer', emoji: '🎮' },
  { name: 'pilote', emoji: '✈️' },
  { name: 'jardinier', emoji: '🌻' },
  { name: 'chef cuisinier', emoji: '👨‍🍳' },
  { name: 'pompier', emoji: '🚒' },
  { name: 'vétérinaire', emoji: '🐾' },
];

const command: SlashCommand = {
  data: new SlashCommandBuilder().setName('work').setDescription('Travaille pour gagner des pièces.'),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    await prisma.user.upsert({
      where: { id: interaction.user.id },
      create: { id: interaction.user.id, username: interaction.user.username },
      update: { username: interaction.user.username },
    });

    const member = await prisma.member.upsert({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
      create: { guildId: interaction.guildId, userId: interaction.user.id },
      update: {},
    });

    const now = new Date();
    if (member.lastWork) {
      const elapsed = now.getTime() - member.lastWork.getTime();
      if (elapsed < WORK_COOLDOWN_MS) {
        const remainingMs = WORK_COOLDOWN_MS - elapsed;
        const minutes = Math.floor(remainingMs / (60 * 1000));
        await interaction.reply({
          content: `⏳ Tu es fatigué, repose-toi ! Reviens dans **${minutes}m**.`,
          ephemeral: true,
        });
        return;
      }
    }

    const earned = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const job = JOBS[Math.floor(Math.random() * JOBS.length)]!;

    const updated = await prisma.member.update({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
      data: { coins: { increment: earned }, lastWork: now },
    });

    const embed = new EmbedBuilder()
      .setTitle(`${job.emoji} Travail accompli`)
      .setColor(0x57f287)
      .setDescription(
        `Tu as travaillé en tant que **${job.name}** et gagné **${earned}** pièces.\nTon nouveau solde : **${updated.coins}** pièces.`,
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
