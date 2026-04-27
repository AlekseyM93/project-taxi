import { GeoGeocodeDto, GeoReverseDto, GeoRouteEstimateDto, GeoSuggestDto } from './dto';
import {
  GeoGeocodeResponse,
  GeoProviderCode,
  GeoReverseResponse,
  GeoRouteEstimateResponse,
  GeoSuggestResponse,
} from './geo.types';

export interface MapProviderAdapter {
  readonly providerCode: GeoProviderCode;
  suggest(dto: GeoSuggestDto): Promise<GeoSuggestResponse>;
  geocode(dto: GeoGeocodeDto): Promise<GeoGeocodeResponse>;
  reverse(dto: GeoReverseDto): Promise<GeoReverseResponse>;
  routeEstimate(dto: GeoRouteEstimateDto): Promise<GeoRouteEstimateResponse>;
}
