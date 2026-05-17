import { Events, type MessageReaction, type User } from 'discord.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction: MessageReaction, user: User) {
    // Ignorer les bots et les réactions hors serveur
    if (user.bot) return;
    if (!reaction.message.guildId) return;

    try {
      // Si le message est partial (pas encore en cache), on le fetch
      if (reaction.partial) {
        await reaction.fetch().catch(() => {});
      }

      const guildId = reaction.message.guildId;
      const nowUtc = new Date();
      const bucket = new Date(Date.UTC(
        nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), nowUtc.getUTCHours(),
      ));

      // @ts-ignore — ReactionActivity ajouté via migration Prisma
      await prisma.reactionActivity.upsert({
        where: { guildId_bucket: { guildId, bucket } },
        create: { guildId, bucket, count: 1 },
        update: { count: { increment: 1 } },
      }).catch(() => {});
    } catch (err) {
      logger.error({ err }, 'Erreur dans messageReactionAdd');
    }
  },
};
