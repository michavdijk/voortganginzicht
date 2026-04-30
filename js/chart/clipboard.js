/**
 * Clipboard export module.
 *
 * Converts an SVG element to a PNG image and copies it to the clipboard
 * using the Clipboard API.  Returns a Promise<boolean> — true on success.
 */

const CANVAS_SCALE = 2; // 2× for high-DPI / Retina displays

/**
 * Copy the given SVG element to the clipboard as a PNG image.
 *
 * Steps:
 *  1. Parse dimensions from the viewBox attribute.
 *  2. Serialize the SVG to a string.
 *  3. Render it on an offscreen canvas at 2× resolution.
 *  4. Convert the canvas to a PNG Blob.
 *  5. Write the Blob to the clipboard via the Clipboard API.
 *
 * @param {SVGSVGElement} svgElement
 * @returns {Promise<boolean>}  true on success, false on any error
 */
export function copyChartToClipboard(svgElement) {
  try {
    // Step 1 — get W and H from the viewBox attribute ("0 0 W H").
    const viewBox = svgElement.getAttribute('viewBox') || '';
    const parts = viewBox.split(/[\s,]+/).map(Number);
    const svgWidth = (parts.length === 4 && parts[2] > 0) ? parts[2] : 800;
    const svgHeight = (parts.length === 4 && parts[3] > 0) ? parts[3] : 600;

    // Step 2 — serialize the SVG.
    let svgStr = new XMLSerializer().serializeToString(svgElement);

    // Ensure the XML namespace declaration is present (required for Image loading).
    if (!svgStr.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

    // Step 3–5 — return a Promise.
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Create canvas at 2× resolution.
          const canvas = document.createElement('canvas');
          canvas.width = svgWidth * CANVAS_SCALE;
          canvas.height = svgHeight * CANVAS_SCALE;

          const ctx = canvas.getContext('2d');
          ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              navigator.clipboard
                .write([new ClipboardItem({ 'image/png': blob })])
                .then(() => resolve(true))
                .catch(() => resolve(false));
            },
            'image/png'
          );
        } catch (_err) {
          resolve(false);
        }
      };

      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
  } catch (_err) {
    return Promise.resolve(false);
  }
}
