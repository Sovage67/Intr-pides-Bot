import Redis from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Client principal pour le cache et les commandes
export const redis = new Redis(url);

// Client séparé pour les abonnements Pub/Sub
// (un client en mode subscriber ne peut plus exécuter d'autres commandes)
export const redisSub = new Redis(url);

redis.on('error', (err) => console.error('[Redis] Erreur :', err));
redisSub.on('error', (err) => console.error('[Redis Sub] Erreur :', err));
