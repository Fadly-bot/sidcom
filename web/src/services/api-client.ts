// API Client with in-memory Access Token and transparent token refresh

let inMemoryToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryToken;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiClient<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, headers = {}, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (!skipAuth && inMemoryToken) {
    requestHeaders['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...rest,
      headers: requestHeaders,
    });
  } catch (err: any) {
    // Network failure (offline)
    const error = new Error('Network error or server unreachable');
    (error as any).isOffline = true;
    throw error;
  }

  // Handle Token Expiration (401)
  if (response.status === 401 && !skipAuth && !endpoint.includes('/auth/')) {
    const refreshed = await attemptRefreshToken();
    if (refreshed) {
      // Retry once with new token
      requestHeaders['Authorization'] = `Bearer ${inMemoryToken}`;
      response = await fetch(endpoint, {
        ...rest,
        headers: requestHeaders,
      });
    }
  }

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'UNKNOWN_ERROR', message: response.statusText };
    }
    const error = new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
    (error as any).status = response.status;
    (error as any).data = errorData;
    throw error;
  }

  return response.json();
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptRefreshToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) {
          setAccessToken(data.accessToken);
          return true;
        }
      }
      setAccessToken(null);
      return false;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
