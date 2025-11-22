import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerMessageDirection,
  CustomerMessageStatus,
  LeadPriority,
  LeadStatus,
  Prisma,
} from '@prisma/client';

import {
  EmailService,
  type EmailAttachment,
  type EmailSendResult,
} from '../../infra/mailer/email.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import {
  SendAttachmentDto,
  SendCustomerMessageDto,
} from './dto/send-customer-message.dto';

type CustomerMessageEntity = Prisma.CustomerMessageGetPayload<{
  include: { contact: true };
}>;

interface CustomerMessageContact {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  channel?: string | null;
}

interface CustomerMessageAttachment {
  name: string;
  type?: string | null;
  size?: number | null;
  data?: string | null;
}

export interface CustomerMessageResponse {
  id: string;
  customerId?: string | null;
  leadId?: string | null;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  attachments: CustomerMessageAttachment[];
  readAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMessageListResponse {
  customer: {
    id: string;
    name: string;
    contacts: CustomerMessageContact[];
  };
  items: CustomerMessageResponse[];
}

interface LeadSummary {
  id: string;
  fullName: string;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  createdAt: string;
}

export interface LeadMessageListResponse {
  lead: LeadSummary;
  items: CustomerMessageResponse[];
}

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
  ) {}

  async list(
    customerId: string,
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageListResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { contacts: true },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    const limit = Math.min(dto?.limit ?? 30, 100);

    const records = await this.prisma.customerMessage.findMany({
      where: { customerId },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        contacts: customer.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role,
          email: contact.email,
          channel: contact.channel,
        })),
      },
      items: records.map((record) => this.toResponse(record)),
    };
  }

  async send(
    customerId: string,
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { contacts: true },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    const contact = dto.contactId
      ? customer.contacts.find((item) => item.id === dto.contactId)
      : null;

    if (dto.contactId && !contact) {
      throw new BadRequestException('Kontakt konnte nicht gefunden werden');
    }

    const toEmail = (contact?.email ?? dto.toEmail)?.trim().toLowerCase();

    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject =
      dto.subject?.trim() ?? `Update von ${customer.ownerName ?? 'Arcto CRM'}`;
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const fromEmail =
      dto.fromEmail?.trim() ?? this.emailService.getDefaultSender();
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials && !this.emailService.hasSmtpTransport()) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials ?? undefined,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        customerId,
        leadId: null,
        contactId: contact?.id,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listLeadMessages(
    leadId: string,
    dto: ListCustomerMessagesDto,
  ): Promise<LeadMessageListResponse> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundException('Kontaktanfrage nicht gefunden');
    }

    const limit = Math.min(dto?.limit ?? 40, 200);
    const normalizedEmail = this.normalizeEmail(lead.email);

    const orFilters: Prisma.CustomerMessageWhereInput[] = [{ leadId }];
    if (normalizedEmail) {
      orFilters.push(
        { toEmail: normalizedEmail },
        { fromEmail: normalizedEmail },
      );
    }

    const records = await this.prisma.customerMessage.findMany({
      where: {
        OR: orFilters,
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const seen = new Set<string>();
    const normalized = records.filter((record) => {
      if (seen.has(record.id)) {
        return false;
      }
      seen.add(record.id);
      return true;
    });

    const items = normalized.map((record) => this.toResponse(record));

    if (lead.message) {
      items.push(this.buildLeadInitialMessage(lead));
    }

    const ordered = items.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return {
      lead: {
        id: lead.id,
        fullName: lead.fullName,
        email: lead.email,
        company: lead.company,
        phone: lead.phone,
        message: lead.message,
        status: lead.status,
        priority: lead.priority,
        createdAt: lead.createdAt.toISOString(),
      },
      items: ordered,
    };
  }

  async sendLeadMessage(
    leadId: string,
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundException('Kontaktanfrage nicht gefunden');
    }

    const toEmail = (dto.toEmail ?? lead.email)?.trim().toLowerCase();

    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject = dto.subject?.trim() ?? `Update für ${lead.fullName}`;
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const fromEmail =
      dto.fromEmail?.trim() ?? this.emailService.getDefaultSender();
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials && !this.emailService.hasSmtpTransport()) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials ?? undefined,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        leadId,
        customerId: null,
        contactId: null,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listUnassignedMessages(
    dto: ListCustomerMessagesDto,
  ): Promise<CustomerMessageResponse[]> {
    const limit = Math.min(dto?.limit ?? 40, 200);
    const records = await this.prisma.customerMessage.findMany({
      where: {
        customerId: null,
        leadId: null,
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map((record) => this.toResponse(record));
  }

  async sendUnassignedMessage(
    dto: SendCustomerMessageDto,
  ): Promise<CustomerMessageResponse> {
    const toEmail = dto.toEmail?.trim().toLowerCase();
    if (!toEmail) {
      throw new BadRequestException(
        'Für den Versand ist eine Zieladresse erforderlich.',
      );
    }

    const subject =
      dto.subject?.trim() ?? 'Antwort aus deinem Workspace';
    const preview = dto.preview?.trim() ?? this.buildPreview(dto.body);
    const fromEmail =
      dto.fromEmail?.trim() ?? this.emailService.getDefaultSender();
    const attachments = this.normalizeAttachments(dto.attachments);

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    if (!smtpCredentials && !this.emailService.hasSmtpTransport()) {
      throw new BadRequestException(
        'Es ist kein SMTP-Zugang konfiguriert. Bitte hinterlege die Zugangsdaten in den Einstellungen.',
      );
    }

    const sendResult = await this.emailService.sendEmail(
      {
        to: toEmail,
        subject,
        text: dto.body,
        html: dto.body.replace(/\n/g, '<br />'),
        from: fromEmail,
        attachments,
      },
      smtpCredentials ?? undefined,
    );

    const saved = await this.prisma.customerMessage.create({
      data: {
        customerId: null,
        leadId: null,
        contactId: null,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        attachments: dto.attachments
          ? (dto.attachments.map((attachment) => ({
              name: attachment.name,
              type: attachment.type ?? null,
              size:
                typeof attachment.size === 'number' ? attachment.size : null,
              data: attachment.data ?? null,
            })) as Prisma.JsonArray)
          : undefined,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  async listByEmail(email: string): Promise<CustomerMessageResponse[]> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      return [];
    }

    const records = await this.prisma.customerMessage.findMany({
      where: {
        OR: [{ toEmail: normalized }, { fromEmail: normalized }],
      },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return records.map((record) => this.toResponse(record));
  }

  private toResponse(entity: CustomerMessageEntity): CustomerMessageResponse {
    return {
      id: entity.id,
      customerId: entity.customerId,
      leadId: entity.leadId,
      contact: entity.contact
        ? {
            id: entity.contact.id,
            name: entity.contact.name,
            role: entity.contact.role,
            email: entity.contact.email,
            channel: entity.contact.channel,
          }
        : null,
      direction: entity.direction,
      status: entity.status,
      subject: entity.subject,
      preview: entity.preview,
      body: entity.body,
      fromEmail: entity.fromEmail,
      toEmail: entity.toEmail,
      attachments: this.toAttachmentResponse(entity.attachments),
      readAt: entity.readAt?.toISOString() ?? null,
      sentAt: entity.sentAt?.toISOString() ?? null,
      receivedAt: entity.receivedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private buildLeadInitialMessage(lead: {
    id: string;
    fullName: string;
    email: string | null;
    message: string | null;
    createdAt: Date;
  }): CustomerMessageResponse {
    return {
      id: `lead-${lead.id}`,
      customerId: null,
      leadId: lead.id,
      contact: lead.fullName
        ? {
            id: lead.id,
            name: lead.fullName,
            role: lead.email ? 'Kontaktformular' : null,
            email: lead.email,
            channel: 'Web',
          }
        : null,
      direction: CustomerMessageDirection.INBOUND,
      status: CustomerMessageStatus.SENT,
      subject: 'Neue Anfrage über Kontaktformular',
      preview: this.buildPreview(lead.message ?? ''),
      body: lead.message ?? '',
      fromEmail: lead.email ?? undefined,
      toEmail: undefined,
      readAt: null,
      sentAt: lead.createdAt.toISOString(),
      receivedAt: lead.createdAt.toISOString(),
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.createdAt.toISOString(),
      attachments: [],
    };
  }

  private toAttachmentResponse(
    payload: Prisma.JsonValue | null,
  ): CustomerMessageAttachment[] {
    if (!payload || !Array.isArray(payload)) {
      return [];
    }

    return payload.reduce<CustomerMessageAttachment[]>((acc, item) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }
      const attachment = item as Record<string, unknown>;
      const name = typeof attachment.name === 'string' ? attachment.name : null;
      if (!name) {
        return acc;
      }
      acc.push({
        name,
        type: typeof attachment.type === 'string' ? attachment.type : null,
        size: typeof attachment.size === 'number' ? attachment.size : null,
        data: typeof attachment.data === 'string' ? attachment.data : null,
      });
      return acc;
    }, []);
  }

  private normalizeAttachments(
    attachments?: SendAttachmentDto[],
  ): EmailAttachment[] | undefined {
    if (!attachments?.length) {
      return undefined;
    }

    try {
      return attachments.map((attachment) => ({
        filename: attachment.name,
        content: Buffer.from(attachment.data, 'base64'),
        contentType: attachment.type || 'application/octet-stream',
      }));
    } catch (error) {
      throw new BadRequestException(
        'Anhänge konnten nicht verarbeitet werden.',
      );
    }
  }

  private buildPreview(body: string) {
    const normalized = body.trim().replace(/\s+/g, ' ');
    return normalized.slice(0, 140);
  }

  private resolveMessageId(result: EmailSendResult) {
    return result.messageId ?? undefined;
  }

  private normalizeEmail(value?: string | null) {
    return value?.trim().toLowerCase() || null;
  }

  async markMessagesRead(ids: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) {
      return 0;
    }

    const result = await this.prisma.customerMessage.updateMany({
      where: {
        id: { in: uniqueIds },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return result.count ?? 0;
  }

  async getUnreadSummary() {
    const unassigned = await this.prisma.customerMessage.count({
      where: {
        customerId: null,
        leadId: null,
        direction: CustomerMessageDirection.INBOUND,
        readAt: null,
      },
    });

    const leadGroups = await this.prisma.customerMessage.groupBy({
      by: ['leadId'],
      where: {
        leadId: { not: null },
        direction: CustomerMessageDirection.INBOUND,
        readAt: null,
      },
      _count: { _all: true },
    });

    const leadCounts = leadGroups.reduce<Record<string, number>>(
      (acc, group) => {
        if (group.leadId) {
          const value =
            typeof group._count === 'object' && group._count && '_all' in group._count
              ? Number((group._count as { _all?: number })._all ?? 0)
              : 0;
          acc[group.leadId] = value;
        }
        return acc;
      },
      {},
    );

    const total =
      unassigned +
      Object.values(leadCounts).reduce((sum, value) => sum + value, 0);

    return {
      unassigned,
      leads: leadCounts,
      total,
    };
  }
}
