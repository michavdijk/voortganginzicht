/**
 * Clipboard/export helpers for chart SVGs.
 *
 * Both download and clipboard export use the same PNG Blob generation so the
 * saved and copied images stay identical.
 */

const CANVAS_SCALE = 2;
const PNG_MIME_TYPE = 'image/png';

/**
 * Convert a chart SVG to a high-DPI PNG Blob.
 * @param {SVGSVGElement} svgElement
 * @returns {Promise<Blob>}
 */
export function chartSvgToPngBlob(svgElement) {
  return new Promise((resolve, reject) => {
    try {
      const { width, height } = getSvgDimensions(svgElement);
      const dataUrl = svgToDataUrl(svgElement);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width * CANVAS_SCALE;
          canvas.height = height * CANVAS_SCALE;

          const ctx = canvas.getContext('2d');
          ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create PNG Blob.'));
            }
          }, PNG_MIME_TYPE);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error('Could not load SVG image.'));
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Whether this browser exposes the Clipboard API needed for PNG images.
 * @returns {boolean}
 */
export function canCopyChartToClipboard() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

/**
 * Copy the given SVG element to the clipboard as a PNG image.
 *
 * The ClipboardItem receives a Blob promise so navigator.clipboard.write() is
 * called immediately from the user's click handler, which keeps browser user
 * activation rules happier while the image is still being generated.
 *
 * @param {SVGSVGElement} svgElement
 * @returns {Promise<void>}
 */
export function copyChartToClipboard(svgElement) {
  if (!canCopyChartToClipboard()) {
    return Promise.reject(new Error('Clipboard API is not supported.'));
  }

  const blobPromise = chartSvgToPngBlob(svgElement);
  return navigator.clipboard.write([
    new ClipboardItem({ [PNG_MIME_TYPE]: blobPromise }),
  ]);
}

function getSvgDimensions(svgElement) {
  const viewBox = svgElement.getAttribute('viewBox') || '';
  const parts = viewBox.split(/[\s,]+/).map(Number);
  return {
    width: parts.length === 4 && parts[2] > 0 ? parts[2] : 800,
    height: parts.length === 4 && parts[3] > 0 ? parts[3] : 600,
  };
}

function svgToDataUrl(svgElement) {
  let svgStr = new XMLSerializer().serializeToString(svgElement);

  if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
}
