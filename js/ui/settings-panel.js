/**
 * Settings panel UI module.
 *
 * Renders a compact settings section with chart options:
 * – "Percentage opnemen in output" checkbox
 * – "Legenda tonen" checkbox
 * – "Actuele besteding tonen" checkbox
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

  // - Divider  ────────────────────────────────────────────────────────
  const divider = document.createElement('p');
    divider.className = 'settings-panel__divider';
  _container.appendChild(divider);

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

   // ── Actual spending toggle ─────────────────────────────────────────────────
  const actualSpendingRow = buildRow();

  const actualSpendingLabel = document.createElement('label');
  actualSpendingLabel.className = 'settings-panel__label';
  actualSpendingLabel.textContent = t('settings.actualSpending');

  const actualSpendingCheckbox = document.createElement('input');
  actualSpendingCheckbox.type = 'checkbox';
  actualSpendingCheckbox.className = 'settings-panel__checkbox';
  actualSpendingCheckbox.checked = settings.showActualSpending;
  actualSpendingCheckbox.addEventListener('change', () => {
    updateSettings({ showActualSpending: actualSpendingCheckbox.checked });
    emit('settings-changed');
  });

  actualSpendingLabel.prepend(actualSpendingCheckbox);
  actualSpendingRow.appendChild(actualSpendingLabel);
  _container.appendChild(actualSpendingRow);

  // ── Legend toggle ────────────────────────────────────────────────────────────
  const legendRow = buildRow();

  const legendLabel = document.createElement('label');
  legendLabel.className = 'settings-panel__label';
  legendLabel.textContent = t('settings.legend');

  const legendCheckbox = document.createElement('input');
  legendCheckbox.type = 'checkbox';
  legendCheckbox.className = 'settings-panel__checkbox';
  legendCheckbox.checked = settings.showLegend;
  legendCheckbox.addEventListener('change', () => {
    updateSettings({ showLegend: legendCheckbox.checked });
    emit('settings-changed');
  });

  legendLabel.prepend(legendCheckbox);
  legendRow.appendChild(legendLabel);
  _container.appendChild(legendRow);


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
    updateSettings({
      showSizeIndicators: true,
      sizeIndicators: [
        ...current,
        {
          omvang: null,
          label: '',
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

  const { field: omvangField, error: omvangError } = buildIndicatorField(
    t('settings.sizeIndicator.omvang'),
    `settings-size-indicator-${index}-omvang-error`
  );
  const omvangInput = document.createElement('input');
  omvangInput.type = 'number';
  omvangInput.className = 'settings-panel__input';
  omvangInput.min = '1';
  omvangInput.step = '1';
  omvangInput.value = formatOmvangValue(currentIndicator.omvang);
  omvangInput.setAttribute('aria-describedby', omvangError.id);
  omvangInput.addEventListener('input', () => clearFieldError(omvangInput));
  omvangInput.addEventListener('change', () => {
    if (omvangInput.validity.badInput) {
      setFieldError(omvangInput, t('validation.omvang.mustBeInt'));
      return;
    }

    const raw = omvangInput.value.trim();
    if (raw === '') {
      currentIndicator.omvang = null;
      clearFieldError(omvangInput);
      if (labelInput.value.trim().length === 0) clearFieldError(labelInput);
      updateSizeIndicator(index, { omvang: null });
      return;
    }

    const validation = validateOmvang(raw);
    if (!validation.valid) {
      setFieldError(omvangInput, validation.error);
      return;
    }
    currentIndicator.omvang = Number(raw);
    clearFieldError(omvangInput);
    updateSizeIndicator(index, { omvang: currentIndicator.omvang });
    validateSizeIndicatorLabelRequired(labelInput, currentIndicator);
  });
  omvangField.appendChild(omvangInput);
  omvangField.appendChild(omvangError);
  row.appendChild(omvangField);

  const { field: labelField, error: labelError } = buildIndicatorField(
    t('settings.sizeIndicator.label'),
    `settings-size-indicator-${index}-label-error`
  );
  labelField.classList.add('settings-panel__field--label');
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'settings-panel__input';
  labelInput.maxLength = 80;
  labelInput.value = currentIndicator.label ?? '';
  labelInput.setAttribute('aria-describedby', labelError.id);
  labelInput.addEventListener('input', () => clearFieldError(labelInput));
  labelInput.addEventListener('change', () => {
    const label = labelInput.value.trim();
    if (label.length === 0) {
      currentIndicator.label = '';
      labelInput.value = '';
      updateSizeIndicator(index, { label: '' });
      validateSizeIndicatorLabelRequired(labelInput, currentIndicator);
      return;
    }
    if (label.length > 80) {
      setFieldError(labelInput, t('validation.sizeIndicator.labelTooLong'));
      return;
    }
    labelInput.value = label;
    currentIndicator.label = label;
    clearFieldError(labelInput);
    updateSizeIndicator(index, { label });
  });
  labelField.appendChild(labelInput);
  labelField.appendChild(labelError);
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

  validateSizeIndicatorLabelRequired(labelInput, currentIndicator);
  return row;
}

function formatOmvangValue(omvang) {
  return omvang === null || omvang === undefined ? '' : String(omvang);
}

function buildIndicatorField(labelText, errorId) {
  const field = document.createElement('label');
  field.className = 'settings-panel__field';

  const label = document.createElement('span');
  label.className = 'settings-panel__field-label';
  label.textContent = labelText;
  field.appendChild(label);

  const error = document.createElement('span');
  error.id = errorId;
  error.className = 'settings-panel__field-error';
  error.setAttribute('aria-live', 'polite');
  error.hidden = true;

  return { field, error };
}

function validateSizeIndicatorLabelRequired(labelInput, indicator) {
  const hasOmvang = indicator.omvang !== null && indicator.omvang !== undefined;
  const hasLabel = labelInput.value.trim().length > 0;

  if (hasOmvang && !hasLabel) {
    setFieldError(labelInput, t('validation.sizeIndicator.labelRequired'));
    return false;
  }

  clearFieldError(labelInput);
  return true;
}

function setFieldError(input, message) {
  const field = input.closest('.settings-panel__field');
  const error = field?.querySelector('.settings-panel__field-error');
  if (!field || !error) {
    showError(message);
    return;
  }

  input.setAttribute('aria-invalid', 'true');
  field.classList.add('settings-panel__field--error');
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(input) {
  const field = input.closest('.settings-panel__field');
  const error = field?.querySelector('.settings-panel__field-error');
  if (!field || !error) return;

  input.removeAttribute('aria-invalid');
  field.classList.remove('settings-panel__field--error');
  error.textContent = '';
  error.hidden = true;
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
