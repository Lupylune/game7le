/**
 * Récupère les définitions Wiktionnaire des lemmes CROISES5 et génère
 * src/data/definitions.ts (indices des mini mots croisés).
 * Usage : node scripts/build-defs.mjs   (cache : /tmp/defs-cache.json)
 * Requêtes groupées (50 titres/appel) pour ménager l'API.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LEXIQUE = new URL('../src/data/lexique.ts', import.meta.url);
const CACHE = '/tmp/defs-cache.json';

const src = readFileSync(LEXIQUE, 'utf8');
const m = src.match(/CROISES5: string\[\] = '([^']+)'/);
if (!m) throw new Error('CROISES5 introuvable dans lexique.ts — lancer build-lexique.mjs d’abord');
const pairs = m[1].split(' ').map((p) => p.split(':')); // [STRIPPE, accentué]

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

function cleanLine(line, convertTemplates) {
  let d = line.slice(2);
  d = d.replace(/<ref[^>]*>.*?<\/ref>/g, '').replace(/<[^>]+>/g, '');
  if (convertTemplates) d = d.replace(/\{\{([^|{}]+)\|([^|{}]+)[^{}]*\}\}/g, '$1 $2');
  d = d.replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '');
  d = d.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1');
  d = d.replace(/'''?/g, '').replace(/\s+/g, ' ').replace(/^[\s:,.;–—]+/, '').trim();
  return d;
}

function extractDef(wikitext) {
  const start = wikitext.indexOf('== {{langue|fr}} ==');
  if (start === -1) return null;
  let fr = wikitext.slice(start + 10);
  const next = fr.indexOf('== {{langue|');
  if (next !== -1) fr = fr.slice(0, next);
  const lines = fr.split('\n').filter((l) => /^# /.test(l));
  for (const convert of [false, true]) {
    for (const line of lines) {
      const d = cleanLine(line, convert);
      if (d.length >= 12) return d;
    }
  }
  return null;
}

const missing = pairs.map(([, accent]) => accent).filter((a) => !(a in cache));
console.log(`À récupérer : ${missing.length} (cache : ${Object.keys(cache).length})`);

const BATCH = 20;
for (let i = 0; i < missing.length; i += BATCH) {
  const batch = missing.slice(i, i + BATCH);
  const u =
    'https://fr.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main' +
    `&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(batch.join('|'))}`;
  let tries = 0;
  for (;;) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const byTitle = new Map(
        (j?.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? null]),
      );
      for (const t of batch) cache[t] = byTitle.get(t) ? extractDef(byTitle.get(t)) : null;
      break;
    } catch (e) {
      if (++tries >= 5) {
        // on n'écrit rien dans le cache : une relance du script réessaiera ce lot
        console.log(`Lot ${i} abandonné (${e.message})`);
        break;
      }
      const wait = /429/.test(e.message) ? 30000 : 5000;
      console.log(`Erreur lot ${i} (${e.message}) — nouvel essai dans ${wait / 1000} s`);
      await new Promise((s) => setTimeout(s, wait));
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`${Math.min(i + BATCH, missing.length)}/${missing.length}`);
  await new Promise((s) => setTimeout(s, 2000));
}

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const out = {};
for (const [word, accent] of pairs) {
  let def = cache[accent];
  if (!def) continue;
  // masque le mot (et ses dérivés proches) dans sa propre définition
  const stem = accent.slice(0, 4);
  const re = new RegExp(`\\b(${stem}|${strip(stem)})[a-zà-ÿ]*`, 'gi');
  def = def.replace(re, '____');
  if (def.length > 110) def = def.slice(0, 110).replace(/\s+\S*$/, '') + '…';
  def = def.charAt(0).toUpperCase() + def.slice(1);
  // filtre qualité : assez de contenu non masqué, pas de résidu de template
  // (« Familier fr … »), ne commence pas par le mot masqué
  const visible = def.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (visible.length < 12) continue;
  if (/(^|\s)(fr|fro|frm|conv)(\s|$)/.test(visible)) continue;
  if (def.startsWith('____')) continue;
  out[word] = def;
}

const packed = Object.keys(out)
  .sort()
  .map((w) => `${w}|${out[w].replace(/\n/g, ' ')}`)
  .join('\n');

writeFileSync(
  new URL('../src/data/definitions.ts', import.meta.url),
  `/**
 * Définitions extraites du Wiktionnaire (fr.wiktionary.org, CC BY-SA 4.0),
 * indices des mini mots croisés. NE PAS ÉDITER — régénérer : node scripts/build-defs.mjs
 */
const RAW = ${JSON.stringify(packed)};

/** MOT (sans accent) → définition masquée. */
export const DEFS5: Map<string, string> = new Map(
  RAW.split('\\n').map((l) => {
    const i = l.indexOf('|');
    return [l.slice(0, i), l.slice(i + 1)] as [string, string];
  }),
);
`,
);
console.log(`Définitions retenues : ${Object.keys(out).length}/${pairs.length}`);
