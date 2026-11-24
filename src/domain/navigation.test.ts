// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { googleMapsUrl, appleMapsUrl, detectPlatform } from './navigation';

const point = { lat: 28.123639, lon: -16.739556 };

describe('googleMapsUrl', () => {
  it('builds a driving directions URL with the destination coordinates', () => {
    expect(googleMapsUrl(point)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=28.123639,-16.739556&travelmode=driving',
    );
  });

  it('rounds coordinates to 6 decimals', () => {
    expect(googleMapsUrl({ lat: 28.1234567, lon: -16.739556 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=28.123457,-16.739556&travelmode=driving',
    );
  });
});

describe('appleMapsUrl', () => {
  it('builds a driving directions URL with the destination coordinates', () => {
    expect(appleMapsUrl(point)).toBe('https://maps.apple.com/?daddr=28.123639,-16.739556&dirflg=d');
  });

  it('rounds coordinates to 6 decimals', () => {
    expect(appleMapsUrl({ lat: 28.1234567, lon: -16.739556 })).toBe(
      'https://maps.apple.com/?daddr=28.123457,-16.739556&dirflg=d',
    );
  });
});

describe('detectPlatform', () => {
  it('returns ios for an iPhone user agent', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns ios for an iPad user agent', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns ios for a Macintosh user agent with touch points (iPadOS desktop mode)', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(detectPlatform(ua, 5)).toBe('ios');
  });

  it('returns other for a Macintosh user agent without touch points', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(detectPlatform(ua, 0)).toBe('other');
  });

  it('returns other for an Android user agent', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    expect(detectPlatform(ua)).toBe('other');
  });
});

describe('detectPlatform: touch point boundary', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  it('Macintosh with 1 touch point is other, with 2 is ios', () => {
    expect(detectPlatform(mac, 1)).toBe('other');
    expect(detectPlatform(mac, 2)).toBe('ios');
  });
  it('a non-Mac, non-iOS UA with many touch points is other', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    expect(detectPlatform(ua, 5)).toBe('other');
    expect(detectPlatform('', 5)).toBe('other');
  });
});
