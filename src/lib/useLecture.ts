import { useEffect, useState } from 'react';

/**
 * Lecture en boucle d'une suite d'étapes `0…dernier`, à la manière d'un GIF :
 * une étape toutes les `pasMs`, un temps d'arrêt `finMs` sur la dernière, puis
 * retour au début. Avancer ou reculer à la main met en pause — on lit alors la
 * solution à son rythme. Sous `prefers-reduced-motion`, rien ne démarre seul.
 */
export function useLecture(dernier: number, pasMs = 1100, finMs = 2600) {
  const [etape, setEtape] = useState(0);
  const [enLecture, setEnLecture] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!enLecture || dernier <= 0) return;
    const t = setTimeout(
      () => setEtape((e) => (e >= dernier ? 0 : e + 1)),
      etape >= dernier ? finMs : etape === 0 ? finMs / 2 : pasMs,
    );
    return () => clearTimeout(t);
  }, [enLecture, etape, dernier, pasMs, finMs]);

  const va = (e: number) => {
    setEnLecture(false);
    setEtape(Math.max(0, Math.min(dernier, e)));
  };

  return {
    etape,
    enLecture,
    basculer: () => setEnLecture((l) => !l),
    precedent: () => va(etape - 1),
    suivant: () => va(etape + 1),
  };
}
