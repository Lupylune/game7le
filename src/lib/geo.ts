/**
 * Outils géo du jeu Atlas : distance de Haversine, barème de score, et
 * chargement paresseux des libs externes (Leaflet + OpenStreetMap pour la
 * carte de devine, mapillary-js pour le panorama 360°).
 *
 * Ces libs ne sont PAS empaquetées avec le build : elles sont chargées depuis
 * un CDN à la première partie d'Atlas seulement. Le reste de l'appli reste
 * donc pleinement fonctionnel hors-ligne — seule cette épreuve a besoin du
 * réseau (imagerie + tuiles de carte), à l'image d'un GeoGuessr.
 */

import { VILLES } from '../data/villes';

/** Jeton d'accès Mapillary (gratuit, à créer sur mapillary.com → Developers). */
export const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN;

const R_TERRE_KM = 6371;
const deg2rad = (d: number) => (d * Math.PI) / 180;

/** Distance en kilomètres entre deux points (lat/lng), formule de Haversine. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = deg2rad(b.lat - a.lat);
  const dLng = deg2rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(a.lat)) * Math.cos(deg2rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R_TERRE_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const BONUS_MAX = -35000; // meilleur cas (< 100 m) : −35 s
const ECHELLE_KM = 800; // décroissance exponentielle
// Malus maximal (0 point, devinette à l'autre bout du monde) dégressif, comme
// la mine du démineur : maximal si l'on devine d'emblée, il décroît d'une
// seconde par seconde de jeu jusqu'à un plancher (on punit la précipitation).
const MALUS_DEBUT = 120000; // +2 min si l'on valide dès le départ
const MALUS_PLANCHER = 60000; // plancher +1 min, atteint après ~60 s de jeu

/** Malus maximal courant selon le temps déjà passé sur l'épreuve. */
export function malusMaxAtlas(elapsedMs: number): number {
  return Math.max(MALUS_PLANCHER, Math.round(MALUS_DEBUT - elapsedMs));
}

/**
 * Barème du round : le bonus est maximal quand on tombe pile (< 100 m) puis
 * décroît exponentiellement avec la distance, jusqu'à devenir une pénalité. Le
 * malus maximal (0 point) dépend du temps déjà écoulé (voir `malusMaxAtlas`).
 * On renvoie aussi un score « points » (0 à 5000) pour l'affichage récap.
 */
export function scoreDistance(
  km: number,
  elapsedMs: number,
): { adjustMs: number; points: number } {
  const f = Math.exp(-km / ECHELLE_KM); // 1 quand km→0, 0 quand km→∞
  const malusMax = malusMaxAtlas(elapsedMs);
  const adjustMs = Math.round(malusMax - (malusMax - BONUS_MAX) * f);
  const points = Math.round(5000 * f);
  return { adjustMs, points };
}

/** Distance lisible : « 340 m » sous 1 km, sinon « 12 km ». */
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('fr-FR')} km`;
}

/** Décalage maxi autour du centre-ville (~0,015° ≈ 1–1,5 km selon la latitude). */
const RAYON_TIRAGE = 0.015;

/**
 * Point cible du jour, déterministe (même endroit pour tous) : une ville tirée
 * au hasard, plus un décalage aléatoire à l'intérieur — on atterrit ainsi sur
 * une rue quelconque de la ville, pas toujours au même endroit. Le panorama
 * réel le plus proche est ensuite résolu via l'API (voir `resoudreImage`).
 *
 * Vit ici plutôt que dans `Atlas.tsx` pour rester importable hors navigateur :
 * `scripts/build-atlas.mjs` en a besoin pour pré-résoudre les cibles.
 */
export function cibleDe(rng: () => number) {
  const ville = VILLES[Math.floor(rng() * VILLES.length)];
  const lat = ville.lat + (rng() * 2 - 1) * RAYON_TIRAGE;
  const lng = ville.lng + (rng() * 2 - 1) * RAYON_TIRAGE;
  return { ville, lat, lng };
}

// ---- Chargement paresseux des libs externes -------------------------------

/** Les libs sont servies depuis notre propre domaine : `scripts/vendor.mjs` les
 *  recopie de node_modules vers public/vendor/ avant chaque dev et chaque
 *  build. Un point de défaillance en moins (unpkg est gratuit et sans garantie)
 *  et une poignée de main TLS de moins vers un tiers. */
const LOCAL = (nom: string) => `/vendor/${nom}`;
/** Miroir de secours, au cas où la copie manquerait (build servi sans le
 *  prebuild, déploiement partiel) : mieux vaut une lib lente que pas de jeu. */
const MIROIR = (p: string) => `https://unpkg.com/${p}`;

/** Délai au-delà duquel un CDN est tenu pour muet. Indispensable : une
 *  connexion qui pend ne déclenche jamais `onerror`, donc sans ce minuteur
 *  l'épreuve attendrait sans fin devant un cadre vide. */
const DELAI_SCRIPT = 6000;

const scriptsCharges = new Map<string, Promise<void>>();

/** Insère un <script> ; résout au chargement, rejette à l'erreur ou au délai. */
function injecte(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    let fini = false;
    const clos = (err?: Error) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      if (!err) return resolve();
      s.remove(); // un script mort laissé en place empêcherait le miroir
      reject(err);
    };
    const minuteur = setTimeout(() => clos(new Error(`délai dépassé : ${src}`)), DELAI_SCRIPT);
    s.src = src;
    s.async = true;
    s.onload = () => clos();
    s.onerror = () => clos(new Error(`échec du chargement de ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Charge un <script> une seule fois (mémoïsé par URL), avec bascule sur le
 * miroir si le CDN principal échoue ou reste muet. Un échec des deux n'est PAS
 * mémoïsé : on retire l'entrée pour qu'une nouvelle tentative reste possible.
 */
export function loadScript(src: string, miroir?: string): Promise<void> {
  let p = scriptsCharges.get(src);
  if (!p) {
    p = injecte(src).catch((e) => (miroir ? injecte(miroir) : Promise.reject(e)));
    p.catch(() => scriptsCharges.delete(src));
    scriptsCharges.set(src, p);
  }
  return p;
}

/** Injecte une feuille de style externe une seule fois, miroir en secours. */
export function loadCss(href: string, miroir?: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  if (miroir)
    l.onerror = () => {
      l.onerror = null; // une seule bascule, sinon boucle si le miroir échoue
      l.href = miroir;
    };
  document.head.appendChild(l);
}

const LEAFLET_VER = '1.9.4';
const MAPILLARY_VER = '4.1.2';

/** Charge Leaflet (carte OSM). Renvoie le global `L`. */
export async function loadLeaflet(): Promise<any> {
  const p = `leaflet@${LEAFLET_VER}/dist/leaflet`;
  loadCss(LOCAL('leaflet/leaflet.css'), MIROIR(`${p}.css`));
  await loadScript(LOCAL('leaflet/leaflet.js'), MIROIR(`${p}.js`));
  return (window as any).L;
}

/** Charge mapillary-js (viewer 360°). Renvoie le module global `mapillary`. */
export async function loadMapillary(): Promise<any> {
  const p = `mapillary-js@${MAPILLARY_VER}/dist/mapillary`;
  loadCss(LOCAL('mapillary/mapillary.css'), MIROIR(`${p}.css`));
  await loadScript(LOCAL('mapillary/mapillary.js'), MIROIR(`${p}.js`));
  return (window as any).mapillary;
}

/**
 * Hôtes tiers dont Atlas dépend. `cors` doit refléter le mode de la requête à
 * venir, sinon la connexion ouverte n'est pas réutilisée : anonyme pour l'API
 * (fetch CORS), absent pour les scripts et les tuiles (requêtes no-cors).
 */
const HOTES: { url: string; cors: boolean }[] = [
  { url: 'https://graph.mapillary.com', cors: true },
  { url: 'https://a.tile.openstreetmap.fr', cors: false },
];

/**
 * Ouvre à l'avance les connexions (DNS + TLS) vers ces hôtes. Appelé dès
 * l'écran d'intro du run quand Atlas figure dans le tirage : la poignée de main
 * est déjà faite quand les téléchargements démarrent. Un jour sans Atlas dans
 * le tirage ne paie donc aucune connexion.
 */
export function preconnecteAtlas(): void {
  chargeTable(); // même origine, quelques ko : autant l'avoir avant l'épreuve
  for (const { url, cors } of HOTES) {
    if (document.querySelector(`link[rel="preconnect"][href="${url}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = url;
    if (cors) l.crossOrigin = '';
    document.head.appendChild(l);
  }
}

// ---- Résolution de l'imagerie Mapillary ------------------------------------

/**
 * Bornes de la recherche. Serrées par défaut : en jeu, mieux vaut abandonner et
 * se replier que faire patienter devant un cadre vide. `build-atlas.mjs` les
 * desserre, n'ayant aucune raison d'être pressé — et c'est justement sur les
 * villes denses, où l'API met le plus longtemps à répondre, que la table est la
 * plus utile.
 */
export interface Bornes {
  /** Délai d'une requête : au-delà, la réponse est tenue pour perdue. */
  delaiRequete: number;
  /** Budget total, toutes requêtes confondues — la recherche peut enchaîner
   *  sept tailles de bbox, il faut une borne au pire cas. */
  budget: number;
}

const BORNES_JEU: Bornes = { delaiRequete: 4000, budget: 12000 };

/** Image Mapillary résolue : son id et sa position réelle (pour le scoring). */
export interface ImageMapillary {
  id: string;
  lat: number;
  lng: number;
  pano: boolean;
}

/**
 * Une requête bbox. Renvoie le code HTTP et les images. L'API répond 500
 * « reduce the amount of data » quand la bbox couvre trop d'images (zones très
 * denses type Tokyo dès ~0,004° de demi-côté), quelle que soit la `limit` —
 * c'est ce code qui pilote la recherche adaptative ci-dessous. Code 0 :
 * réseau indisponible ou délai dépassé (à distinguer d'une zone sans couverture).
 */
async function fetchBbox(
  lat: number,
  lng: number,
  d: number,
  panoOnly: boolean,
  token: string,
  delai: number,
): Promise<{ code: number; images: any[] }> {
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const url =
    `https://graph.mapillary.com/images?access_token=${token}` +
    `&fields=id,geometry,is_pano&bbox=${bbox}&limit=50${panoOnly ? '&is_pano=true' : ''}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(delai) });
    if (!r.ok) return { code: r.status, images: [] };
    const data = await r.json();
    return { code: 200, images: data?.data ?? [] };
  } catch {
    return { code: 0, images: [] }; // réseau indisponible ou délai dépassé
  }
}

/**
 * Une passe de recherche adaptative de la taille de bbox : on part petit, on
 * RÉTRÉCIT si l'API renvoie 500 (zone dense → la couverture existe, on affine)
 * et on ÉLARGIT si la zone est vide (zone clairsemée). Renvoie l'image la plus
 * proche du point (un panorama si présent), ou null si le lieu n'a aucune
 * couverture. Lève si le réseau est indisponible : un échec de transport n'est
 * pas une absence de panorama, et l'appelant doit pouvoir le dire au joueur.
 */
async function chercher(
  point: { lat: number; lng: number },
  panoOnly: boolean,
  token: string,
  bornes: Bornes,
): Promise<ImageMapillary | null> {
  let d = 0.001; // demi-côté initial (~100 m) : sous le seuil de 500 même en zone très dense
  let vu500 = false;
  const fin = Date.now() + bornes.budget;
  for (let i = 0; i < 7 && Date.now() < fin; i++) {
    const { code, images } = await fetchBbox(
      point.lat,
      point.lng,
      d,
      panoOnly,
      token,
      bornes.delaiRequete,
    );
    if (code === 500) {
      d *= 0.5; // trop dense : on affine
      vu500 = true;
      continue;
    }
    if (code === 0) throw new Error('réseau indisponible');
    if (code !== 200) return null; // jeton invalide : rien à retenter
    if (images.length) {
      // Meilleur candidat : panorama d'abord, puis le plus proche du point.
      let best: ImageMapillary | null = null;
      let bestScore = Infinity;
      for (const img of images) {
        const c = img?.geometry?.coordinates;
        if (!c || img.id == null) continue;
        const km = haversineKm(point, { lat: c[1], lng: c[0] });
        const score = (img.is_pano ? 0 : 1e4) + km; // pano prioritaire
        if (score < bestScore) {
          bestScore = score;
          best = { id: String(img.id), lat: c[1], lng: c[0], pano: !!img.is_pano };
        }
      }
      if (best) return best;
    }
    if (vu500) return null; // dense puis rétréci jusqu'au vide : plus rien à tenter
    d *= 2.5; // zone clairsemée : on élargit
  }
  return null;
}

/**
 * Résolution brute, sans cache : les deux passes menées EN PARALLÈLE — la première restreinte aux vrais
 * panoramas 360° (`is_pano=true`) pour garantir une vue immersive, la seconde
 * acceptant une image plate plutôt que rien. Les enchaîner coûtait jusqu'à
 * quatorze aller-retours en file — soit plusieurs secondes d'écran d'attente —
 * pour le même résultat, puisque la priorité entre les deux est décidée ici.
 */
export async function chercheImage(
  point: { lat: number; lng: number },
  token: string,
  bornes: Bornes = BORNES_JEU,
): Promise<ImageMapillary | null> {
  const [pano, plate] = await Promise.allSettled([
    chercher(point, true, token, bornes),
    chercher(point, false, token, bornes),
  ]);
  const val = (r: PromiseSettledResult<ImageMapillary | null>) =>
    r.status === 'fulfilled' ? r.value : null;
  const img = val(pano) ?? val(plate);
  if (img) return img;
  // Les deux passes en échec de transport : c'est le réseau, pas le lieu.
  if (pano.status === 'rejected' && plate.status === 'rejected') throw pano.reason;
  return null;
}

// ---- Cache de résolution ---------------------------------------------------

const K_ATLAS = 'game7le:atlas';
/** Rétention du cache : au-delà, l'entrée est purgée (l'imagerie Mapillary
 *  évolue, et un jour rejoué en archive n'a pas à porter un id périmé ad vitam). */
const RETENTION_MS = 30 * 864e5;

type CacheAtlas = Record<string, { img: ImageMapillary; t: number }>;

function litCache(): CacheAtlas {
  try {
    return JSON.parse(localStorage.getItem(K_ATLAS) || '{}');
  } catch {
    return {};
  }
}

/** Retient une résolution réussie, en purgeant au passage les entrées âgées. */
function ecritCache(cle: string, img: ImageMapillary): void {
  try {
    const c = litCache();
    const limite = Date.now() - RETENTION_MS;
    for (const [k, v] of Object.entries(c)) if (!v?.t || v.t < limite) delete c[k];
    c[cle] = { img, t: Date.now() };
    localStorage.setItem(K_ATLAS, JSON.stringify(c));
  } catch {
    /* quota ou mode privé : le cache est un confort, jamais un prérequis */
  }
}

// ---- Table pré-résolue -----------------------------------------------------

/** Cibles résolues à l'avance par `npm run atlas`, servies depuis notre domaine
 *  (hors bundle : seule cette épreuve en a besoin). Voir `scripts/build-atlas.mjs`. */
const TABLE = '/atlas.json';

let tablePromise: Promise<Record<string, ImageMapillary>> | null = null;

/**
 * Charge (une fois) la table pré-résolue. Absente ou périmée, on retombe
 * simplement sur la résolution au runtime : c'est un raccourci, jamais un
 * prérequis. Le garde-fou sur le content-type n'est pas décoratif — la réécriture
 * SPA de l'hébergeur renvoie index.html en 200 pour un fichier manquant.
 */
export function chargeTable(): Promise<Record<string, ImageMapillary>> {
  if (!tablePromise)
    tablePromise = fetch(TABLE)
      .then((r) =>
        r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : {},
      )
      .catch(() => ({}));
  return tablePromise;
}

// Mémoïsation en mémoire : le préchauffage (pendant le compte à rebours) et le
// composant Atlas partagent ainsi le même appel/résultat, sans doublon.
const cacheImage = new Map<string, Promise<ImageMapillary | null>>();

/**
 * Résout le panorama le plus proche d'un point, en trois recours successifs :
 *
 * 1. la table pré-résolue au build — même image pour tout le monde, sans le
 *    moindre aller-retour vers l'API ;
 * 2. le cache localStorage du navigateur, pour les jours hors table (archives
 *    anciennes, horizon dépassé) déjà résolus ici ;
 * 3. la recherche adaptative, qui alimente ce cache.
 *
 * La table passe avant le cache local à dessein : elle fige la même cible pour
 * tous les joueurs, là où une résolution au runtime dépend de l'état de
 * l'imagerie Mapillary au moment où elle a eu lieu. `null` si aucune couverture ;
 * lève si le réseau est indisponible.
 */
export function resoudreImage(
  point: { lat: number; lng: number },
  token: string,
): Promise<ImageMapillary | null> {
  const cle = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  let p = cacheImage.get(cle);
  if (!p) {
    p = (async () => {
      const pre = (await chargeTable())[cle];
      if (pre) return pre;
      const garde = litCache()[cle];
      if (garde?.img) return garde.img;
      const img = await chercheImage(point, token);
      if (img) ecritCache(cle, img);
      return img;
    })();
    p.catch(() => cacheImage.delete(cle)); // un échec ne doit pas être figé
    cacheImage.set(cle, p);
  }
  return p;
}

/**
 * URL de la photo d'une image, pour le repli en vue fixe quand le viewer 360°
 * n'est pas disponible. Résolue seulement au moment du repli et jamais mise en
 * cache : les URLs servies par Mapillary sont signées et temporaires.
 */
export async function urlPhoto(id: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://graph.mapillary.com/${id}?access_token=${token}&fields=thumb_2048_url`,
      { signal: AbortSignal.timeout(BORNES_JEU.delaiRequete) },
    );
    if (!r.ok) return null;
    return (await r.json())?.thumb_2048_url ?? null;
  } catch {
    return null;
  }
}
