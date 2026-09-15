import type { NotificationProvider } from './types'

// No adapter wired yet — a real SMS/WhatsApp/push provider and a
// console/dev adapter (default, no credentials required) land alongside
// the OTP auth work. This module only defines the interface shape for now.
export const notImplementedProvider: NotificationProvider = {
  async send() {
    throw new Error('Notification provider not implemented yet')
  },
}
