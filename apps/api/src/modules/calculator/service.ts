// Server-side mirror of the client calculator, for the "audit" use case:
// a server-computed report must never disagree with what the user saw
// offline. THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md): this delegates to
// @setu/core — the same deterministic code the client runs — and must
// never reimplement or fork that logic.
export { structureFinance, computeEmi, buildEmiSchedule } from '@setu/core'
