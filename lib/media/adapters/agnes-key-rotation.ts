const counters = new Map<string, number>();

export function splitAgnesApiKeys(apiKey: string): string[] {
  return apiKey
    .split(/[,\n;]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

export function getRotatedAgnesApiKeys(scope: string, apiKey: string): string[] {
  const keys = splitAgnesApiKeys(apiKey);
  if (keys.length <= 1) return keys;

  const current = counters.get(scope) ?? 0;
  counters.set(scope, (current + 1) % keys.length);
  return [...keys.slice(current), ...keys.slice(0, current)];
}

export function shouldTryNextAgnesKey(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 500 || status === 503;
}
