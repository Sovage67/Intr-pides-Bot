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
  // SET NX EX : atomique — pas de race condition entre le check et le set
  const claimed = await redis.set(key, '1', { NX: true, EX: seconds });
  if (claimed === 'OK') return null; // slot libre, cooldown posé
  // Déjà en cooldown → on renvoie le TTL restant
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : null;
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
  const claimed = await redis.set(key, '1', { NX: true, EX: seconds });
  if (claimed === 'OK') return null;
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : null;
}
