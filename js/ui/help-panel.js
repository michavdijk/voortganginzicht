/**
 * Help panel UI module.
 *
 * Provides one central help dialog that can be opened from global and
 * contextual help buttons.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';

const DEFAULT_SECTION = 'chart';
const HELP_SECTIONS = [
  'workStructure',
  'chart',
  'settings',
  'files',
];

let overlay = null;
let dialogTitle = null;
let closeButton = null;
let navEl = null;
let contentEl = null;
let activeSection = DEFAULT_SECTION;
let previouslyFocused = null;
let isInitialised = false;

/**
 * Initialise global help interactions.
 */
export function init() {
  if (isInitialised) return;
  isInitialised = true;

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);

  on('language-changed', () => {
    updateHelpTriggerLabels();
    if (overlay && !overlay.hidden) renderHelp();
  });

  updateHelpTriggerLabels();
}

/**
 * Build a reusable help trigger button.
 * @param {string} section
 * @param {string} className
 * @returns {HTMLButtonElement}
 */
export function buildHelpButton(section = DEFAULT_SECTION, className = 'help-trigger') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.helpSection = normalizeSection(section);
  button.appendChild(buildHelpIcon());
  updateHelpTriggerLabel(button);
  return button;
}

function handleDocumentClick(event) {
  const target = event.target instanceof Element
    ? event.target
    : event.target?.parentElement;
  const trigger = target?.closest('[data-help-section]');
  if (!trigger) return;

  event.preventDefault();
  event.stopPropagation();
  openHelp(trigger.dataset.helpSection || DEFAULT_SECTION);
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && overlay && !overlay.hidden) {
    closeHelp();
  }
}

function openHelp(section = DEFAULT_SECTION) {
  activeSection = normalizeSection(section);
  previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  ensureOverlay();
  renderHelp();
  overlay.hidden = false;
  document.body.classList.add('help-panel-open');
  closeButton.focus();
}

function closeHelp() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('help-panel-open');

  if (previouslyFocused && document.contains(previouslyFocused)) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

function ensureOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'help-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHelp();
  });

  const dialog = document.createElement('section');
  dialog.className = 'help-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'help-dialog-title');
  overlay.appendChild(dialog);

  const header = document.createElement('header');
  header.className = 'help-dialog__header';
  dialog.appendChild(header);

  dialogTitle = document.createElement('h2');
  dialogTitle.id = 'help-dialog-title';
  dialogTitle.className = 'help-dialog__title';
  header.appendChild(dialogTitle);

  closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn--icon help-dialog__close';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeHelp);
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = 'help-dialog__body';
  dialog.appendChild(body);

  navEl = document.createElement('nav');
  navEl.className = 'help-dialog__nav';
  navEl.setAttribute('aria-label', t('help.navLabel'));
  body.appendChild(navEl);

  contentEl = document.createElement('article');
  contentEl.className = 'help-dialog__content';
  body.appendChild(contentEl);

  document.body.appendChild(overlay);
}

function renderHelp() {
  dialogTitle.textContent = t('help.title');
  closeButton.title = t('help.close');
  closeButton.setAttribute('aria-label', t('help.close'));
  navEl.setAttribute('aria-label', t('help.navLabel'));

  navEl.innerHTML = '';
  for (const section of HELP_SECTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help-dialog__nav-button';
    button.classList.toggle('help-dialog__nav-button--active', section === activeSection);
    button.textContent = t(`help.${section}.nav`);
    button.addEventListener('click', () => {
      activeSection = section;
      renderHelp();
    });
    navEl.appendChild(button);
  }

  renderSection();
}

function renderSection() {
  contentEl.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'help-dialog__section-title';
  heading.textContent = t(`help.${activeSection}.title`);
  contentEl.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'help-dialog__intro';
  intro.textContent = t(`help.${activeSection}.intro`);
  contentEl.appendChild(intro);

  const list = document.createElement('ul');
  list.className = 'help-dialog__list';
  for (let i = 1; i <= 8; i++) {
    const itemKey = `help.${activeSection}.item${i}`;
    const text = t(itemKey);
    if (text === itemKey) continue;
    const item = document.createElement('li');
    item.appendChild(document.createTextNode(text));
    const subList = buildSubList(itemKey);
    if (subList) item.appendChild(subList);
    list.appendChild(item);
  }
  contentEl.appendChild(list);
}

function buildSubList(itemKey) {
  const subList = document.createElement('ul');
  subList.className = 'help-dialog__sublist';

  for (let i = 1; i <= 6; i++) {
    const subKey = `${itemKey}.sub${i}`;
    const text = t(subKey);
    if (text === subKey) continue;
    const item = document.createElement('li');
    item.textContent = text;
    subList.appendChild(item);
  }

  return subList.children.length > 0 ? subList : null;
}

function normalizeSection(section) {
  return HELP_SECTIONS.includes(section) ? section : DEFAULT_SECTION;
}

function updateHelpTriggerLabels() {
  document
    .querySelectorAll('[data-help-section]')
    .forEach(updateHelpTriggerLabel);
}

function updateHelpTriggerLabel(trigger) {
  ensureHelpTriggerIcon(trigger);
  const section = normalizeSection(trigger.dataset.helpSection || DEFAULT_SECTION);
  const label = t('help.openSection', { section: t(`help.${section}.nav`) });
  trigger.title = label;
  trigger.setAttribute('aria-label', label);
}

function ensureHelpTriggerIcon(trigger) {
  if (!(trigger instanceof HTMLElement)) return;
  if (trigger.querySelector('.help-trigger__icon')) return;
  trigger.textContent = '';
  trigger.appendChild(buildHelpIcon());
}

function buildHelpIcon() {
  const icon = document.createElement('span');
  icon.className = 'help-trigger__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '?';
  return icon;
}
