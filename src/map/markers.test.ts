import { describe, it, expect } from 'vitest';
import { createMarkerElement } from './markers';
import type { MarkerViewModel } from '../types';

function vm(over: Partial<MarkerViewModel> = {}): MarkerViewModel {
  return { id: 'a', lat: 28.1, lon: -16.7, label: '1,529', tier: 'cheap', selected: false, cheapest: true, ...over };
}

describe('createMarkerElement', () => {
  it('builds a pin with tier and cheapest classes, text, role and aria-label', () => {
    const el = createMarkerElement(vm());
    expect(el.classList.contains('price-pin')).toBe(true);
    expect(el.classList.contains('price-pin--cheap')).toBe(true);
    expect(el.classList.contains('price-pin--cheapest')).toBe(true);
    expect(el.classList.contains('price-pin--selected')).toBe(false);
    expect(el.textContent).toBe('1,529');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('1,529 €/L');
  });

  it('adds price-pin--selected when selected', () => {
    const el = createMarkerElement(vm({ selected: true, cheapest: false, tier: 'expensive' }));
    expect(el.classList.contains('price-pin--selected')).toBe(true);
    expect(el.classList.contains('price-pin--cheapest')).toBe(false);
    expect(el.classList.contains('price-pin--expensive')).toBe(true);
    expect(el.classList.contains('price-pin--cheap')).toBe(false);
  });

  it('renders a hostile label as text only', () => {
    const label = '<img src=x onerror=alert(1)>';
    const el = createMarkerElement(vm({ label }));
    expect(el.querySelector('img')).toBeNull();
    expect(el.children.length).toBe(0);
    expect(el.textContent).toBe(label);
  });
});
