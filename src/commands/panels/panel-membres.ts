import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';
import type { SlashCommand } from '../../lib/types.js';

export const PANEL_MEMBRES_COMMANDS: Record<
  string,
  { title: string; emoji: string; description: string; usage: string }
> = {
  ping: {
    title: 'Ping — Latence',
    emoji: '🏓',
    description:
      'Affiche la latence actuelle du bot ainsi que la latence de l\'API Discord. Utile pour vérifier si le bot répond correctement.',
    usage: '`/ping`',
  },
  level: {
    title: 'Level — Niveau',
    emoji: '📈',
    description:
      'Affiche ton niveau actuel, ton expérience, et la progression vers le prochain niveau.',
    usage: '`/level`',
  },
  helpmembres: {
    title: 'HelpMembres — Aide',
    emoji: '❓',
    description:
      'Affiche la liste complète des commandes disponibles pour les membres.',
    usage: '`/helpmembres`',
  },
};

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('panel-membres')
    .setDescription('🎮 Panneau des commandes membres'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `Panel Membres • ${interaction.guild?.name ?? 'Serveur'}`,
        iconURL: interaction.guild?.iconURL() ?? undefined,
      })
      .setTitle('🎮  Panel Membres')
      .setDescription(
        '> Bienvenue dans le **panneau des membres**.\n' +
          '> Sélectionnez une commande ci-dessous pour l\'exécuter.\n\n' +
          '**Commandes disponibles :**\n' +
          '📈 `level` · ❓ `helpmembres`',
      )
      .setColor(0x57f287)
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setFooter({
        text: `Demandé par ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_membres_select')
      .setPlaceholder('🎮  Sélectionner une commande...')
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel('Level — Votre niveau')
          .setDescription('Afficher votre niveau et XP')
          .setValue('level')
          .setEmoji('📈'),
        new StringSelectMenuOptionBuilder()
          .setLabel('HelpMembres — Aide')
          .setDescription('Liste de toutes les commandes membres')
          .setValue('helpmembres')
          .setEmoji('❓'),
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};

export default command;
