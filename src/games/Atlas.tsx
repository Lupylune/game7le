import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from './types';
import { VILLES } from '../data/villes';
import { seededRng } from '../lib/rng';
import {
  MAPILLARY_TOKEN,
  formatKm,
  haversineKm,
  loadLeaflet,
  loadMapillary,
  resoudreImage,
  scoreDistance,
} from '../lib/geo';

type LatLng = { lat: number; lng: number };

/**
 * Fond de carte OpenStreetMap France (open-source, sans clé) : privilégie les
 * libellés en français (`name:fr`) là où ils existent, langue locale sinon.
 */
const TUILES_OSM = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
const ATTRIB_OSM = '© OpenStreetMap France | © contributeurs OpenStreetMap';

/** Décalage maxi autour du centre-ville (~0,015° ≈ 1–1,5 km selon la latitude). */
const RAYON_TIRAGE = 0.015;

/**
 * Point cible du jour, déterministe (même endroit pour tous) : une ville tirée
 * au hasard, plus un décalage aléatoire à l'intérieur — on atterrit ainsi sur
 * une rue quelconque de la ville, pas toujours au même endroit. Le panorama
 * réel le plus proche est ensuite résolu via l'API (voir `resoudreImage`).
 */
export function cibleDe(rng: () => number) {
  const ville = VILLES[Math.floor(rng() * VILLES.length)];
  const lat = ville.lat + (rng() * 2 - 1) * RAYON_TIRAGE;
  const lng = ville.lng + (rng() * 2 - 1) * RAYON_TIRAGE;
  return { ville, lat, lng };
}

/**
 * Préchauffage déclenché par RunPage dès le début du run (si Atlas est dans le
 * tirage) : télécharge les libs et lance (en cache) la résolution de l'image,
 * de sorte que le panorama soit prêt dès le montage de l'épreuve. Utilise un
 * RNG *frais* du même seed que le composant — même cible, sans consommer le RNG
 * partagé du run.
 */
export function prewarmAtlas(date: string, defi: boolean) {
  const token = MAPILLARY_TOKEN;
  if (!token) return;
  loadMapillary();
  loadLeaflet();
  const cible = cibleDe(seededRng(`game7le:${defi ? 'defi:' : ''}${date}:atlas`));
  resoudreImage(cible, token);
}

/** `invalidateSize()` tolérant : ignore une carte déjà retirée du DOM. */
function invalidateSafe(map: any) {
  try {
    map.invalidateSize();
  } catch {
    /* carte retirée entre-temps */
  }
}

/** Programme un recalage de taille après le prochain layout. */
function recalageSur(map: any, delai: number) {
  setTimeout(() => invalidateSafe(map), delai);
}

export default function Atlas({ rng, onDone }: GameProps) {
  const cible = useMemo(() => cibleDe(rng), [rng]);

  const [phase, setPhase] = useState<'jeu' | 'recap'>('jeu');
  const [guess, setGuess] = useState<LatLng | null>(null);
  // Position réelle du panorama affiché (renvoyée par l'API), sur laquelle porte
  // le score. À défaut (panorama non résolu), on retombe sur le point tiré.
  const [reel, setReel] = useState<LatLng | null>(null);
  const [pret, setPret] = useState(false); // panorama chargé et affiché
  // Message d'indisponibilité du panorama : 'token' (jeton absent),
  // 'nopano' (aucune image Mapillary proche), 'pano' (échec de chargement).
  const [panoErr, setPanoErr] = useState<'token' | 'nopano' | 'pano' | null>(null);
  const [carteKo, setCarteKo] = useState(false); // Leaflet indisponible (hors-ligne)
  const [res, setRes] = useState<{ km: number; points: number; adjustMs: number } | null>(null);

  const panoRef = useRef<HTMLDivElement>(null);
  const guessMapRef = useRef<HTMLDivElement>(null);
  const recapMapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null); // le global `L` une fois chargé
  const guessMarkerRef = useRef<any>(null);
  const doneRef = useRef(false);
  // Début de l'épreuve (montée après le décompte) : sert au malus dégressif.
  const startRef = useRef(performance.now());

  // Panorama 360° Mapillary (uniquement pendant la phase de jeu).
  useEffect(() => {
    if (phase !== 'jeu') return;
    const token = MAPILLARY_TOKEN;
    if (!token) {
      setPanoErr('token');
      return;
    }
    let annule = false;
    let viewer: any;
    (async () => {
      try {
        // Le script (CDN) et l'appel API de résolution sont indépendants : on
        // les lance en parallèle. Grâce au préchauffage + au cache, les deux
        // sont souvent déjà résolus au moment du montage.
        const [mapillary, img] = await Promise.all([loadMapillary(), resoudreImage(cible, token)]);
        if (annule || !panoRef.current) return;
        if (!img) {
          setPanoErr('nopano');
          return;
        }
        setReel({ lat: img.lat, lng: img.lng }); // le score porte sur ce point
        // Viewer interactif : déplacement (flèches/pancartes) et zoom natifs.
        // `cover: false` : on charge l'image directement, sans l'écran-cache
        // cliquable qui recouvrirait la mini-carte.
        viewer = new mapillary.Viewer({
          accessToken: token,
          container: panoRef.current,
          imageId: img.id,
          component: { cover: false },
        });
        // Masque l'indicateur dès que la première image est rendue (filet de
        // sécurité si l'événement ne se déclenche pas).
        viewer.on?.('image', () => !annule && setPret(true));
        setTimeout(() => !annule && setPret(true), 2500);
      } catch {
        if (!annule) setPanoErr('pano');
      }
    })();
    return () => {
      annule = true;
      try {
        viewer?.remove?.();
      } catch {
        /* rien */
      }
    };
  }, [phase, cible]);

  // Carte de devine Leaflet + OpenStreetMap (pendant la phase de jeu).
  useEffect(() => {
    if (phase !== 'jeu') return;
    let annule = false;
    let map: any;
    (async () => {
      try {
        const L = await loadLeaflet();
        leafletRef.current = L;
        if (annule || !guessMapRef.current) return;
        map = L.map(guessMapRef.current, { attributionControl: false, worldCopyJump: true }).setView(
          [25, 10],
          1,
        );
        L.tileLayer(TUILES_OSM, { maxZoom: 19, attribution: ATTRIB_OSM }).addTo(map);
        map.on('click', (e: any) => {
          const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
          setGuess(ll);
          if (guessMarkerRef.current) guessMarkerRef.current.setLatLng(e.latlng);
          else guessMarkerRef.current = L.marker(e.latlng).addTo(map);
        });
        recalageSur(map, 80);
        // recalage après l'animation d'agrandissement au survol/focus
        (guessMapRef.current as any).__map = map;
      } catch {
        if (!annule) setCarteKo(true);
      }
    })();
    return () => {
      annule = true;
      guessMarkerRef.current = null;
      const el = guessMapRef.current as any;
      if (el) el.__map = null; // stoppe tout recalage différé encore en vol
      try {
        map?.remove();
      } catch {
        /* rien */
      }
    };
  }, [phase]);

  // Carte récapitulative : les deux points reliés par une ligne.
  useEffect(() => {
    if (phase !== 'recap' || !res) return;
    const L = leafletRef.current;
    if (!L || !recapMapRef.current) return;
    const map = L.map(recapMapRef.current, { attributionControl: false });
    L.tileLayer(TUILES_OSM, { maxZoom: 19, attribution: ATTRIB_OSM }).addTo(map);
    const pos = reel ?? { lat: cible.lat, lng: cible.lng };
    const vrai: [number, number] = [pos.lat, pos.lng];
    const mien: [number, number] = [guess!.lat, guess!.lng];
    L.marker(vrai).addTo(map).bindPopup(`${cible.ville.nom} — ${cible.ville.pays}`).openPopup();
    L.marker(mien).addTo(map);
    L.polyline([mien, vrai], { color: '#dd7a5f', weight: 3, dashArray: '6 6' }).addTo(map);
    map.fitBounds([mien, vrai], { padding: [40, 40], maxZoom: 6 });
    recalageSur(map, 80);
    return () => {
      try {
        map.remove();
      } catch {
        /* rien */
      }
    };
  }, [phase, res, cible, reel, guess]);

  function deviner() {
    if (!guess || doneRef.current) return;
    const km = haversineKm(guess, reel ?? { lat: cible.lat, lng: cible.lng });
    setRes({ km, ...scoreDistance(km, performance.now() - startRef.current) });
    setPhase('recap');
  }

  function continuer() {
    if (doneRef.current || !res) return;
    doneRef.current = true;
    onDone({
      adjustMs: res.adjustMs,
      detail: `${cible.ville.nom} (${cible.ville.pays}) — à ${formatKm(res.km)}`,
      status: res.adjustMs <= 0 ? 'success' : 'fail',
    });
  }

  // Recalage Leaflet quand la carte de devine s'agrandit au survol/focus. On
  // relit `__map` au moment où le timer s'exécute : nul si la carte a été
  // retirée entre-temps (passage au récap), donc pas d'appel sur une carte morte.
  function recaler() {
    const el = guessMapRef.current as any;
    if (!el?.__map) return;
    [120, 320].forEach((d) =>
      setTimeout(() => {
        const m = el.__map;
        if (m) invalidateSafe(m);
      }, d),
    );
  }

  if (phase === 'recap' && res) {
    const bonus = res.adjustMs <= 0;
    return (
      <div className="game-area atlas-recap">
        <div ref={recapMapRef} className="atlas-recap-map" />
        <div className="atlas-recap-stats">
          <div className="atlas-stat">
            <span className="recap-label">Lieu</span>
            <span className="recap-val">
              {cible.ville.nom}, {cible.ville.pays}
            </span>
          </div>
          <div className="atlas-stat">
            <span className="recap-label">Distance</span>
            <span className="recap-val">{formatKm(res.km)}</span>
          </div>
          <div className="atlas-stat">
            <span className="recap-label">Score</span>
            <span className={`recap-val ${bonus ? 'bonus' : 'malus'}`}>
              {res.points} pts · {bonus ? '' : '+'}
              {(res.adjustMs / 1000).toFixed(0)} s
            </span>
          </div>
        </div>
        <div className="game-actions">
          <button className="btn btn-primary" onClick={continuer}>
            Continuer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-area atlas-area">
      <div className="atlas-stage">
        <div ref={panoRef} className="atlas-pano" />
        {!panoErr && !pret && (
          <div className="atlas-pano-msg">
            <span className="atlas-spin" aria-hidden />
            <span>Chargement du panorama…</span>
          </div>
        )}
        {panoErr && (
          <div className="atlas-pano-msg">
            {panoErr === 'token' ? (
              <>
                <strong>Panorama désactivé</strong>
                <span>
                  Ajoutez un jeton Mapillary gratuit dans <code>VITE_MAPILLARY_TOKEN</code> pour
                  afficher la vue 360°.
                </span>
              </>
            ) : panoErr === 'nopano' ? (
              <span>Aucun panorama Mapillary à proximité de ce lieu.</span>
            ) : (
              <span>Panorama indisponible (chargement impossible).</span>
            )}
          </div>
        )}

        {carteKo ? (
          <div className="atlas-guess atlas-guess-ko">
            <p>Carte indisponible (hors-ligne ?).</p>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (doneRef.current) return;
                doneRef.current = true;
                onDone({ adjustMs: 0, detail: 'carte indisponible', status: 'skip' });
              }}
            >
              Terminer
            </button>
          </div>
        ) : (
          <div className="atlas-guess" onMouseEnter={recaler} onFocus={recaler} tabIndex={-1}>
            <div ref={guessMapRef} className="atlas-guess-map" />
            <button className="btn btn-primary btn-sm atlas-guess-btn" disabled={!guess} onClick={deviner}>
              {guess ? 'Deviner' : 'Placez un marqueur'}
            </button>
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Explorez le panorama, puis cliquez sur la carte pour situer le lieu et validez avec
        « Deviner ».
      </p>
    </div>
  );
}
