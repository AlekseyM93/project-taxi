import { apiRequest } from "@/lib/apiClient";

export function estimatePassengerFare(
  token: string,
  body: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    serviceLevel?: "ECONOMY" | "COMFORT" | "BUSINESS";
    cityCode?: string;
    waitingSeconds?: number;
    isAirportRoute?: boolean;
    withChildSeat?: boolean;
    withPet?: boolean;
    extraStopsCount?: number;
    outOfCityKm?: number;
    requestedSurgeMultiplier?: number;
  },
) {
  return apiRequest<Record<string, unknown>>(
    "/orders/me/passenger/fare-estimate",
    {
      method: "POST",
      token,
      body,
      retries: 0,
    },
  );
}

export function createPassengerOrder(
  token: string,
  body: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    serviceLevel?: "ECONOMY" | "COMFORT" | "BUSINESS";
    cityCode?: string;
    waitingSeconds?: number;
    isAirportRoute?: boolean;
    withChildSeat?: boolean;
    withPet?: boolean;
    extraStopsCount?: number;
    outOfCityKm?: number;
    requestedSurgeMultiplier?: number;
  },
) {
  return apiRequest<Record<string, unknown>>("/orders/me/passenger/confirm", {
    method: "POST",
    token,
    body,
    retries: 0,
  });
}

export function cancelPassengerOrder(token: string, orderId: string) {
  return apiRequest<Record<string, unknown>>(`/orders/${orderId}/cancel`, {
    method: "POST",
    token,
    retries: 0,
  });
}

export function getPassengerOrders(token: string, params?: string) {
  return apiRequest<{ items?: Array<Record<string, unknown>> }>(
    `/orders/me/passenger${params ? `?${params}` : ""}`,
    {
      token,
    },
  );
}

export function getPassengerActiveOrder(token: string) {
  return apiRequest<{ activeOrder?: Record<string, unknown> | null }>(
    "/orders/me/passenger/active",
    {
      token,
    },
  );
}

export function reverseGeocodePoint(
  token: string,
  body: {
    lat: number;
    lng: number;
  },
) {
  return apiRequest<{
    provider: string;
    normalizedAddress?: string;
    cityCode?: string | null;
    fallbackUsed?: boolean;
  }>("/geo/reverse", {
    method: "POST",
    token,
    body,
    retries: 0,
  });
}

export function estimateGeoRoute(
  token: string,
  body: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  },
) {
  return apiRequest<{
    provider: string;
    distanceKm?: number;
    estimatedDurationMin?: number;
    fallbackUsed?: boolean;
  }>("/geo/route-estimate", {
    method: "POST",
    token,
    body,
    retries: 0,
  });
}
