/**
 * Serializer module — converts between the in-memory tree and the JSON schema.
 *
 * Schema version "2":
 *   {
 *     "versie": "2",
 *     "instellingen": {
 *       "showPercentage": boolean,
 *       "colorScheme": string,
 *       "customColor": string,
 *       "showSizeIndicators": boolean,
 *       "sizeIndicators": [{ "omvang": number, "label": string }]
 *     },
 *     "doel": <SerializedKnoop> | null
 *   }
 *
 * Schema version "1" (legacy, read-only):
 *   {
 *     "versie": "1",
 *     "doel": <SerializedKnoop> | null
 *   }
 *   → loaded with default settings.
 *
 * SerializedKnoop:
 *   { id, naam, omvang, voortgangspercentage, kinderen }
 *   (parent is omitted — it is a runtime-only reference)
 */

import { Knoop } from '../model/tree.js';
import {
  COLOR_SCHEME_KEYS,
  DEFAULT_CUSTOM_COLOR,
  normalizeColorScheme,
  normalizeCustomColor,
  normalizeSizeIndicators,
} from '../model/settings.js';

const SCHEMA_VERSION = '2';
const SUPPORTED_VERSIONS = new Set(['1', '2']);

const DEFAULT_SETTINGS = {
  showPercentage: true,
  colorScheme: 'blauw',
  customColor: DEFAULT_CUSTOM_COLOR,
  showSizeIndicators: false,
  sizeIndicators: [],
};

// ── Serialize ────────────────────────────────────────────────────────────────

/**
 * Convert the in-memory tree, settings and project name to a JSON string.
 *
 * @param {import('../model/tree.js').Knoop | null} root
 * @param {{ showPercentage: boolean, colorScheme: string, customColor?: string, showSizeIndicators?: boolean, sizeIndicators?: Array<{ omvang: number, label: string }> }} settings
 * @param {string} [projectnaam]
 * @returns {string} JSON string
 */
export function serialize(root, settings, projectnaam = '') {
  const doc = {
    versie: SCHEMA_VERSION,
    projectnaam: projectnaam.trim(),
    instellingen: {
      showPercentage: settings.showPercentage,
      colorScheme: normalizeColorScheme(settings.colorScheme),
      customColor: normalizeCustomColor(settings.customColor),
      showSizeIndicators: Boolean(settings.showSizeIndicators),
      sizeIndicators: normalizeSizeIndicators(settings.sizeIndicators),
    },
    doel: root ? serializeNode(root) : null,
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Recursively serialize a single node (omitting `parent`).
 * @param {import('../model/tree.js').Knoop} node
 * @returns {object}
 */
function serializeNode(node) {
  return {
    id: node.id,
    naam: node.naam,
    omvang: node.omvang,
    voortgangspercentage: node.voortgangspercentage,
    kinderen: node.kinderen.map(serializeNode),
  };
}

// ── Deserialize ──────────────────────────────────────────────────────────────

/**
 * Parse and validate a JSON string, then rebuild the in-memory tree.
 *
 * @param {string} jsonString
 * @returns {{ valid: true, root: import('../model/tree.js').Knoop | null, settings: object }
 *          | { valid: false, error: string }}
 */
export function deserialize(jsonString) {
  // 1. Parse JSON.
  let doc;
  try {
    doc = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'Ongeldig JSON-bestand: het bestand kan niet worden gelezen.' };
  }

  // 2. Check versie field.
  if (typeof doc !== 'object' || doc === null || !('versie' in doc)) {
    return { valid: false, error: 'Ongeldig projectbestand: het veld "versie" ontbreekt.' };
  }
  if (!SUPPORTED_VERSIONS.has(doc.versie)) {
    return {
      valid: false,
      error: `Onbekende schemaversie "${doc.versie}". Ondersteunde versies: ${[...SUPPORTED_VERSIONS].join(', ')}.`,
    };
  }

  // 3. Parse instellingen (v2 only; v1 files use defaults).
  const settings = doc.versie === '2'
    ? parseInstellingen(doc.instellingen)
    : { ...DEFAULT_SETTINGS };

  // 4. Parse projectnaam (optional; absent in v1 and old v2 files).
  const projectnaam = typeof doc.projectnaam === 'string' ? doc.projectnaam : '';

  // 5. Empty project is valid.
  if (doc.doel === null || doc.doel === undefined) {
    return { valid: true, root: null, settings, projectnaam };
  }

  // 5. Validate node tree and collect IDs.
  const seenIds = new Set();
  const validationError = validateNode(doc.doel, seenIds);
  if (validationError) {
    return { valid: false, error: validationError };
  }

  // 6. Rebuild in-memory tree with parent references.
  const root = buildNode(doc.doel, null);
  return { valid: true, root, settings, projectnaam };
}

/**
 * Parse and sanitise the instellingen block from a v2 document.
 * Falls back to defaults for missing or invalid values.
 * @param {*} raw
 * @returns {{ showPercentage: boolean, colorScheme: string, customColor: string, showSizeIndicators: boolean, sizeIndicators: Array<{ omvang: number, label: string }> }}
 */
function parseInstellingen(raw) {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };

  const showPercentage = typeof raw.showPercentage === 'boolean'
    ? raw.showPercentage
    : DEFAULT_SETTINGS.showPercentage;

  const colorScheme = COLOR_SCHEME_KEYS.includes(raw.colorScheme)
    ? raw.colorScheme
    : DEFAULT_SETTINGS.colorScheme;

  const customColor = normalizeCustomColor(raw.customColor);

  const showSizeIndicators = typeof raw.showSizeIndicators === 'boolean'
    ? raw.showSizeIndicators
    : DEFAULT_SETTINGS.showSizeIndicators;

  const sizeIndicators = normalizeSizeIndicators(raw.sizeIndicators);

  return { showPercentage, colorScheme, customColor, showSizeIndicators, sizeIndicators };
}

/**
 * Recursively validate a serialized node object.
 * Returns an error string, or null if the node is valid.
 *
 * @param {*} raw  The raw parsed object
 * @param {Set<string>} seenIds  Accumulator for unique-ID check
 * @param {string} [path]  Human-readable path for error messages
 * @returns {string | null}
 */
function validateNode(raw, seenIds, path = 'doel') {
  if (typeof raw !== 'object' || raw === null) {
    return `Ongeldig knooppunt op "${path}": verwacht een object.`;
  }

  // id — must be a non-empty string and unique
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return `Ongeldig knooppunt op "${path}": "id" moet een niet-lege string zijn.`;
  }
  if (seenIds.has(raw.id)) {
    return `Ongeldig projectbestand: dubbel id "${raw.id}" gevonden op "${path}".`;
  }
  seenIds.add(raw.id);

  // naam — must be a string of 1–200 characters
  if (typeof raw.naam !== 'string' || raw.naam.trim().length < 1 || raw.naam.length > 200) {
    return `Ongeldig knooppunt op "${path}": "naam" moet een string zijn van 1–200 tekens.`;
  }

  // omvang — must be a positive integer or null
  if (raw.omvang !== null) {
    if (
      typeof raw.omvang !== 'number' ||
      !Number.isInteger(raw.omvang) ||
      raw.omvang < 1
    ) {
      return `Ongeldig knooppunt op "${path}": "omvang" moet een geheel getal >= 1 of null zijn.`;
    }
  }

  // voortgangspercentage — must be an integer 0–100
  if (
    typeof raw.voortgangspercentage !== 'number' ||
    !Number.isInteger(raw.voortgangspercentage) ||
    raw.voortgangspercentage < 0 ||
    raw.voortgangspercentage > 100
  ) {
    return `Ongeldig knooppunt op "${path}": "voortgangspercentage" moet een geheel getal tussen 0 en 100 zijn.`;
  }

  // kinderen — must be an array
  if (!Array.isArray(raw.kinderen)) {
    return `Ongeldig knooppunt op "${path}": "kinderen" moet een array zijn.`;
  }

  // Recurse into children.
  for (let i = 0; i < raw.kinderen.length; i++) {
    const childError = validateNode(raw.kinderen[i], seenIds, `${path}.kinderen[${i}]`);
    if (childError) return childError;
  }

  return null;
}

/**
 * Recursively build a Knoop tree from a validated serialized node,
 * restoring parent references.
 *
 * @param {object} raw  Validated serialized node
 * @param {import('../model/tree.js').Knoop | null} parent
 * @returns {import('../model/tree.js').Knoop}
 */
function buildNode(raw, parent) {
  const node = new Knoop(raw.naam, parent);
  // Override the auto-generated id with the persisted one.
  node.id = raw.id;
  node.omvang = raw.omvang;
  node.voortgangspercentage = raw.voortgangspercentage;
  node.kinderen = raw.kinderen.map(child => buildNode(child, node));
  return node;
}
