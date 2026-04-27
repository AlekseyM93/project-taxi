export type GeoProviderCode = 'INTERNAL' | 'YANDEX';

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type GeoSuggestItem = {
  addressText: string;
  lat: number;
  lng: number;
  providerMeta?: Record<string, unknown>;
};

export type GeoSuggestResponse = {
  provider: GeoProviderCode;
  items: GeoSuggestItem[];
  fallbackUsed?: boolean;
};

export type GeoGeocodeResponse = {
  provider: GeoProviderCode;
  point: GeoPoint;
  normalizedAddress: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  fallbackUsed?: boolean;
};

export type GeoReverseResponse = {
  provider: GeoProviderCode;
  normalizedAddress: string;
  components: Record<string, unknown>;
  cityCode: string | null;
  fallbackUsed?: boolean;
};

export type GeoRouteEstimateResponse = {
  provider: GeoProviderCode;
  distanceKm: number;
  estimatedDurationMin: number;
  polyline?: GeoPoint[];
  fallbackUsed?: boolean;
};
