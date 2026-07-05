const counters = new Map<string, number>();

export function splitApiKeys(apiKey: string | undefined): string[] {
  return (apiKey || '')
    .split(/[,\n;]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

export function getFirstApiKey(apiKey: string | undefined): string {
  return splitApiKeys(apiKey)[0] || '';
}

export function getRotatedApiKeys(scope: string, apiKey: string | undefined): string[] {
  const keys = splitApiKeys(apiKey);
  if (keys.length <= 1) return keys;

  const current = counters.get(scope) ?? 0;
  counters.set(scope, (current + 1) % keys.length);
  return [...keys.slice(current), ...keys.slice(0, current)];
}

export function shouldTryNextApiKey(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 500 || status === 503;
}

function withBearerKey(init: RequestInit | undefined, key: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${key}`);
  return { ...init, headers };
}

async function drainResponse(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined);
}

export async function fetchWithRotatingBearerAuth(
  scope: string,
  apiKey: string | undefined,
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  const keys = getRotatedApiKeys(scope, apiKey);
  if (keys.length === 0) return fetchImpl(input, init);

  let response: Response | undefined;
  for (let index = 0; index < keys.length; index++) {
    response = await fetchImpl(input, withBearerKey(init, keys[index]));
    const canTryNext = index < keys.length - 1 && shouldTryNextApiKey(response.status);
    if (!canTryNext) return response;
    await drainResponse(response);
  }

  return response as Response;
}

export function createRotatingBearerAuthFetch(
  scope: string,
  apiKey: string | undefined,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithRotatingBearerAuth(scope, apiKey, input, init, fetchImpl)) as typeof globalThis.fetch;
}
