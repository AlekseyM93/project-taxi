import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UpsertCityTierDto, UpsertTariffDto } from './dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DISPATCHER')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('tariffs')
  async listTariffs(@Query('cityId') cityId?: string) {
    const tariffs = await this.pricing.listTariffs(cityId);
    return {
      items: tariffs,
    };
  }

  @Post('tariffs')
  async upsertTariff(@Req() req: Request, @Body() dto: UpsertTariffDto) {
    const user = req.user as { sub?: string; role?: string } | undefined;
    const tariff = await this.pricing.upsertTariff(dto, {
      actorId: user?.sub ?? null,
      actorRole: user?.role ?? null,
    });
    return {
      item: tariff,
    };
  }

  @Get('city-tiers')
  async listCityTiers() {
    const tiers = await this.pricing.listCityTiers();
    return {
      items: tiers,
    };
  }

  @Post('city-tiers')
  async upsertCityTier(@Req() req: Request, @Body() dto: UpsertCityTierDto) {
    const user = req.user as { sub?: string; role?: string } | undefined;
    const tier = await this.pricing.upsertCityTier(dto, {
      actorId: user?.sub ?? null,
      actorRole: user?.role ?? null,
    });
    return {
      item: tier,
    };
  }

  @Get('audit')
  async listAudit(@Query('limit') limit?: string) {
    const rows = await this.pricing.listAuditLogs(Number(limit) || 50);
    return {
      items: rows,
    };
  }
}
