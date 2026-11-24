// @vitest-environment node
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const ORIGIN = 'https://app.test';
const SCOPE = 'https://app.test/';
const MITECO_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/38';
const SHELL_URLS = [
  'https://app.test/',
  'https://app.test/index.html',
  'https://app.test/manifest.webmanifest',
  'https://app.test/icons/icon.svg',
];

type Handler = (event: unknown) => unknown;

interface FakeCache {
  entries: Map<string, Response>;
  put: (req: unknown, res: Response) => Promise<void>;
  match: (req: unknown) => Promise<Response | undefined>;
  keys: () => Promise<string[]>;
  addAll: (reqs: unknown[]) => Promise<void>;
}

interface FakeCacheStorage {
  open: (name: string) => Promise<FakeCache>;
  keys: () => Promise<string[]>;
  delete: (name: string) => Promise<boolean>;
  match: (req: unknown) => Promise<Response | undefined>;
}

interface Env {
  handlers: Record<string, Handler[]>;
  self: Record<string, unknown>;
  store: Map<string, FakeCache>;
  caches: FakeCacheStorage;
  fetch: Mock<(req: unknown) => Promise<Response>>;
  skipWaiting: Mock;
  claim: Mock;
}

function urlOf(req: unknown): string {
  return typeof req === 'string' ? req : (req as { url: string }).url;
}

function makeCache(): FakeCache {
  const entries = new Map<string, Response>();
  const cache: FakeCache = {
    entries,
    async put(req, res) {
      entries.set(urlOf(req), res);
    },
    async match(req) {
      return entries.get(urlOf(req));
    },
    async keys() {
      return [...entries.keys()];
    },
    async addAll(reqs) {
      for (const req of reqs) {
        const res = await env.fetch(req);
        entries.set(urlOf(req), res);
      }
    },
  };
  return cache;
}

let env: Env;

function loadServiceWorker(): Env {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const handlers: Record<string, Handler[]> = {};
  const store = new Map<string, FakeCache>();
  const fetchFn: Mock<(req: unknown) => Promise<Response>> = vi.fn(
    async (_req: unknown) => new Response('network'),
  );
  const skipWaiting: Mock = vi.fn();
  const claim: Mock = vi.fn();

  const cachesObj: FakeCacheStorage = {
    async open(name: string) {
      let cache = store.get(name);
      if (!cache) {
        cache = makeCache();
        store.set(name, cache);
      }
      return cache;
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name: string) {
      return store.delete(name);
    },
    async match(req: unknown) {
      for (const cache of store.values()) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    registration: { scope: SCOPE },
    addEventListener(type: string, fn: Handler) {
      (handlers[type] ??= []).push(fn);
    },
    skipWaiting,
    clients: { claim },
    caches: cachesObj,
    fetch: fetchFn,
  };

  const sandbox = {
    self,
    caches: cachesObj,
    fetch: fetchFn,
    clients: self.clients,
    skipWaiting,
    addEventListener: self.addEventListener,
    location: self.location,
    registration: self.registration,
    URL,
    Response,
  };

  runInNewContext(source, sandbox, { filename: 'public/sw.js' });

  return { handlers, self, store, caches: cachesObj, fetch: fetchFn, skipWaiting, claim };
}

function fire(type: string, event: unknown): void {
  const list = env.handlers[type] ?? [];
  for (const fn of list) fn(event);
}

function fetchEvent(request: { url: string; method: string; mode: string }) {
  return { request, respondWith: vi.fn(), waitUntil: vi.fn() };
}

beforeEach(() => {
  env = loadServiceWorker();
});

describe('public/sw.js', () => {
  it('registers install, activate and fetch handlers', () => {
    expect(env.handlers.install?.length).toBe(1);
    expect(env.handlers.activate?.length).toBe(1);
    expect(env.handlers.fetch?.length).toBe(1);
  });

  it('precaches the 4 shell URLs into tgp-shell-v1 on install and calls skipWaiting', async () => {
    const event = { waitUntil: vi.fn() };

    fire('install', event);

    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    await event.waitUntil.mock.calls[0]![0];

    const cache = env.store.get('tgp-shell-v1');
    expect(cache).toBeDefined();
    expect([...cache!.entries.keys()].sort()).toEqual([...SHELL_URLS].sort());
    expect(env.skipWaiting).toHaveBeenCalled();
  });

  it('deletes tgp-shell-* caches other than tgp-shell-v1 on activate and keeps the rest', async () => {
    await env.caches.open('tgp-shell-v0');
    await env.caches.open('tgp-shell-v1');
    await env.caches.open('other');
    const event = { waitUntil: vi.fn() };

    fire('activate', event);

    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    await event.waitUntil.mock.calls[0]![0];

    const names = [...env.store.keys()].sort();
    expect(names).toEqual(['other', 'tgp-shell-v1']);
    expect(env.claim).toHaveBeenCalled();
  });

  it('does not intercept a GET to the MITECO API', () => {
    const event = fetchEvent({ url: MITECO_URL, method: 'GET', mode: 'cors' });

    fire('fetch', event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('does not intercept a GET to an OSM tile', () => {
    const event = fetchEvent({
      url: 'https://tile.openstreetmap.org/1/1/1.png',
      method: 'GET',
      mode: 'no-cors',
    });

    fire('fetch', event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('does not intercept a same-origin POST', () => {
    const event = fetchEvent({ url: 'https://app.test/submit', method: 'POST', mode: 'cors' });

    fire('fetch', event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('serves a cached same-origin asset without calling fetch', async () => {
    const cache = await env.caches.open('tgp-shell-v1');
    await (cache as FakeCache).put(
      'https://app.test/icons/icon.svg',
      new Response('cached-icon'),
    );
    const event = fetchEvent({
      url: 'https://app.test/icons/icon.svg',
      method: 'GET',
      mode: 'cors',
    });

    fire('fetch', event);

    expect(event.respondWith).toHaveBeenCalledTimes(1);
    const res = (await event.respondWith.mock.calls[0]![0]) as Response;
    expect(await res.text()).toBe('cached-icon');
    expect(env.fetch).not.toHaveBeenCalled();
  });

  it('on a same-origin asset miss, fetches and caches the response when ok', async () => {
    env.fetch.mockImplementationOnce(async () => new Response('fresh-asset', { status: 200 }));
    const event = fetchEvent({
      url: 'https://app.test/assets/app.js',
      method: 'GET',
      mode: 'cors',
    });

    fire('fetch', event);

    const res = (await event.respondWith.mock.calls[0]![0]) as Response;
    expect(await res.text()).toBe('fresh-asset');
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(urlOf(env.fetch.mock.calls[0]![0])).toBe('https://app.test/assets/app.js');

    const cache = env.store.get('tgp-shell-v1') as FakeCache;
    const cached = await cache.match('https://app.test/assets/app.js');
    expect(cached).toBeDefined();
    expect(await cached!.text()).toBe('fresh-asset');
  });

  it('on a same-origin asset miss, does not cache a non-ok response', async () => {
    env.fetch.mockImplementationOnce(async () => new Response('missing', { status: 404 }));
    const event = fetchEvent({
      url: 'https://app.test/assets/gone.js',
      method: 'GET',
      mode: 'cors',
    });

    fire('fetch', event);

    await event.respondWith.mock.calls[0]![0];
    const cache = env.store.get('tgp-shell-v1');
    const cached = cache ? await cache.match('https://app.test/assets/gone.js') : undefined;
    expect(cached).toBeUndefined();
  });

  it('navigation: returns the network response and updates the cached index.html', async () => {
    const cache = (await env.caches.open('tgp-shell-v1')) as FakeCache;
    await cache.put('https://app.test/index.html', new Response('old-index'));
    env.fetch.mockImplementationOnce(async () => new Response('net-index', { status: 200 }));
    const event = fetchEvent({ url: 'https://app.test/', method: 'GET', mode: 'navigate' });

    fire('fetch', event);

    const res = (await event.respondWith.mock.calls[0]![0]) as Response;
    expect(await res.text()).toBe('net-index');

    const updated = await cache.match('https://app.test/index.html');
    expect(updated).toBeDefined();
    expect(await updated!.text()).toBe('net-index');
  });

  it('navigation: returns the cached index.html when the network rejects', async () => {
    const cache = (await env.caches.open('tgp-shell-v1')) as FakeCache;
    await cache.put('https://app.test/index.html', new Response('cached-index'));
    env.fetch.mockImplementationOnce(async () => {
      throw new TypeError('offline');
    });
    const event = fetchEvent({ url: 'https://app.test/', method: 'GET', mode: 'navigate' });

    fire('fetch', event);

    const res = (await event.respondWith.mock.calls[0]![0]) as Response;
    expect(await res.text()).toBe('cached-index');
  });
});
