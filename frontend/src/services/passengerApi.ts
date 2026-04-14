import { apiRequest } from '@/lib/apiClient';

export function getPassengerOrders(token: string, params?: string) {
  return apiRequest<{ items?: Array<Record<string, unknown>> }>(
    `/orders/me/passenger${params ? `?${params}` : ''}`,
    {
      token,
    },
  );
}

export function getPassengerActiveOrder(token: string) {
  return apiRequest<{ activeOrder?: Record<string, unknown> | null }>(
    '/orders/me/passenger/active',
    {
      token,
    },
  );
}
