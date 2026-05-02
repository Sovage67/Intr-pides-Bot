import { SlashCommandBuilder, EmbedBuilder} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { prisma } from '../../lib/prisma.js';

function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Affiche ton niveau et ton XP.')
    .addUserOption((opt) =>
      opt.setName('utilisateur').setDescription('Voir le niveau de quelqu\'un d\'autre'),
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

    const level = member?.level ?? 0;
    const xp = member?.xp ?? 0;
    const required = xpForLevel(level);
    const percent = Math.min(100, Math.floor((xp / required) * 100));

    const filled = Math.floor(percent / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Niveau de ${target.username}`)
      .setColor(0x5865f2)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Niveau', value: `${level}`, inline: true },
        { name: 'XP', value: `${xp} / ${required}`, inline: true },
        { name: 'Progression', value: `${bar} ${percent}%` },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
