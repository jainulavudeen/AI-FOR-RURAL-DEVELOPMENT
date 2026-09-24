import type { RedisLike } from '../../lib/redis/types'
import { entryScreen, handleInput, initialSession, type UssdSession } from './sessionMachine'

// "Session times out fast" — USSD sessions are conventionally much
// shorter-lived than a web session (the telecom gateway itself usually
// times out around 60-180s of inactivity); 180s here is a reasonable
// upper bound that still lets Redis be the single source of truth for
// "is this session still alive."
const SESSION_TTL_SECONDS = 180

const sessionKey = (sessionId: string) => `ussd:session:${sessionId}`

// Redis is the session store, not a cache in front of something else — if
// it's unreachable, there is no session to recover, so this fails open to
// "treat as a brand-new session" rather than hanging or 500ing. A USSD
// gateway has its own short timeout regardless; an unresolved request here
// would just look like a dropped call, which is the honest failure mode
// anyway.
async function getSession(redis: RedisLike, sessionId: string): Promise<UssdSession | null> {
  try {
    const raw = await redis.get(sessionKey(sessionId))
    return raw ? (JSON.parse(raw) as UssdSession) : null
  } catch {
    return null
  }
}

async function saveSession(redis: RedisLike, sessionId: string, session: UssdSession): Promise<void> {
  try {
    if (session.step === 'done') {
      await redis.del(sessionKey(sessionId))
    } else {
      await redis.set(sessionKey(sessionId), JSON.stringify(session), { ex: SESSION_TTL_SECONDS })
    }
  } catch {
    // Best-effort — a failed write just means the next turn starts fresh,
    // not a broken response to the gateway right now.
  }
}

export interface UssdTurnResponse {
  screen: string
  continueSession: boolean
}

// One HTTP call per USSD turn — see routes.ts. `input` is the single digit
// string the gateway forwarded for this turn (not the accumulated
// "1*2*3"-style text some gateways send — see routes.ts for why).
export async function processUssdTurn(redis: RedisLike, sessionId: string, input: string): Promise<UssdTurnResponse> {
  const existing = await getSession(redis, sessionId)

  if (!existing && !input) {
    // True first contact: show the menu, don't run '' through the state
    // machine (which would otherwise read it as an invalid business choice).
    await saveSession(redis, sessionId, initialSession())
    return { screen: entryScreen(), continueSession: true }
  }

  const result = handleInput(existing ?? initialSession(), input)
  await saveSession(redis, sessionId, result.session)
  return { screen: result.screen, continueSession: result.continueSession }
}
