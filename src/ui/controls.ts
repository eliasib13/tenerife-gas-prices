import type { AppState, Component, FetchErrorKind, GeoStatus } from '../types';
import { formatRelative, formatWhen } from '../domain/time';
import { h } from './dom';
import { S } from './strings';
import './controls.css';

export interface ControlsProps {
  status: AppState['status'];
  refreshing: boolean;
  lastError: FetchErrorKind | null;
  online: boolean;
  sourceDate: Date | null;
  fetchedAt: Date | null;
  now: Date;
  geoStatus: GeoStatus;
  hasStations: boolean;
  dataSource: AppState['dataSource'];
  notice: string | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(paths: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export function createControls(handlers: { onRefresh(): void; onLocate(): void }): Component<ControlsProps> {
  const locateBtn = h('button', { class: 'ctrl-btn', type: 'button', 'aria-label': S.locate, title: S.locate });
  locateBtn.appendChild(icon(['M12 2v4', 'M12 18v4', 'M2 12h4', 'M18 12h4', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z']));
  locateBtn.addEventListener('click', () => handlers.onLocate());

  const refreshBtn = h('button', { class: 'ctrl-btn', type: 'button', 'aria-label': S.refresh, title: S.refresh });
  refreshBtn.appendChild(icon(['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6']));
  refreshBtn.addEventListener('click', () => handlers.onRefresh());

  const buttons = h('div', { class: 'controls__buttons' }, locateBtn, refreshBtn);
  const pill = h('div', { class: 'updated', hidden: true });
  const banner = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite', hidden: true });
  const el = h('div', { class: 'controls' }, banner, pill, buttons);

  function update(p: ControlsProps): void {
    locateBtn.disabled = p.geoStatus === 'unsupported';
    locateBtn.classList.toggle('ctrl-btn--off', p.geoStatus === 'denied');

    refreshBtn.disabled = p.refreshing;
    refreshBtn.classList.toggle('is-spinning', p.refreshing);
    if (p.refreshing) refreshBtn.setAttribute('aria-busy', 'true');
    else refreshBtn.removeAttribute('aria-busy');

    const whenDate = p.sourceDate ?? p.fetchedAt;
    const when = whenDate ? formatWhen(whenDate, p.now) : '';

    if (p.fetchedAt) {
      pill.textContent = S.updated(when, formatRelative(p.fetchedAt, p.now));
      pill.hidden = false;
    } else {
      pill.textContent = '';
      pill.hidden = true;
    }

    let text: string | null = null;
    let retry = false;
    let stale = false;
    if (p.notice) text = p.notice;
    else if (!p.online && p.hasStations) text = S.offlineWithData(when);
    else if (!p.online) text = S.offlineNoData;
    else if (p.lastError && p.hasStations) {
      text = S.staleData(S.errorText(p.lastError), when);
      retry = true;
    } else if (p.dataSource === 'cache' && p.hasStations) {
      text = p.refreshing ? S.cachedLoading(when) : S.cachedData(when);
      stale = true;
    }

    banner.classList.toggle('banner--stale', stale);
    if (text === null) {
      banner.replaceChildren();
      banner.hidden = true;
      return;
    }
    const nodes: Node[] = [document.createTextNode(text)];
    if (retry) {
      const b = h('button', { class: 'banner__retry', type: 'button' }, S.retry);
      b.addEventListener('click', () => handlers.onRefresh());
      nodes.push(b);
    }
    banner.replaceChildren(...nodes);
    banner.hidden = false;
  }

  return { el, update };
}
