import { Events, ActivityType, type Client } from 'discord.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client<true>) {
    logger.info(`Bot connecté en tant que ${client.user.tag}`);
    logger.info(`Présent sur ${client.guilds.cache.size} serveur(s)`);

    // Présence par défaut
    client.user.setPresence({
      activities: [{ name: 'Version 0.1', type: ActivityType.Playing }],
      status: 'online',
    });

    // Restaurer les configs Bot Personnalisé activées
    try {
      const configs = await prisma.botPersonnaliseConfig.findMany({
        where: { enabled: true },
      });

      for (const cfg of configs) {
        const guild = client.guilds.cache.get(cfg.guildId);
        if (!guild) continue;

        // Appliquer le surnom sur le serveur
        await guild.members.me?.setNickname(cfg.nickname ?? null).catch(() => {});
        logger.info({ guildId: cfg.guildId, nickname: cfg.nickname }, 'Surnom bot restauré');
      }

      logger.info(`Bot Personnalisé : ${configs.length} config(s) restaurée(s)`);
    } catch (err) {
      logger.error({ err }, 'Erreur restauration configs Bot Personnalisé');
    }
  },
};
