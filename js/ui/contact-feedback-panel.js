/**
 * Contact & feedback modal.
 *
 * Opens from the footer and shows contact details plus a local Ko-fi support
 * button image inside the dialog.
 */

import { on } from '../events.js';
import { t } from '../i18n.js';

const CONTACT_EMAIL = 'info@voortganginzicht.nl';
const KOFI_INLINE_LABEL = 'Ko-fi ☕.';
const KOFI_SUPPORT_URL = 'https://ko-fi.com/michavdijk';
const KOFI_BUTTON_IMAGE = 'assets/support_me_on_kofi_blue.png';
const KOFI_BUTTON_ALT = 'Support me on Ko-fi';

let overlay = null;
let dialogTitle = null;
let closeButton = null;
let contentEl = null;
let previouslyFocused = null;
let isInitialised = false;

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

  appendSupportParagraph();

  contentEl.appendChild(buildKofiSupportLink());
}

function appendParagraph(key) {
  const paragraph = document.createElement('p');
  paragraph.className = 'contact-dialog__paragraph';
  paragraph.textContent = t(key);
  contentEl.appendChild(paragraph);
}

function appendSupportParagraph() {
  const paragraph = document.createElement('p');
  paragraph.className = 'contact-dialog__paragraph';

  const text = t('contact.feedback.support.body');
  const labelIndex = text.lastIndexOf(KOFI_INLINE_LABEL);
  if (labelIndex === -1) {
    paragraph.textContent = text;
    contentEl.appendChild(paragraph);
    return;
  }

  const label = document.createElement('span');
  label.className = 'contact-dialog__kofi-label';
  label.textContent = KOFI_INLINE_LABEL;

  paragraph.append(
    document.createTextNode(text.slice(0, labelIndex)),
    label,
    document.createTextNode(text.slice(labelIndex + KOFI_INLINE_LABEL.length)),
  );
  contentEl.appendChild(paragraph);
}

function buildEmailIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('contact-dialog__email-icon');
  svg.dataset.contactEmailIcon = 'true';
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  outline.setAttribute('x', '4');
  outline.setAttribute('y', '6');
  outline.setAttribute('width', '16');
  outline.setAttribute('height', '12');
  outline.setAttribute('rx', '2.5');

  const flap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  flap.setAttribute('d', 'M4.8 8.1 11 13.05a1.6 1.6 0 0 0 2 0l6.2-4.95');

  const leftFold = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  leftFold.setAttribute('d', 'm9.5 12.15-4.7 4.3');

  const rightFold = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  rightFold.setAttribute('d', 'm14.5 12.15 4.7 4.3');

  svg.append(outline, flap, leftFold, rightFold);
  return svg;
}

function buildKofiSupportLink() {
  const link = document.createElement('a');
  link.className = 'contact-dialog__kofi-button';
  link.dataset.kofiSupportLink = 'true';
  link.href = KOFI_SUPPORT_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', KOFI_BUTTON_ALT);

  const image = document.createElement('img');
  image.className = 'contact-dialog__kofi-button-image';
  image.src = KOFI_BUTTON_IMAGE;
  image.width = 980;
  image.height = 198;
  image.alt = KOFI_BUTTON_ALT;

  link.appendChild(image);
  return link;
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
