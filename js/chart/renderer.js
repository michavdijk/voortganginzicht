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
import { calcEffectiveActualSpending, calcEffectiveOmvang, hasActualSpending } from './progress-calc.js';
import { getColorPalette, normalizeSizeIndicators } from '../model/settings.js';
import { t } from '../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Fixed colours ─────────────────────────────────────────────────────────────
const COLOR_TEXT_DARK  = '#1E3A5F';
const COLOR_CONNECTOR  = '#94A3B8';
const COLOR_GUIDE      = '#475569';
const COLOR_SIZE_INDICATOR = '#334155';
const COLOR_ACTUAL_SPENDING = '#0F172A';
const COLOR_ACTUAL_SPENDING_OVERRUN = '#DC2626';
const COLOR_WHITE      = '#FFFFFF';
const PROGRESS_TRACK_HEIGHT = 6;
const PROGRESS_LABEL_WIDTH  = 30;
const PROGRESS_LABEL_GAP    = 8;
const ACTUAL_SPENDING_MARKER_HALF_WIDTH = 5;
const ACTUAL_SPENDING_OVERRUN_LABEL_MIN_WIDTH = 42;
const ACTUAL_SPENDING_OVERRUN_LABEL_GAP = 2;
const ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT = 12;
const ACTUAL_SPENDING_OVERRUN_LABEL_H_PADDING = 4;
const ACTUAL_SPENDING_OVERRUN_LABEL_LEFT_PADDING = 8;
const ACTUAL_SPENDING_OVERRUN_LABEL_CHAR_WIDTH = 6.2;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the progress chart into the given container element.
 * Clears any existing content and replaces it with the generated SVG.
 * Stores the SVG reference on `container._chartSvg` for PNG export.
 *
 * @param {HTMLElement} container
 * @param {import('../model/tree.js').Knoop} root
zoo * @param {{ showPercentage: boolean, colorScheme: string, customColor?: string, showActualSpending?: boolean, showSizeIndicators?: boolean, sizeIndicators?: Array<{ omvang: number | null, label: string }>, chartZoom?: number }} settings
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

  const svg = createEl('svg');
  svg.setAttribute('xmlns',   SVG_NS);
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  // Keep pixel dimensions as attributes so PNG export gets the right size.
  // CSS overrides these for display: width fills container, height follows
  // the viewBox aspect ratio (no letterboxing, no distortion).
  svg.setAttribute('width',  String(totalWidth));
  svg.setAttribute('height', String(totalHeight));
  svg.style.fontFamily = FONT_FAMILY;
  svg.style.display    = 'block';
  svg.style.width      = '100%';
  svg.style.height     = 'auto';

  // Size indicators and connectors are drawn first so boxes render on top.
  for (const indicator of sizeIndicators) {
    svg.appendChild(buildSizeIndicator(indicator));
  }
  for (const conn of connectors) {
    svg.appendChild(buildConnector(conn));
  }
  for (const box of boxes) {
    svg.appendChild(buildBox(box, palette, settings.showPercentage, Boolean(settings.showActualSpending)));
  }
  if (sizeGuide) {
    svg.appendChild(buildSizeGuide(sizeGuide));
  }

  // Add actual spending legend if needed
  const legendWidth = 168;
  const legendHeight = 92;
  let extendedTotalHeight = totalHeight;

  if (settings.showActualSpending && hasActualSpending(root)) {
    const contentRight = boxes.length > 0 ? Math.max(...boxes.map(b => b.x + b.width)) : totalWidth - 16;
    const legendX = Math.max(contentRight - legendWidth, 16);
    const legendY = sizeIndicators.length > 0
      ? chartBottom + 16
      : sizeGuide
        ? sizeGuide.y + SIZE_GUIDE_HEIGHT + 8
        : totalHeight - legendHeight - 16;

    const legendBottom = legendY + legendHeight + 16;
    if (legendBottom > extendedTotalHeight) {
      extendedTotalHeight = legendBottom;
    }

    svg.appendChild(buildActualSpendingLegend(legendX, legendY, legendWidth, legendHeight, palette));
  }

  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${extendedTotalHeight}`);
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
 * @param {boolean} showActualSpending
 * @returns {SVGGElement}
 */
function buildBox(box, palette, showPercentage, showActualSpending) {
  const { x, y, width, height, progress, node } = box;
  const g           = createEl('g');
  const titleHeight = height - PROGRESS_BAR_HEIGHT;
  const barY        = y + titleHeight;
  const isBranch    = node.kinderen.length > 0;
  const effectiveOmvang = isBranch ? calcEffectiveOmvang(node) : node.omvang;
  const effectiveActualSpending = isBranch ? calcEffectiveActualSpending(node) : node.actueleBesteding;
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

  // ── Divider line ──────────────────────────────────────────────────────────
  const divider = createEl('line');
  setAttrs(divider, { x1: x, y1: barY, x2: x + width, y2: barY, stroke: palette.border, 'stroke-width': 1 });
  g.appendChild(divider);

  // ── Outer border ──────────────────────────────────────────────────────────
  const border = createEl('rect');
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

function buildActualSpendingMarker({ actualSpending, omvang, trackX, trackY, trackWidth, clipId }) {
  if (
    !Number.isFinite(actualSpending) ||
    !Number.isFinite(omvang) ||
    actualSpending < 1 ||
    omvang < 1 ||
    trackWidth <= 0
  ) {
    return null;
  }

  const isOverrun = actualSpending > omvang;
  const clamped = Math.min(actualSpending, omvang);
  const percentage = Math.round((actualSpending / omvang) * 100);
  const overrunPercentage = Math.round(((actualSpending - omvang) / omvang) * 100);
  const markerX = trackX + (clamped / omvang) * trackWidth;
  const tipY = trackY + PROGRESS_TRACK_HEIGHT + 2;
  const topY = trackY - 5;
  const markerHalfWidth = ACTUAL_SPENDING_MARKER_HALF_WIDTH;
  const markerColor = isOverrun ? COLOR_ACTUAL_SPENDING_OVERRUN : COLOR_ACTUAL_SPENDING;

  const marker = createEl('g');
  marker.setAttribute('clip-path', `url(#${clipId})`);
  marker.setAttribute('data-actual-spending-marker', 'true');
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

  const triangle = createEl('path');
  setAttrs(triangle, {
    d: `M ${markerX} ${tipY} L ${markerX - markerHalfWidth} ${topY} L ${markerX + markerHalfWidth} ${topY} Z`,
    fill: markerColor,
    stroke: COLOR_WHITE,
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
  });
  marker.appendChild(triangle);

  if (isOverrun && trackWidth >= ACTUAL_SPENDING_OVERRUN_LABEL_MIN_WIDTH) {
    const labelText = `+${overrunPercentage}%`;
    const labelWidth = Math.ceil(
      labelText.length * ACTUAL_SPENDING_OVERRUN_LABEL_CHAR_WIDTH +
      ACTUAL_SPENDING_OVERRUN_LABEL_LEFT_PADDING +
      ACTUAL_SPENDING_OVERRUN_LABEL_H_PADDING
    );
    const labelRight = markerX;
    const labelY = topY - ACTUAL_SPENDING_OVERRUN_LABEL_GAP - ACTUAL_SPENDING_OVERRUN_LABEL_HEIGHT;

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

// ── Actual spending legend builder ───────────────────────────────────────────

function buildActualSpendingLegend(x, y, width, height, palette) {
  const g = createEl('g');
  g.setAttribute('data-actual-spending-legend', 'true');

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
  setAttrs(title, {
    x: x + 12,
    y: y + 16,
    fill: COLOR_TEXT_DARK,
    'font-size': 11,
    'font-family': FONT_FAMILY,
    'font-weight': 700,
  });
  title.textContent = t('chart.legend.title').toUpperCase();
  g.appendChild(title);

  const leftColumnX = x + 12;
  const rightColumnX = x + 56;
  const row1Y = y + 34;
  const row2Y = y + 58;

  const progressLabel = createEl('text');
  setAttrs(progressLabel, {
    x: rightColumnX,
    y: row1Y,
    fill: COLOR_TEXT_DARK,
    'font-size': 12,
    'font-family': FONT_FAMILY,
    'font-weight': 400,
    'dominant-baseline': 'middle',
  });
  progressLabel.textContent = t('chart.legend.progress');
  g.appendChild(progressLabel);

  const barX = leftColumnX;
  const barY = row1Y - 5;
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

  const markerX = leftColumnX + barWidth / 2;
  const markerTipY = row2Y + 6;
  const markerTopY = row2Y - 8;
  const marker = createEl('path');
  setAttrs(marker, {
    d: `M ${markerX} ${markerTipY} L ${markerX - ACTUAL_SPENDING_MARKER_HALF_WIDTH} ${markerTopY} L ${markerX + ACTUAL_SPENDING_MARKER_HALF_WIDTH} ${markerTopY} Z`,
    fill: COLOR_ACTUAL_SPENDING,
    stroke: COLOR_WHITE,
    'stroke-width': 1.5,
    'stroke-linejoin': 'round',
  });
  g.appendChild(marker);

  const label = createEl('text');
  setAttrs(label, {
    x: rightColumnX,
    y: row2Y,
    fill: COLOR_TEXT_DARK,
    'font-size': 12,
    'font-family': FONT_FAMILY,
    'font-weight': 400,
    'dominant-baseline': 'middle',
  });
  label.textContent = t('chart.actualSpending.legend');
  g.appendChild(label);

  return g;
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
