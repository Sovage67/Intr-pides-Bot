/**
 * Event guildCreate : déclenché quand le bot vient d'être ajouté à un serveur.
 *
 * Étapes :
 *  1. Lire l'audit log Discord pour identifier QUI a cliqué "Ajouter au serveur"
 *     (audit log type BotAdd = 28). Fallback : le propriétaire du serveur.
 *  2. Upsert du Guild en BDD avec installerUserId + ownerUserId.
 *  3. Évaluer le quota freemium de cet installateur. Si dépassé, geler ce
 *     serveur (licenseFrozen = true) → les modules premium seront désactivés
 *     tant que l'utilisateur n'a pas pris l'offre Premium ou n'a pas retiré
 *     le bot d'un autre serveur.
 *  4. Tenter d'envoyer un MP à l'installateur pour le prévenir, et / ou
 *     poster dans le 1er salon où le bot peut écrire.
 */

import { Events, AuditLogEvent, ChannelType, type Guild, type Client } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { evaluateNewInstall, FREE_QUOTA, PREMIUM_QUOTA } from '../lib/freemium.js';

export default {
  name: Events.GuildCreate,
  async execute(guild: Guild, client: Client) {
    try {
      logger.info({ guildId: guild.id, name: guild.name }, 'Bot ajouté à un nouveau serveur');

      // ── 1. Audit log : qui a cliqué "Ajouter" ? ─────────────────────────
      let installerUserId: string | null = null;
      try {
        const me = guild.members.me ?? client.user;
        const fetched = await guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 5,
        });
        const entry = fetched.entries.find((e) => e.targetId === client.user?.id);
        installerUserId = entry?.executor?.id ?? null;
        if (!installerUserId) {
          logger.debug({ guildId: guild.id }, 'Pas d\'entrée BotAdd dans l\'audit log');
        }
        // Garde-fou : si la permission ViewAuditLog manque, on tombera ici sans erreur
        void me;
      } catch (err) {
        logger.warn({ err, guildId: guild.id }, 'Impossible de lire l\'audit log (permission manquante ?)');
      }
      // Fallback : le propriétaire du serveur
      const ownerUserId = guild.ownerId;
      if (!installerUserId) installerUserId = ownerUserId;

      // ── 2. Upsert Guild ────────────────────────────────────────────────
      await prisma.guild.upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          installerUserId,
          ownerUserId,
        },
        update: {
          name: guild.name,
          installerUserId,
          ownerUserId,
        },
      });

      // ── 3. Évaluation freemium ─────────────────────────────────────────
      const { frozen, reason } = await evaluateNewInstall(installerUserId);

      if (frozen) {
        await prisma.guild.update({
          where: { id: guild.id },
          data: { licenseFrozen: true },
        });
        logger.warn({ guildId: guild.id, installerUserId, reason }, 'Serveur gelé à l\'installation');
      }

      // ── 4. Notification à l'installateur ──────────────────────────────
      const message = frozen
        ? [
            `👋 Merci d'avoir ajouté **Bot Intrépides** sur **${guild.name}** !`,
            ``,
            `⚠️  **Ton serveur est en mode "dormant".**`,
            `Le plan gratuit autorise le bot sur **${FREE_QUOTA} serveur** par utilisateur Discord.`,
            `Tu sembles déjà l'utiliser ailleurs, donc ici les modules avancés (tickets, économie,`,
            `musique, sondages, anti-raid…) sont désactivés.`,
            ``,
            `🔓  **Pour réactiver ce serveur :**`,
            `  • Soit retire le bot de ton autre serveur — celui-ci sera dégelé automatiquement.`,
            `  • Soit prends le **Premium** : jusqu'à ${PREMIUM_QUOTA} serveurs en simultané.`,
            ``,
            `💡 La modération de base et l'auto-rôle restent disponibles.`,
          ].join('\n')
        : [
            `👋 Merci d'avoir ajouté **Bot Intrépides** sur **${guild.name}** !`,
            ``,
            `Tous les modules sont actifs et **gratuits**.`,
            `Configure tout depuis : ${process.env.DASHBOARD_URL ?? 'https://intrepides.vercel.app'}/servers/${guild.id}`,
          ].join('\n');

      // Tentative MP à l'installateur
      if (installerUserId) {
        try {
          const installer = await client.users.fetch(installerUserId);
          await installer.send(message);
        } catch {
          // MP fermés → on essaie le 1er salon
          const channel = guild.channels.cache.find(
            (c) =>
              c.type === ChannelType.GuildText &&
              c.permissionsFor(client.user!)?.has('SendMessages'),
          );
          if (channel && channel.type === ChannelType.GuildText) {
            await channel.send(message).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id }, 'Erreur dans guildCreate');
    }
  },
};
