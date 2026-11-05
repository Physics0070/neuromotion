// Confirms the SMTP login works and, with a recipient, sends one real test email: npm run mail:check -- you@example.com
import nodemailer from 'nodemailer'

const { SMTP_URL, MAIL_FROM } = process.env
if (!SMTP_URL || !MAIL_FROM) { console.error('Set SMTP_URL and MAIL_FROM in .env first.'); process.exit(1) }
const transport = nodemailer.createTransport(SMTP_URL)
try {
  await transport.verify()
  console.log('SMTP login works.')
  const to = process.argv[2]
  if (to) { await transport.sendMail({ from: MAIL_FROM, to, subject: 'NeuroMotion test', text: 'If you can read this, sign-in codes will arrive.' }); console.log(`Test email sent to ${to}.`) }
} catch (e) {
  console.error(`SMTP failed: ${e.message}`)
  process.exit(1)
}
