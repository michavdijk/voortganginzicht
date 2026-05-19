/**
 * Help panel UI module.
 *
 * Provides one central help dialog that can be opened from global and
 * contextual help buttons.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';

const DEFAULT_SECTION = 'overview';
const HELP_SECTIONS = [
  'overview',
  'workStructure',
  'chart',
  'settings',
  'files',
];

const HELP_CONTENT = {
  overview: [
    { type: 'paragraph', key: 'intro' },
    { type: 'heading', key: 'workflow.heading' },
    { type: 'list', keys: ['workflow.structure', 'workflow.activities', 'workflow.report', 'workflow.settings'] },
    { type: 'heading', key: 'concepts.heading' },
    { type: 'list', keys: ['concepts.goal', 'concepts.subgoals', 'concepts.activities'] },
    { type: 'paragraph', key: 'privacy' },
    { type: 'paragraph', key: 'next' },
  ],
  workStructure: [
    { type: 'paragraph', key: 'intro' },
    { type: 'list', keys: ['structure.goal', 'structure.subgoals', 'structure.activities'] },
    { type: 'paragraph', key: 'activityFields' },
    { type: 'paragraph', key: 'useIntro' },
    { type: 'list', keys: ['use.add', 'use.level', 'use.order'] },
    { type: 'heading', key: 'size.heading' },
    { type: 'paragraph', key: 'size.intro' },
    { type: 'list', keys: ['size.small', 'size.medium', 'size.large'] },
    { type: 'heading', key: 'progress.heading' },
    { type: 'paragraph', key: 'progress.body' },
    { type: 'heading', key: 'actualSpending.heading' },
    { type: 'paragraph', key: 'actualSpending.body' },
    { type: 'paragraph', key: 'actualSpending.useCase' },
    { type: 'paragraph', key: 'actualSpending.setting' },
  ],
  chart: [
    { type: 'paragraph', key: 'intro' },
    { type: 'list', keys: ['item.size', 'item.fill', 'item.rollup', 'item.complete', 'item.actualSpending'] },
    { type: 'paragraph', key: 'zoom' },
    { type: 'paragraph', key: 'settings' },
    { type: 'paragraph', key: 'download' },
  ],
  settings: [
    { type: 'paragraph', key: 'intro' },
    { type: 'heading', key: 'display.heading' },
    { type: 'paragraph', key: 'display.body' },
    { type: 'list', keys: ['display.color', 'display.projectTitle', 'display.percentage', 'display.completeCheck', 'display.legend', 'display.disclaimer'] },
    { type: 'heading', key: 'compareSize.heading' },
    { type: 'paragraph', key: 'compareSize.body' },
    { type: 'paragraph', key: 'sizeIndicators.examplesIntro' },
    { type: 'list', keys: ['sizeIndicators.small', 'sizeIndicators.medium', 'sizeIndicators.large'] },
    { type: 'paragraph', key: 'sizeIndicators.position' },
    { type: 'heading', key: 'actualSpending.heading' },
    { type: 'paragraph', key: 'actualSpending.intro' },
    { type: 'paragraph', key: 'actualSpending.body' },
    { type: 'paragraph', key: 'actualSpending.report' },
    { type: 'paragraph', key: 'actualSpending.status' },
  ],
  files: [
    { type: 'paragraph', key: 'intro' },
    { type: 'heading', key: 'save.heading' },
    { type: 'paragraph', key: 'save.body' },
    { type: 'heading', key: 'open.heading' },
    { type: 'paragraph', key: 'open.body' },
    { type: 'heading', key: 'download.heading' },
    { type: 'paragraph', key: 'download.body' },
    { type: 'paragraph', key: 'privacy' },
  ],
};

let overlay = null;
let dialogTitle = null;
let closeButton = null;
let navEl = null;
let contentEl = null;
let inlineHelpContainer = null;
let inlineHelpNavResizeObserver = null;
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
    renderInlineHelp();
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

/**
 * Render the help content inline, used by the mobile Help tab.
 * @param {HTMLElement} container
 */
export function initInline(container) {
  inlineHelpContainer = container;
  showInlineHelp(DEFAULT_SECTION);
}

/**
 * Show a section in the inline help panel.
 * @param {string} section
 */
export function showInlineHelp(section = DEFAULT_SECTION) {
  activeSection = normalizeSection(section);
  renderInlineHelp();
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

  renderHelpNav(navEl, renderHelp);
  renderSectionInto(contentEl, activeSection);
}

function renderInlineHelp() {
  if (!inlineHelpContainer) return;

  inlineHelpContainer.innerHTML = '';

  const body = document.createElement('div');
  body.className = 'help-dialog__body mobile-help__body';
  inlineHelpContainer.appendChild(body);

  const navWrap = document.createElement('div');
  navWrap.className = 'mobile-help__nav-wrap';
  body.appendChild(navWrap);

  const inlineNav = document.createElement('nav');
  inlineNav.className = 'help-dialog__nav';
  inlineNav.setAttribute('aria-label', t('help.navLabel'));
  navWrap.appendChild(inlineNav);

  const inlineContent = document.createElement('article');
  inlineContent.className = 'help-dialog__content';
  body.appendChild(inlineContent);

  renderHelpNav(inlineNav, renderInlineHelp);
  initInlineHelpNavScroll(inlineNav);
  renderSectionInto(inlineContent, activeSection);
}

function renderHelpNav(targetNav, renderAfterSelect) {
  targetNav.innerHTML = '';
  targetNav.setAttribute('aria-label', t('help.navLabel'));

  for (const section of HELP_SECTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help-dialog__nav-button';
    button.classList.toggle('help-dialog__nav-button--active', section === activeSection);
    button.textContent = t(`help.${section}.nav`);
    button.addEventListener('click', () => {
      activeSection = section;
      renderAfterSelect();
    });
    targetNav.appendChild(button);
  }
}

function initInlineHelpNavScroll(nav) {
  const activeButton = nav.querySelector('.help-dialog__nav-button--active');
  const updateOverflow = () => updateInlineHelpNavOverflow(nav);

  inlineHelpNavResizeObserver?.disconnect();
  inlineHelpNavResizeObserver = null;

  nav.addEventListener('scroll', updateOverflow, { passive: true });

  if (typeof ResizeObserver === 'function') {
    const wrap = nav.closest('.mobile-help__nav-wrap');
    inlineHelpNavResizeObserver = new ResizeObserver(updateOverflow);
    inlineHelpNavResizeObserver.observe(nav);
    if (wrap) inlineHelpNavResizeObserver.observe(wrap);
  }

  requestAnimationFrame(() => {
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    updateOverflow();
    requestAnimationFrame(updateOverflow);
  });

  window.setTimeout(updateOverflow, 120);
}

function updateInlineHelpNavOverflow(nav) {
  const wrap = nav.closest('.mobile-help__nav-wrap');
  if (!wrap) return;

  const maxScrollLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
  wrap.classList.toggle('mobile-help__nav-wrap--can-scroll-left', nav.scrollLeft > 1);
  wrap.classList.toggle('mobile-help__nav-wrap--can-scroll-right', nav.scrollLeft < maxScrollLeft - 1);
}

function renderSectionInto(targetContent, section) {
  targetContent.innerHTML = '';

  const heading = document.createElement('h3');
  heading.className = 'help-dialog__section-title';
  heading.textContent = t(`help.${section}.title`);
  targetContent.appendChild(heading);

  const blocks = HELP_CONTENT[section] || [];
  for (const block of blocks) {
    const element = buildHelpBlock(section, block);
    if (element) targetContent.appendChild(element);
  }
}

function buildHelpBlock(section, block) {
  if (block.type === 'heading') {
    const heading = document.createElement('h4');
    heading.className = 'help-dialog__subheading';
    heading.textContent = t(`help.${section}.${block.key}`);
    return heading;
  }

  if (block.type === 'paragraph') {
    const paragraph = document.createElement('p');
    paragraph.className = 'help-dialog__paragraph';
    paragraph.textContent = t(`help.${section}.${block.key}`);
    return paragraph;
  }

  if (block.type === 'list') {
    const list = document.createElement('ul');
    list.className = 'help-dialog__list';
    for (const key of block.keys) {
      const item = document.createElement('li');
      item.textContent = t(`help.${section}.${key}`);
      list.appendChild(item);
    }
    return list;
  }

  return null;
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
  if (!trigger.classList.contains('help-trigger')) return;
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
