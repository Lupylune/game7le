/* Test de fumée : charge chaque page et chaque jeu d'entraînement,
   vérifie l'absence d'erreurs console et la présence du contenu attendu. */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4183';
const errors = [];
let failures = 0;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

async function check(path, selector, label) {
  errors.length = 0;
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  try {
    await page.waitForSelector(selector, { timeout: 8000 });
    if (errors.length) {
      failures++;
      console.log(`✗ ${label} (${path}) — erreurs: ${errors.join(' | ')}`);
    } else {
      console.log(`✓ ${label}`);
    }
  } catch {
    failures++;
    console.log(`✗ ${label} (${path}) — sélecteur introuvable: ${selector}; erreurs: ${errors.join(' | ')}`);
  }
}

// première visite : la popup de pseudo doit apparaître, on la remplit
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
try {
  await page.waitForSelector('.pseudo-modal input', { timeout: 4000 });
  await page.fill('.pseudo-modal input', 'Testeur');
  await page.click('.pseudo-modal button');
  console.log('✓ Popup pseudo (première visite)');
} catch {
  failures++;
  console.log('✗ Popup pseudo absente à la première visite');
}

// Le classement réel du jour peut être vide (personne n'a encore couru) :
// on accepte des lignes ou l'état vide (balle de foin qui roule).
const SEL_CLASSEMENT = '.lb .row, .lb .hay-scene';
await check('/', SEL_CLASSEMENT, 'Accueil + top 5');
await check('/comment-jouer', '.rule-card', 'Comment jouer');
await check('/a-propos', '.prose h1', 'À propos');
await check('/archives', '.archive-list li', 'Archives');
await check('/classement', SEL_CLASSEMENT, 'Classement');
await check('/classement?onglet=defi', SEL_CLASSEMENT, 'Classement — défi difficile');
await check('/parametres', '.settings-row', 'Paramètres');
await check('/profil', '.badges-grid', 'Profil + badges');
await check('/entrainement', '.game-card', 'Entraînement (liste)');

const jeux = [
  ['lemot', '.wordy-board'],
  ['croises', '.cw-grid'],
  ['paire', '.paire-grid'],
  ['sudoku', '.sudoku-grid'],
  ['reines', '.queens-grid'],
  ['demineur', '.ms-grid'],
  ['nonogramme', '.nono-grid'],
  ['ratiole', '.draw-svg'],
  ['melimelo', '.meli-reveal'],
  ['chromal', '.chromal-grid'],
  ['trace', '.draw-svg'],
  ['dactylo', '.dactylo-phrase'],
  ['echecs', '.chess-board'],
  ['pokedle', '.pokedle-board'],
];
for (const [id, sel] of jeux) await check(`/entrainement/${id}`, sel, `Jeu : ${id}`);

// Run du jour : l'intro, le compte à rebours puis la première épreuve du tirage
await check('/jouer', '.interstitial', 'Run — intro');
await page.click('button.btn-primary');
try {
  await page.waitForSelector('.transition .countdown', { timeout: 4000 });
  await page.waitForSelector('.game-rules', { timeout: 8000 });
  const nom = (await page.textContent('.game-name'))?.trim();
  console.log(`✓ Run — première épreuve du tirage (${nom}), chrono :`, await page.textContent('.timer'));
} catch {
  failures++;
  console.log('✗ Run — la première épreuve ne démarre pas', errors.join(' | '));
}

// Défi difficile de la semaine : intro puis première épreuve corsée
await check('/defi', '.interstitial', 'Défi difficile — intro');
await page.click('button.btn-primary');
try {
  await page.waitForSelector('.transition .countdown', { timeout: 4000 });
  await page.waitForSelector('.game-rules', { timeout: 8000 });
  const nom = (await page.textContent('.game-name'))?.trim();
  console.log(`✓ Défi difficile — première épreuve du tirage (${nom})`);
} catch {
  failures++;
  console.log('✗ Défi difficile — la première épreuve ne démarre pas', errors.join(' | '));
}

// Interactions rapides : sudoku (clic + pavé), démineur (premier clic génère)
await page.goto(BASE + '/entrainement/sudoku', { waitUntil: 'networkidle' });
await page.waitForSelector('.sudoku-grid .cell');
const givens = await page.locator('.sudoku-grid .cell.given').count();
console.log(givens >= 10 && givens <= 20 ? `✓ Sudoku : ${givens} indices` : `✗ Sudoku : ${givens} indices (attendu ~14)`);

await page.goto(BASE + '/entrainement/demineur', { waitUntil: 'networkidle' });
await page.click('.ms-grid .cell >> nth=66');
await page.waitForTimeout(300);
const open = await page.locator('.ms-grid .cell.open').count();
console.log(open > 5 ? `✓ Démineur : ${open} cases ouvertes après le premier clic` : `✗ Démineur : ${open} cases ouvertes`);

await browser.close();
console.log(failures ? `\n${failures} ÉCHEC(S)` : '\nTOUT EST VERT');
process.exit(failures ? 1 : 0);
