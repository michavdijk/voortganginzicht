/**
 * Input validation helpers shared across the application.
 * Each function returns { valid: boolean, error: string | null }.
 */

import { t } from '../i18n.js';

/**
 * Validate a node name: must be 1-200 non-blank characters.
 * @param {string} value
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateNaam(value) {
  if (typeof value !== 'string') {
    return { valid: false, error: t('validation.name.mustBeString') };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: t('validation.name.notEmpty') };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: t('validation.name.tooLong') };
  }
  return { valid: true, error: null };
}

/**
 * Validate an omvang value: must be an integer >= 1.
 * Accepts numbers or numeric strings.
 * @param {string | number} value
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateOmvang(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { valid: false, error: t('validation.omvang.mustBeInt') };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: t('validation.omvang.noDecimals') };
  }
  if (num < 1) {
    return { valid: false, error: t('validation.omvang.min') };
  }
  return { valid: true, error: null };
}

/**
 * Validate a voortgangspercentage value: must be an integer in [0, 100].
 * Accepts numbers or numeric strings.
 * @param {string | number} value
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validatePercentage(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { valid: false, error: t('validation.percentage.mustBeInt') };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: t('validation.percentage.noDecimals') };
  }
  if (num < 0 || num > 100) {
    return { valid: false, error: t('validation.percentage.range') };
  }
  return { valid: true, error: null };
}
