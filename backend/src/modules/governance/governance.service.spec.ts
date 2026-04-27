import { DeleteResult, Repository } from 'typeorm';
import { GovernanceService } from './governance.service';
import { OrderIncidentEntity } from '../orders/order-incident.entity';

function createRepoMock<T extends object>() {
  return {
    count: jest.fn<Promise<number>, [unknown]>(),
    find: jest.fn<Promise<T[]>, [unknown]>(),
    delete: jest.fn<Promise<DeleteResult>, [unknown]>(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('GovernanceService', () => {
  const incidentsRepo = createRepoMock<OrderIncidentEntity>();
  const service = new GovernanceService(incidentsRepo);
  const originalRetentionEnv = process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS = '180';
  });

  afterAll(() => {
    if (originalRetentionEnv === undefined) {
      delete process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS;
    } else {
      process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS = originalRetentionEnv;
    }
  });

  it('returns retention snapshot with stale count', async () => {
    incidentsRepo.count.mockResolvedValue(3);

    const snapshot = await service.getRetentionSnapshot();

    expect(snapshot.retentionDays).toBe(180);
    expect(snapshot.staleIncidentCount).toBe(3);
  });

  it('returns dry-run retention execution without deleting rows', async () => {
    incidentsRepo.count.mockResolvedValue(5);
    incidentsRepo.find.mockResolvedValue([
      { id: 'inc-1' } as OrderIncidentEntity,
      { id: 'inc-2' } as OrderIncidentEntity,
    ]);

    const result = await service.executeRetention({ dryRun: true, limit: 2 });

    expect(result.mode).toBe('DRY_RUN');
    expect(result.executionLimit).toBe(2);
    expect(result.candidateCount).toBe(2);
    expect(result.purgedCount).toBe(0);
    expect(incidentsRepo.delete).not.toHaveBeenCalled();
  });

  it('executes bounded purge and reports affected rows', async () => {
    incidentsRepo.count.mockResolvedValue(10);
    incidentsRepo.find.mockResolvedValue(
      Array.from({ length: 3 }).map((_, idx) => ({
        id: `inc-${idx + 1}`,
      })) as OrderIncidentEntity[],
    );
    incidentsRepo.delete.mockResolvedValue({ affected: 2, raw: {} } as DeleteResult);

    const result = await service.executeRetention({ dryRun: false, limit: 3 });

    expect(result.mode).toBe('EXECUTE');
    expect(result.candidateCount).toBe(3);
    expect(result.purgedCount).toBe(2);
    expect(result.remainingEstimate).toBe(8);
    expect(incidentsRepo.delete).toHaveBeenCalledWith(['inc-1', 'inc-2', 'inc-3']);
  });

  it('clamps execution limit to max bound', async () => {
    incidentsRepo.count.mockResolvedValue(0);
    incidentsRepo.find.mockResolvedValue([]);

    const result = await service.executeRetention({ dryRun: true, limit: 99999 });

    expect(result.executionLimit).toBe(5000);
  });
});
