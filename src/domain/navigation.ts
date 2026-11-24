import type { LatLon } from '../types';

// Navigation deep links and platform detection. Pure: the UA string and touch points are passed in.

export function googleMapsUrl(p: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&travelmode=driving`;
}

export function appleMapsUrl(p: LatLon): string {
  return `https://maps.apple.com/?daddr=${p.lat.toFixed(6)},${p.lon.toFixed(6)}&dirflg=d`;
}

export function detectPlatform(ua: string, maxTouchPoints = 0): 'ios' | 'other' {
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'ios';
  }
  // iPadOS 13+ reports a desktop Macintosh UA; touch points distinguish it from a real Mac.
  if (ua.includes('Macintosh') && maxTouchPoints > 1) {
    return 'ios';
  }
  return 'other';
}
