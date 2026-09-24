import { env } from '../../config/env.js'
import type { NotificationProvider } from './types.js'

// A separate adapter from auth/smsProvider.ts on purpose: that one talks to
// MSG91's OTP-template endpoint (a fixed code, not free text) — wrong tool
// for an EMI-reminder or scheme-change-alert message body. This one uses
// MSG91's general transactional SMS send endpoint. Both still key off the
// same SMS_PROVIDER/MSG91_API_KEY/MSG91_SENDER_ID env vars — one real
// external account, two different API calls against it.
export class ConsoleSmsNotificationProvider implements NotificationProvider {
  async send({ phone, message }: { phone: string; message: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[SMS:console] to ${phone}: ${message}`)
  }
}

export class Msg91SmsNotificationProvider implements NotificationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string
  ) {}

  async send({ phone, message }: { phone: string; message: string }): Promise<void> {
    if (!this.apiKey || !this.senderId) {
      throw new Error('MSG91_API_KEY and MSG91_SENDER_ID must be set when SMS_PROVIDER=msg91')
    }
    const response = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: this.apiKey },
      body: JSON.stringify({ sender: this.senderId, mobiles: phone, message }),
    })
    if (!response.ok) {
      throw new Error(`MSG91 SMS send failed: ${response.status} ${await response.text()}`)
    }
  }
}

export function createSmsNotificationProvider(): NotificationProvider {
  if (env.SMS_PROVIDER === 'msg91') {
    return new Msg91SmsNotificationProvider(env.MSG91_API_KEY ?? '', env.MSG91_SENDER_ID ?? '')
  }
  return new ConsoleSmsNotificationProvider()
}
