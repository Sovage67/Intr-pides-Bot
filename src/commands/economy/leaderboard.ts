import { SlashCommandBuilder, EmbedBuilder} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Affiche le top 10 du serveur.')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Classement par')
        .setRequired(false)
        .addChoices(
          { name: 'Pièces', value: 'coins' },
          { name: 'Niveau', value: 'level' },
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    const type = (interaction.options.getString('type') ?? 'coins') as 'coins' | 'level';
    const orderBy = type === 'level' ? [{ level: 'desc' as const }, { xp: 'desc' as const }] : [{ coins: 'desc' as const }];

    const top = await prisma.member.findMany({
      where: { guildId: interaction.guildId },
      orderBy,
      take: 10,
      include: { user: true },
    });

    if (top.length === 0) {
      await interaction.reply('Aucun membre dans le classement pour l\'instant.');
      return;
    }

    const lines = top.map((m, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
      const value = type === 'level' ? `Niveau ${m.level}` : `${m.coins} pièces`;
      return `${medal} ${m.user.username} — ${value}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Classement ${type === 'level' ? 'des niveaux' : 'des pièces'}`)
      .setColor(0xfee75c)
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
