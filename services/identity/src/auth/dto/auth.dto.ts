import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export class RegisterDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Secreta123', description: '8+ chars with upper, lower and a digit' })
  @Matches(STRONG, {
    message: 'password must have 8+ characters, upper and lower case and a digit',
  })
  password: string;

  @ApiProperty({ example: 'Ana Ruiz' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ enum: ['es', 'en'] })
  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: 'es' | 'en';
}

export class LoginDto {
  @ApiProperty({ example: 'laura@mercadia.dev' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Mercadia2026!' })
  @IsString()
  @MaxLength(200)
  password: string;
}

export class MfaLoginDto {
  @ApiProperty()
  @IsString()
  mfaToken: string;

  @ApiProperty({ description: '6-digit TOTP code or a recovery code (xxxx-xxxx)' })
  @IsString()
  @Length(6, 9)
  code: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}

export class GoogleUrlDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  redirectUri: string;

  @ApiProperty()
  @IsString()
  @Length(8, 200)
  state: string;
}

export class GoogleCallbackDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  redirectUri: string;
}

export class DemoLoginDto {
  @ApiProperty({ enum: ['buyer', 'seller', 'admin'] })
  @IsIn(['buyer', 'seller', 'admin'])
  role: 'buyer' | 'seller' | 'admin';
}

export class TotpCodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code: string;
}
