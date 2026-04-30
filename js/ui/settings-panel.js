/**
 * Settings panel UI module.
 *
 * Renders a compact settings section with chart options:
 * – "Percentage opnemen in output" checkbox
 * – "Kleurenschema" dropdown
 * – optional size indicators
 *
 * Changes are persisted to the settings store immediately.
 */

import {
  getSettings,
  updateSettings,
  COLOR_SCHEME_KEYS,
  CUSTOM_COLOR_SCHEME,
  getColorPalette,
  normalizeCustomColor,
} from '../model/settings.js';
import { validateOmvang } from '../model/validation.js';
import { emit, on } from '../events.js';
import { t } from '../i18n.js';
import { showError } from './dialogs.js';

let _container = null;
let _bound = false;

/**
 * Initialise the settings panel inside the given container element.
 * @param {HTMLElement} container
 */
export function init(container) {
  _container = container;
  render();
  if (!_bound) {
    on('language-changed', render);
    _bound = true;
  }
}

function render() {
  if (!_container) return;
  _container.innerHTML = '';
  _container.className = 'settings-panel';
  const settings = getSettings();

  // ── Percentage toggle ────────────────────────────────────────────────────────
  const percentageRow = buildRow();

  const pctLabel = document.createElement('label');
  pctLabel.className = 'settings-panel__label';
  pctLabel.textContent = t('settings.percentage');

  const pctCheckbox = document.createElement('input');
  pctCheckbox.type = 'checkbox';
  pctCheckbox.className = 'settings-panel__checkbox';
  pctCheckbox.checked = settings.showPercentage;
  pctCheckbox.addEventListener('change', () => {
    updateSettings({ showPercentage: pctCheckbox.checked });
    emit('settings-changed');
  });

  pctLabel.prepend(pctCheckbox);
  percentageRow.appendChild(pctLabel);
  _container.appendChild(percentageRow);

  // ── Colour scheme dropdown ───────────────────────────────────────────────────
  const colorGroup = buildRow();
  colorGroup.classList.add('settings-panel__row--stacked');

  const colorRow = buildRow();

  const colorLabel = document.createElement('label');
  colorLabel.className = 'settings-panel__label';
  colorLabel.htmlFor = 'settings-color-scheme';
  colorLabel.textContent = t('settings.colorScheme');
  colorRow.appendChild(colorLabel);

  const colorSelect = document.createElement('select');
  colorSelect.id = 'settings-color-scheme';
  colorSelect.className = 'settings-panel__select';

  for (const key of COLOR_SCHEME_KEYS) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = t(`settings.color.${key}`);
    colorSelect.appendChild(option);
  }

  colorSelect.value = settings.colorScheme;
  colorSelect.addEventListener('change', () => {
    updateSettings({ colorScheme: colorSelect.value });
    emit('settings-changed');
    render();
  });

  colorRow.appendChild(colorSelect);
  colorGroup.appendChild(colorRow);

  if (settings.colorScheme === CUSTOM_COLOR_SCHEME) {
    colorGroup.appendChild(buildCustomColorControl(settings));
  }

  _container.appendChild(colorGroup);

  // ── Size indicators ─────────────────────────────────────────────────────────
  const indicatorsRow = buildRow();
  indicatorsRow.classList.add('settings-panel__row--stacked');

  const indicatorsHeader = document.createElement('div');
  indicatorsHeader.className = 'settings-panel__row';

  const indicatorsLabel = document.createElement('label');
  indicatorsLabel.className = 'settings-panel__label';
  indicatorsLabel.textContent = t('settings.sizeIndicators');

  const indicatorsCheckbox = document.createElement('input');
  indicatorsCheckbox.type = 'checkbox';
  indicatorsCheckbox.className = 'settings-panel__checkbox';
  indicatorsCheckbox.checked = settings.showSizeIndicators;
  indicatorsCheckbox.addEventListener('change', () => {
    updateSettings({ showSizeIndicators: indicatorsCheckbox.checked });
    emit('settings-changed');
    render();
  });

  indicatorsLabel.prepend(indicatorsCheckbox);
  indicatorsHeader.appendChild(indicatorsLabel);
  indicatorsRow.appendChild(indicatorsHeader);

  if (settings.showSizeIndicators) {
    indicatorsRow.appendChild(buildSizeIndicatorList(settings.sizeIndicators));
  }

  _container.appendChild(indicatorsRow);
}

function buildRow() {
  const row = document.createElement('div');
  row.className = 'settings-panel__row';
  return row;
}

function buildSizeIndicatorList(indicators) {
  const list = document.createElement('div');
  list.className = 'settings-panel__indicator-list';

  indicators.forEach((indicator, index) => {
    list.appendChild(buildSizeIndicatorRow(indicator, index));
  });

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn settings-panel__add-button';
  addButton.title = t('settings.sizeIndicator.add');
  addButton.appendChild(buildIcon('plus'));

  const addText = document.createElement('span');
  addText.textContent = t('settings.sizeIndicator.add');
  addButton.appendChild(addText);

  addButton.addEventListener('click', () => {
    const current = getSettings().sizeIndicators;
    const nextNumber = current.length + 1;
    const previousMax = current.reduce((max, indicator) => Math.max(max, indicator.omvang), 0);
    updateSettings({
      showSizeIndicators: true,
      sizeIndicators: [
        ...current,
        {
          omvang: Math.max(1, previousMax + 1),
          label: t('settings.sizeIndicator.defaultLabel', { number: nextNumber }),
        },
      ],
    });
    emit('settings-changed');
    render();
  });
  list.appendChild(addButton);

  return list;
}

function buildCustomColorControl(settings) {
  const row = document.createElement('div');
  row.className = 'settings-panel__custom-color';

  const label = document.createElement('label');
  label.className = 'settings-panel__label';
  label.htmlFor = 'settings-custom-color';
  label.textContent = t('settings.customColor');
  row.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'settings-panel__color-controls';

  const colorInput = document.createElement('input');
  colorInput.id = 'settings-custom-color';
  colorInput.type = 'color';
  colorInput.className = 'settings-panel__color-input';
  colorInput.value = normalizeCustomColor(settings.customColor);
  colorInput.setAttribute('aria-label', t('settings.customColor.choose'));

  const colorPicker = document.createElement('label');
  colorPicker.className = 'settings-panel__color-picker';
  colorPicker.htmlFor = 'settings-custom-color';
  colorPicker.title = t('settings.customColor.choose');

  const activeSwatch = document.createElement('span');
  activeSwatch.className = 'settings-panel__color-picker-swatch';
  activeSwatch.setAttribute('aria-hidden', 'true');

  const pickerText = document.createElement('span');
  pickerText.className = 'settings-panel__color-picker-text';
  pickerText.textContent = t('settings.customColor.choose');

  colorPicker.append(colorInput, activeSwatch, pickerText);

  const preview = document.createElement('div');
  preview.className = 'settings-panel__palette-preview';
  preview.setAttribute('aria-hidden', 'true');

  const updatePreview = () => {
    const palette = getColorPalette({
      colorScheme: CUSTOM_COLOR_SCHEME,
      customColor: colorInput.value,
    });
    preview.innerHTML = '';
    activeSwatch.style.backgroundColor = palette.fill;
    for (const color of [palette.bg, palette.border]) {
      const swatch = document.createElement('span');
      swatch.className = 'settings-panel__palette-swatch';
      swatch.style.backgroundColor = color;
      preview.appendChild(swatch);
    }
  };

  colorInput.addEventListener('input', () => {
    updateSettings({ customColor: colorInput.value });
    updatePreview();
    emit('settings-changed');
  });

  updatePreview();
  controls.appendChild(colorPicker);
  controls.appendChild(preview);
  row.appendChild(controls);

  return row;
}

function buildSizeIndicatorRow(indicator, index) {
  const currentIndicator = { ...indicator };
  const row = document.createElement('div');
  row.className = 'settings-panel__indicator-row';

  const omvangField = buildIndicatorField(t('settings.sizeIndicator.omvang'));
  const omvangInput = document.createElement('input');
  omvangInput.type = 'number';
  omvangInput.className = 'settings-panel__input';
  omvangInput.min = '1';
  omvangInput.step = '1';
  omvangInput.required = true;
  omvangInput.value = String(currentIndicator.omvang);
  omvangInput.addEventListener('change', () => {
    const raw = omvangInput.value.trim();
    const validation = validateOmvang(raw);
    if (!validation.valid) {
      showError(validation.error);
      omvangInput.value = String(currentIndicator.omvang);
      return;
    }
    currentIndicator.omvang = Number(raw);
    updateSizeIndicator(index, { omvang: currentIndicator.omvang });
  });
  omvangField.appendChild(omvangInput);
  row.appendChild(omvangField);

  const labelField = buildIndicatorField(t('settings.sizeIndicator.label'));
  labelField.classList.add('settings-panel__field--label');
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'settings-panel__input';
  labelInput.required = true;
  labelInput.maxLength = 80;
  labelInput.value = currentIndicator.label;
  labelInput.addEventListener('change', () => {
    const label = labelInput.value.trim();
    if (label.length === 0) {
      showError(t('validation.sizeIndicator.labelRequired'));
      labelInput.value = currentIndicator.label;
      return;
    }
    if (label.length > 80) {
      showError(t('validation.sizeIndicator.labelTooLong'));
      labelInput.value = currentIndicator.label;
      return;
    }
    labelInput.value = label;
    currentIndicator.label = label;
    updateSizeIndicator(index, { label });
  });
  labelField.appendChild(labelInput);
  row.appendChild(labelField);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn--icon settings-panel__remove-button';
  removeButton.title = t('settings.sizeIndicator.remove');
  removeButton.setAttribute('aria-label', t('settings.sizeIndicator.remove'));
  removeButton.appendChild(buildIcon('trash'));
  removeButton.addEventListener('click', () => {
    const current = getSettings().sizeIndicators;
    updateSettings({
      sizeIndicators: current.filter((_, i) => i !== index),
    });
    emit('settings-changed');
    render();
  });
  row.appendChild(removeButton);

  return row;
}

function buildIndicatorField(labelText) {
  const field = document.createElement('label');
  field.className = 'settings-panel__field';

  const label = document.createElement('span');
  label.className = 'settings-panel__field-label';
  label.textContent = labelText;
  field.appendChild(label);

  return field;
}

function updateSizeIndicator(index, patch) {
  const current = getSettings().sizeIndicators;
  if (!current[index]) return;

  updateSettings({
    sizeIndicators: current.map((indicator, i) => (
      i === index ? { ...indicator, ...patch } : indicator
    )),
  });
  emit('settings-changed');
}

function buildIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  if (name === 'trash') {
    path.setAttribute('d', 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14 M10 11v6 M14 11v6');
  } else {
    path.setAttribute('d', 'M12 5v14 M5 12h14');
  }

  svg.appendChild(path);
  return svg;
}
