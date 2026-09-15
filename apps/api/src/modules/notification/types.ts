export type NotificationChannel = 'sms' | 'whatsapp' | 'push'

export interface SendRequestBody {
  applicantId: string
  channel: NotificationChannel
  message: string
}

// Adapter seam — a real provider (Twilio/MSG91/etc.) and a console/dev
// adapter that logs instead of sending will both implement this. Mirrors
// the SMS gateway interface introduced for OTP in a later prompt.
export interface NotificationProvider {
  send(input: { phone: string; message: string }): Promise<void>
}
