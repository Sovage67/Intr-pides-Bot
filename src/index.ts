import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { logger } from './lib/logger.js';
import { redis, redisSub } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { startBotServer } from './server.js';
import type { SlashCommand } from './lib/types.js';
import { postTicketPanel } from './commands/utility/ticket.js';

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, SlashCommand>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

client.commands = new Collection<string, SlashCommand>();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const categories = readdirSync(commandsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const categoryPath = join(commandsPath, category);
    const files = readdirSync(categoryPath).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.js'),
    );
    for (const file of files) {
      const mod = await import(pathToFileURL(join(categoryPath, file)).href);
      const command: SlashCommand = mod.default;
      if (command?.data && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
        logger.info(`Commande chargée : /${command.data.name}`);
      }
    }
  }
}

async function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const files = readdirSync(eventsPath).filter(
    (f) => f.endsWith('.ts') || f.endsWith('.js'),
  );

  for (const file of files) {
    const mod = await import(pathToFileURL(join(eventsPath, file)).href);
    const event = mod.default;
    if (event?.name && event?.execute) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      logger.info(`Event chargé : ${event.name}`);
    }
  }
}

async function setupRedisPubSub() {
  await redisSub.subscribe('guild:update', 'antiinsulte:update', 'antiraid:update', 'arrivees:update', 'tickets:post-panel', 'tickets:setup-logs-channel', 'bot-personnalise:update');
  redisSub.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      if (channel === 'guild:update') {
        logger.info({ data }, 'Mise à jour reçue depuis le dashboard');
        redis.del(`guild:${data.guildId}`).catch(() => {});
      } else if (channel === 'antiinsulte:update') {
        logger.info({ data }, 'Config anti-insulte mise à jour');
        redis.set(`antiinsulte:invalidate:${data.guildId}`, '1', 'EX', 60).catch(() => {});
      } else if (channel === 'antiraid:update') {
        logger.info({ data }, 'Config anti-raid mise à jour');
        redis.set(`antiraid:invalidate:${data.guildId}`, '1', 'EX', 60).catch(() => {});
      } else if (channel === 'arrivees:update') {
        logger.info({ data }, 'Config arrivées & départs mise à jour');
        redis.set(`arrivees:invalidate:${data.guildId}`, '1', 'EX', 60).catch(() => {});
      } else if (channel === 'tickets:post-panel') {
        logger.info({ data }, 'Poster panel tickets demandé depuis le dashboard');
        const guild = client.guilds.cache.get(data.guildId);
        if (!guild) { logger.warn({ guildId: data.guildId }, 'Guild introuvable pour post-panel'); return; }
        postTicketPanel(guild, data.channelId)
          .then(result => {
            if (!result.ok) logger.error({ result }, 'Erreur postTicketPanel');
            else logger.info({ guildId: data.guildId }, 'Panel tickets posté avec succès');
          })
          .catch(err => logger.error({ err }, 'Erreur postTicketPanel'));
      } else if (channel === 'tickets:setup-logs-channel') {
        logger.info({ data }, 'Création salon logs-tickets demandée');
        const guild = client.guilds.cache.get(data.guildId);
        if (!guild) { logger.warn({ guildId: data.guildId }, 'Guild introuvable pour setup-logs-channel'); return; }
        (async () => {
          try {
            const { prisma: db } = await import('./lib/prisma.js');
            const { ChannelType, PermissionFlagsBits } = await import('discord.js');
            // Vérifier si un salon logs existe déjà dans cette catégorie
            const existing = await db.ticketConfig.findUnique({ where: { guildId: data.guildId } });
            if (existing?.logChannelId) {
              const existingCh = guild.channels.cache.get(existing.logChannelId);
              if (existingCh) { logger.info({ guildId: data.guildId }, 'Salon logs déjà existant, skip'); return; }
            }
            // Créer le salon #logs-tickets dans la catégorie
            const logsChannel = await guild.channels.create({
              name: 'logs-tickets',
              type: ChannelType.GuildText,
              parent: data.categoryId ?? undefined,
              permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: guild.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                // Les modRoles ont accès
                ...(existing?.modRoles ?? []).map((roleId: string) => ({
                  id: roleId,
                  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                })),
              ],
            });
            // Sauvegarder logChannelId en DB
            await db.ticketConfig.update({
              where: { guildId: data.guildId },
              data: { logChannelId: logsChannel.id },
            });
            logger.info({ guildId: data.guildId, channelId: logsChannel.id }, 'Salon logs-tickets créé avec succès');
          } catch (err) {
            logger.error({ err }, 'Erreur création salon logs-tickets');
          }
        })();
      } else if (channel === 'bot-personnalise:update') {
        logger.info({ data }, 'Config bot personnalisé mise à jour');
        const guild = client.guilds.cache.get(data.guildId);
        if (!guild) return;
        (async () => {
          try {
            const { ActivityType } = await import('discord.js');
            const { prisma: db } = await import('./lib/prisma.js');

            // Si le module vient d'être désactivé → reset surnom
            if (data.enabled === false) {
              await guild.members.me?.setNickname(null).catch(() => {});
              logger.info({ guildId: data.guildId }, 'Bot Personnalisé désactivé — surnom réinitialisé');
              return;
            }

            // Surnom
            if ('nickname' in data) {
              await guild.members.me?.setNickname(data.nickname ?? null).catch(() => {});
            }

            // Couleurs (stockées en DB uniquement, pas d'action Discord)
            // avatarUrl : non appliqué automatiquement (limite Discord 2 changements/heure)

            // Activité — relire la config complète pour avoir tous les champs à jour
            const cfg = await db.botPersonnaliseConfig.findUnique({ where: { guildId: data.guildId } });
            if (cfg?.enabled && cfg.activityText) {
              const actTypeMap: Record<string, number> = {
                PLAYING:   ActivityType.Playing,
                WATCHING:  ActivityType.Watching,
                LISTENING: ActivityType.Listening,
                STREAMING: ActivityType.Streaming,
                CUSTOM:    ActivityType.Custom,
              };
              client.user?.setPresence({
                status: (cfg.status as 'online' | 'idle' | 'dnd' | 'invisible') ?? 'online',
                activities: [{
                  name: cfg.activityText,
                  type: actTypeMap[cfg.activityType] ?? ActivityType.Playing,
                  url:  cfg.streamUrl ?? undefined,
                }],
              });
            }
          } catch (err) {
            logger.error({ err }, 'Erreur application bot personnalisé');
          }
        })();
      }
    } catch (err) {
      logger.error({ err }, 'Erreur parsing message Redis');
    }
  });
}

function setupShutdown() {
  const shutdown = async () => {
    logger.info('Arrêt en cours...');
    await client.destroy();
    await redis.quit();
    await redisSub.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  await loadCommands();
  await loadEvents();
  await setupRedisPubSub();
  setupShutdown();
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN manquant');
  await client.login(token);
  startBotServer(client, Number(process.env.PORT) || 3001);
}

main().catch(err => {
  logger.error(err, 'Erreur fatale');
  process.exit(1);
});
