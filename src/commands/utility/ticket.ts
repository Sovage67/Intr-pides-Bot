import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type Guild,
  type TextChannel,
} from 'discord.js';
import { prisma } from '../../lib/prisma.js';

// ── Poster le panel depuis le dashboard (appelé via Redis) ────────────────────
export async function postTicketPanel(guild: Guild, channelId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await prisma.ticketConfig.findUnique({
    where: { guildId: guild.id },
    include: { categories: { orderBy: { order: 'asc' } } },
  });

  if (!cfg?.enabled) return { ok: false, error: 'Module Tickets désactivé.' };
  if (cfg.actionType === 'selector' && !cfg.categories.length) return { ok: false, error: 'Aucune raison configurée.' };

  const colorHex = parseInt((cfg.panelColor ?? '#57F287').replace('#', ''), 16);
  const embed = new EmbedBuilder()
    .setTitle(cfg.panelTitle || '🎫 Ouvrir un ticket')
    .setDescription(cfg.panelDescription || 'Sélectionnez le type de votre demande dans le menu ci-dessous.')
    .setColor(isNaN(colorHex) ? 0x57f287 : colorHex)
    .setTimestamp();

  if (cfg.panelAuthor) embed.setAuthor({ name: cfg.panelAuthor });
  if (cfg.panelFooter) embed.setFooter({ text: cfg.panelFooter });
  else embed.setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });
  if (cfg.panelImage) embed.setImage(cfg.panelImage);
  if (cfg.panelThumbnail) embed.setThumbnail(cfg.panelThumbnail);

  let component: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;

  if (cfg.actionType === 'button') {
    const btn = new ButtonBuilder()
      .setCustomId('ticket:open:0')
      .setLabel(cfg.buttonLabel || 'Ouvrir un ticket')
      .setStyle(ButtonStyle.Success);
    component = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket:select_category')
      .setPlaceholder('📋 Choisir le type de votre demande...')
      .addOptions(
        cfg.categories.map((cat: { id: number; emoji: string; label: string; description: string }) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setDescription(cat.description || `Ouvrir un ticket ${cat.label}`)
            .setValue(String(cat.id))
            .setEmoji(cat.emoji),
        ),
      );
    component = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  }

  try {
    const channel = await guild.channels.fetch(channelId) as TextChannel | null;
    if (!channel || !('send' in channel)) return { ok: false, error: 'Salon introuvable ou non textuel.' };

    const msg = await channel.send({ embeds: [embed], components: [component] });
    await prisma.ticketConfig.update({
      where: { guildId: guild.id },
      data: { panelChannelId: channelId, panelMessageId: msg.id },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Système de tickets')
    .addSubcommand(sub =>
      sub.setName('panel').setDescription('Poster le panel d\'ouverture de ticket dans ce salon'),
    )
    .addSubcommand(sub =>
      sub.setName('close').setDescription('Fermer le ticket actuel').addStringOption(opt =>
        opt.setName('raison').setDescription('Raison de fermeture (optionnel)').setRequired(false),
      ),
    )
    .addSubcommand(sub =>
      sub.setName('add').setDescription('Ajouter un membre au ticket').addUserOption(opt =>
        opt.setName('membre').setDescription('Membre à ajouter').setRequired(true),
      ),
    )
    .addSubcommand(sub =>
      sub.setName('remove').setDescription('Retirer un membre du ticket').addUserOption(opt =>
        opt.setName('membre').setDescription('Membre à retirer').setRequired(true),
      ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const { guild } = interaction;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();

    // ── /ticket close ──────────────────────────────────────────────────────
    if (sub === 'close') {
      const raison = interaction.options.getString('raison') ?? null;
      await closeTicket(interaction, guild.id, raison);
      return;
    }

    // ── /ticket add ────────────────────────────────────────────────────────
    if (sub === 'add') {
      const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channelId } });
      if (!ticket) {
        await interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = interaction.options.getUser('membre', true);
      const channel = interaction.channel;
      if (channel?.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ content: `✅ <@${member.id}> a été ajouté au ticket.` });
      }
      return;
    }

    // ── /ticket remove ─────────────────────────────────────────────────────
    if (sub === 'remove') {
      const ticket = await prisma.ticket.findUnique({ where: { channelId: interaction.channelId } });
      if (!ticket) {
        await interaction.reply({ content: '❌ Ce salon n\'est pas un ticket.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = interaction.options.getUser('membre', true);
      if (member.id === ticket.userId) {
        await interaction.reply({ content: '❌ Impossible de retirer l\'auteur du ticket.', flags: MessageFlags.Ephemeral });
        return;
      }

      const channel = interaction.channel;
      if (channel?.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.delete(member.id);
        await interaction.reply({ content: `✅ <@${member.id}> a été retiré du ticket.` });
      }
      return;
    }
  },
};

// ─── Helper fermeture ticket ──────────────────────────────────────────────────
export async function closeTicket(
  interaction: ChatInputCommandInteraction | import('discord.js').ButtonInteraction,
  guildId: string,
  raison: string | null,
) {
  const { guild, channel } = interaction;
  if (!guild || !channel) return;

  const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: '❌ Ce salon n\'est pas un ticket ouvert.', flags: MessageFlags.Ephemeral });
    return;
  }

  const cfg = await prisma.ticketConfig.findUnique({ where: { guildId } });
  if (!cfg) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Mettre à jour la DB
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: 'closed',
      closedBy: interaction.user.id,
      closedByName: interaction.user.username,
      closeReason: raison,
      closedAt: new Date(),
    },
  });

  await interaction.editReply({ content: '✅ Ticket fermé. Le salon sera supprimé dans quelques secondes.' });

  // Suppression auto
  if (cfg.autoDelete) {
    setTimeout(async () => {
      try {
        await channel.delete();
      } catch {
        // silencieux
      }
    }, (cfg.autoDeleteDelay ?? 5) * 1000);
  }
}
