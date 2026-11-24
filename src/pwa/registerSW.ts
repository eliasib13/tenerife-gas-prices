export function registerServiceWorker(
  nav: Navigator = navigator,
  isProd: boolean = import.meta.env.PROD,
): Promise<ServiceWorkerRegistration | null> {
  if (!isProd || !('serviceWorker' in nav)) return Promise.resolve(null);
  return nav.serviceWorker.register('./sw.js', { scope: './' }).catch((err: unknown) => {
    console.warn('Service worker registration failed', err);
    return null;
  });
}
