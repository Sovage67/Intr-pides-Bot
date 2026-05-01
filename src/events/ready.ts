import { Events, type Client } from 'discord.js';
import { logger } from '../lib/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client<true>) {
    logger.info(`Bot connecté en tant que ${client.user.tag}`);
    logger.info(`Présent sur ${client.guilds.cache.size} serveur(s)`);

    client.user.setPresence({
      activities: [{ name: '/help', type: 0 }],
      status: 'online',
    });
  },
};
