import type { Component, FuelId, OpenState, Station } from '../types';
import { h } from './dom';
import { S } from './strings';
import { FUELS } from '../fuels';
import { formatDistance, formatPrice } from '../domain/format';
import { appleMapsUrl, googleMapsUrl } from '../domain/navigation';
import { is24h } from '../domain/hours';
import './stationDetail.css';

export interface StationDetailProps {
  station: Station;
  selectedFuel: FuelId;
  distanceKm: number | null;
  openState: OpenState;
  platform: 'ios' | 'other';
}

export function createStationDetail(handlers: { onBack(): void }): Component<StationDetailProps> {
  const el = h('div', { class: 'station-detail' });

  function update(p: StationDetailProps): void {
    const s = p.station;
    const back = h('button', { type: 'button', class: 'back-btn', 'aria-label': S.backToList }, S.back);
    back.addEventListener('click', () => handlers.onBack());

    const badge = is24h(s.hours)
      ? h('span', { class: 'badge badge--open' }, S.open24h)
      : p.openState === 'open'
        ? h('span', { class: 'badge badge--open' }, S.open)
        : p.openState === 'closed'
          ? h('span', { class: 'badge badge--closed' }, S.closed)
          : null;

    const rows = FUELS.filter((f) => s.prices[f.id] !== undefined).map((f) => {
      const selected = f.id === p.selectedFuel;
      return h(
        'tr',
        { class: selected ? 'is-selected' : null, 'aria-current': selected ? 'true' : null },
        h('th', { scope: 'row' }, f.label),
        h('td', {}, formatPrice(s.prices[f.id]!)),
      );
    });

    const google = h('a', { class: 'nav-btn', href: googleMapsUrl(s), target: '_blank', rel: 'noopener noreferrer' }, S.navigateGoogle);
    const apple = h('a', { class: 'nav-btn', href: appleMapsUrl(s), target: '_blank', rel: 'noopener noreferrer' }, S.navigateApple);
    const links = p.platform === 'ios' ? [apple, google] : [google, apple];
    links[0]!.classList.add('nav-btn--primary');

    el.replaceChildren(
      back,
      h('h2', { class: 'detail-title' }, s.brand || S.unbranded),
      h(
        'address',
        { class: 'detail-address' },
        h('div', {}, s.address),
        h('div', {}, `${s.postalCode} ${s.locality}`),
        h('div', {}, s.municipality),
      ),
      p.distanceKm !== null ? h('p', { class: 'detail-distance' }, formatDistance(p.distanceKm)) : '',
      h('p', { class: 'detail-hours' }, s.hours, ' ', badge),
      h('table', { class: 'prices' }, h('tbody', {}, ...rows)),
      h('div', { class: 'nav-links' }, ...links),
    );
  }

  return { el, update };
}
