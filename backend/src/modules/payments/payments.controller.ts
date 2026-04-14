import { Body, Controller, Post } from '@nestjs/common';
import { PaymentWebhookDto } from './dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhooks')
  async handleWebhook(@Body() body: PaymentWebhookDto) {
    return this.payments.processWebhook(body);
  }
}
