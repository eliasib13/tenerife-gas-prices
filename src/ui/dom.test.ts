import { describe, it, expect } from 'vitest';
import { h } from './dom';

describe('h', () => {
  it('sets class, attributes, boolean attributes and text children', () => {
    const el = h('button', { class: 'chip', 'aria-pressed': 'true', disabled: true }, 'Hi');
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('chip');
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.getAttribute('disabled')).toBe('');
    expect(el.textContent).toBe('Hi');
  });

  it('omits false, null and undefined attributes and children', () => {
    const el = h(
      'div',
      { a: false, b: null, c: undefined, d: 'x', n: 3 },
      null,
      undefined,
      false,
      'ok',
    );
    expect(el.hasAttribute('a')).toBe(false);
    expect(el.hasAttribute('b')).toBe(false);
    expect(el.hasAttribute('c')).toBe(false);
    expect(el.getAttribute('d')).toBe('x');
    expect(el.getAttribute('n')).toBe('3');
    expect(el.childNodes.length).toBe(1);
    expect(el.textContent).toBe('ok');
  });

  it('appends Node children', () => {
    const child = h('span', {}, 'in');
    const el = h('div', undefined, child, 'after');
    expect(el.firstChild).toBe(child);
    expect(el.childNodes.length).toBe(2);
  });

  it('keeps HTML in string children as text', () => {
    const el = h('div', {}, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.children.length).toBe(0);
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('throws for on* attributes', () => {
    expect(() => h('div', { onclick: 'x' })).toThrow();
  });
});
