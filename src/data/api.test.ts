// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { fetchStations, FetchError, MITECO_URL } from './api';
import { makeRaw } from '../test/factories';
import fixture from '../test/fixtures/province-38.json';

const NOW = new Date('2026-11-23T23:00:00Z');

function okResponse(body: unknown = fixture): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

// Valid-shaped rows that all belong to Alajeró (La Gomera, IDMunicipio 5693), so none are Tenerife.
function laGomeraBody(): unknown {
  const rows = [1, 2, 3].map((i) =>
    makeRaw({
      IDEESS: String(9000 + i),
      IDMunicipio: '5693',
      Municipio: 'Alajeró',
      Localidad: 'ALAJERÓ',
      'Latitud': '28,08',
      'Longitud (WGS84)': '-17,21',
    }),
  );
  return { Fecha: '23/11/2026 23:36:13', ListaEESSPrecio: rows, Nota: '', ResultadoConsulta: 'OK' };
}

describe('fetchStations', () => {
  let fetchImpl: Mock<typeof fetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchImpl = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the 212 Tenerife stations from the fixture on success', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    const result = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    expect(result.stations).toHaveLength(212);
  });

  it('sets sourceDate to the fixture Fecha read as Peninsular time (22:36:13Z)', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    const result = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    expect(result.sourceDate).toEqual(new Date('2026-11-23T22:36:13Z'));
  });

  it('sets fetchedAt to the injected now() value', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    const result = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    expect(result.fetchedAt).toEqual(NOW);
  });

  it('calls fetch once with MITECO_URL, cache no-store and an AbortSignal', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MITECO_URL);
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with kind offline and does not call fetch when offline before the request', async () => {
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).kind).toBe('offline');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects with kind http and status 503 on a non-2xx response', async () => {
    fetchImpl.mockResolvedValue(new Response('x', { status: 503 }));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).kind).toBe('http');
    expect((err as FetchError).status).toBe(503);
  });

  it('rejects with kind invalid when the body is not JSON', async () => {
    fetchImpl.mockResolvedValue(new Response('not json', { status: 200 }));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe('invalid');
  });

  it('rejects with kind invalid when ResultadoConsulta is ERROR', async () => {
    fetchImpl.mockResolvedValue(okResponse({ ResultadoConsulta: 'ERROR' }));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe('invalid');
  });

  it('rejects with kind invalid when a valid shape has zero Tenerife stations', async () => {
    fetchImpl.mockResolvedValue(okResponse(laGomeraBody()));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe('invalid');
  });

  it('rejects with kind network when fetch rejects with TypeError and still online', async () => {
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).kind).toBe('network');
  });

  it('rejects with kind offline when fetch rejects and isOnline turns false after the rejection', async () => {
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    const isOnline = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline }).catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe('offline');
  });

  it('rejects with kind timeout when the request never resolves and timeoutMs elapses', async () => {
    fetchImpl.mockImplementation(
      (_url: string | Request | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const promise = fetchStations({ fetchImpl, timeoutMs: 1000, now: () => NOW, isOnline: () => true });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('rejects with kind network when the caller aborts opts.signal', async () => {
    fetchImpl.mockImplementation(
      (_url: string | Request | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const controller = new AbortController();
    const promise = fetchStations({
      fetchImpl,
      now: () => NOW,
      isOnline: () => true,
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'network' });
    controller.abort();
    await assertion;
  });

  it('clears the timeout timer after a successful request', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('produces errors that are both FetchError and Error instances', async () => {
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);
    expect(err instanceof FetchError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('sends Accept application/json and the exact MITECO URL', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/38',
    );
    expect(MITECO_URL).toBe(url);
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  describe('default isOnline', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('rejects offline without calling fetch when navigator.onLine is false', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      const err = await fetchStations({ fetchImpl, now: () => NOW }).catch((e: unknown) => e);
      expect((err as FetchError).kind).toBe('offline');
      expect((err as FetchError).message).toBe('offline');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('proceeds when navigator.onLine is true', async () => {
      vi.stubGlobal('navigator', { onLine: true });
      fetchImpl.mockResolvedValue(okResponse());
      const result = await fetchStations({ fetchImpl, now: () => NOW });
      expect(result.stations).toHaveLength(212);
    });

    it('proceeds when navigator is undefined', async () => {
      vi.stubGlobal('navigator', undefined);
      fetchImpl.mockResolvedValue(okResponse());
      const result = await fetchStations({ fetchImpl, now: () => NOW });
      expect(result.stations).toHaveLength(212);
    });
  });

  it('rejects network with message aborted for an already-aborted opts.signal', async () => {
    fetchImpl.mockImplementation(async (_u: string | Request | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return okResponse();
    });
    const ac = new AbortController();
    ac.abort();
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true, signal: ac.signal }).catch(
      (e: unknown) => e,
    );
    expect((err as FetchError).kind).toBe('network');
    expect((err as FetchError).message).toBe('aborted');
  });

  it('registers a once abort listener and removes the same listener after settling', async () => {
    fetchImpl.mockResolvedValue(okResponse());
    const ac = new AbortController();
    const add = vi.spyOn(ac.signal, 'addEventListener');
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true, signal: ac.signal });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![0]).toBe('abort');
    expect(add.mock.calls[0]![2]).toEqual({ once: true });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]![0]).toBe('abort');
    expect(remove.mock.calls[0]![1]).toBe(add.mock.calls[0]![1]);
  });

  it('removes the abort listener after a failure too', async () => {
    fetchImpl.mockRejectedValue(new TypeError('boom'));
    const ac = new AbortController();
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true, signal: ac.signal }).catch(() => {});
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('reports timeout with message timeout even with an un-aborted opts.signal', async () => {
    fetchImpl.mockImplementation(
      (_u: string | Request | URL, init?: RequestInit) =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const ac = new AbortController();
    const promise = fetchStations({
      fetchImpl,
      timeoutMs: 500,
      now: () => NOW,
      isOnline: () => true,
      signal: ac.signal,
    });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'timeout', message: 'timeout' });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('reports network message aborted when the caller aborts during the request', async () => {
    fetchImpl.mockImplementation(
      (_u: string | Request | URL, init?: RequestInit) =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
        }),
    );
    const ac = new AbortController();
    const promise = fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true, signal: ac.signal });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'network', message: 'aborted' });
    ac.abort();
    await assertion;
  });

  it('reports timeout when the timer fires while reading the body', async () => {
    fetchImpl.mockImplementation(async (_u: string | Request | URL, init?: RequestInit) => {
      const res = new Response('{}', { status: 200 });
      res.json = () =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      return res;
    });
    const promise = fetchStations({ fetchImpl, timeoutMs: 300, now: () => NOW, isOnline: () => true });
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'timeout', message: 'timeout' });
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
  });

  it('reports network aborted when the caller aborts while reading the body', async () => {
    const ac = new AbortController();
    fetchImpl.mockImplementation(async () => {
      const res = new Response('{}', { status: 200 });
      res.json = () => {
        ac.abort();
        return Promise.reject(new Error('bad json'));
      };
      return res;
    });
    const err = await fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true, signal: ac.signal }).catch(
      (e: unknown) => e,
    );
    expect((err as FetchError).kind).toBe('network');
    expect((err as FetchError).message).toBe('aborted');
  });

  it('error messages: http, network passthrough, non-Error fallbacks, no stations', async () => {
    const run = (): Promise<unknown> =>
      fetchStations({ fetchImpl, now: () => NOW, isOnline: () => true }).catch((e: unknown) => e);

    fetchImpl.mockResolvedValue(new Response('x', { status: 500 }));
    let err = (await run()) as FetchError;
    expect(err.message).toBe('HTTP 500');
    expect(err.status).toBe(500);
    expect(err.name).toBe('FetchError');

    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    err = (await run()) as FetchError;
    expect(err.message).toBe('Failed to fetch');
    expect(err.status).toBeUndefined();

    fetchImpl.mockRejectedValue('weird');
    err = (await run()) as FetchError;
    expect(err.kind).toBe('network');
    expect(err.message).toBe('network error');

    fetchImpl.mockResolvedValue(new Response('not json', { status: 200 }));
    err = (await run()) as FetchError;
    expect(err.kind).toBe('invalid');
    expect(err.message).not.toBe('');
    expect(err.status).toBeUndefined();

    const res = new Response('{}', { status: 200 });
    res.json = () => Promise.reject('nope');
    fetchImpl.mockResolvedValue(res);
    err = (await run()) as FetchError;
    expect(err.message).toBe('invalid response');

    fetchImpl.mockResolvedValue(okResponse(laGomeraBody()));
    err = (await run()) as FetchError;
    expect(err.message).toBe('no Tenerife stations');
  });

  it('FetchError defaults message to kind and keeps status only when given', () => {
    const a = new FetchError('network');
    expect(a.message).toBe('network');
    expect(a.name).toBe('FetchError');
    expect(a.status).toBeUndefined();
    const b = new FetchError('http', 'HTTP 404', 404);
    expect(b.message).toBe('HTTP 404');
    expect(b.status).toBe(404);
  });

  it('reports offline with the fetch error message when connectivity drops after rejection', async () => {
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    const isOnline = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const err = (await fetchStations({ fetchImpl, now: () => NOW, isOnline }).catch((e: unknown) => e)) as FetchError;
    expect(err.message).toBe('Failed to fetch');
  });
});
