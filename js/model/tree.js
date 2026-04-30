/**
 * Knoop class and tree mutation operations.
 *
 * Type derivation (never stored, always computed):
 *   parent === null           → Doel
 *   kinderen.length === 0     → Activiteit
 *   otherwise                 → Subdoel
 */

import { emit } from '../events.js';
import { validateNaam, validateOmvang, validatePercentage } from './validation.js';
import { t } from '../i18n.js';

export class Knoop {
  constructor(naam, parent = null) {
    this.id = crypto.randomUUID();
    this.naam = naam;
    this.parent = parent;
    this.kinderen = [];
    this.omvang = null;
    this.voortgangspercentage = 0;
  }
}

/**
 * Derive the type of a node from its position in the tree.
 * @param {Knoop} node
 * @returns {'Doel' | 'Subdoel' | 'Activiteit'}
 */
export function getType(node) {
  if (node.parent === null) return 'Doel';
  if (node.kinderen.length === 0) return 'Activiteit';
  return 'Subdoel';
}

/**
 * Add a child node to the given parent.
 * If the parent was an Activiteit (leaf), it becomes a Subdoel, and its
 * omvang/voortgangspercentage are cleared per FEAT-002 FR-006.
 *
 * @param {Knoop} parent
 * @param {string} naam
 * @returns {Knoop} the newly created child node
 * @throws {Error} if naam is invalid
 */
export function addChild(parent, naam) {
  const validation = validateNaam(naam);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // If the parent was a leaf (Activiteit), it will become a Subdoel.
  // Clear its Activiteit-only data.
  const wasLeaf = parent.kinderen.length === 0;
  if (wasLeaf) {
    parent.omvang = null;
    parent.voortgangspercentage = 0;
  }

  const child = new Knoop(naam, parent);
  parent.kinderen.push(child);

  emit('tree-changed', { action: 'addChild', parent, child });
  return child;
}

/**
 * Remove a node and all its descendants from the tree.
 * If removing the node causes the parent to become a leaf (Subdoel → Activiteit),
 * the parent's omvang/voortgangspercentage are cleared per FEAT-002 FR-007.
 *
 * @param {Knoop} node
 */
export function removeNode(node) {
  const parent = node.parent;

  if (parent === null) {
    // Removing the root — the tree becomes empty.
    // The caller (project.js) must set root to null after this.
    emit('tree-changed', { action: 'removeRoot', node });
    return;
  }

  const index = parent.kinderen.indexOf(node);
  if (index === -1) return;

  parent.kinderen.splice(index, 1);

  // If the parent now has no children it has become an Activiteit; clear its data.
  if (parent.kinderen.length === 0) {
    parent.omvang = null;
    parent.voortgangspercentage = 0;
  }

  emit('tree-changed', { action: 'removeNode', parent, node });
}

/**
 * Rename a node to the given new name.
 *
 * @param {Knoop} node
 * @param {string} newNaam
 * @throws {Error} if newNaam is invalid
 */
export function renameNode(node, newNaam) {
  const validation = validateNaam(newNaam);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  node.naam = newNaam.trim();
  emit('tree-changed', { action: 'renameNode', node });
}

/**
 * Move a node one position up among its siblings.
 * No-op if the node is already the first sibling.
 *
 * @param {Knoop} node
 */
export function moveUp(node) {
  if (!node.parent) return;
  const siblings = node.parent.kinderen;
  const index = siblings.indexOf(node);
  if (index <= 0) return;
  siblings.splice(index, 1);
  siblings.splice(index - 1, 0, node);
  emit('tree-changed', { action: 'moveUp', node });
}

/**
 * Move a node one position down among its siblings.
 * No-op if the node is already the last sibling.
 *
 * @param {Knoop} node
 */
export function moveDown(node) {
  if (!node.parent) return;
  const siblings = node.parent.kinderen;
  const index = siblings.indexOf(node);
  if (index === -1 || index >= siblings.length - 1) return;
  siblings.splice(index, 1);
  siblings.splice(index + 1, 0, node);
  emit('tree-changed', { action: 'moveDown', node });
}

/**
 * Set the omvang of a node. Only valid on Activiteiten.
 *
 * @param {Knoop} node
 * @param {string | number} value
 * @throws {Error} if invalid or node is not an Activiteit
 */
export function setOmvang(node, value) {
  if (getType(node) !== 'Activiteit') {
    throw new Error(t('validation.omvang.onlyActiviteit'));
  }
  const validation = validateOmvang(value);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  node.omvang = Number(value);
  emit('tree-changed', { action: 'setOmvang', node });
}

/**
 * Set the voortgangspercentage of a node. Only valid on Activiteiten.
 *
 * @param {Knoop} node
 * @param {string | number} value
 * @throws {Error} if invalid or node is not an Activiteit
 */
export function setVoortgang(node, value) {
  if (getType(node) !== 'Activiteit') {
    throw new Error(t('validation.voortgang.onlyActiviteit'));
  }
  const validation = validatePercentage(value);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  node.voortgangspercentage = Number(value);
  emit('tree-changed', { action: 'setVoortgang', node });
}
