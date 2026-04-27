import { ConfigService } from '@nestjs/config';
import { GeoService } from './geo.service';
import { InternalGeoProvider } from './providers/internal-geo.provider';
import { YandexGeoProvider } from './providers/yandex-geo.provider';

describe('GeoService', () => {
  const configServiceMock = {
    get: jest.fn((key: string, fallback?: string) => {
      const defaults: Record<string, string> = {
        GEO_PROVIDER: 'INTERNAL',
        GEO_FALLBACK_ENABLED: 'true',
      };
      return (defaults[key] ?? fallback) as never;
    }),
  } as unknown as jest.Mocked<ConfigService>;

  const internalProviderMock = {
    providerCode: 'INTERNAL',
    suggest: jest.fn(),
    geocode: jest.fn(),
    reverse: jest.fn(),
    routeEstimate: jest.fn(),
    routeEstimateSync: jest.fn(),
  } as unknown as jest.Mocked<InternalGeoProvider>;

  const yandexProviderMock = {
    providerCode: 'YANDEX',
    suggest: jest.fn(),
    geocode: jest.fn(),
    reverse: jest.fn(),
    routeEstimate: jest.fn(),
  } as unknown as jest.Mocked<YandexGeoProvider>;

  const service = new GeoService(
    configServiceMock,
    internalProviderMock,
    yandexProviderMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockImplementation((key: string, fallback?: string) => {
      const defaults: Record<string, string> = {
        GEO_PROVIDER: 'INTERNAL',
        GEO_FALLBACK_ENABLED: 'true',
      };
      return (defaults[key] ?? fallback) as never;
    });
  });

  it('uses internal provider by default', async () => {
    internalProviderMock.suggest.mockResolvedValue({
      provider: 'INTERNAL',
      items: [],
    } as any);

    const result = await service.suggest({ query: 'Test', limit: 3 });

    expect(result.provider).toBe('INTERNAL');
    expect(internalProviderMock.suggest).toHaveBeenCalled();
    expect(yandexProviderMock.suggest).not.toHaveBeenCalled();
  });

  it('falls back to internal provider when yandex fails', async () => {
    configServiceMock.get.mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        GEO_PROVIDER: 'YANDEX',
        GEO_FALLBACK_ENABLED: 'true',
      };
      return (values[key] ?? fallback) as never;
    });
    yandexProviderMock.geocode.mockRejectedValue(new Error('yandex timeout'));
    internalProviderMock.geocode.mockResolvedValue({
      provider: 'INTERNAL',
      point: { lat: 55.75, lng: 37.61 },
      normalizedAddress: 'fallback',
      confidence: 'LOW',
    } as any);

    const result = await service.geocode({ addressText: 'Moscow' });

    expect(result.provider).toBe('INTERNAL');
    expect(result.fallbackUsed).toBe(true);
    expect(internalProviderMock.geocode).toHaveBeenCalled();
  });

  it('throws error when fallback is disabled and yandex fails', async () => {
    configServiceMock.get.mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        GEO_PROVIDER: 'YANDEX',
        GEO_FALLBACK_ENABLED: 'false',
      };
      return (values[key] ?? fallback) as never;
    });
    yandexProviderMock.reverse.mockRejectedValue(new Error('provider down'));

    await expect(service.reverse({ lat: 55.75, lng: 37.61 })).rejects.toThrow(
      'provider down',
    );
    expect(internalProviderMock.reverse).not.toHaveBeenCalled();
  });
});
