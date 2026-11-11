const PRESET_COLORS: Record<string, string> = {
  blue: '#1d4ee2',
  rose: '#be1241',
  green: '#0c891b',
  orange: '#cc4902',
  purple: '#9333ea'
};

const DEFAULT_BRAND = '#1d4ee2';

/** Maps an organization theme preset or hex to the color used by the inbox. */
export function brandColor(theme: string | null | undefined) {
  if (!theme) return DEFAULT_BRAND;

  if (theme.startsWith('#')) return theme;

  return PRESET_COLORS[theme] ?? DEFAULT_BRAND;
}
