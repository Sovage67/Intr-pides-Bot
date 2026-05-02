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
  await redisSub.subscribe('guild:update');
  redisSub.on('message', (channel, message) => {
    if (channel === 'guild:update') {
      try {
        const data = JSON.parse(message);
        logger.info({ data }, 'Mise à jour reçue depuis le dashboard');
        redis.del(`guild:${data.guildId}`).catch(() => {});
      } catch (err) {
        logger.error({ err }, 'Erreur parsing message Redis');
      }
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
  try {
    await loadCommands();
    await loadEvents();
    await setupRedisPubSub();
    setupShutdown();

    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('DISCORD_TOKEN manquant dans .env');

    // Serveur HTTP pour UptimeRobot (empêche Render free tier de mettre en veille)
    const httpPort = Number(process.env.PORT ?? process.env.BOT_HTTP_PORT ?? 3002);
    startBotServer(client, httpPort);

    await client.login(token);
  } catch (err) {
    logger.fatal({ err }, 'Erreur au démarrage du bot');
    process.exit(1);
  }
}

main();
