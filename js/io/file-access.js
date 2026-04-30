/**
 * File access module — save and load project files.
 *
 * Uses the File System Access API (Chrome 86+) when available,
 * with a fallback to <a download> / <input type="file"> for Firefox.
 */

import { t } from '../i18n.js';

function filePickerTypes() {
  return [
    {
      description: t('file.picker.description'),
      accept: { 'application/json': ['.json'] },
    },
  ];
}

const SUGGESTED_NAME = 'project.voortganginzicht.json';
const INPUT_CANCEL_DELAY_MS = 1_500;
const IOS_INPUT_CANCEL_DELAY_MS = 5_000;

export function supportsSaveFilePicker() {
  return typeof window.showSaveFilePicker === 'function';
}

// ── Save ─────────────────────────────────────────────────────────────────────

/**
 * Prompt the user to save a JSON string to a local file.
 *
 * Returns true  — file was written successfully.
 * Returns false — user cancelled the file picker (no error).
 * Throws        — an I/O error occurred after the file was selected.
 *
 * @param {string} jsonString
 * @returns {Promise<boolean>}
 */
export async function saveToFile(jsonString, suggestedName = SUGGESTED_NAME) {
  if (supportsSaveFilePicker()) {
    return saveViaFilePicker(jsonString, suggestedName);
  }
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadBlob(blob, suggestedName);
  return true;
}

/**
 * Save using the File System Access API.
 * @param {string} jsonString
 * @returns {Promise<boolean>}
 */
async function saveViaFilePicker(jsonString, suggestedName) {
  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName,
      types: filePickerTypes(),
    });
  } catch (err) {
    if (err.name === 'AbortError') return false;
    throw err;
  }

  const writable = await fileHandle.createWritable();
  try {
    await writable.write(jsonString);
    await writable.close();
  } catch (err) {
    // Attempt to close/abort the writable to release the file handle.
    try { await writable.abort(); } catch { /* ignore */ }
    throw err;
  }

  return true;
}

/**
 * Prompt for a save destination when the browser supports it.
 * Returns null when unsupported or when the user cancels.
 *
 * @param {string} suggestedName
 * @param {Array<{ description?: string, accept: Record<string, string[]> }>} types
 * @returns {Promise<FileSystemFileHandle | null>}
 */
export async function pickSaveFile(suggestedName, types = filePickerTypes()) {
  if (!supportsSaveFilePicker()) return null;

  try {
    return await window.showSaveFilePicker({ suggestedName, types });
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Write a Blob to a File System Access API handle.
 *
 * @param {Blob} blob
 * @param {FileSystemFileHandle} fileHandle
 * @returns {Promise<void>}
 */
export async function writeBlobToFileHandle(blob, fileHandle) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    try { await writable.abort(); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Fallback save: trigger a programmatic download.
 *
 * @param {Blob} blob
 * @param {string} suggestedName
 */
export function downloadBlob(blob, suggestedName) {
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke the object URL after a short delay so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Load ─────────────────────────────────────────────────────────────────────

/**
 * Prompt the user to open a JSON file and return its text content.
 *
 * Returns string — the file text.
 * Returns null   — user cancelled the file picker.
 * Throws         — an I/O error occurred while reading the file.
 *
 * @returns {Promise<string | null>}
 */
export async function loadFromFile() {
  if (typeof window.showOpenFilePicker === 'function') {
    return loadViaFilePicker();
  }
  return loadViaInput();
}

/**
 * Load using the File System Access API.
 * @returns {Promise<string | null>}
 */
async function loadViaFilePicker() {
  let fileHandles;
  try {
    fileHandles = await window.showOpenFilePicker({
      multiple: false,
      types: filePickerTypes(),
    });
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }

  const file = await fileHandles[0].getFile();
  return file.text();
}

/**
 * Fallback load: create a hidden <input type="file"> and return file text.
 * Returns null if the user dismisses the dialog without choosing a file.
 * @returns {Promise<string | null>}
 */
function loadViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    // Resolve null if the user closes the dialog without selecting a file.
    // The 'cancel' event is available in modern browsers; the focus-based
    // fallback deliberately waits longer because iOS can dispatch 'change'
    // noticeably after the page regains focus.
    let resolved = false;
    let cancelTimer = null;

    const cleanup = () => {
      if (cancelTimer !== null) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      input.removeEventListener('cancel', onCancel);
      input.removeEventListener('change', onChange);
      window.removeEventListener('focus', onWindowFocus);
      if (input.parentNode) document.body.removeChild(input);
    };

    const resolveOnce = (value) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const rejectOnce = (err) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(err);
    };

    function onCancel() {
      resolveOnce(null);
    }

    function onChange() {
      if (resolved) return;
      if (cancelTimer !== null) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }

      const file = input.files && input.files[0];
      if (!file) {
        resolveOnce(null);
        return;
      }

      readFileAsText(file)
        .then(resolveOnce)
        .catch(() => rejectOnce(new Error(t('error.readFile'))));
    }

    // Heuristic fallback: if window regains focus without a file being chosen,
    // the user most likely cancelled the dialog.
    function onWindowFocus() {
      // Give the 'change' event a tick to fire first.
      cancelTimer = setTimeout(() => {
        if (resolved) return;
        if (input.files && input.files.length > 0) return;
        resolveOnce(null);
      }, getInputCancelDelay());
    }

    input.addEventListener('cancel', onCancel);
    input.addEventListener('change', onChange);
    window.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });
}

/**
 * Read a File as UTF-8 text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

function getInputCancelDelay() {
  return isIOSLike() ? IOS_INPUT_CANCEL_DELAY_MS : INPUT_CANCEL_DELAY_MS;
}

function isIOSLike() {
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  return (
    /iPad|iPhone|iPod/.test(platform) ||
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}
