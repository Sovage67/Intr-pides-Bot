import { createServer } from 'node:http';
import { logger } from './lib/logger.js';
import type { Client } from 'discord.js';

/**
 * Serveur HTTP minimaliste exposé par le bot.
 *
 * Utilité principale : permettre à UptimeRobot (ou équivalent) de pinger
 * le bot toutes les 5-14 minutes pour empêcher Render free tier de mettre
 * le service en veille (Render free tier coupe les services après 15 min
 * sans requête HTTP).
 *
 * UptimeRobot URL à configurer : https://[ton-bot].onrender.com/health
 */
export function startBotServer(client: Client, port: number): void {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/' || url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          ready: client.isReady(),
          guilds: client.guilds.cache.size,
          uptime: Math.floor(process.uptime()),
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info(`Serveur HTTP bot démarré sur le port ${port} (pour UptimeRobot)`);
  });
}
