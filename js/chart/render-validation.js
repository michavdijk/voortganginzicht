/**
 * Validation rules that decide whether the progress report can be rendered.
 */

import { getType } from '../model/tree.js';
import { t } from '../i18n.js';

/**
 * @typedef {{ key: string, params?: Record<string, string | number> }} ChartRenderIssue
 */

/**
 * Return true when the chart can be rendered for the given root and settings.
 *
 * @param {import('../model/tree.js').Knoop | null} root
 * @returns {boolean}
 */
export function canRenderChart(root) {
  return getChartRenderIssue(root) === null;
}

/**
 * Return the first issue that blocks chart rendering, or null when rendering is allowed.
 *
 * @param {import('../model/tree.js').Knoop | null} root
 * @returns {ChartRenderIssue | null}
 */
export function getChartRenderIssue(root) {
  if (!root) return { key: 'chart.placeholder.empty' };
  if (!hasAnyActiviteit(root)) return { key: 'chart.placeholder.noActivities' };

  const missingOmvangCount = countActiviteitenWithoutOmvang(root);
  if (missingOmvangCount === 1) return { key: 'chart.placeholder.missingOmvang.one' };
  if (missingOmvangCount > 1) {
    return {
      key: 'chart.placeholder.missingOmvang.many',
      params: { count: missingOmvangCount },
    };
  }

  return null;
}

/**
 * Format a render issue as a translated placeholder message.
 *
 * @param {ChartRenderIssue | null} issue
 * @returns {string}
 */
export function formatChartRenderIssue(issue) {
  return issue ? t(issue.key, issue.params ?? {}) : '';
}

function hasAnyActiviteit(node) {
  if (getType(node) === 'Activiteit') return true;
  return node.kinderen.some(hasAnyActiviteit);
}

function countActiviteitenWithoutOmvang(node) {
  if (getType(node) === 'Activiteit') return node.omvang === null ? 1 : 0;
  return node.kinderen.reduce((count, child) => count + countActiviteitenWithoutOmvang(child), 0);
}
