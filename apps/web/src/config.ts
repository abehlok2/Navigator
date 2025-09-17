const DEFAULT_ORIGIN = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://localhost:8080';

function getEnvString(name: string): string | undefined {
  const value = (import.meta.env as Record<string, unknown>)[name];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function normalizeHttpBase(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    if (parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    const result = parsed.toString();
    return result.endsWith('/') ? result.slice(0, -1) : result;
  } catch {
    return url.replace(/\/$/, '');
  }
}

function deriveSignalUrl(httpUrl: string): string {
  try {
    const parsed = new URL(httpUrl);
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${parsed.host}`;
  } catch {
    if (httpUrl.startsWith('https://')) {
      return `wss://${httpUrl.slice('https://'.length)}`;
    }
    if (httpUrl.startsWith('http://')) {
      return `ws://${httpUrl.slice('http://'.length)}`;
    }
    return 'ws://localhost:8080';
  }
}

const fallbackHttp = getEnvString('VITE_API_URL')
  ?? (import.meta.env.DEV ? 'http://localhost:8080' : DEFAULT_ORIGIN);

export const API_BASE_URL = normalizeHttpBase(fallbackHttp);

const explicitSignal = getEnvString('VITE_SIGNAL_URL');

export const SIGNAL_URL = explicitSignal ?? deriveSignalUrl(API_BASE_URL);

export function apiUrl(path: string): string {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, base).toString();
}
