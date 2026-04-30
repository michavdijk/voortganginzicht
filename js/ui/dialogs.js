/**
 * Dialog and notification helpers.
 *
 * - confirmDelete    : ask whether to really delete a node
 * - showError        : display a dismissable error banner in the UI
 * - confirmUnsavedChanges : ask whether to discard unsaved changes
 */

import { t } from '../i18n.js';

// ── Error banner ────────────────────────────────────────────────────────────

let errorBannerEl = null;
let hideTimer = null;

function getOrCreateBanner() {
  if (errorBannerEl) return errorBannerEl;

  errorBannerEl = document.createElement('div');
  errorBannerEl.id = 'error-banner';
  errorBannerEl.setAttribute('role', 'alert');
  errorBannerEl.setAttribute('aria-live', 'assertive');

  const message = document.createElement('span');
  message.className = 'error-banner__message';
  errorBannerEl.appendChild(message);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'error-banner__close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('dialog.close'));
  closeBtn.addEventListener('click', hideBanner);
  errorBannerEl.appendChild(closeBtn);

  document.body.prepend(errorBannerEl);
  return errorBannerEl;
}

function hideBanner() {
  if (errorBannerEl) {
    errorBannerEl.classList.remove('error-banner--visible');
  }
}

/**
 * Show a dismissable error banner at the top of the page.
 * Automatically hides after 6 seconds.
 * @param {string} message
 */
export function showError(message) {
  const banner = getOrCreateBanner();
  banner.querySelector('.error-banner__message').textContent = message;
  banner.classList.add('error-banner--visible');

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(hideBanner, 6000);
}

// ── Success banner ───────────────────────────────────────────────────────────

let successBannerEl = null;
let successHideTimer = null;

function getOrCreateSuccessBanner() {
  if (successBannerEl) return successBannerEl;

  successBannerEl = document.createElement('div');
  successBannerEl.id = 'success-banner';
  successBannerEl.setAttribute('role', 'status');
  successBannerEl.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'success-banner__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
      <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  successBannerEl.appendChild(icon);

  const message = document.createElement('span');
  message.className = 'success-banner__message';
  successBannerEl.appendChild(message);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'success-banner__close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('dialog.close'));
  closeBtn.addEventListener('click', () => {
    if (successBannerEl) successBannerEl.classList.remove('success-banner--visible');
  });
  successBannerEl.appendChild(closeBtn);

  document.body.prepend(successBannerEl);
  return successBannerEl;
}

/**
 * Show a dismissable success banner at the top of the page.
 * Automatically hides after 3 seconds.
 * @param {string} message
 */
export function showSuccess(message) {
  const banner = getOrCreateSuccessBanner();
  banner.querySelector('.success-banner__message').textContent = message;
  banner.classList.add('success-banner--visible');

  if (successHideTimer) clearTimeout(successHideTimer);
  successHideTimer = setTimeout(() => {
    if (successBannerEl) successBannerEl.classList.remove('success-banner--visible');
  }, 3000);
}

// ── Confirmation dialogs ─────────────────────────────────────────────────────

/**
 * Ask the user to confirm deletion of a node.
 * Returns a Promise<boolean> — true means "yes, delete".
 * Nodes without children are deleted without confirmation.
 *
 * @param {string} nodeName
 * @param {boolean} hasChildren
 * @returns {Promise<boolean>}
 */
export function confirmDelete(nodeName, hasChildren) {
  if (!hasChildren) return Promise.resolve(true);
  return Promise.resolve(
    window.confirm(t('dialog.confirmDelete', { name: nodeName }))
  );
}

/**
 * Ask the user whether to discard unsaved changes.
 * Returns a Promise<boolean> — true means "yes, discard".
 * @returns {Promise<boolean>}
 */
export function confirmUnsavedChanges() {
  return Promise.resolve(window.confirm(t('dialog.unsaved')));
}
