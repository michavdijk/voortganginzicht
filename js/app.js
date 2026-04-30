/**
 * Application bootstrap module.
 *
 * Imports all UI modules, initialises the application on DOMContentLoaded,
 * and wires up global event handlers (beforeunload, toolbar custom events).
 *
 * The chart re-renders automatically:
 *   – immediately on 'project-loaded' and 'settings-changed'
 *   – debounced (400 ms) on 'tree-changed', to avoid re-rendering on every keystroke
 */

import { newProject, isDirty, markClean, markDirty, setRoot, getRoot } from './model/project.js';
import { init as initTreeEditor } from './ui/tree-editor.js';
import { init as initToolbar } from './ui/toolbar.js';
import { init as initSettingsPanel } from './ui/settings-panel.js';
import { init as initLangSwitcher } from './ui/lang-switcher.js';
import { init as initHelpPanel } from './ui/help-panel.js';
import { updateSettings, getSettings, resetSettings } from './model/settings.js';
import { showError, showSuccess } from './ui/dialogs.js';
import { serialize, deserialize } from './io/serializer.js';
import { saveToFile, loadFromFile, supportsSaveFilePicker, pickSaveFile, writeBlobToFileHandle, downloadBlob } from './io/file-access.js';
import { on, emit } from './events.js';
import { renderChart } from './chart/renderer.js';
import { getType } from './model/tree.js';
import { t } from './i18n.js';

document.addEventListener('DOMContentLoaded', () => {
  const toolbarEl     = document.getElementById('toolbar');
  const treeEditorEl  = document.getElementById('tree-editor');
  const langEl        = document.getElementById('lang-switcher');

  if (!toolbarEl || !treeEditorEl) {
    console.error('[app] Required DOM elements not found (#toolbar, #tree-editor).');
    return;
  }

  initToolbar(toolbarEl);
  initTreeEditor(treeEditorEl);
  initHelpPanel();
  if (langEl) initLangSwitcher(langEl);

  const settingsPanelEl = document.getElementById('settings-panel');
  if (settingsPanelEl) initSettingsPanel(settingsPanelEl);

  initTreePanelToggle();
  initSettingsDrawer();
  applyStaticTranslations();
  on('language-changed', applyStaticTranslations);

  // Auto-render subscriptions.
  on('project-loaded',    autoRender);
  on('settings-changed',  autoRender);
  on('tree-changed',      scheduleRender);
  on('language-changed',  autoRender);

  // Re-render on window resize (debounced, width-change only).
  window.addEventListener('resize', scheduleResizeRender);

  // Start with an empty project (fires 'project-loaded' → autoRender shows placeholder).
  newProject();

  // ── Global toolbar event handlers ──────────────────────────────────────────
  document.addEventListener('toolbar:new-project', handleNewProject);
  document.addEventListener('toolbar:load',        handleLoad);
  document.addEventListener('toolbar:save',        handleSave);
  document.addEventListener('toolbar:download',    handleDownload);

  // ── Unsaved-changes warning on tab close ──────────────────────────────────
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });
});

// ── Auto-render ──────────────────────────────────────────────────────────────

let _renderTimer = null;
let _resizeTimer = null;
let _lastRenderWidth = 0;

function scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(autoRender, 400);
}

function scheduleResizeRender() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const chartBody = document.querySelector('#chart-panel .panel__body');
    if (!chartBody) return;
    const currentWidth = chartBody.clientWidth;
    if (currentWidth === _lastRenderWidth) return;
    autoRender();
  }, 150);
}

function autoRender() {
  clearTimeout(_renderTimer);
  const root      = getRoot();
  const chartBody = document.querySelector('#chart-panel .panel__body');
  if (!chartBody) return;

  if (!root || !canRender(root)) {
    chartBody.innerHTML = `<div class="chart-placeholder"><p>${escapeHtml(t('chart.placeholder'))}</p></div>`;
    _lastRenderWidth = 0;
    return;
  }

  renderChart(chartBody, root, getSettings());
  _lastRenderWidth = chartBody.clientWidth;
  emit('chart-generated', root);
}

function canRender(root) {
  return hasAnyActiviteit(root) && allActiviteitenHaveOmvang(root);
}

function hasAnyActiviteit(node) {
  if (getType(node) === 'Activiteit') return true;
  return node.kinderen.some(hasAnyActiviteit);
}

function allActiviteitenHaveOmvang(node) {
  if (getType(node) === 'Activiteit') return node.omvang !== null;
  return node.kinderen.every(allActiviteitenHaveOmvang);
}

// ── Tree panel collapse ──────────────────────────────────────────────────────

function initTreePanelToggle() {
  const layout      = document.getElementById('app-layout');
  const collapseBtn = document.getElementById('tree-panel-collapse');
  const expandBtn   = document.getElementById('tree-panel-expand');

  if (!layout || !collapseBtn || !expandBtn) return;

  collapseBtn.addEventListener('click', () => setTreePanelCollapsed(true));
  expandBtn.addEventListener('click',   () => setTreePanelCollapsed(false));

  setTreePanelCollapsed(false);
}

function setTreePanelCollapsed(collapsed) {
  const layout      = document.getElementById('app-layout');
  const collapseBtn = document.getElementById('tree-panel-collapse');
  const expandBtn   = document.getElementById('tree-panel-expand');

  if (!layout || !collapseBtn || !expandBtn) return;

  layout.classList.toggle('app-layout--tree-collapsed', collapsed);
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  expandBtn.setAttribute('aria-expanded', String(!collapsed));
  updateTreePanelToggleLabels();

  // The chart width changes immediately after the grid switches columns.
  requestAnimationFrame(autoRender);
}

function updateTreePanelToggleLabels() {
  const layout      = document.getElementById('app-layout');
  const collapseBtn = document.getElementById('tree-panel-collapse');
  const expandBtn   = document.getElementById('tree-panel-expand');
  if (!layout || !collapseBtn || !expandBtn) return;

  const isCollapsed = layout.classList.contains('app-layout--tree-collapsed');
  const collapseLabel = t('panel.tree.collapse');
  const expandLabel   = t('panel.tree.expand');

  collapseBtn.title = collapseLabel;
  collapseBtn.setAttribute('aria-label', collapseLabel);
  expandBtn.title = expandLabel;
  expandBtn.setAttribute('aria-label', expandLabel);
  expandBtn.hidden = !isCollapsed;
}

// ── Settings drawer ─────────────────────────────────────────────────────────

function initSettingsDrawer() {
  const drawer    = document.getElementById('settings-drawer');
  const toggleBtn = document.getElementById('settings-drawer-toggle');
  const closeBtn  = document.getElementById('settings-drawer-close');

  if (!drawer || !toggleBtn || !closeBtn) return;

  const setOpen = (open, focusToggle = false) => {
    drawer.hidden = !open;
    toggleBtn.classList.toggle('settings-drawer-toggle--active', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
    updateSettingsDrawerLabels();

    if (focusToggle) toggleBtn.focus();

    // The chart width changes when the desktop drawer opens or closes.
    requestAnimationFrame(autoRender);
  };

  toggleBtn.addEventListener('click', () => setOpen(drawer.hidden));
  closeBtn.addEventListener('click', () => setOpen(false, true));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || drawer.hidden || document.body.classList.contains('help-panel-open')) return;
    setOpen(false, true);
  });

  setOpen(false);
}

function updateSettingsDrawerLabels() {
  const drawer    = document.getElementById('settings-drawer');
  const toggleBtn = document.getElementById('settings-drawer-toggle');
  const closeBtn  = document.getElementById('settings-drawer-close');
  const titleEl   = document.getElementById('settings-drawer-title');

  if (titleEl) titleEl.textContent = t('panel.settings.header');

  const isOpen = drawer && !drawer.hidden;
  const toggleLabel = t(isOpen ? 'settings.drawer.close' : 'settings.drawer.open');
  if (toggleBtn) {
    toggleBtn.title = toggleLabel;
    toggleBtn.setAttribute('aria-label', toggleLabel);
  }

  const closeLabel = t('settings.drawer.close');
  if (closeBtn) {
    closeBtn.title = closeLabel;
    closeBtn.setAttribute('aria-label', closeLabel);
  }
}

// ── Toolbar action handlers ──────────────────────────────────────────────────

async function handleNewProject() {
  const projectName = prompt(t('project.prompt.name'));
  if (projectName === null) return;

  const trimmedName = projectName.trim();

  const nameEl = document.getElementById('project-name');
  resetSettings();
  refreshSettingsPanel();
  newProject();
  setTreePanelCollapsed(false);
  if (nameEl) nameEl.value = trimmedName;
  if (trimmedName) markDirty();
  showSuccess(t('success.newProject'));
}

async function handleLoad() {
  let fileContent;
  try {
    fileContent = await loadFromFile();
  } catch (err) {
    showError(t('error.openFile', { message: err.message }));
    return;
  }

  if (fileContent === null) return;

  const result = deserialize(fileContent);
  if (!result.valid) {
    showError(result.error);
    return;
  }

  setRoot(result.root);
  updateSettings(result.settings);
  refreshSettingsPanel();
  const nameEl = document.getElementById('project-name');
  if (nameEl) nameEl.value = result.projectnaam || '';
  setTreePanelCollapsed(false);
  markClean();
  emit('project-loaded', result.root);
  showSuccess(t('success.opened'));
}

async function handleSave() {
  const root       = getRoot();
  const projectnaam = (document.getElementById('project-name')?.value ?? '').trim();
  const jsonString = serialize(root, getSettings(), projectnaam);
  const filename   = `${projectSlug()}.voortganginzicht.json`;

  let saved;
  try {
    saved = await saveToFile(jsonString, filename);
  } catch (err) {
    showError(t('error.saveFile', { message: err.message }));
    return;
  }

  if (saved) {
    markClean();
    emit('project-saved', root);
    showSuccess(t('success.saved'));
  }
}

async function handleDownload() {
  const chartBody = document.querySelector('#chart-panel .panel__body');
  const svg = chartBody ? chartBody._chartSvg : null;

  if (!svg) {
    showError(t('error.noChart'));
    return;
  }

  try {
    const filename = `${projectSlug()}.png`;
    let fileHandle = null;
    if (supportsSaveFilePicker()) {
      fileHandle = await pickSaveFile(filename, [
        {
          description: 'PNG afbeelding',
          accept: { 'image/png': ['.png'] },
        },
      ]);
      if (!fileHandle) return;
    }

    const viewBox = svg.getAttribute('viewBox').split(' ');
    const w = parseFloat(viewBox[2]);
    const h = parseFloat(viewBox[3]);
    const scale = 2;

    const svgStr = new XMLSerializer().serializeToString(svg);
    const img    = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          showError(t('error.imageGen'));
          return;
        }

        try {
          if (fileHandle) {
            await writeBlobToFileHandle(blob, fileHandle);
          } else {
            downloadBlob(blob, filename);
          }
          showSuccess(t('success.downloaded'));
        } catch (err) {
          showError(t('error.downloadFailed', { message: err.message }));
        }
      }, 'image/png');
    };

    img.onerror = () => showError(t('error.imageGen'));
  } catch (err) {
    showError(t('error.downloadFailed', { message: err.message }));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function projectSlug() {
  const naam = (document.getElementById('project-name')?.value ?? '').trim();
  const slug = naam
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s_-]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
  return slug || 'project';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyStaticTranslations() {
  document.documentElement.lang = t('app.doc.lang');

  const nameInput = document.getElementById('project-name');
  if (nameInput) nameInput.placeholder = t('project.placeholder');

  const treePanel = document.getElementById('tree-panel');
  if (treePanel) treePanel.setAttribute('aria-label', t('panel.tree.ariaLabel'));

  const treeHeaderTitle = document.getElementById('tree-panel-header-title');
  if (treeHeaderTitle) treeHeaderTitle.textContent = t('panel.tree.header');

  const chartPanel = document.getElementById('chart-panel');
  if (chartPanel) chartPanel.setAttribute('aria-label', t('panel.chart.ariaLabel'));

  const chartHeader = document.getElementById('chart-panel-header');
  if (chartHeader) chartHeader.textContent = t('panel.chart.header');

  updateTreePanelToggleLabels();
  updateSettingsDrawerLabels();
}

function refreshSettingsPanel() {
  const settingsPanelEl = document.getElementById('settings-panel');
  if (settingsPanelEl) initSettingsPanel(settingsPanelEl);
}
