/** Bounded in-process cache: coalesce concurrent requests, retain old data on failure,
 * and cool down failures. No timers, storage service, or work without visitors. */
export function createFeedCache<T>(
  maxEntries = 160,
  ttlMs = 20_000,
  staleMs = 300_000,
  now = Date.now,
) {
  const entries = new Map<
    string,
    {
      value?: T;
      expires: number;
      received: number;
      failed: boolean;
      pending?: Promise<{ value: T; stale: boolean }>;
    }
  >();
  return async (
    key: string,
    load: () => Promise<T>,
  ): Promise<{ value: T; stale: boolean }> => {
    let entry = entries.get(key);
    if (entry?.pending) return entry.pending;
    if (entry && entry.expires > now()) {
      if (entry.value !== undefined && now() - entry.received < staleMs)
        return { value: entry.value, stale: entry.failed };
      throw new Error("Feed is cooling down");
    }
    if (!entry) {
      if (entries.size >= maxEntries) {
        const removable = [...entries].find(([, value]) => !value.pending);
        if (!removable) throw new Error("Feed capacity reached");
        entries.delete(removable[0]);
      }
      entry = { expires: 0, received: 0, failed: false };
      entries.set(key, entry);
    }
    const current = entry;
    current.pending = (async () => {
      try {
        const value = await load();
        current.value = value;
        current.received = now();
        current.expires = now() + ttlMs;
        current.failed = false;
        return { value, stale: false };
      } catch {
        current.expires = now() + 30_000;
        current.failed = true;
        if (current.value !== undefined && now() - current.received < staleMs)
          return { value: current.value, stale: true };
        throw new Error("Feed unavailable");
      } finally {
        current.pending = undefined;
      }
    })();
    return current.pending;
  };
}
