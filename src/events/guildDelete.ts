/**
 * Event guildDelete : déclenché quand le bot est retiré d'un serveur.
 *
 * Comportement :
 *  1. Marquer le Guild comme inactif en BDD (on garde les données 30 jours
 *     pour si l'utilisateur réinstalle, mais on libère le slot freemium).
 *  2. Si l'installateur avait d'autres serveurs gelés faute de quota, en
 *     dégeler le plus ancien automatiquement.
 */

import { Events, type Guild } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { countServersForInstaller, FREE_QUOTA } from '../lib/freemium.js';

export default {
  name: Events.GuildDelete,
  async execute(guild: Guild) {
    try {
      const record = await prisma.guild.findUnique({
        where: { id: guild.id },
        select: { installerUserId: true },
      });

      // Suppression : cascade sur Member/Warn (defini dans le schéma)
      await prisma.guild.delete({ where: { id: guild.id } }).catch(() => {});
      logger.info({ guildId: guild.id, name: guild.name }, 'Bot retiré d\'un serveur, données purgées');

      const installerUserId = record?.installerUserId;
      if (!installerUserId) return;

      // Si l'installateur a maintenant un slot libre, dégèle son plus ancien serveur frozen
      const { free } = await countServersForInstaller(installerUserId);
      if (free < FREE_QUOTA) {
        const oldestFrozen = await prisma.guild.findFirst({
          where: { installerUserId, licenseFrozen: true, premium: false },
          orderBy: { createdAt: 'asc' },
        });
        if (oldestFrozen) {
          await prisma.guild.update({
            where: { id: oldestFrozen.id },
            data: { licenseFrozen: false },
          });
          logger.info(
            { guildId: oldestFrozen.id, installerUserId },
            'Serveur dégelé suite à libération d\'un slot freemium',
          );
        }
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id }, 'Erreur dans guildDelete');
    }
  },
};
