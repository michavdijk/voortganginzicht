/**
 * SVG chart renderer.
 *
 * Builds and inserts an SVG element into the given container element,
 * using layout data produced by layout.js.
 *
 * Each box is split into two vertical sections:
 *   – Title section  : wrapped node name
 *   – Progress section with compact progress bar and optional percentage
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
} from './layout.js';
import { getColorPalette, normalizeSizeIndicators } from '../model/settings.js';
import { t } from '../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Fixed colours ─────────────────────────────────────────────────────────────
const COLOR_TEXT_DARK  = '#1E3A5F';
const COLOR_CONNECTOR  = '#94A3B8';
const COLOR_GUIDE      = '#475569';
const COLOR_SIZE_INDICATOR = '#334155';
const COLOR_WHITE      = '#FFFFFF';
const PROGRESS_TRACK_HEIGHT = 6;
const PROGRESS_LABEL_WIDTH  = 30;
const PROGRESS_LABEL_GAP    = 8;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the progress chart into the given container element.
 * Clears any existing content and replaces it with the generated SVG.
 * Stores the SVG reference on `container._chartSvg` for PNG export.
 *
 * @param {HTMLElement} container
 * @param {import('../model/tree.js').Knoop} root
 * @param {{ showPercentage: boolean, colorScheme: string, customColor?: string, showSizeIndicators?: boolean, sizeIndicators?: Array<{ omvang: number, label: string }> }} settings
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
  const containerWidth = Math.max(200, measured);

  container.innerHTML = `<div class="chart-loading">${t('chart.calculating')}</div>`;

  const palette = getColorPalette(settings);
  const activeSizeIndicators = settings.showSizeIndicators
    ? normalizeSizeIndicators(settings.sizeIndicators)
    : [];
  const { boxes, connectors, sizeGuide, sizeIndicators, totalWidth, totalHeight } = computeLayout(
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
    svg.appendChild(buildBox(box, palette, settings.showPercentage));
  }
  if (sizeGuide) {
    svg.appendChild(buildSizeGuide(sizeGuide));
  }

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
 * @returns {SVGGElement}
 */
function buildBox(box, palette, showPercentage) {
  const { x, y, width, height, progress, node } = box;
  const g           = createEl('g');
  const titleHeight = height - PROGRESS_BAR_HEIGHT;
  const barY        = y + titleHeight;
  const isBranch    = node.kinderen.length > 0;
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
  buildProgressBar(g, { x, y: barY, width, progress, palette, showPercentage, clipId });

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

function buildProgressBar(g, { x, y, width, progress, palette, showPercentage, clipId }) {
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
