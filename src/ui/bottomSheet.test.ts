import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createBottomSheet, nextSnapOnTap, resolveSnap } from './bottomSheet';
import { S } from './strings';

describe('resolveSnap', () => {
  it.each([
    ['peek', -80, 0, 'half'],
    ['half', -80, 0, 'full'],
    ['full', -80, 0, 'full'],
    ['full', 80, 0, 'half'],
    ['peek', 80, 0, 'peek'],
    ['half', 59, 0, 'half'],
    ['half', 60, 0, 'peek'],
    ['half', 10, 0.8, 'peek'],
    ['half', -10, -0.8, 'full'],
    ['peek', 100, -0.8, 'half'],
    ['half', 10, 0.5, 'half'],
    ['half', 10, 0.51, 'peek'],
    ['half', -10, -0.5, 'half'],
    ['half', -10, -0.51, 'full'],
    ['half', -59, 0, 'half'],
    ['half', -60, 0, 'full'],
    ['half', 0, 0, 'half'],
    ['full', 0, 0.6, 'half'],
  ] as const)('resolveSnap(%s, %d, %d) -> %s', (start, dy, v, expected) => {
    expect(resolveSnap(start, dy, v)).toBe(expected);
  });
});

describe('nextSnapOnTap', () => {
  it('cycles peek -> half -> full -> peek', () => {
    expect(nextSnapOnTap('peek')).toBe('half');
    expect(nextSnapOnTap('half')).toBe('full');
    expect(nextSnapOnTap('full')).toBe('peek');
  });
});

function setup() {
  const onSnapChange = vi.fn();
  const sheet = createBottomSheet({ onSnapChange });
  document.body.appendChild(sheet.el);
  const handle = sheet.el.querySelector('.sheet__handle') as HTMLElement;
  return { sheet, onSnapChange, handle };
}

function ptr(type: string, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientY, clientX: 10, bubbles: true, cancelable: true });
}

describe('createBottomSheet', () => {
  it('update sets snap class, removes the previous one, and aria-expanded', () => {
    const { sheet, handle } = setup();
    sheet.update({ snap: 'peek' });
    expect(sheet.el.classList.contains('sheet')).toBe(true);
    expect(sheet.el.classList.contains('sheet--peek')).toBe(true);
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    sheet.update({ snap: 'half' });
    expect(sheet.el.classList.contains('sheet--half')).toBe(true);
    expect(sheet.el.classList.contains('sheet--peek')).toBe(false);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    sheet.update({ snap: 'full' });
    expect(sheet.el.classList.contains('sheet--full')).toBe(true);
    expect(sheet.el.classList.contains('sheet--half')).toBe(false);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
  });

  it('has accessible labels', () => {
    const { sheet, handle } = setup();
    expect(sheet.el.getAttribute('aria-label')).toBe(S.sheetLabel);
    expect(handle.getAttribute('aria-label')).toBe(S.sheetHandle);
  });

  it('clicking the handle calls onSnapChange with nextSnapOnTap(current)', () => {
    const { sheet, onSnapChange, handle } = setup();
    sheet.update({ snap: 'peek' });
    handle.click();
    expect(onSnapChange).toHaveBeenLastCalledWith('half');
    sheet.update({ snap: 'half' });
    handle.click();
    expect(onSnapChange).toHaveBeenLastCalledWith('full');
    sheet.update({ snap: 'full' });
    handle.click();
    expect(onSnapChange).toHaveBeenLastCalledWith('peek');
    expect(onSnapChange).toHaveBeenCalledTimes(3);
  });

  it('dragging the header up resolves to half from peek, with is-dragging during the move', () => {
    const { sheet, onSnapChange, handle } = setup();
    sheet.update({ snap: 'peek' });
    handle.dispatchEvent(ptr('pointerdown', 500));
    handle.dispatchEvent(ptr('pointermove', 420));
    expect(sheet.el.classList.contains('is-dragging')).toBe(true);
    handle.dispatchEvent(ptr('pointerup', 420));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });

  it('a pointer gesture with under 6px movement is a tap', () => {
    const { sheet, onSnapChange, handle } = setup();
    sheet.update({ snap: 'half' });
    handle.dispatchEvent(ptr('pointerdown', 500));
    handle.dispatchEvent(ptr('pointerup', 502));
    expect(onSnapChange).toHaveBeenCalledWith('full');
  });

  it('body is a .sheet__body element inside el', () => {
    const { sheet } = setup();
    expect(sheet.body.classList.contains('sheet__body')).toBe(true);
    expect(sheet.el.contains(sheet.body)).toBe(true);
    expect(sheet.body).not.toBe(sheet.el);
  });
});

function pe(type: string, clientY: number, timeStamp?: number, pointerId?: number): MouseEvent {
  const e = ptr(type, clientY);
  if (timeStamp !== undefined) Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  if (pointerId !== undefined) Object.defineProperty(e, 'pointerId', { value: pointerId });
  return e;
}

describe('createBottomSheet gestures', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('has the header, handle and grabber structure', () => {
    const { sheet, handle } = setup();
    const header = sheet.el.querySelector('.sheet__header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.contains(handle)).toBe(true);
    expect(handle.tagName).toBe('BUTTON');
    expect(handle.getAttribute('type')).toBe('button');
    const grabber = handle.querySelector('.sheet__grabber') as HTMLElement;
    expect(grabber).not.toBeNull();
    expect(grabber.getAttribute('aria-hidden')).toBe('true');
  });

  it('live drag sets the exact transform per snap and clears it on pointerup', () => {
    const { sheet, handle } = setup();
    const expected = {
      peek: 'translateY(calc(100% - var(--sheet-peek) + 30px))',
      half: 'translateY(calc(50% + 30px))',
      full: 'translateY(calc(30px))',
    } as const;
    for (const snap of ['peek', 'half', 'full'] as const) {
      sheet.update({ snap });
      handle.dispatchEvent(pe('pointerdown', 500, 1000));
      handle.dispatchEvent(pe('pointermove', 530, 1100));
      expect(sheet.el.style.transform).toBe(expected[snap]);
      handle.dispatchEvent(pe('pointerup', 470, 1100));
      expect(sheet.el.style.transform).toBe('');
      expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    }
  });

  it('a downward drag uses a positive dy in the transform', () => {
    const { sheet, handle } = setup();
    sheet.update({ snap: 'half' });
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 540, 1100));
    expect(sheet.el.style.transform).toBe('translateY(calc(50% + 40px))');
  });

  it('moves under 6px do not drag; exactly 6px does', () => {
    const { sheet, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 495, 1010));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(sheet.el.style.transform).toBe('');
    handle.dispatchEvent(pe('pointermove', 494, 1020));
    expect(sheet.el.classList.contains('is-dragging')).toBe(true);
    expect(sheet.el.style.transform).toContain('-6px');
  });

  it('once moved, going back under the tap distance keeps updating the transform', () => {
    const { sheet, handle } = setup();
    sheet.update({ snap: 'half' });
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 520, 1010));
    handle.dispatchEvent(pe('pointermove', 503, 1020));
    expect(sheet.el.style.transform).toBe('translateY(calc(50% + 3px))');
  });

  it('moved is reset on each new pointerdown', () => {
    const { sheet, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 450, 1010));
    handle.dispatchEvent(pe('pointerup', 450, 1020));
    handle.dispatchEvent(pe('pointerdown', 500, 2000));
    handle.dispatchEvent(pe('pointermove', 503, 2010));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(sheet.el.style.transform).toBe('');
  });

  it('ignores pointermove and pointerup without a pointerdown', () => {
    const { sheet, onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointermove', 400, 1000));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(sheet.el.style.transform).toBe('');
    handle.dispatchEvent(pe('pointerup', 400, 1010));
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it('after pointerup further move/up events are ignored', () => {
    const { sheet, onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 420, 1100));
    handle.dispatchEvent(pe('pointerup', 420, 1100));
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    handle.dispatchEvent(pe('pointermove', 300, 1200));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(sheet.el.style.transform).toBe('');
    handle.dispatchEvent(pe('pointerup', 300, 1300));
    expect(onSnapChange).toHaveBeenCalledTimes(1);
  });

  it('pointercancel clears the drag state and transform without snapping', () => {
    const { sheet, onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 450, 1100));
    expect(sheet.el.style.transform).not.toBe('');
    handle.dispatchEvent(pe('pointercancel', 450, 1100));
    expect(sheet.el.classList.contains('is-dragging')).toBe(false);
    expect(sheet.el.style.transform).toBe('');
    handle.dispatchEvent(pe('pointermove', 400, 1200));
    expect(sheet.el.style.transform).toBe('');
    handle.dispatchEvent(pe('pointerup', 400, 1300));
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it('update() clears a leftover drag transform', () => {
    const { sheet, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 450, 1100));
    expect(sheet.el.style.transform).not.toBe('');
    sheet.update({ snap: 'half' });
    expect(sheet.el.style.transform).toBe('');
  });

  it('5px is a tap, 6px is a drag that keeps the snap', () => {
    const a = setup();
    a.sheet.update({ snap: 'half' });
    a.handle.dispatchEvent(pe('pointerdown', 500, 1000));
    a.handle.dispatchEvent(pe('pointerup', 505, 2000));
    expect(a.onSnapChange).toHaveBeenCalledWith('full');
    const b = setup();
    b.sheet.update({ snap: 'half' });
    b.handle.dispatchEvent(pe('pointerdown', 500, 1000));
    b.handle.dispatchEvent(pe('pointerup', 506, 2000));
    expect(b.onSnapChange).toHaveBeenCalledWith('half');
  });

  it('uses the velocity of the last moves, not the overall one', () => {
    const { sheet, onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 490, 1990));
    handle.dispatchEvent(pe('pointermove', 470, 2000));
    handle.dispatchEvent(pe('pointerup', 470, 2000));
    expect(onSnapChange).toHaveBeenCalledWith('half');
    expect(sheet.el.style.transform).toBe('');
  });

  it('a slow drag recorded through moves does not flick', () => {
    const { onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointermove', 490, 1500));
    handle.dispatchEvent(pe('pointermove', 480, 1500));
    handle.dispatchEvent(pe('pointerup', 480, 1500));
    expect(onSnapChange).toHaveBeenCalledWith('peek');
  });

  it('a downward flick from the moves goes to a smaller snap', () => {
    const { sheet, onSnapChange, handle } = setup();
    sheet.update({ snap: 'full' });
    handle.dispatchEvent(pe('pointerdown', 400, 1000));
    handle.dispatchEvent(pe('pointermove', 420, 1010));
    handle.dispatchEvent(pe('pointerup', 420, 1010));
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });

  it('falls back to the overall velocity when no move was recorded', () => {
    const { onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointerup', 470, 1040));
    expect(onSnapChange).toHaveBeenLastCalledWith('half');
    handle.dispatchEvent(pe('pointerdown', 500, 2000));
    handle.dispatchEvent(pe('pointerup', 470, 2100));
    expect(onSnapChange).toHaveBeenLastCalledWith('peek');
  });

  it('the overall fallback with identical timestamps gives zero velocity', () => {
    const { onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointerup', 470, 1000));
    expect(onSnapChange).toHaveBeenLastCalledWith('peek');
  });

  it('uses Date.now() when the event timeStamp is 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { onSnapChange, handle } = setup();
    handle.dispatchEvent(pe('pointerdown', 500, 0));
    vi.setSystemTime(1_000_040);
    handle.dispatchEvent(pe('pointerup', 470, 0));
    expect(onSnapChange).toHaveBeenLastCalledWith('half');

    handle.dispatchEvent(pe('pointerdown', 500, 0));
    vi.setSystemTime(1_000_200);
    handle.dispatchEvent(pe('pointermove', 490, 0));
    vi.setSystemTime(1_000_300);
    handle.dispatchEvent(pe('pointermove', 470, 0));
    handle.dispatchEvent(pe('pointerup', 470, 0));
    expect(onSnapChange).toHaveBeenLastCalledWith('peek');
  });

  it('suppresses the click within 400ms of a pointerup but not at 400ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
    const { sheet, onSnapChange, handle } = setup();
    sheet.update({ snap: 'peek' });
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    handle.dispatchEvent(pe('pointerup', 500, 1010));
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    vi.setSystemTime(5_000_399);
    handle.click();
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    vi.setSystemTime(5_000_400);
    handle.click();
    expect(onSnapChange).toHaveBeenCalledTimes(2);
    expect(onSnapChange).toHaveBeenLastCalledWith('half');
  });

  it('captures the pointer when supported and an id is present', () => {
    const { sheet, handle } = setup();
    const header = sheet.el.querySelector('.sheet__header') as HTMLElement;
    const cap = vi.fn();
    (header as unknown as { setPointerCapture: typeof cap }).setPointerCapture = cap;
    handle.dispatchEvent(pe('pointerdown', 500, 1000, 7));
    expect(cap).toHaveBeenCalledTimes(1);
    expect(cap).toHaveBeenCalledWith(7);
  });

  it('does not capture without a pointerId', () => {
    const { sheet, handle } = setup();
    const header = sheet.el.querySelector('.sheet__header') as HTMLElement;
    const cap = vi.fn();
    (header as unknown as { setPointerCapture: typeof cap }).setPointerCapture = cap;
    handle.dispatchEvent(pe('pointerdown', 500, 1000));
    expect(cap).not.toHaveBeenCalled();
  });

  it('survives setPointerCapture throwing', () => {
    const { sheet, onSnapChange, handle } = setup();
    const header = sheet.el.querySelector('.sheet__header') as HTMLElement;
    (header as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {
      throw new Error('nope');
    };
    handle.dispatchEvent(pe('pointerdown', 500, 1000, 3));
    handle.dispatchEvent(pe('pointermove', 420, 1100));
    handle.dispatchEvent(pe('pointerup', 420, 1100));
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });
});

describe('coveredHeight', () => {
  const win = window as unknown as { matchMedia?: unknown };
  let hadMatchMedia = false;
  let originalMatchMedia: unknown;
  let queries: string[] = [];

  function stubMatchMedia(matches: boolean): void {
    queries = [];
    win.matchMedia = (q: string) => {
      queries.push(q);
      return { matches, media: q };
    };
  }

  function sheetWithHeight(h: number) {
    const { sheet } = setup();
    vi.spyOn(sheet.el, 'offsetHeight', 'get').mockReturnValue(h);
    return sheet;
  }

  beforeEach(() => {
    hadMatchMedia = 'matchMedia' in window;
    originalMatchMedia = win.matchMedia;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (hadMatchMedia) win.matchMedia = originalMatchMedia;
    else delete win.matchMedia;
    document.body.innerHTML = '';
  });

  it('on a narrow viewport: peek 148, half and full are half of offsetHeight', () => {
    stubMatchMedia(false);
    const sheet = sheetWithHeight(800);
    expect(sheet.coveredHeight('peek')).toBe(148);
    expect(sheet.coveredHeight('half')).toBe(400);
    expect(sheet.coveredHeight('full')).toBe(400);
    expect(queries).toContain('(min-width: 768px)');
  });

  it('uses the current offsetHeight on each call', () => {
    stubMatchMedia(false);
    const { sheet } = setup();
    const spy = vi.spyOn(sheet.el, 'offsetHeight', 'get');
    spy.mockReturnValue(600);
    expect(sheet.coveredHeight('half')).toBe(300);
    spy.mockReturnValue(500);
    expect(sheet.coveredHeight('half')).toBe(250);
  });

  it('on a wide viewport (min-width: 768px matches) every snap is 0', () => {
    stubMatchMedia(true);
    const sheet = sheetWithHeight(800);
    expect(sheet.coveredHeight('peek')).toBe(0);
    expect(sheet.coveredHeight('half')).toBe(0);
    expect(sheet.coveredHeight('full')).toBe(0);
    expect(queries).toContain('(min-width: 768px)');
  });

  it('without matchMedia it counts as narrow', () => {
    delete win.matchMedia;
    const sheet = sheetWithHeight(800);
    expect(sheet.coveredHeight('peek')).toBe(148);
    expect(sheet.coveredHeight('half')).toBe(400);
    expect(sheet.coveredHeight('full')).toBe(400);
  });
});
