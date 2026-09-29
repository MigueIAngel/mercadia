import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { CONFIG, type EngagementConfig } from '../config.js';

/** Transactional email over SMTP (Mailpit locally). Without SMTP_URL mails are only logged. */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private readonly transport?: Transporter;

  constructor(@Inject(CONFIG) private readonly config: EngagementConfig) {
    if (config.smtpUrl) this.transport = nodemailer.createTransport(config.smtpUrl);
  }

  async send(
    to: string,
    subject: string,
    heading: string,
    body: string,
    cta?: { label: string; url: string },
  ) {
    const html = `<!doctype html><html><body style="margin:0;background:#fbf8f3;font-family:Helvetica,Arial,sans-serif;color:#111827">
      <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:20px;padding:32px">
        <p style="font-size:22px;font-weight:bold;margin:0 0 16px">Mercadia</p>
        <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
        <p style="line-height:1.5;color:#44403c">${body}</p>
        ${cta ? `<p style="margin-top:24px"><a href="${cta.url}" style="background:#f97316;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${cta.label}</a></p>` : ''}
      </div></body></html>`;
    if (!this.transport) {
      this.logger.log(`email (not sent, no SMTP) to ${to}: ${subject}`);
      return;
    }
    try {
      await this.transport.sendMail({
        from: this.config.mailFrom,
        to,
        subject,
        html,
        text: `${heading}\n\n${body}${cta ? `\n\n${cta.url}` : ''}`,
      });
    } catch (error) {
      this.logger.warn(`email to ${to} failed: ${String(error)}`);
    }
  }
}
