import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoRouteEstimateDto } from './dto';
import { GeoPoint } from './geo.types';

export type OsrmRouteResult = {
  distanceKm: number;
  estimatedDurationMin: number;
  polyline: GeoPoint[];
};

/**
 * Построение маршрута по дорогам через публичный OSRM (или свой инстанс).
 * Тайлы карты остаются отдельно (OpenStreetMap); геометрия маршрута — по API OSRM.
 */
@Injectable()
export class OsrmDrivingRouteService {
  constructor(private readonly configService: ConfigService) {}

  async tryDrivingRoute(dto: GeoRouteEstimateDto): Promise<OsrmRouteResult | null> {
    const enabled =
      this.configService.get<string>('GEO_OSRM_ENABLED', 'true') === 'true';
    if (!enabled) return null;

    const baseRaw = this.configService
      .get<string>(
        'GEO_OSRM_BASE_URL',
        'https://router.project-osrm.org',
      )
      .trim()
      .replace(/\/+$/, '');
    const timeoutMs = Math.min(
      Math.max(
        Number.parseInt(
          this.configService.get<string>('GEO_OSRM_TIMEOUT_MS', '5000'),
          10,
        ) || 5000,
        800,
      ),
      15000,
    );

    const { fromLat, fromLng, toLat, toLng } = dto;
    const path = `/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `${baseRaw}${path}?overview=simplified&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { type?: string; coordinates?: [number, number][] };
        }>;
      };
      const route = data.routes?.[0];
      if (!route?.geometry?.coordinates?.length) return null;

      const distanceKm =
        typeof route.distance === 'number'
          ? Number((route.distance / 1000).toFixed(2))
          : 0;
      const estimatedDurationMin =
        typeof route.duration === 'number'
          ? Math.max(1, Math.round(route.duration / 60))
          : 0;

      const polyline: GeoPoint[] = route.geometry!.coordinates!.map(([lng, lat]) => ({
        lat,
        lng,
      }));

      if (
        distanceKm <= 0 ||
        estimatedDurationMin <= 0 ||
        polyline.length < 2
      ) {
        return null;
      }

      return { distanceKm, estimatedDurationMin, polyline };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
