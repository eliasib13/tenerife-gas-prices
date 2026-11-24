// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerSW';

describe('registerServiceWorker', () => {
  it('resolves null and does not call register when isProd is false', async () => {
    const register = vi.fn();
    const nav = { serviceWorker: { register } } as unknown as Navigator;

    const result = await registerServiceWorker(nav, false);

    expect(result).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('resolves null when the navigator has no serviceWorker', async () => {
    const nav = {} as unknown as Navigator;

    const result = await registerServiceWorker(nav, true);

    expect(result).toBeNull();
  });

  it('registers ./sw.js with scope ./ in prod and returns the registration', async () => {
    const registration = { scope: './' } as unknown as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    const nav = { serviceWorker: { register } } as unknown as Navigator;

    const result = await registerServiceWorker(nav, true);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './' });
    expect(result).toBe(registration);
  });

  it('catches a rejected register, warns once and resolves null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(new Error('boom'));
    const nav = { serviceWorker: { register } } as unknown as Navigator;

    const result = await registerServiceWorker(nav, true);

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe('Service worker registration failed');
    expect(warn.mock.calls[0]![1]).toBeInstanceOf(Error);
    warn.mockRestore();
  });
});
