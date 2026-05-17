/**
 * Weighted progress calculation module.
 *
 * Provides recursive calculation of weighted voortgang, effective omvang,
 * effective actual spending and spending status for any node in the
 * work-breakdown tree.
 */

import { getType } from '../model/tree.js';

export const PROJECT_SPENDING_STATUS = Object.freeze({
  CONFORM: 'conform',
  MORE: 'more',
  LESS: 'less',
});

const PROJECT_STATUS_THRESHOLD = 0.1;

/**
 * Calculate the weighted voortgangspercentage for a node.
 *
 * - Activiteit (leaf): returns node.voortgangspercentage, or 0 if left empty.
 * - Branch (Doel/Subdoel): weighted average of children, where each child's
 *   weight is its effectiveOmvang (total Activiteit omvang in its subtree).
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {number} a value in [0, 100]
 */
export function calcWeightedProgress(node) {
  if (getType(node) === 'Activiteit') {
    return node.voortgangspercentage ?? 0;
  }

  // Branch node: weighted average over children.
  let totalWeight = 0;
  let weightedSum = 0;

  for (const child of node.kinderen) {
    const weight = calcEffectiveOmvang(child);
    weightedSum += weight * calcWeightedProgress(child);
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/**
 * Calculate the effective omvang for a node.
 *
 * - Activiteit (leaf): returns node.omvang (or 0 if unset).
 * - Branch: sum of all descendant Activiteiten omvang values.
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {number}
 */
export function calcEffectiveOmvang(node) {
  if (getType(node) === 'Activiteit') {
    return node.omvang ?? 0;
  }
  let total = 0;
  for (const child of node.kinderen) {
    total += calcEffectiveOmvang(child);
  }
  return total;
}

/**
 * Calculate the effective actual spending for a node.
 *
 * - Activiteit (leaf): returns node.actueleBesteding, or 0 when unset.
 * - Branch: sum of all descendant Activiteiten actual spending values.
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {number}
 */
export function calcEffectiveActualSpending(node) {
  if (getType(node) === 'Activiteit') {
    return Number.isFinite(node.actueleBesteding) ? node.actueleBesteding : 0;
  }

  let total = 0;
  for (const child of node.kinderen) {
    total += calcEffectiveActualSpending(child);
  }
  return total;
}

/**
 * Determine how actual spending compares with expected spending for a node.
 *
 * Expected spending is based on effective size and weighted progress:
 *   expected = size * (progress / 100)
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {'conform' | 'more' | 'less'}
 */
export function calcProjectSpendingStatus(node) {
  const plannedSize = calcEffectiveOmvang(node);
  const progressFraction = calcWeightedProgress(node) / 100;
  const expectedSpending = plannedSize * progressFraction;
  const actualSpending = calcEffectiveActualSpending(node);

  if (expectedSpending <= 0) {
    return actualSpending > 0
      ? PROJECT_SPENDING_STATUS.MORE
      : PROJECT_SPENDING_STATUS.CONFORM;
  }

  const deviation = (actualSpending - expectedSpending) / expectedSpending;
  if (deviation > PROJECT_STATUS_THRESHOLD) return PROJECT_SPENDING_STATUS.MORE;
  if (deviation < -PROJECT_STATUS_THRESHOLD) return PROJECT_SPENDING_STATUS.LESS;
  return PROJECT_SPENDING_STATUS.CONFORM;
}

/**
 * Flatten all leaf nodes (Activiteiten) from the subtree rooted at node.
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {import('../model/tree.js').Knoop[]}
 */
export function getAllActiviteiten(node) {
  if (getType(node) === 'Activiteit') {
    return [node];
  }
  const result = [];
  for (const child of node.kinderen) {
    result.push(...getAllActiviteiten(child));
  }
  return result;
}
