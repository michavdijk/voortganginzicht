/**
 * Toolbar UI module.
 *
 * Renders the application toolbar and manages button states.
 * The chart re-renders automatically; there is no manual "Genereer" button.
 *
 * Subscribes to 'chart-generated' to enable the download button, and to
 * 'project-loaded' to reset it when a new project is started.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';
import { buildHelpButton } from './help-panel.js';

let _container = null;
let downloadBtn = null;
let _chartGenerated = false;

/**
 * Initialise the toolbar inside the given container element.
 * Must be called once on DOMContentLoaded.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;
  render();

  on('chart-generated', () => {
    _chartGenerated = true;
    if (downloadBtn) downloadBtn.disabled = false;
  });

  on('project-loaded', () => {
    _chartGenerated = false;
    if (downloadBtn) downloadBtn.disabled = true;
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

  downloadBtn = buildButton(t('toolbar.download'), 'btn btn--toolbar', handleDownload);
  downloadBtn.disabled = !_chartGenerated;
  _container.appendChild(downloadBtn);

  _container.appendChild(buildHelpButton('files', 'help-trigger'));
}

// ── Button factory ───────────────────────────────────────────────────────────

function buildButton(label, className, handler) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
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
