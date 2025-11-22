import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CustomerMessageDirection, CustomerMessageStatus } from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);
  private syncing = false;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async synchronizeMailbox() {
    if (this.syncing) {
      this.logger.debug('Mail sync skipped – another run is still active.');
      return;
    }

    const imapSettings = await this.settingsService.getImapCredentials();
    if (!imapSettings) {
      return;
    }

    const state = await this.settingsService.getImapSyncState();
    const cutoff =
      typeof imapSettings.sinceDays === 'number'
        ? Date.now() - imapSettings.sinceDays * 24 * 60 * 60 * 1000
        : null;
    this.syncing = true;
    try {
      const client = new ImapFlow({
        host: imapSettings.host,
        port: imapSettings.port,
        secure: imapSettings.encryption === 'ssl',
        tls:
          imapSettings.encryption === 'tls'
            ? { rejectUnauthorized: false }
            : undefined,
        auth: {
          user: imapSettings.username,
          pass: imapSettings.password,
        },
      });

      await client.connect();
      const mailbox = imapSettings.mailbox || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);
      let lastUid = state?.lastUid ?? 0;
      let processed = 0;

      try {
        const range = lastUid ? `${lastUid + 1}:*` : '1:*';
        for await (const message of client.fetch(
          { uid: range },
          { envelope: true, source: true, internalDate: true, uid: true },
        )) {
          if (!message.uid) {
            continue;
          }
          if (!message.source) {
            continue;
          }
          const internalDate =
            message.internalDate instanceof Date
              ? message.internalDate
              : message.internalDate
              ? new Date(message.internalDate)
              : null;
          if (cutoff && internalDate && internalDate.getTime() < cutoff) {
            lastUid = Math.max(lastUid, message.uid);
            continue;
          }

          const parsed = await simpleParser(message.source as Buffer);
          const handled = await this.ingestMessage(parsed, message.uid);
          if (handled) {
            processed += 1;
            lastUid = Math.max(lastUid, message.uid);
          }
          if (processed >= 100) {
            // prevent endless catch-up in one tick
            break;
          }
        }
      } catch (error) {
        this.logger.error(
          `Mail-Sync fehlgeschlagen: ${
            (error as Error)?.message ?? error
          }`,
        );
      } finally {
        lock.release();
        await client.logout().catch(() => undefined);
      }

      if (lastUid && lastUid !== state?.lastUid) {
        await this.settingsService.saveImapSyncState({ lastUid });
      }
    } catch (error) {
      this.logger.error(
        `IMAP-Verbindung fehlgeschlagen: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      this.syncing = false;
    }
  }

  private async ingestMessage(parsed: ParsedMail, uid: number) {
    const externalId =
      typeof parsed.messageId === 'string'
        ? parsed.messageId
        : `imap:${uid}`;
    const existing = await this.prisma.customerMessage.findFirst({
      where: { externalId },
      select: { id: true },
    });
    if (existing) {
      return false;
    }

    const fromAddress = this.extractAddress(parsed.from);
    const toAddress = this.extractAddress(parsed.to);
    if (!fromAddress) {
      return false;
    }

    const subject =
      typeof parsed.subject === 'string'
        ? parsed.subject
        : 'Neue Nachricht';
    const text =
      typeof parsed.text === 'string'
        ? parsed.text
        : parsed.html
        ? parsed.html.replace(/<[^>]+>/g, ' ')
        : '';
    const preview = this.buildPreview(text);
    const receivedAt =
      parsed.date instanceof Date ? parsed.date : new Date();
    const attachments =
      parsed.attachments?.map((item) => {
        const buffer = Buffer.isBuffer(item.content)
          ? item.content
          : item.content
          ? Buffer.from(item.content as unknown as Uint8Array)
          : null;
        return {
          name: item.filename || 'Anhang',
          type: item.contentType || null,
          size:
            typeof item.size === 'number'
              ? item.size
              : buffer?.byteLength ?? null,
          data: buffer ? buffer.toString('base64') : null,
        };
      }) ?? [];

    const contact = await this.prisma.customerContact.findFirst({
      where: {
        email: fromAddress,
      },
      include: {
        customer: true,
      },
    });

    await this.prisma.customerMessage.create({
      data: {
        customerId: contact?.customerId ?? null,
        contactId: contact?.id ?? null,
        leadId: null,
        direction: CustomerMessageDirection.INBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: text || '(kein Inhalt)',
        fromEmail: fromAddress,
        toEmail: toAddress,
        externalId,
        receivedAt,
        sentAt: receivedAt,
        attachments,
      },
    });

    return true;
  }

  private normalizeAddress(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  private extractAddress(
    address:
      | ParsedMail['from']
      | ParsedMail['to']
      | ParsedMail['cc']
      | ParsedMail['bcc'],
  ) {
    if (!address) {
      return null;
    }
    if (Array.isArray(address)) {
      return this.normalizeAddress(address[0]?.value?.[0]?.address || null);
    }
    return this.normalizeAddress(address.value?.[0]?.address || null);
  }

  private buildPreview(body: string) {
    if (!body) {
      return '';
    }
    return body.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
}
