import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerActivity,
  CustomerActivityStatus,
  CustomerHealth,
  CustomerSegment,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerActivityDto } from './dto/create-customer-activity.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import {
  UpdateCustomerDto,
  UpdateCustomerContactDto,
} from './dto/update-customer.dto';

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: {
    contacts: true;
    activities: true;
  };
}>;

interface CustomerContactResponse {
  id: string;
  name: string;
  role?: string | null;
  channel?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerActivityResponse {
  id: string;
  title: string;
  detail?: string | null;
  channel?: string | null;
  status: CustomerActivityStatus;
  scheduledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface CustomerResponse {
  id: string;
  name: string;
  segment: CustomerSegment;
  ownerName?: string | null;
  region?: string | null;
  health: CustomerHealth;
  mrrCents: number;
  lastContactAt?: string | null;
  nextStep?: string | null;
  nextStepDueAt?: string | null;
  decisionStage?: string | null;
  preferredChannel?: string | null;
  tags: string[];
  contacts: CustomerContactResponse[];
  activities: CustomerActivityResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  stats: {
    total: number;
    atRisk: number;
    enterprise: number;
    scheduledMeetings: number;
    totalMrrCents: number;
  };
}

export interface CustomerImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
  ) {}

  async listCustomers(dto: ListCustomersDto): Promise<CustomerListResponse> {
    const tenantId = this.requireTenantId();
    const where: Prisma.CustomerWhereInput = { tenantId };

    if (dto.segment) {
      where.segment = dto.segment;
    }

    if (dto.health) {
      where.health = dto.health;
    }

    if (dto.search?.trim()) {
      const query = dto.search.trim();
      where.OR = [
        { name: { contains: query } },
        { region: { contains: query } },
        { ownerName: { contains: query } },
        { decisionStage: { contains: query } },
      ];
    }

    const take = dto.limit ?? 25;

    const customers = await this.prisma.customer.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: {
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    const stats = this.buildStats(customers);

    return {
      items: customers.map((customer) => this.toResponse(customer)),
      stats,
    };
  }

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerResponse> {
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: this.requireTenantId(),
        name: dto.name.trim(),
        segment: dto.segment,
        ownerName: dto.ownerName?.trim() || undefined,
        region: dto.region?.trim() || undefined,
        health: dto.health ?? CustomerHealth.GOOD,
        mrrCents: dto.mrrCents,
        lastContactAt: dto.lastContactAt
          ? new Date(dto.lastContactAt)
          : undefined,
        nextStep: dto.nextStep?.trim() || undefined,
        nextStepDueAt: dto.nextStepDueAt
          ? new Date(dto.nextStepDueAt)
          : undefined,
        decisionStage: dto.decisionStage?.trim() || undefined,
        preferredChannel: dto.preferredChannel?.trim() || undefined,
        tags: dto.tags?.map((tag) => tag.trim()).filter((tag) => !!tag) ?? [],
        contacts: dto.contacts?.length
          ? {
              create: dto.contacts.map((contact) => ({
                name: contact.name.trim(),
                role: contact.role?.trim() || undefined,
                channel: contact.channel?.trim() || undefined,
                email: contact.email?.trim() || undefined,
                phone: contact.phone?.trim() || undefined,
              })),
            }
          : undefined,
      },
      include: {
        contacts: {
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    return this.toResponse(customer);
  }

  async updateCustomer(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const data: Prisma.CustomerUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.segment !== undefined) {
      data.segment = dto.segment;
    }
    if (dto.ownerName !== undefined) {
      data.ownerName = dto.ownerName?.trim() || null;
    }
    if (dto.region !== undefined) {
      data.region = dto.region?.trim() || null;
    }
    if (dto.health !== undefined) {
      data.health = dto.health;
    }
    if (dto.mrrCents !== undefined) {
      data.mrrCents = dto.mrrCents;
    }
    if (dto.lastContactAt !== undefined) {
      data.lastContactAt = dto.lastContactAt
        ? new Date(dto.lastContactAt)
        : null;
    }
    if (dto.nextStep !== undefined) {
      data.nextStep = dto.nextStep?.trim() || null;
    }
    if (dto.nextStepDueAt !== undefined) {
      data.nextStepDueAt = dto.nextStepDueAt
        ? new Date(dto.nextStepDueAt)
        : null;
    }
    if (dto.decisionStage !== undefined) {
      data.decisionStage = dto.decisionStage?.trim() || null;
    }
    if (dto.preferredChannel !== undefined) {
      data.preferredChannel = dto.preferredChannel?.trim() || null;
    }
    if (dto.tags !== undefined) {
      data.tags = dto.tags.map((tag) => tag.trim()).filter((tag) => !!tag);
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.customer.update({
        where: { id, tenantId },
        data,
      });
    } else {
      await this.prisma.customer.findUniqueOrThrow({
        where: { id, tenantId },
      });
    }

    await this.upsertPrimaryContact(id, dto.primaryContact);

    return this.findCustomer(id);
  }

  async findCustomer(id: string): Promise<CustomerResponse> {
    const tenantId = this.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id, tenantId },
      include: {
        contacts: {
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden');
    }

    return this.toResponse(customer);
  }

  async deleteCustomer(id: string): Promise<void> {
    const tenantId = this.requireTenantId();
    await this.prisma.customer.delete({ where: { id, tenantId } });
  }

  async logCustomerActivity(
    customerId: string,
    dto: CreateCustomerActivityDto,
  ): Promise<CustomerActivityResponse> {
    await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId, tenantId: this.requireTenantId() },
      select: { id: true },
    });

    const status = dto.status ?? CustomerActivityStatus.SCHEDULED;
    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : new Date();

    const activity = await this.prisma.customerActivity.create({
      data: {
        customerId,
        title: dto.title.trim(),
        detail: dto.detail?.trim() || undefined,
        channel: dto.channel?.trim() || undefined,
        status,
        scheduledAt,
        completedAt:
          status === CustomerActivityStatus.DONE
            ? dto.completedAt
              ? new Date(dto.completedAt)
              : new Date()
            : dto.completedAt
              ? new Date(dto.completedAt)
              : undefined,
      },
    });

    return this.mapActivity(activity);
  }

  async importCustomersFromCsv(buffer: Buffer): Promise<CustomerImportResult> {
    const content = buffer.toString('utf-8').trim();
    if (!content) {
      throw new BadRequestException('CSV-Datei ist leer.');
    }

    const records = this.parseCsv(content);
    if (!records.length) {
      throw new BadRequestException('Keine Daten in der CSV-Datei gefunden.');
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, record] of records.entries()) {
      const lineNumber = index + 2; // account for header
      const name = this.getFromRecord(record, ['name', 'kunde', 'customer']);
      if (!name) {
        skipped += 1;
        errors.push(`Zeile ${lineNumber}: Kein Kundenname.`);
        continue;
      }

      try {
        const segment = this.parseSegment(
          this.getFromRecord(record, ['segment', 'kundensegment']),
        );
        const health = this.parseHealth(
          this.getFromRecord(record, ['health', 'status']),
        );
        const tags = this.parseTags(
          this.getFromRecord(record, ['tags', 'schlagworte']),
        );
        const mrrCents = this.parseCurrency(
          this.getFromRecord(record, ['mrr', 'arr', 'umsatz']),
        );

        const contactName = this.getFromRecord(record, [
          'contactname',
          'kontaktname',
          'ansprechpartner',
        ]);
        const contactEmail = this.getFromRecord(record, [
          'contactemail',
          'email',
        ]);
        const contactPhone = this.getFromRecord(record, [
          'contactphone',
          'phone',
          'telefon',
        ]);
        const contactChannel = this.getFromRecord(record, [
          'contactchannel',
          'kanal',
        ]);
        const contactRole = this.getFromRecord(record, [
          'contactrole',
          'rolle',
        ]);

        await this.prisma.customer.create({
          data: {
            tenantId: this.requireTenantId(),
            name: name.trim(),
            segment,
            ownerName:
              this.getFromRecord(record, [
                'ownername',
                'owner',
                'owneremail',
              ]) || undefined,
            region:
              this.getFromRecord(record, ['region', 'land', 'country']) ||
              undefined,
            health,
            mrrCents,
            decisionStage:
              this.getFromRecord(record, ['decisionstage', 'phase']) ||
              undefined,
            preferredChannel:
              this.getFromRecord(record, ['preferredchannel', 'kanal']) ||
              undefined,
            nextStep:
              this.getFromRecord(record, ['nextstep', 'aufgabe']) || undefined,
            lastContactAt: this.parseDate(
              this.getFromRecord(record, ['lastcontactat', 'kontakt']),
            ),
            nextStepDueAt: this.parseDate(
              this.getFromRecord(record, ['nextstepdueat', 'deadline']),
            ),
            tags,
            contacts:
              contactName || contactEmail || contactPhone
                ? {
                    create: [
                      {
                        name: contactName || contactEmail || 'Kontakt',
                        role: contactRole || undefined,
                        channel: contactChannel || undefined,
                        email: contactEmail || undefined,
                        phone: contactPhone || undefined,
                      },
                    ],
                  }
                : undefined,
          },
        });

        imported += 1;
      } catch (err) {
        skipped += 1;
        const message =
          err instanceof Error ? err.message : 'Unbekannter Fehler';
        errors.push(`Zeile ${lineNumber}: ${message}`);
      }
    }

    return { imported, skipped, errors };
  }

  private buildStats(customers: CustomerWithRelations[]) {
    const total = customers.length;
    const atRisk = customers.filter(
      (customer) => customer.health !== CustomerHealth.GOOD,
    ).length;
    const enterprise = customers.filter(
      (customer) => customer.segment === CustomerSegment.ENTERPRISE,
    ).length;
    const scheduledMeetings = customers.reduce(
      (count, customer) =>
        count +
        customer.activities.filter(
          (activity) => activity.status === CustomerActivityStatus.SCHEDULED,
        ).length,
      0,
    );
    const totalMrrCents = customers.reduce(
      (sum, customer) => sum + customer.mrrCents,
      0,
    );

    return { total, atRisk, enterprise, scheduledMeetings, totalMrrCents };
  }

  private toResponse(customer: CustomerWithRelations): CustomerResponse {
    return {
      id: customer.id,
      name: customer.name,
      segment: customer.segment,
      ownerName: customer.ownerName,
      region: customer.region,
      health: customer.health,
      mrrCents: customer.mrrCents,
      lastContactAt: customer.lastContactAt?.toISOString() ?? null,
      nextStep: customer.nextStep,
      nextStepDueAt: customer.nextStepDueAt?.toISOString() ?? null,
      decisionStage: customer.decisionStage,
      preferredChannel: customer.preferredChannel,
      tags: this.coerceTags(customer.tags),
      contacts: customer.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        channel: contact.channel,
        email: contact.email,
        phone: contact.phone,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      })),
      activities: customer.activities.map((activity) =>
        this.mapActivity(activity),
      ),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private coerceTags(tags: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags.filter((tag): tag is string => typeof tag === 'string');
  }

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }
    return tenantId;
  }

  private async upsertPrimaryContact(
    customerId: string,
    contact?: UpdateCustomerContactDto,
  ) {
    if (!contact) {
      return;
    }

    const hasInput =
      contact.name !== undefined ||
      contact.role !== undefined ||
      contact.channel !== undefined ||
      contact.email !== undefined ||
      contact.phone !== undefined;

    if (!hasInput) {
      return;
    }

    if (contact.id) {
      const data: Prisma.CustomerContactUpdateInput = {};
      if (contact.name !== undefined) {
        const name = contact.name.trim();
        if (!name) {
          throw new BadRequestException('Kontaktname darf nicht leer sein.');
        }
        data.name = name;
      }
      if (contact.role !== undefined) {
        data.role = contact.role?.trim() || null;
      }
      if (contact.channel !== undefined) {
        data.channel = contact.channel?.trim() || null;
      }
      if (contact.email !== undefined) {
        data.email = contact.email?.trim() || null;
      }
      if (contact.phone !== undefined) {
        data.phone = contact.phone?.trim() || null;
      }

      if (Object.keys(data).length === 0) {
        return;
      }

      await this.prisma.customerContact.update({
        where: { id: contact.id },
        data,
      });
      return;
    }

    const name = contact.name?.trim();
    if (!name) {
      return;
    }

    await this.prisma.customerContact.create({
      data: {
        customerId,
        name,
        role: contact.role?.trim() || undefined,
        channel: contact.channel?.trim() || undefined,
        email: contact.email?.trim() || undefined,
        phone: contact.phone?.trim() || undefined,
      },
    });
  }

  private mapActivity(activity: CustomerActivity): CustomerActivityResponse {
    return {
      id: activity.id,
      title: activity.title,
      detail: activity.detail,
      channel: activity.channel,
      status: activity.status,
      scheduledAt: activity.scheduledAt?.toISOString() ?? null,
      completedAt: activity.completedAt?.toISOString() ?? null,
      createdAt: activity.createdAt.toISOString(),
    };
  }

  private parseCsv(content: string) {
    const sanitized = content.replace(/^\uFEFF/, '');
    const lines = sanitized.split(/\r?\n/).filter((line) => line.trim().length);

    if (!lines.length) {
      return [];
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const headers = this.splitCsvLine(lines[0], delimiter).map((header) =>
      header
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
    );

    const records: Record<string, string>[] = [];
    for (const line of lines.slice(1)) {
      const values = this.splitCsvLine(line, delimiter);
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = values[index]?.trim() ?? '';
      });

      const hasContent = Object.values(record).some((value) => value.length);
      if (hasContent) {
        records.push(record);
      }
    }

    return records;
  }

  private splitCsvLine(line: string, delimiter: string) {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    result.push(current);
    return result;
  }

  private detectDelimiter(line: string) {
    const commaCount = (line.match(/,/g) ?? []).length;
    const semicolonCount = (line.match(/;/g) ?? []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  private getFromRecord(record: Record<string, string>, keys: string[]) {
    for (const key of keys) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (record[normalized]) {
        return record[normalized];
      }
    }
    return '';
  }

  private parseSegment(value?: string | null) {
    if (!value) {
      return CustomerSegment.SCALE;
    }
    const normalized = value.toUpperCase();
    if (
      normalized === CustomerSegment.ENTERPRISE ||
      normalized === CustomerSegment.SCALE ||
      normalized === CustomerSegment.TRIAL
    ) {
      return normalized;
    }
    return CustomerSegment.SCALE;
  }

  private parseHealth(value?: string | null) {
    if (!value) {
      return CustomerHealth.GOOD;
    }
    const normalized = value.toUpperCase();
    if (
      normalized === CustomerHealth.GOOD ||
      normalized === CustomerHealth.ATTENTION ||
      normalized === CustomerHealth.RISK
    ) {
      return normalized;
    }
    return CustomerHealth.GOOD;
  }

  private parseCurrency(value?: string | null) {
    if (!value) {
      return 0;
    }
    const normalized = value
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const amount = Number(normalized);
    if (Number.isNaN(amount)) {
      return 0;
    }
    return Math.max(0, Math.round(amount * 100));
  }

  private parseTags(value?: string | null) {
    if (!value) {
      return [];
    }
    return value
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private parseDate(value?: string | null) {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  }
}
