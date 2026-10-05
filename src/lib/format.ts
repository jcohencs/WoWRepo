const MINUS = '−';

const amountFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function amount(n: number | null | undefined): string {
  return n == null ? '—' : amountFmt.format(n);
}

export function integer(n: number | null | undefined): string {
  return n == null ? '—' : intFmt.format(n);
}

/** Compact totals: 1.24M, 812K. */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return intFmt.format(n);
}

export function signedPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null) return '—';
  const v = fraction * 100;
  if (Math.abs(v) < 0.05) return `0.${'0'.repeat(digits)}%`;
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}%`;
}

export function signed(n: number, digits = 1): string {
  if (Math.abs(n) < 10 ** -digits / 2) return (0).toFixed(digits);
  return `${n > 0 ? '+' : MINUS}${Math.abs(n).toFixed(digits)}`;
}

export function percent(fraction: number | null | undefined, digits = 1): string {
  return fraction == null ? '—' : `${(fraction * 100).toFixed(digits)}%`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Warcraft Logs shows parses floored to an integer. */
export function parse(p: number | null | undefined): string {
  return p == null ? '—' : String(Math.floor(p));
}

/** Standard Warcraft Logs parse colour tiers. */
export function parseTier(p: number | null | undefined): string {
  if (p == null) return 'none';
  if (p >= 100) return 'gold';
  if (p >= 99) return 'pink';
  if (p >= 95) return 'orange';
  if (p >= 75) return 'purple';
  if (p >= 50) return 'blue';
  if (p >= 25) return 'green';
  return 'grey';
}

export const CLASS_COLORS: Record<string, string> = {
  Druid: '#FF7C0A',
  Hunter: '#AAD372',
  Mage: '#3FC7EB',
  Paladin: '#F48CBA',
  Priest: '#FFFFFF',
  Rogue: '#FFF468',
  Shaman: '#0070DD',
  Warlock: '#8788EE',
  Warrior: '#C69B6D',
};

export function specLabel(spec: string): string {
  return spec.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function metricLabel(metric: 'dps' | 'hps'): string {
  return metric.toUpperCase();
}

/** "12% behind" / "4% ahead" — easier to read than a signed percentage. */
export function gapText(fraction: number | null | undefined): string {
  if (fraction == null) return '—';
  const v = Math.abs(fraction * 100);
  if (v < 0.5) return 'Even';
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}% ${fraction > 0 ? 'ahead' : 'behind'}`;
}
