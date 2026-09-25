import '../config/loadEnv.js'
import { eq } from 'drizzle-orm'
import { env } from '../config/env.js'
import type { Db } from './client.js'
import { db } from './client.js'
import { applicants } from './schema/index.js'

// The ONLY way an admin account comes into existence (nobody can sign up
// as one, and admins invite officers, not other admins). Idempotent — safe
// to run on every deploy:
//   ADMIN_BOOTSTRAP_PHONE  → that phone's account becomes admin (created if
//                            absent); signs in with phone OTP.
//   ADMIN_BOOTSTRAP_EMAIL  → a pending invite, claimed on that Gmail's
//                            first Google sign-in (auth's claimInviteByEmail).
// Promotes an existing account if one already holds that phone/email —
// it never demotes anyone.
export async function bootstrapAdmin(database: Db): Promise<string[]> {
  const done: string[] = []
  const now = new Date()

  if (env.ADMIN_BOOTSTRAP_PHONE) {
    const phone = env.ADMIN_BOOTSTRAP_PHONE
    await database
      .insert(applicants)
      .values({ phone, role: 'admin', displayName: 'Setu Administrator', designation: 'Programme Administrator', phoneVerifiedAt: now })
      .onConflictDoUpdate({ target: applicants.phone, set: { role: 'admin', active: true, updatedAt: now } })
    done.push(`admin phone ${phone}`)
  }

  if (env.ADMIN_BOOTSTRAP_EMAIL) {
    const email = env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase()
    const [existing] = await database.select({ id: applicants.id }).from(applicants).where(eq(applicants.email, email)).limit(1)
    if (existing) {
      await database.update(applicants).set({ role: 'admin', active: true, updatedAt: now }).where(eq(applicants.id, existing.id))
    } else {
      await database
        .insert(applicants)
        .values({ invitedEmail: email, role: 'admin', displayName: 'Setu Administrator', designation: 'Programme Administrator' })
        .onConflictDoUpdate({ target: applicants.invitedEmail, set: { role: 'admin', active: true, updatedAt: now } })
    }
    done.push(`admin email ${email}`)
  }

  return done
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapAdmin(db)
    .then((done) => {
      console.log(done.length ? `Bootstrapped ${done.join(', ')}` : 'Neither ADMIN_BOOTSTRAP_PHONE nor ADMIN_BOOTSTRAP_EMAIL is set — nothing to do')
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => process.exit())
}
