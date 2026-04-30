/**
 * Tree editor UI module.
 *
 * renderTree(container, root) — builds the interactive nested list from the
 * in-memory tree and attaches all event handlers.
 *
 * Subscribes to 'tree-changed' and 'project-loaded' to keep the view in sync.
 */

import { on, emit } from '../events.js';
import {
  getType,
  addChild,
  removeNode,
  renameNode,
  moveUp,
  moveDown,
  setOmvang,
  setVoortgang,
  Knoop,
} from '../model/tree.js';
import { validateNaam } from '../model/validation.js';
import { getRoot, setRoot } from '../model/project.js';
import { showError, confirmDelete } from './dialogs.js';
import { t } from '../i18n.js';

// The container element provided by the caller.
let _container = null;

/**
 * Initialise the tree editor.
 * Must be called once on DOMContentLoaded.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;

  on('tree-changed', () => renderTree(_container, getRoot()));
  on('project-loaded', () => renderTree(_container, getRoot()));
  on('language-changed', () => renderTree(_container, getRoot()));
}

/**
 * Render the full tree into the given container element.
 * @param {HTMLElement} container
 * @param {Knoop | null} root
 */
export function renderTree(container, root) {
  container.innerHTML = '';

  if (!root) {
    renderEmptyState(container);
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'tree__root';
  ul.appendChild(buildNodeElement(root));
  container.appendChild(ul);
}

// ── Empty state ──────────────────────────────────────────────────────────────

function renderEmptyState(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree__empty';

  const msg = document.createElement('p');
  msg.textContent = t('tree.empty.message');

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary';
  btn.textContent = t('tree.empty.button');
  btn.addEventListener('click', () => handleCreateDoel(container));

  wrapper.appendChild(msg);
  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}

function handleCreateDoel(container) {
  const naam = prompt(t('tree.prompt.createGoal'));
  if (naam === null) return; // user cancelled

  const result = validateNaam(naam);
  if (!result.valid) {
    showError(result.error);
    return;
  }

  const root = new Knoop(naam.trim(), null);
  setRoot(root);
  // Emit tree-changed so the toolbar and tree editor re-render.
  emit('tree-changed', { action: 'createRoot', node: root });
}

// ── Node element builder ─────────────────────────────────────────────────────

/**
 * Recursively build a <li> element for the given node and all its descendants.
 * @param {Knoop} node
 * @returns {HTMLLIElement}
 */
function buildNodeElement(node) {
  const type = getType(node);
  const isActiviteit = type === 'Activiteit';
  const isFirst = isFirstSibling(node);
  const isLast = isLastSibling(node);

  const li = document.createElement('li');
  li.className = 'tree__node';
  li.dataset.nodeId = node.id;
  if (isActiviteit && node.omvang === null) {
    li.classList.add('tree__node--incomplete');
  }

  // ── Node row ───────────────────────────────────────────────────────────────
  const row = document.createElement('div');
  row.className = 'tree__node-row';

  // Main line: dot + name + badge + actions
  const mainLine = document.createElement('div');
  mainLine.className = 'tree__node-row-main';

  // Incomplete indicator dot
  if (isActiviteit && node.omvang === null) {
    const dot = document.createElement('span');
    dot.className = 'tree__incomplete-dot';
    dot.title = t('tree.tooltip.omvangNotSet');
    mainLine.appendChild(dot);
  }

  // Name span (click to edit inline)
  const nameSpan = document.createElement('span');
  nameSpan.className = 'tree__node-name';
  nameSpan.textContent = node.naam;
  nameSpan.title = t('tree.tooltip.clickToRename');
  nameSpan.addEventListener('click', () => startInlineEdit(nameSpan, node));
  mainLine.appendChild(nameSpan);

  // Type badge
  const badge = document.createElement('span');
  badge.className = `tree__badge tree__badge--${type.toLowerCase()}`;
  badge.textContent = t(`type.${type.toLowerCase()}`);
  mainLine.appendChild(badge);

  // Action buttons
  mainLine.appendChild(buildActionButtons(node, isFirst, isLast, type));

  row.appendChild(mainLine);

  // Second line: omvang + percentage inputs (Activiteiten only)
  if (isActiviteit) {
    const fieldsLine = document.createElement('div');
    fieldsLine.className = 'tree__node-row-fields';
    fieldsLine.appendChild(buildOmvangInput(node));
    fieldsLine.appendChild(buildPercentageInput(node));
    row.appendChild(fieldsLine);
  }

  li.appendChild(row);

  // Children list
  if (node.kinderen.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'tree__children';
    for (const child of node.kinderen) {
      ul.appendChild(buildNodeElement(child));
    }
    li.appendChild(ul);
  }

  return li;
}

// ── Inline editing ───────────────────────────────────────────────────────────

function startInlineEdit(nameSpan, node) {
  const originalName = node.naam;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree__inline-edit';
  input.value = originalName;
  input.maxLength = 200;

  // Replace the span with the input
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;

    const newName = input.value;
    try {
      renameNode(node, newName);
      // tree-changed will trigger a full re-render
    } catch (e) {
      showError(e.message);
      // Restore the span without triggering re-render
      input.replaceWith(nameSpan);
    }
  }

  function cancel() {
    if (committed) return;
    committed = true;
    input.replaceWith(nameSpan);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', commit);
}

// ── Omvang / percentage inputs ───────────────────────────────────────────────

function buildOmvangInput(node) {
  const wrapper = document.createElement('label');
  wrapper.className = 'tree__field-label';
  wrapper.textContent = t('tree.field.omvang');

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tree__number-input';
  input.min = '1';
  input.step = '1';
  input.placeholder = '–';
  input.title = t('tree.tooltip.omvang');
  if (node.omvang !== null) input.value = String(node.omvang);

  input.addEventListener('change', () => {
    const raw = input.value.trim();
    if (raw === '') {
      // User cleared the field — reset to no omvang.
      node.omvang = null;
      emit('tree-changed', { action: 'clearOmvang', node });
      return;
    }
    try {
      setOmvang(node, raw);
    } catch (e) {
      showError(e.message);
      // Revert the input to the last valid value.
      input.value = node.omvang !== null ? String(node.omvang) : '';
    }
  });

  wrapper.appendChild(input);
  return wrapper;
}

function buildPercentageInput(node) {
  const wrapper = document.createElement('label');
  wrapper.className = 'tree__field-label';
  wrapper.textContent = t('tree.field.voortgang');

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tree__number-input';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(node.voortgangspercentage);
  input.title = t('tree.tooltip.voortgang');

  input.addEventListener('change', () => {
    try {
      setVoortgang(node, input.value.trim());
    } catch (e) {
      showError(e.message);
      input.value = String(node.voortgangspercentage);
    }
  });

  wrapper.appendChild(input);

  const pct = document.createElement('span');
  pct.textContent = '%';
  wrapper.appendChild(pct);

  return wrapper;
}

// ── Action buttons ───────────────────────────────────────────────────────────

function buildActionButtons(node, isFirst, isLast, type) {
  const group = document.createElement('div');
  group.className = 'tree__actions';

  // Add child button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--icon';
  addBtn.textContent = '+';
  addBtn.title = t('tree.action.addChild');
  addBtn.addEventListener('click', () => handleAddChild(node));
  group.appendChild(addBtn);

  // Move up button
  const upBtn = document.createElement('button');
  upBtn.className = 'btn btn--icon';
  upBtn.textContent = '↑';
  upBtn.title = t('tree.action.moveUp');
  upBtn.disabled = isFirst || type === 'Doel';
  upBtn.addEventListener('click', () => moveUp(node));
  group.appendChild(upBtn);

  // Move down button
  const downBtn = document.createElement('button');
  downBtn.className = 'btn btn--icon';
  downBtn.textContent = '↓';
  downBtn.title = t('tree.action.moveDown');
  downBtn.disabled = isLast || type === 'Doel';
  downBtn.addEventListener('click', () => moveDown(node));
  group.appendChild(downBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn--icon btn--danger';
  delBtn.textContent = '×';
  delBtn.title = t('tree.action.delete');
  delBtn.addEventListener('click', () => handleDelete(node));
  group.appendChild(delBtn);

  return group;
}

// ── Action handlers ──────────────────────────────────────────────────────────

function handleAddChild(parent) {
  const naam = prompt(t('tree.prompt.createChild'));
  if (naam === null) return; // user cancelled
  try {
    addChild(parent, naam.trim());
  } catch (e) {
    showError(e.message);
  }
}

async function handleDelete(node) {
  const hasChildren = node.kinderen.length > 0;
  const confirmed = await confirmDelete(node.naam, hasChildren);
  if (!confirmed) return;

  const isRoot = node.parent === null;
  removeNode(node);

  if (isRoot) {
    // The root was removed; clear project root and trigger re-render.
    setRoot(null);
    emit('tree-changed', { action: 'rootRemoved' });
  }
}

// ── Sibling position helpers ─────────────────────────────────────────────────

function isFirstSibling(node) {
  if (!node.parent) return true;
  return node.parent.kinderen[0] === node;
}

function isLastSibling(node) {
  if (!node.parent) return true;
  const siblings = node.parent.kinderen;
  return siblings[siblings.length - 1] === node;
}
