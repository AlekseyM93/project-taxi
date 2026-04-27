import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

describe('GovernanceController', () => {
  const governanceServiceMock = {
    getRetentionSnapshot: jest.fn(),
    executeRetention: jest.fn(),
  } as unknown as jest.Mocked<GovernanceService>;

  const controller = new GovernanceController(governanceServiceMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns retention snapshot', async () => {
    governanceServiceMock.getRetentionSnapshot.mockResolvedValue({
      retentionDays: 180,
      staleIncidentCount: 4,
      thresholdTs: new Date().toISOString(),
    } as any);

    const result = await controller.getRetentionSnapshot();

    expect(result.staleIncidentCount).toBe(4);
    expect(governanceServiceMock.getRetentionSnapshot).toHaveBeenCalled();
  });

  it('forwards execute payload to governance service', async () => {
    governanceServiceMock.executeRetention.mockResolvedValue({
      mode: 'DRY_RUN',
      purgedCount: 0,
    } as any);

    const result = await controller.executeRetention({
      dryRun: true,
      limit: 100,
    });

    expect(result.mode).toBe('DRY_RUN');
    expect(governanceServiceMock.executeRetention).toHaveBeenCalledWith({
      dryRun: true,
      limit: 100,
    });
  });
});
