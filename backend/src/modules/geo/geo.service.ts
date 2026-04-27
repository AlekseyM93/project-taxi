import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoGeocodeDto, GeoReverseDto, GeoRouteEstimateDto, GeoSuggestDto } from './dto';
import {
  GeoGeocodeResponse,
  GeoReverseResponse,
  GeoRouteEstimateResponse,
  GeoSuggestResponse,
} from './geo.types';
import { InternalGeoProvider } from './providers/internal-geo.provider';
import { YandexGeoProvider } from './providers/yandex-geo.provider';

@Injectable()
export class GeoService {
  constructor(
    private readonly configService: ConfigService,
    private readonly internalGeoProvider: InternalGeoProvider,
    private readonly yandexGeoProvider: YandexGeoProvider,
  ) {}

  async suggest(dto: GeoSuggestDto): Promise<GeoSuggestResponse> {
    return this.withFallback((provider) => provider.suggest(dto));
  }

  async geocode(dto: GeoGeocodeDto): Promise<GeoGeocodeResponse> {
    return this.withFallback((provider) => provider.geocode(dto));
  }

  async reverse(dto: GeoReverseDto): Promise<GeoReverseResponse> {
    return this.withFallback((provider) => provider.reverse(dto));
  }

  async routeEstimate(dto: GeoRouteEstimateDto): Promise<GeoRouteEstimateResponse> {
    return this.withFallback((provider) => provider.routeEstimate(dto));
  }

  estimateRoute(params: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  }) {
    return this.internalGeoProvider.routeEstimateSync({
      fromLat: params.fromLat,
      fromLng: params.fromLng,
      toLat: params.toLat,
      toLng: params.toLng,
    });
  }

  private getPrimaryProvider() {
    const provider = this.configService
      .get<string>('GEO_PROVIDER', 'INTERNAL')
      .trim()
      .toUpperCase();
    return provider === 'YANDEX' ? this.yandexGeoProvider : this.internalGeoProvider;
  }

  private isFallbackEnabled() {
    return (
      this.configService.get<string>('GEO_FALLBACK_ENABLED', 'true') === 'true'
    );
  }

  private async withFallback<T extends { provider: string }>(
    execute: (
      provider: InternalGeoProvider | YandexGeoProvider,
    ) => Promise<T>,
  ): Promise<T & { fallbackUsed?: boolean }> {
    const primary = this.getPrimaryProvider();
    try {
      return await execute(primary);
    } catch (error) {
      if (!this.isFallbackEnabled() || primary.providerCode === 'INTERNAL') {
        throw error;
      }
      const fallbackResult = await execute(this.internalGeoProvider);
      return {
        ...fallbackResult,
        fallbackUsed: true,
      };
    }
  }
}
