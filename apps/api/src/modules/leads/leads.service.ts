import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LeadPriority, LeadStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmailService } from '../../infra/mailer/email.service';
import type { SmtpCredentials } from '../../common/interfaces/smtp-settings.interface';
import type { WorkspaceSettings } from '../../common/interfaces/workspace-settings.interface';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ContactRequestDto } from './dto/contact-request.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadSettingsDto } from './dto/update-lead-settings.dto';

type LeadEntity = Prisma.LeadGetPayload<{ include: { assignedTo: true } }>;

type LeadWorkflowSettingsEntity = Prisma.LeadWorkflowSettingGetPayload<{
  include: { autoAssignUser: true };
}>;

type LeadPayload = Pick<
  LeadEntity,
  'fullName' | 'email' | 'company' | 'phone' | 'priority' | 'message'
>;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
    private readonly context: RequestContextService,
  ) {}

  async createFromLanding(dto: CreateLeadDto) {
    const tenantId = this.getTenantId() ?? (await this.getDefaultTenantId());
    if (!tenantId) {
      throw new BadRequestException('Tenant für Lead-Erstellung fehlt.');
    }

    const payload: LeadPayload = {
      fullName: dto.fullName,
      email: dto.email,
      company: dto.company ?? null,
      phone: dto.phone ?? null,
      message: dto.message ?? null,
      priority: dto.priority ?? LeadPriority.MEDIUM,
    };

    return this.context.run({ tenantId }, async () => {
      const settings = await this.ensureWorkflowSettings({ tenantId });
      const workspaceSettings =
        (await this.settingsService.getWorkspaceSettings()) ?? null;
      const contactSmtp =
        (await this.settingsService.getContactFormSmtpCredentials()) ?? null;

      if (!contactSmtp) {
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte Kontaktformular-SMTP hinterlegen.',
        );
      }

      const targetAddress =
        contactSmtp.fromEmail?.trim() || contactSmtp.username?.trim() || null;

      if (!targetAddress) {
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden: SMTP-Absender/User nicht konfiguriert.',
        );
      }

      const subject = `Website Kontakt: ${
        payload.fullName || payload.email || 'Kontaktformular'
      }`;
      const companyName = this.getCompanyName(workspaceSettings);
      const text = this.buildContactEmailText(payload, companyName);
      const html = this.buildContactEmailHtml(payload, companyName);
      const replyTo = payload.email?.trim() || undefined;
      const from =
        contactSmtp.fromEmail?.trim() ||
        contactSmtp.username?.trim() ||
        undefined;

      try {
        await this.emailService.sendEmail(
          {
            to: targetAddress,
            subject,
            text,
            html,
            from,
            replyTo,
            headers: { 'X-Arcto-Source': 'contact-form' },
          },
          contactSmtp,
        );
      } catch (error) {
        this.logger.error(
          `Kontaktformular konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
        );
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte SMTP-Einstellungen prüfen.',
        );
      }

      await this.sendAutoResponder(payload, settings, contactSmtp);

      return { success: true };
    });
  }

  async sendContactRequest(dto: ContactRequestDto) {
    const tenantId = this.getTenantId() ?? (await this.getDefaultTenantId());
    if (!tenantId) {
      throw new BadRequestException(
        'Kein Tenant für Kontaktformular gefunden.',
      );
    }

    const payload: LeadPayload = {
      fullName: dto.fullName,
      email: dto.email,
      company: dto.company ?? null,
      phone: dto.phone ?? null,
      message: dto.message ?? null,
      priority: LeadPriority.MEDIUM,
    };

    return this.context.run({ tenantId }, async () => {
      const contactSmtp =
        (await this.settingsService.getContactFormSmtpCredentials()) ?? null;
      const workspaceSettings =
        (await this.settingsService.getWorkspaceSettings()) ?? null;
      const companyName = this.getCompanyName(workspaceSettings);

      if (!contactSmtp) {
        const contactMeta =
          (await this.settingsService.getContactFormSmtpSettings()) ?? null;
        this.logger.warn(
          `Kontaktformular Versand abgebrochen: Keine Kontakt-SMTP-Creds (meta=${JSON.stringify(
            contactMeta,
          )})`,
        );
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte Kontaktformular-SMTP hinterlegen.',
        );
      }

      const smtpCredentials = contactSmtp;

      const targetAddress =
        smtpCredentials?.fromEmail?.trim() ||
        smtpCredentials?.username?.trim() ||
        null;

      const fromAddress =
        smtpCredentials?.fromEmail?.trim() ||
        smtpCredentials?.username?.trim() ||
        null;

      if (!targetAddress || !fromAddress) {
        this.logger.warn(
          `Kontaktformular Versand abgebrochen: target=${targetAddress} from=${fromAddress} support=${workspaceSettings?.supportEmail} smtpFrom=${smtpCredentials?.fromEmail} smtpUser=${smtpCredentials?.username}`,
        );
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte Kontaktformular-SMTP hinterlegen.',
        );
      }

      const subject = `Website Kontakt: ${
        payload.fullName || payload.email || 'Kontaktformular'
      }`;
      const text = this.buildContactEmailText(payload, companyName);
      const html = this.buildContactEmailHtml(payload, companyName);
      const replyTo = payload.email?.trim() || undefined;

      try {
        await this.emailService.sendEmail(
          {
            to: targetAddress,
            subject,
            text,
            html,
            from: fromAddress,
            replyTo,
            headers: { 'X-Arcto-Source': 'contact-form' },
          },
          smtpCredentials ?? undefined,
        );
      } catch (error) {
        this.logger.error(
          `Kontaktformular konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
        );
        throw new BadRequestException(
          'Kontaktformular konnte nicht versendet werden. Bitte SMTP-Einstellungen prüfen.',
        );
      }

      if (payload.email?.trim()) {
        const company = companyName ?? 'unser Team';
        const ackSubject = `Vielen Dank für Ihre Kontaktanfrage bei ${company}`;
        const ackText = this.buildContactAcknowledgementText(
          payload,
          companyName,
        );
        const ackHtml = this.buildContactAcknowledgementHtml(
          payload,
          companyName,
        );
        try {
          await this.emailService.sendEmail(
            {
              to: payload.email.trim(),
              subject: ackSubject,
              text: ackText,
              html: ackHtml,
              from: fromAddress,
              replyTo: fromAddress,
            },
            smtpCredentials ?? undefined,
          );
        } catch (error) {
          this.logger.warn(
            `Bestätigungs-Mail konnte nicht gesendet werden: ${(error as Error)?.message ?? error}`,
          );
        }
      }

      return { success: true };
    });
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
          tenantId: existing.tenantId,
          leadId: updated.id,
          userId: actor?.sub ?? null,
          status: dto.status ?? updated.status,
          note: dto.note,
        },
      });
    }

    return updated;
  }

  async markLeadRead(id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Lead nicht gefunden');
    }

    const processedAt = existing.processedAt ?? new Date();

    return this.prisma.lead.update({
      where: { id },
      data: { processedAt },
    });
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
    tenantId?: string;
  }) {
    const tenantId = defaults?.tenantId ?? this.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant-Kontext fehlt.');
    }

    let settings = await this.prisma.leadWorkflowSetting.findFirst({
      include: { autoAssignUser: true },
      where: { tenantId },
    });

    if (!settings) {
      settings = await this.prisma.leadWorkflowSetting.create({
        data: {
          tenantId,
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

    const existing = await this.prisma.leadWorkflowSetting.findFirst({
      where: { tenantId: this.getTenantId() },
    });
    if (!existing) {
      return this.ensureWorkflowSettings({
        notifyEmail: dto.notifyEmail,
        autoAssignUserId: dto.autoAssignUserId ?? undefined,
        tenantId: this.getTenantId(),
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
    const recipients = await this.collectNotificationRecipients(settings, lead);
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
    lead: LeadPayload,
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

  private async forwardLeadToInbox(
    lead: LeadPayload,
    smtpCredentials: SmtpCredentials | null,
  ) {
    if (!smtpCredentials) {
      this.logger.warn(
        'Kontaktformular konnte nicht weitergeleitet werden – kein Kontakt-SMTP hinterlegt.',
      );
      return;
    }

    const imapSettings = await this.settingsService.getImapCredentials();
    const targetAddress =
      imapSettings?.username?.trim() ||
      smtpCredentials?.fromEmail?.trim() ||
      smtpCredentials?.username?.trim() ||
      null;

    if (!targetAddress) {
      this.logger.warn(
        'Kontaktformular konnte nicht weitergeleitet werden – keine Zieladresse gefunden.',
      );
      return;
    }

    const subject = `Website Kontakt: ${
      lead.fullName || lead.email || 'Kontaktformular'
    }`;
    const workspaceSettings =
      (await this.settingsService.getWorkspaceSettings()) ?? null;
    const companyName = this.getCompanyName(workspaceSettings);
    const text = this.buildContactEmailText(lead, companyName);
    const html = this.buildContactEmailHtml(lead, companyName);

    const replyTo = lead.email?.trim() || undefined;
    const from =
      lead.fullName && lead.email
        ? `${lead.fullName} <${lead.email}>`
        : lead.email?.trim() || undefined;

    try {
      await this.emailService.sendEmail(
        {
          to: targetAddress,
          subject,
          text,
        html,
        from,
        replyTo,
      },
      smtpCredentials,
    );
    } catch (error) {
      this.logger.error(
        `Kontaktformular konnte nicht weitergeleitet werden: ${
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

  private buildLeadSummaryText(lead: LeadPayload) {
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

  private buildLeadSummaryHtml(lead: LeadPayload) {
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

  private buildContactEmailText(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const intro = [
      'Hallo Team,',
      'es ist eine neue Anfrage über das Kontaktformular eingegangen:',
      '',
    ];

    const details = [
      `Name: ${lead.fullName || 'Unbekannt'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      `Priorität: ${lead.priority}`,
      '',
      'Nachricht:',
      lead.message?.trim() || '–',
    ];

    const signature = companyName?.trim()
      ? ['', 'Mit freundlichen Grüßen', companyName.trim()]
      : [];

    return [...intro, ...details, ...signature].join('\n');
  }

  private buildContactEmailHtml(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'Team';
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
          `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #1f2937;">
            <span style="color:#9ca3af; font-size:13px;">${this.escapeHtml(field.label)}</span>
            <span style="color:#e5e7eb; font-size:14px;">${this.escapeHtml(
              String(field.value ?? '–'),
            )}</span>
          </div>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#e5e7eb; font-size:14px; line-height:1.6;">
            <div style="color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Nachricht</div>
            ${this.formatHtml(lead.message)}
         </div>`
      : '<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#9ca3af; font-size:14px;">Nachricht: –</div>';

    const signature = companyName?.trim()
      ? `<p style="margin:16px 0 0 0; color:#e5e7eb; font-size:14px;">Mit freundlichen Grüßen<br /><strong>${this.escapeHtml(
          companyName.trim(),
        )}</strong></p>`
      : '';

    return `<div style="background:#0b1220; padding:20px;">
      <div style="max-width:640px; margin:0 auto; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <p style="margin:0 0 12px 0; color:#9ca3af; font-size:13px;">Hallo Team,</p>
        <p style="margin:0 0 18px 0; color:#e5e7eb; font-size:15px;">es ist eine neue Anfrage über das Kontaktformular eingegangen:</p>
        <div style="border:1px solid #1f2937; border-radius:12px; overflow:hidden; background:#0f172a;">
          ${fieldHtml}
        </div>
        <div style="margin-top:16px;">${messageHtml}</div>
        ${signature}
        <p style="margin:12px 0 0 0; color:#64748b; font-size:12px;">Empfangen von ${this.escapeHtml(
          company,
        )}</p>
      </div>
    </div>`;
  }

  private buildContactAcknowledgementText(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'unser Team';
    const greeting = lead.fullName?.trim()
      ? `Hallo ${lead.fullName.trim()},`
      : 'Hallo,';

    const lines = [
      greeting,
      '',
      `vielen Dank für deine Nachricht an ${company}. Wir melden uns so schnell wie möglich.`,
      '',
      'Kurzfassung deiner Angaben:',
      `Name: ${lead.fullName || '–'}`,
      `E-Mail: ${lead.email ?? '–'}`,
      `Firma: ${lead.company ?? '–'}`,
      `Telefon: ${lead.phone ?? '–'}`,
      '',
      'Nachricht:',
      lead.message?.trim() || '–',
      '',
      'Mit freundlichen Grüßen',
      company,
    ];

    return lines.join('\n');
  }

  private buildContactAcknowledgementHtml(
    lead: LeadPayload,
    companyName?: string | null,
  ) {
    const company = companyName?.trim() || 'unser Team';
    const greeting = lead.fullName?.trim()
      ? `Hallo ${this.escapeHtml(lead.fullName.trim())},`
      : 'Hallo,';

    const fields = [
      { label: 'Name', value: lead.fullName || '–' },
      { label: 'E-Mail', value: lead.email ?? '–' },
      { label: 'Firma', value: lead.company ?? '–' },
      { label: 'Telefon', value: lead.phone ?? '–' },
    ];

    const fieldHtml = fields
      .map(
        (field) =>
          `<div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #1f2937;">
            <span style="color:#9ca3af; font-size:13px;">${this.escapeHtml(field.label)}</span>
            <span style="color:#e5e7eb; font-size:14px;">${this.escapeHtml(
              String(field.value ?? '–'),
            )}</span>
          </div>`,
      )
      .join('');

    const messageHtml = lead.message
      ? `<div style="padding:12px; border-radius:12px; background:#0f172a; border:1px solid #1f2937; color:#e5e7eb; font-size:14px; line-height:1.6;">
            <div style="color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">Nachricht</div>
            ${this.formatHtml(lead.message)}
         </div>`
      : '<div style="padding:12px; border-radius:12px; background:#0f172a; border:1f2937; color:#9ca3af; font-size:14px;">Nachricht: –</div>';

    return `<div style="background:#0b1220; padding:20px;">
      <div style="max-width:640px; margin:0 auto; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <p style="margin:0 0 12px 0; color:#e5e7eb; font-size:15px;">${greeting}</p>
        <p style="margin:0 0 16px 0; color:#cbd5e1; font-size:14px; line-height:1.6;">
          vielen Dank für deine Nachricht an ${this.escapeHtml(
            company,
          )}. Wir melden uns so schnell wie möglich.
        </p>
        <p style="margin:0 0 8px 0; color:#9ca3af; font-size:12px; letter-spacing:0.08em; text-transform:uppercase;">Kurzfassung</p>
        <div style="border:1px solid #1f2937; border-radius:12px; overflow:hidden; background:#0f172a;">
          ${fieldHtml}
        </div>
        <div style="margin-top:16px;">${messageHtml}</div>
        <p style="margin:16px 0 0 0; color:#e5e7eb; font-size:14px;">Mit freundlichen Grüßen<br /><strong>${this.escapeHtml(
          company,
        )}</strong></p>
      </div>
    </div>`;
  }

  private getCompanyName(settings?: WorkspaceSettings | null) {
    return settings?.companyName?.trim() ?? settings?.legalName?.trim() ?? null;
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

  private renderTemplate(template: string, lead: LeadPayload) {
    const replacements: Record<string, string> = {
      name: lead.fullName ?? '',
      firstName: lead.fullName?.split(' ')[0] ?? lead.fullName ?? '',
      email: lead.email ?? '',
      company: lead.company ?? '',
      phone: lead.phone ?? '',
    };

    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) => {
      const key = token;
      return replacements[key] ?? '';
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

  private getTenantId(): string | undefined {
    return this.context.getTenantId();
  }

  private async getDefaultTenantId(): Promise<string | undefined> {
    const tenant = await this.prisma.tenant.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return tenant?.id;
  }
}
