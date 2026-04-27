import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoGeocodeDto, GeoReverseDto, GeoRouteEstimateDto, GeoSuggestDto } from '../dto';
import { MapProviderAdapter } from '../geo-provider';
import {
  GeoGeocodeResponse,
  GeoPoint,
  GeoReverseResponse,
  GeoRouteEstimateResponse,
  GeoSuggestItem,
  GeoSuggestResponse,
} from '../geo.types';
import { InternalGeoProvider } from './internal-geo.provider';

@Injectable()
export class YandexGeoProvider implements MapProviderAdapter {
  readonly providerCode = 'YANDEX' as const;

  constructor(
    private readonly configService: ConfigService,
    private readonly internalGeoProvider: InternalGeoProvider,
  ) {}

  async suggest(dto: GeoSuggestDto): Promise<GeoSuggestResponse> {
    const key = this.getApiKey();
    const limit = dto.limit ?? 5;
    const query = dto.cityCode
      ? `${dto.cityCode.trim()} ${dto.query.trim()}`
      : dto.query.trim();
    const params = new URLSearchParams({
      apikey: key,
      geocode: query,
      format: 'json',
      results: String(limit),
      lang: 'ru_RU',
    });
    const data = await this.fetchJson(
      `https://geocode-maps.yandex.ru/1.x/?${params.toString()}`,
    );
    const features = this.extractFeatureMembers(data);
    return {
      provider: this.providerCode,
      items: features.map((item) => this.mapFeatureToSuggestItem(item)),
    };
  }

  async geocode(dto: GeoGeocodeDto): Promise<GeoGeocodeResponse> {
    const result = await this.suggest({
      query: dto.addressText,
      cityCode: dto.cityCode,
      limit: 1,
    });
    const first = result.items[0];
    if (!first) {
      throw new Error('GEO_NOT_FOUND');
    }
    return {
      provider: this.providerCode,
      point: { lat: first.lat, lng: first.lng },
      normalizedAddress: first.addressText,
      confidence: 'MEDIUM',
    };
  }

  async reverse(dto: GeoReverseDto): Promise<GeoReverseResponse> {
    const key = this.getApiKey();
    const params = new URLSearchParams({
      apikey: key,
      geocode: `${dto.lng},${dto.lat}`,
      format: 'json',
      results: '1',
      lang: 'ru_RU',
    });
    const data = await this.fetchJson(
      `https://geocode-maps.yandex.ru/1.x/?${params.toString()}`,
    );
    const features = this.extractFeatureMembers(data);
    const first = features[0];
    const mapped = first ? this.mapFeatureToSuggestItem(first) : null;
    return {
      provider: this.providerCode,
      normalizedAddress:
        mapped?.addressText ?? `${dto.lat.toFixed(6)}, ${dto.lng.toFixed(6)}`,
      components: {
        source: 'YANDEX_GEOCODER',
      },
      cityCode: null,
    };
  }

  async routeEstimate(dto: GeoRouteEstimateDto): Promise<GeoRouteEstimateResponse> {
    const estimated = this.internalGeoProvider.routeEstimateSync(dto);
    return {
      provider: this.providerCode,
      distanceKm: estimated.distanceKm,
      estimatedDurationMin: estimated.estimatedDurationMin,
    };
  }

  private getApiKey() {
    const key = this.configService.get<string>('YANDEX_MAPS_API_KEY', '').trim();
    if (!key) {
      throw new Error('YANDEX_MAPS_API_KEY is missing');
    }
    return key;
  }

  private getTimeoutMs() {
    const raw = Number.parseInt(
      this.configService.get<string>('GEO_TIMEOUT_MS', '2000'),
      10,
    );
    if (Number.isNaN(raw)) {
      return 2000;
    }
    return Math.min(Math.max(raw, 500), 10000);
  }

  private async fetchJson(url: string): Promise<unknown> {
    const timeoutMs = this.getTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`YANDEX_HTTP_${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractFeatureMembers(data: unknown): any[] {
    const collection = (data as Record<string, any>)?.response?.GeoObjectCollection;
    const featureMembers = collection?.featureMember;
    return Array.isArray(featureMembers) ? featureMembers : [];
  }

  private mapFeatureToSuggestItem(featureMember: any): GeoSuggestItem {
    const geoObject = featureMember?.GeoObject ?? {};
    const point = this.parsePoint(geoObject?.Point?.pos);
    const line = geoObject?.metaDataProperty?.GeocoderMetaData?.text;
    const name = geoObject?.name;
    const addressText =
      typeof line === 'string' && line.length > 0
        ? line
        : typeof name === 'string' && name.length > 0
          ? name
          : 'Unknown location';
    return {
      addressText,
      lat: point.lat,
      lng: point.lng,
      providerMeta: {
        source: 'YANDEX_GEOCODER',
      },
    };
  }

  private parsePoint(rawPos: unknown): GeoPoint {
    if (typeof rawPos !== 'string') {
      return { lat: 55.751244, lng: 37.618423 };
    }
    const parts = rawPos.trim().split(/\s+/);
    if (parts.length < 2) {
      return { lat: 55.751244, lng: 37.618423 };
    }
    const lng = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { lat: 55.751244, lng: 37.618423 };
    }
    return { lat, lng };
  }
}
