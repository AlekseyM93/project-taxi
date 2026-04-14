import { apiRequest } from '@/lib/apiClient';

export type AdminRecord = Record<string, unknown>;
export type AdminListBody = {
  items?: AdminRecord[];
  data?: AdminRecord[];
  rows?: AdminRecord[];
  orders?: AdminRecord[];
  drivers?: AdminRecord[];
  events?: AdminRecord[];
  executions?: AdminRecord[];
  filters?: AdminRecord[];
  templates?: AdminRecord[];
  history?: AdminRecord[];
  [key: string]: unknown;
};

export function getAdminPanelOrders(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/orders${params ? `?${params}` : ''}`,
    {
      token,
    },
  );
}

export function getDriverOps(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/drivers/ops${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getDispatchTower(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/dispatch/control-tower${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getAuditFeed(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/audit-feed${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getActionsHistory(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/actions-history${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getActionTemplates(token: string) {
  return apiRequest<AdminListBody>('/orders/admin/panel/action-center/templates', {
    token,
  });
}

export function getActionExecutions(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/action-center/executions${params ? `?${params}` : ''}`,
    { token },
  );
}

export function executeActionCenter(
  token: string,
  body: Record<string, unknown>,
) {
  return apiRequest<AdminRecord>('/orders/admin/panel/action-center/execute', {
    method: 'POST',
    token,
    body,
    retries: 0,
  });
}

export function getSavedFilters(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/panel/saved-filters${params ? `?${params}` : ''}`,
    { token },
  );
}

export function createSavedFilter(
  token: string,
  body: Record<string, unknown>,
) {
  return apiRequest<AdminRecord>('/orders/admin/panel/saved-filters', {
    method: 'POST',
    token,
    body,
    retries: 0,
  });
}

export function getOpsSummary(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/ops/dashboard/summary${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getOpsSlo(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/ops/dashboard/slo${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getOpsAlerts(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/ops/dashboard/alerts${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getAdminMetrics(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/orders/admin/metrics${params ? `?${params}` : ''}`,
    { token },
  );
}

export function getSupportCases(token: string, params?: string) {
  return apiRequest<AdminListBody>(
    `/support/cases${params ? `?${params}` : ''}`,
    { token },
  );
}

