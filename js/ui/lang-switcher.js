/**
 * Language switcher UI module.
 *
 * Renders a row of flag buttons that let the user toggle between supported
 * languages. The choice is a UI-only preference and is never written to the
 * project JSON.
 */

import { getLang, setLang, supportedLangs, t } from '../i18n.js';
import { on } from '../events.js';

const FLAGS = {
  nl: `
    <svg class="lang-switcher__flag-svg" viewBox="0 0 9 6" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <rect width="9" height="2" y="0" fill="#AE1C28"/>
      <rect width="9" height="2" y="2" fill="#FFFFFF"/>
      <rect width="9" height="2" y="4" fill="#21468B"/>
    </svg>`,
  en: `
    <svg class="lang-switcher__flag-svg" viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <clipPath id="lang-switcher-uk-clip"><path d="M0,0 v30 h60 v-30 z"/></clipPath>
      <clipPath id="lang-switcher-uk-clip2"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
      <g clip-path="url(#lang-switcher-uk-clip)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" stroke-width="6"/>
        <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#lang-switcher-uk-clip2)" stroke="#C8102E" stroke-width="4"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" stroke-width="10"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/>
      </g>
    </svg>`,
};

export function init(container) {
  render(container);
  on('language-changed', () => render(container));
}

function render(container) {
  container.innerHTML = '';

  const group = document.createElement('div');
  group.className = 'lang-switcher__group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', t('lang.label'));

  const current = getLang();
  for (const lang of supportedLangs()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-switcher__flag';
    if (lang === current) btn.classList.add('lang-switcher__flag--active');
    btn.setAttribute('aria-label', t(`lang.${lang}`));
    btn.setAttribute('aria-pressed', lang === current ? 'true' : 'false');
    btn.title = t(`lang.${lang}`);
    btn.innerHTML = FLAGS[lang] || '';
    btn.addEventListener('click', () => setLang(lang));
    group.appendChild(btn);
  }

  container.appendChild(group);
}
