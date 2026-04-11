import { createTransport, type Transporter } from 'nodemailer'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_MAIL_TRANSPORT } from '../errors.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { EmailTemplates } from './templates.js'

export type TemplateEmail = {
  from?: string
  to: string
  subject: string
  templateName: string
  templateData?: any
}

export type MailerConfig = {
  defaultFromAddress: string
  transport: {
    host: string
    port: number
    secure: boolean
    auth: {
      user?: string
      pass?: string
    }
  }
}

export interface Mailer {
  sendTemplateEmail(email: TemplateEmail): Promise<void>
}

export class NodeMailer extends BaseService implements Mailer {
  private transport: Transporter

  constructor(
    logger: CoreLogger,
    private config: MailerConfig,
    private templates: EmailTemplates
  ) {
    super(logger, 'lib', 'email')
    this.transport = createTransport(config.transport)
  }

  @method
  async sendTemplateEmail({
    from,
    to,
    subject,
    templateName,
    templateData,
  }: TemplateEmail): Promise<void> {
    const html = await this.templates.renderTemplate(templateName, templateData)

    try {
      // TODO: Add support for sending mail through a job queue, or at least add
      // better instrumentation / logging to allow fire-and-forget (rather than
      // awaiting here)?
      await this.transport.sendMail({
        from: from ?? this.config.defaultFromAddress,
        to,
        subject,
        html,
      })

      this.logger.debug({ templateName }, 'template email sent')
    } catch (cause) {
      throw ERR_MAIL_TRANSPORT({
        message: 'Error sending email template',
        cause,
        logExtra: { templateName },
      }).log(this.logger)
    }
  }
}

// NOTE: This mailer is only for debugging during development.  It does not
// actually send emails, and it logs potentially sensitive data (email addresses
// and the fully rendered email body).
export class DebugMailer extends BaseService implements Mailer {
  constructor(
    logger: CoreLogger,
    private templates: EmailTemplates
  ) {
    super(logger, 'lib', 'email')
  }

  @method
  async sendTemplateEmail(email: TemplateEmail): Promise<void> {
    const html = await this.templates.renderTemplate(email.templateName, email.templateData)
    this.logger.debug({ html, ...email }, 'template email sent')
  }
}
