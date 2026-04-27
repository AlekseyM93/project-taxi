import type { AdminListBody, AdminRecord } from "@/services/adminApi";

const LIST_KEYS = [
  "items",
  "data",
  "rows",
  "orders",
  "drivers",
  "events",
  "executions",
  "filters",
  "templates",
  "history",
] as const;

const ADMIN_CACHE_PREFIX = "admin_panel_cache_v1:";

export type CachedQueryPayload = {
  status: number;
  body: AdminListBody;
  savedAt: string;
};

export function asRecord(value: unknown): AdminRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AdminRecord;
}

export function extractList(body: unknown): AdminRecord[] {
  if (Array.isArray(body)) {
    return body.filter((item): item is AdminRecord => !!asRecord(item));
  }
  const record = asRecord(body);
  if (!record) {
    return [];
  }
  for (const key of LIST_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is AdminRecord => !!asRecord(item));
    }
  }
  return [];
}

export function readText(row: AdminRecord, key: string, fallback = "-"): string {
  const value = row[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function readNumber(row: AdminRecord, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function mapRecordToRows(value: unknown, keyName: string, valueName: string): AdminRecord[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  return Object.entries(record).map(([key, entryValue]) => ({
    [keyName]: key,
    [valueName]: entryValue,
  }));
}

export function getStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "DONE" || status === "READY" || status === "SUCCESS") {
    return "default";
  }
  if (status === "CANCELLED" || status === "FAILED" || status === "ERROR") {
    return "destructive";
  }
  if (status === "IN_PROGRESS" || status === "ASSIGNED" || status === "BUSY") {
    return "secondary";
  }
  return "outline";
}

function readCachedQuery(cacheKey: string): CachedQueryPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(`${ADMIN_CACHE_PREFIX}${cacheKey}`);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CachedQueryPayload;
  } catch {
    return null;
  }
}

function saveCachedQuery(cacheKey: string, status: number, body: AdminListBody) {
  if (typeof window === "undefined") {
    return;
  }
  const payload: CachedQueryPayload = {
    status,
    body,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(`${ADMIN_CACHE_PREFIX}${cacheKey}`, JSON.stringify(payload));
}

export async function loadWithAdminCache(
  cacheKey: string,
  loader: () => Promise<{ status: number; body: AdminListBody }>,
) {
  const live = await loader();
  if (live.status >= 200 && live.status < 300) {
    saveCachedQuery(cacheKey, live.status, live.body);
    return {
      ...live,
      meta: { source: "live" as const },
    };
  }

  if (live.status === 0 || live.status >= 500) {
    const cached = readCachedQuery(cacheKey);
    if (cached) {
      return {
        status: cached.status,
        body: cached.body,
        meta: {
          source: "cache" as const,
          cachedAt: cached.savedAt,
          fallbackStatus: live.status,
        },
      };
    }
  }
  return {
    ...live,
    meta: { source: "live" as const },
  };
}
