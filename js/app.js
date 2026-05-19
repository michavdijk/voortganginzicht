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
import { init as initHelpPanel, initInline as initInlineHelp, showInlineHelp } from './ui/help-panel.js';
import { init as initContactFeedbackPanel } from './ui/contact-feedback-panel.js';
import { updateSettings, getSettings, resetSettings } from './model/settings.js';
import { showError, showSuccess } from './ui/dialogs.js';
import { serialize, deserialize } from './io/serializer.js';
import { saveToFile, loadFromFile, supportsSaveFilePicker, pickSaveFile, writeBlobToFileHandle, downloadBlob } from './io/file-access.js';
import { on, emit } from './events.js';
import { renderChart } from './chart/renderer.js';
import { canRenderChart, formatChartRenderIssue, getChartRenderIssue } from './chart/render-validation.js';
import { canCopyChartToClipboard, chartSvgToPngBlob, copyChartToClipboard } from './chart/clipboard.js';
import { getLang, setLang, t } from './i18n.js';

const PROJECT_NAME_MAX_LENGTH = 100;
const MOBILE_PANEL_QUERY = '(max-width: 700px), ((pointer: coarse) and (max-height: 700px))';
const CHART_ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
let appInitialized = false;
let _chartZoom = 1;
let _activeMobilePanel = 'tree';
let _mobilePanelMedia = null;

document.addEventListener('DOMContentLoaded', () => {
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
  const mobileHelpPanelEl = document.getElementById('mobile-help-panel-content');
  if (mobileHelpPanelEl) initInlineHelp(mobileHelpPanelEl);

  initTreePanelToggle();
  initSettingsDrawer();
  initChartZoomControls();
  initMobileHeaderMenu();
  initMobilePanelNav();
  initProjectNameTitle();
  initVersionInfo();
  applyStaticTranslations();
  on('language-changed', applyStaticTranslations);

  // Auto-render subscriptions.
  on('project-loaded',    autoRender);
  on('settings-changed',  autoRender);
  on('tree-changed',      scheduleRender);
  on('language-changed',  autoRender);
  on('chart-node-selected', () => {
    if (isMobilePanelLayout()) {
      setMobilePanel('tree');
    } else {
      setTreePanelCollapsed(false);
    }
  });

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

  renderChart(chartBody, root, {
    ...settings,
    chartZoom: _chartZoom,
    projectName: getProjectName(),
  });
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

  toggleBtn.addEventListener('click', () => {
    if (isMobilePanelLayout()) {
      setMobilePanel('settings');
      return;
    }
    setSettingsDrawerOpen(drawer.hidden);
  });
  closeBtn.addEventListener('click', () => {
    if (isMobilePanelLayout()) {
      setMobilePanel('chart', { focusTab: true });
      return;
    }
    setSettingsDrawerOpen(false, true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || drawer.hidden || document.body.classList.contains('help-panel-open')) return;
    if (isMobilePanelLayout()) {
      setMobilePanel('chart', { focusTab: true });
    } else {
      setSettingsDrawerOpen(false, true);
    }
  });

  setSettingsDrawerOpen(false);
}

function setSettingsDrawerOpen(open, focusToggle = false) {
  const drawer    = document.getElementById('settings-drawer');
  const toggleBtn = document.getElementById('settings-drawer-toggle');
  if (!drawer || !toggleBtn) return;

  const wasOpen = !drawer.hidden;
  drawer.hidden = !open;
  toggleBtn.classList.toggle('settings-drawer-toggle--active', open);
  toggleBtn.setAttribute('aria-expanded', String(open));
  updateSettingsDrawerLabels();

  if (focusToggle) toggleBtn.focus();

  // The chart width changes when the desktop drawer opens or closes.
  if (!isMobilePanelLayout() && wasOpen !== open) {
    requestAnimationFrame(autoRender);
  }
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

// ── Mobile panel navigation ─────────────────────────────────────────────────

function initMobilePanelNav() {
  const nav = document.getElementById('mobile-panel-nav');
  if (!nav) return;

  if (!_mobilePanelMedia && typeof window.matchMedia === 'function') {
    _mobilePanelMedia = window.matchMedia(MOBILE_PANEL_QUERY);
  }

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mobile-panel]');
    if (!button || !nav.contains(button)) return;
    setMobilePanel(button.dataset.mobilePanel);
  });

  if (_mobilePanelMedia?.addEventListener) {
    _mobilePanelMedia.addEventListener('change', syncMobilePanelLayout);
  } else {
    _mobilePanelMedia?.addListener?.(syncMobilePanelLayout);
  }
  updateMobilePanelNavLabels();
  syncMobilePanelLayout();
}

function isMobilePanelLayout() {
  if (_mobilePanelMedia) return _mobilePanelMedia.matches;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_PANEL_QUERY).matches;
  }
  return window.innerWidth <= 700;
}

function setMobilePanel(panel, options = {}) {
  if (!['tree', 'chart', 'settings', 'help'].includes(panel)) return;

  _activeMobilePanel = panel;
  if (panel === 'help') showInlineHelp();
  applyMobilePanelState(options);
}

function syncMobilePanelLayout() {
  const isMobile = isMobilePanelLayout();
  document.body.classList.toggle('app-mobile-panels', isMobile);
  applyMobilePanelState();
}

function applyMobilePanelState(options = {}) {
  const isMobile = isMobilePanelLayout();
  document.body.classList.toggle('mobile-panel--tree', isMobile && _activeMobilePanel === 'tree');
  document.body.classList.toggle('mobile-panel--chart', isMobile && _activeMobilePanel === 'chart');
  document.body.classList.toggle('mobile-panel--settings', isMobile && _activeMobilePanel === 'settings');
  document.body.classList.toggle('mobile-panel--help', isMobile && _activeMobilePanel === 'help');

  const nav = document.getElementById('mobile-panel-nav');
  const buttons = nav?.querySelectorAll('[data-mobile-panel]') ?? [];
  buttons.forEach((button) => {
    const isActive = isMobile && button.dataset.mobilePanel === _activeMobilePanel;
    button.classList.toggle('mobile-panel-nav__button--active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  if (!isMobile) return;

  if (_activeMobilePanel === 'settings') {
    setSettingsDrawerOpen(true);
  } else {
    setSettingsDrawerOpen(false);
  }

  if (_activeMobilePanel === 'chart') {
    requestAnimationFrame(autoRender);
  }

  if (options.focusTab) {
    nav?.querySelector(`[data-mobile-panel="${_activeMobilePanel}"]`)?.focus();
  }
}

function updateMobilePanelNavLabels() {
  const nav = document.getElementById('mobile-panel-nav');
  if (!nav) return;

  nav.setAttribute('aria-label', t('mobile.nav.label'));

  nav.querySelectorAll('[data-mobile-panel]').forEach((button) => {
    const panel = button.dataset.mobilePanel;
    const label = t(`mobile.nav.${panel}`);
    const labelEl = button.querySelector('.mobile-panel-nav__label');
    if (labelEl) labelEl.textContent = label;
    button.title = label;
    button.setAttribute('aria-label', label);
  });

}

// ── Mobile header menu ──────────────────────────────────────────────────────

let _mobileHeaderMenuOpen = false;
let _mobileHeaderMenuHandlersBound = false;

function initMobileHeaderMenu() {
  const toggleBtn = document.getElementById('mobile-header-menu-toggle');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setMobileHeaderMenuOpen(!_mobileHeaderMenuOpen);
  });

  bindMobileHeaderMenuHandlers();
  renderMobileHeaderMenu();
}

function bindMobileHeaderMenuHandlers() {
  if (_mobileHeaderMenuHandlersBound) return;
  _mobileHeaderMenuHandlersBound = true;

  document.addEventListener('click', (event) => {
    const wrap = document.getElementById('mobile-header-menu');
    if (!_mobileHeaderMenuOpen || !wrap) return;
    if (event.target instanceof Node && wrap.contains(event.target)) return;
    setMobileHeaderMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (!_mobileHeaderMenuOpen || event.key !== 'Escape') return;
    setMobileHeaderMenuOpen(false, { focusToggle: true });
  });
}

function renderMobileHeaderMenu() {
  const menu = document.getElementById('mobile-header-menu-list');
  if (!menu) return;

  menu.innerHTML = '';
  menu.setAttribute('aria-label', t('mobile.menu.label'));

  menu.appendChild(buildMobileMenuItem(t('toolbar.new'), () => dispatchToolbarAction('new-project')));
  menu.appendChild(buildMobileMenuItem(t('toolbar.open'), () => dispatchToolbarAction('load')));
  menu.appendChild(buildMobileMenuItem(t('toolbar.save'), () => dispatchToolbarAction('save')));
  menu.appendChild(buildMobileMenuSeparator());
  menu.appendChild(buildMobileMenuItem(t('toolbar.download'), () => dispatchToolbarAction('download')));
  menu.appendChild(buildMobileMenuItem(t('toolbar.copy'), () => dispatchToolbarAction('copy-report')));
  menu.appendChild(buildMobileMenuSeparator());
  menu.appendChild(buildMobileMenuItem(mobileLanguageToggleLabel(), toggleMobileLanguage));
  menu.appendChild(buildMobileContactItem());
  const versionSeparator = buildMobileMenuSeparator();
  versionSeparator.dataset.mobileVersionSeparator = 'true';
  menu.appendChild(versionSeparator);
  menu.appendChild(buildMobileVersionInfo());

  updateMobileHeaderMenuLabels();
  updateMobileHeaderVersion();
}

function buildMobileMenuItem(label, action) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mobile-header-menu__item';
  item.setAttribute('role', 'menuitem');
  item.textContent = label;
  item.addEventListener('click', () => {
    setMobileHeaderMenuOpen(false);
    action();
  });
  return item;
}

function buildMobileContactItem() {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mobile-header-menu__item';
  item.dataset.contactFeedback = 'true';
  item.setAttribute('role', 'menuitem');
  item.textContent = t('contact.feedback.link');
  item.title = t('contact.feedback.open');
  item.setAttribute('aria-label', t('contact.feedback.open'));
  item.addEventListener('click', () => setMobileHeaderMenuOpen(false));
  return item;
}

function buildMobileMenuSeparator() {
  const separator = document.createElement('div');
  separator.className = 'mobile-header-menu__separator';
  separator.setAttribute('role', 'separator');
  return separator;
}

function buildMobileVersionInfo() {
  const version = document.createElement('div');
  version.className = 'mobile-header-menu__version';
  version.id = 'mobile-header-menu-version';
  version.setAttribute('role', 'note');
  version.hidden = true;
  return version;
}

function dispatchToolbarAction(action) {
  document.dispatchEvent(new CustomEvent(`toolbar:${action}`));
}

function mobileLanguageToggleLabel() {
  const nextLang = getLang() === 'nl' ? 'en' : 'nl';
  return t('mobile.menu.language', { language: t(`lang.${nextLang}`) });
}

function toggleMobileLanguage() {
  setLang(getLang() === 'nl' ? 'en' : 'nl');
}

function setMobileHeaderMenuOpen(open, options = {}) {
  _mobileHeaderMenuOpen = Boolean(open);
  const toggleBtn = document.getElementById('mobile-header-menu-toggle');
  const menu = document.getElementById('mobile-header-menu-list');

  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(_mobileHeaderMenuOpen));
    toggleBtn.classList.toggle('mobile-header-menu__button--active', _mobileHeaderMenuOpen);
    if (options.focusToggle) toggleBtn.focus();
  }
  if (menu) menu.hidden = !_mobileHeaderMenuOpen;

  updateMobileHeaderMenuLabels();
}

function updateMobileHeaderMenuLabels() {
  const toggleBtn = document.getElementById('mobile-header-menu-toggle');
  const menu = document.getElementById('mobile-header-menu-list');
  const label = t(_mobileHeaderMenuOpen ? 'mobile.menu.close' : 'mobile.menu.open');

  if (toggleBtn) {
    toggleBtn.title = label;
    toggleBtn.setAttribute('aria-label', label);
  }
  if (menu) menu.setAttribute('aria-label', t('mobile.menu.label'));
}

function updateMobileHeaderVersion() {
  const desktopVersion = document.getElementById('app-version');
  const mobileVersion = document.getElementById('mobile-header-menu-version');
  if (!mobileVersion) return;

  const label = desktopVersion?.textContent.trim() ?? '';
  const separator = mobileVersion.previousElementSibling;
  mobileVersion.textContent = label;
  mobileVersion.title = desktopVersion?.title ?? '';
  mobileVersion.hidden = !label;
  if (separator?.dataset.mobileVersionSeparator === 'true') {
    separator.hidden = !label;
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
  if (isMobilePanelLayout()) setMobilePanel('tree');
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
  if (isMobilePanelLayout()) setMobilePanel('tree');
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
  const svg = await prepareCurrentChartSvg();

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
  const svg = await prepareCurrentChartSvg();

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

async function prepareCurrentChartSvg() {
  if (isMobilePanelLayout() && _activeMobilePanel !== 'chart') {
    setMobilePanel('chart');
    await nextAnimationFrame();
  }

  return getCurrentChartSvg();
}

function getCurrentChartSvg() {
  const chartBody = document.querySelector('#chart-panel .panel__body');
  return chartBody ? chartBody._chartSvg : null;
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
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
  updateMobilePanelNavLabels();
  renderMobileHeaderMenu();
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

      updateMobileHeaderVersion();
    })
    .catch(() => {
      // version.json is generated during deploy; local/dev copies may not have it.
    });
}
