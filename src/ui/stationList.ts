import type { Component, FetchErrorKind, FuelDef, GeoStatus, SortBy, StationListItem, AppState } from '../types';
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
}

export function createStationList(handlers: {
  onSelect(id: string): void;
  onSort(s: SortBy): void;
  onRetry(): void;
}): Component<StationListProps> {
  const title = h('h2', { class: 'list-title' });
  const nearest = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false' }, S.sortNearest);
  const cheapest = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'true' }, S.sortCheapest);
  nearest.addEventListener('click', () => handlers.onSort('distance'));
  cheapest.addEventListener('click', () => handlers.onSort('price'));
  const hint = h('p', { class: 'list-hint' });
  const content = h('div', { class: 'list-content' });
  const header = h(
    'div',
    { class: 'list-header' },
    title,
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
    return b;
  }

  function update(p: StationListProps): void {
    title.textContent = S.stationsCount(p.items.length, p.fuel.label);
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
      content.replaceChildren(h('p', { class: 'list-state' }, S.noStationsForFuel(p.fuel.label)));
    } else {
      const ul = h('ul', { class: 'station-list' });
      for (const item of p.items) ul.appendChild(h('li', {}, row(item)));
      content.replaceChildren(ul);
    }
  }

  return { el, update };
}
