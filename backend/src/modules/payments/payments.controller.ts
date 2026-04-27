import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  PaymentOperationDto,
  PaymentThreeDsConfirmDto,
  PaymentWebhookDto,
} from './dto';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhooks')
  async handleWebhook(@Req() req: Request, @Body() body: PaymentWebhookDto) {
    const headers = Object.entries(req.headers).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (Array.isArray(value)) {
          acc[key.toLowerCase()] = value.join(',');
        } else if (typeof value === 'string') {
          acc[key.toLowerCase()] = value;
        }
        return acc;
      },
      {},
    );
    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    const signature =
      headers['x-payment-signature'] ||
      headers['x-yookassa-signature'] ||
      body.signature ||
      '';
    return this.payments.processWebhook(body, {
      headers,
      rawBody: rawBody ?? JSON.stringify(body),
      signature,
      ipAddress: req.ip ?? null,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('orders/:orderId/capture')
  async captureOrderPayment(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Body() body: PaymentOperationDto,
  ) {
    const user = req.user as { sub?: string };
    return this.payments.captureOrderPayment(orderId, {
      reason:
        body.reason?.trim() || `ADMIN_CAPTURE_BY_${user?.sub ?? 'unknown'}`,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('orders/:orderId/void')
  async voidOrderPayment(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Body() body: PaymentOperationDto,
  ) {
    const user = req.user as { sub?: string };
    const reason =
      body.reason?.trim() || `ADMIN_VOID_BY_${user?.sub ?? 'unknown'}`;
    return this.payments.voidOrderPayment(orderId, reason, body.idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('orders/:orderId/refund')
  async refundOrderPayment(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Body() body: PaymentOperationDto,
  ) {
    const user = req.user as { sub?: string };
    const reason =
      body?.reason?.trim() || `ADMIN_REFUND_BY_${user?.sub ?? 'unknown'}`;
    return this.payments.refundOrderPayment(
      orderId,
      reason,
      body.idempotencyKey,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Post('orders/:orderId/3ds/confirm')
  async confirmThreeDs(
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Body() body: PaymentThreeDsConfirmDto,
  ) {
    const user = req.user as { sub?: string };
    return this.payments.confirmThreeDs(orderId, {
      confirmationToken: body.confirmationToken,
      reason:
        body.reason?.trim() || `ADMIN_3DS_CONFIRM_BY_${user?.sub ?? 'unknown'}`,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Get('reconcile/snapshot')
  async getReconciliationSnapshot(@Query('limit') limitRaw?: string) {
    const parsed = Number.parseInt(limitRaw ?? '100', 10);
    return this.payments.getReconciliationSnapshot(
      Number.isNaN(parsed) ? 100 : parsed,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Get('reconcile/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportReconciliationCsv(@Query('limit') limitRaw?: string) {
    const parsed = Number.parseInt(limitRaw ?? '100', 10);
    return this.payments.getReconciliationExportCsv(
      Number.isNaN(parsed) ? 100 : parsed,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  @Get('security/snapshot')
  async getWebhookSecuritySnapshot(
    @Query('windowMinutes') windowMinutesRaw?: string,
  ) {
    const parsed = Number.parseInt(windowMinutesRaw ?? '60', 10);
    return this.payments.getWebhookSecuritySnapshot(
      Number.isNaN(parsed) ? 60 : parsed,
    );
  }
}
