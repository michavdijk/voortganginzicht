/**
 * Weighted progress calculation module.
 *
 * Provides recursive calculation of weighted voortgang and effective omvang
 * for any node in the work-breakdown tree.
 */

import { getType } from '../model/tree.js';

/**
 * Calculate the weighted voortgangspercentage for a node.
 *
 * - Activiteit (leaf): returns node.voortgangspercentage directly.
 * - Branch (Doel/Subdoel): weighted average of children, where each child's
 *   weight is its effectiveOmvang (total Activiteit omvang in its subtree).
 *
 * @param {import('../model/tree.js').Knoop} node
 * @returns {number} a value in [0, 100]
 */
export function calcWeightedProgress(node) {
  if (getType(node) === 'Activiteit') {
    return node.voortgangspercentage;
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
