import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthUser } from '@mercadia/service-kit';
import type { RequestMeta } from '../audit/audit.service.js';
import { Meta } from '../request-meta.js';
import { AuthService } from './auth.service.js';
import {
  DemoLoginDto,
  GoogleCallbackDto,
  GoogleUrlDto,
  LoginDto,
  MfaLoginDto,
  RefreshDto,
  RegisterDto,
  TotpCodeDto,
} from './dto/auth.dto.js';
import { GoogleService } from './google.service.js';
import { TokensService } from './tokens.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly google: GoogleService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Meta() meta: RequestMeta) {
    return this.auth.register(dto, meta);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Returns tokens, or { mfaRequired, mfaToken } when 2FA is on' })
  login(@Body() dto: LoginDto, @Meta() meta: RequestMeta) {
    return this.auth.login(dto.email, dto.password, meta);
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(200)
  loginWithMfa(@Body() dto: MfaLoginDto, @Meta() meta: RequestMeta) {
    return this.auth.loginWithMfa(dto.mfaToken, dto.code, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotates the refresh token (reusing an old one revokes the session)' })
  refresh(@Body() dto: RefreshDto, @Meta() meta: RequestMeta) {
    return this.tokens.refresh(dto.refreshToken, meta);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto, @Meta() meta: RequestMeta) {
    await this.auth.logout(dto.refreshToken, meta);
  }

  @Public()
  @Get('google/url')
  googleUrl(@Query() dto: GoogleUrlDto) {
    return {
      url: this.google.authorizationUrl(dto.redirectUri, dto.state),
      enabled: this.google.enabled,
    };
  }

  @Public()
  @Get('providers')
  providers() {
    return { google: this.google.enabled };
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  googleLogin(@Body() dto: GoogleCallbackDto, @Meta() meta: RequestMeta) {
    return this.auth.loginWithGoogle(dto.code, dto.redirectUri, meta);
  }

  @Public()
  @Post('demo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signs in as a seeded demo buyer, seller or admin' })
  demo(@Body() dto: DemoLoginDto, @Meta() meta: RequestMeta) {
    return this.auth.demoLogin(dto.role, meta);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @ApiOperation({ summary: 'Creates a TOTP secret and returns it with a QR code' })
  setup(@CurrentUser() user: AuthUser) {
    return this.auth.setupTotp(user.sub);
  }

  @ApiBearerAuth()
  @Post('2fa/enable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirms the first code and returns 10 recovery codes' })
  enable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Meta() meta: RequestMeta) {
    return this.auth.enableTotp(user.sub, dto.code, meta);
  }

  @ApiBearerAuth()
  @Post('2fa/disable')
  @HttpCode(204)
  async disable(
    @CurrentUser() user: AuthUser,
    @Body() dto: TotpCodeDto,
    @Meta() meta: RequestMeta,
  ) {
    await this.auth.disableTotp(user.sub, dto.code, meta);
  }
}
