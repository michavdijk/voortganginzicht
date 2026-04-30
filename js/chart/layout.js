/**
 * Chart layout module.
 *
 * Computes positions and sizes for every node in the SVG chart, producing
 * a flat array of box descriptors and connector descriptors.
 *
 * Each box consists of two vertical sections:
 *   – Title section  (variable height, based on wrapped text)
 *   – Progress bar   (fixed PROGRESS_BAR_HEIGHT)
 */

import { calcWeightedProgress, getAllActiviteiten } from './progress-calc.js';

// ── Layout constants ──────────────────────────────────────────────────────────

export const FIXED_WIDTH        = 200;  // width of Doel/Subdoel boxes (px)
export const PROGRESS_BAR_HEIGHT = 20;  // height of the progress bar section (px)
export const V_GAP              = 8;    // vertical gap between sibling boxes (px)
export const SUBTREE_GAP        = 24;   // gap between sibling Subdoel groups (px)
export const H_GAP              = 48;   // horizontal gap between depth columns (px)
export const SIZE_GUIDE_GAP     = 28;   // gap between the chart and relative-size guide (px)
export const SIZE_GUIDE_HEIGHT  = 28;   // vertical space reserved for the guide and label (px)

// Text layout constants — used by both layout and renderer.
export const FONT_SIZE      = 13;   // px
export const LINE_HEIGHT    = 18;   // px  (line spacing including leading)
export const CHAR_WIDTH     = 6.5;  // px  fallback average character width for system-ui at 13px
export const FONT_FAMILY    = 'system-ui, sans-serif';
export const TEXT_H_PADDING = 8;    // px  horizontal padding inside title section
export const TEXT_V_PADDING = 6;    // px  vertical padding above/below text in title section

const CHART_PADDING = 16; // minimum whitespace around the full chart (px)
const SIZE_INDICATOR_LINE_EXTENSION = 16;
const SIZE_INDICATOR_TOP_SPACE      = 44;
const SIZE_INDICATOR_LABEL_GAP      = 10;
let textMeasureContext = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Word-wrap `text` to fit within `maxCharsPerLine` characters per line.
 * Long single words are placed on their own line without breaking.
 *
 * @param {string} text
 * @param {number} maxCharsPerLine
 * @returns {string[]}
 */
export function wrapText(text, maxCharsPerLine) {
  if (maxCharsPerLine <= 0) return [text];
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else if (current) {
      lines.push(current);
      current = word;
    } else {
      // Single word already exceeds the limit — place it as-is (clipPath clips any overflow).
      lines.push(word);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Word-wrap `text` to fit within `maxLineWidth` pixels.
 * Long single words are placed on their own line without breaking.
 *
 * @param {string} text
 * @param {number} maxLineWidth
 * @returns {string[]}
 */
export function wrapTextToWidth(text, maxLineWidth) {
  if (maxLineWidth <= 0) return [text];
  const words = String(text).split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate) <= maxLineWidth) {
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

/**
 * Calculate the total box height for a node given its rendered width.
 *
 * @param {string} text  The node's naam
 * @param {number} width Box width in px
 * @returns {number} Total box height in px
 */
export function calcBoxHeight(text, width) {
  const textAreaWidth = Math.max(1, width - 2 * TEXT_H_PADDING);
  const lines         = wrapTextToWidth(text, textAreaWidth);
  const titleHeight   = TEXT_V_PADDING + lines.length * LINE_HEIGHT + TEXT_V_PADDING;
  return titleHeight + PROGRESS_BAR_HEIGHT;
}

function measureTextWidth(text) {
  const context = getTextMeasureContext();
  if (context) return context.measureText(text).width;
  return estimateTextWidth(text);
}

function getTextMeasureContext() {
  if (textMeasureContext) return textMeasureContext;

  if (typeof document !== 'undefined') {
    textMeasureContext = document.createElement('canvas').getContext('2d');
  } else if (typeof OffscreenCanvas !== 'undefined') {
    textMeasureContext = new OffscreenCanvas(1, 1).getContext('2d');
  }

  if (textMeasureContext) {
    textMeasureContext.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  }

  return textMeasureContext;
}

function estimateTextWidth(text) {
  return String(text).length * CHAR_WIDTH;
}

/**
 * Compute the full layout for the chart.
 *
 * @param {import('../model/tree.js').Knoop} root
 * @param {number} containerWidth  available pixel width for the SVG
 * @param {{ sizeIndicators?: Array<{ omvang: number, label: string }>, hideSizeGuide?: boolean }} [options]
 * @returns {{ boxes: BoxDescriptor[], connectors: ConnectorDescriptor[], sizeGuide: SizeGuideDescriptor | null, sizeIndicators: SizeIndicatorDescriptor[], totalWidth: number, totalHeight: number }}
 *
 * @typedef {{ node: object, x: number, y: number, width: number, height: number, progress: number, depth: number }} BoxDescriptor
 * @typedef {{ x1: number, y1: number, midX: number, x2: number, y2: number }} ConnectorDescriptor
 * @typedef {{ x: number, y: number, width: number }} SizeGuideDescriptor
 * @typedef {{ x: number, y1: number, y2: number, labelY: number, label: string }} SizeIndicatorDescriptor
 */
export function computeLayout(root, containerWidth, options = {}) {
  const maxDepth        = getMaxDepth(root);
  const allActiviteiten = getAllActiviteiten(root);
  const activeSizeIndicators = normalizeLayoutSizeIndicators(options.sizeIndicators);
  // Scale bar widths so the widest bar fills the column; proportions are preserved.
  const maxActivityOmvang = allActiviteiten.reduce((max, a) => Math.max(max, a.omvang ?? 0), 0);
  const maxIndicatorOmvang = activeSizeIndicators.reduce((max, indicator) => Math.max(max, indicator.omvang), 0);
  const maxOmvang = Math.max(maxActivityOmvang, maxIndicatorOmvang);

  const activiteitColumnWidth = Math.max(
    120,
    containerWidth - CHART_PADDING - (maxDepth * (FIXED_WIDTH + H_GAP)) - H_GAP
  );

  const boxes      = [];
  const connectors = [];

  layoutNode(root, 0, CHART_PADDING, maxDepth, maxOmvang, activiteitColumnWidth, boxes, connectors);

  // Add weighted progress to each box.
  for (const box of boxes) {
    box.progress = calcWeightedProgress(box.node);
  }

  // Keep a final safety pass for unusual text/width combinations: the recursive
  // layout normally keeps every subtree inside its requested top boundary.
  const minY = Math.min(...boxes.map(b => b.y));
  if (minY < CHART_PADDING) {
    const shift = CHART_PADDING - minY;
    for (const b of boxes)      { b.y  += shift; }
    for (const c of connectors) { c.y1 += shift; c.y2 += shift; }
  }

  if (activeSizeIndicators.length > 0) {
    shiftLayout(boxes, connectors, SIZE_INDICATOR_TOP_SPACE);
  }

  let totalWidth = CHART_PADDING + maxDepth * (FIXED_WIDTH + H_GAP) + activiteitColumnWidth + H_GAP;
  const maxBottom  = Math.max(...boxes.map(b => b.y + b.height));
  const renderedSizeIndicators = buildSizeIndicatorDescriptors(
    activeSizeIndicators,
    boxes,
    maxDepth,
    maxOmvang,
    activiteitColumnWidth
  );
  totalWidth = fitSizeIndicatorLabels(boxes, connectors, renderedSizeIndicators, totalWidth);
  const sizeGuide  = allActiviteiten.length > 0 && !options.hideSizeGuide && renderedSizeIndicators.length === 0
    ? {
        x: CHART_PADDING + maxDepth * (FIXED_WIDTH + H_GAP),
        y: maxBottom + SIZE_GUIDE_GAP,
        width: activiteitColumnWidth,
      }
    : null;
  const indicatorBottom = renderedSizeIndicators.length > 0
    ? Math.max(...renderedSizeIndicators.map(indicator => indicator.y2))
    : maxBottom;
  const contentBottom = Math.max(maxBottom, indicatorBottom);
  const totalHeight = contentBottom + (sizeGuide ? SIZE_GUIDE_GAP + SIZE_GUIDE_HEIGHT : 0) + CHART_PADDING;

  return { boxes, connectors, sizeGuide, sizeIndicators: renderedSizeIndicators, totalWidth, totalHeight };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getMaxDepth(node, depth = 0) {
  if (node.kinderen.length === 0) return depth;
  return Math.max(...node.kinderen.map(c => getMaxDepth(c, depth + 1)));
}

function layoutNode(node, depth, startY, maxDepth, maxOmvang, activiteitColumnWidth, boxes, connectors) {
  const firstBoxIndex       = boxes.length;
  const firstConnectorIndex = connectors.length;
  const isLeaf = node.kinderen.length === 0;

  if (isLeaf) {
    const omvang = node.omvang ?? 0;
    const width  = maxOmvang > 0
      ? (omvang / maxOmvang) * activiteitColumnWidth
      : activiteitColumnWidth;
    const height = calcBoxHeight(node.naam, width);
    const x      = CHART_PADDING + maxDepth * (FIXED_WIDTH + H_GAP);
    const box    = { node, x, y: startY, width, height, progress: 0, depth };
    boxes.push(box);
    return { top: startY, bottom: startY + height, totalHeight: height, box };
  }

  // Branch node: lay out children first, then centre the parent vertically.
  let childY = startY;
  const childResults = [];

  for (let i = 0; i < node.kinderen.length; i++) {
    const child = node.kinderen[i];
    const result = layoutNode(child, depth + 1, childY, maxDepth, maxOmvang, activiteitColumnWidth, boxes, connectors);
    childResults.push(result);
    childY = result.bottom;
    if (i < node.kinderen.length - 1) {
      childY += getSiblingGap(child, node.kinderen[i + 1]);
    }
  }

  const childrenTop       = Math.min(...childResults.map(r => r.top));
  const childrenBottom    = Math.max(...childResults.map(r => r.bottom));
  const childBoxesTop     = Math.min(...childResults.map(r => r.box.y));
  const childBoxesBottom  = Math.max(...childResults.map(r => r.box.y + r.box.height));
  const childBoxesCenter  = childBoxesTop + (childBoxesBottom - childBoxesTop) / 2;
  const width  = FIXED_WIDTH;
  const height = calcBoxHeight(node.naam, width);
  const x      = CHART_PADDING + depth * (FIXED_WIDTH + H_GAP);
  const parentY = childBoxesCenter - height / 2;

  const box = { node, x, y: parentY, width, height, progress: 0, depth };
  boxes.push(box);

  // Connectors from this parent to each child — connect at vertical midpoints.
  for (const { box: child } of childResults) {
    const midX = x + width + H_GAP / 2;
    connectors.push({
      x1:  x + width,
      y1:  parentY + height / 2,
      midX,
      x2:  child.x,
      y2:  child.y + child.height / 2,
    });
  }

  let top    = Math.min(parentY, childrenTop);
  let bottom = Math.max(parentY + height, childrenBottom);

  if (top < startY) {
    const shift = startY - top;
    shiftLayoutRange(boxes, connectors, firstBoxIndex, firstConnectorIndex, shift);
    top    += shift;
    bottom += shift;
  }

  return { top, bottom, totalHeight: bottom - top, box };
}

function getSiblingGap(leftNode, rightNode) {
  const separatesSubtrees = leftNode.kinderen.length > 0 || rightNode.kinderen.length > 0;
  return separatesSubtrees ? SUBTREE_GAP : V_GAP;
}

function shiftLayoutRange(boxes, connectors, firstBoxIndex, firstConnectorIndex, dy) {
  for (let i = firstBoxIndex; i < boxes.length; i++) {
    boxes[i].y += dy;
  }
  for (let i = firstConnectorIndex; i < connectors.length; i++) {
    connectors[i].y1 += dy;
    connectors[i].y2 += dy;
  }
}

function shiftLayout(boxes, connectors, dy) {
  for (const box of boxes) {
    box.y += dy;
  }
  for (const connector of connectors) {
    connector.y1 += dy;
    connector.y2 += dy;
  }
}

function shiftLayoutX(boxes, connectors, indicators, dx) {
  for (const box of boxes) {
    box.x += dx;
  }
  for (const connector of connectors) {
    connector.x1 += dx;
    connector.midX += dx;
    connector.x2 += dx;
  }
  for (const indicator of indicators) {
    indicator.x += dx;
  }
}

function normalizeLayoutSizeIndicators(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(indicator => ({
      omvang: Number(indicator?.omvang),
      label: typeof indicator?.label === 'string' ? indicator.label.trim() : '',
    }))
    .filter(indicator => (
      Number.isInteger(indicator.omvang) &&
      indicator.omvang >= 1 &&
      indicator.label.length > 0
    ));
}

function buildSizeIndicatorDescriptors(indicators, boxes, maxDepth, maxOmvang, activiteitColumnWidth) {
  if (indicators.length === 0 || maxOmvang <= 0) return [];

  const activiteitBoxes = boxes.filter(box => box.node.kinderen.length === 0);
  if (activiteitBoxes.length === 0) return [];

  const activitiesTop = Math.min(...activiteitBoxes.map(box => box.y));
  const activitiesBottom = Math.max(...activiteitBoxes.map(box => box.y + box.height));
  const y1 = activitiesTop - SIZE_INDICATOR_LINE_EXTENSION;
  const y2 = activitiesBottom + SIZE_INDICATOR_LINE_EXTENSION;
  const labelY = y1 - SIZE_INDICATOR_LABEL_GAP;
  const activiteitColumnX = CHART_PADDING + maxDepth * (FIXED_WIDTH + H_GAP);

  return indicators.map(indicator => ({
    x: activiteitColumnX + (indicator.omvang / maxOmvang) * activiteitColumnWidth,
    y1,
    y2,
    labelY,
    label: indicator.label,
  }));
}

function fitSizeIndicatorLabels(boxes, connectors, indicators, totalWidth) {
  if (indicators.length === 0) return totalWidth;

  let leftOverflow = 0;
  let rightOverflow = 0;

  for (const indicator of indicators) {
    const halfLabelWidth = measureTextWidth(indicator.label) / 2 + 4;
    leftOverflow = Math.max(leftOverflow, halfLabelWidth - indicator.x);
    rightOverflow = Math.max(rightOverflow, indicator.x + halfLabelWidth - totalWidth);
  }

  if (leftOverflow > 0) {
    shiftLayoutX(boxes, connectors, indicators, leftOverflow);
  }

  return totalWidth + leftOverflow + rightOverflow;
}
