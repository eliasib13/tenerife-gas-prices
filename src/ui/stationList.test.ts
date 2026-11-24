import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStationList } from './stationList';
import type { StationListProps } from './stationList';
import { S } from './strings';
import { makeStation } from '../test/factories';
import { fuelById } from '../fuels';
import { formatDistance, formatPrice } from '../domain/format';
import type { StationListItem } from '../types';

const g95 = fuelById('g95');

function item(over: Partial<StationListItem> & { station?: ReturnType<typeof makeStation> } = {}): StationListItem {
  return {
    station: makeStation(),
    price: 1.529,
    distanceKm: 0.85,
    tier: 'cheap',
    isCheapest: true,
    openState: 'open',
    ...over,
  };
}

function twoItems(): StationListItem[] {
  return [
    item({
      station: makeStation({ id: 'a', brand: 'REPSOL', address: 'CALLE A', municipality: 'Adeje' }),
    }),
    item({
      station: makeStation({ id: 'b', brand: 'CEPSA', address: 'CALLE B', municipality: 'Arona' }),
      price: 1.7,
      distanceKm: 3.44,
      tier: 'expensive',
      isCheapest: false,
      openState: 'closed',
    }),
  ];
}

afterEach(() => {
  document.body.replaceChildren();
});

function mount(over: Partial<StationListProps> = {}) {
  const h = { onSelect: vi.fn(), onSort: vi.fn(), onRetry: vi.fn(), onSearch: vi.fn(), onSearchFocus: vi.fn() };
  const c = createStationList(h);
  const props: StationListProps = {
    status: 'ready',
    lastError: null,
    items: twoItems(),
    fuel: g95,
    sortBy: 'price',
    canSortByDistance: true,
    geoStatus: 'ok',
    query: '',
    ...over,
  };
  c.update(props);
  document.body.appendChild(c.el);
  return { c, h, props };
}

function searchInput(el: HTMLElement): HTMLInputElement {
  const i = el.querySelector<HTMLInputElement>('input.list-search__input');
  if (!i) throw new Error('search input not found');
  return i;
}

function btn(el: HTMLElement, text: string): HTMLButtonElement {
  const b = Array.from(el.querySelectorAll('button')).find((x) => (x.textContent ?? '').includes(text));
  if (!b) throw new Error('button not found: ' + text);
  return b;
}

describe('createStationList', () => {
  it('loading shows S.loading and no list', () => {
    const { c } = mount({ status: 'loading', items: [] });
    expect(c.el.textContent).toContain(S.loading);
    expect(c.el.querySelector('ul')).toBeNull();
  });

  it('error shows loadFailed and the error text; Retry calls onRetry', () => {
    const { c, h } = mount({ status: 'error', lastError: 'network', items: [] });
    expect(c.el.textContent).toContain(S.loadFailed);
    expect(c.el.textContent).toContain(S.errorText('network'));
    expect(c.el.querySelector('ul')).toBeNull();
    btn(c.el, S.retry).click();
    expect(h.onRetry).toHaveBeenCalledTimes(1);
  });

  it('ready with no items shows noStationsForFuel', () => {
    const { c } = mount({ items: [] });
    expect(c.el.textContent).toContain(S.noStationsForFuel('Gasolina 95'));
    expect(c.el.querySelector('.station-row')).toBeNull();
  });

  it('renders header and rows for 2 items', () => {
    const { c } = mount();
    expect(S.stationsCount(2, 'Gasolina 95')).toBe('2 gasolineras · Gasolina 95');
    expect(c.el.querySelector('h2')?.textContent).toBe('2 gasolineras · Gasolina 95');
    const rows = Array.from(c.el.querySelectorAll<HTMLElement>('.station-row'));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tagName === 'BUTTON')).toBe(true);
    const first = rows[0]!;
    const t = first.textContent ?? '';
    expect(t).toContain('REPSOL');
    expect(t).toContain('CALLE A · Adeje');
    expect(t).toContain('1,529 €/L');
    expect(t).toContain('850 m');
    expect(t).toContain(S.cheapest);
    expect(t).toContain(S.open);
    expect(first.querySelector('.price--cheap')).not.toBeNull();
    const second = rows[1]!;
    expect(second.textContent).toContain('CEPSA');
    expect(second.textContent).not.toContain(S.cheapest);
    expect(second.textContent).toContain(S.closed);
    expect(second.textContent).toContain('3,4 km');
    expect(second.querySelector('.price--expensive')).not.toBeNull();
  });

  it('empty brand -> unbranded; null distance -> no distance; unknown -> no badge', () => {
    const { c } = mount({
      items: [
        item({
          station: makeStation({ brand: '' }),
          distanceKm: null,
          openState: 'unknown',
          isCheapest: false,
        }),
      ],
    });
    const row = c.el.querySelector('.station-row') as HTMLElement;
    const t = row.textContent ?? '';
    expect(t).toContain(S.unbranded);
    expect(t).not.toMatch(/\d\s?m\b/);
    expect(t).not.toContain(' km');
    expect(t).not.toContain(S.open);
    expect(t).not.toContain(S.closed);
  });

  it('clicking the 2nd row calls onSelect with its id', () => {
    const { c, h } = mount();
    const rows = c.el.querySelectorAll<HTMLElement>('.station-row');
    rows[1]!.click();
    expect(h.onSelect).toHaveBeenCalledTimes(1);
    expect(h.onSelect).toHaveBeenCalledWith('b');
  });

  it('sort control: price pressed, clicking Nearest calls onSort(distance)', () => {
    const { c, h } = mount({ sortBy: 'price' });
    expect(btn(c.el, S.sortCheapest).getAttribute('aria-pressed')).toBe('true');
    expect(btn(c.el, S.sortNearest).getAttribute('aria-pressed')).toBe('false');
    btn(c.el, S.sortNearest).click();
    expect(h.onSort).toHaveBeenCalledWith('distance');
  });

  it('sort control: distance pressed, clicking Cheapest calls onSort(price)', () => {
    const { c, h } = mount({ sortBy: 'distance' });
    expect(btn(c.el, S.sortNearest).getAttribute('aria-pressed')).toBe('true');
    btn(c.el, S.sortCheapest).click();
    expect(h.onSort).toHaveBeenCalledWith('price');
  });

  it('Nearest is disabled with a denied hint', () => {
    const { c } = mount({ canSortByDistance: false, geoStatus: 'denied' });
    expect(btn(c.el, S.sortNearest).disabled).toBe(true);
    expect(c.el.textContent).toContain(S.locationDenied);
    expect(c.el.textContent).not.toContain(S.locationPending);
  });

  it('Nearest is disabled with a pending hint', () => {
    const { c } = mount({ canSortByDistance: false, geoStatus: 'pending' });
    expect(btn(c.el, S.sortNearest).disabled).toBe(true);
    expect(c.el.textContent).toContain(S.locationPending);
    expect(c.el.textContent).not.toContain(S.locationDenied);
  });

  it('Nearest is enabled and no hint when it can sort by distance', () => {
    const { c } = mount();
    expect(btn(c.el, S.sortNearest).disabled).toBe(false);
    expect(c.el.textContent).not.toContain(S.locationDenied);
    expect(c.el.textContent).not.toContain(S.locationPending);
  });

  it('renders markup in brand as text', () => {
    const { c } = mount({
      items: [item({ station: makeStation({ brand: '<b id="x">EVIL</b>' }) })],
    });
    expect(c.el.querySelector('#x')).toBeNull();
    expect(c.el.querySelector('.station-row')?.textContent).toContain('<b id="x">EVIL</b>');
  });
});

describe('createStationList structure (mutation)', () => {
  it('has the header structure and classes', () => {
    const { c } = mount();
    expect(c.el.classList.contains('station-list-wrap')).toBe(true);
    const header = c.el.querySelector('.list-header')!;
    expect(header).not.toBeNull();
    expect(header.querySelector('h2.list-title')).not.toBeNull();
    const seg = header.querySelector('.segmented')!;
    expect(seg.getAttribute('role')).toBe('group');
    const segs = Array.from(seg.querySelectorAll('button.seg'));
    expect(segs.map((b) => b.textContent)).toEqual([S.sortNearest, S.sortCheapest]);
    expect(segs.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(header.querySelector('p.list-hint')).not.toBeNull();
    expect(c.el.querySelector('.list-content')).not.toBeNull();
    expect(c.el.querySelector('.list-content ul.station-list')).not.toBeNull();
  });

  it('aria-pressed reflects sortBy in both directions, also across updates', () => {
    const { c, props } = mount({ sortBy: 'distance' });
    expect(btn(c.el, S.sortNearest).getAttribute('aria-pressed')).toBe('true');
    expect(btn(c.el, S.sortCheapest).getAttribute('aria-pressed')).toBe('false');
    c.update({ ...props, sortBy: 'price' });
    expect(btn(c.el, S.sortNearest).getAttribute('aria-pressed')).toBe('false');
    expect(btn(c.el, S.sortCheapest).getAttribute('aria-pressed')).toBe('true');
  });

  it('hint is empty and hidden when it can sort by distance; visible with text otherwise', () => {
    const ok = mount();
    const hint = ok.c.el.querySelector<HTMLElement>('.list-hint')!;
    expect(hint.textContent).toBe('');
    expect(hint.hidden).toBe(true);
    const denied = mount({ canSortByDistance: false, geoStatus: 'denied' });
    const h2 = denied.c.el.querySelector<HTMLElement>('.list-hint')!;
    expect(h2.textContent).toBe(S.locationDenied);
    expect(h2.hidden).toBe(false);
    const pending = mount({ canSortByDistance: false, geoStatus: 'pending' });
    expect(pending.c.el.querySelector('.list-hint')!.textContent).toBe(S.locationPending);
  });

  it('hint is cleared when distance sorting becomes available again', () => {
    const { c, props } = mount({ canSortByDistance: false, geoStatus: 'denied' });
    c.update({ ...props, canSortByDistance: true, geoStatus: 'ok' });
    expect(c.el.querySelector('.list-hint')!.textContent).toBe('');
  });

  it('row classes, badges and exact aria-label with distance', () => {
    const { c } = mount();
    const rows = Array.from(c.el.querySelectorAll<HTMLElement>('ul.station-list > li > button.station-row'));
    expect(rows).toHaveLength(2);
    const [a, b] = rows as [HTMLElement, HTMLElement];
    expect(a.getAttribute('type')).toBe('button');
    expect(a.getAttribute('aria-label')).toBe(`REPSOL, ${formatPrice(1.529)}, ${formatDistance(0.85)}`);
    expect(b.getAttribute('aria-label')).toBe(`CEPSA, ${formatPrice(1.7)}, ${formatDistance(3.44)}`);
    expect(a.querySelector('.station-row__main')).not.toBeNull();
    expect(a.querySelector('.station-row__main .station-row__brand')!.textContent).toBe('REPSOL');
    expect(a.querySelector('.station-row__main .station-row__addr')!.textContent).toBe('CALLE A · Adeje');
    expect(a.querySelector('.station-row__main .station-row__dist')!.textContent).toBe(formatDistance(0.85));
    expect(b.querySelector('.station-row__dist')!.textContent).toBe(formatDistance(3.44));
    expect(a.querySelector('.badges')).not.toBeNull();
    expect(a.querySelector('.badges .badge.badge--open')!.textContent).toBe(S.open);
    expect(a.querySelector('.badges .badge.badge--cheapest')!.textContent).toBe(S.cheapest);
    expect(a.querySelector('.badge--closed')).toBeNull();
    expect(b.querySelector('.badges .badge.badge--closed')!.textContent).toBe(S.closed);
    expect(b.querySelector('.badge--open')).toBeNull();
    expect(b.querySelector('.badge--cheapest')).toBeNull();
    expect(a.querySelector('.price')!.textContent).toBe(formatPrice(1.529));
  });

  it('aria-label omits distance when null and uses unbranded for empty brand', () => {
    const { c } = mount({
      items: [item({ station: makeStation({ brand: '' }), distanceKm: null, openState: 'unknown', isCheapest: false })],
    });
    const row = c.el.querySelector('.station-row')!;
    expect(row.getAttribute('aria-label')).toBe(`${S.unbranded}, ${formatPrice(1.529)}`);
    expect(row.querySelector('.station-row__dist')).toBeNull();
    expect(row.querySelector('.badge')).toBeNull();
    expect(row.querySelector('.badges')!.children).toHaveLength(0);
  });

  it('error state: list-state with loadFailed, detail and Retry button', () => {
    const { c, h } = mount({ status: 'error', lastError: 'timeout', items: [] });
    const st = c.el.querySelector('.list-content > .list-state')!;
    expect(st).not.toBeNull();
    expect(st.querySelector('p')!.textContent).toBe(S.loadFailed);
    expect(st.querySelector('.list-state__detail')!.textContent).toBe(S.errorText('timeout'));
    const retry = st.querySelector<HTMLButtonElement>('button.retry-btn')!;
    expect(retry.getAttribute('type')).toBe('button');
    expect(retry.textContent).toBe(S.retry);
    retry.click();
    expect(h.onRetry).toHaveBeenCalledTimes(1);
  });

  it('error state without lastError has no detail', () => {
    const { c } = mount({ status: 'error', lastError: null, items: [] });
    expect(c.el.querySelector('.list-state__detail')).toBeNull();
    expect(c.el.querySelector('.retry-btn')).not.toBeNull();
  });

  it('loading and empty states render a .list-state paragraph with exact text', () => {
    const l = mount({ status: 'loading', items: [] });
    const p1 = l.c.el.querySelector('.list-content > p.list-state')!;
    expect(p1.textContent).toBe(S.loading);
    const e = mount({ items: [] });
    const p2 = e.c.el.querySelector('.list-content > p.list-state')!;
    expect(p2.textContent).toBe(S.noStationsForFuel('Gasolina 95'));
  });
});

describe('createStationList search', () => {
  it('renders a search input with label, placeholder and attributes', () => {
    const { c } = mount();
    const input = searchInput(c.el);
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('aria-label')).toBe(S.searchLabel);
    expect(input.getAttribute('placeholder')).toBe(S.searchPlaceholder);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('enterkeyhint')).toBe('search');
    expect(input.closest('.list-header')).not.toBeNull();
    expect(input.closest('.list-search')).not.toBeNull();
  });

  it('keeps the same input node across updates', () => {
    const { c, props } = mount();
    const before = searchInput(c.el);
    c.update({ ...props, query: 'abc' });
    c.update({ ...props, query: 'abcd', items: [] });
    c.update({ ...props, status: 'loading', items: [] });
    expect(searchInput(c.el)).toBe(before);
  });

  it('input event calls onSearch with the typed value', () => {
    const { c, h } = mount();
    const input = searchInput(c.el);
    input.value = 'Cepsa';
    input.dispatchEvent(new Event('input'));
    expect(h.onSearch).toHaveBeenCalledTimes(1);
    expect(h.onSearch).toHaveBeenCalledWith('Cepsa');
  });

  it('focus event calls onSearchFocus once and not onSearch', () => {
    const { c, h } = mount();
    searchInput(c.el).dispatchEvent(new Event('focus'));
    expect(h.onSearchFocus).toHaveBeenCalledTimes(1);
    expect(h.onSearch).not.toHaveBeenCalled();
  });

  it('update sets the input value from query', () => {
    const { c, props } = mount();
    c.update({ ...props, query: 'abc' });
    expect(searchInput(c.el).value).toBe('abc');
    c.update({ ...props, query: '' });
    expect(searchInput(c.el).value).toBe('');
  });

  it('does not reassign the value when it already equals query (caret preserved)', () => {
    const { c, props } = mount();
    const input = searchInput(c.el);
    input.value = 'abc';
    input.setSelectionRange(1, 1);
    c.update({ ...props, query: 'abc' });
    expect(input.value).toBe('abc');
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it('writes the input value only when it differs from query', () => {
    const { c, props } = mount();
    const input = searchInput(c.el);
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    let writes = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set(v: string) {
        writes++;
        proto.set!.call(this, v);
      },
    });
    input.value = 'abc';
    writes = 0;
    c.update({ ...props, query: 'abc' });
    expect(writes).toBe(0);
    c.update({ ...props, query: 'abd' });
    expect(writes).toBe(1);
    expect(input.value).toBe('abd');
  });

  it('only Enter blurs the search input; other keys keep focus', () => {
    const { c } = mount();
    const input = searchInput(c.el);
    input.focus();
    expect(document.activeElement).toBe(input);
    for (const key of ['a', 'Escape']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(document.activeElement).toBe(input);
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(input);
  });

  it('clear button is hidden right after creation, before any update', () => {
    const c = createStationList({
      onSelect: vi.fn(),
      onSort: vi.fn(),
      onRetry: vi.fn(),
      onSearch: vi.fn(),
      onSearchFocus: vi.fn(),
    });
    const clear = c.el.querySelector<HTMLButtonElement>('button.list-search__clear')!;
    expect(clear.hidden).toBe(true);
  });

  it('clear button is hidden when query is empty and visible when it is not', () => {
    const { c, props } = mount({ query: '' });
    const clear = c.el.querySelector<HTMLButtonElement>('button.list-search__clear')!;
    expect(clear).not.toBeNull();
    expect(clear.getAttribute('type')).toBe('button');
    expect(clear.getAttribute('aria-label')).toBe(S.searchClear);
    expect(clear.hidden).toBe(true);
    c.update({ ...props, query: 'x' });
    expect(clear.hidden).toBe(false);
    c.update({ ...props, query: '' });
    expect(clear.hidden).toBe(true);
  });

  it('clear click calls onSearch with empty string and focuses the input', () => {
    const { c, h } = mount({ query: 'x' });
    const input = searchInput(c.el);
    const clear = c.el.querySelector<HTMLButtonElement>('button.list-search__clear')!;
    clear.click();
    expect(h.onSearch).toHaveBeenCalledTimes(1);
    expect(h.onSearch).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(input);
  });

  it('Enter keydown blurs the input', () => {
    const { c } = mount({ query: 'cepsa' });
    const input = searchInput(c.el);
    input.focus();
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(input);
  });

  it('title counts the items it is given (already filtered)', () => {
    const { c, props } = mount({ query: 'cepsa', items: [twoItems()[1]!] });
    expect(c.el.querySelector('h2')?.textContent).toBe(S.stationsCount(1, 'Gasolina 95'));
    c.update({ ...props, query: '', items: twoItems() });
    expect(c.el.querySelector('h2')?.textContent).toBe(S.stationsCount(2, 'Gasolina 95'));
  });

  it('empty items with a non-blank query shows noStationsMatch with the query', () => {
    const { c } = mount({ query: 'foo', items: [] });
    const p = c.el.querySelector('.list-content > p.list-state')!;
    expect(p.textContent).toBe(S.noStationsMatch('foo'));
    expect(c.el.querySelector('.station-row')).toBeNull();
  });

  it('empty items with an empty or blank query shows noStationsForFuel', () => {
    const empty = mount({ query: '', items: [] });
    expect(empty.c.el.querySelector('.list-content > p.list-state')!.textContent).toBe(
      S.noStationsForFuel('Gasolina 95'),
    );
    const blank = mount({ query: '  ', items: [] });
    expect(blank.c.el.querySelector('.list-content > p.list-state')!.textContent).toBe(
      S.noStationsForFuel('Gasolina 95'),
    );
  });

  it('loading and error states keep the search input present', () => {
    const l = mount({ status: 'loading', items: [], query: 'foo' });
    expect(searchInput(l.c.el)).not.toBeNull();
    const e = mount({ status: 'error', lastError: 'network', items: [], query: 'foo' });
    expect(searchInput(e.c.el)).not.toBeNull();
    expect(e.c.el.querySelector('.list-state')).not.toBeNull();
  });
});
