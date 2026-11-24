import type { FetchErrorKind, StationsResult } from '../types';
import { parseResponse } from './parse';
import { filterTenerife } from './tenerife';

export const MITECO_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/38';

export class FetchError extends Error {
  override name = 'FetchError';
  kind: FetchErrorKind;
  status?: number;
  constructor(kind: FetchErrorKind, message?: string, status?: number) {
    super(message ?? kind);
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  isOnline?: () => boolean;
  now?: () => Date;
  signal?: AbortSignal;
}

export async function fetchStations(opts: FetchOptions = {}): Promise<StationsResult> {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 20000;
  const isOnline = opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const now = opts.now ?? (() => new Date());

  if (!isOnline()) throw new FetchError('offline', 'offline');

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = (): void => controller.abort();
  const external = opts.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }

  try {
    let res: Response;
    try {
      res = await fetchImpl(MITECO_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) throw new FetchError('timeout', 'timeout');
      if (external?.aborted) throw new FetchError('network', 'aborted');
      const msg = e instanceof Error ? e.message : 'network error';
      throw new FetchError(isOnline() ? 'network' : 'offline', msg);
    }
    if (!res.ok) throw new FetchError('http', `HTTP ${res.status}`, res.status);

    let parsed: ReturnType<typeof parseResponse>;
    try {
      const json: unknown = await res.json();
      parsed = parseResponse(json);
    } catch (e) {
      if (timedOut) throw new FetchError('timeout', 'timeout');
      if (external?.aborted) throw new FetchError('network', 'aborted');
      throw new FetchError('invalid', e instanceof Error ? e.message : 'invalid response');
    }
    const stations = filterTenerife(parsed.stations);
    if (stations.length === 0) throw new FetchError('invalid', 'no Tenerife stations');
    return { stations, sourceDate: parsed.sourceDate, fetchedAt: now() };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}
