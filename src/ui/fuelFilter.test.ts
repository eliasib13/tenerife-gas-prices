import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFuelFilter } from './fuelFilter';
import { S } from './strings';
import type { FuelDef } from '../types';

const three = (): FuelDef[] => [
  { id: 'g95', apiField: 'Precio Gasolina 95 E5', label: 'Gasolina 95', shortLabel: '95' },
  { id: 'diesel', apiField: 'Precio Gasoleo A', label: 'Gasóleo A', shortLabel: 'Diésel' },
  { id: 'g98', apiField: 'Precio Gasolina 98 E5', label: 'Gasolina 98', shortLabel: '98' },
];

function buttons(el: HTMLElement): HTMLButtonElement[] {
  return Array.from(el.querySelectorAll('button'));
}

describe('createFuelFilter', () => {
  it('renders one chip per fuel in order with pressed state, short text and full title', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: three(), selected: 'diesel' });
    const b = buttons(c.el);
    expect(b.length).toBe(3);
    expect(b.map((x) => x.textContent)).toEqual(three().map((f) => f.shortLabel));
    expect(b.map((x) => x.title)).toEqual(three().map((f) => f.label));
    expect(b.map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(b.every((x) => x.classList.contains('chip'))).toBe(true);
  });

  it('calls onSelect with the clicked fuel once', () => {
    const onSelect = vi.fn();
    const c = createFuelFilter({ onSelect });
    c.update({ fuels: three(), selected: 'g95' });
    buttons(c.el)[2]!.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('g98');
  });

  it('does not replace nodes on identical props and updates aria-pressed on change', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    const fuels = three();
    c.update({ fuels, selected: 'g95' });
    const before = buttons(c.el);
    c.update({ fuels: three(), selected: 'g95' });
    const same = buttons(c.el);
    expect(same.length).toBe(3);
    same.forEach((n, i) => expect(n).toBe(before[i]));
    c.update({ fuels, selected: 'g98' });
    expect(buttons(c.el).map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('root is a nav labelled with S.fuelFilterLabel', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    expect(c.el.tagName).toBe('NAV');
    expect(c.el.classList.contains('fuel-filter')).toBe(true);
    expect(c.el.getAttribute('aria-label')).toBe(S.fuelFilterLabel);
    expect(S.fuelFilterLabel).toBe('Tipo de combustible');
  });

  describe('scrolling and re-render', () => {
    const proto = Element.prototype as unknown as { scrollIntoView?: unknown };
    const had = Object.prototype.hasOwnProperty.call(proto, 'scrollIntoView');
    const orig = proto.scrollIntoView;
    afterEach(() => {
      if (had) proto.scrollIntoView = orig;
      else delete proto.scrollIntoView;
    });

    it('scrolls the selected chip into view with center/nearest', () => {
      const spy = vi.fn();
      proto.scrollIntoView = spy;
      const c = createFuelFilter({ onSelect: vi.fn() });
      c.update({ fuels: three(), selected: 'diesel' });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ inline: 'center', block: 'nearest' });
      expect(spy.mock.contexts[0]).toBe(buttons(c.el)[1]);
      c.update({ fuels: three(), selected: 'g98' });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.contexts[1]).toBe(buttons(c.el)[2]);
    });

    it('does not scroll or throw when nothing is selected', () => {
      const spy = vi.fn();
      proto.scrollIntoView = spy;
      const c = createFuelFilter({ onSelect: vi.fn() });
      c.update({ fuels: three(), selected: 'e10' as never });
      expect(spy).not.toHaveBeenCalled();
      expect(buttons(c.el).map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    });

    it('does not throw when scrollIntoView is unavailable', () => {
      delete proto.scrollIntoView;
      const c = createFuelFilter({ onSelect: vi.fn() });
      expect(() => c.update({ fuels: three(), selected: 'g95' })).not.toThrow();
    });
  });

  it('re-renders when a label or short label changes but ids stay the same', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: three(), selected: 'g95' });
    const before = buttons(c.el);
    const changed = three();
    changed[1] = { ...changed[1]!, label: 'Diésel A', shortLabel: 'D' };
    c.update({ fuels: changed, selected: 'g95' });
    const after = buttons(c.el);
    expect(after.length).toBe(3);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]!.textContent).toBe('D');
    expect(after[1]!.title).toBe('Diésel A');
  });

  it('re-renders when only the short label changes', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: three(), selected: 'g95' });
    const changed = three();
    changed[0] = { ...changed[0]!, shortLabel: '95+' };
    c.update({ fuels: changed, selected: 'g95' });
    expect(buttons(c.el)[0]!.textContent).toBe('95+');
  });

  it('a new selection only flips aria-pressed and keeps the same buttons', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: three(), selected: 'g95' });
    const before = buttons(c.el);
    c.update({ fuels: three(), selected: 'diesel' });
    const after = buttons(c.el);
    after.forEach((n, i) => expect(n).toBe(before[i]));
    expect(after.map((x) => x.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('chips are type=button with pressed=false initially for unselected and an empty list renders nothing', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: three(), selected: 'g95' });
    expect(buttons(c.el).every((x) => x.getAttribute('type') === 'button')).toBe(true);
    expect(buttons(c.el).every((x) => x.getAttribute('class') === 'chip')).toBe(true);
    c.update({ fuels: [], selected: 'g95' });
    expect(buttons(c.el).length).toBe(0);
  });

  it('first update with an empty list does not break and a later list renders', () => {
    const c = createFuelFilter({ onSelect: vi.fn() });
    c.update({ fuels: [], selected: 'g95' });
    expect(buttons(c.el).length).toBe(0);
    c.update({ fuels: three(), selected: 'g95' });
    expect(buttons(c.el).length).toBe(3);
  });
});
