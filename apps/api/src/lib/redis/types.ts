// The narrow surface this codebase actually uses against Redis — verified
// exhaustively against every call site in apps/api/src: get, set (plain or
// with EX/NX), del, incr, expire, ttl. No pub/sub, Lua, transactions, or
// pipelining anywhere. Both backing clients (ioredisClient.ts for local dev,
// upstashClient.ts for Vercel — see plugins/redis.ts) implement exactly this
// interface, so every consumer depends on neither client library directly.
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<string | null>
  del(key: string): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  // No-op for the Upstash (HTTP, stateless) adapter — nothing to close.
  // Real for the ioredis (TCP) adapter, called from plugins/redis.ts's
  // onClose hook.
  quit(): Promise<unknown>
}
