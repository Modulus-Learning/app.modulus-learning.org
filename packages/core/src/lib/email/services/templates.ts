import { readFile } from 'node:fs/promises'
import path from 'node:path'

import Handlebars from 'handlebars'

import { BaseService, method } from '@/lib/base-service.js'
import {
  ERR_MAIL_TEMPLATE_INVALID,
  ERR_MAIL_TEMPLATE_NOT_FOUND,
  ERR_MAIL_TEMPLATE_RENDER,
} from '../errors.js'
import type { CoreLogger } from '@/lib/logger.js'

export class EmailTemplates extends BaseService {
  private templates: Record<string, Handlebars.TemplateDelegate> = {}

  constructor(
    logger: CoreLogger,
    private templateDirectory: string
  ) {
    super(logger, 'lib', 'email')
  }

  @method
  private async compileTemplate(name: string): Promise<Handlebars.TemplateDelegate> {
    const filename = `${name}.html`

    const source = path.resolve(this.templateDirectory, filename)
    const content = await readFile(source, { encoding: 'utf-8' }).catch((cause) => {
      throw ERR_MAIL_TEMPLATE_NOT_FOUND({
        message: 'email template not found',
        cause,
        logExtra: { templateName: name, resolvedFilename: source },
      }).log(this.logger)
    })

    try {
      return Handlebars.compile(content, { noEscape: true })
    } catch (cause) {
      throw ERR_MAIL_TEMPLATE_INVALID({
        message: 'email template compilation failed',
        cause,
        logExtra: { templateName: name },
      }).log(this.logger)
    }
  }

  @method
  async getTemplate(name: string): Promise<Handlebars.TemplateDelegate> {
    let template = this.templates[name]
    if (template == null) {
      template = this.templates[name] = await this.compileTemplate(name)
    }
    return template
  }

  @method
  async renderTemplate(name: string, data?: any): Promise<string> {
    const template = await this.getTemplate(name)
    try {
      return template(data)
    } catch (cause) {
      throw ERR_MAIL_TEMPLATE_RENDER({
        message: 'failed to render email template',
        cause,
        // don't log data here, in theory it could contain sensitive information
        logExtra: { templateName: name },
      }).log(this.logger)
    }
  }
}
