import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type {
  SmtpCredentials,
  SmtpEncryption,
} from '../../common/interfaces/smtp-settings.interface';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  messageId?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter;
  private readonly defaultSender?: string;
  private readonly defaultCredentials?: SmtpCredentials;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (host && port && user && pass) {
      const encryption = this.inferEncryption(port);
      this.defaultCredentials = {
        host,
        port,
        username: user,
        password: pass,
        fromEmail: user,
        fromName: null,
        encryption,
      };
      this.defaultSender = user;
      this.transporter = this.createTransport(this.defaultCredentials);
    } else {
      this.logger.warn(
        'SMTP-Konfiguration unvollständig – Nachrichten werden nur protokolliert.',
      );
    }
  }

  getDefaultSender() {
    return this.defaultSender;
  }

  hasSmtpTransport() {
    return Boolean(this.transporter);
  }

  async sendEmail(
    options: SendEmailOptions,
    override?: SmtpCredentials,
  ): Promise<EmailSendResult> {
    const payload = {
      from:
        options.from ??
        override?.fromEmail ??
        this.defaultSender ??
        'notifications@arcto.app',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.length
        ? options.attachments
        : undefined,
    };

    if (override) {
      return this.sendWithCustomCredentials(payload, override);
    }

    if (!this.transporter) {
      return this.logDryRun(payload);
    }

    const response = await this.transporter.sendMail(payload);
    return { messageId: this.resolveMessageId(response) };
  }

  private async sendWithCustomCredentials(
    payload: SendEmailOptions,
    credentials: SmtpCredentials,
  ) {
    const transport = this.createTransport(credentials);
    const response = await transport.sendMail({
      ...payload,
      from:
        payload.from ??
        credentials.fromEmail ??
        credentials.username ??
        this.defaultSender,
    });
    return { messageId: this.resolveMessageId(response) };
  }

  private createTransport(credentials: SmtpCredentials) {
    return nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.encryption === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    });
  }

  private inferEncryption(port?: number): SmtpEncryption {
    if (port === 465) {
      return 'ssl';
    }
    if (port === 25) {
      return 'none';
    }
    return 'tls';
  }

  private logDryRun(payload: SendEmailOptions): EmailSendResult {
    this.logger.warn(
      `Kein SMTP-Transport verfügbar. Simuliere Versand an ${payload.to} mit Betreff "${payload.subject}".`,
    );
    return { messageId: `dry-run-${Date.now()}` };
  }

  private resolveMessageId(result: unknown) {
    if (result && typeof result === 'object' && 'messageId' in result) {
      return (result as { messageId?: string }).messageId;
    }
    return undefined;
  }
}
