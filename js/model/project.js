/**
 * Project state module.
 *
 * Holds the mutable project state: the tree root and the dirty flag.
 * Listens to project-mutating events to automatically mark the project dirty.
 */

import { on, emit } from '../events.js';

let root = null;
let dirty = false;

// Automatically mark project dirty whenever the tree changes.
on('tree-changed', () => {
  dirty = true;
});

on('settings-changed', () => {
  dirty = true;
});

/** @returns {import('./tree.js').Knoop | null} */
export function getRoot() {
  return root;
}

/** @param {import('./tree.js').Knoop | null} node */
export function setRoot(node) {
  root = node;
}

/** @returns {boolean} */
export function isDirty() {
  return dirty;
}

export function markDirty() {
  dirty = true;
}

export function markClean() {
  dirty = false;
}

/**
 * Reset to an empty project state and emit 'project-loaded'.
 */
export function newProject() {
  root = null;
  dirty = false;
  emit('project-loaded', null);
}
