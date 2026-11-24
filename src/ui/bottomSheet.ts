import type { Component, SheetSnap } from '../types';
import { h } from './dom';
import { S } from './strings';
import './bottomSheet.css';

const ORDER: SheetSnap[] = ['peek', 'half', 'full'];
const FLICK_VELOCITY = 0.5;
const STEP_DISTANCE = 60;
const TAP_DISTANCE = 6;

function step(start: SheetSnap, dir: 1 | -1): SheetSnap {
  // dir 1 = finger moved down = smaller sheet
  const i = ORDER.indexOf(start) - dir;
  return ORDER[Math.min(ORDER.length - 1, Math.max(0, i))]!;
}

export function resolveSnap(start: SheetSnap, deltaY: number, velocityY: number): SheetSnap {
  if (Math.abs(velocityY) > FLICK_VELOCITY) return step(start, velocityY > 0 ? 1 : -1);
  if (Math.abs(deltaY) >= STEP_DISTANCE) return step(start, deltaY > 0 ? 1 : -1);
  return start;
}

export function nextSnapOnTap(s: SheetSnap): SheetSnap {
  return s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek';
}

const BASE: Record<SheetSnap, string> = {
  peek: '100% - var(--sheet-peek)',
  half: '50%',
  full: '0px',
};

export function createBottomSheet(
  handlers: { onSnapChange(s: SheetSnap): void },
): Component<{ snap: SheetSnap }> & { body: HTMLElement } {
  const handle = h(
    'button',
    { class: 'sheet__handle', type: 'button', 'aria-label': S.sheetHandle, 'aria-expanded': 'false' },
    h('span', { class: 'sheet__grabber', 'aria-hidden': 'true' }),
  );
  const header = h('div', { class: 'sheet__header' }, handle);
  const body = h('div', { class: 'sheet__body' });
  const el = h('section', { class: 'sheet sheet--peek', 'aria-label': S.sheetLabel }, header, body);

  let snap: SheetSnap = 'peek';
  let startY = 0;
  let startT = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let down = false;
  let moved = false;
  let lastPointerUp = -Infinity;

  function clearDrag(): void {
    down = false;
    el.classList.remove('is-dragging');
    el.style.transform = '';
  }

  header.addEventListener('pointerdown', (e) => {
    down = true;
    moved = false;
    startY = lastY = e.clientY;
    startT = lastT = e.timeStamp || Date.now();
    velocity = 0;
    const pid = (e as PointerEvent).pointerId;
    try {
      if (typeof header.setPointerCapture === 'function' && pid !== undefined) header.setPointerCapture(pid);
    } catch {
      /* capture is best effort */
    }
  });

  header.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dy = e.clientY - startY;
    const t = e.timeStamp || Date.now();
    if (t > lastT) velocity = (e.clientY - lastY) / (t - lastT);
    lastY = e.clientY;
    lastT = t;
    if (!moved && Math.abs(dy) < TAP_DISTANCE) return;
    moved = true;
    el.classList.add('is-dragging');
    el.style.transform = `translateY(calc(${BASE[snap]} + ${dy}px))`;
  });

  header.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dy = e.clientY - startY;
    const t = e.timeStamp || Date.now();
    clearDrag();
    lastPointerUp = Date.now();
    if (Math.abs(dy) < TAP_DISTANCE) {
      handlers.onSnapChange(nextSnapOnTap(snap));
      return;
    }
    // Use overall velocity when the final move had none recorded.
    const v = velocity !== 0 ? velocity : t > startT ? dy / (t - startT) : 0;
    handlers.onSnapChange(resolveSnap(snap, dy, v));
  });

  header.addEventListener('pointercancel', clearDrag);

  handle.addEventListener('click', () => {
    // A pointer tap already handled the snap change; ignore its trailing click.
    if (Date.now() - lastPointerUp < 400) return;
    handlers.onSnapChange(nextSnapOnTap(snap));
  });

  function update(props: { snap: SheetSnap }): void {
    snap = props.snap;
    for (const s of ORDER) el.classList.toggle(`sheet--${s}`, s === snap);
    handle.setAttribute('aria-expanded', snap === 'peek' ? 'false' : 'true');
    el.style.transform = '';
  }

  update({ snap });
  return { el, update, body };
}
