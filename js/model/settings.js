/**
 * Application settings store.
 *
 * Holds chart generation options: colour scheme, percentage visibility and
 * optional size indicators.
 * Settings are in-memory only and reset to defaults on page reload.
 */

/** @typedef {{ omvang: number, label: string }} SizeIndicator */
/** @typedef {{ fill: string, bg: string, border: string, text?: string }} ColorPalette */
/** @typedef {{ showPercentage: boolean, colorScheme: string, customColor: string, showSizeIndicators: boolean, sizeIndicators: SizeIndicator[] }} Settings */

export const CUSTOM_COLOR_SCHEME = 'aangepast';
export const DEFAULT_CUSTOM_COLOR = '#2563EB';

/**
 * Color palettes keyed by scheme name.
 * Each palette has a `fill` (progress fill) and `bg` (box background) colour.
 * The two colours must provide sufficient contrast to distinguish filled vs unfilled area.
 */
export const COLOR_SCHEMES = {
  blauw:  { fill: '#2563EB', bg: '#DBEAFE', border: '#93C5FD' },
  rood:   { fill: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
  groen:  { fill: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
  oranje: { fill: '#EA580C', bg: '#FED7AA', border: '#FDBA74' },
  paars:  { fill: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
};

export const COLOR_SCHEME_KEYS = [...Object.keys(COLOR_SCHEMES), CUSTOM_COLOR_SCHEME];

const DEFAULT_COLOR_SCHEME = 'blauw';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const MIN_TEXT_CONTRAST_ON_WHITE = 3;

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  showPercentage: true,
  colorScheme: DEFAULT_COLOR_SCHEME,
  customColor: DEFAULT_CUSTOM_COLOR,
  showSizeIndicators: false,
  sizeIndicators: [],
};

/** @type {Settings} */
const _settings = createDefaultSettings();

const MAX_SIZE_INDICATOR_LABEL_LENGTH = 80;

/**
 * Return a shallow copy of the current settings.
 * @returns {Settings}
 */
export function getSettings() {
  return {
    ..._settings,
    sizeIndicators: copySizeIndicators(_settings.sizeIndicators),
  };
}

/**
 * Merge a partial settings object into the store.
 * @param {Partial<Settings>} patch
 */
export function updateSettings(patch) {
  if (!patch || typeof patch !== 'object') return;

  if ('showPercentage' in patch) {
    _settings.showPercentage = Boolean(patch.showPercentage);
  }
  if ('colorScheme' in patch) {
    _settings.colorScheme = normalizeColorScheme(patch.colorScheme);
  }
  if ('customColor' in patch) {
    _settings.customColor = normalizeCustomColor(patch.customColor);
  }
  if ('showSizeIndicators' in patch) {
    _settings.showSizeIndicators = Boolean(patch.showSizeIndicators);
  }
  if ('sizeIndicators' in patch) {
    _settings.sizeIndicators = normalizeSizeIndicators(patch.sizeIndicators);
  }
}

/**
 * Reset all application settings to their defaults.
 */
export function resetSettings() {
  Object.assign(_settings, createDefaultSettings());
}

/**
 * Return a sanitized copy of a size indicator list.
 * Invalid or incomplete indicators are omitted.
 * @param {*} raw
 * @returns {SizeIndicator[]}
 */
export function normalizeSizeIndicators(raw) {
  if (!Array.isArray(raw)) return [];

  const indicators = [];
  for (const item of raw) {
    const indicator = normalizeSizeIndicator(item);
    if (indicator) indicators.push(indicator);
  }
  return indicators;
}

/**
 * @param {*} raw
 * @returns {SizeIndicator | null}
 */
export function normalizeSizeIndicator(raw) {
  if (typeof raw !== 'object' || raw === null) return null;

  const omvang = Number(raw.omvang);
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';

  if (!Number.isInteger(omvang) || omvang < 1) return null;
  if (label.length < 1 || label.length > MAX_SIZE_INDICATOR_LABEL_LENGTH) return null;

  return { omvang, label };
}

/**
 * Resolve the palette used by the chart renderer.
 * @param {Partial<Settings>} settings
 * @returns {ColorPalette}
 */
export function getColorPalette(settings = {}) {
  const colorScheme = normalizeColorScheme(settings.colorScheme);
  if (colorScheme === CUSTOM_COLOR_SCHEME) {
    return createCustomPalette(settings.customColor);
  }

  return COLOR_SCHEMES[colorScheme] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME];
}

/**
 * @param {*} raw
 * @returns {string}
 */
export function normalizeColorScheme(raw) {
  return COLOR_SCHEME_KEYS.includes(raw) ? raw : DEFAULT_COLOR_SCHEME;
}

/**
 * @param {*} raw
 * @returns {string}
 */
export function normalizeCustomColor(raw) {
  if (typeof raw !== 'string') return DEFAULT_CUSTOM_COLOR;
  const value = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : DEFAULT_CUSTOM_COLOR;
}

/**
 * @param {*} raw
 * @returns {ColorPalette}
 */
function createCustomPalette(raw) {
  const fill = normalizeCustomColor(raw);
  return {
    fill,
    bg: mixHex(fill, WHITE, 0.84),
    border: mixHex(fill, WHITE, 0.56),
    text: ensureReadableOnWhite(fill),
  };
}

/**
 * @param {SizeIndicator[]} indicators
 * @returns {SizeIndicator[]}
 */
function copySizeIndicators(indicators) {
  return indicators.map(indicator => ({ ...indicator }));
}

/**
 * @returns {Settings}
 */
function createDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS,
    sizeIndicators: [],
  };
}

/**
 * @param {string} hex
 * @param {string} target
 * @param {number} amount
 * @returns {string}
 */
function mixHex(hex, target, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  });
}

/**
 * @param {string} hex
 * @returns {string}
 */
function ensureReadableOnWhite(hex) {
  let rgb = hexToRgb(hex);
  const white = hexToRgb(WHITE);
  const black = hexToRgb(BLACK);

  for (let i = 0; i < 16 && contrastRatio(rgb, white) < MIN_TEXT_CONTRAST_ON_WHITE; i++) {
    rgb = mixRgb(rgb, black, 0.12);
  }

  return rgbToHex(rgb);
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const value = normalizeCustomColor(hex).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 * @param {number} amount
 * @returns {{ r: number, g: number, b: number }}
 */
function mixRgb(a, b, amount) {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  };
}

/**
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {string}
 */
function rgbToHex(rgb) {
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function toHex(value) {
  return Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 * @returns {number}
 */
function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number}
 */
function relativeLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
