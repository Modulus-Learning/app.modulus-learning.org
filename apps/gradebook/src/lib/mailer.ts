import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

import { getServerConfig } from '../config'

const createMailer = () => {
  const config = getServerConfig()
  return nodemailer.createTransport({
    host: config.email.transport.host,
    port: config.email.transport.port,
    secure: config.email.transport.secure,
    auth: {
      user: config.email.transport.auth.user,
      pass: config.email.transport.auth.pass,
    },
  })
}

let cachedMailer: nodemailer.Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>

export const getMailer = () => {
  if (cachedMailer == null) {
    cachedMailer = createMailer()
  }

  return cachedMailer
}
