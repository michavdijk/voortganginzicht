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
  moveLevelUp,
  moveLevelDown,
  setOmvang,
  setActueleBesteding,
  setVoortgang,
  Knoop,
} from '../model/tree.js';
import { validateNaam } from '../model/validation.js';
import { getRoot, setRoot } from '../model/project.js';
import { getSettings } from '../model/settings.js';
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

  on('tree-changed', handleTreeChanged);
  on('project-loaded', () => renderTree(_container, getRoot()));
  on('settings-changed', () => renderTree(_container, getRoot()));
  on('language-changed', () => renderTree(_container, getRoot()));
}

function handleTreeChanged(event) {
  if (event && ['setOmvang', 'clearOmvang', 'setActueleBesteding', 'clearActueleBesteding', 'setVoortgang'].includes(event.action)) {
    syncActivityFieldChange(event.node);
    return;
  }

  renderTree(_container, getRoot());
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

  // Main line: status icon + name + badge + actions
  const mainLine = document.createElement('div');
  mainLine.className = 'tree__node-row-main';

  // Incomplete indicator
  if (isActiviteit && node.omvang === null) {
    mainLine.appendChild(buildIncompleteIcon());
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

  // Second line: omvang + optional actual spending + percentage inputs (Activiteiten only)
  if (isActiviteit) {
    const fieldsLine = document.createElement('div');
    fieldsLine.className = 'tree__node-row-fields';
    fieldsLine.appendChild(buildOmvangInput(node));
    if (getSettings().showActualSpending) {
      fieldsLine.appendChild(buildActueleBestedingInput(node));
    }
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
  placeCursorAtEnd(input);

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
  const { wrapper, error } = buildFieldShell(t('tree.field.omvang'), node, 'omvang');

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tree__number-input';
  input.min = '1';
  input.step = '1';
  input.title = t('tree.tooltip.omvang');
  input.setAttribute('aria-describedby', error.id);
  if (node.omvang !== null) input.value = String(node.omvang);

  let suppressNextChange = false;

  input.addEventListener('input', () => clearFieldError(input));

  input.addEventListener('keydown', (event) => {
    if (!shouldHandleTabCommit(event) || !hasOmvangInputChanged(input, node)) return;

    event.preventDefault();
    const nextFocusTarget = getTabTarget(input, event.shiftKey);
    if (!commitOmvangInput(input, node)) return;

    if (nextFocusTarget) {
      suppressNextChange = true;
      focusTabTarget(nextFocusTarget);
    } else {
      input.blur();
    }
  });

  input.addEventListener('change', () => {
    if (suppressNextChange) {
      suppressNextChange = false;
      return;
    }

    commitOmvangInput(input, node);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(error);
  return wrapper;
}

function buildActueleBestedingInput(node) {
  const { wrapper, error } = buildFieldShell(t('tree.field.actualSpending'), node, 'actual-spending');
  wrapper.classList.add('tree__field-label--actual-spending');

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tree__number-input';
  input.min = '0';
  input.step = '1';
  input.title = t('tree.tooltip.actualSpending');
  input.setAttribute('aria-describedby', error.id);
  if (node.actueleBesteding !== null && node.actueleBesteding !== undefined) {
    input.value = String(node.actueleBesteding);
  }

  let suppressNextChange = false;

  input.addEventListener('input', () => clearFieldError(input));

  input.addEventListener('keydown', (event) => {
    if (!shouldHandleTabCommit(event) || !hasActueleBestedingInputChanged(input, node)) return;

    event.preventDefault();
    const nextFocusTarget = getTabTarget(input, event.shiftKey);
    if (!commitActueleBestedingInput(input, node)) return;

    if (nextFocusTarget) {
      suppressNextChange = true;
      focusTabTarget(nextFocusTarget);
    } else {
      input.blur();
    }
  });

  input.addEventListener('change', () => {
    if (suppressNextChange) {
      suppressNextChange = false;
      return;
    }

    commitActueleBestedingInput(input, node);
  });

  wrapper.appendChild(input);
  wrapper.appendChild(error);
  return wrapper;
}

function buildPercentageInput(node) {
  const { wrapper, error } = buildFieldShell(t('tree.field.voortgang'), node, 'voortgang');

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'tree__number-input';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = formatVoortgangInputValue(node);
  input.title = t('tree.tooltip.voortgang');
  input.setAttribute('aria-describedby', error.id);

  let suppressNextChange = false;

  input.addEventListener('input', () => clearFieldError(input));

  input.addEventListener('keydown', (event) => {
    if (!shouldHandleTabCommit(event) || !hasPercentageInputChanged(input, node)) return;

    event.preventDefault();
    const nextFocusTarget = getTabTarget(input, event.shiftKey);
    if (!commitPercentageInput(input, node)) return;

    if (nextFocusTarget) {
      suppressNextChange = true;
      focusTabTarget(nextFocusTarget);
    } else {
      input.blur();
    }
  });

  input.addEventListener('change', () => {
    if (suppressNextChange) {
      suppressNextChange = false;
      return;
    }

    commitPercentageInput(input, node);
  });

  wrapper.appendChild(input);

  const pct = document.createElement('span');
  pct.textContent = '%';
  wrapper.appendChild(pct);
  wrapper.appendChild(error);

  return wrapper;
}

function commitOmvangInput(input, node) {
  if (input.validity.badInput) {
    setFieldError(input, t('validation.omvang.mustBeInt'));
    return false;
  }

  const raw = input.value.trim();

  if (raw === '') {
    // User cleared the field — reset to no omvang.
    node.omvang = null;
    clearFieldError(input);
    emit('tree-changed', { action: 'clearOmvang', node });
    return true;
  }

  try {
    setOmvang(node, raw);
    input.value = node.omvang !== null ? String(node.omvang) : '';
    clearFieldError(input);
    return true;
  } catch (e) {
    setFieldError(input, e.message);
    return false;
  }
}

function commitActueleBestedingInput(input, node) {
  if (input.validity.badInput) {
    setFieldError(input, t('validation.actualSpending.mustBeInt'));
    return false;
  }

  const raw = input.value.trim();

  if (raw === '') {
    node.actueleBesteding = null;
    clearFieldError(input);
    emit('tree-changed', { action: 'clearActueleBesteding', node });
    return true;
  }

  try {
    setActueleBesteding(node, raw);
    input.value = formatActueleBestedingInputValue(node);
    clearFieldError(input);
    return true;
  } catch (e) {
    setFieldError(input, e.message);
    return false;
  }
}

function commitPercentageInput(input, node) {
  if (input.validity.badInput) {
    setFieldError(input, t('validation.percentage.mustBeInt'));
    return false;
  }

  try {
    setVoortgang(node, input.value.trim());
    input.value = formatVoortgangInputValue(node);
    clearFieldError(input);
    return true;
  } catch (e) {
    setFieldError(input, e.message);
    return false;
  }
}

function hasOmvangInputChanged(input, node) {
  const currentValue = node.omvang !== null ? String(node.omvang) : '';
  return input.validity.badInput || input.value.trim() !== currentValue;
}

function hasActueleBestedingInputChanged(input, node) {
  return input.validity.badInput || input.value.trim() !== formatActueleBestedingInputValue(node);
}

function hasPercentageInputChanged(input, node) {
  return input.validity.badInput || input.value.trim() !== formatVoortgangInputValue(node);
}

function formatActueleBestedingInputValue(node) {
  return node.actueleBesteding === null || node.actueleBesteding === undefined
    ? ''
    : String(node.actueleBesteding);
}

function formatVoortgangInputValue(node) {
  return node.voortgangspercentage === null ? '' : String(node.voortgangspercentage);
}

function buildFieldShell(labelText, node, fieldName) {
  const wrapper = document.createElement('label');
  wrapper.className = 'tree__field-label';

  const label = document.createElement('span');
  label.className = 'tree__field-label-text';
  label.textContent = labelText;
  wrapper.appendChild(label);

  const error = document.createElement('span');
  error.id = `tree-field-error-${node.id}-${fieldName}`;
  error.className = 'tree__field-error';
  error.setAttribute('aria-live', 'polite');
  error.hidden = true;

  return { wrapper, error };
}

function buildIncompleteIcon() {
  const icon = document.createElement('span');
  const label = t('tree.tooltip.omvangNotSet');
  icon.className = 'tree__incomplete-icon';
  icon.title = label;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', label);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 3 22 20H2L12 3Z');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '12');
  line.setAttribute('y1', '9');
  line.setAttribute('x2', '12');
  line.setAttribute('y2', '14');

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '17');
  dot.setAttribute('r', '1');

  svg.append(path, line, dot);
  icon.appendChild(svg);
  return icon;
}

function setFieldError(input, message) {
  const field = input.closest('.tree__field-label');
  const error = field?.querySelector('.tree__field-error');
  if (!field || !error) {
    showError(message);
    return;
  }

  input.setAttribute('aria-invalid', 'true');
  field.classList.add('tree__field-label--error');
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(input) {
  const field = input.closest('.tree__field-label');
  const error = field?.querySelector('.tree__field-error');
  if (!field || !error) return;

  input.removeAttribute('aria-invalid');
  field.classList.remove('tree__field-label--error');
  error.textContent = '';
  error.hidden = true;
}

function shouldHandleTabCommit(event) {
  return event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function getTabTarget(current, reverse) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const focusable = Array.from(document.querySelectorAll(selector))
    .filter(el => el instanceof HTMLElement && isVisibleFocusable(el));
  const index = focusable.indexOf(current);
  if (index === -1) return null;

  return focusable[index + (reverse ? -1 : 1)] || null;
}

function isVisibleFocusable(el) {
  return el.tabIndex >= 0 && el.getClientRects().length > 0;
}

function focusTabTarget(target) {
  const focus = () => {
    if (target.isConnected) target.focus();
  };

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(focus);
  } else {
    setTimeout(focus, 0);
  }
}

function placeCursorAtEnd(input) {
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

function syncActivityFieldChange(node) {
  if (!_container || !node) return;

  const item = Array.from(_container.querySelectorAll('.tree__node'))
    .find(el => el.dataset.nodeId === node.id);
  if (!item) {
    renderTree(_container, getRoot());
    return;
  }

  const isIncomplete = getType(node) === 'Activiteit' && node.omvang === null;
  item.classList.toggle('tree__node--incomplete', isIncomplete);

  const row = item.firstElementChild;
  const mainLine = row?.querySelector('.tree__node-row-main');
  if (!mainLine) return;

  let icon = mainLine.querySelector('.tree__incomplete-icon');
  if (isIncomplete && !icon) {
    icon = buildIncompleteIcon();
    mainLine.prepend(icon);
  } else if (!isIncomplete && icon) {
    icon.remove();
  } else if (icon) {
    const label = t('tree.tooltip.omvangNotSet');
    icon.title = label;
    icon.setAttribute('aria-label', label);
  }

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

  // Move one level up button
  const levelUpBtn = document.createElement('button');
  levelUpBtn.className = 'btn btn--icon';
  levelUpBtn.textContent = '←';
  levelUpBtn.title = t('tree.action.moveLevelUp');
  levelUpBtn.disabled = !canMoveLevelUp(node);
  levelUpBtn.addEventListener('click', () => moveLevelUp(node));
  group.appendChild(levelUpBtn);

  // Move one level down button
  const levelDownBtn = document.createElement('button');
  levelDownBtn.className = 'btn btn--icon';
  levelDownBtn.textContent = '→';
  levelDownBtn.title = t('tree.action.moveLevelDown');
  levelDownBtn.disabled = !canMoveLevelDown(node);
  levelDownBtn.addEventListener('click', () => moveLevelDown(node));
  group.appendChild(levelDownBtn);

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

function canMoveLevelUp(node) {
  return Boolean(node.parent?.parent);
}

function canMoveLevelDown(node) {
  if (!node.parent) return false;
  return node.parent.kinderen.indexOf(node) > 0;
}
