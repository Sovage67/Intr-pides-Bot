import { Events, type GuildMember, ChannelType, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../lib/cache.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ── Types Arrivées & Départs ───────────────────────────────────────────────
type ArriveesCfg = {
  autoRoleEnabled: boolean;
  autoRoleId: string | null;
  welcomeEnabled: boolean;
  welcomeChannel: string | null;
  welcomeMessage: string;
  welcomeFormat: string;
  welcomeMention: boolean;
  welcomeImageUrl: string | null;
  goodbyeEnabled: boolean;
  goodbyeChannel: string | null;
  goodbyeMessage: string;
  goodbyeFormat: string;
  goodbyeImageUrl: string | null;
};

const arriveesCache = new Map<string, { data: ArriveesCfg; expiresAt: number }>();

export async function getArriveesConfig(guildId: string): Promise<ArriveesCfg | null> {
  const now = Date.now();
  const cached = arriveesCache.get(guildId);
  const invalidated = cached ? await redis.get(`arrivees:invalidate:${guildId}`) : null;
  if (cached && cached.expiresAt > now && !invalidated) return cached.data;
  if (invalidated) await redis.del(`arrivees:invalidate:${guildId}`).catch(() => {});
  try {
    // @ts-ignore
    const cfg = await prisma.arriveesDepartsConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    arriveesCache.set(guildId, { data: cfg as ArriveesCfg, expiresAt: now + 5 * 60 * 1000 });
    return cfg as ArriveesCfg;
  } catch {
    return null;
  }
}

export { arriveesCache };

// ── Helper : résolution des variables ────────────────────────────────────
export function resolveVars(
  template: string,
  member: GuildMember,
): string {
  const memberCount    = member.guild.memberCount;
  const createdAt      = member.user.createdAt;
  const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  const dateStr        = createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return template
    // Variables utilisateur
    .replace(/\{user\.mention\}/g, `<@${member.id}>`)
    .replace(/\{user\.username\}/g, member.user.username)
    .replace(/\{user\.id\}/g, member.id)
    .replace(/\{user\.tag\}/g, member.user.username)
    .replace(/\{user\.createdAt\}/g, dateStr)
    .replace(/\{user\.accountAge\}/g, `${accountAgeDays} jour${accountAgeDays !== 1 ? 's' : ''}`)
    .replace(/\{user\.nickname\}/g, member.nickname ?? member.user.username)
    .replace(/\{user\.isBot\}/g, member.user.bot ? 'Oui' : 'Non')
    .replace(/\{user\.avatarUrl\}/g, member.user.displayAvatarURL({ size: 256 }))
    // Variables serveur
    .replace(/\{server\.name\}/g, member.guild.name)
    .replace(/\{server\.memberCount\}/g, memberCount.toString())
    .replace(/\{server\.id\}/g, member.guild.id)
    .replace(/\{server\.owner\}/g, `<@${member.guild.ownerId}>`)
    // Ancienne syntaxe (rétro-compatibilité)
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, memberCount.toString());
}

// ── Helper : envoyer le message de bienvenue/aurevoir ───────────────────
export async function sendWelcomeGoodbye(
  member: GuildMember,
  cfg: ArriveesCfg,
  type: 'welcome' | 'goodbye',
) {
  const channelId  = type === 'welcome' ? cfg.welcomeChannel  : cfg.goodbyeChannel;
  const rawMessage = type === 'welcome' ? cfg.welcomeMessage  : cfg.goodbyeMessage;
  const format     = type === 'welcome' ? cfg.welcomeFormat   : cfg.goodbyeFormat;
  const enabled    = type === 'welcome' ? cfg.welcomeEnabled  : cfg.goodbyeEnabled;

  if (!enabled || !channelId) return;

  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const content  = resolveVars(rawMessage, member);
  const mention  = type === 'welcome' && cfg.welcomeMention ? `<@${member.id}>` : undefined;
  const imageUrl = type === 'welcome' ? cfg.welcomeImageUrl : cfg.goodbyeImageUrl;

  try {
    if (format === 'embed') {
      const color = type === 'welcome' ? 0x57F287 : 0xED4245;
      const title = type === 'welcome' ? '🎉 Nouveau membre !' : '👋 Membre parti';
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(content)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() ?? undefined })
        .setTimestamp();
      if (imageUrl) embed.setImage(imageUrl);
      await (channel as any).send({ content: mention, embeds: [embed] });
    } else {
      const text = mention ? `${mention}\n${content}` : content;
      await (channel as any).send(text);
    }
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id, type }, 'Impossible d\'envoyer le message arrivées/départs');
  }
}

// ── Types Anti-Raid ────────────────────────────────────────────────────────
type AntiRaidCfg = {
  enabled: boolean;
  joinEnabled: boolean;
  joinThreshold: number;
  joinWindow: number;
  suspectEnabled: boolean;
  minAccountAge: number;
  botApiEnabled: boolean;
  linkEnabled: boolean;
  linkThreshold: number;
  linkWindow: number;
  banPurgeDays: number;
  logChannelId: string | null;
  modPingRoleId: string | null;
};

// ── Cache mémoire (TTL 5 min) ──────────────────────────────────────────────
const antiRaidCache = new Map<string, { data: AntiRaidCfg; expiresAt: number }>();

async function getAntiRaidConfig(guildId: string): Promise<AntiRaidCfg | null> {
  const now = Date.now();
  const cached = antiRaidCache.get(guildId);
  const invalidated = cached ? await redis.get(`antiraid:invalidate:${guildId}`) : null;

  if (cached && cached.expiresAt > now && !invalidated) return cached.data;
  if (invalidated) await redis.del(`antiraid:invalidate:${guildId}`).catch(() => {});

  try {
    // @ts-ignore
    const cfg = await prisma.antiRaidConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    antiRaidCache.set(guildId, { data: cfg as AntiRaidCfg, expiresAt: now + 5 * 60 * 1000 });
    return cfg as AntiRaidCfg;
  } catch {
    return null;
  }
}

// ── Expose le cache pour invalidation depuis index.ts ─────────────────────
export { antiRaidCache };

// ── Helper : ban + log DB + embed ─────────────────────────────────────────
async function banAndLog(
  member: GuildMember,
  cfg: AntiRaidCfg,
  type: string,
  detail: string,
  accountAge: number | null,
) {
  const { guild } = member;

  // 1. Ban
  try {
    await guild.members.ban(member.id, {
      deleteMessageSeconds: cfg.banPurgeDays * 86400,
      reason: `[Anti-Raid] ${type} — ${detail}`,
    });
  } catch (err) {
    logger.warn({ err, userId: member.id, guildId: guild.id }, 'Anti-Raid : impossible de bannir');
    return;
  }

  // 2. Log DB (fire-and-forget)
  // @ts-ignore
  prisma.antiRaidLog.create({
    data: {
      guildId: guild.id,
      type,
      userId: member.id,
      username: member.user.tag,
      ...(accountAge !== null ? { accountAge } : {}),
      action: 'banned',
      detail,
    },
  }).catch(() => {});

  // 3. Embed dans le salon de logs
  if (!cfg.logChannelId) return;
  try {
    const logChannel = guild.channels.cache.get(cfg.logChannelId);
    if (!logChannel?.isTextBased()) return;

    const typeLabels: Record<string, string> = {
      mass_join:       '🚨 Flood d\'arrivées',
      suspect_account: '🔍 Compte suspect',
      bot_api:         '🤖 Bot API non invité',
    };

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle(`[ANTI-RAID] ${typeLabels[type] ?? type}`)
      .addFields(
        { name: 'Utilisateur', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
        { name: 'ID', value: member.id, inline: true },
        { name: 'Action', value: `🔨 Banni (purge ${cfg.banPurgeDays}j)`, inline: true },
        { name: 'Détail', value: detail },
      )
      .setFooter({ text: `${guild.name}` })
      .setTimestamp();

    if (accountAge !== null) {
      embed.addFields({ name: 'Âge du compte', value: `${accountAge} jour${accountAge !== 1 ? 's' : ''}`, inline: true });
    }

    const ping = cfg.modPingRoleId ? `<@&${cfg.modPingRoleId}> ` : '';
    await (logChannel as any).send({ content: ping || undefined, embeds: [embed] });
  } catch (err) {
    logger.warn({ err }, 'Anti-Raid : impossible d\'envoyer le log');
  }
}

// ── Event principal ────────────────────────────────────────────────────────
export default {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    try {
      // ── Enregistrement MemberLog (stats) ──
      await prisma.memberLog.create({
        data: {
          guildId: member.guild.id,
          userId: member.id,
          username: member.user.username,
          type: 'join',
        },
      }).catch(() => {});

      // ── Anti-Raid ──────────────────────────────────────────────────────
      const cfg = await getAntiRaidConfig(member.guild.id);
      if (cfg && cfg.enabled) {
        const { guild, user } = member;
        const now = Date.now();

        // 1. Détection BOT API (bot rejoint sans invitation du fondateur)
        if (cfg.botApiEnabled && user.bot) {
          try {
            const auditLogs = await guild.fetchAuditLogs({ type: 28 /* BOT_ADD */, limit: 5 });
            const entry = auditLogs.entries.find(e => (e.target as any)?.id === user.id);
            const invitedByOwner =
              entry &&
              entry.executor?.id === guild.ownerId &&
              now - entry.createdTimestamp < 30_000;

            if (!invitedByOwner) {
              await banAndLog(
                member, cfg,
                'bot_api',
                `Bot/App ${user.tag} (${user.id}) a rejoint sans invitation du fondateur.`,
                null,
              );
              return; // arrêter ici — pas d'auto-rôle/bienvenue
            }
          } catch (err) {
            logger.warn({ err }, 'Anti-Raid : impossible de vérifier les audit logs');
          }
        }

        // 2. Détection COMPTE SUSPECT (trop récent)
        if (cfg.suspectEnabled && !user.bot) {
          const ageDays = Math.floor((now - user.createdTimestamp) / 86_400_000);
          if (ageDays < cfg.minAccountAge) {
            await banAndLog(
              member, cfg,
              'suspect_account',
              `Compte créé il y a ${ageDays}j (minimum configuré : ${cfg.minAccountAge}j).`,
              ageDays,
            );
            return;
          }
        }

        // 3. Détection FLOOD D'ARRIVÉES (sliding window Redis)
        if (cfg.joinEnabled && !user.bot) {
          const key = `antiraid:joins:${guild.id}`;
          const windowMs = cfg.joinWindow * 1000;

          await redis.lpush(key, now.toString());
          await redis.ltrim(key, 0, cfg.joinThreshold * 3);
          await redis.expire(key, cfg.joinWindow * 2);

          const entries = await redis.lrange(key, 0, -1);
          const recentCount = entries.filter(ts => now - parseInt(ts) < windowMs).length;

          if (recentCount >= cfg.joinThreshold) {
            await redis.del(key); // éviter multi-trigger
            await banAndLog(
              member, cfg,
              'mass_join',
              `${recentCount} membres ont rejoint en moins de ${cfg.joinWindow}s (seuil : ${cfg.joinThreshold}).`,
              null,
            );
            return;
          }
        }
      }

      // ── Config du serveur (fallback auto-rôle legacy) ──────────────────
      const config = await getGuildConfig(member.guild.id, member.guild.name);

      // ── Arrivées & Départs (auto-rôle + bienvenue) ──────────────────────
      const arrCfg = await getArriveesConfig(member.guild.id);

      // Auto-rôle : priorité ArriveesDepartsConfig, fallback Guild.autoRole
      const autoRoleId = (arrCfg?.autoRoleEnabled && arrCfg?.autoRoleId) ? arrCfg.autoRoleId : config.autoRole;
      if (autoRoleId) {
        await member.roles.add(autoRoleId).catch((err) => {
          logger.warn({ err }, `Impossible d'attribuer l'auto-rôle dans ${member.guild.name}`);
        });
      }
      if (arrCfg) {
        await sendWelcomeGoodbye(member, arrCfg, 'welcome');
      } else if (config.welcomeChannel && config.welcomeMessage) {
        // Fallback ancienne config Guild (rétro-compatibilité)
        const channel = member.guild.channels.cache.get(config.welcomeChannel);
        if (channel?.type === ChannelType.GuildText) {
          const message = config.welcomeMessage
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount.toString());
          await (channel as any).send(message).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans guildMemberAdd');
    }
  },
};
