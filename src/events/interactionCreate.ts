import {
  Events,
  type Interaction,
  type Client,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { closeTicket } from '../commands/utility/ticket.js';


// ─── Helper : ouvrir un ticket ───────────────────────────────────────────────
async function handleTicketOpen(
  interaction: import('discord.js').StringSelectMenuInteraction | import('discord.js').ButtonInteraction,
  categoryId: number,
) {
  const { guild, user } = interaction;
  if (!guild) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const cfg = await prisma.ticketConfig.findUnique({
      where: { guildId: guild.id },
      include: { categories: true },
    });

    if (!cfg?.enabled) {
      await interaction.editReply({ content: '❌ Le module Tickets est désactivé.' });
      return;
    }

    // Vérifier le max de tickets par membre
    const openCount = await prisma.ticket.count({
      where: { guildId: guild.id, userId: user.id, status: 'open' },
    });
    if (openCount >= cfg.maxPerMember) {
      await interaction.editReply({ content: `❌ Tu as déjà **${openCount}** ticket(s) ouvert(s). Ferme-les avant d'en ouvrir un nouveau.` });
      return;
    }

    // Récupérer la raison (null si bouton simple)
    const cat = cfg.categories.find((c: { id: number; emoji: string; label: string; description: string }) => c.id === categoryId) ?? null;
    const catLabel = cat ? `${cat.emoji} ${cat.label}` : '🎫 Ticket';

    // Formater le nom du salon
    const slug = (cat?.label ?? 'ticket').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const userSlug = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const channelName = `ticket-${slug}-${userSlug}`.slice(0, 100);

    // Créer le salon
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
        ...cfg.modRoles.map((roleId: string) => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
    });

    // Créer le ticket en DB
    const ticket = await prisma.ticket.create({
      data: {
        guildId: guild.id,
        channelId: ticketChannel.id,
        userId: user.id,
        username: user.username,
        categoryId: cat?.id ?? null,
        status: 'open',
      },
    });

    // Bouton fermeture
    const closeBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel('🔒 Fermer le ticket')
        .setStyle(ButtonStyle.Danger),
    );

    // Embed de bienvenue dans le salon ticket
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`${catLabel} — Ticket #${ticket.id}`)
      .setDescription(`Bienvenue <@${user.id}> ! Un modérateur va te répondre dès que possible.`)
      .setColor(0x57f287)
      .setFooter({ text: `Ticket ouvert par ${user.username}` })
      .setTimestamp();

    // Mention des rôles mods
    const modMentions = cfg.modRoles.length
      ? cfg.modRoles.map((r: string) => `<@&${r}>`).join(' ')
      : null;

    await ticketChannel.send({
      content: modMentions ?? undefined,
      embeds: [welcomeEmbed],
      components: [closeBtn],
    });

    await interaction.editReply({ content: `✅ Ton ticket a été ouvert : <#${ticketChannel.id}>` });
  } catch (err) {
    logger.error({ err }, 'Erreur création ticket');
    await interaction.editReply({ content: '❌ Une erreur est survenue lors de la création du ticket.' });
  }
}

// Helper : extraire un Discord ID depuis une saisie brute ou une @mention
function parseUserId(raw: string): string | null {
  const mention = raw.match(/^<@!?(\d{17,19})>$/);
  if (mention) return mention[1]!;
  if (/^\d{17,19}$/.test(raw.trim())) return raw.trim();
  return null;
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: Client) {

    // ════════════════════════════════════════════════════════════════════════
    // 1. MODAL SUBMISSIONS — Modération via Panel Admin
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const { customId, guild } = interaction;

      if (!guild) {
        await interaction.reply({ content: '❌ Cette action doit être effectuée dans un serveur.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Vérification propriétaire pour tous les modals du Panel Admin
      if (
        ['modal_warn', 'modal_kick', 'modal_ban', 'modal_clear', 'modal_mute'].includes(customId) &&
        interaction.user.id !== guild.ownerId
      ) {
        await interaction.reply({
          content: '🔒 Ce panel est réservé au **propriétaire du serveur** uniquement.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ── WARN ──────────────────────────────────────────────────────────────
      if (customId === 'modal_warn') {

        const rawId = interaction.fields.getTextInputValue('membre_id');
        const raison = interaction.fields.getTextInputValue('raison');
        const userId = parseUserId(rawId);

        if (!userId) {
          await interaction.reply({ content: '❌ ID invalide. Entre un ID Discord valide ou une @mention.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply();
        try {
          const target = await interaction.client.users.fetch(userId);
          await prisma.guild.upsert({
            where: { id: guild.id },
            create: { id: guild.id, name: guild.name },
            update: {},
          });
          const warn = await prisma.warn.create({
            data: { guildId: guild.id, userId: target.id, modId: interaction.user.id, reason: raison },
          });
          const totalWarns = await prisma.warn.count({ where: { guildId: guild.id, userId: target.id } });

          // ── Embed affiché dans le salon ──────────────────────────────────
          const embedSalon = new EmbedBuilder()
            .setTitle('⚠️  Avertissement émis')
            .setColor(0xed4245)
            .setThumbnail(target.displayAvatarURL())
            .setDescription(`<@${target.id}> a reçu un avertissement.`)
            .addFields(
              { name: '📝 Raison', value: raison },
              { name: '🔢 Warn n°', value: `${warn.id}`, inline: true },
              { name: '📊 Total warns', value: `${totalWarns}`, inline: true },
            )
            .setFooter({ text: `Panel Admin • ${guild.name}` })
            .setTimestamp();

          // ── Embed envoyé en MP au membre ─────────────────────────────────
          const embedDM = new EmbedBuilder()
            .setTitle('⚠️  Tu as reçu un avertissement')
            .setColor(0xed4245)
            .setThumbnail(guild.iconURL())
            .setDescription(
              `Tu as été averti sur le serveur **${guild.name}**.\n` +
              `Merci de respecter les règles du serveur.`,
            )
            .addFields(
              { name: '📝 Raison', value: raison },
              { name: '🔢 Avertissement n°', value: `${warn.id}`, inline: true },
              { name: '📊 Total de tes warns', value: `${totalWarns}`, inline: true },
            )
            .setFooter({ text: `${guild.name} • Si tu penses que c\'est une erreur, contacte un admin.` })
            .setTimestamp();

          // Envoi du MP (silencieux si les DMs sont fermés)
          await target.send({ embeds: [embedDM] }).catch(() => null);

          await interaction.editReply({ embeds: [embedSalon] });
        } catch {
          await interaction.editReply({ content: '❌ Membre introuvable ou erreur lors de l\'avertissement.' });
        }
        return;
      }

      // ── KICK ──────────────────────────────────────────────────────────────
      if (customId === 'modal_kick') {
        const rawId = interaction.fields.getTextInputValue('membre_id');
        const raison = interaction.fields.getTextInputValue('raison') || 'Aucune raison fournie';
        const userId = parseUserId(rawId);

        if (!userId) {
          await interaction.reply({ content: '❌ ID invalide. Entre un ID Discord valide ou une @mention.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply();
        try {
          const target = await guild.members.fetch(userId);
          if (!target.kickable) {
            await interaction.editReply({ content: '❌ Je ne peux pas expulser ce membre (rang trop élevé).' });
            return;
          }
          await target.kick(`${interaction.user.tag} : ${raison}`);

          const embed = new EmbedBuilder()
            .setTitle('👢  Membre expulsé')
            .setColor(0xed4245)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: '👤 Membre', value: `${target.user.tag} (${target.id})` },
              { name: '📝 Raison', value: raison },
              { name: '🛡️ Modérateur', value: `<@${interaction.user.id}>` },
            )
            .setFooter({ text: `Panel Admin • ${guild.name}` })
            .setTimestamp();
          await interaction.editReply({ embeds: [embed] });
        } catch {
          await interaction.editReply({ content: '❌ Membre introuvable ou impossible à expulser.' });
        }
        return;
      }

      // ── BAN ───────────────────────────────────────────────────────────────
      if (customId === 'modal_ban') {
        const rawId = interaction.fields.getTextInputValue('membre_id');
        const raison = interaction.fields.getTextInputValue('raison') || 'Aucune raison fournie';
        const userId = parseUserId(rawId);

        if (!userId) {
          await interaction.reply({ content: '❌ ID invalide. Entre un ID Discord valide ou une @mention.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply();
        try {
          const target = await interaction.client.users.fetch(userId);
          await guild.members.ban(userId, { reason: `${interaction.user.tag} : ${raison}` });

          const embed = new EmbedBuilder()
            .setTitle('🔨  Membre banni')
            .setColor(0xed4245)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
              { name: '👤 Membre', value: `${target.tag} (${target.id})` },
              { name: '📝 Raison', value: raison },
              { name: '🛡️ Modérateur', value: `<@${interaction.user.id}>` },
            )
            .setFooter({ text: `Panel Admin • ${guild.name}` })
            .setTimestamp();
          await interaction.editReply({ embeds: [embed] });
        } catch {
          await interaction.editReply({ content: '❌ Membre introuvable ou impossible à bannir.' });
        }
        return;
      }

      // ── MUTE ──────────────────────────────────────────────────────────────
      if (customId === 'modal_mute') {
        const rawId  = interaction.fields.getTextInputValue('membre_id');
        const rawDur = interaction.fields.getTextInputValue('duree').trim().toLowerCase();
        const raison = interaction.fields.getTextInputValue('raison') || 'Aucune raison fournie';
        const userId = parseUserId(rawId);

        if (!userId) {
          await interaction.reply({ content: '❌ ID invalide. Entre un ID Discord valide ou une @mention.', flags: MessageFlags.Ephemeral });
          return;
        }

        // Parsing durée : 30m / 2h / 1d / 7d (max 28j pour Discord)
        const durationMatch = rawDur.match(/^(\d+)(m|h|d)$/);
        if (!durationMatch) {
          await interaction.reply({ content: '❌ Durée invalide. Utilise le format `10m`, `2h`, `1d` ou `7d`.', flags: MessageFlags.Ephemeral });
          return;
        }

        const value = parseInt(durationMatch[1]!, 10);
        const unit  = durationMatch[2]!;
        const multipliers: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
        const durationMs = value * multipliers[unit]!;
        const maxMs = 28 * 24 * 3_600_000; // 28 jours max Discord

        if (durationMs > maxMs) {
          await interaction.reply({ content: '❌ La durée maximale est de **28 jours**.', flags: MessageFlags.Ephemeral });
          return;
        }

        // Label lisible pour les embeds
        const durationLabel = unit === 'm' ? `${value} minute(s)` : unit === 'h' ? `${value} heure(s)` : `${value} jour(s)`;

        await interaction.deferReply();
        try {
          const target = await guild.members.fetch(userId);

          if (!target.moderatable) {
            await interaction.editReply({ content: '❌ Je ne peux pas rendre ce membre muet (rang trop élevé).' });
            return;
          }

          await target.timeout(durationMs, `${interaction.user.tag} : ${raison}`);

          // ── Embed salon ──────────────────────────────────────────────────
          const embedSalon = new EmbedBuilder()
            .setTitle('🔇  Membre rendu muet')
            .setColor(0xed4245)
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: '👤 Membre', value: `<@${target.id}>` },
              { name: '⏱️ Durée', value: durationLabel, inline: true },
              { name: '📝 Raison', value: raison, inline: true },
            )
            .setFooter({ text: `Panel Admin • ${guild.name}` })
            .setTimestamp();

          // ── MP au membre ─────────────────────────────────────────────────
          const embedDM = new EmbedBuilder()
            .setTitle('🔇  Tu as été rendu muet')
            .setColor(0xed4245)
            .setThumbnail(guild.iconURL())
            .setDescription(`Tu as été rendu muet sur le serveur **${guild.name}**.`)
            .addFields(
              { name: '⏱️ Durée', value: durationLabel, inline: true },
              { name: '📝 Raison', value: raison, inline: true },
            )
            .setFooter({ text: `${guild.name} • Si tu penses que c'est une erreur, contacte un admin.` })
            .setTimestamp();

          await target.user.send({ embeds: [embedDM] }).catch(() => null);
          await interaction.editReply({ embeds: [embedSalon] });
        } catch {
          await interaction.editReply({ content: '❌ Membre introuvable ou impossible à rendre muet.' });
        }
        return;
      }

      // ── CLEAR ─────────────────────────────────────────────────────────────
      if (customId === 'modal_clear') {
        const raw = interaction.fields.getTextInputValue('nombre');
        const amount = parseInt(raw, 10);

        if (isNaN(amount) || amount < 1 || amount > 1_000_000) {
          await interaction.reply({ content: '❌ Nombre invalide. Entre un chiffre entre 1 et 1 000 000.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: '❌ Cette action doit être effectuée dans un salon textuel.', flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          // bulkDelete est limité à 100 par appel → on boucle par tranche de 100
          let remaining = amount;
          let totalDeleted = 0;

          while (remaining > 0) {
            const batch = Math.min(remaining, 100);
            const deleted = await interaction.channel.bulkDelete(batch, true);
            totalDeleted += deleted.size;
            remaining -= deleted.size;

            // Arrêt si Discord n'a plus de messages à supprimer
            if (deleted.size < batch) break;

            // Petite pause pour éviter le rate-limit Discord
            await new Promise((r) => setTimeout(r, 1000));
          }

          const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(`🧹 **${totalDeleted}** message(s) supprimé(s) avec succès.`)
            .setFooter({ text: `Panel Admin • ${guild.name}` })
            .setTimestamp();
          await interaction.editReply({ embeds: [embed] });
        } catch {
          await interaction.editReply({ content: '❌ Impossible de supprimer les messages (trop anciens ?).' });
        }
        return;
      }

      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. SELECT MENUS — Panels
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu()) {
      const { customId, values, guild } = interaction;
      const selected = values[0]!;

      // ── PANEL ADMIN ───────────────────────────────────────────────────────
      if (customId === 'panel_admin_select') {
        if (interaction.user.id !== guild?.ownerId) {
          await interaction.reply({
            content: '🔒 Ce panel est réservé au **propriétaire du serveur** uniquement.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (selected === 'helpadmins') {
          await interaction.update({ embeds: [buildHelpAdminsEmbed(guild?.name ?? 'Serveur')] });
          return;
        }
        const modals: Record<string, ModalBuilder> = {
          warn: buildWarnModal(),
          kick: buildKickModal(),
          ban: buildBanModal(),
          mute: buildMuteModal(),
          clear: buildClearModal(),
        };
        const modal = modals[selected];
        if (modal) {
          await interaction.showModal(modal);
          return;
        }

        // ── Dashboard ─────────────────────────────────────────────────────
        if (selected === 'dashboard') {
          const linkBtn = new ButtonBuilder()
            .setLabel('🌐  Ouvrir le Dashboard')
            .setURL('https://intrepides.vercel.app')
            .setStyle(ButtonStyle.Link);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkBtn);
          const embed = new EmbedBuilder()
            .setTitle('🌐  Dashboard — Intrépides')
            .setDescription('Clique sur le bouton ci-dessous pour accéder au tableau de bord du serveur.')
            .setColor(0x5865f2)
            .setFooter({ text: `Panel Admin • ${guild?.name ?? 'Serveur'}` })
            .setTimestamp();
          await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
          return;
        }

        // ── Ping (dans panel admin) ────────────────────────────────────────
        if (selected === 'ping') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const latency = Date.now() - interaction.createdTimestamp;
          const apiLatency = Math.round(interaction.client.ws.ping);
          const embed = new EmbedBuilder()
            .setTitle('🏓  Pong !')
            .setColor(0xed4245)
            .addFields(
              { name: 'Latence bot', value: `${latency}ms`, inline: true },
              { name: 'Latence API', value: `${apiLatency}ms`, inline: true },
            )
            .setFooter({ text: `Panel Admin • ${guild?.name ?? 'Serveur'}` })
            .setTimestamp();
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        return;
      }

      // ── PANEL MEMBRES ─────────────────────────────────────────────────────
      if (customId === 'panel_membres_select') {
        if (!guild) {
          await interaction.reply({ content: '❌ Cette commande doit être utilisée dans un serveur.', flags: MessageFlags.Ephemeral });
          return;
        }

        // ── Aide ──────────────────────────────────────────────────────────
        if (selected === 'helpmembres') {
          await interaction.update({ embeds: [buildHelpMembresEmbed(guild.name)] });
          return;
        }

        // ── Level ─────────────────────────────────────────────────────────
        if (selected === 'level') {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const memberData = await prisma.member.findUnique({
            where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
          });

          const level = memberData?.level ?? 0;
          const xp = memberData?.xp ?? 0;
          const required = xpForLevel(level);
          const percent = Math.min(100, Math.floor((xp / required) * 100));
          const filled = Math.floor(percent / 10);
          const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

          const embed = new EmbedBuilder()
            .setTitle(`📈  Niveau de ${interaction.user.username}`)
            .setColor(0x5865f2)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              { name: 'Niveau', value: `${level}`, inline: true },
              { name: 'XP', value: `${xp} / ${required}`, inline: true },
              { name: 'Progression', value: `${bar} ${percent}%` },
            )
            .setFooter({ text: `Panel Membres • ${guild.name}` })
            .setTimestamp();
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        return;
      }

      // ── TICKET SELECT CATEGORY ──────────────────────────────────────────
      if (customId === 'ticket:select_category') {
        const categoryId = parseInt(values[0]!, 10);
        await handleTicketOpen(interaction, categoryId);
        return;
      }

      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. BOUTON — Retour Panel Admin
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      // ── TICKET OPEN (bouton direct catégorie unique) ──────────────────────
      if (interaction.customId.startsWith('ticket:open:')) {
        const categoryId = parseInt(interaction.customId.split(':')[2]!, 10);
        await handleTicketOpen(interaction, categoryId);
        return;
      }

      // ── TICKET CLOSE ──────────────────────────────────────────────────────
      if (interaction.customId === 'ticket:close') {
        if (!interaction.guild) return;
        // @ts-ignore
        await closeTicket(interaction, interaction.guild.id, null);
        return;
      }

      if (interaction.customId === 'btn_back_admin') {
        const { guild } = interaction;
        if (!guild || interaction.user.id !== guild.ownerId) {
          await interaction.reply({ content: '🔒 Réservé au propriétaire du serveur.', flags: MessageFlags.Ephemeral });
          return;
        }

        const embed = new EmbedBuilder()
          .setAuthor({ name: `Panel Administrateur • ${guild.name}`, iconURL: guild.iconURL() ?? undefined })
          .setTitle('🛡️  Panel Admin')
          .setDescription(
            '> Bienvenue dans le **panneau de contrôle administrateur**.\n' +
            '> Sélectionnez une commande ci-dessous.\n\n' +
            '**Commandes disponibles :**\n' +
            '⚠️ `warn` · 👢 `kick` · 🧹 `clear` · 🔨 `ban` · 🔇 `mute` · 🏓 `ping` · 📖 `helpadmins`',
          )
          .setColor(0xed4245)
          .setThumbnail(interaction.client.user.displayAvatarURL())
          .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('panel_admin_select')
          .setPlaceholder('📋  Sélectionner une commande...')
          .addOptions([
            new StringSelectMenuOptionBuilder().setLabel('Warn — Avertissement').setDescription('Avertir un membre').setValue('warn').setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder().setLabel('Kick — Expulsion').setDescription('Expulser un membre').setValue('kick').setEmoji('👢'),
            new StringSelectMenuOptionBuilder().setLabel('Clear — Supprimer des messages').setDescription('Effacer des messages').setValue('clear').setEmoji('🧹'),
            new StringSelectMenuOptionBuilder().setLabel('Ban — Bannissement').setDescription('Bannir un membre').setValue('ban').setEmoji('🔨'),
            new StringSelectMenuOptionBuilder().setLabel('Mute — Réduire au silence').setDescription('Rendre un membre muet').setValue('mute').setEmoji('🔇'),
            new StringSelectMenuOptionBuilder().setLabel('Ping — Latence du bot').setDescription('Latence du bot et de l\'API').setValue('ping').setEmoji('🏓'),
            new StringSelectMenuOptionBuilder().setLabel('HelpAdmins — Aide Modération').setDescription('Liste des commandes').setValue('helpadmins').setEmoji('📖'),
            new StringSelectMenuOptionBuilder().setLabel('Dashboard — Site web').setDescription('Accéder au tableau de bord du serveur').setValue('dashboard').setEmoji('🌐'),
          ]);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5. SLASH COMMANDS
    // ════════════════════════════════════════════════════════════════════════
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Commande inconnue : ${interaction.commandName}`);
      return;
    }

    // Cooldown via Redis
    if (command.cooldown) {
      const key = `cd:${interaction.user.id}:${command.data.name}`;
      const exists = await redis.get(key);
      if (exists) {
        const ttl = await redis.ttl(key);
        await interaction.reply({
          content: `⏳ Patiente encore ${ttl}s avant de réutiliser cette commande.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await redis.set(key, '1', 'EX', command.cooldown);
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: command.data.name }, 'Erreur exécution commande');
      const errorContent = 'Une erreur est survenue lors de l\'exécution de cette commande.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorContent, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content: errorContent, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },
};
