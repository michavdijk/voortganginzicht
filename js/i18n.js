/**
 * Internationalisation module.
 *
 * Exposes a current language ('nl' or 'en'), a translate function t(key, params),
 * and emits a 'language-changed' event whenever the language is switched.
 *
 * Language preference is kept out of the project JSON and is not persisted.
 * The app starts in Dutch on every page load.
 */

import { emit } from './events.js';

const DEFAULT_LANG = 'nl';
const SUPPORTED = ['nl', 'en'];

const translations = {
  nl: {
    'app.doc.lang':                     'nl',

    'panel.tree.ariaLabel':             'Boomstructuur',
    'panel.tree.header':                'Werkstructuur',
    'panel.tree.collapse':              'Werkstructuur inklappen',
    'panel.tree.expand':                'Werkstructuur uitklappen',
    'panel.settings.header':            'Instellingen',
    'panel.chart.ariaLabel':            'Voortgangsrapport',
    'panel.chart.header':               'Voortgangsrapport',
    'chart.placeholder':                'Vul de werkstructuur in — het voortgangsrapport verschijnt automatisch.',
    'chart.calculating':                'Berekenen...',
    'chart.sizeGuide':                  'relatieve omvang',

    'project.placeholder':              'Projectnaam...',
    'project.prompt.name':              'Projectnaam:',

    'toolbar.new':                      'Nieuw project',
    'toolbar.open':                     'Open project',
    'toolbar.save':                     'Opslaan project',
    'toolbar.download':                 'Download als PNG',

    'help.title':                       'Help',
    'help.close':                       'Sluit help',
    'help.navLabel':                    'Help onderwerpen',
    'help.openSection':                 'Open help over {section}',
    'help.workStructure.nav':           'Werkstructuur',
    'help.workStructure.title':         'Werkstructuur',
    'help.workStructure.intro':         'De werkstructuur bestaat uit één doel met daaronder subdoelen en activiteiten. Het type van een knoop wordt automatisch bepaald door de plek in de structuur.',
    'help.workStructure.item1':         'Doel: het resultaat waar het project naartoe werkt.',
    'help.workStructure.item2':         'Subdoelen: groepen werk onder het doel; je mag subdoelen verder opdelen.',
    'help.workStructure.item3':         'Activiteiten: concrete werkzaamheden zonder kinderen; daarop vul je omvang en voortgang in.',
    'help.workStructure.item4':         'Gebruik het plusje om een onderliggende knoop toe te voegen en de pijltjes om onderdelen te ordenen.',
    'help.workStructure.item5':         'Omvang is een relatieve inschatting van werk. Gebruik gehele getallen, bijvoorbeeld 100 klein, 200 middel en 400 groot.',
    'help.workStructure.item6':         'Voortgang is het percentage dat klaar is.',
    'help.workStructure.item7':         'Alleen activiteiten krijgen omvang en voortgang.',
    'help.workStructure.item8':         'Bovenliggende voortgang wordt automatisch gewogen op basis van de omvang van activiteiten.',
    'help.chart.nav':                   'Voortgangsrapport',
    'help.chart.title':                 'Voortgangsrapport',
    'help.chart.intro':                 'Het voortgangsrapport toont de werkstructuur als visuele voortgangsrapportage.',
    'help.chart.item1':                 'De breedte van activiteiten volgt uit de ingevulde omvang.',
    'help.chart.item2':                 'De vulling van de balken toont de voortgang.',
    'help.chart.item3':                 'Bovenliggende blokken worden automatisch berekend op basis van de activiteiten eronder.',
    'help.chart.item4':                 'Pas de weergave van het rapport aan via Instellingen; open deze met het tandwiel bij het voortgangsrapport.',
    'help.chart.item5':                 'Gebruik Download als PNG om het huidige rapport als afbeelding op te slaan.',
    'help.settings.nav':                'Instellingen',
    'help.settings.title':              'Instellingen',
    'help.settings.intro':              'Met de instellingen bepaal je wat er in het voortgangsrapport wordt getoond en hoe de omvang visueel wordt geduid. Je opent deze instellingen met het tandwiel bij het voortgangsrapport.',
    'help.settings.item1':              'Voortgangspercentages tonen bepaalt of voortgangspercentages zichtbaar zijn in de blokken.',
    'help.settings.item2':              'Kleurenschema wijzigt de hoofdkleur van de voortgangsbalken; met Aangepast kies je zelf een hoofdkleur.',
    'help.settings.item3':              'Omvangindicatoren tekenen verticale referentielijnen op de activiteitskolom, zodat je activiteitgroottes makkelijker kunt vergelijken.',
    'help.settings.item3.sub1':         'Zet omvangindicatoren aan en voeg per referentie een omvang en label toe.',
    'help.settings.item3.sub2':         'Gebruik labels als klein, middel, groot of mijlpaal.',
    'help.settings.item3.sub3':         'Een indicator met omvang 200 staat op dezelfde relatieve breedte als een activiteit met omvang 200.',
    'help.files.nav':                   'Bestanden',
    'help.files.title':                 'Bestanden',
    'help.files.intro':                 'Projectbestanden worden lokaal als JSON opgeslagen. Het voortgangsrapport kun je als PNG downloaden.',
    'help.files.item1':                 'Opslaan project bewaart de werkstructuur, instellingen en projectnaam.',
    'help.files.item2':                 'Open project leest een eerder opgeslagen project.',
    'help.files.item3':                 'Download als PNG is beschikbaar zodra er een geldig voortgangsrapport is.',
    'help.files.item4':                 'Bestanden blijven op je eigen apparaat; de app slaat niets op de server op.',

    'tree.empty.message':               'Er is nog geen Doel. Maak het Doel aan om te beginnen.',
    'tree.empty.button':                'Maak het Doel aan',
    'tree.prompt.createGoal':           'Naam van het Doel:',
    'tree.prompt.createChild':          'Naam van de nieuwe knoop:',
    'tree.tooltip.omvangNotSet':        'Omvang is nog niet ingesteld',
    'tree.tooltip.clickToRename':       'Klik om te hernoemen',
    'tree.field.omvang':                'Omvang:',
    'tree.field.voortgang':             'Voortgang:',
    'tree.tooltip.omvang':              'Relatieve omvang (geheel getal ≥ 1)',
    'tree.tooltip.voortgang':           'Voortgangspercentage (0–100)',
    'tree.action.addChild':             'Voeg kind-knoop toe',
    'tree.action.moveUp':               'Schuif omhoog',
    'tree.action.moveDown':             'Schuif omlaag',
    'tree.action.delete':               'Verwijder knoop',

    'type.doel':                        'Doel',
    'type.subdoel':                     'Subdoel',
    'type.activiteit':                  'Activiteit',

    'settings.percentage':              'Voortgangspercentages tonen',
    'settings.colorScheme':             'Kleurenschema',
    'settings.color.blauw':             'Blauw',
    'settings.color.rood':              'Rood',
    'settings.color.groen':             'Groen',
    'settings.color.oranje':            'Oranje',
    'settings.color.paars':             'Paars',
    'settings.color.aangepast':         'Aangepast',
    'settings.customColor':             'Hoofdkleur',
    'settings.customColor.choose':      'Kies kleur',
    'settings.sizeIndicators':          'Omvangindicatoren tonen',
    'settings.sizeIndicator.omvang':    'Omvang',
    'settings.sizeIndicator.label':     'Label',
    'settings.sizeIndicator.add':       'Indicator toevoegen',
    'settings.sizeIndicator.remove':    'Verwijder indicator',
    'settings.sizeIndicator.defaultLabel': 'Indicator {number}',
    'settings.drawer.open':             'Instellingen openen',
    'settings.drawer.close':            'Instellingen sluiten',

    'dialog.close':                     'Sluit melding',
    'dialog.confirmDelete':             'Weet u zeker dat u "{name}" en al zijn onderdelen wilt verwijderen?',
    'dialog.unsaved':                   'Er zijn niet-opgeslagen wijzigingen. Wilt u doorgaan zonder opslaan?',

    'error.openFile':                   'Fout bij het openen van het bestand: {message}',
    'error.saveFile':                   'Fout bij het opslaan: {message}',
    'error.noChart':                    'Er is nog geen voortgangsrapport om te downloaden.',
    'error.imageGen':                   'Fout bij het genereren van de afbeelding.',
    'error.downloadFailed':             'Download mislukt: {message}',
    'error.readFile':                   'Fout bij het lezen van het bestand.',
    'success.newProject':               'Nieuw project aangemaakt.',
    'success.opened':                   'Project geopend.',
    'success.saved':                    'Project opgeslagen.',
    'success.downloaded':               'Voortgangsrapport gedownload.',

    'file.picker.description':          'Voortganginzicht JSON',

    'validation.name.mustBeString':     'Naam moet een tekst zijn.',
    'validation.name.notEmpty':         'Naam mag niet leeg zijn.',
    'validation.name.tooLong':          'Naam mag maximaal 200 tekens bevatten.',
    'validation.omvang.mustBeInt':      'Omvang moet een geheel getal zijn.',
    'validation.omvang.noDecimals':     'Omvang moet een geheel getal zijn (geen decimalen).',
    'validation.omvang.min':            'Omvang moet minimaal 1 zijn.',
    'validation.sizeIndicator.labelRequired': 'Label is verplicht.',
    'validation.sizeIndicator.labelTooLong': 'Label mag maximaal 80 tekens bevatten.',
    'validation.percentage.mustBeInt':  'Percentage moet een geheel getal zijn.',
    'validation.percentage.noDecimals': 'Percentage moet een geheel getal zijn (geen decimalen).',
    'validation.percentage.range':      'Percentage moet tussen 0 en 100 liggen.',
    'validation.omvang.onlyActiviteit': 'Omvang kan alleen worden ingesteld op een Activiteit.',
    'validation.voortgang.onlyActiviteit': 'Voortgangspercentage kan alleen worden ingesteld op een Activiteit.',

    'lang.label':                       'Taal',
    'lang.nl':                          'Nederlands',
    'lang.en':                          'Engels',
  },
  en: {
    'app.doc.lang':                     'en',

    'panel.tree.ariaLabel':             'Tree structure',
    'panel.tree.header':                'Work structure',
    'panel.tree.collapse':              'Collapse work structure',
    'panel.tree.expand':                'Expand work structure',
    'panel.settings.header':            'Settings',
    'panel.chart.ariaLabel':            'Progress report',
    'panel.chart.header':               'Progress report',
    'chart.placeholder':                'Fill in the work structure — the progress report appears automatically.',
    'chart.calculating':                'Calculating...',
    'chart.sizeGuide':                  'relative size',

    'project.placeholder':              'Project name...',
    'project.prompt.name':              'Project name:',

    'toolbar.new':                      'New project',
    'toolbar.open':                     'Open project',
    'toolbar.save':                     'Save project',
    'toolbar.download':                 'Download as PNG',

    'help.title':                       'Help',
    'help.close':                       'Close help',
    'help.navLabel':                    'Help topics',
    'help.openSection':                 'Open help about {section}',
    'help.workStructure.nav':           'Work structure',
    'help.workStructure.title':         'Work structure',
    'help.workStructure.intro':         'The work structure consists of one goal with subgoals and activities below it. A node’s type is determined automatically by its place in the structure.',
    'help.workStructure.item1':         'Goal: the result the project is working toward.',
    'help.workStructure.item2':         'Subgoals: groups of work under the goal; subgoals can be split further.',
    'help.workStructure.item3':         'Activities: concrete work items without children; size and progress are entered there.',
    'help.workStructure.item4':         'Use the plus button to add a child node and the arrow buttons to order items.',
    'help.workStructure.item5':         'Size is a relative estimate of work. Use whole numbers, for example 100 small, 200 medium, and 400 large.',
    'help.workStructure.item6':         'Progress is the percentage that is complete.',
    'help.workStructure.item7':         'Only activities get size and progress values.',
    'help.workStructure.item8':         'Parent progress is calculated automatically, weighted by activity size.',
    'help.chart.nav':                   'Progress report',
    'help.chart.title':                 'Progress report',
    'help.chart.intro':                 'The progress report shows the work structure as a visual progress overview.',
    'help.chart.item1':                 'Activity width follows from the entered size.',
    'help.chart.item2':                 'The filled bars show progress.',
    'help.chart.item3':                 'Parent blocks are calculated automatically from the activities below them.',
    'help.chart.item4':                 'Adjust the report view via Settings; open them with the gear icon next to the progress report.',
    'help.chart.item5':                 'Use Download as PNG to save the current report as an image.',
    'help.settings.nav':                'Settings',
    'help.settings.title':              'Settings',
    'help.settings.intro':              'Settings control what appears in the progress report and how size is visually explained. Open them with the gear icon next to the progress report.',
    'help.settings.item1':              'Show progress percentages controls whether progress percentages are visible in the blocks.',
    'help.settings.item2':              'Color scheme changes the main color of the progress bars; Custom lets you choose the main color yourself.',
    'help.settings.item3':              'Size indicators draw vertical reference lines on the activity column so activity sizes are easier to compare.',
    'help.settings.item3.sub1':         'Turn size indicators on and add a size and label for each reference.',
    'help.settings.item3.sub2':         'Use labels such as small, medium, large, or milestone.',
    'help.settings.item3.sub3':         'An indicator with size 200 appears at the same relative width as an activity with size 200.',
    'help.files.nav':                   'Files',
    'help.files.title':                 'Files',
    'help.files.intro':                 'Project files are saved locally as JSON. The progress report can be downloaded as a PNG.',
    'help.files.item1':                 'Save project stores the work structure, settings, and project name.',
    'help.files.item2':                 'Open project reads a previously saved project.',
    'help.files.item3':                 'Download as PNG is available once there is a valid progress report.',
    'help.files.item4':                 'Files stay on your own device; the app does not store anything on the server.',

    'tree.empty.message':               'There is no Goal yet. Create the Goal to get started.',
    'tree.empty.button':                'Create the Goal',
    'tree.prompt.createGoal':           'Name of the Goal:',
    'tree.prompt.createChild':          'Name of the new node:',
    'tree.tooltip.omvangNotSet':        'Size has not been set yet',
    'tree.tooltip.clickToRename':       'Click to rename',
    'tree.field.omvang':                'Size:',
    'tree.field.voortgang':             'Progress:',
    'tree.tooltip.omvang':              'Relative size (integer ≥ 1)',
    'tree.tooltip.voortgang':           'Progress percentage (0–100)',
    'tree.action.addChild':             'Add child node',
    'tree.action.moveUp':               'Move up',
    'tree.action.moveDown':             'Move down',
    'tree.action.delete':               'Delete node',

    'type.doel':                        'Goal',
    'type.subdoel':                     'Subgoal',
    'type.activiteit':                  'Activity',

    'settings.percentage':              'Show progress percentages',
    'settings.colorScheme':             'Color scheme',
    'settings.color.blauw':             'Blue',
    'settings.color.rood':              'Red',
    'settings.color.groen':             'Green',
    'settings.color.oranje':            'Orange',
    'settings.color.paars':             'Purple',
    'settings.color.aangepast':         'Custom',
    'settings.customColor':             'Main color',
    'settings.customColor.choose':      'Choose color',
    'settings.sizeIndicators':          'Show size indicators',
    'settings.sizeIndicator.omvang':    'Size',
    'settings.sizeIndicator.label':     'Label',
    'settings.sizeIndicator.add':       'Add indicator',
    'settings.sizeIndicator.remove':    'Remove indicator',
    'settings.sizeIndicator.defaultLabel': 'Indicator {number}',
    'settings.drawer.open':             'Open settings',
    'settings.drawer.close':            'Close settings',

    'dialog.close':                     'Close notification',
    'dialog.confirmDelete':             'Are you sure you want to delete "{name}" and all of its contents?',
    'dialog.unsaved':                   'There are unsaved changes. Do you want to continue without saving?',

    'error.openFile':                   'Error opening the file: {message}',
    'error.saveFile':                   'Error saving: {message}',
    'error.noChart':                    'There is no progress report to download yet.',
    'error.imageGen':                   'Error generating the image.',
    'error.downloadFailed':             'Download failed: {message}',
    'error.readFile':                   'Error reading the file.',
    'success.newProject':               'New project created.',
    'success.opened':                   'Project opened.',
    'success.saved':                    'Project saved.',
    'success.downloaded':               'Progress report downloaded.',

    'file.picker.description':          'Voortganginzicht JSON',

    'validation.name.mustBeString':     'Name must be text.',
    'validation.name.notEmpty':         'Name cannot be empty.',
    'validation.name.tooLong':          'Name must be at most 200 characters.',
    'validation.omvang.mustBeInt':      'Size must be an integer.',
    'validation.omvang.noDecimals':     'Size must be an integer (no decimals).',
    'validation.omvang.min':            'Size must be at least 1.',
    'validation.sizeIndicator.labelRequired': 'Label is required.',
    'validation.sizeIndicator.labelTooLong': 'Label must be at most 80 characters.',
    'validation.percentage.mustBeInt':  'Percentage must be an integer.',
    'validation.percentage.noDecimals': 'Percentage must be an integer (no decimals).',
    'validation.percentage.range':      'Percentage must be between 0 and 100.',
    'validation.omvang.onlyActiviteit': 'Size can only be set on an Activity.',
    'validation.voortgang.onlyActiviteit': 'Progress percentage can only be set on an Activity.',

    'lang.label':                       'Language',
    'lang.nl':                          'Dutch',
    'lang.en':                          'English',
  },
};

let _current = DEFAULT_LANG;

export function getLang() {
  return _current;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === _current) return;
  _current = lang;
  emit('language-changed', lang);
}

export function supportedLangs() {
  return SUPPORTED.slice();
}

/**
 * Translate a key to the current language, with optional {placeholder} interpolation.
 * Falls back to the Dutch string, then to the key itself, if missing.
 */
export function t(key, params) {
  const table = translations[_current] || translations[DEFAULT_LANG];
  let str = table[key];
  if (str === undefined) str = translations[DEFAULT_LANG][key];
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
