import type { Component, ListScope, FetchErrorKind, FuelDef, GeoStatus, SortBy, StationListItem, AppState } from '../types';
import { h } from './dom';
import { S } from './strings';
import { formatDistance, formatPrice } from '../domain/format';
import './stationList.css';

export interface StationListProps {
  status: AppState['status'];
  lastError: FetchErrorKind | null;
  items: StationListItem[];
  fuel: FuelDef;
  sortBy: SortBy;
  canSortByDistance: boolean;
  geoStatus: GeoStatus;
  query: string;
  scope: ListScope;
  favoriteCount: number;
}

export function createStationList(handlers: {
  onSelect(id: string): void;
  onSort(s: SortBy): void;
  onRetry(): void;
  onSearch(q: string): void;
  onSearchFocus(): void;
  onScope(scope: ListScope): void;
  onToggleFavorite(id: string): void;
}): Component<StationListProps> {
  const title = h('h2', { class: 'list-title' });
  const nearest = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false' }, S.sortNearest);
  const cheapest = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'true' }, S.sortCheapest);
  nearest.addEventListener('click', () => handlers.onSort('distance'));
  cheapest.addEventListener('click', () => handlers.onSort('price'));
  const scopeAll = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'true' }, S.scopeAll);
  const scopeFav = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false' }, S.scopeFavorites);
  scopeAll.addEventListener('click', () => handlers.onScope('all'));
  scopeFav.addEventListener('click', () => handlers.onScope('favorites'));
  const input = h('input', {
    type: 'search',
    class: 'list-search__input',
    'aria-label': S.searchLabel,
    placeholder: S.searchPlaceholder,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });
  const clear = h('button', { type: 'button', class: 'list-search__clear', 'aria-label': S.searchClear }, '×');
  clear.hidden = true;
  input.addEventListener('input', () => handlers.onSearch(input.value));
  input.addEventListener('focus', () => handlers.onSearchFocus());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  clear.addEventListener('click', () => {
    handlers.onSearch('');
    input.focus();
  });
  const search = h('div', { class: 'list-search' }, input, clear);
  const hint = h('p', { class: 'list-hint' });
  const content = h('div', { class: 'list-content' });
  const header = h(
    'div',
    { class: 'list-header' },
    title,
    search,
    h('div', { class: 'segmented segmented--scope', role: 'group', 'aria-label': S.scopeLabel }, scopeAll, scopeFav),
    h('div', { class: 'segmented', role: 'group' }, nearest, cheapest),
    hint,
  );
  const el = h('div', { class: 'station-list-wrap' }, header, content);

  function row(item: StationListItem): HTMLElement {
    const s = item.station;
    const brand = s.brand || S.unbranded;
    const label = [brand, formatPrice(item.price), item.distanceKm !== null ? formatDistance(item.distanceKm) : null]
      .filter(Boolean)
      .join(', ');
    const badges = h(
      'span',
      { class: 'badges' },
      item.openState === 'open' ? h('span', { class: 'badge badge--open' }, S.open) : null,
      item.openState === 'closed' ? h('span', { class: 'badge badge--closed' }, S.closed) : null,
      item.isCheapest ? h('span', { class: 'badge badge--cheapest' }, S.cheapest) : null,
    );
    const b = h(
      'button',
      { class: 'station-row', type: 'button', 'aria-label': label },
      h(
        'span',
        { class: 'station-row__main' },
        h('span', { class: 'station-row__brand' }, brand),
        h('span', { class: 'station-row__addr' }, `${s.address} · ${s.municipality}`),
        item.distanceKm !== null ? h('span', { class: 'station-row__dist' }, formatDistance(item.distanceKm)) : null,
        badges,
      ),
      h('span', { class: `price price--${item.tier}` }, formatPrice(item.price)),
    );
    b.addEventListener('click', () => handlers.onSelect(s.id));
    const star = h(
      'button',
      {
        type: 'button',
        class: 'fav-btn',
        'aria-pressed': item.favorite ? 'true' : 'false',
        'aria-label': item.favorite ? S.favoriteRemove : S.favoriteAdd,
      },
      item.favorite ? '★' : '☆',
    );
    star.addEventListener('click', () => handlers.onToggleFavorite(s.id));
    return h('li', { class: 'station-item' }, b, star);
  }

  function update(p: StationListProps): void {
    if (input.value !== p.query) input.value = p.query;
    clear.hidden = p.query === '';
    title.textContent = S.stationsCount(p.items.length, p.fuel.label);
    scopeAll.setAttribute('aria-pressed', p.scope === 'all' ? 'true' : 'false');
    scopeFav.setAttribute('aria-pressed', p.scope === 'favorites' ? 'true' : 'false');
    nearest.setAttribute('aria-pressed', p.sortBy === 'distance' ? 'true' : 'false');
    cheapest.setAttribute('aria-pressed', p.sortBy === 'price' ? 'true' : 'false');
    nearest.disabled = !p.canSortByDistance;
    hint.textContent = p.canSortByDistance ? '' : p.geoStatus === 'pending' ? S.locationPending : S.locationDenied;
    hint.hidden = p.canSortByDistance;

    if (p.status === 'loading') {
      content.replaceChildren(h('p', { class: 'list-state' }, S.loading));
    } else if (p.status === 'error') {
      const retry = h('button', { type: 'button', class: 'retry-btn' }, S.retry);
      retry.addEventListener('click', () => handlers.onRetry());
      content.replaceChildren(
        h(
          'div',
          { class: 'list-state' },
          h('p', {}, S.loadFailed),
          p.lastError ? h('p', { class: 'list-state__detail' }, S.errorText(p.lastError)) : null,
          retry,
        ),
      );
    } else if (p.items.length === 0) {
      const q = p.query.trim();
      const fav = p.scope === 'favorites';
      const msg =
        fav && p.favoriteCount === 0
          ? S.noFavorites
          : q !== ''
            ? S.noStationsMatch(q)
            : fav
              ? S.noFavoritesForFuel(p.fuel.label)
              : S.noStationsForFuel(p.fuel.label);
      content.replaceChildren(h('p', { class: 'list-state' }, msg));
    } else {
      const ul = h('ul', { class: 'station-list' });
      for (const item of p.items) ul.appendChild(row(item));
      content.replaceChildren(ul);
    }
  }

  return { el, update };
}
