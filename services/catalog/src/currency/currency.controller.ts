import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@mercadia/service-kit';
import { RatesService } from './rates.service.js';

@ApiTags('currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly rates: RatesService) {}

  @Public()
  @Get('rates')
  @Header('Cache-Control', 'public, max-age=600')
  snapshot() {
    return this.rates.snapshot();
  }
}
