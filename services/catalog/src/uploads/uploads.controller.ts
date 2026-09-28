import { Controller, HttpCode, Inject, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { v2 as cloudinary } from 'cloudinary';
import { CurrentUser, Roles, type AuthUser } from '@mercadia/service-kit';
import { CONFIG, type CatalogConfig } from '../config.js';

/**
 * Signed direct uploads: the browser sends images straight to Cloudinary with a signature
 * from us, so files never pass through (or overload) our servers.
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller('seller/uploads')
export class UploadsController {
  private readonly credentials?: { cloudName: string; apiKey: string; apiSecret: string };

  constructor(@Inject(CONFIG) config: CatalogConfig) {
    const match = config.cloudinaryUrl?.match(/^cloudinary:\/\/(\d+):([^@]+)@(.+)$/);
    if (match) this.credentials = { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
  }

  @Roles('seller')
  @Post('signature')
  @HttpCode(200)
  @ApiOperation({ summary: 'Parameters for a signed Cloudinary upload' })
  sign(@CurrentUser() user: AuthUser) {
    if (!this.credentials) {
      throw new ServiceUnavailableException(
        'Image uploads are not configured; paste image URLs instead',
      );
    }
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `mercadia/stores/${user.storeId}`;
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      this.credentials.apiSecret,
    );
    return {
      url: `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}/image/upload`,
      apiKey: this.credentials.apiKey,
      timestamp,
      folder,
      signature,
    };
  }
}
