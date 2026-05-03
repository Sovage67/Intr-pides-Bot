import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';
import { checkGuildCooldown } from '../../lib/cooldown.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime un nombre de messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((opt) =>
      opt
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    ),
  async execute(interaction) {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un salon textuel.',
        ephemeral: true,
      });
      return;
    }

    // Cooldown global par serveur : 1 clear toutes les 10 secondes (anti-abus)
    const remaining = await checkGuildCooldown(interaction.guildId!, 'clear', 10);
    if (remaining) {
      await interaction.reply({ content: `⏳ Cooldown actif sur ce serveur, réessaie dans **${remaining}s**.`, ephemeral: true });
      return;
    }

    const amount = interaction.options.getInteger('nombre', true);
    const deleted = await interaction.channel.bulkDelete(amount, true);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`🧹 ${deleted.size} message(s) supprimé(s).`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
