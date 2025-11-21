import { Body, Controller, Get, Post } from '@nestjs/common';

import { UsersService } from '../users/users.service';
import type { AuthResponse, AuthUser, SanitizedUser } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refresh(dto);
  }

  @Get('me')
  async me(@CurrentUser() user?: AuthUser): Promise<SanitizedUser | null> {
    if (!user) {
      return null;
    }

    const entity = await this.usersService.findById(user.sub);
    if (!entity) {
      return null;
    }

    return this.authService.toSafeUser(entity);
  }
}
