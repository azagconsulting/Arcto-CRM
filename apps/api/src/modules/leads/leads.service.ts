import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadPriority, LeadStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailService } from '../../infra/mailer/email.service';
import type { SmtpCredentials } from '../../common/interfaces/smtp-settings.interface';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadSettingsDto } from './dto/update-lead-settings.dto';

type LeadEntity = Prisma.LeadGetPayload<{ include: { assignedTo: true } }>;

type LeadWorkflowSettingsEntity = Prisma.LeadWorkflowSettingGetPayload<{
  include: { autoAssignUser: true };
}>;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
  ) {}

  async createFromLanding(dto: CreateLeadDto) {
    const settings = await this.ensureWorkflowSettings();
    const assignedTo = settings?.autoAssignUserId
      ? {
          connect: { id: settings.autoAssignUserId },
        }
      : undefined;

    const lead = await this.prisma.lead.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        company: dto.company,
        phone: dto.phone,
        message: dto.message,
        priority: dto.priority ?? LeadPriority.MEDIUM,
        status: LeadStatus.NEW,
        routingLabel: settings?.routingHeadline ?? 'Website',
        assignedTo,
      },
      include: {
        assignedTo: true,
      },
    });

    await this.prisma.leadUpdate.create({
      data: {
        leadId: lead.id,
        status: lead.status,
        note: 'Neue Anfrage über Landingpage',
      },
    });

    const smtpCredentials = await this.settingsService.getSmtpCredentials();

    await Promise.allSettled([
      this.notifyTeamOfLead(lead, settings, smtpCredentials),
      this.sendAutoResponder(lead, settings, smtpCredentials),
    ]);

    return lead;
  }

  async listLeads(limit = 25) {
    return this.prisma.lead.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { assignedTo: true },
    });
  }

  async updateLead(id: string, dto: UpdateLeadDto, actor?: AuthUser) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Lead nicht gefunden');
    }

    const data: Prisma.LeadUpdateInput = {};

    if (dto.status) {
      data.status = dto.status;
      data.processedAt =
        dto.status === LeadStatus.NEW
          ? null
          : (existing.processedAt ?? new Date());

      data.archivedAt = dto.status === LeadStatus.ARCHIVED ? new Date() : null;
    }

    if (dto.priority) {
      data.priority = dto.priority;
    }

    if (dto.routingLabel) {
      data.routingLabel = dto.routingLabel;
    }

    if (dto.assignedToId) {
      await this.ensureUser(dto.assignedToId);
    }

    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: { assignedTo: true },
    });

    if (dto.status || dto.note) {
      await this.prisma.leadUpdate.create({
        data: {
          leadId: updated.id,
          userId: actor?.sub ?? null,
          status: dto.status ?? updated.status,
          note: dto.note,
        },
      });
    }

    return updated;
  }

  async getTimeline(leadId: string) {
    await this.ensureLeadExists(leadId);

    return this.prisma.leadUpdate.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async ensureWorkflowSettings(defaults?: {
    notifyEmail?: string;
    autoAssignUserId?: string;
  }) {
    let settings =
      await this.prisma.leadWorkflowSetting.findFirst({
        include: { autoAssignUser: true },
      });

    if (!settings) {
      settings = await this.prisma.leadWorkflowSetting.create({
        data: {
          notifyEmail: defaults?.notifyEmail,
          routingHeadline: 'Kontaktaufnahme',
          routingDescription: 'Neue Leads landen direkt im Dashboard.',
          autoAssignUserId: defaults?.autoAssignUserId,
        },
        include: { autoAssignUser: true },
      });
    }

    return settings;
  }

  async getWorkflowSettings() {
    return this.ensureWorkflowSettings();
  }

  async updateWorkflowSettings(dto: UpdateLeadSettingsDto) {
    if (dto.autoAssignUserId) {
      await this.ensureUser(dto.autoAssignUserId);
    }

    const existing = await this.prisma.leadWorkflowSetting.findFirst();
    if (!existing) {
      return this.ensureWorkflowSettings({
        notifyEmail: dto.notifyEmail,
        autoAssignUserId: dto.autoAssignUserId ?? undefined,
      });
    }

    const data: Prisma.LeadWorkflowSettingUpdateInput = {
      notifyEmail: dto.notifyEmail ?? existing.notifyEmail,
      routingHeadline: dto.routingHeadline ?? existing.routingHeadline,
      routingDescription: dto.routingDescription ?? existing.routingDescription,
      autoResponderEnabled:
        dto.autoResponderEnabled ?? existing.autoResponderEnabled,
      autoResponderMessage:
        dto.autoResponderMessage ?? existing.autoResponderMessage,
    };

    if (dto.autoAssignUserId !== undefined) {
      data.autoAssignUser = dto.autoAssignUserId
        ? { connect: { id: dto.autoAssignUserId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.leadWorkflowSetting.update({
      where: { id: existing.id },
      data,
      include: { autoAssignUser: true },
    });

    return updated;
  }

  private async notifyTeamOfLead(
    lead: LeadEntity,
    settings: LeadWorkflowSettingsEntity | null,
    smtpCredentials: SmtpCredentials | null,
  ) {
    const recipients = await this.collectNotificationRecipients(
      settings,
      lead,
    );
    if (!recipients.length) {
      this.logger.warn(
        'Neue Anfrage ohne Benachrichtigung, da kein Empfänger ermittelt werden konnte.',
      );
      return;
    }

    const subject = `Neue Anfrage: ${
      lead.fullName || lead.email || 'Kontaktformular'
    }`;
    const text = this.buildLeadSummaryText(lead);
    const html = this.buildLeadSummaryHtml(lead);

    await Promise.all(
      recipients.map(async (to) => {
        try {
          await this.emailService.sendEmail(
            { to, subject, text, html },
            smtpCredentials ?? undefined,
          );
        } catch (error) {
          this.logger.error(
            `Benachrichtigung an ${to} konnte nicht gesendet werden: ${
              (error as Error)?.message ?? error
            }`,
          );
        }
      }),
    );
  }

  private async sendAutoResponder(
    lead: LeadEntity,
    settings: LeadWorkflowSettingsEntity | null,
    smtpCredentials: SmtpCredentials | null,
  ) {
    if (
      !settings?.autoResponderEnabled ||
      !settings.autoResponderMessage?.trim()
    ) {
      return;
    }

    const toEmail = lead.email?.trim();
    if (!toEmail) {
      return;
    }

    const subject = settings.routingHeadline
      ? `${settings.routingHeadline} – wir melden uns`
      : 'Danke für deine Nachricht';

    const text = this.renderTemplate(
      settings.autoResponderMessage.trim(),
      lead,
    ).trim();

    if (!text) {
      return;
    }

    const html = this.formatHtml(text);

    try {
      await this.emailService.sendEmail(
        {
          to: toEmail,
          subject,
          text,
          html,
        },
        smtpCredentials ?? undefined,
      );
    } catch (error) {
      this.logger.error(
        `Auto-Responder konnte nicht gesendet werden: ${
          (error as Error)?.message ?? error
        }`,
      );
    }
  }

  private async collectNotificationRecipients(
    settings: LeadWorkflowSettingsEntity | null,
    lead: LeadEntity,
  ) {
    const recipients = new Set<string>();
    const normalized = (value?: string | null) =>
      value?.trim().toLowerCase() ?? null;

    const notifyEmail = normalized(settings?.notifyEmail);
    if (notifyEmail) {
      recipients.add(notifyEmail);
    }

    const autoAssignEmail = normalized(settings?.autoAssignUser?.email);
    if (autoAssignEmail) {
      recipients.add(autoAssignEmail);
    }

    const assignedEmail = normalized(lead.assignedTo?.email);
    if (assignedEmail) {
      recipients.add(assignedEmail);
    }

    if (!recipients.size) {
      const fallbackUsers = await this.usersService.listAssignableUsers();
      fallbackUsers
        .map((user) => normalized(user.email))
        .filter((email): email is string => Boolean(email))
        .slice(0, 5)
        .forEach((email) => recipients.add(email));
    }

    return Array.from(recipients);
  }

  private buildLeadSummaryText(lead: LeadEntity) {
    const lines = [
      `Name: ${lead.fullName || 'Unbekannt'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      `Priorität: ${lead.priority}`,
    ];

    const message = lead.message
      ? `\nNachricht:\n${lead.message}`
      : '\nNachricht:\n–';

    return `Neue Anfrage über das Kontaktformular\n\n${lines.join(
      '\n',
    )}${message}`;
  }

  private buildLeadSummaryHtml(lead: LeadEntity) {
    const fields = [
      { label: 'Name', value: lead.fullName || 'Unbekannt' },
      { label: 'E-Mail', value: lead.email ?? '–' },
      { label: 'Firma', value: lead.company ?? '–' },
      { label: 'Telefon', value: lead.phone ?? '–' },
      { label: 'Priorität', value: lead.priority },
    ];

    const fieldHtml = fields
      .map(
        (field) =>
          `<p><strong>${field.label}:</strong> ${this.escapeHtml(
            String(field.value ?? '–'),
          )}</p>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<p><strong>Nachricht:</strong><br />${this.formatHtml(lead.message)}</p>`
      : '<p><strong>Nachricht:</strong> –</p>';

    return `<div>${fieldHtml}${messageHtml}</div>`;
  }

  private formatHtml(content: string) {
    return this.escapeHtml(content).replace(/\n/g, '<br />');
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  private renderTemplate(template: string, lead: LeadEntity) {
    const replacements: Record<string, string> = {
      name: lead.fullName ?? '',
      firstName: lead.fullName?.split(' ')[0] ?? lead.fullName ?? '',
      email: lead.email ?? '',
      company: lead.company ?? '',
      phone: lead.phone ?? '',
    };

    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token) => {
      return replacements[token] ?? '';
    });
  }

  private async ensureLeadExists(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Lead nicht gefunden');
    }
    return lead;
  }

  private async ensureUser(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User für Assignment nicht gefunden');
    }
    return user;
  }
}
