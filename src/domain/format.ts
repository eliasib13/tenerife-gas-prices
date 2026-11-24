// Formatting helpers for prices and distances. Uses toFixed (not Intl.NumberFormat) so output is deterministic.

export function formatPriceShort(p: number): string {
  return p.toFixed(3).replace('.', ',');
}

export function formatPrice(p: number): string {
  return `${formatPriceShort(p)} €/L`;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round((km * 1000) / 10) * 10} m`;
  }
  if (km < 10) {
    const oneDecimal = km.toFixed(1);
    if (oneDecimal === '10.0') {
      return '10,0 km';
    }
    return `${oneDecimal.replace('.', ',')} km`;
  }
  return `${Math.round(km)} km`;
}
