import { Events, type Message, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { getGuildConfig } from '../lib/cache.js';
import { logger } from '../lib/logger.js';
import { containsBadWord } from '../lib/badWords.js';

const XP_COOLDOWN_SECONDS = 60;
const XP_PER_MESSAGE = { min: 15, max: 25 };

// ── Anti-Raid : cache config + détection liens ─────────────────────────────
type AntiRaidCfg = {
  enabled: boolean;
  linkEnabled: boolean;
  linkThreshold: number;
  linkWindow: number;
  banPurgeDays: number;
  logChannelId: string | null;
  modPingRoleId: string | null;
};
const antiRaidMsgCache = new Map<string, { data: AntiRaidCfg; expiresAt: number }>();

async function getAntiRaidCfgForMsg(guildId: string): Promise<AntiRaidCfg | null> {
  const now = Date.now();
  const cached = antiRaidMsgCache.get(guildId);
  const invalidated = cached ? await redis.get(`antiraid:invalidate:${guildId}`) : null;
  if (cached && cached.expiresAt > now && !invalidated) return cached.data;
  if (invalidated) await redis.del(`antiraid:invalidate:${guildId}`).catch(() => {});
  try {
    // @ts-ignore
    const cfg = await prisma.antiRaidConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    antiRaidMsgCache.set(guildId, { data: cfg as AntiRaidCfg, expiresAt: now + 5 * 60 * 1000 });
    return cfg as AntiRaidCfg;
  } catch { return null; }
}

const URL_REGEX = /https?:\/\/[^\s<>]+/gi;

// ── Traduction auto : cache config ────────────────────────────────────────────
type TraductionCfg = {
  enabled: boolean;
  targetLang: string;
  mode: string;         // reply | embed
  channelMode: string;  // all | whitelist | blacklist
  channels: string[];
  skipSameLang: boolean;
};
const traductionCache = new Map<string, { data: TraductionCfg; expiresAt: number }>();

async function getTraductionCfg(guildId: string): Promise<TraductionCfg | null> {
  const now = Date.now();
  const cached = traductionCache.get(guildId);
  const invalidated = cached ? await redis.get(`traduction:invalidate:${guildId}`) : null;
  if (cached && cached.expiresAt > now && !invalidated) return cached.data;
  if (invalidated) await redis.del(`traduction:invalidate:${guildId}`).catch(() => {});
  try {
    // @ts-ignore
    const cfg = await prisma.traductionConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    traductionCache.set(guildId, { data: cfg as TraductionCfg, expiresAt: now + 5 * 60 * 1000 });
    return cfg as TraductionCfg;
  } catch { return null; }
}

async function translateWithLibreTranslate(text: string, targetLang: string): Promise<{ text: string; sourceLang: string } | null> {
  const baseUrl = (process.env.LIBRETRANSLATE_URL ?? 'https://libretranslate.com').replace(/\/$/, '');
  const apiKey = process.env.LIBRETRANSLATE_API_KEY ?? '';
  try {
    const body: Record<string, string> = {
      q: text.slice(0, 1500),
      source: 'auto',
      target: targetLang,
      format: 'text',
    };
    if (apiKey) body.api_key = apiKey;
    const res = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json() as { translatedText: string; detectedLanguage?: { language: string; confidence: number } };
    if (!data.translatedText) return null;
    return { text: data.translatedText, sourceLang: data.detectedLanguage?.language ?? '?' };
  } catch { return null; }
}

type BotModules = {
  translation?: boolean;
  economy?: boolean;
  levels?: boolean;
  moderation?: boolean;
  antiInsulte?: boolean;
};

// Cache en mémoire pour la config anti-insulte (TTL 5 min)
const antiInsulteCache = new Map<string, { data: AntiInsulteCfg; expiresAt: number }>();
type AntiInsulteCfg = {
  enabled: boolean;
  words: string[];
  removedDefaultWords: string[];
  action: string;
  timeoutDuration: number;
  kickAfterWarns: number;
  warnMaxCount: number;
  warnMessages: string[];
  warnDm: boolean;
  exemptRoles: string[];
  exemptChannels: string[];
  logChannelId: string | null;
  modPingRoleId: string | null;
};

async function getAntiInsulteConfig(guildId: string): Promise<AntiInsulteCfg | null> {
  const now = Date.now();
  const cached = antiInsulteCache.get(guildId);

  // Vérifier si le dashboard a publié une invalidation
  const invalidated = cached ? await redis.get(`antiinsulte:invalidate:${guildId}`) : null;

  if (cached && cached.expiresAt > now && !invalidated) return cached.data;

  if (invalidated) {
    await redis.del(`antiinsulte:invalidate:${guildId}`).catch(() => {});
  }

  try {
    // @ts-ignore
    const cfg = await prisma.antiInsulteConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    antiInsulteCache.set(guildId, { data: cfg as AntiInsulteCfg, expiresAt: now + 5 * 60 * 1000 });
    return cfg as AntiInsulteCfg;
  } catch {
    return null;
  }
}

function xpForLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export default {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot || !message.inGuild()) return;

    try {
      // ── Activité messages (toujours tracké, peu importe les modules) ───────
      const nowUtc = new Date();
      const bucket = new Date(Date.UTC(
        nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), nowUtc.getUTCHours(),
      ));
      // @ts-ignore — MessageActivity ajouté via migration Prisma
      await prisma.messageActivity.upsert({
        where: { guildId_bucket: { guildId: message.guildId, bucket } },
        create: { guildId: message.guildId, bucket, count: 1 },
        update: { count: { increment: 1 } },
      }).catch(() => {});

      const config = await getGuildConfig(message.guildId, message.guild.name);
      const modules = (config.modules ?? {}) as BotModules;

      // ── Anti-Insulte ────────────────────────────────────────────────────────
      if (modules.antiInsulte !== false) {
        const aiCfg = await getAntiInsulteConfig(message.guildId);
        if (aiCfg?.enabled) {
          const memberRoles = message.member?.roles.cache.map(r => r.id) ?? [];
          const isExemptRole = aiCfg.exemptRoles.some(r => memberRoles.includes(r));
          const isExemptChannel = aiCfg.exemptChannels.includes(message.channelId);

          if (!isExemptRole && !isExemptChannel) {
            const { found, word } = containsBadWord(message.content, aiCfg.words, aiCfg.removedDefaultWords ?? []);
            if (found) {
              // Supprimer le message (toujours)
              await message.delete().catch(() => {});

              // ── Cooldown 5 min entre deux actions pour le même utilisateur ──
              if (aiCfg.action !== 'delete') {
                const warnCdKey = `ai:warncd:${message.guildId}:${message.author.id}`;
                const onWarnCooldown = await redis.get(warnCdKey);
                if (onWarnCooldown) return; // Message supprimé, action déjà appliquée récemment
                await redis.set(warnCdKey, '1', 'EX', 300); // 5 minutes
              }

              // Appliquer l'action configurée
              if (aiCfg.action === 'warn' || aiCfg.action === 'timeout' || aiCfg.action === 'kick') {
                const me = message.guild.members.me;
                const target = message.member;
                if (me && target) {
                  try {
                    if (aiCfg.action === 'warn') {
                      // Enregistrer le warn en DB
                      await prisma.warn.create({
                        data: {
                          guildId: message.guildId,
                          userId: message.author.id,
                          modId: me.id,
                          reason: `[Auto-Insulte] ${word}`,
                        },
                      }).catch(() => {});

                      // Compter le rang du warn pour choisir le bon message
                      const warnCount = await prisma.warn.count({
                        where: { guildId: message.guildId, userId: message.author.id },
                      }).catch(() => 1);

                      // Message correspondant au rang (le dernier si dépassé)
                      const messages = aiCfg.warnMessages ?? [];
                      const msgIndex = Math.min(warnCount - 1, messages.length - 1);
                      const templateMsg = messages[msgIndex] ?? null;
                      const warnText = templateMsg
                        ? templateMsg
                            .replace(/{user}/g, `<@${message.author.id}>`)
                            .replace(/{server}/g, message.guild.name)
                            .replace(/{word}/g, word ?? '?')
                            .replace(/{warn}/g, String(warnCount))
                        : `⚠️ Avertissement n°${warnCount} sur **${message.guild.name}** — insulte détectée (\`${word}\`).`;

                      // Envoi en DM
                      if (aiCfg.warnDm !== false) {
                        await message.author.send(warnText).catch(() => {});
                      }
                    } else if (aiCfg.action === 'timeout') {
                      if (me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                        await target.timeout(aiCfg.timeoutDuration * 1000, `[Auto-Insulte] ${word}`).catch(() => {});
                        await message.author.send(`🔇 Tu as été mis en sourdine sur **${message.guild.name}** pour ${Math.round(aiCfg.timeoutDuration / 60)} min (insulte).`).catch(() => {});
                      }
                    } else if (aiCfg.action === 'kick') {
                      // Ajouter d'abord un warn
                      await prisma.warn.create({
                        data: {
                          guildId: message.guildId,
                          userId: message.author.id,
                          modId: me.id,
                          reason: `[Auto-Insulte] ${word}`,
                        },
                      }).catch(() => {});
                      // Compter les warns totaux
                      const warnCount = await prisma.warn.count({
                        where: { guildId: message.guildId, userId: message.author.id },
                      }).catch(() => 0);
                      const threshold = aiCfg.kickAfterWarns ?? 3;
                      if (warnCount >= threshold && me.permissions.has(PermissionFlagsBits.KickMembers)) {
                        await message.author.send(`👢 Tu as été expulsé de **${message.guild.name}** après ${warnCount} avertissement(s) pour insulte.`).catch(() => {});
                        await target.kick(`[Auto-Insulte] ${warnCount} warns — ${word}`).catch(() => {});
                      } else {
                        await message.author.send(`⚠️ Avertissement ${warnCount}/${threshold} sur **${message.guild.name}** — insulte détectée. Tu seras expulsé à ${threshold} avertissement(s).`).catch(() => {});
                      }
                    } else if (aiCfg.action === 'ban') {
                      if (me.permissions.has(PermissionFlagsBits.BanMembers)) {
                        await message.author.send(`🔨 Tu as été banni de **${message.guild.name}** pour insulte.`).catch(() => {});
                        await message.guild.members.ban(message.author.id, { reason: `[Auto-Insulte] ${word}`, deleteMessageSeconds: 0 }).catch(() => {});
                      }
                    }
                  } catch (err) {
                    logger.error({ err }, 'Anti-insulte: erreur lors de l\'action');
                  }
                }
              }

              // Enregistrement en base (historique + compteur)
              // @ts-ignore
              prisma.antiInsulteLog.create({
                data: {
                  guildId: message.guildId,
                  userId: message.author.id,
                  username: message.author.tag,
                  word: word ?? '?',
                  action: aiCfg.action,
                  messageContent: message.content.slice(0, 500),
                },
              }).catch(() => {});

              // Log dans le channel configuré
              if (aiCfg.logChannelId) {
                try {
                  const logChannel = message.guild.channels.cache.get(aiCfg.logChannelId);
                  if (logChannel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                      .setColor(0xED4245)
                      .setTitle('🚫 Anti-Insulte — Message supprimé')
                      .addFields(
                        { name: 'Utilisateur', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                        { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
                        { name: 'Action', value: aiCfg.action.toUpperCase(), inline: true },
                        { name: 'Mot détecté', value: `\`${word}\``, inline: true },
                        { name: 'Message', value: message.content.slice(0, 500) || '(vide)' },
                      )
                      .setTimestamp();
                    // Ping modérateurs si configuré
                    const pingContent = aiCfg.modPingRoleId ? `<@&${aiCfg.modPingRoleId}>` : undefined;
                    await logChannel.send({ content: pingContent, embeds: [embed] }).catch(() => {});
                  }
                } catch {}
              }

              return; // Ne pas continuer le traitement XP etc.
            }
          }
        }
      }

      // ── Anti-Raid : Détection spam de liens multi-canaux ──────────────────
      const arCfg = await getAntiRaidCfgForMsg(message.guildId);
      if (arCfg?.enabled && arCfg.linkEnabled) {
        const links = message.content.match(URL_REGEX);
        if (links && links.length > 0) {
          const now2 = Date.now();
          const linkKey = `antiraid:links:${message.guildId}:${message.author.id}`;
          const windowMs = arCfg.linkWindow * 1000;

          // Enregistrer chaque lien avec timestamp
          for (const _ of links) {
            await redis.lpush(linkKey, now2.toString());
          }
          await redis.ltrim(linkKey, 0, arCfg.linkThreshold * 4);
          await redis.expire(linkKey, arCfg.linkWindow * 2);

          const entries2 = await redis.lrange(linkKey, 0, -1);
          const recentLinks = entries2.filter(ts => now2 - parseInt(ts) < windowMs).length;

          if (recentLinks >= arCfg.linkThreshold) {
            await redis.del(linkKey);

            // Supprimer le message
            await message.delete().catch(() => {});

            // Ban
            const member2 = message.member;
            if (member2) {
              try {
                await message.guild.members.ban(member2.id, {
                  deleteMessageSeconds: arCfg.banPurgeDays * 86400,
                  reason: `[Anti-Raid] Spam de liens — ${recentLinks} lien(s) en ${arCfg.linkWindow}s`,
                });
              } catch {}
            }

            // Log DB
            // @ts-ignore
            prisma.antiRaidLog.create({
              data: {
                guildId: message.guildId,
                type: 'link_spam',
                userId: message.author.id,
                username: message.author.tag,
                action: 'banned',
                detail: `${recentLinks} lien(s) en ${arCfg.linkWindow}s dans #${(message.channel as any).name ?? message.channelId}`,
              },
            }).catch(() => {});

            // Embed de log
            if (arCfg.logChannelId) {
              try {
                const logCh = message.guild.channels.cache.get(arCfg.logChannelId);
                if (logCh?.isTextBased()) {
                  const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('[ANTI-RAID] 🔗 Spam de liens')
                    .addFields(
                      { name: 'Utilisateur', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                      { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
                      { name: 'Action', value: `🔨 Banni (purge ${arCfg.banPurgeDays}j)`, inline: true },
                      { name: 'Détail', value: `${recentLinks} lien(s) en ${arCfg.linkWindow}s` },
                    )
                    .setTimestamp();
                  const ping = arCfg.modPingRoleId ? `<@&${arCfg.modPingRoleId}> ` : '';
                  await (logCh as any).send({ content: ping || undefined, embeds: [embed] });
                }
              } catch {}
            }
            return; // arrêter ici
          }
        }
      }

      // ── Traduction auto ────────────────────────────────────────────────────
      if (modules.translation !== false && message.content.trim().length > 2) {
        const trCfg = await getTraductionCfg(message.guildId);
        if (trCfg?.enabled) {
          // Vérifier si le salon est autorisé
          let channelAllowed = true;
          if (trCfg.channelMode === 'whitelist') {
            channelAllowed = trCfg.channels.includes(message.channelId);
          } else if (trCfg.channelMode === 'blacklist') {
            channelAllowed = !trCfg.channels.includes(message.channelId);
          }

          if (channelAllowed) {
            const result = await translateWithLibreTranslate(message.content, trCfg.targetLang);
            if (result) {
              const srcBase = result.sourceLang.toLowerCase();
              const tgtBase = trCfg.targetLang.toLowerCase();
              const sameLanguage = trCfg.skipSameLang && srcBase === tgtBase;

              if (!sameLanguage) {
                const flagMap: Record<string, string> = {
                  fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', de: '🇩🇪', it: '🇮🇹', pt: '🇵🇹',
                  nl: '🇳🇱', pl: '🇵🇱', ru: '🇷🇺', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳',
                  ar: '🇸🇦', tr: '🇹🇷', sv: '🇸🇪', da: '🇩🇰', nb: '🇳🇴', fi: '🇫🇮',
                  uk: '🇺🇦', id: '🇮🇩',
                };
                const flag = flagMap[tgtBase] ?? '🌐';

                if (trCfg.mode === 'embed') {
                  const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(result.text)
                    .setFooter({ text: `${flag} Traduit de ${result.sourceLang} → ${trCfg.targetLang}` });
                  await message.reply({ embeds: [embed] }).catch(() => {});
                } else {
                  // mode reply : texte simple + flag
                  await message.reply(`${flag} *${result.text}*`).catch(() => {});
                }
              }
            }
          }
        }
      }

      // ── XP (niveaux) ───────────────────────────────────────────────────────
      if (modules.levels === false) return;

      const cdKey = `xpcd:${message.guildId}:${message.author.id}`;
      const onCooldown = await redis.get(cdKey);
      if (onCooldown) return;
      await redis.set(cdKey, '1', 'EX', XP_COOLDOWN_SECONDS);

      const xpGain =
        Math.floor(Math.random() * (XP_PER_MESSAGE.max - XP_PER_MESSAGE.min + 1)) +
        XP_PER_MESSAGE.min;

      await prisma.user.upsert({
        where: { id: message.author.id },
        create: { id: message.author.id, username: message.author.username },
        update: { username: message.author.username },
      });

      const member = await prisma.member.upsert({
        where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
        create: { guildId: message.guildId, userId: message.author.id, xp: xpGain },
        update: { xp: { increment: xpGain } },
      });

      const requiredXp = xpForLevel(member.level);
      if (member.xp >= requiredXp) {
        const newLevel = member.level + 1;
        await prisma.member.update({
          where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
          data: { level: newLevel, xp: member.xp - requiredXp },
        });
        await message.channel
          .send(`🎉 <@${message.author.id}> passe au **niveau ${newLevel}** !`)
          .catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, 'Erreur dans messageCreate');
    }
  },
};
