import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { OpsService } from './ops.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('health/live')
  getLive() {
    return this.ops.getLiveness();
  }

  @Get('health/ready')
  async getReady(@Res({ passthrough: true }) res: Response) {
    const payload = await this.ops.getReadiness();
    if (!payload.ready) {
      res.status(503);
    }
    return payload;
  }

  @Get('health/dependencies')
  async getDependencies(@Res({ passthrough: true }) res: Response) {
    const payload = await this.ops.getDependenciesStatus();
    if (!payload.healthy) {
      res.status(503);
    }
    return payload;
  }

  @Get('dashboard/slo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getSlo(@Query('windowMinutes') windowMinutesRaw?: string) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getSloSnapshot(windowMinutes);
  }

  @Get('dashboard/alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAlerts(@Query('windowMinutes') windowMinutesRaw?: string) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getAlertSnapshot(windowMinutes);
  }

  @Get('dashboard/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getSummary(@Query('windowMinutes') windowMinutesRaw?: string) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getDashboardSummary(windowMinutes);
  }
}
