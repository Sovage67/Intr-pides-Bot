/**
 * Cache en mémoire avec TTL.
 * Remplace Redis pour les besoins simples (config guildes, cooldowns).
 *
 * ATTENTION : ce cache est local au processus du bot. Si tu lances plusieurs
 * instances (sharding > 1 process), il faudra repasser à Redis.
 */
export class TTLCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Garbage collector : à appeler périodiquement pour purger les entrées expirées. */
  gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

// Caches partagés
export const guildConfigCache = new TTLCache<unknown>();
export const cooldownCache = new TTLCache<true>();

// Lance un GC toutes les 5 minutes
setInterval(() => {
  guildConfigCache.gc();
  cooldownCache.gc();
}, 5 * 60 * 1000).unref();
