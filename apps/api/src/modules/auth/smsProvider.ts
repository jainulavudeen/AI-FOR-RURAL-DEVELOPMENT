import { env } from '../../config/env'

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>
}

// Default adapter — logs instead of sending, so the team can run the OTP
// flow with zero credentials. This is what SMS_PROVIDER defaults to.
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[SMS:console] OTP for ${phone}: ${code}`)
  }
}

// Real provider shape, targeting MSG91's OTP API (common for OTP delivery
// in India). Throws clearly if used with no credentials set — SMS_PROVIDER
// must be explicitly switched to 'msg91' and MSG91_API_KEY/MSG91_SENDER_ID
// filled in; nothing here is reachable via the default env.
export class Msg91SmsProvider implements SmsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    if (!this.apiKey || !this.senderId) {
      throw new Error('MSG91_API_KEY and MSG91_SENDER_ID must be set when SMS_PROVIDER=msg91')
    }

    const url = new URL('https://control.msg91.com/api/v5/otp')
    url.searchParams.set('otp', code)
    url.searchParams.set('mobile', phone)
    url.searchParams.set('sender', this.senderId)
    url.searchParams.set('authkey', this.apiKey)

    const response = await fetch(url, { method: 'POST' })
    if (!response.ok) {
      throw new Error(`MSG91 OTP send failed: ${response.status} ${await response.text()}`)
    }
  }
}

export function createSmsProvider(): SmsProvider {
  if (env.SMS_PROVIDER === 'msg91') {
    return new Msg91SmsProvider(env.MSG91_API_KEY ?? '', env.MSG91_SENDER_ID ?? '')
  }
  return new ConsoleSmsProvider()
}
