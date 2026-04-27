import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';
import { InternalGeoProvider } from './providers/internal-geo.provider';
import { YandexGeoProvider } from './providers/yandex-geo.provider';
import { GeoController } from './geo.controller';

@Module({
  providers: [GeoService, InternalGeoProvider, YandexGeoProvider],
  controllers: [GeoController],
  exports: [GeoService],
})
export class GeoModule {}
