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

// ---- Chargement paresseux des libs externes -------------------------------

const scriptsCharges = new Map<string, Promise<void>>();

/** Charge un <script> une seule fois (mémoïsé par URL). */
export function loadScript(src: string): Promise<void> {
  let p = scriptsCharges.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`échec du chargement de ${src}`));
      document.head.appendChild(s);
    });
    scriptsCharges.set(src, p);
  }
  return p;
}

/** Injecte une feuille de style externe une seule fois. */
export function loadCss(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

const LEAFLET_VER = '1.9.4';
const MAPILLARY_VER = '4.1.2';

/** Charge Leaflet (carte OSM). Renvoie le global `L`. */
export async function loadLeaflet(): Promise<any> {
  loadCss(`https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`);
  await loadScript(`https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`);
  return (window as any).L;
}

/** Charge mapillary-js (viewer 360°). Renvoie le module global `mapillary`. */
export async function loadMapillary(): Promise<any> {
  loadCss(`https://unpkg.com/mapillary-js@${MAPILLARY_VER}/dist/mapillary.css`);
  await loadScript(`https://unpkg.com/mapillary-js@${MAPILLARY_VER}/dist/mapillary.js`);
  return (window as any).mapillary;
}

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
 * c'est ce code qui pilote la recherche adaptative ci-dessous.
 */
async function fetchBbox(
  lat: number,
  lng: number,
  d: number,
  panoOnly: boolean,
  token: string,
): Promise<{ code: number; images: any[] }> {
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const url =
    `https://graph.mapillary.com/images?access_token=${token}` +
    `&fields=id,geometry,is_pano&bbox=${bbox}&limit=50${panoOnly ? '&is_pano=true' : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { code: r.status, images: [] };
    const data = await r.json();
    return { code: 200, images: data?.data ?? [] };
  } catch {
    return { code: 0, images: [] }; // réseau indisponible
  }
}

/**
 * Une passe de recherche adaptative de la taille de bbox : on part petit, on
 * RÉTRÉCIT si l'API renvoie 500 (zone dense → la couverture existe, on affine)
 * et on ÉLARGIT si la zone est vide (zone clairsemée). Renvoie l'image la plus
 * proche du point (un panorama si présent), ou null.
 */
async function chercher(
  point: { lat: number; lng: number },
  panoOnly: boolean,
  token: string,
): Promise<ImageMapillary | null> {
  let d = 0.001; // demi-côté initial (~100 m) : sous le seuil de 500 même en zone très dense
  let vu500 = false;
  for (let i = 0; i < 7; i++) {
    const { code, images } = await fetchBbox(point.lat, point.lng, d, panoOnly, token);
    if (code === 500) {
      d *= 0.5; // trop dense : on affine
      vu500 = true;
      continue;
    }
    if (code !== 200) return null; // jeton invalide / réseau : on abandonne
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

// Mémoïsation par coordonnées : le préchauffage (pendant le compte à rebours)
// et le composant Atlas partagent ainsi le même appel/résultat, sans doublon.
const cacheImage = new Map<string, Promise<ImageMapillary | null>>();

/**
 * Résout le panorama le plus proche d'un point. Première passe restreinte aux
 * vrais panoramas 360° (`is_pano=true`) pour garantir une vue immersive ; si le
 * lieu n'en a aucun à proximité, seconde passe acceptant une image plate plutôt
 * que rien. La plupart des villes se résolvent en une seule requête. Le résultat
 * est mémoïsé par coordonnées. `null` si aucune couverture Mapillary.
 */
export function resoudreImage(
  point: { lat: number; lng: number },
  token: string,
): Promise<ImageMapillary | null> {
  const cle = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  let p = cacheImage.get(cle);
  if (!p) {
    p = (async () =>
      (await chercher(point, true, token)) ?? (await chercher(point, false, token)))();
    cacheImage.set(cle, p);
  }
  return p;
}
