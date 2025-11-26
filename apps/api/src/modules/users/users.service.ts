import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

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
    void this.sendInviteEmail({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: tempPassword ?? dto.password ?? password,
    });

    return {
      user: this.toSanitizedUser(user),
      temporaryPassword: tempPassword,
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
    const name = [input.firstName, input.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const loginUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const subject = 'Dein Zugang zum Arcto CRM';
    
    const text = [
      name ? `Hi ${name},` : 'Hi,',
      '',
      'willkommen im Arcto CRM. Hier sind deine Zugangsdaten:',
      `E-Mail: ${input.email}`,
      `Passwort: ${input.password}`,
      '',
      `Login: ${loginUrl}`,
      '',
      'Bitte melde dich an und ändere dein Passwort im Profil.',
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
<body style="font-family: sans-serif; background-color: #f4f4f4; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: auto; background-color: #fff; border-radius: 8px; padding: 40px; border: 1px solid #ddd;">
        <h1 style="color: #0f172a; font-size: 24px;">Willkommen bei Arcto CRM!</h1>
        <p style="font-size: 16px; line-height: 1.5;">Hallo ${name || ''},</p>
        <p style="font-size: 16px; line-height: 1.5;">
            ein Account für dich wurde erstellt. Hier sind deine Zugangsdaten, um dich anzumelden:
        </p>
        <div style="background-color: #f8f8f8; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; font-size: 16px;">
            <p style="margin: 0 0 10px 0;"><strong>E-Mail:</strong> ${input.email}</p>
            <p style="margin: 0;"><strong>Passwort:</strong> ${input.password}</p>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">
            Bitte ändere dein Passwort nach dem ersten Login in deinem Profil.
        </p>
        <a href="${loginUrl}" style="display: inline-block; background-color: #0f172a; color: #fff; padding: 12px 25px; border-radius: 5px; text-decoration: none; font-size: 16px; margin-top: 20px;">
            Jetzt Anmelden
        </a>
        <p style="font-size: 14px; color: #777; margin-top: 30px;">
            Viele Grüße,<br>
            Dein Arcto Team
        </p>
    </div>
</body>
</html>`;

    await this.emailService.sendEmail({
      to: input.email,
      subject,
      text,
      html,
    });
  }
}
