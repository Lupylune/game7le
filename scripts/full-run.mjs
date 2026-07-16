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
await page.click('button.btn-primary'); // « Lancer le chrono »

/* Avance l'horloge par pas de 1 s pour laisser React re-planifier ses timers. */
async function forward(totalMs) {
  for (let t = 0; t < totalMs; t += 1000) {
    await page.clock.fastForward(Math.min(1000, totalMs - t));
  }
}

async function skip(afterS) {
  // 3 s de compte à rebours avant l'épreuve + délai de skip + marge
  await forward(3200 + afterS * 1000 + 1500);
  await page.click('button:has-text("Passer")');
  await forward(1600);
}

async function dragAcross() {
  await forward(3500); // compte à rebours avant l'épreuve
  await page.waitForSelector('.draw-svg', { timeout: 5000 });
  const box = await page.locator('.draw-svg').boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(box.x + (box.width * i) / 8, box.y + box.height / 2 + (i % 2) * 4, { steps: 4 });
  await page.mouse.up();
  await forward(2500);
}

// 7 épreuves tirées au sort chaque jour : on lit le nom affiché et on agit
const actions = {
  'Le Mot': () => skip(45),
  'Mini Croisés': () => skip(45),
  Paire: () => skip(45),
  'Mini Sudoku': () => skip(45),
  Reines: () => skip(45),
  Démineur: () => skip(45),
  Nonogramme: () => skip(45),
  Ratiole: dragAcross,
  Mélimélo: () => skip(45),
  Chromal: () => skip(30),
  Tracé: dragAcross,
  Dactylo: () => skip(45),
  Échecs: () => skip(45),
};

for (let step = 0; step < 7; step++) {
  await page.waitForSelector('.game-name', { timeout: 8000 });
  const nom = (await page.textContent('.game-name'))?.trim();
  console.log(`→ ${nom}`);
  if (!actions[nom]) throw new Error(`jeu inconnu : ${nom}`);
  await actions[nom]();
}

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

// L'accueil doit maintenant afficher le temps du jour
await page.goto(BASE + '/');
await page.waitForSelector('.done-card .time', { timeout: 5000 });
console.log('Accueil : carte « votre temps du jour » visible ✓');

await browser.close();
const ok = lignes === 7 && saved && errors.length === 0;
console.log(ok ? 'PARCOURS COMPLET OK' : 'ÉCHEC');
process.exit(ok ? 0 : 1);
