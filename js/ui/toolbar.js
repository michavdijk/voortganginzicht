/**
 * Toolbar UI module.
 *
 * Renders the application toolbar and manages button states.
 * The chart re-renders automatically; there is no manual "Genereer" button.
 *
 * Subscribes to 'chart-generated' to enable the export menu, and to
 * 'project-loaded' to reset it when a new project is started.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';
import { buildHelpButton } from './help-panel.js';

let _container = null;
let exportBtn = null;
let exportMenu = null;
let exportWrap = null;
let _chartGenerated = false;
let _exportMenuOpen = false;
let _globalMenuHandlersBound = false;

/**
 * Initialise the toolbar inside the given container element.
 * Must be called once on DOMContentLoaded.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;
  bindGlobalMenuHandlers();
  render();

  on('chart-generated', () => {
    _chartGenerated = true;
    updateExportMenuState();
  });

  on('project-loaded', () => {
    _chartGenerated = false;
    closeExportMenu();
    updateExportMenuState();
  });

  on('language-changed', render);
}

function render() {
  if (!_container) return;
  _container.innerHTML = '';
  _container.className = 'toolbar';

  _container.appendChild(buildButton(t('toolbar.new'),  'btn btn--toolbar', handleNewProject));
  _container.appendChild(buildButton(t('toolbar.open'), 'btn btn--toolbar', handleLoad));
  _container.appendChild(buildButton(t('toolbar.save'), 'btn btn--toolbar', handleSave));

  _container.appendChild(buildExportMenu());

  _container.appendChild(buildHelpButton('files', 'help-trigger'));
}

// ── Button factory ───────────────────────────────────────────────────────────

function buildButton(label, className, handler) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
}

function buildExportMenu() {
  exportWrap = document.createElement('div');
  exportWrap.className = 'toolbar-export';
  exportWrap.dataset.toolbarExport = 'true';

  exportBtn = buildButton(t('toolbar.export'), 'btn btn--toolbar toolbar-export__button', toggleExportMenu);
  exportBtn.dataset.toolbarExportButton = 'true';
  exportBtn.setAttribute('aria-haspopup', 'menu');
  exportBtn.setAttribute('aria-expanded', 'false');
  exportBtn.setAttribute('aria-controls', 'toolbar-export-menu');
  exportBtn.setAttribute('aria-label', t('toolbar.export'));
  exportBtn.title = t('toolbar.export');

  exportMenu = document.createElement('div');
  exportMenu.id = 'toolbar-export-menu';
  exportMenu.className = 'toolbar-export__menu';
  exportMenu.dataset.toolbarExportMenu = 'true';
  exportMenu.setAttribute('role', 'menu');
  exportMenu.setAttribute('aria-label', t('toolbar.exportMenu'));
  exportMenu.hidden = true;

  exportMenu.appendChild(buildExportMenuItem(t('toolbar.download'), handleDownload));
  exportMenu.appendChild(buildExportMenuItem(t('toolbar.copy'), handleCopyReport));

  exportWrap.appendChild(exportBtn);
  exportWrap.appendChild(exportMenu);
  setExportMenuOpen(false);
  updateExportMenuState();

  return exportWrap;
}

function buildExportMenuItem(label, handler) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'toolbar-export__menu-item';
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  item.addEventListener('click', (event) => {
    event.stopPropagation();
    closeExportMenu();
    handler();
  });
  return item;
}

function updateExportMenuState() {
  if (!exportBtn) return;
  exportBtn.disabled = !_chartGenerated;
  if (!_chartGenerated) closeExportMenu();
}

function toggleExportMenu(event) {
  event?.stopPropagation();
  if (!exportBtn || exportBtn.disabled) return;
  setExportMenuOpen(!_exportMenuOpen);
}

function setExportMenuOpen(open) {
  _exportMenuOpen = open;
  if (exportBtn) exportBtn.setAttribute('aria-expanded', String(open));
  if (exportMenu) exportMenu.hidden = !open;
}

function closeExportMenu() {
  setExportMenuOpen(false);
}

function bindGlobalMenuHandlers() {
  if (_globalMenuHandlersBound) return;
  _globalMenuHandlersBound = true;

  document.addEventListener('click', (event) => {
    if (!_exportMenuOpen || !exportWrap) return;
    if (event.target instanceof Node && exportWrap.contains(event.target)) return;
    closeExportMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (!_exportMenuOpen || event.key !== 'Escape') return;
    closeExportMenu();
    exportBtn?.focus();
  });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleNewProject() {
  document.dispatchEvent(new CustomEvent('toolbar:new-project'));
}

function handleLoad() {
  document.dispatchEvent(new CustomEvent('toolbar:load'));
}

function handleSave() {
  document.dispatchEvent(new CustomEvent('toolbar:save'));
}

function handleDownload() {
  document.dispatchEvent(new CustomEvent('toolbar:download'));
}

function handleCopyReport() {
  document.dispatchEvent(new CustomEvent('toolbar:copy-report'));
}
