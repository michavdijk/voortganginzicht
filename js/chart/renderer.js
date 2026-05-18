/**
 * SVG chart renderer.
 *
 * Builds and inserts an SVG element into the given container element,
 * using layout data produced by layout.js.
 *
 * Each box is split into two vertical sections:
 *   – Title section  : wrapped node name
 *   – Progress section with compact progress bar, optional percentage and
 *     optional actual-spending marker
 */

import {
  computeLayout,
  PROGRESS_BAR_HEIGHT,
  wrapTextToWidth,
  TEXT_H_PADDING,
  TEXT_V_PADDING,
  LINE_HEIGHT,
  FONT_SIZE,
  FONT_FAMILY,
  SIZE_GUIDE_HEIGHT,
} from './layout.js';
import {
  PROJECT_SPENDING_STATUS,
  calcEffectiveActualSpending,
  calcEffectiveOmvang,
  calcProjectSpendingStatus,
} from './progress-calc.js';
import { getColorPalette, normalizeDisclaimerText, normalizeSizeIndicators } from '../model/settings.js';
import { emit } from '../events.js';
import { t } from '../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Fixed colours ─────────────────────────────────────────────────────────────
const COLOR_TEXT_DARK  = '#1E3A5F';
const COLOR_CONNECTOR  = '#94A3B8';
const COLOR_GUIDE      = '#475569';
const COLOR_SIZE_INDICATOR = '#334155';
const COLOR_ACTUAL_SPENDING = '#0F172A';
const COLOR_ACTUAL_SPENDING_OVERRUN = '#DC2626';
const COLOR_COMPLETE = '#16A34A';
const COLOR_WHITE      = '#FFFFFF';
const COLOR_PROJECT_STATUS_CONFORM = '#16A34A';
const COLOR_PROJECT_STATUS_MORE    = '#EA580C';
const COLOR_PROJECT_STATUS_LESS    = '#2563EB';
const PROGRESS_TRACK_HEIGHT = 6;
const PROGRESS_LABEL_WIDTH  = 30;
const PROGRESS_LABEL_GAP    = 8;
const COMPLETE_ICON_SIZE = 14;
const ACTUAL_SPENDING_MARKER_STROKE_WIDTH = 2.5;
const ACTUAL_SPENDING_MARKER_HALO_WIDTH = 4.5;
const ACTUAL_SPENDING_MARKER_Y_OFFSET = 4;
const ACTUAL_SPENDING_OVERRUN_LABEL_MIN_WIDTH = 42;
const ACTUAL_SPENDING_OVERRUN_LABEL_GAP = 2;
const ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT = 12;
const ACTUAL_SPENDING_OVERRUN_LABEL_H_PADDING = 4;
const ACTUAL_SPENDING_OVERRUN_LABEL_LEFT_PADDING = 8;
const ACTUAL_SPENDING_OVERRUN_LABEL_CHAR_WIDTH = 6.2;
const PROJECT_STATUS_TOP_GAP = 10;
const PROJECT_STATUS_DOT_RADIUS = 7;
const PROJECT_STATUS_TEXT_GAP = 8;
const PROJECT_STATUS_FONT_SIZE = 12;
const PROJECT_STATUS_SUFFIX_FONT_SIZE = 10;
const PROJECT_STATUS_SUFFIX_GAP = 2;
const PROJECT_STATUS_CHAR_WIDTH = 6.3;
const FOOTER_BLOCK_GAP = 8;
const FOOTER_SIDE_PADDING = 16;
const FOOTER_TITLE_Y_OFFSET = 15;
const FOOTER_CONTENT_Y_OFFSET = 34;
const FOOTER_BOTTOM_PADDING = 14;
const LEGEND_ROW_GAP = 22;
const LEGEND_WIDTH = 180;
const DISCLAIMER_MIN_WIDTH = 240;
const PROJECT_TITLE_FONT_SIZE = 21;
const PROJECT_TITLE_LINE_HEIGHT = 27;
const PROJECT_TITLE_BOTTOM_GAP = 6;
const PROJECT_TITLE_FONT_WEIGHT = 700;
const PROJECT_TITLE_CHAR_WIDTH = 10.8;
const DISCLAIMER_TEXT_LINE_HEIGHT = 16;
const DISCLAIMER_TEXT_FONT_SIZE = 12;
const DISCLAIMER_CHAR_WIDTH = 6.1;
const EMPTY_DISCLAIMER_LINE = String.fromCharCode(160);
let disclaimerTextMeasureContext = null;
let disclaimerSvgMeasure = null;
let projectTitleTextMeasureContext = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the progress chart into the given container element.
 * Clears any existing content and replaces it with the generated SVG.
 * Stores the SVG reference on `container._chartSvg` for PNG export.
 *
 * @param {HTMLElement} container
 * @param {import('../model/tree.js').Knoop} root
 * @param {{ showProjectTitle?: boolean, projectName?: string, showPercentage: boolean, showCompleteCheck?: boolean, showLegend?: boolean, showDisclaimer?: boolean, disclaimerText?: string, colorScheme: string, customColor?: string, showActualSpending?: boolean, showProjectStatus?: boolean, showSizeIndicators?: boolean, sizeIndicators?: Array<{ omvang: number | null, label: string }>, chartZoom?: number }} settings
 */
export function renderChart(container, root, settings = { showPercentage: true, colorScheme: 'blauw' }) {
  // Measure available width via a cascade of fallbacks.
  // container has width:100% CSS, so clientWidth should be reliable.
  // Fall through to progressively more expensive methods if needed.
  const panelBody  = container.closest('.panel__body');
  const panelChart = container.closest('.panel--chart');
  const measured   =
    container.clientWidth                                               ||
    (panelBody  ? panelBody.clientWidth  : 0)                          ||
    (panelChart ? Math.round(panelChart.getBoundingClientRect().width) : 0) ||
    (window.innerWidth - (document.querySelector('.panel--tree')?.offsetWidth ?? 0));
  const chartZoom = normalizeChartZoom(settings.chartZoom);
  const containerWidth = Math.max(200, measured / chartZoom);

  container.innerHTML = `<div class="chart-loading">${t('chart.calculating')}</div>`;

  const palette = getColorPalette(settings);
  const showCompleteCheck = Boolean(settings.showCompleteCheck);
  const activeSizeIndicators = settings.showSizeIndicators
    ? normalizeSizeIndicators(settings.sizeIndicators)
    : [];
  const { boxes, connectors, sizeGuide, sizeIndicators, totalWidth, totalHeight, chartBottom } = computeLayout(
    root,
    containerWidth,
    {
      sizeIndicators: activeSizeIndicators,
      hideSizeGuide: Boolean(settings.showSizeIndicators),
    }
  );
  const projectStatus = settings.showActualSpending && settings.showProjectStatus
    ? calcProjectSpendingStatus(root)
    : null;
  const projectStatusBox = projectStatus
    ? boxes.find(box => box.node === root)
    : null;
  const projectTitle = settings.showProjectTitle
    ? normalizeProjectTitle(settings.projectName)
    : '';
  const projectTitleLines = projectTitle
    ? wrapProjectTitleToWidth(projectTitle, Math.max(1, totalWidth - 2 * FOOTER_SIDE_PADDING))
    : [];
  const projectTitleOffset = projectTitleLines.length > 0
    ? calculateProjectTitleOffset(projectTitleLines)
    : 0;
  if (projectTitleOffset > 0) {
    shiftChartLayoutY(boxes, connectors, sizeGuide, sizeIndicators, projectTitleOffset);
  }
  const baseTotalHeight = totalHeight + projectTitleOffset;
  const chartBottomY = chartBottom + projectTitleOffset;

  const svg = createEl('svg');
  svg.setAttribute('xmlns',   SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${baseTotalHeight}`);
  // Keep pixel dimensions as attributes so PNG export gets the right size.
  // CSS overrides these for display: width fills container, height follows
  // the viewBox aspect ratio (no letterboxing, no distortion).
  svg.setAttribute('width',  String(totalWidth));
  svg.setAttribute('height', String(baseTotalHeight));
  svg.style.fontFamily = FONT_FAMILY;
  svg.style.display    = 'block';
  svg.style.width      = '100%';
  svg.style.height     = 'auto';

  if (projectTitleLines.length > 0) {
    svg.appendChild(buildProjectTitle(totalWidth, projectTitleLines, palette));
  }

  // Size indicators and connectors are drawn first so boxes render on top.
  for (const indicator of sizeIndicators) {
    svg.appendChild(buildSizeIndicator(indicator));
  }
  for (const conn of connectors) {
    svg.appendChild(buildConnector(conn));
  }
  for (const box of boxes) {
    svg.appendChild(buildBox(box, palette, settings.showPercentage, showCompleteCheck, Boolean(settings.showActualSpending)));
  }
  if (sizeGuide) {
    svg.appendChild(buildSizeGuide(sizeGuide));
  }

  // Add footer blocks if enabled.
  const disclaimerText = settings.showDisclaimer
    ? normalizeDisclaimerText(settings.disclaimerText)
    : '';
  const showDisclaimer = disclaimerText.trim().length > 0;
  const showLegend = settings.showLegend === true;
  const showCompleteLegendRow = showCompleteCheck && boxes.some(box => canRenderCompleteIndicator(box));
  const showActualSpendingLegendRow = Boolean(settings.showActualSpending) &&
    boxes.some(box => canRenderActualSpendingMarker(box, Boolean(settings.showPercentage)));
  const legendRows = 1 + (showCompleteLegendRow ? 1 : 0) + (showActualSpendingLegendRow ? 1 : 0);
  const legendHeight = FOOTER_CONTENT_Y_OFFSET + (legendRows - 1) * LEGEND_ROW_GAP + FOOTER_BOTTOM_PADDING;
  let extendedTotalWidth = totalWidth;
  let extendedTotalHeight = baseTotalHeight;

  if (showLegend || showDisclaimer) {
    const footerY = sizeGuide
      ? sizeGuide.y + SIZE_GUIDE_HEIGHT + 8
      : chartBottomY + 24;
    const footerX = FOOTER_SIDE_PADDING;
    let footerRight = Math.max(getFooterRightEdge(boxes), footerX + (showLegend ? LEGEND_WIDTH : DISCLAIMER_MIN_WIDTH));
    let legendX = null;
    let disclaimerX = null;
    let disclaimerWidth = 0;

    if (showLegend && showDisclaimer) {
      legendX = footerRight - LEGEND_WIDTH;
      disclaimerX = footerX;
      disclaimerWidth = Math.max(1, legendX - FOOTER_BLOCK_GAP - disclaimerX);
    } else if (showLegend) {
      legendX = Math.max(footerRight - LEGEND_WIDTH, footerX);
    } else {
      disclaimerX = footerX;
      disclaimerWidth = Math.max(1, footerRight - disclaimerX);
    }

    const disclaimerHeight = showDisclaimer
      ? calculateDisclaimerHeight(disclaimerText, disclaimerWidth)
      : 0;
    const footerHeight = Math.max(
      showLegend ? legendHeight : 0,
      disclaimerHeight
    );

    if (showDisclaimer) {
      svg.appendChild(buildDisclaimer(disclaimerX, footerY, disclaimerWidth, footerHeight, disclaimerText, palette));
    }
    if (showLegend) {
      svg.appendChild(buildLegend(legendX, footerY, LEGEND_WIDTH, footerHeight, palette, {
        showComplete: showCompleteLegendRow,
        showActualSpending: showActualSpendingLegendRow,
      }));
    }

    extendedTotalHeight = Math.max(extendedTotalHeight, footerY + footerHeight + FOOTER_SIDE_PADDING);
    extendedTotalWidth = Math.max(extendedTotalWidth, footerRight + FOOTER_SIDE_PADDING);
  }

  if (projectStatus && projectStatusBox) {
    const statusIndicator = buildProjectStatus(projectStatus, root.id, projectStatusBox);
    const statusBottom = Number(statusIndicator.getAttribute('data-project-status-bottom'));
    if (Number.isFinite(statusBottom)) {
      extendedTotalHeight = Math.max(extendedTotalHeight, statusBottom + 16);
    }
    svg.appendChild(statusIndicator);
  }

  svg.setAttribute('viewBox', `0 0 ${extendedTotalWidth} ${extendedTotalHeight}`);
  svg.setAttribute('width', String(extendedTotalWidth));
  svg.setAttribute('height', String(extendedTotalHeight));

  container._chartSvg = svg;
  container.innerHTML = '';
  container.appendChild(svg);
}

/**
 * Return the stored SVG element from the container, or null if not present.
 * @param {HTMLElement} container
 * @returns {SVGSVGElement | null}
 */
export function getRenderSvg(container) {
  return container._chartSvg || null;
}

function normalizeChartZoom(value) {
  const zoom = Number(value);
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(2, Math.max(0.5, zoom));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canRenderActualSpendingMarker(box, showPercentage) {
  const { node, width } = box;
  const actualSpending = calcEffectiveActualSpending(node);
  const omvang = calcEffectiveOmvang(node);
  const pctReserve = showPercentage ? PROGRESS_LABEL_WIDTH + PROGRESS_LABEL_GAP : 0;
  const trackWidth = Math.max(0, width - 2 * TEXT_H_PADDING - pctReserve);

  return (
    Number.isFinite(actualSpending) &&
    Number.isFinite(omvang) &&
    actualSpending >= 0 &&
    omvang >= 1 &&
    trackWidth > 0
  );
}

function canRenderCompleteIndicator(box) {
  const titleHeight = box.height - PROGRESS_BAR_HEIGHT;
  return (
    box.progress >= 99.999 &&
    titleHeight >= COMPLETE_ICON_SIZE + 4 &&
    box.width > 2 * TEXT_H_PADDING + COMPLETE_ICON_SIZE
  );
}

function getFooterRightEdge(boxes) {
  const activiteitBoxes = boxes.filter(box => box.node.kinderen.length === 0);
  const footerBoxes = activiteitBoxes.length > 0 ? activiteitBoxes : boxes;
  return Math.max(...footerBoxes.map(box => box.x + box.width));
}

function shiftChartLayoutY(boxes, connectors, sizeGuide, sizeIndicators, dy) {
  for (const box of boxes) {
    box.y += dy;
  }
  for (const connector of connectors) {
    connector.y1 += dy;
    connector.y2 += dy;
  }
  if (sizeGuide) {
    sizeGuide.y += dy;
  }
  for (const indicator of sizeIndicators) {
    indicator.y1 += dy;
    indicator.y2 += dy;
    indicator.labelY += dy;
  }
}

function normalizeProjectTitle(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function calculateProjectTitleOffset(lines) {
  const lastBaseline = PROJECT_TITLE_FONT_SIZE + (lines.length - 1) * PROJECT_TITLE_LINE_HEIGHT;
  return lastBaseline + PROJECT_TITLE_BOTTOM_GAP;
}

function buildProjectTitle(width, lines, palette) {
  const text = createEl('text');
  text.setAttribute('data-chart-project-title', 'true');
  setAttrs(text, {
    x: width / 2,
    y: PROJECT_TITLE_FONT_SIZE,
    fill: palette.fill,
    'font-size': PROJECT_TITLE_FONT_SIZE,
    'font-weight': PROJECT_TITLE_FONT_WEIGHT,
    'text-anchor': 'middle',
  });

  lines.forEach((line, index) => {
    const tspan = createEl('tspan');
    tspan.setAttribute('x', width / 2);
    if (index > 0) tspan.setAttribute('dy', String(PROJECT_TITLE_LINE_HEIGHT));
    tspan.textContent = line;
    text.appendChild(tspan);
  });

  return text;
}

function wrapProjectTitleToWidth(text, maxLineWidth) {
  if (maxLineWidth <= 0) return [text];

  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureProjectTitleText(candidate) <= maxLineWidth) {
      current = candidate;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = '';
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function measureProjectTitleText(text) {
  const context = getProjectTitleTextMeasureContext();
  if (context) return context.measureText(text).width;
  return String(text).length * PROJECT_TITLE_CHAR_WIDTH;
}

function getProjectTitleTextMeasureContext() {
  if (projectTitleTextMeasureContext) return projectTitleTextMeasureContext;

  if (typeof document !== 'undefined') {
    projectTitleTextMeasureContext = document.createElement('canvas').getContext('2d');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    projectTitleTextMeasureContext = new OffscreenCanvas(1, 1).getContext('2d');
  }

  if (projectTitleTextMeasureContext) {
    projectTitleTextMeasureContext.font = `${PROJECT_TITLE_FONT_WEIGHT} ${PROJECT_TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
  }

  return projectTitleTextMeasureContext;
}

// ── Box builder ───────────────────────────────────────────────────────────────

/**
 * Build a <g> with two sections: a title area (wrapped text) and a progress bar.
 *
 * Layout:
 *   ┌───────────────────────┐  ← y
 *   │  Node name            │  titleHeight (variable)
 *   │  (wrapped if needed)  │
 *   ├───────────────────────┤  ← y + titleHeight
 *   │  ████████░░░  65%     │  PROGRESS_BAR_HEIGHT (fixed)
 *   └───────────────────────┘
 *
 * @param {import('./layout.js').BoxDescriptor} box
 * @param {{ fill: string, bg: string, border: string, text?: string }} palette
 * @param {boolean} showPercentage
 * @param {boolean} showCompleteCheck
 * @param {boolean} showActualSpending
 * @returns {SVGGElement}
 */
function buildBox(box, palette, showPercentage, showCompleteCheck, showActualSpending) {
  const { x, y, width, height, progress, node } = box;
  const g           = createEl('g');
  g.classList.add('chart-node');
  g.setAttribute('data-chart-node', 'true');
  g.setAttribute('data-chart-node-id', node.id);
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('aria-label', t('chart.jumpToNode', { name: node.naam }));
  g.addEventListener('click', () => emit('chart-node-selected', { nodeId: node.id }));
  g.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    emit('chart-node-selected', { nodeId: node.id });
  });

  const actionTitle = createEl('title');
  actionTitle.textContent = t('chart.jumpToNode', { name: node.naam });
  g.appendChild(actionTitle);

  const titleHeight = height - PROGRESS_BAR_HEIGHT;
  const barY        = y + titleHeight;
  const isBranch    = node.kinderen.length > 0;
  const effectiveOmvang = calcEffectiveOmvang(node);
  const effectiveActualSpending = calcEffectiveActualSpending(node);
  const titleFill   = isBranch ? COLOR_WHITE : palette.bg;
  const borderColor = isBranch ? (palette.text ?? palette.fill) : palette.border;
  const titleColor  = isBranch ? (palette.text ?? palette.fill) : COLOR_TEXT_DARK;

  // Clip path keeps all children within the rounded box boundary.
  const clipId   = `clip-${node.id}`;
  const clipPath = createEl('clipPath');
  clipPath.setAttribute('id', clipId);
  const clipRect = createEl('rect');
  setAttrs(clipRect, { x, y, width, height, rx: 4 });
  clipPath.appendChild(clipRect);
  g.appendChild(clipPath);

  // ── Title section ─────────────────────────────────────────────────────────
  const titleBg = createEl('rect');
  setAttrs(titleBg, { x, y, width, height: titleHeight, fill: titleFill, 'clip-path': `url(#${clipId})` });
  g.appendChild(titleBg);

  // ── Progress section ──────────────────────────────────────────────────────
  const barBg = createEl('rect');
  setAttrs(barBg, { x, y: barY, width, height: PROGRESS_BAR_HEIGHT, fill: COLOR_WHITE, 'clip-path': `url(#${clipId})` });
  g.appendChild(barBg);
  buildProgressBar(g, {
    x,
    y: barY,
    width,
    progress,
    palette,
    showPercentage,
    clipId,
    actualSpending: showActualSpending ? effectiveActualSpending : null,
    omvang: effectiveOmvang,
  });
  const completeIndicator = buildCompleteIndicator({
    x,
    y,
    width,
    titleHeight,
    clipId,
    isComplete: showCompleteCheck && progress >= 99.999,
  });
  if (completeIndicator) g.appendChild(completeIndicator);

  // ── Divider line ──────────────────────────────────────────────────────────
  const divider = createEl('line');
  setAttrs(divider, { x1: x, y1: barY, x2: x + width, y2: barY, stroke: palette.border, 'stroke-width': 1 });
  g.appendChild(divider);

  // ── Outer border ──────────────────────────────────────────────────────────
  const border = createEl('rect');
  border.classList.add('chart-node__border');
  setAttrs(border, { x, y, width, height, fill: 'none', stroke: borderColor, 'stroke-width': 1, rx: 4 });
  g.appendChild(border);

  // ── Wrapped title text (vertically centred) ──────────────────────────────
  const textAreaWidth   = Math.max(1, width - 2 * TEXT_H_PADDING);
  const lines           = wrapTextToWidth(node.naam, textAreaWidth);

  // Total visual height of the text block:
  //   (n-1) line gaps + cap height of the last line.
  const totalTextHeight = (lines.length - 1) * LINE_HEIGHT + FONT_SIZE;
  const textTopY        = y + (titleHeight - totalTextHeight) / 2;
  // SVG text y is the alphabetic baseline. For system-ui sans-serif the
  // cap height is ~77 % of font-size, so baseline = textTop + 0.77 * fontSize.
  const textBaselineY   = textTopY + Math.round(FONT_SIZE * 0.77);

  const textEl = createEl('text');
  setAttrs(textEl, {
    x:             x + TEXT_H_PADDING,
    y:             textBaselineY,
    fill:          titleColor,
    'font-size':   FONT_SIZE,
    'font-family': FONT_FAMILY,
    'clip-path':   `url(#${clipId})`,
  });
  lines.forEach((line, i) => {
    const tspan = createEl('tspan');
    tspan.setAttribute('x', String(x + TEXT_H_PADDING));
    if (i > 0) tspan.setAttribute('dy', String(LINE_HEIGHT));
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });
  g.appendChild(textEl);

  return g;
}

function buildProgressBar(g, { x, y, width, progress, palette, showPercentage, clipId, actualSpending, omvang }) {
  const pctReserve = showPercentage ? PROGRESS_LABEL_WIDTH + PROGRESS_LABEL_GAP : 0;
  const trackX     = x + TEXT_H_PADDING;
  const trackY     = y + (PROGRESS_BAR_HEIGHT - PROGRESS_TRACK_HEIGHT) / 2;
  const trackWidth = Math.max(0, width - 2 * TEXT_H_PADDING - pctReserve);
  const fillWidth  = trackWidth * (progress / 100);

  if (trackWidth > 0) {
    const track = createEl('rect');
    setAttrs(track, {
      x: trackX,
      y: trackY,
      width: trackWidth,
      height: PROGRESS_TRACK_HEIGHT,
      rx: PROGRESS_TRACK_HEIGHT / 2,
      fill: palette.bg,
      'clip-path': `url(#${clipId})`,
    });
    g.appendChild(track);

    if (fillWidth > 0) {
      const fill = createEl('rect');
      setAttrs(fill, {
        x: trackX,
        y: trackY,
        width: fillWidth,
        height: PROGRESS_TRACK_HEIGHT,
        rx: PROGRESS_TRACK_HEIGHT / 2,
        fill: palette.fill,
        'clip-path': `url(#${clipId})`,
      });
      g.appendChild(fill);
    }

    const marker = buildActualSpendingMarker({
      actualSpending,
      omvang,
      trackX,
      trackY,
      trackWidth,
      clipId,
    });
    if (marker) g.appendChild(marker);
  }

  if (!showPercentage) return;

  const pctText = createEl('text');
  setAttrs(pctText, {
    x:                   x + width - TEXT_H_PADDING,
    y:                   y + PROGRESS_BAR_HEIGHT / 2,
    'text-anchor':       'end',
    'dominant-baseline': 'middle',
    fill:                palette.text ?? palette.fill,
    'font-size':         10,
    'font-weight':       600,
    'font-family':       FONT_FAMILY,
    'clip-path':         `url(#${clipId})`,
  });
  pctText.textContent = `${Math.round(progress)}%`;
  g.appendChild(pctText);
}

function buildCompleteIndicator({ x, y, width, titleHeight, clipId, isComplete }) {
  if (!isComplete || titleHeight < COMPLETE_ICON_SIZE + 4 || width <= 2 * TEXT_H_PADDING + COMPLETE_ICON_SIZE) {
    return null;
  }

  const rightEdge = x + width - TEXT_H_PADDING;
  const iconCenterX = rightEdge - COMPLETE_ICON_SIZE / 2;
  const iconCenterY = y + Math.min(titleHeight / 2, TEXT_V_PADDING + COMPLETE_ICON_SIZE / 2);
  const half = COMPLETE_ICON_SIZE / 2;

  const indicator = createEl('g');
  indicator.setAttribute('clip-path', `url(#${clipId})`);
  indicator.setAttribute('data-complete-indicator', 'true');

  const title = createEl('title');
  title.textContent = t('chart.complete.title');
  indicator.appendChild(title);

  const check = createEl('path');
  const checkPath = `M ${iconCenterX - half + 2} ${iconCenterY} L ${iconCenterX - 1} ${iconCenterY + 4} L ${iconCenterX + half - 2} ${iconCenterY - 4}`;

  const halo = createEl('path');
  setAttrs(halo, {
    d: checkPath,
    fill: 'none',
    stroke: COLOR_WHITE,
    'stroke-width': 5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-opacity': 0.92,
  });
  indicator.appendChild(halo);

  setAttrs(check, {
    d: checkPath,
    fill: 'none',
    stroke: COLOR_COMPLETE,
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  indicator.appendChild(check);

  return indicator;
}

function buildActualSpendingMarker({ actualSpending, omvang, trackX, trackY, trackWidth, clipId }) {
  if (
    !Number.isFinite(actualSpending) ||
    !Number.isFinite(omvang) ||
    actualSpending < 0 ||
    omvang < 1 ||
    trackWidth <= 0
  ) {
    return null;
  }

  const isOverrun = actualSpending > omvang;
  const clamped = Math.min(actualSpending, omvang);
  const percentage = Math.round((actualSpending / omvang) * 100);
  const overrunPercentage = Math.round(((actualSpending - omvang) / omvang) * 100);
  const rawMarkerX = trackX + (clamped / omvang) * trackWidth;
  const markerInset = Math.min(ACTUAL_SPENDING_MARKER_HALO_WIDTH / 2, trackWidth / 2);
  const markerX = clamp(rawMarkerX, trackX + markerInset, trackX + trackWidth - markerInset);
  const markerTopY = trackY - ACTUAL_SPENDING_MARKER_Y_OFFSET;
  const markerBottomY = trackY + PROGRESS_TRACK_HEIGHT + ACTUAL_SPENDING_MARKER_Y_OFFSET;
  const markerColor = isOverrun ? COLOR_ACTUAL_SPENDING_OVERRUN : COLOR_ACTUAL_SPENDING;

  const marker = createEl('g');
  marker.setAttribute('clip-path', `url(#${clipId})`);
  marker.setAttribute('data-actual-spending-marker', 'true');
  marker.setAttribute('data-actual-spending-marker-x', String(markerX));
  marker.setAttribute('data-actual-spending-track-start', String(trackX));
  marker.setAttribute('data-actual-spending-track-end', String(trackX + trackWidth));
  marker.setAttribute('data-actual-spending-value', String(actualSpending));
  marker.setAttribute('data-actual-spending-clamped', String(actualSpending > omvang));
  marker.setAttribute('data-actual-spending-overrun', String(isOverrun));
  marker.setAttribute('data-actual-spending-percentage', String(percentage));
  marker.setAttribute('data-actual-spending-overrun-percentage', String(isOverrun ? overrunPercentage : 0));

  const title = createEl('title');
  title.textContent = isOverrun
    ? t('chart.actualSpending.overrunTitle', { value: actualSpending, size: omvang, percentage, overrun: overrunPercentage })
    : t('chart.actualSpending.markerTitle', { value: actualSpending });
  marker.appendChild(title);

  const halo = createEl('line');
  setAttrs(halo, {
    x1: markerX,
    y1: markerTopY,
    x2: markerX,
    y2: markerBottomY,
    stroke: COLOR_WHITE,
    'stroke-width': ACTUAL_SPENDING_MARKER_HALO_WIDTH,
    'stroke-linecap': 'round',
  });
  marker.appendChild(halo);

  const line = createEl('line');
  line.setAttribute('data-actual-spending-marker-line', 'true');
  setAttrs(line, {
    x1: markerX,
    y1: markerTopY,
    x2: markerX,
    y2: markerBottomY,
    stroke: markerColor,
    'stroke-width': ACTUAL_SPENDING_MARKER_STROKE_WIDTH,
    'stroke-linecap': 'round',
  });
  marker.appendChild(line);

  if (isOverrun && trackWidth >= ACTUAL_SPENDING_OVERRUN_LABEL_MIN_WIDTH) {
    const labelText = `+${overrunPercentage}%`;
    const labelWidth = Math.ceil(
      labelText.length * ACTUAL_SPENDING_OVERRUN_LABEL_CHAR_WIDTH +
      ACTUAL_SPENDING_OVERRUN_LABEL_LEFT_PADDING +
      ACTUAL_SPENDING_OVERRUN_LABEL_H_PADDING
    );
    const labelRight = markerX;
    const labelY = markerTopY - ACTUAL_SPENDING_OVERRUN_LABEL_GAP - ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT;

    const badge = createEl('rect');
    setAttrs(badge, {
      x: labelRight - labelWidth,
      y: labelY,
      width: labelWidth,
      height: ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT,
      rx: 2,
      fill: COLOR_ACTUAL_SPENDING_OVERRUN,
    });
    marker.appendChild(badge);

    const label = createEl('text');
    setAttrs(label, {
      x: labelRight - ACTUAL_SPENDING_OVERRUN_LABEL_H_PADDING,
      y: labelY + ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT / 2,
      'dominant-baseline': 'middle',
      'text-anchor': 'end',
      fill: COLOR_WHITE,
      'font-size': 9,
      'font-weight': 700,
      'font-family': FONT_FAMILY,
    });
    label.setAttribute('data-actual-spending-overrun-label', 'true');
    label.textContent = labelText;
    marker.appendChild(label);
  }

  return marker;
}

function buildProjectStatus(status, nodeId, box) {
  const isComplete = box.progress >= 99.999;
  const label = projectStatusLabel(status);
  const suffix = isComplete ? '' : t('chart.projectStatus.soFarSuffix');
  const color = projectStatusColor(status);
  const estimatedTextWidth = Math.ceil(label.length * PROJECT_STATUS_CHAR_WIDTH);
  const contentWidth = PROJECT_STATUS_DOT_RADIUS * 2 + PROJECT_STATUS_TEXT_GAP + estimatedTextWidth;
  const leftX = box.x + Math.max(TEXT_H_PADDING, (box.width - contentWidth) / 2);
  const dotX = leftX + PROJECT_STATUS_DOT_RADIUS;
  const textX = leftX + PROJECT_STATUS_DOT_RADIUS * 2 + PROJECT_STATUS_TEXT_GAP;
  const statusTopY = box.y + box.height + PROJECT_STATUS_TOP_GAP;
  const centerY = statusTopY + PROJECT_STATUS_DOT_RADIUS;
  const suffixY = centerY + PROJECT_STATUS_DOT_RADIUS + PROJECT_STATUS_SUFFIX_GAP + PROJECT_STATUS_SUFFIX_FONT_SIZE / 2;
  const statusBottom = suffix
    ? suffixY + PROJECT_STATUS_SUFFIX_FONT_SIZE / 2
    : centerY + PROJECT_STATUS_DOT_RADIUS;

  const g = createEl('g');
  g.setAttribute('data-project-status', status);
  g.setAttribute('data-project-status-node-id', nodeId);
  g.setAttribute('data-project-status-position', 'below-goal');
  g.setAttribute('data-project-status-bottom', String(statusBottom));
  g.setAttribute('data-project-status-content-width', String(contentWidth));
  g.setAttribute('data-project-status-goal-width', String(box.width));
  g.setAttribute('aria-label', suffix ? `${label}, ${suffix}` : label);

  const dot = createEl('circle');
  dot.setAttribute('data-project-status-indicator', 'true');
  setAttrs(dot, {
    cx: dotX,
    cy: centerY,
    r: PROJECT_STATUS_DOT_RADIUS,
    fill: color,
    'fill-opacity': 1,
  });
  g.appendChild(dot);

  const text = createEl('text');
  text.setAttribute('data-project-status-label', 'true');
  setAttrs(text, {
    x: textX,
    y: centerY,
    'dominant-baseline': 'central',
    'alignment-baseline': 'central',
    'text-anchor': 'start',
    fill: '#334155',
    'font-size': PROJECT_STATUS_FONT_SIZE,
    'font-weight': 600,
    'font-family': FONT_FAMILY,
  });
  text.textContent = label;
  g.appendChild(text);

  if (suffix) {
    const suffixText = createEl('text');
    suffixText.setAttribute('data-project-status-suffix', 'true');
    setAttrs(suffixText, {
      x: box.x + box.width / 2,
      y: suffixY,
      'dominant-baseline': 'central',
      'alignment-baseline': 'central',
      'text-anchor': 'middle',
      fill: '#64748B',
      'font-size': PROJECT_STATUS_SUFFIX_FONT_SIZE,
      'font-weight': 600,
      'font-style': 'italic',
      'font-family': FONT_FAMILY,
    });
    suffixText.textContent = suffix;
    g.appendChild(suffixText);
  }

  return g;
}

function projectStatusLabel(status) {
  let label = t('chart.projectStatus.conform');
  if (status === PROJECT_SPENDING_STATUS.MORE) label = t('chart.projectStatus.more');
  if (status === PROJECT_SPENDING_STATUS.LESS) label = t('chart.projectStatus.less');
  return label;
}

function projectStatusColor(status) {
  if (status === PROJECT_SPENDING_STATUS.MORE) return COLOR_PROJECT_STATUS_MORE;
  if (status === PROJECT_SPENDING_STATUS.LESS) return COLOR_PROJECT_STATUS_LESS;
  return COLOR_PROJECT_STATUS_CONFORM;
}

// ── Legend builder ───────────────────────────────────────────────────────────

function buildLegend(x, y, width, height, palette, { showComplete, showActualSpending }) {
  const g = createEl('g');
  g.setAttribute('data-chart-legend', 'true');
  g.setAttribute('data-complete-legend-row', String(showComplete));
  g.setAttribute('data-actual-spending-legend-row', String(showActualSpending));

  const background = createEl('rect');
  setAttrs(background, {
    x,
    y,
    width,
    height,
    rx: 10,
    ry: 10,
    fill: COLOR_WHITE,
    stroke: '#CBD5E1',
    'stroke-width': 1,
  });
  g.appendChild(background);

  const title = createEl('text');
  title.setAttribute('data-chart-legend-title', 'true');
  setAttrs(title, {
    x: x + 12,
    y: y + FOOTER_TITLE_Y_OFFSET,
    fill: palette.fill,
    'font-size': 11,
    'font-family': FONT_FAMILY,
    'font-weight': 800,
  });
  title.textContent = t('chart.legend.title').toUpperCase();
  g.appendChild(title);

  const leftColumnX = x + 12;
  const rightColumnX = x + 56;
  let rowY = y + FOOTER_CONTENT_Y_OFFSET;

  const progressLabel = createEl('text');
  setAttrs(progressLabel, {
    x: rightColumnX,
    y: rowY,
    fill: COLOR_TEXT_DARK,
    'font-size': 12,
    'font-family': FONT_FAMILY,
    'font-weight': 400,
    'dominant-baseline': 'middle',
  });
  progressLabel.textContent = t('chart.legend.progress');
  g.appendChild(progressLabel);

  const barX = leftColumnX;
  const barY = rowY - 5;
  const barWidth = 36;
  const trackHeight = PROGRESS_TRACK_HEIGHT;
  const fillWidth = Math.max(0, barWidth * 0.5);

  const track = createEl('rect');
  setAttrs(track, {
    x: barX,
    y: barY,
    width: barWidth,
    height: trackHeight,
    rx: trackHeight / 2,
    fill: palette.bg,
  });
  g.appendChild(track);

  const fill = createEl('rect');
  setAttrs(fill, {
    x: barX,
    y: barY,
    width: fillWidth,
    height: trackHeight,
    rx: trackHeight / 2,
    fill: palette.fill,
  });
  g.appendChild(fill);
  rowY += LEGEND_ROW_GAP;

  if (showComplete) {
    const markerX = leftColumnX + barWidth / 2;
    const markerY = rowY;
    const half = COMPLETE_ICON_SIZE / 2;
    const checkPath = `M ${markerX - half + 2} ${markerY} L ${markerX - 1} ${markerY + 4} L ${markerX + half - 2} ${markerY - 4}`;

    const halo = createEl('path');
    setAttrs(halo, {
      d: checkPath,
      fill: 'none',
      stroke: COLOR_WHITE,
      'stroke-width': 5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-opacity': 0.92,
    });
    g.appendChild(halo);

    const check = createEl('path');
    check.setAttribute('data-complete-legend-marker', 'true');
    setAttrs(check, {
      d: checkPath,
      fill: 'none',
      stroke: COLOR_COMPLETE,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    g.appendChild(check);

    const label = createEl('text');
    setAttrs(label, {
      x: rightColumnX,
      y: rowY,
      fill: COLOR_TEXT_DARK,
      'font-size': 12,
      'font-family': FONT_FAMILY,
      'font-weight': 400,
      'dominant-baseline': 'middle',
    });
    label.setAttribute('data-complete-legend-label', 'true');
    label.textContent = t('chart.complete.legend');
    g.appendChild(label);

    rowY += LEGEND_ROW_GAP;
  }

  if (showActualSpending) {
    const markerX = leftColumnX + barWidth / 2;
    const markerTopY = rowY - 8;
    const markerBottomY = rowY + 8;
    const marker = createEl('g');
    marker.setAttribute('data-actual-spending-legend-marker', 'true');

    const halo = createEl('line');
    setAttrs(halo, {
      x1: markerX,
      y1: markerTopY,
      x2: markerX,
      y2: markerBottomY,
      stroke: COLOR_WHITE,
      'stroke-width': ACTUAL_SPENDING_MARKER_HALO_WIDTH,
      'stroke-linecap': 'round',
    });
    marker.appendChild(halo);

    const line = createEl('line');
    setAttrs(line, {
      x1: markerX,
      y1: markerTopY,
      x2: markerX,
      y2: markerBottomY,
      stroke: COLOR_ACTUAL_SPENDING,
      'stroke-width': ACTUAL_SPENDING_MARKER_STROKE_WIDTH,
      'stroke-linecap': 'round',
    });
    marker.appendChild(line);

    g.appendChild(marker);

    const label = createEl('text');
    setAttrs(label, {
      x: rightColumnX,
      y: rowY,
      fill: COLOR_TEXT_DARK,
      'font-size': 12,
      'font-family': FONT_FAMILY,
      'font-weight': 400,
      'dominant-baseline': 'middle',
    });
    label.setAttribute('data-actual-spending-legend-label', 'true');
    label.textContent = t('chart.actualSpending.legend');
    g.appendChild(label);
  }

  return g;
}

// ── Disclaimer builder ──────────────────────────────────────────────────────

function calculateDisclaimerHeight(text, width) {
  const lines = wrapDisclaimerText(text, width);
  return FOOTER_CONTENT_Y_OFFSET + (lines.length - 1) * DISCLAIMER_TEXT_LINE_HEIGHT + FOOTER_BOTTOM_PADDING;
}

function buildDisclaimer(x, y, width, height, text, palette) {
  const g = createEl('g');
  g.setAttribute('data-chart-disclaimer', 'true');

  const background = createEl('rect');
  setAttrs(background, {
    x,
    y,
    width,
    height,
    rx: 10,
    ry: 10,
    fill: COLOR_WHITE,
    stroke: '#CBD5E1',
    'stroke-width': 1,
  });
  g.appendChild(background);

  const title = createEl('text');
  title.setAttribute('data-chart-disclaimer-title', 'true');
  setAttrs(title, {
    x: x + 12,
    y: y + FOOTER_TITLE_Y_OFFSET,
    fill: palette.fill,
    'font-size': 11,
    'font-family': FONT_FAMILY,
    'font-weight': 800,
  });
  title.textContent = t('chart.disclaimer.title').toUpperCase();
  g.appendChild(title);

  const body = createEl('text');
  body.setAttribute('data-chart-disclaimer-text', 'true');
  setAttrs(body, {
    x: x + 12,
    y: y + FOOTER_CONTENT_Y_OFFSET,
    fill: COLOR_TEXT_DARK,
    'font-size': DISCLAIMER_TEXT_FONT_SIZE,
    'font-family': FONT_FAMILY,
    'font-weight': 400,
  });

  wrapDisclaimerText(text, width).forEach((line, index) => {
    const tspan = createEl('tspan');
    tspan.setAttribute('x', String(x + 12));
    if (index > 0) tspan.setAttribute('dy', String(DISCLAIMER_TEXT_LINE_HEIGHT));
    if (line === '') {
      tspan.setAttribute('data-empty-disclaimer-line', 'true');
      tspan.textContent = EMPTY_DISCLAIMER_LINE;
    } else {
      tspan.textContent = line;
      fitDisclaimerLineToWidth(tspan, line, width);
    }
    body.appendChild(tspan);
  });
  g.appendChild(body);

  return g;
}

function fitDisclaimerLineToWidth(tspan, line, width) {
  const textWidth = Math.max(1, width - 24);
  const measuredWidth = Math.max(1, measureDisclaimerTextWidth(line));
  tspan.setAttribute('textLength', String(Math.min(measuredWidth, textWidth)));
  tspan.setAttribute('lengthAdjust', 'spacingAndGlyphs');
}

function wrapDisclaimerText(text, width) {
  const textWidth = Math.max(1, width - 24);
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const wrapped = paragraph
      ? wrapDisclaimerParagraphToWidth(paragraph, textWidth)
      : [''];
    for (const line of wrapped) {
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines : [''];
}

function wrapDisclaimerParagraphToWidth(text, maxLineWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureDisclaimerTextWidth(candidate) <= maxLineWidth) {
      current = candidate;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(...splitLongDisclaimerWord(word, maxLineWidth));
      current = '';
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function splitLongDisclaimerWord(word, maxLineWidth) {
  const chunks = [];
  let current = '';

  for (const char of String(word)) {
    const candidate = current + char;
    if (current && measureDisclaimerTextWidth(candidate) > maxLineWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [''];
}

function measureDisclaimerTextWidth(text) {
  const svgText = getDisclaimerSvgMeasureText();
  if (svgText) {
    svgText.textContent = String(text);
    return svgText.getComputedTextLength();
  }

  const context = getDisclaimerTextMeasureContext();
  if (context) return context.measureText(text).width;
  return String(text).length * DISCLAIMER_CHAR_WIDTH;
}

function getDisclaimerSvgMeasureText() {
  if (disclaimerSvgMeasure && document.body?.contains(disclaimerSvgMeasure.svg)) {
    return disclaimerSvgMeasure.text;
  }
  if (typeof document === 'undefined' || !document.body) return null;

  const svg = createEl('svg');
  setAttrs(svg, {
    width: 1,
    height: 1,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  Object.assign(svg.style, {
    position: 'absolute',
    left: '-9999px',
    top: '-9999px',
    overflow: 'hidden',
    visibility: 'hidden',
  });

  const text = createEl('text');
  setAttrs(text, {
    x: 0,
    y: 0,
    fill: COLOR_TEXT_DARK,
    'font-size': DISCLAIMER_TEXT_FONT_SIZE,
    'font-family': FONT_FAMILY,
    'font-weight': 400,
  });
  svg.appendChild(text);
  document.body.appendChild(svg);
  disclaimerSvgMeasure = { svg, text };
  return text;
}

function getDisclaimerTextMeasureContext() {
  if (disclaimerTextMeasureContext) return disclaimerTextMeasureContext;

  if (typeof document !== 'undefined') {
    disclaimerTextMeasureContext = document.createElement('canvas').getContext('2d');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    disclaimerTextMeasureContext = new OffscreenCanvas(1, 1).getContext('2d');
  }

  if (disclaimerTextMeasureContext) {
    disclaimerTextMeasureContext.font = `${DISCLAIMER_TEXT_FONT_SIZE}px ${FONT_FAMILY}`;
  }

  return disclaimerTextMeasureContext;
}

// ── Connector builder ─────────────────────────────────────────────────────────

function buildConnector(conn) {
  const { x1, y1, midX, x2, y2 } = conn;
  const path = createEl('path');
  setAttrs(path, {
    d:             `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`,
    stroke:        COLOR_CONNECTOR,
    fill:          'none',
    'stroke-width': 1.5,
  });
  return path;
}

// ── Size indicator builder ──────────────────────────────────────────────────

function buildSizeIndicator(indicator) {
  const { x, y1, y2, labelY, label } = indicator;
  const g = createEl('g');

  const line = createEl('line');
  setAttrs(line, {
    x1: x,
    y1,
    x2: x,
    y2,
    stroke: COLOR_SIZE_INDICATOR,
    'stroke-width': 1,
    'stroke-dasharray': '1 4',
    'stroke-linecap': 'round',
    'stroke-opacity': 0.75,
  });
  g.appendChild(line);

  const labelEl = createEl('text');
  setAttrs(labelEl, {
    x,
    y: labelY,
    fill: COLOR_SIZE_INDICATOR,
    stroke: COLOR_WHITE,
    'stroke-width': 3,
    'paint-order': 'stroke',
    'font-size': 12,
    'font-weight': 600,
    'font-family': FONT_FAMILY,
    'text-anchor': 'middle',
  });
  labelEl.textContent = label;
  g.appendChild(labelEl);

  return g;
}

// ── Relative-size guide builder ──────────────────────────────────────────────

function buildSizeGuide(guide) {
  const { x, y, width } = guide;
  const markerId = 'relative-size-arrowhead';
  const g = createEl('g');

  const defs = createEl('defs');
  const marker = createEl('marker');
  setAttrs(marker, {
    id: markerId,
    viewBox: '0 0 8 8',
    refX: 7,
    refY: 4,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto-start-reverse',
  });
  const arrowHead = createEl('path');
  setAttrs(arrowHead, { d: 'M 0 0 L 8 4 L 0 8 z', fill: COLOR_GUIDE });
  marker.appendChild(arrowHead);
  defs.appendChild(marker);
  g.appendChild(defs);

  const line = createEl('line');
  setAttrs(line, {
    x1: x,
    y1: y,
    x2: x + width,
    y2: y,
    stroke: COLOR_GUIDE,
    'stroke-width': 1.5,
    'marker-start': `url(#${markerId})`,
    'marker-end': `url(#${markerId})`,
  });
  g.appendChild(line);

  const label = createEl('text');
  setAttrs(label, {
    x: x + width / 2,
    y: y + 18,
    fill: COLOR_GUIDE,
    'font-size': 12,
    'font-family': FONT_FAMILY,
    'text-anchor': 'middle',
  });
  label.textContent = t('chart.sizeGuide');
  g.appendChild(label);

  return g;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function createEl(tag) {
  return document.createElementNS(SVG_NS, tag);
}

function setAttrs(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
}
