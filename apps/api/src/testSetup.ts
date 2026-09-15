// Fixed, hermetic env for tests — independent of whatever the local .env
// happens to contain, and evaluated before any test file imports
// config/env.ts (which parses process.env at module-load time).
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
process.env.REDIS_URL ??= 'redis://localhost:6379'
process.env.JWT_SECRET ??= 'test-secret'
process.env.OTP_HASH_SECRET ??= 'test-otp-secret'
