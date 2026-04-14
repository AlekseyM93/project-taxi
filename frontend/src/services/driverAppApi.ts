import { apiRequest } from '@/lib/apiClient';

export function getDriverOrders(token: string, params?: string) {
  return apiRequest<{ items?: Array<Record<string, unknown>> }>(
    `/orders/me/driver${params ? `?${params}` : ''}`,
    {
      token,
    },
  );
}

export function getDriverEarningsSummary(token: string) {
  return apiRequest<{
    totals?: { totalRub?: number; completedTrips?: number };
    items?: Array<Record<string, unknown>>;
  }>('/drivers/me/earnings/summary', {
    token,
  });
}

export function getDriverProfile(token: string) {
  return apiRequest<Record<string, unknown>>('/drivers/me/profile', {
    token,
  });
}

export function updateDriverProfile(
  token: string,
  body: Record<string, unknown>,
) {
  return apiRequest<Record<string, unknown>>('/drivers/me/profile', {
    method: 'PATCH',
    token,
    body,
    retries: 0,
  });
}

export function getDriverVehicles(token: string) {
  return apiRequest<Array<Record<string, unknown>>>('/drivers/me/vehicles', {
    token,
  });
}
