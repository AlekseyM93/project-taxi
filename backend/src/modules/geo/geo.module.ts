import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { OsrmDrivingRouteService } from './osrm-driving-route.service';
import { InternalGeoProvider } from './providers/internal-geo.provider';
import { YandexGeoProvider } from './providers/yandex-geo.provider';

@Module({
  providers: [
    GeoService,
    OsrmDrivingRouteService,
    InternalGeoProvider,
    YandexGeoProvider,
  ],
  controllers: [GeoController],
  exports: [GeoService],
})
export class GeoModule {}
