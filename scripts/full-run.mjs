/* Parcours complet : lance le run du jour, passe/joue chaque épreuve
   (horloge simulée) et vérifie l'écran de résultats + la sauvegarde. */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4183';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.clock.install();
await page.goto(BASE + '/jouer');
// première visite : popup de pseudo
if (await page.locator('.pseudo-modal input').count()) {
  await page.fill('.pseudo-modal input', 'Testeur');
  await page.click('.pseudo-modal button');
}
await page.click('button.btn-primary'); // « Lancer le chrono »

/* Avance l'horloge par pas de 1 s pour laisser React re-planifier ses timers. */
async function forward(totalMs) {
  for (let t = 0; t < totalMs; t += 1000) {
    await page.clock.fastForward(Math.min(1000, totalMs - t));
  }
}

async function skip(afterS) {
  // récap (~2,4 s) + compte à rebours (3 s) avant l'épreuve + délai de skip + marge
  await forward(5700 + afterS * 1000 + 1500);
  await page.click('button:has-text("Passer")');
  await forward(1600);
}

async function dragOnce() {
  await page.waitForSelector('.draw-svg', { timeout: 5000 });
  const box = await page.locator('.draw-svg').boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(box.x + (box.width * i) / 8, box.y + box.height / 2 + (i % 2) * 4, { steps: 4 });
  await page.mouse.up();
}

async function dragAcross(extraMs = 0) {
  // récap + compte à rebours avant l'épreuve, + éventuelle animation du jeu
  await forward(6000 + extraMs);
  await dragOnce();
  await forward(2500);
}

/* Tempo : 5 durées à reproduire en maintenant l'appui. On avance l'horloge
   simulée pour laisser la pulsation se terminer, puis on maintient — la durée
   tenue est mesurée soit par l'horloge simulée, soit par l'attente réelle
   (selon ce que `page.clock` remplace), les deux dépassant le seuil des 200 ms
   sous lequel l'appui ne compte pas. */
async function tempo() {
  await forward(6000);
  for (let m = 0; m < 5; m++) {
    await forward(7000); // respiration + pulsation (jusqu'à 6 s au défi)
    const scene = page.locator('.tempo-scene', { hasText: 'à vous' });
    await scene.waitFor({ timeout: 5000 });
    const box = await page.locator('.tempo-scene').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.fastForward(1500);
    await page.waitForTimeout(400);
    await page.mouse.up();
    await forward(1600); // verdict de la manche
  }
  await forward(2000); // bilan des 5 manches
}

// Ratiole : trois formes à couper l'une après l'autre
async function tripleCut() {
  await forward(6000);
  for (let c = 0; c < 3; c++) {
    await dragOnce();
    await forward(2500);
  }
}

// 7 épreuves tirées au sort chaque jour : on lit le nom affiché et on agit
const actions = {
  'Le Mot': () => skip(60),
  'Mini Croisés': () => skip(60),
  Paire: () => skip(60),
  'Mini Sudoku': () => skip(60),
  Reines: () => skip(60),
  Démineur: () => skip(60),
  Nonogramme: () => skip(60),
  Ratiole: tripleCut,
  Mélimélo: () => skip(60),
  Chromal: () => skip(60),
  // Tracé : le segment parcourt la forme (~3 s) avant que le dessin ne soit permis
  Tracé: () => dragAcross(4500),
  Dactylo: () => skip(60),
  Échecs: () => skip(60),
  Pokédle: () => skip(60),
  // Atlas charge des libs/tuiles externes ; on ne joue pas, on passe.
  Atlas: () => skip(60),
  Tempo: tempo,
};

for (let step = 0; step < 7; step++) {
  await page.waitForSelector('.game-name', { timeout: 8000 });
  const nom = (await page.textContent('.game-name'))?.trim();
  console.log(`→ ${nom}`);
  if (!actions[nom]) throw new Error(`jeu inconnu : ${nom}`);
  await actions[nom]();
}

await forward(4000); // récap de la dernière épreuve avant l'écran de résultats
await page.waitForSelector('.results', { timeout: 8000 });
const total = await page.textContent('.results .total');
const lignes = await page.locator('.results tbody tr').count();
const saved = await page.evaluate(() => localStorage.getItem('game7le:runs'));
await page.click('button:has-text("Voir les solutions")');
await page.waitForSelector('.solution-card', { timeout: 4000 });
const nbSolutions = await page.locator('.solution-card').count();
console.log(`Solutions affichées : ${nbSolutions} carte(s)`);
await page.screenshot({ path: '/tmp/results-solutions.png', fullPage: true });
console.log(`\nRésultats affichés : total ${total?.trim()}, ${lignes} lignes, sauvegarde ${saved ? 'OK' : 'ABSENTE'}`);
if (errors.length) console.log('Erreurs page :', errors.join(' | '));

// Le profil doit afficher les stats du run
await page.goto(BASE + '/profil');
await page.waitForSelector('.stat-tile', { timeout: 5000 });
const tuiles = await page.locator('.stat-tile').count();
const runsVal = await page.locator('.stat-tile:has-text("Runs") .valeur').first().textContent();
console.log(`Profil : ${tuiles} tuiles de stats, Runs = ${runsVal?.trim()}`);

// L'accueil doit maintenant afficher le temps du jour
await page.goto(BASE + '/');
await page.waitForSelector('.done-card .time', { timeout: 5000 });
console.log('Accueil : carte « votre temps du jour » visible ✓');

await browser.close();
const ok = lignes === 7 && saved && errors.length === 0;
console.log(ok ? 'PARCOURS COMPLET OK' : 'ÉCHEC');
process.exit(ok ? 0 : 1);
