import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@mercadia/service-kit';
import { KeysService } from './keys.service.js';

@ApiTags('keys')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: KeysService) {}

  /** Public keys used by every service to verify access tokens. */
  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks() {
    return this.keys.jwks();
  }
}
