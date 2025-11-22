import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import type { AppConfig } from '../../config/app.config';
import { LeadsService } from '../leads/leads.service';
import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthUser,
  JwtPayload,
  SanitizedUser,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly leadsService: LeadsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    const auth = this.configService.getOrThrow('auth', { infer: true });
    this.jwtSecret = auth.jwt.secret;
    this.jwtExpiresIn = auth.jwt.expiresIn;
    this.refreshSecret = auth.refresh.secret;
    this.refreshExpiresIn = auth.refresh.expiresIn;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) {
      throw new BadRequestException(
        'Ein Account mit dieser E-Mail existiert bereits.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userCount = await this.usersService.count();
    const role = userCount === 0 ? UserRole.ADMIN : UserRole.COORDINATOR;
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
    });

    await this.leadsService.ensureWorkflowSettings({
      notifyEmail: dto.email,
      autoAssignUserId: user.id,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Ungültige Zugangsdaten.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Ungültige Zugangsdaten.');
    }

    await this.usersService.touchLogin(user.id);
    return this.buildAuthResponse(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponse> {
    try {
      const payload = (await this.jwtService.verifyAsync<AuthUser>(
        dto.refreshToken,
        {
          secret: this.refreshSecret,
        },
      )) as JwtPayload;

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User nicht gefunden');
      }

      return this.buildAuthResponse(user);
    } catch {
      throw new UnauthorizedException('Refresh Token ungültig oder abgelaufen');
    }
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn,
      }),
    ]);

    return {
      user: this.mapUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.parseExpiry(this.jwtExpiresIn),
      },
    };
  }

  private mapUser(user: User): SanitizedUser {
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

  private parseExpiry(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const numeric = parseInt(value, 10);
    if (Number.isNaN(numeric)) {
      return 0;
    }

    if (value.endsWith('m')) {
      return numeric * 60;
    }
    if (value.endsWith('h')) {
      return numeric * 60 * 60;
    }
    if (value.endsWith('d')) {
      return numeric * 60 * 60 * 24;
    }
    return numeric;
  }

  toSafeUser(user: User): SanitizedUser {
    return this.mapUser(user);
  }
}
