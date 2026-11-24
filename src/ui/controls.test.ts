import { describe, it, expect, vi } from 'vitest';
import { createControls } from './controls';
import type { ControlsProps } from './controls';
import { S } from './strings';

const now = new Date('2026-11-23T22:39:00Z');
const sourceDate = new Date('2026-11-23T22:36:00Z');
const fetchedAt = new Date('2026-11-23T22:36:00Z'); // 3 minutes before now

function props(over: Partial<ControlsProps> = {}): ControlsProps {
  return {
    status: 'ready',
    refreshing: false,
    lastError: null,
    online: true,
    sourceDate,
    fetchedAt,
    now,
    geoStatus: 'ok',
    hasStations: true,
    dataSource: 'live',
    notice: null,
    ...over,
  };
}

function setup(over: Partial<ControlsProps> = {}) {
  const onRefresh = vi.fn();
  const onLocate = vi.fn();
  const c = createControls({ onRefresh, onLocate });
  c.update(props(over));
  const q = <T extends HTMLElement>(s: string) => c.el.querySelector<T>(s);
  return { c, onRefresh, onLocate, q };
}

const refreshBtn = (el: HTMLElement) => el.querySelector<HTMLButtonElement>(`button[aria-label="${S.refresh}"]`)!;
const locateBtn = (el: HTMLElement) => el.querySelector<HTMLButtonElement>(`button[aria-label="${S.locate}"]`)!;

describe('createControls status pill', () => {
  it('shows S.updated with clock and relative time', () => {
    const { q } = setup();
    expect(q('.updated')!.textContent).toBe(S.updated('22:36', 'hace 3 min'));
    expect(S.updated('22:36', 'hace 3 min')).toBe('Precios: 22:36 · comprobado hace 3 min');
  });

  it('has no pill when fetchedAt is null', () => {
    const { q } = setup({ fetchedAt: null, sourceDate: null });
    const pill = q('.updated');
    expect(pill === null || pill.hidden || pill.textContent === '').toBe(true);
  });

  it('uses DD/MM HH:mm when sourceDate is a previous Canary day', () => {
    const { q } = setup({ sourceDate: new Date('2026-11-22T22:36:00Z') });
    expect(q('.updated')!.textContent).toBe(S.updated('22/11 22:36', 'hace 3 min'));
  });

  it('falls back to fetchedAt when sourceDate is null', () => {
    const { q } = setup({ sourceDate: null });
    expect(q('.updated')!.textContent).toBe(S.updated('22:36', 'hace 3 min'));
  });
});

describe('createControls buttons', () => {
  it('refresh while refreshing is disabled, busy and spinning', () => {
    const { c, onRefresh } = setup({ refreshing: true });
    const b = refreshBtn(c.el);
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.classList.contains('is-spinning')).toBe(true);
    b.click();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refresh when idle is enabled and calls onRefresh', () => {
    const { c, onRefresh } = setup();
    const b = refreshBtn(c.el);
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-busy')).not.toBe('true');
    expect(b.classList.contains('is-spinning')).toBe(false);
    expect(b.classList.contains('ctrl-btn')).toBe(true);
    b.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('locate is disabled when geolocation is unsupported', () => {
    const { c } = setup({ geoStatus: 'unsupported' });
    expect(locateBtn(c.el).disabled).toBe(true);
  });

  it('locate is off but clickable when denied', () => {
    const { c, onLocate } = setup({ geoStatus: 'denied' });
    const b = locateBtn(c.el);
    expect(b.classList.contains('ctrl-btn--off')).toBe(true);
    expect(b.disabled).toBe(false);
    b.click();
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('locate is enabled and not off when ok', () => {
    const { c, onLocate } = setup({ geoStatus: 'ok' });
    const b = locateBtn(c.el);
    expect(b.disabled).toBe(false);
    expect(b.classList.contains('ctrl-btn--off')).toBe(false);
    b.click();
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('updates are idempotent and reflect new props', () => {
    const { c } = setup({ refreshing: true });
    c.update(props({ refreshing: true }));
    expect(refreshBtn(c.el).disabled).toBe(true);
    c.update(props({ refreshing: false }));
    expect(refreshBtn(c.el).disabled).toBe(false);
    expect(refreshBtn(c.el).classList.contains('is-spinning')).toBe(false);
  });
});

describe('createControls banner', () => {
  it('has role status and aria-live polite', () => {
    const { q } = setup();
    const b = q('.banner')!;
    expect(b.getAttribute('role')).toBe('status');
    expect(b.getAttribute('aria-live')).toBe('polite');
  });

  it('notice wins even when offline', () => {
    const { q } = setup({ notice: 'Aviso importante', online: false });
    const b = q('.banner')!;
    expect(b.hidden).toBe(false);
    expect(b.textContent).toContain('Aviso importante');
    expect(b.textContent).not.toContain(S.offlineWithData('22:36'));
  });

  it('offline with stations', () => {
    const { q } = setup({ online: false });
    expect(q('.banner')!.textContent).toBe(S.offlineWithData('22:36'));
    expect(S.offlineWithData('22:36')).toBe('Sin conexión. Mostrando precios guardados (22:36).');
  });

  it('offline without stations', () => {
    const { q } = setup({ online: false, hasStations: false });
    expect(q('.banner')!.textContent).toBe(S.offlineNoData);
  });

  it('offline wins over a last error', () => {
    const { q } = setup({ online: false, lastError: 'timeout' });
    expect(q('.banner')!.textContent).toBe(S.offlineWithData('22:36'));
  });

  it('error with stations shows stale text and a working Retry button, beating cache', () => {
    const { q, onRefresh } = setup({ lastError: 'timeout', dataSource: 'cache' });
    const b = q('.banner')!;
    expect(b.hidden).toBe(false);
    expect(b.textContent).toContain(S.staleData(S.errorText('timeout'), '22:36'));
    expect(b.textContent).not.toContain(S.cachedData('22:36'));
    const retry = Array.from(b.querySelectorAll('button')).find((x) => x.textContent === S.retry)!;
    expect(retry).toBeTruthy();
    retry.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('error without stations does not show the stale text', () => {
    const { q } = setup({ lastError: 'timeout', hasStations: false, dataSource: null });
    const b = q('.banner')!;
    expect(b.textContent).not.toContain(S.staleData(S.errorText('timeout'), '22:36'));
  });

  it('cached data while refreshing is stale-styled with cachedLoading', () => {
    const { q } = setup({ dataSource: 'cache', refreshing: true });
    const b = q('.banner')!;
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe(S.cachedLoading('22:36'));
    expect(b.classList.contains('banner--stale')).toBe(true);
  });

  it('cached data when idle shows cachedData and is stale-styled', () => {
    const { q } = setup({ dataSource: 'cache', refreshing: false });
    const b = q('.banner')!;
    expect(b.textContent).toBe(S.cachedData('22:36'));
    expect(b.classList.contains('banner--stale')).toBe(true);
  });

  it('live data, online, no error hides the banner', () => {
    const { q } = setup();
    const b = q('.banner')!;
    expect(b.hidden).toBe(true);
    expect(b.hasAttribute('hidden')).toBe(true);
  });

  it('banner returns to hidden and loses stale class after state recovers', () => {
    const { c, q } = setup({ dataSource: 'cache' });
    c.update(props({ dataSource: 'live' }));
    const b = q('.banner')!;
    expect(b.hidden).toBe(true);
    expect(b.classList.contains('banner--stale')).toBe(false);
  });
});

describe('S error texts', () => {
  it('has the Spanish texts per kind', () => {
    expect(S.errorText('timeout')).toBe('El servicio de precios tardó demasiado en responder.');
    expect(S.errorText('http')).toBe('El servicio de precios devolvió un error.');
    expect(S.errorText('network')).toBe('No se pudo conectar con el servicio de precios.');
    expect(S.errorText('invalid')).toBe('El servicio de precios envió datos inesperados.');
    expect(S.errorText('offline')).toBe('Sin conexión.');
  });
});

describe('createControls structure and pill visibility (mutation)', () => {
  it('root, wrapper and initial hidden states before any update', () => {
    const c = createControls({ onRefresh: vi.fn(), onLocate: vi.fn() });
    expect(c.el.classList.contains('controls')).toBe(true);
    const pill = c.el.querySelector<HTMLElement>('.updated')!;
    const banner = c.el.querySelector<HTMLElement>('.banner')!;
    expect(pill.hidden).toBe(true);
    expect(banner.hidden).toBe(true);
    const wrap = c.el.querySelector('.controls__buttons')!;
    expect(wrap.querySelectorAll('button.ctrl-btn')).toHaveLength(2);
    expect(Array.from(c.el.children).indexOf(banner)).toBeLessThan(Array.from(c.el.children).indexOf(pill));
  });

  it('pill is visible with the exact text when fetchedAt is set', () => {
    const { q } = setup();
    expect(q('.updated')!.hidden).toBe(false);
    expect(q('.updated')!.textContent).toBe(S.updated('22:36', 'hace 3 min'));
  });

  it('pill is hidden and empty when fetchedAt is null', () => {
    const { q } = setup({ fetchedAt: null, sourceDate: null });
    expect(q('.updated')!.hidden).toBe(true);
    expect(q('.updated')!.textContent).toBe('');
  });

  it('pill is hidden and cleared when fetchedAt goes from set to null, and back', () => {
    const { c, q } = setup();
    c.update(props({ fetchedAt: null, sourceDate: null }));
    expect(q('.updated')!.hidden).toBe(true);
    expect(q('.updated')!.textContent).toBe('');
    c.update(props());
    expect(q('.updated')!.hidden).toBe(false);
    expect(q('.updated')!.textContent).toBe(S.updated('22:36', 'hace 3 min'));
  });

  it('with no dates the banner text uses an empty when', () => {
    const { q } = setup({ online: false, fetchedAt: null, sourceDate: null });
    expect(q('.banner')!.textContent).toBe(S.offlineWithData(''));
  });

  it('aria-busy is removed after refreshing ends', () => {
    const { c } = setup({ refreshing: true });
    expect(refreshBtn(c.el).hasAttribute('aria-busy')).toBe(true);
    c.update(props({ refreshing: false }));
    expect(refreshBtn(c.el).hasAttribute('aria-busy')).toBe(false);
  });

  it('buttons have class, type, title and an svg icon with paths', () => {
    const { c } = setup();
    for (const [b, label, n] of [
      [locateBtn(c.el), S.locate, 5],
      [refreshBtn(c.el), S.refresh, 2],
    ] as const) {
      expect(b.className).toBe('ctrl-btn');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('title')).toBe(label);
      const svg = b.querySelector('svg')!;
      expect(svg).not.toBeNull();
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('height')).toBe('24');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('stroke-width')).toBe('2');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      expect(svg.getAttribute('stroke-linejoin')).toBe('round');
      const paths = Array.from(svg.querySelectorAll('path'));
      expect(paths).toHaveLength(n);
      expect(paths.every((x) => (x.getAttribute('d') ?? '').length > 0)).toBe(true);
    }
    expect(locateBtn(c.el).querySelectorAll('path')[0]!.getAttribute('d')).toBe('M12 2v4');
    expect(refreshBtn(c.el).querySelectorAll('path')[1]!.getAttribute('d')).toBe('M21 3v6h-6');
  });

  it('stale retry button has class banner__retry and type button', () => {
    const { q, onRefresh } = setup({ lastError: 'timeout' });
    const r = q<HTMLButtonElement>('.banner .banner__retry')!;
    expect(r.getAttribute('type')).toBe('button');
    expect(r.textContent).toBe(S.retry);
    r.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
