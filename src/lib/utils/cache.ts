// ============================================================
// Cache — Schrödinger's frontend
//
// Stateful and stateless simultaneously.
// Everything is cached. Cache is the state.
// DB write → invalidate key → next read is fresh.
//
// No useState. No subscriptions. No reactive overhead.
// Just a Map with TTL and invalidation.
// ============================================================

const store = new Map<string, { data: unknown; expires: number }>();

const DEFAULT_TTL = 60_000; // 1 minute — local DB is fast, stale is fine

/**
 * Get from cache or compute.
 * The only function the UI calls.
 */
export async function cached<T>(
  key: string,
  compute: () => T | Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && entry.expires > now) {
    return entry.data as T;
  }

  const data = await compute();
  store.set(key, { data, expires: now + ttl });
  return data;
}

/**
 * Synchronous version for server components.
 */
export function cachedSync<T>(
  key: string,
  compute: () => T,
  ttl: number = DEFAULT_TTL
): T {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && entry.expires > now) {
    return entry.data as T;
  }

  const data = compute();
  store.set(key, { data, expires: now + ttl });
  return data;
}

/**
 * Invalidate a key or a pattern.
 * Called after any DB write.
 */
export function invalidate(pattern: string): void {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  } else {
    store.delete(pattern);
  }
}

/**
 * Invalidate everything for a user.
 */
export function invalidateUser(userId: string): void {
  invalidate(`${userId}:*`);
}

/**
 * Cache keys convention:
 *
 * {userId}:tabs              — list of tabs
 * {userId}:lattice           — lattice position
 * {userId}:memory            — full memory graph
 * {userId}:memory:{discId}   — discipline-scoped memory
 * {userId}:tags              — tag list
 * {userId}:challenges        — today's challenges
 * {userId}:plan:{granularity} — active plan
 * {userId}:notifications     — pending notifications
 * {userId}:view:{name}       — resolved view tree
 * {userId}:session           — active session
 * {userId}:context:{scope}   — tab or generalist context
 */
