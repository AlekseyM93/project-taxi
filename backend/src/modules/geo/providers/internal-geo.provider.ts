import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoGeocodeDto, GeoReverseDto, GeoRouteEstimateDto, GeoSuggestDto } from '../dto';
import { MapProviderAdapter } from '../geo-provider';
import {
  GeoGeocodeResponse,
  GeoReverseResponse,
  GeoRouteEstimateResponse,
  GeoSuggestResponse,
} from '../geo.types';

@Injectable()
export class InternalGeoProvider implements MapProviderAdapter {
  readonly providerCode = 'INTERNAL' as const;

  constructor(private readonly configService: ConfigService) {}

  async suggest(dto: GeoSuggestDto): Promise<GeoSuggestResponse> {
    const centerLat = this.getNumberConfig('GEO_DEFAULT_CENTER_LAT', 55.751244, -90, 90);
    const centerLng = this.getNumberConfig('GEO_DEFAULT_CENTER_LNG', 37.618423, -180, 180);
    const query = dto.query.trim();
    const item = {
      addressText: query,
      lat: centerLat,
      lng: centerLng,
      providerMeta: {
        source: 'INTERNAL_SIMULATOR',
        cityCode: dto.cityCode ?? null,
      },
    };
    return {
      provider: this.providerCode,
      items: query.length > 0 ? [item] : [],
    };
  }

  async geocode(dto: GeoGeocodeDto): Promise<GeoGeocodeResponse> {
    const parsed = this.tryParseCoordinates(dto.addressText);
    const point = parsed ?? {
      lat: this.getNumberConfig('GEO_DEFAULT_CENTER_LAT', 55.751244, -90, 90),
      lng: this.getNumberConfig('GEO_DEFAULT_CENTER_LNG', 37.618423, -180, 180),
    };
    return {
      provider: this.providerCode,
      point,
      normalizedAddress: dto.addressText.trim(),
      confidence: parsed ? 'HIGH' : 'LOW',
    };
  }

  async reverse(dto: GeoReverseDto): Promise<GeoReverseResponse> {
    const address = `${dto.lat.toFixed(6)}, ${dto.lng.toFixed(6)}`;
    return {
      provider: this.providerCode,
      normalizedAddress: `Point ${address}`,
      components: {
        lat: dto.lat,
        lng: dto.lng,
      },
      cityCode: null,
    };
  }

  async routeEstimate(dto: GeoRouteEstimateDto): Promise<GeoRouteEstimateResponse> {
    return this.routeEstimateSync(dto);
  }

  routeEstimateSync(dto: GeoRouteEstimateDto): GeoRouteEstimateResponse {
    const directDistanceKm = this.haversineKm(
      dto.fromLat,
      dto.fromLng,
      dto.toLat,
      dto.toLng,
    );
    const roadDistanceFactor = this.getNumberConfig(
      'GEO_ROAD_DISTANCE_FACTOR',
      1.18,
      1,
      3,
    );
    const avgSpeedKmh = this.getNumberConfig('GEO_AVG_SPEED_KMH', 28, 10, 80);
    const baseDelayMin = this.getNumberConfig('GEO_BASE_DELAY_MIN', 4, 0, 30);

    const distanceKm = Number((directDistanceKm * roadDistanceFactor).toFixed(2));
    const estimatedDurationMin = Math.max(
      4,
      Math.round((distanceKm / avgSpeedKmh) * 60 + baseDelayMin),
    );

    return {
      provider: this.providerCode,
      distanceKm,
      estimatedDurationMin,
    };
  }

  private tryParseCoordinates(input: string) {
    const trimmed = input.trim();
    const regex = /^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = trimmed.match(regex);
    if (!match) {
      return null;
    }
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }
    return { lat, lng };
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private haversineKm(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ) {
    const earthRadiusKm = 6371;
    const dLat = this.toRad(toLat - fromLat);
    const dLng = this.toRad(toLng - fromLng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(fromLat)) *
        Math.cos(this.toRad(toLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private getNumberConfig(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const raw = this.configService.get<string>(key, String(fallback));
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }
}
