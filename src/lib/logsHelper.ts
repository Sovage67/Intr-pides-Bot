import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogCategory =
  | 'logArrivees' | 'logDeparts' | 'logPseudos' | 'logExclusions'
  | 'logBans' | 'logMutes' | 'logWarns' | 'logAntiInsulte' | 'logAntiRaid'
  | 'logMsgDelete' | 'logMsgEdit' | 'logMsgReport' | 'logMsgPin'
  | 'logSalons' | 'logThreads' | 'logServeur' | 'logWebhooks' | 'logIntegrations'
  | 'logRolesAttrib' | 'logRolesGestion'
  | 'logEmojis' | 'logStickers' | 'logReactions'
  | 'logVocal' | 'logStage' | 'logEvenements'
  | 'logInvitations' | 'logTickets' | 'logXP' | 'logCommandes' | 'logAutoMod';

interface LogsConfig {
  enabled: boolean;
  globalChannelId: string | null;
  [key: string]: boolean | string | null;
}

// ─── Cache mémoire (TTL 5 min) ───────────────────────────────────────────────

const logsCache = new Map<string, { cfg: LogsConfig; exp: number }>();
const TTL = 5 * 60 * 1000;

async function getLogsConfig(guildId: string): Promise<LogsConfig | null> {
  const now = Date.now();
  const cached = logsCache.get(guildId);
  if (cached && cached.exp > now) return cached.cfg;

  try {
    const cfg = await prisma.logsConfig.findUnique({ where: { guildId } });
    if (!cfg) return null;
    logsCache.set(guildId, { cfg: cfg as unknown as LogsConfig, exp: now + TTL });
    return cfg as unknown as LogsConfig;
  } catch {
    return null;
  }
}

export function invalidateLogsCache(guildId: string) {
  logsCache.delete(guildId);
}

// ─── Fonction principale ─────────────────────────────────────────────────────

export async function sendLog(
  client: Client,
  guildId: string,
  category: LogCategory,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const cfg = await getLogsConfig(guildId);
    if (!cfg || !cfg.enabled) return;
    if (!cfg[category]) return;
    if (!cfg.globalChannelId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(cfg.globalChannelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed] });
  } catch {
    // silencieux — les logs ne doivent jamais crasher le bot
  }
}

// ─── Builders d'embeds réutilisables ─────────────────────────────────────────

export const LogColors = {
  join:    0x57F287, // vert
  leave:   0xED4245, // rouge
  warn:    0xF0B232, // or
  ban:     0xED4245, // rouge
  unban:   0x57F287, // vert
  mute:    0xEB459E, // rose
  edit:    0xF0B232, // or
  delete:  0xED4245, // rouge
  update:  0x88ddff, // cyan
  create:  0x57F287, // vert
  remove:  0xED4245, // rouge
  voice:   0x9146FF, // violet
  info:    0x5865F2, // bleu discord
} as const;

export function makeEmbed(color: number, title: string, description?: string): EmbedBuilder {
  const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) e.setDescription(description);
  return e;
}

// ─── Subscriber Redis (invalidation cache) ───────────────────────────────────
// Appelé depuis index.ts lors du subscribe 'logs:update'
export function handleLogsUpdate(data: { guildId: string }) {
  invalidateLogsCache(data.guildId);
}
