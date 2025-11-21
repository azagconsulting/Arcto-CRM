import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface EmailSendResult {
  messageId?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter;
  private readonly defaultSender?: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    this.defaultSender = user;

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    } else {
      this.logger.warn(
        'SMTP-Konfiguration unvollständig – Nachrichten werden nur protokolliert.',
      );
    }
  }

  getDefaultSender() {
    return this.defaultSender;
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const payload = {
      from: options.from ?? this.defaultSender ?? 'notifications@arcto.app',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    if (!this.transporter) {
      this.logger.log(
        `Dry-Run E-Mail an ${payload.to}: ${payload.subject}\n${payload.text}`,
      );
      return { messageId: `dry-${Date.now()}` };
    }

    return (await this.transporter.sendMail(payload)) as EmailSendResult;
  }
}
