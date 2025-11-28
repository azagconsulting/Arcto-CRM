import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { EmailService } from '../../infra/mailer/email.service';
import { RequestContextService } from '../../infra/request-context/request-context.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { SanitizedUser } from '../auth/auth.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SettingsService } from '../settings/settings.service';
import { SmtpCredentials } from '../../common/interfaces/smtp-settings.interface';

interface CreateUserInput {
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly context: RequestContextService,
    private readonly settingsService: SettingsService,
  ) {}

  private readonly logger = new Logger(UsersService.name);

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role ?? UserRole.COORDINATOR,
      },
    });
  }

  count() {
    return this.prisma.user.count({
      where: { tenantId: this.context.getTenantId() },
    });
  }

  async touchLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async listAssignableUsers() {
    return this.prisma.user.findMany({
      where: { tenantId: this.context.getTenantId() },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
  }

  async listEmployees(): Promise<SanitizedUser[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId: this.context.getTenantId() },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toSanitizedUser(user));
  }

  async createEmployee(dto: CreateEmployeeDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException(
        'Ein Mitarbeiter mit dieser E-Mail existiert bereits.',
      );
    }

    const password =
      dto.password ??
      randomBytes(6)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 10);

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: this.requireTenantId(),
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? UserRole.COORDINATOR,
      },
    });

    const tempPassword = dto.password ? undefined : password;
    let inviteEmailSent = false;
    let inviteEmailError: string | undefined;
    try {
      await this.sendInviteEmail({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: tempPassword ?? dto.password ?? password,
      });
      inviteEmailSent = true;
    } catch (err) {
      inviteEmailError =
        err instanceof Error
          ? err.message
          : 'Einladung konnte nicht gesendet werden.';
      this.logger.warn(
        `Einladung konnte nicht per E-Mail gesendet werden: ${inviteEmailError}`,
      );
    }

    return {
      user: this.toSanitizedUser(user),
      temporaryPassword: tempPassword,
      inviteEmailSent,
      inviteEmailError,
    };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const clean = (value?: string | null) => {
      if (!value) {
        return value ?? null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const data: Prisma.UserUpdateInput = {
      firstName: clean(dto.firstName),
      lastName: clean(dto.lastName),
      jobTitle: clean(dto.jobTitle),
      headline: clean(dto.headline),
      phone: clean(dto.phone),
      location: clean(dto.location),
      pronouns: clean(dto.pronouns),
      bio: clean(dto.bio),
      avatarUrl: clean(dto.avatarUrl),
      linkedinUrl: clean(dto.linkedinUrl),
      twitterUrl: clean(dto.twitterUrl),
      calendlyUrl: clean(dto.calendlyUrl),
    };

    if (dto.email) {
      data.email = dto.email.toLowerCase();
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        jobTitle: true,
        headline: true,
        phone: true,
        location: true,
        pronouns: true,
        bio: true,
        linkedinUrl: true,
        twitterUrl: true,
        calendlyUrl: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName) data.firstName = dto.firstName;
    if (dto.lastName) data.lastName = dto.lastName;
    if (dto.role) data.role = dto.role;

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return this.toSanitizedUser(user);
  }

  async deleteEmployee(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Mitarbeiter nicht gefunden.');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Mitarbeiter gelöscht.' };
  }

  private toSanitizedUser(user: User): SanitizedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle: user.jobTitle,
      headline: user.headline,
      phone: user.phone,
      location: user.location,
      pronouns: user.pronouns,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      linkedinUrl: user.linkedinUrl,
      twitterUrl: user.twitterUrl,
      calendlyUrl: user.calendlyUrl,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  private requireTenantId(): string {
    const tenantId = this.context.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext vorhanden.');
    }
    return tenantId;
  }

  private async sendInviteEmail(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
  }) {
    const tenantSmtp: SmtpCredentials | null =
      await this.settingsService.getSmtpCredentials();

    if (!tenantSmtp && !this.emailService.hasSmtpTransport()) {
      throw new Error(
        'SMTP ist nicht konfiguriert. Bitte unter Einstellungen einen SMTP-Zugang hinterlegen.',
      );
    }

    const name = [input.firstName, input.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const loginUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const subject = 'Willkommen im Arcto CRM – dein Zugang';
    const greeting = name ? `Hi ${name},` : 'Hi,';

    const text = [
      greeting,
      '',
      'du wurdest ins Arcto CRM eingeladen. Hier sind deine Zugangsdaten:',
      `E-Mail: ${input.email}`,
      `Passwort: ${input.password}`,
      '',
      `Login: ${loginUrl}`,
      '',
      'Bitte melde dich an und ändere dein Passwort nach dem ersten Login in deinem Profil.',
      '',
      'Wenn du Fragen hast, melde dich gerne beim Team.',
      '',
      'Viele Grüße',
      'Dein Arcto Team',
    ].join('\n');

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #0b1220; padding: 24px; color: #e2e8f0;">
    <div style="max-width: 640px; margin: auto; background: linear-gradient(135deg, #111827 0%, #0b1220 100%); border-radius: 16px; padding: 32px; border: 1px solid #1f2937;">
        <p style="letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; color: #94a3b8; margin: 0 0 12px 0;">Team</p>
        <h1 style="margin: 0 0 12px 0; font-size: 24px; color: #e5e7eb;">Willkommen im Arcto CRM</h1>
        <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">${greeting}</p>
        <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6;">
            du wurdest eingeladen, unser CRM zu nutzen. Hier sind deine Zugangsdaten:
        </p>
        <div style="background: #0f172a; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #cbd5e1;"><strong>E-Mail:</strong> ${input.email}</p>
            <p style="margin: 0; font-size: 14px; color: #cbd5e1;"><strong>Passwort:</strong> ${input.password}</p>
        </div>
        <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
            Bitte ändere dein Passwort nach dem ersten Login in deinem Profil.
        </p>
        <a href="${loginUrl}" style="display: inline-block; margin-top: 8px; background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); color: #0b1220; padding: 12px 20px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Jetzt anmelden
        </a>
        <p style="margin: 20px 0 0 0; font-size: 13px; color: #94a3b8;">
            Bei Fragen melde dich gerne beim Team.
        </p>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8;">Viele Grüße<br>Dein Arcto Team</p>
    </div>
</body>
</html>`;

    await this.emailService.sendEmail(
      {
        to: input.email,
        subject,
        text,
        html,
        from:
          tenantSmtp?.fromEmail && tenantSmtp.fromName
            ? `${tenantSmtp.fromName} <${tenantSmtp.fromEmail}>`
            : (tenantSmtp?.fromEmail ??
              (this.emailService.getDefaultSender()
                ? `Arcto Team <${this.emailService.getDefaultSender()}>`
                : undefined)),
      },
      tenantSmtp ?? undefined,
    );
  }
}
