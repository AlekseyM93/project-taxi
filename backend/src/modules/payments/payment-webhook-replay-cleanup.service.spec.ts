import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PaymentWebhookReplayEntity } from './payment-webhook-replay.entity';
import { PaymentWebhookReplayCleanupService } from './payment-webhook-replay-cleanup.service';

function createRepoMock<T extends object>() {
  return {
    find: jest.fn<Promise<T[]>, [unknown]>(),
    delete: jest.fn<Promise<{ affected?: number }>, [unknown]>(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('PaymentWebhookReplayCleanupService', () => {
  const replayRepo = createRepoMock<PaymentWebhookReplayEntity>();
  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      const map: Record<string, string> = {
        PAYMENT_WEBHOOK_REPLAY_CLEANUP_ENABLED: 'true',
        PAYMENT_WEBHOOK_REPLAY_RETENTION_HOURS: '24',
        PAYMENT_WEBHOOK_REPLAY_CLEANUP_BATCH: '1000',
      };
      return map[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  const service = new PaymentWebhookReplayCleanupService(
    replayRepo,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes stale replay rows in batch', async () => {
    replayRepo.find.mockResolvedValue([
      { id: 'r1' } as PaymentWebhookReplayEntity,
      { id: 'r2' } as PaymentWebhookReplayEntity,
    ]);
    replayRepo.delete.mockResolvedValue({ affected: 2, raw: {} });

    await service.cleanupExpiredReplays();

    expect(replayRepo.find).toHaveBeenCalled();
    expect(replayRepo.delete).toHaveBeenCalledWith(['r1', 'r2']);
  });
});
