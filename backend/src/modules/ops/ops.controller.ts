import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OpsService } from './ops.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UpsertPaymentWebhookSecurityPolicyDto } from './dto';

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

  @Get('dashboard/realtime-ack')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getRealtimeAck(@Query('windowMinutes') windowMinutesRaw?: string) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getRealtimeAckSnapshot(windowMinutes);
  }

  @Get('dashboard/payments-security')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getPaymentsSecurity(@Query('windowMinutes') windowMinutesRaw?: string) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getPaymentWebhookSecuritySnapshot(windowMinutes);
  }

  @Get('dashboard/payments-security/runbook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getPaymentsSecurityRunbook(
    @Query('windowMinutes') windowMinutesRaw?: string,
  ) {
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : 60;
    return this.ops.getPaymentWebhookSecurityRunbook(windowMinutes);
  }

  @Get('dashboard/payments-security/policies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getPaymentsSecurityPolicies() {
    const items = await this.ops.listPaymentWebhookSecurityPolicies();
    return { items };
  }

  @Post('dashboard/payments-security/policies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async upsertPaymentsSecurityPolicy(
    @Req() req: Request,
    @Body() dto: UpsertPaymentWebhookSecurityPolicyDto,
  ) {
    const user = req.user as { sub?: string } | undefined;
    const item = await this.ops.upsertPaymentWebhookSecurityPolicy(
      dto,
      user?.sub ?? null,
    );
    return { item };
  }

  @Get('dashboard/payments-security/policies/audit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getPaymentsSecurityPolicyAudit(@Query('limit') limitRaw?: string) {
    const parsed = Number.parseInt(limitRaw ?? '50', 10);
    const items = await this.ops.listPaymentWebhookSecurityPolicyAudit(
      Number.isNaN(parsed) ? 50 : parsed,
    );
    return { items };
  }
}
