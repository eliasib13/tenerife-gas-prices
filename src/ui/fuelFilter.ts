import type { Component, FuelDef, FuelId } from '../types';
import { h } from './dom';
import { S } from './strings';
import './fuelFilter.css';

interface Props { fuels: FuelDef[]; selected: FuelId; }

export function createFuelFilter(handlers: { onSelect(f: FuelId): void }): Component<Props> {
  const el = h('nav', { class: 'fuel-filter', 'aria-label': S.fuelFilterLabel });
  let key = '';
  let buttons: HTMLButtonElement[] = [];

  function update(props: Props): void {
    const newKey = JSON.stringify(props.fuels.map((f) => [f.id, f.shortLabel, f.label]));
    if (newKey !== key) {
      key = newKey;
      buttons = props.fuels.map((f) => {
        const b = h('button', { class: 'chip', type: 'button', title: f.label, 'aria-pressed': 'false' }, f.shortLabel);
        b.addEventListener('click', () => handlers.onSelect(f.id));
        return b;
      });
      el.replaceChildren(...buttons);
    }
    let selectedBtn: HTMLButtonElement | undefined;
    props.fuels.forEach((f, i) => {
      const b = buttons[i]!;
      const pressed = f.id === props.selected;
      const v = pressed ? 'true' : 'false';
      if (b.getAttribute('aria-pressed') !== v) b.setAttribute('aria-pressed', v);
      if (pressed) selectedBtn = b;
    });
    if (selectedBtn && typeof selectedBtn.scrollIntoView === 'function') {
      selectedBtn.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }

  return { el, update };
}
