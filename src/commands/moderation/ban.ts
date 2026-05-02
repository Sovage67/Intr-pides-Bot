import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName('membre').setDescription('Le membre à bannir').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('raison').setDescription('La raison').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('jours')
        .setDescription('Nombre de jours de messages à supprimer (0-7)')
        .setMinValue(0)
        .setMaxValue(7),
    ),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'Cette commande doit être utilisée dans un serveur.',
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser('membre', true);
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
    const days = interaction.options.getInteger('jours') ?? 0;

    try {
      await interaction.guild.members.ban(target.id, {
        reason: `${interaction.user.tag} : ${reason}`,
        deleteMessageSeconds: days * 86400,
      });
    } catch {
      await interaction.reply({
        content: 'Impossible de bannir ce membre.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔨 Membre banni')
      .setColor(0xed4245)
      .addFields(
        { name: 'Membre', value: `${target.tag} (${target.id})` },
        { name: 'Raison', value: reason },
        { name: 'Modérateur', value: `<@${interaction.user.id}>` },
        { name: 'Messages supprimés', value: `${days} jour(s)` },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
