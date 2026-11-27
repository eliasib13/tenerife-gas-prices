import { describe, it, expect, vi } from 'vitest';
import { createStationDetail } from './stationDetail';
import type { StationDetailProps } from './stationDetail';
import { S } from './strings';
import { makeStation } from '../test/factories';
import { appleMapsUrl, googleMapsUrl } from '../domain/navigation';

function mount(over: Partial<StationDetailProps> = {}) {
  const onBack = vi.fn();
  const onToggleFavorite = vi.fn();
  const c = createStationDetail({ onBack, onToggleFavorite });
  const props: StationDetailProps = {
    station: makeStation({
      brand: 'REPSOL',
      address: 'CALLE MAYOR 5',
      locality: 'LOS CRISTIANOS',
      municipality: 'Arona',
      postalCode: '38650',
      hours: 'L-V: 07:00-22:00',
    }),
    selectedFuel: 'g95',
    distanceKm: null,
    openState: 'open',
    platform: 'other',
    isFavorite: false,
    ...over,
  };
  c.update(props);
  document.body.appendChild(c.el);
  return { c, onBack, onToggleFavorite, props };
}

describe('createStationDetail', () => {
  it('renders brand, address, postal code, locality, municipality and hours', () => {
    const { c } = mount();
    const text = c.el.textContent ?? '';
    expect(c.el.querySelector('h2')?.textContent).toBe('REPSOL');
    expect(text).toContain('CALLE MAYOR 5');
    expect(text).toContain('38650');
    expect(text).toContain('LOS CRISTIANOS');
    expect(text).toContain('Arona');
    expect(text).toContain('L-V: 07:00-22:00');
  });

  it('shows the unbranded string for empty brand', () => {
    const { c } = mount({ station: makeStation({ brand: '' }) });
    expect(c.el.querySelector('h2')?.textContent).toBe(S.unbranded);
  });

  it('shows open / closed badge and not the 24h badge for normal hours', () => {
    const { c } = mount({ openState: 'open' });
    expect(c.el.textContent).toContain(S.open);
    expect(c.el.textContent).not.toContain(S.open24h);
    c.update({ ...mount().props, openState: 'closed' });
    expect(c.el.textContent).toContain(S.closed);
  });

  it('shows the open24h badge when hours is 24H', () => {
    const { c } = mount({ station: makeStation({ hours: 'L-D: 24H' }), openState: 'open' });
    expect(c.el.textContent).toContain(S.open24h);
  });

  it('prices table lists only sold fuels in FUELS order, marking the selected one', () => {
    const { c } = mount({
      station: makeStation({ prices: { diesel: 1.718, g95: 1.529, g98: 1.645 } }),
      selectedFuel: 'diesel',
    });
    const rows = Array.from(c.el.querySelectorAll('table.prices tr'));
    expect(rows).toHaveLength(3);
    const texts = rows.map((r) => (r.textContent ?? '').replace(/[ \t\n\r]+/g, ' ').trim());
    expect(texts[0]).toContain('Gasolina 95');
    expect(texts[0]).toContain('1,529 €/L');
    expect(texts[1]).toContain('Gasóleo A');
    expect(texts[1]).toContain('1,718 €/L');
    expect(texts[2]).toContain('Gasolina 98');
    expect(texts[2]).toContain('1,645 €/L');
    expect(rows[1]?.classList.contains('is-selected')).toBe(true);
    expect(rows[1]?.getAttribute('aria-current')).toBe('true');
    expect(rows[0]?.classList.contains('is-selected')).toBe(false);
    expect(rows[0]?.hasAttribute('aria-current')).toBe(false);
    expect(rows[2]?.classList.contains('is-selected')).toBe(false);
  });

  it('navigate links: ios puts Apple first', () => {
    const station = makeStation({ lat: 28.123639, lon: -16.739556 });
    const { c } = mount({ station, platform: 'ios' });
    const links = Array.from(c.el.querySelectorAll<HTMLAnchorElement>('a.nav-btn'));
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('href')).toBe(appleMapsUrl(station));
    expect(links[1]?.getAttribute('href')).toBe(googleMapsUrl(station));
    expect(links[0]?.textContent).toContain(S.navigateApple);
    expect(links[1]?.textContent).toContain(S.navigateGoogle);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('navigate links: other puts Google first', () => {
    const station = makeStation({ lat: 28.123639, lon: -16.739556 });
    const { c } = mount({ station, platform: 'other' });
    const links = Array.from(c.el.querySelectorAll<HTMLAnchorElement>('a.nav-btn'));
    expect(links[0]?.getAttribute('href')).toBe(googleMapsUrl(station));
    expect(links[1]?.getAttribute('href')).toBe(appleMapsUrl(station));
    expect(links[0]?.textContent).toContain(S.navigateGoogle);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('Back button calls onBack', () => {
    const { c, onBack } = mount();
    const back = Array.from(c.el.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(S.back),
    ) as HTMLButtonElement;
    expect(back.getAttribute('aria-label')).toBe(S.backToList);
    back.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the distance only when known', () => {
    const { c, props } = mount({ distanceKm: 3.44 });
    expect(c.el.textContent).toContain('3,4 km');
    c.update({ ...props, distanceKm: null });
    expect(c.el.textContent).not.toContain('3,4 km');
  });

  it('renders markup in API strings as text', () => {
    const { c } = mount({ station: makeStation({ brand: '<img src=x onerror=alert(1)>' }) });
    expect(c.el.querySelector('img')).toBeNull();
    expect(c.el.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  describe('markup details', () => {
    it('applies the specified class names', () => {
      const { c } = mount({ distanceKm: 2, station: makeStation({ brand: 'REPSOL', hours: 'L-V: 07:00-22:00' }) });
      expect(c.el.classList.contains('station-detail')).toBe(true);
      expect(c.el.querySelector('button.back-btn')?.textContent).toBe(S.back);
      expect(c.el.querySelector('h2.detail-title')?.textContent).toBe('REPSOL');
      expect(c.el.querySelector('address.detail-address')).not.toBeNull();
      expect(c.el.querySelector('p.detail-distance')?.textContent).toBe('2,0 km');
      expect(c.el.querySelector('p.detail-hours')?.textContent).toContain('L-V: 07:00-22:00');
      expect(c.el.querySelectorAll('div.nav-links > a.nav-btn')).toHaveLength(2);
      expect(c.el.querySelectorAll('div.nav-links > a.nav-btn--primary')).toHaveLength(1);
    });

    it('no distance paragraph when distance is null', () => {
      const { c } = mount({ distanceKm: null });
      expect(c.el.querySelector('.detail-distance')).toBeNull();
    });

    it('price rows use th scope=row for the label', () => {
      const { c } = mount();
      const th = c.el.querySelector('table.prices tr th');
      expect(th?.getAttribute('scope')).toBe('row');
      expect(th?.textContent).toBe('Gasolina 95');
    });

    it('open state badges', () => {
      const { c, props } = mount({ openState: 'open' });
      let open = c.el.querySelector('.detail-hours .badge.badge--open');
      expect(open?.textContent).toBe(S.open);
      expect(c.el.querySelector('.badge--closed')).toBeNull();

      c.update({ ...props, openState: 'closed' });
      expect(c.el.querySelector('.badge--open')).toBeNull();
      expect(c.el.querySelector('.detail-hours .badge.badge--closed')?.textContent).toBe(S.closed);

      c.update({ ...props, openState: 'unknown' });
      expect(c.el.querySelector('.badge')).toBeNull();
      expect(c.el.querySelector('.badge--open')).toBeNull();
      expect(c.el.querySelector('.badge--closed')).toBeNull();

      c.update({ ...props, station: makeStation({ hours: 'L-D: 24H' }), openState: 'unknown' });
      open = c.el.querySelector('.detail-hours .badge.badge--open');
      expect(open?.textContent).toBe(S.open24h);
      expect(c.el.querySelector('.badge--closed')).toBeNull();

      c.update({ ...props, station: makeStation({ hours: 'L-D: 24H' }), openState: 'closed' });
      expect(c.el.querySelector('.badge--open')?.textContent).toBe(S.open24h);
      expect(c.el.querySelector('.badge--closed')).toBeNull();
    });
  });

  it('renders no stray node in place of a null distance', () => {
    const { c } = mount({ distanceKm: null });
    const kids = Array.from(c.el.childNodes).filter((n) => !(n.nodeType === 3 && n.textContent === ''));
    expect(kids.every((n) => n.nodeType === 1)).toBe(true);
    expect(kids.map((n) => (n as Element).tagName.toLowerCase())).toEqual(['div', 'h2', 'address', 'p', 'table', 'div']);
    expect(c.el.querySelector('.detail-distance')).toBeNull();
  });

  describe('favorite star', () => {
    it('renders a fav-btn--detail inside div.detail-top next to the back button', () => {
      const { c } = mount();
      const top = c.el.querySelector('div.detail-top');
      expect(top).not.toBeNull();
      const back = top?.querySelector('button.back-btn');
      const fav = top?.querySelector('button.fav-btn.fav-btn--detail');
      expect(back).not.toBeNull();
      expect(fav).not.toBeNull();
      expect(fav?.parentElement).toBe(top);
      expect(back?.parentElement).toBe(top);
      expect(c.el.firstElementChild).toBe(top);
    });

    it('non-favorite station: star text, aria-pressed false and add label', () => {
      const { c } = mount({ isFavorite: false });
      const fav = c.el.querySelector('button.fav-btn--detail') as HTMLButtonElement;
      expect(fav.textContent).toBe('☆');
      expect(fav.getAttribute('aria-pressed')).toBe('false');
      expect(fav.getAttribute('aria-label')).toBe(S.favoriteAdd);
      expect(fav.getAttribute('type')).toBe('button');
    });

    it('favorite station: filled star, aria-pressed true and remove label', () => {
      const { c } = mount({ isFavorite: true });
      const fav = c.el.querySelector('button.fav-btn--detail') as HTMLButtonElement;
      expect(fav.textContent).toBe('★');
      expect(fav.getAttribute('aria-pressed')).toBe('true');
      expect(fav.getAttribute('aria-label')).toBe(S.favoriteRemove);
    });

    it('click calls onToggleFavorite with the station id once and not onBack', () => {
      const station = makeStation({ id: 'st-42' });
      const { c, onBack, onToggleFavorite } = mount({ station });
      const fav = c.el.querySelector('button.fav-btn--detail') as HTMLButtonElement;
      fav.click();
      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
      expect(onToggleFavorite).toHaveBeenCalledWith('st-42');
      expect(onBack).not.toHaveBeenCalled();
    });

    it('update with isFavorite true then false flips text and aria state', () => {
      const { c, props } = mount({ isFavorite: false });
      const fav = (): HTMLButtonElement => c.el.querySelector('button.fav-btn--detail') as HTMLButtonElement;
      expect(fav().textContent).toBe('☆');
      expect(fav().getAttribute('aria-pressed')).toBe('false');

      c.update({ ...props, isFavorite: true });
      expect(fav().textContent).toBe('★');
      expect(fav().getAttribute('aria-pressed')).toBe('true');
      expect(fav().getAttribute('aria-label')).toBe(S.favoriteRemove);

      c.update({ ...props, isFavorite: false });
      expect(fav().textContent).toBe('☆');
      expect(fav().getAttribute('aria-pressed')).toBe('false');
      expect(fav().getAttribute('aria-label')).toBe(S.favoriteAdd);
    });
  });
});
