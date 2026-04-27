type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  retries?: number;
  retryDelayMs?: number;
};

export type ApiResponse<T> = {
  status: number;
  body: T;
};

type StoredAuthUser = {
  id: string;
  role: string;
  phone?: string;
  name?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
};

const AUTH_STORAGE_KEY = "taxi_user";
const AUTH_UPDATED_EVENT = "taxi-auth-updated";
let refreshInFlight: Promise<string | null> | null = null;

function getApiBaseUrl() {
  const envUrl =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_API_BASE_URL as string | undefined)
      : undefined;
  return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseResponseBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function getStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    return null;
  }
}

function setStoredAuthUser(user: StoredAuthUser | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT));
}

function shouldTryTokenRefresh(path: string): boolean {
  return !(
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/refresh")
  );
}

async function refreshAccessTokenFromSession(): Promise<string | null> {
  const current = getStoredAuthUser();
  const refreshToken = current?.refreshToken?.trim();
  if (!current || !refreshToken) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const text = await response.text();
  const body = parseResponseBody(text) as {
    accessToken?: string;
    refreshToken?: string;
  } | null;

  if (!response.ok || !body?.accessToken) {
    setStoredAuthUser(null);
    return null;
  }

  setStoredAuthUser({
    ...current,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken ?? refreshToken,
  });
  return body.accessToken;
}

async function getRefreshedAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessTokenFromSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const method = options.method ?? "GET";
  let token = options.token ?? null;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await response.text();
      const body = parseResponseBody(text);

      if (
        response.status === 401 &&
        token &&
        shouldTryTokenRefresh(path) &&
        attempt < retries
      ) {
        const refreshedToken = await getRefreshedAccessToken();
        if (refreshedToken) {
          token = refreshedToken;
          continue;
        }
      }

      if (!response.ok && response.status >= 500 && attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      return {
        status: response.status,
        body: body as T,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  return {
    status: 0,
    body: {
      code: "NETWORK_ERROR",
      message: String(
        (lastError as { message?: string } | null)?.message || lastError,
      ),
    } as T,
  };
}
