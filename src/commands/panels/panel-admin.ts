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

export const PANEL_ADMIN_COMMANDS: Record<
  string,
  { title: string; emoji: string; description: string; usage: string; permissions: string }
> = {
  warn: {
    title: 'Warn — Avertissement',
    emoji: '⚠️',
    description:
      'Envoie un avertissement officiel à un membre. L\'avertissement est enregistré en base de données et le compteur de warns du membre est incrémenté.',
    usage: '`/warn membre:<@membre> raison:<raison>`',
    permissions: 'Modérer les membres',
  },
  kick: {
    title: 'Kick — Expulsion',
    emoji: '👢',
    description:
      'Expulse un membre du serveur. Le membre pourra rejoindre de nouveau via une invitation. Idéal pour les infractions légères ne nécessitant pas de ban.',
    usage: '`/kick membre:<@membre> raison:<raison>`',
    permissions: 'Expulser des membres',
  },
  clear: {
    title: 'Clear — Suppression de messages',
    emoji: '🧹',
    description:
      'Supprime un nombre défini de messages dans le salon actuel (jusqu\'à 100 messages à la fois). Les messages de plus de 14 jours ne peuvent pas être supprimés.',
    usage: '`/clear nombre:<1-100>`',
    permissions: 'Gérer les messages',
  },
  ban: {
    title: 'Ban — Bannissement',
    emoji: '🔨',
    description:
      'Bannit définitivement un membre du serveur. Le membre ne pourra plus rejoindre via une invitation tant que le ban n\'est pas levé. Mesure sévère réservée aux infractions graves.',
    usage: '`/ban membre:<@membre> raison:<raison>`',
    permissions: 'Bannir des membres',
  },
  helpadmins: {
    title: 'HelpAdmins — Aide Modération',
    emoji: '📖',
    description:
      'Affiche la liste complète des commandes de modération disponibles avec leurs descriptions et permissions requises. Utile pour les nouveaux modérateurs.',
    usage: '`/helpadmins`',
    permissions: 'Modérer les membres',
  },
};

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('panel-admin')
    .setDescription('🛡️ Panneau de contrôle de la modération')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (interaction.user.id !== interaction.guild?.ownerId) {
      await interaction.reply({
        content: '🔒 Ce panel est réservé au **propriétaire du serveur** uniquement.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `Panel Administrateur • ${interaction.guild?.name ?? 'Serveur'}`,
        iconURL: interaction.guild?.iconURL() ?? undefined,
      })
      .setTitle('🛡️  Panel Admin')
      .setDescription(
        '> Bienvenue dans le **panneau de contrôle administrateur**.\n' +
          '> Sélectionnez une commande ci-dessous pour afficher ses détails.\n\n' +
          '**Commandes disponibles :**\n' +
          '⚠️ `warn` · 👢 `kick` · 🧹 `clear` · 🔨 `ban` · 🔇 `mute` · 🏓 `ping` · 📖 `helpadmins`',
      )
      .setColor(0xed4245)
      .setThumbnail(
        interaction.client.user.displayAvatarURL(),
      )
      .setFooter({
        text: `Demandé par ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('panel_admin_select')
      .setPlaceholder('📋  Sélectionner une commande...')
      .addOptions([
        new StringSelectMenuOptionBuilder()
          .setLabel('Warn — Avertissement')
          .setDescription('Envoyer un avertissement à un membre')
          .setValue('warn')
          .setEmoji('⚠️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Kick — Expulsion')
          .setDescription('Expulser un membre du serveur')
          .setValue('kick')
          .setEmoji('👢'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Clear — Supprimer des messages')
          .setDescription('Effacer des messages en masse')
          .setValue('clear')
          .setEmoji('🧹'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Ban — Bannissement')
          .setDescription('Bannir définitivement un membre')
          .setValue('ban')
          .setEmoji('🔨'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Mute — Réduire au silence')
          .setDescription('Rendre un membre muet temporairement')
          .setValue('mute')
          .setEmoji('🔇'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Ping — Latence du bot')
          .setDescription('Vérifier la latence du bot et de l\'API')
          .setValue('ping')
          .setEmoji('🏓'),
        new StringSelectMenuOptionBuilder()
          .setLabel('HelpAdmins — Aide Modération')
          .setDescription('Liste des commandes de modération')
          .setValue('helpadmins')
          .setEmoji('📖'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Dashboard — Site web')
          .setDescription('Accéder au tableau de bord du serveur')
          .setValue('dashboard')
          .setEmoji('🌐'),
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};

export default command;
