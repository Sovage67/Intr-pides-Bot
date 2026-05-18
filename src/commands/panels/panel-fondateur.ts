import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('panel-fondateur')
    .setDescription('Panneau exclusif du fondateur du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Commande utilisable uniquement dans un serveur.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({
        content: 'Ce panel est reserve au **fondateur du serveur** uniquement.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'Panel Fondateur • ' + (interaction.guild.name ?? 'Serveur'),
        iconURL: interaction.guild.iconURL() ?? undefined,
      })
      .setTitle('Panel Fondateur')
      .setDescription(
        '> Bienvenue dans le **panneau exclusif du fondateur**.\n' +
        '> Ces commandes sont reservees au proprietaire du serveur.\n\n' +
        '**Commandes disponibles :**\n' +
        'Database ID — Signaler un utilisateur problematique',
      )
      .setColor(0xED4245)
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setFooter({
        text: 'Demande par ' + interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_fondateur_select')
      .setPlaceholder('Selectionner une commande...')
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel('Database ID — Signaler')
          .setDescription('Signaler un utilisateur dans la liste noire globale')
          .setValue('cancer')
          .setEmoji('☠️'),
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};

export default command;
