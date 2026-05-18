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
import { init as initContactFeedbackPanel } from './ui/contact-feedback-panel.js';
import { updateSettings, getSettings, resetSettings } from './model/settings.js';
import { showError, showSuccess } from './ui/dialogs.js';
import { serialize, deserialize } from './io/serializer.js';
import { saveToFile, loadFromFile, supportsSaveFilePicker, pickSaveFile, writeBlobToFileHandle, downloadBlob } from './io/file-access.js';
import { on, emit } from './events.js';
import { renderChart } from './chart/renderer.js';
import { canRenderChart, formatChartRenderIssue, getChartRenderIssue } from './chart/render-validation.js';
import { canCopyChartToClipboard, chartSvgToPngBlob, copyChartToClipboard } from './chart/clipboard.js';
import { t } from './i18n.js';

const PROJECT_NAME_MAX_LENGTH = 100;
const PHONE_MAX_SHORT_SIDE = 600;
const CHART_ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
let appInitialized = false;
let appShell = null;
let originalBodyClass = '';
let _chartZoom = 1;

document.addEventListener('DOMContentLoaded', () => {
  if (isPhoneLikeViewport()) {
    appShell = Array.from(document.body.childNodes);
    originalBodyClass = document.body.className;
    renderPhoneUnsupportedMessage();
    return;
  }

  initApplication();
});

function initApplication() {
  if (appInitialized) return;

  const toolbarEl     = document.getElementById('toolbar');
  const treeEditorEl  = document.getElementById('tree-editor');
  const langEl        = document.getElementById('lang-switcher');

  if (!toolbarEl || !treeEditorEl) {
    console.error('[app] Required DOM elements not found (#toolbar, #tree-editor).');
    return;
  }

  appInitialized = true;

  initToolbar(toolbarEl);
  initTreeEditor(treeEditorEl);
  initHelpPanel();
  initContactFeedbackPanel();
  if (langEl) initLangSwitcher(langEl);

  const settingsPanelEl = document.getElementById('settings-panel');
  if (settingsPanelEl) initSettingsPanel(settingsPanelEl);

  initTreePanelToggle();
  initSettingsDrawer();
  initChartZoomControls();
  initProjectNameTitle();
  initVersionInfo();
  applyStaticTranslations();
  on('language-changed', applyStaticTranslations);

  // Auto-render subscriptions.
  on('project-loaded',    autoRender);
  on('settings-changed',  autoRender);
  on('tree-changed',      scheduleRender);
  on('language-changed',  autoRender);
  on('chart-node-selected', () => setTreePanelCollapsed(false));

  // Re-render on window resize (debounced, width-change only).
  window.addEventListener('resize', scheduleResizeRender);

  // Start with an empty project (fires 'project-loaded' → autoRender shows placeholder).
  newProject();

  // ── Global toolbar event handlers ──────────────────────────────────────────
  document.addEventListener('toolbar:new-project', handleNewProject);
  document.addEventListener('toolbar:load',        handleLoad);
  document.addEventListener('toolbar:save',        handleSave);
  document.addEventListener('toolbar:download',    handleDownload);
  document.addEventListener('toolbar:copy-report', handleCopyReport);

  // ── Unsaved-changes warning on tab close ──────────────────────────────────
  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });
}

function isPhoneLikeViewport() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  return coarsePointer && shortSide < PHONE_MAX_SHORT_SIDE;
}

function renderPhoneUnsupportedMessage() {
  document.documentElement.lang = t('app.doc.lang');
  document.body.innerHTML = '';
  document.body.className = 'mobile-unsupported-page';

  const main = document.createElement('main');
  main.className = 'mobile-unsupported';
  main.setAttribute('role', 'main');

  const logo = document.createElement('img');
  logo.className = 'mobile-unsupported__logo';
  logo.src = 'assets/logo.svg';
  logo.width = 520;
  logo.height = 64;
  logo.alt = 'voortganginzicht.nl';

  const message = document.createElement('div');
  message.className = 'mobile-unsupported__message';

  const nlMessage = document.createElement('p');
  nlMessage.lang = 'nl';
  nlMessage.textContent = t('app.mobileUnsupported.nl');

  const enMessage = document.createElement('p');
  enMessage.lang = 'en';
  enMessage.textContent = t('app.mobileUnsupported.en');

  message.append(nlMessage, enMessage);

  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'btn btn--primary mobile-unsupported__continue';
  continueButton.textContent = `${t('app.mobileUnsupported.continue.nl')} / ${t('app.mobileUnsupported.continue.en')}`;
  continueButton.addEventListener('click', continueToApplication);

  main.append(logo, message, continueButton);
  document.body.appendChild(main);
}

function continueToApplication() {
  if (!appShell) return;

  document.body.innerHTML = '';
  document.body.className = originalBodyClass;
  for (const node of appShell) {
    document.body.appendChild(node);
  }

  initApplication();
}

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
  const settings  = getSettings();
  if (!chartBody) return;

  if (!canRenderChart(root)) {
    chartBody.innerHTML = buildChartPlaceholder(root);
    chartBody._chartSvg = null;
    _lastRenderWidth = 0;
    updateChartZoomControls();
    return;
  }

  renderChart(chartBody, root, { ...settings, chartZoom: _chartZoom, projectName: getProjectName() });
  _lastRenderWidth = chartBody.clientWidth;
  updateChartZoomControls();
  emit('chart-generated', root);
}

function buildChartPlaceholder(root) {
  return `<div class="chart-placeholder"><p>${escapeHtml(chartPlaceholderMessage(root))}</p></div>`;
}

function chartPlaceholderMessage(root) {
  return formatChartRenderIssue(getChartRenderIssue(root));
}

// ── Chart zoom controls ─────────────────────────────────────────────────────

function initChartZoomControls() {
  const zoomOutBtn = document.getElementById('chart-zoom-out');
  const zoomInBtn  = document.getElementById('chart-zoom-in');
  const zoomLevelBtn = document.getElementById('chart-zoom-level');

  if (!zoomOutBtn || !zoomInBtn) return;

  zoomOutBtn.addEventListener('click', () => setChartZoomByStep(-1));
  zoomInBtn.addEventListener('click', () => setChartZoomByStep(1));
  if (zoomLevelBtn) zoomLevelBtn.addEventListener('click', resetChartZoomFromControl);
  updateChartZoomControls();
}

function resetChartZoom() {
  _chartZoom = 1;
  updateChartZoomControls();
}

function resetChartZoomFromControl() {
  if (_chartZoom === 1) return;

  _chartZoom = 1;
  updateChartZoomControls();
  autoRender();
}

function setChartZoomByStep(direction) {
  const currentIndex = chartZoomIndex();
  const nextIndex = Math.min(
    CHART_ZOOM_LEVELS.length - 1,
    Math.max(0, currentIndex + direction)
  );

  if (nextIndex === currentIndex) return;

  _chartZoom = CHART_ZOOM_LEVELS[nextIndex];
  updateChartZoomControls();
  autoRender();
}

function chartZoomIndex() {
  const exactIndex = CHART_ZOOM_LEVELS.indexOf(_chartZoom);
  if (exactIndex !== -1) return exactIndex;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < CHART_ZOOM_LEVELS.length; i++) {
    const distance = Math.abs(CHART_ZOOM_LEVELS[i] - _chartZoom);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

function updateChartZoomControls() {
  const group = document.querySelector('.chart-zoom-controls');
  const zoomOutBtn = document.getElementById('chart-zoom-out');
  const zoomInBtn  = document.getElementById('chart-zoom-in');
  const zoomLevelEl = document.getElementById('chart-zoom-level');
  if (!zoomOutBtn || !zoomInBtn) return;

  const chartBody = document.querySelector('#chart-panel .panel__body');
  const hasChart = Boolean(chartBody?._chartSvg);
  const currentIndex = chartZoomIndex();
  const zoomPercent = Math.round(_chartZoom * 100);
  const zoomText = `${zoomPercent}%`;

  if (group) group.setAttribute('aria-label', t('chart.zoom.controls'));
  if (zoomLevelEl) {
    zoomLevelEl.textContent = zoomText;
    const canResetZoom = _chartZoom !== 1;
    const zoomLevelLabel = canResetZoom
      ? t('chart.zoom.reset', { value: zoomText })
      : t('chart.zoom.level', { value: zoomText });
    zoomLevelEl.title = zoomLevelLabel;
    zoomLevelEl.setAttribute('aria-label', zoomLevelLabel);
    zoomLevelEl.disabled = !canResetZoom;
  }

  const zoomOutLabel = t('chart.zoom.out');
  zoomOutBtn.title = `${zoomOutLabel} (${zoomPercent}%)`;
  zoomOutBtn.setAttribute('aria-label', zoomOutLabel);
  zoomOutBtn.disabled = !hasChart || currentIndex <= 0;

  const zoomInLabel = t('chart.zoom.in');
  zoomInBtn.title = `${zoomInLabel} (${zoomPercent}%)`;
  zoomInBtn.setAttribute('aria-label', zoomInLabel);
  zoomInBtn.disabled = !hasChart || currentIndex >= CHART_ZOOM_LEVELS.length - 1;
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

  const wasCollapsed = layout.classList.contains('app-layout--tree-collapsed');
  layout.classList.toggle('app-layout--tree-collapsed', collapsed);
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  expandBtn.setAttribute('aria-expanded', String(!collapsed));
  updateTreePanelToggleLabels();

  // The chart width changes immediately after the grid switches columns.
  if (wasCollapsed !== collapsed) {
    requestAnimationFrame(autoRender);
  }
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

  resetChartZoom();
  resetSettings();
  refreshSettingsPanel();
  newProject();
  setTreePanelCollapsed(false);
  setProjectName(trimmedName);
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
  resetChartZoom();
  updateSettings(result.settings);
  refreshSettingsPanel();
  setProjectName(result.projectnaam || '');
  setTreePanelCollapsed(false);
  markClean();
  emit('project-loaded', result.root);
  showSuccess(t('success.opened'));
}

async function handleSave() {
  const root       = getRoot();
  const projectnaam = getProjectName();
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
  const svg = getCurrentChartSvg();

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
          description: t('file.picker.pngDescription'),
          accept: { 'image/png': ['.png'] },
        },
      ]);
      if (!fileHandle) return;
    }

    const blob = await chartSvgToPngBlob(svg);
    if (fileHandle) {
      await writeBlobToFileHandle(blob, fileHandle);
    } else {
      downloadBlob(blob, filename);
    }
    showSuccess(t('success.downloaded'));
  } catch (err) {
    showError(t('error.downloadFailed', { message: err.message }));
  }
}

async function handleCopyReport() {
  const svg = getCurrentChartSvg();

  if (!svg) {
    showError(t('error.noChart'));
    return;
  }

  if (!canCopyChartToClipboard()) {
    showError(t('error.clipboardUnsupported'));
    return;
  }

  try {
    await copyChartToClipboard(svg);
    showSuccess(t('success.copied'));
  } catch (err) {
    showError(t('error.copyFailed', { message: err.message }));
  }
}

function getCurrentChartSvg() {
  const chartBody = document.querySelector('#chart-panel .panel__body');
  return chartBody ? chartBody._chartSvg : null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initProjectNameTitle() {
  const display = document.getElementById('project-name-display');
  if (!display) return;

  display.addEventListener('click', promptForProjectName);
  updateProjectNameDisplay();
}

function promptForProjectName() {
  const currentName = getProjectName();
  const nextName = prompt(t('project.prompt.name'), currentName);
  if (nextName === null) return;
  setProjectName(nextName, { markChanged: true });
}

function getProjectName() {
  const input = document.getElementById('project-name');
  return normalizeProjectName(input?.value ?? '');
}

function setProjectName(name, options = {}) {
  const input = document.getElementById('project-name');
  const previousName = getProjectName();
  const nextName = normalizeProjectName(name);

  if (input) input.value = nextName;
  updateProjectNameDisplay();

  if (options.markChanged && nextName !== previousName) {
    markDirty();
  }
  if (nextName !== previousName && getSettings().showProjectTitle) {
    autoRender();
  }
}

function normalizeProjectName(name) {
  return String(name ?? '').trim().slice(0, PROJECT_NAME_MAX_LENGTH);
}

function updateProjectNameDisplay() {
  const display = document.getElementById('project-name-display');
  const text = display?.querySelector('.project-name-title__text');
  if (!display || !text) return;

  const projectName = getProjectName();
  const label = projectName ? `${projectName}. ${t('project.rename')}` : t('project.rename');
  text.textContent = projectName || t('project.untitled');
  display.classList.toggle('project-name-title--empty', !projectName);
  display.title = t('project.rename');
  display.setAttribute('aria-label', label);
}

function projectSlug() {
  const naam = getProjectName();
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

  updateProjectNameDisplay();

  const treePanel = document.getElementById('tree-panel');
  if (treePanel) treePanel.setAttribute('aria-label', t('panel.tree.ariaLabel'));

  const treeHeaderTitle = document.getElementById('tree-panel-header-title');
  if (treeHeaderTitle) treeHeaderTitle.textContent = t('panel.tree.header');

  const chartPanel = document.getElementById('chart-panel');
  if (chartPanel) chartPanel.setAttribute('aria-label', t('panel.chart.ariaLabel'));

  const chartHeader = document.getElementById('chart-panel-header');
  if (chartHeader) chartHeader.textContent = t('panel.chart.header');

  const footerContactLink = document.getElementById('footer-contact-link');
  if (footerContactLink) {
    footerContactLink.textContent = t('contact.feedback.link');
    footerContactLink.title = t('contact.feedback.open');
    footerContactLink.setAttribute('aria-label', t('contact.feedback.open'));
  }

  updateTreePanelToggleLabels();
  updateChartZoomControls();
  updateSettingsDrawerLabels();
}

function refreshSettingsPanel() {
  const settingsPanelEl = document.getElementById('settings-panel');
  if (settingsPanelEl) initSettingsPanel(settingsPanelEl);
}

function initVersionInfo() {
  const versionEl = document.getElementById('app-version');
  if (!versionEl || typeof fetch !== 'function') return;

  fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' })
    .then(response => (response.ok ? response.json() : null))
    .then(metadata => {
      const version = typeof metadata?.version === 'string' ? metadata.version.trim() : '';
      if (!version) return;

      versionEl.textContent = `Versie ${version}`;

      const date = typeof metadata?.date === 'string' ? metadata.date.trim() : '';
      const commit = typeof metadata?.commit === 'string' ? metadata.commit.trim() : '';
      const details = [
        date ? `Datum: ${date}` : '',
        commit ? `Commit: ${commit}` : '',
      ].filter(Boolean).join(' - ');

      if (details) versionEl.title = details;
    })
    .catch(() => {
      // version.json is generated during deploy; local/dev copies may not have it.
    });
}
