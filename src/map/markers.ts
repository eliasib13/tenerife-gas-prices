import type { MarkerViewModel } from '../types';

export function createMarkerElement(vm: MarkerViewModel): HTMLElement {
  const el = document.createElement('div');
  el.className = `price-pin price-pin--${vm.tier}`;
  if (vm.selected) el.classList.add('price-pin--selected');
  if (vm.cheapest) el.classList.add('price-pin--cheapest');
  el.textContent = vm.label;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${vm.label} €/L`);
  return el;
}
