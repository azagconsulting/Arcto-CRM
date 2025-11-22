import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { EmailService } from '../../infra/mailer/email.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { SanitizedUser } from '../auth/auth.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface CreateUserInput {
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
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role ?? UserRole.COORDINATOR,
      },
    });
  }

  count() {
    return this.prisma.user.count();
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

  private toSanitizedUser(user: User): SanitizedUser {
    return {
      id: user.id,
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

  private async sendInviteEmail(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    password: string;
  }) {
    const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
    const loginUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const subject = 'Dein Zugang zum Arcto CRM';
    const lines = [
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
    ];

    await this.emailService.sendEmail({
      to: input.email,
      subject,
      text: lines.join('\n'),
    });
  }
}
