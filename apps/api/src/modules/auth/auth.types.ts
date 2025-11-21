import { UserRole } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SanitizedUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export interface AuthResponse {
  user: SanitizedUser;
  tokens: AuthTokens;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthUser extends JwtPayload {
  iat?: number;
  exp?: number;
}
