/**
 * Contact & feedback modal.
 *
 * Opens from the footer and shows contact details plus the official Ko-fi
 * support button inside the dialog.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';

const CONTACT_EMAIL = 'info@voortganginzicht.nl';
const KOFI_SCRIPT_URL = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
const KOFI_BUTTON_TEXT = 'Support me on Ko-fi';
const KOFI_BUTTON_COLOR = '#2463EB';
const KOFI_WIDGET_ID = 'M4M51ZQBR8';

let overlay = null;
let dialogTitle = null;
let closeButton = null;
let contentEl = null;
let previouslyFocused = null;
let isInitialised = false;
let kofiScriptPromise = null;
let kofiButtonPromise = null;
let kofiButtonHtml = '';

/**
 * Initialise global contact & feedback interactions.
 */
export function init() {
  if (isInitialised) return;
  isInitialised = true;

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);

  on('language-changed', () => {
    updateTriggerLabels();
    if (overlay && !overlay.hidden) renderDialog();
  });

  updateTriggerLabels();
  prepareKofiButton().catch(() => {
    // The modal can still open without blocking if Ko-fi is unavailable.
  });
}

function handleDocumentClick(event) {
  const target = event.target instanceof Element
    ? event.target
    : event.target?.parentElement;
  const trigger = target?.closest('[data-contact-feedback]');
  if (!trigger) return;

  event.preventDefault();
  event.stopPropagation();
  openContactDialog();
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && overlay && !overlay.hidden) {
    closeContactDialog();
  }
}

function openContactDialog() {
  previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  ensureOverlay();
  renderDialog();
  overlay.hidden = false;
  document.body.classList.add('contact-dialog-open');
  closeButton.focus();
}

function closeContactDialog() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('contact-dialog-open');

  if (previouslyFocused && document.contains(previouslyFocused)) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

function ensureOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'contact-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeContactDialog();
  });

  const dialog = document.createElement('section');
  dialog.className = 'contact-dialog';
  dialog.dataset.contactFeedbackDialog = 'true';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'contact-dialog-title');
  overlay.appendChild(dialog);

  const header = document.createElement('header');
  header.className = 'contact-dialog__header';
  dialog.appendChild(header);

  dialogTitle = document.createElement('h2');
  dialogTitle.id = 'contact-dialog-title';
  dialogTitle.className = 'contact-dialog__title';
  header.appendChild(dialogTitle);

  closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn btn--icon contact-dialog__close';
  closeButton.dataset.contactFeedbackClose = 'true';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeContactDialog);
  header.appendChild(closeButton);

  contentEl = document.createElement('div');
  contentEl.className = 'contact-dialog__body';
  dialog.appendChild(contentEl);

  document.body.appendChild(overlay);
}

function renderDialog() {
  dialogTitle.textContent = t('contact.feedback.title');
  closeButton.title = t('contact.feedback.close');
  closeButton.setAttribute('aria-label', t('contact.feedback.close'));

  contentEl.innerHTML = '';
  appendParagraph('contact.feedback.intro.question');
  appendParagraph('contact.feedback.intro.practice');
  appendParagraph('contact.feedback.intro.suggestions');

  const email = document.createElement('a');
  email.className = 'contact-dialog__email';
  email.href = `mailto:${CONTACT_EMAIL}`;

  const emailText = document.createElement('span');
  emailText.textContent = CONTACT_EMAIL;
  email.append(buildEmailIcon(), emailText);
  contentEl.appendChild(email);

  const supportTitle = document.createElement('h3');
  supportTitle.className = 'contact-dialog__section-title';
  supportTitle.textContent = t('contact.feedback.support.title');
  contentEl.appendChild(supportTitle);

  appendParagraph('contact.feedback.support.body');

  const kofiMount = document.createElement('div');
  kofiMount.className = 'contact-dialog__kofi-widget';
  kofiMount.dataset.kofiWidgetMount = 'true';
  contentEl.appendChild(kofiMount);
  renderKofiButton(kofiMount);
}

function appendParagraph(key) {
  const paragraph = document.createElement('p');
  paragraph.className = 'contact-dialog__paragraph';
  paragraph.textContent = t(key);
  contentEl.appendChild(paragraph);
}

function buildEmailIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('contact-dialog__email-icon');
  svg.dataset.contactEmailIcon = 'true';
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '5');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '14');
  rect.setAttribute('rx', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm3 7 9 6 9-6');

  svg.append(rect, path);
  return svg;
}

function renderKofiButton(container) {
  container.innerHTML = '';
  if (kofiButtonHtml) {
    insertKofiButton(container);
    return;
  }

  container.setAttribute('aria-busy', 'true');

  prepareKofiButton()
    .then(() => {
      if (!document.contains(container)) return;
      insertKofiButton(container);
    })
    .catch(() => {
      if (!document.contains(container)) return;
      container.removeAttribute('aria-busy');
      container.dataset.kofiWidgetError = 'true';
    });
}

function prepareKofiButton() {
  if (kofiButtonHtml) return Promise.resolve(kofiButtonHtml);
  if (kofiButtonPromise) return kofiButtonPromise;

  kofiButtonPromise = ensureKofiScript()
    .then(() => {
      if (!kofiButtonHtml) kofiButtonHtml = captureKofiButtonHtml();
      return kofiButtonHtml;
    })
    .catch((error) => {
      kofiButtonPromise = null;
      throw error;
    });

  return kofiButtonPromise;
}

function ensureKofiScript() {
  if (canDrawKofiButton()) return Promise.resolve();
  if (kofiScriptPromise) return kofiScriptPromise;

  kofiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = KOFI_SCRIPT_URL;
    script.async = true;
    script.dataset.kofiWidgetScript = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.body.appendChild(script);
  });

  return kofiScriptPromise;
}

function canDrawKofiButton() {
  return typeof window.kofiwidget2?.init === 'function'
    && typeof window.kofiwidget2?.draw === 'function';
}

function captureKofiButtonHtml() {
  if (!canDrawKofiButton()) return '';

  let html = '';
  const originalWrite = document.write;
  const originalWriteln = document.writeln;
  const captureWrite = (chunk = '') => {
    html += String(chunk);
  };

  document.write = captureWrite;
  document.writeln = captureWrite;

  try {
    window.kofiwidget2.init(KOFI_BUTTON_TEXT, KOFI_BUTTON_COLOR, KOFI_WIDGET_ID);
    window.kofiwidget2.draw();
    return html;
  } finally {
    document.write = originalWrite;
    document.writeln = originalWriteln;
  }
}

function insertKofiButton(container) {
  container.innerHTML = kofiButtonHtml;
  container.removeAttribute('aria-busy');
}

function updateTriggerLabels() {
  document
    .querySelectorAll('[data-contact-feedback]')
    .forEach((trigger) => {
      trigger.textContent = t('contact.feedback.link');
      trigger.title = t('contact.feedback.open');
      trigger.setAttribute('aria-label', t('contact.feedback.open'));
    });
}
