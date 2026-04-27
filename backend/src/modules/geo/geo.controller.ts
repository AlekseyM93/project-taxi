import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { GeoService } from './geo.service';
import {
  GeoGeocodeDto,
  GeoReverseDto,
  GeoRouteEstimateDto,
  GeoSuggestDto,
} from './dto';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('geo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PASSENGER', 'DRIVER', 'ADMIN', 'DISPATCHER')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Post('suggest')
  async suggest(@Body() dto: GeoSuggestDto) {
    return this.geo.suggest(dto);
  }

  @Post('geocode')
  async geocode(@Body() dto: GeoGeocodeDto) {
    return this.geo.geocode(dto);
  }

  @Post('reverse')
  async reverse(@Body() dto: GeoReverseDto) {
    return this.geo.reverse(dto);
  }

  @Post('route-estimate')
  async routeEstimate(@Body() dto: GeoRouteEstimateDto) {
    return this.geo.routeEstimate(dto);
  }
}
