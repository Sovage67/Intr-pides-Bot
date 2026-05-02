/**
 * Couche freemium côté bot.
 *
 * Règle : 1 utilisateur Discord = 1 serveur gratuit. Au-delà → les autres
 * serveurs installés par ce même utilisateur sont "gelés" (modules premium
 * désactivés). Le Premium débloque jusqu'à 5 serveurs.
 *
 * La détection se fait par `installerUserId` (lu dans l'audit log au moment
 * où le bot rejoint un serveur — voir events/guildCreate.ts).
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';

/** Quota gratuit par utilisateur. */
export const FREE_QUOTA = 1;
/** Quota Premium par utilisateur. */
export const PREMIUM_QUOTA = 5;

/**
 * Compte les serveurs (NON gelés) installés par un même utilisateur.
 * Les serveurs avec premium = true sont comptés à part car ils utilisent
 * un slot premium dédié.
 */
export async function countServersForInstaller(installerUserId: string) {
  const [free, premium] = await Promise.all([
    prisma.guild.count({
      where: { installerUserId, premium: false, licenseFrozen: false },
    }),
    prisma.guild.count({
      where: { installerUserId, premium: true, licenseFrozen: false },
    }),
  ]);
  return { free, premium, total: free + premium };
}

/**
 * Indique si un installateur a encore le droit d'activer un nouveau serveur
 * gratuit, ou bien s'il faut le geler à l'arrivée.
 */
export async function hasFreeSlot(installerUserId: string) {
  const { free, premium } = await countServersForInstaller(installerUserId);
  // Premium = on ne compte pas les slots premium dans le quota free
  return free < FREE_QUOTA;
}

/**
 * Gèle un serveur (modules premium désactivés). Ne touche pas à `premium` en lui-même.
 */
export async function freezeGuild(guildId: string, reason: string) {
  await prisma.guild.update({
    where: { id: guildId },
    data: { licenseFrozen: true },
  });
  logger.warn({ guildId, reason }, 'Guild gelée pour dépassement de quota');
}

/**
 * Dégèle un serveur (utilisé par exemple si l'utilisateur achète le Premium,
 * ou si une de ses anciennes installations est retirée).
 */
export async function thawGuild(guildId: string) {
  await prisma.guild.update({
    where: { id: guildId },
    data: { licenseFrozen: false },
  });
}

/**
 * Vérifie si un module donné peut tourner sur ce serveur.
 * À appeler en début d'exécution de chaque commande / event "premium".
 *
 * Pour l'instant, TOUS les modules sont gratuits — la limite ne concerne que
 * le NOMBRE DE SERVEURS où le bot peut être installé. Si un serveur est gelé,
 * on désactive simplement la quasi-totalité des features (sauf modération de
 * base) et on affiche un message expliquant.
 */
export async function isGuildActive(guildId: string): Promise<boolean> {
  const g = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { licenseFrozen: true },
  });
  if (!g) return true; // Inconnu = on n'a pas encore enregistré → on laisse passer
  return !g.licenseFrozen;
}

/**
 * Variante synchrone basée sur un objet déjà chargé (évite un round-trip DB).
 */
export function isGuildActiveSync(guild: { licenseFrozen: boolean } | null): boolean {
  if (!guild) return true;
  return !guild.licenseFrozen;
}

/**
 * À exécuter quand le bot rejoint un nouveau serveur.
 * Renvoie l'état initial à appliquer (frozen ou non) selon le quota de l'installateur.
 */
export async function evaluateNewInstall(installerUserId: string | null | undefined): Promise<{
  frozen: boolean;
  reason: string;
}> {
  if (!installerUserId) {
    return { frozen: false, reason: 'installerUserId inconnu, on laisse actif par défaut' };
  }
  const { free } = await countServersForInstaller(installerUserId);
  if (free >= FREE_QUOTA) {
    return {
      frozen: true,
      reason: `Installateur ${installerUserId} a déjà ${free} serveur(s) gratuit(s) actif(s)`,
    };
  }
  return { frozen: false, reason: 'Quota OK' };
}
