import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CustomerMessageDirection,
  CustomerMessageStatus,
} from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);
  private syncing = false;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async synchronizeMailbox() {
    if (this.syncing) {
      this.logger.debug('Mail sync skipped – another run is still active.');
      return;
    }

    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    if (!tenants.length) {
      return;
    }

    this.syncing = true;
    try {
      for (const tenant of tenants) {
        await this.requestContext.run({ tenantId: tenant.id }, async () => {
          await this.syncTenantMailbox(tenant.id);
        });
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncTenantMailbox(tenantId: string) {
    const imapSettings = await this.settingsService.getImapCredentials();
    if (!imapSettings) {
      return;
    }

    const state = await this.settingsService.getImapSyncState();
    const cutoff =
      typeof imapSettings.sinceDays === 'number'
        ? Date.now() - imapSettings.sinceDays * 24 * 60 * 60 * 1000
        : null;

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

    let lastUid = state?.lastUid ?? 0;
    let processed = 0;

    try {
      await client.connect();
      const mailbox = imapSettings.mailbox || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);

      try {
        const range = lastUid ? `${lastUid + 1}:*` : '1:*';
        for await (const message of client.fetch(
          { uid: range },
          { envelope: true, source: true, internalDate: true, uid: true },
        )) {
          if (!message.uid || !message.source) {
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

          const parsed = await simpleParser(message.source);
          const handled = await this.ingestMessage(
            parsed,
            message.uid,
            tenantId,
          );
          if (handled) {
            processed += 1;
            lastUid = Math.max(lastUid, message.uid);
          }
          if (processed >= 100) {
            break;
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      this.logger.error(
        `Mail-Sync Tenant ${tenantId} fehlgeschlagen: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      await client.logout().catch(() => undefined);
      if (lastUid && lastUid !== state?.lastUid) {
        await this.settingsService.saveImapSyncState({ lastUid });
      }
    }
  }

  private async ingestMessage(
    parsed: ParsedMail,
    uid: number,
    tenantId: string,
  ) {
    const externalId =
      typeof parsed.messageId === 'string' ? parsed.messageId : `imap:${uid}`;
    const existing = await this.prisma.customerMessage.findFirst({
      where: { externalId, tenantId },
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
      typeof parsed.subject === 'string' ? parsed.subject : 'Neue Nachricht';
    const text =
      typeof parsed.text === 'string'
        ? parsed.text
        : parsed.html
          ? parsed.html.replace(/<[^>]+>/g, ' ')
          : '';
    const preview = this.buildPreview(text);
    const receivedAt = parsed.date instanceof Date ? parsed.date : new Date();
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
              : (buffer?.byteLength ?? null),
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
        tenant: { connect: { id: tenantId } },
        customer: contact?.customerId
          ? { connect: { id: contact.customerId } }
          : undefined,
        contact: contact?.id ? { connect: { id: contact.id } } : undefined,
        lead: undefined,
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

  private extractAddress(address: ParsedMail['from'] | ParsedMail['to']) {
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
