import { redis } from './redis.js';

/**
 * Vérifie et applique un cooldown par utilisateur/commande via Redis.
 *
 * @param userId     ID Discord de l'utilisateur
 * @param commandName Nom de la commande
 * @param seconds    Durée du cooldown en secondes
 * @returns `null` si l'utilisateur peut lancer la commande,
 *          ou le nombre de secondes restantes si en cooldown
 */
export async function checkCooldown(
  userId: string,
  commandName: string,
  seconds: number,
): Promise<number | null> {
  const key = `cooldown:${commandName}:${userId}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) return ttl; // en cooldown
  await redis.set(key, '1', 'EX', seconds);
  return null;
}

/**
 * Vérifie et applique un cooldown global par guilde/commande.
 * Utile pour les commandes coûteuses (clear, raid, etc.)
 *
 * @returns `null` si OK, sinon le TTL restant en secondes
 */
export async function checkGuildCooldown(
  guildId: string,
  commandName: string,
  seconds: number,
): Promise<number | null> {
  const key = `cooldown:guild:${commandName}:${guildId}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) return ttl;
  await redis.set(key, '1', 'EX', seconds);
  return null;
}
