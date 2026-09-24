import type { NotificationProvider } from './types.js'

// Push wasn't part of this pass's ask (SMS + WhatsApp were) but was
// already a declared NotificationChannel — implemented for completeness so
// every declared channel has a real (mock) provider rather than one
// silently falling through to "not implemented."
export class ConsolePushProvider implements NotificationProvider {
  async send({ phone, message }: { phone: string; message: string }): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[Push:console] to ${phone}: ${message}`)
  }
}

export function createPushProvider(): NotificationProvider {
  return new ConsolePushProvider()
}
