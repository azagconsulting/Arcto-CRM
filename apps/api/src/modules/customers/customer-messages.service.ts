import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerMessageDirection,
  CustomerMessageStatus,
  Prisma,
} from '@prisma/client';

import {
  EmailService,
  type EmailSendResult,
} from '../../infra/mailer/email.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ListCustomerMessagesDto } from './dto/list-customer-messages.dto';
import { SendCustomerMessageDto } from './dto/send-customer-message.dto';

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

export interface CustomerMessageResponse {
  id: string;
  customerId: string;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
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

@Injectable()
export class CustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
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

    const sendResult = await this.emailService.sendEmail({
      to: toEmail,
      subject,
      text: dto.body,
      html: dto.body.replace(/\n/g, '<br />'),
      from: fromEmail,
    });

    const saved = await this.prisma.customerMessage.create({
      data: {
        customerId,
        contactId: contact?.id,
        direction: CustomerMessageDirection.OUTBOUND,
        status: CustomerMessageStatus.SENT,
        subject,
        preview,
        body: dto.body,
        fromEmail,
        toEmail,
        externalId: this.resolveMessageId(sendResult),
        sentAt: new Date(),
      },
      include: { contact: true },
    });

    return this.toResponse(saved);
  }

  private toResponse(entity: CustomerMessageEntity): CustomerMessageResponse {
    return {
      id: entity.id,
      customerId: entity.customerId,
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
      sentAt: entity.sentAt?.toISOString() ?? null,
      receivedAt: entity.receivedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private buildPreview(body: string) {
    const normalized = body.trim().replace(/\s+/g, ' ');
    return normalized.slice(0, 140);
  }

  private resolveMessageId(result: EmailSendResult) {
    return result.messageId ?? undefined;
  }
}
