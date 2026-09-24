import type { NotificationProvider } from './types.js'

// WhatsApp Business API is real regulated infrastructure — a Meta
// Business/BSP (Business Solution Provider) partnership and template
// pre-approval, none of which this environment has. Same treatment as
// Account Aggregator and CPGRAMS: mock only (see WHATSAPP_PROVIDER in
// config/env.ts, which only accepts 'console' — there is no 'real' option
// to accidentally select).
export class ConsoleWhatsappProvider implements NotificationProvider {
  async send({ phone, message }: { phone: string; message: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[WhatsApp:console] to ${phone}: ${message}`)
  }
}

export function createWhatsappProvider(): NotificationProvider {
  return new ConsoleWhatsappProvider()
}
