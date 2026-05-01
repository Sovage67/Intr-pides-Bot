import { redis } from './redis.js';
import { prisma } from './prisma.js';
import type { Guild } from '@prisma/client';

const TTL_SECONDS = 300; // 5 minutes

/**
 * Récupère la configuration d'une guilde, depuis le cache Redis si disponible,
 * sinon depuis la base de données. Crée la guilde si elle n'existe pas.
 */
export async function getGuildConfig(
  guildId: string,
  guildName: string,
): Promise<Guild> {
  const cached = await redis.get(`guild:${guildId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  let guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) {
    guild = await prisma.guild.create({
      data: { id: guildId, name: guildName },
    });
  }

  await redis.set(`guild:${guildId}`, JSON.stringify(guild), 'EX', TTL_SECONDS);
  return guild;
}

export async function invalidateGuildCache(guildId: string): Promise<void> {
  await redis.del(`guild:${guildId}`);
}
