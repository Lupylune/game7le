/**
 * Pool de villes du jeu Atlas (adaptation d'un GeoGuessr).
 *
 * Plutôt que des coordonnées de monuments figées, on tire une ville au hasard
 * puis un décalage aléatoire à l'intérieur (voir `cibleDe()` dans `Atlas.tsx`) :
 * on tombe ainsi sur une rue quelconque, déterministe pour un même jour (même
 * seed → même endroit pour tous). Le panorama réel le plus proche est ensuite
 * résolu via l'API Mapillary (`resoudreImage()` dans `src/lib/geo.ts`).
 *
 * Le pool ne retient que des grandes villes à forte couverture Mapillary, pour
 * qu'un panorama 360° soit quasi toujours trouvé près du point tiré.
 */
export interface Ville {
  nom: string;
  pays: string;
  lat: number;
  lng: number;
}

export const VILLES: Ville[] = [
  // Europe
  { nom: 'Paris', pays: 'France', lat: 48.8566, lng: 2.3522 },
  { nom: 'Lyon', pays: 'France', lat: 45.764, lng: 4.8357 },
  { nom: 'Marseille', pays: 'France', lat: 43.2965, lng: 5.3698 },
  { nom: 'Londres', pays: 'Royaume-Uni', lat: 51.5074, lng: -0.1278 },
  { nom: 'Manchester', pays: 'Royaume-Uni', lat: 53.4808, lng: -2.2426 },
  { nom: 'Édimbourg', pays: 'Royaume-Uni', lat: 55.9533, lng: -3.1883 },
  { nom: 'Amsterdam', pays: 'Pays-Bas', lat: 52.3676, lng: 4.9041 },
  { nom: 'Rotterdam', pays: 'Pays-Bas', lat: 51.9244, lng: 4.4777 },
  { nom: 'Berlin', pays: 'Allemagne', lat: 52.52, lng: 13.405 },
  { nom: 'Munich', pays: 'Allemagne', lat: 48.1351, lng: 11.582 },
  { nom: 'Hambourg', pays: 'Allemagne', lat: 53.5511, lng: 9.9937 },
  { nom: 'Cologne', pays: 'Allemagne', lat: 50.9375, lng: 6.9603 },
  { nom: 'Madrid', pays: 'Espagne', lat: 40.4168, lng: -3.7038 },
  { nom: 'Barcelone', pays: 'Espagne', lat: 41.3874, lng: 2.1686 },
  { nom: 'Séville', pays: 'Espagne', lat: 37.3891, lng: -5.9845 },
  { nom: 'Valence', pays: 'Espagne', lat: 39.4699, lng: -0.3763 },
  { nom: 'Lisbonne', pays: 'Portugal', lat: 38.7223, lng: -9.1393 },
  { nom: 'Porto', pays: 'Portugal', lat: 41.1579, lng: -8.6291 },
  { nom: 'Rome', pays: 'Italie', lat: 41.9028, lng: 12.4964 },
  { nom: 'Milan', pays: 'Italie', lat: 45.4642, lng: 9.19 },
  { nom: 'Florence', pays: 'Italie', lat: 43.7696, lng: 11.2558 },
  { nom: 'Naples', pays: 'Italie', lat: 40.8518, lng: 14.2681 },
  { nom: 'Vienne', pays: 'Autriche', lat: 48.2082, lng: 16.3738 },
  { nom: 'Zurich', pays: 'Suisse', lat: 47.3769, lng: 8.5417 },
  { nom: 'Genève', pays: 'Suisse', lat: 46.2044, lng: 6.1432 },
  { nom: 'Bruxelles', pays: 'Belgique', lat: 50.8503, lng: 4.3517 },
  { nom: 'Copenhague', pays: 'Danemark', lat: 55.6761, lng: 12.5683 },
  { nom: 'Stockholm', pays: 'Suède', lat: 59.3293, lng: 18.0686 },
  { nom: 'Göteborg', pays: 'Suède', lat: 57.7089, lng: 11.9746 },
  { nom: 'Oslo', pays: 'Norvège', lat: 59.9139, lng: 10.7522 },
  { nom: 'Helsinki', pays: 'Finlande', lat: 60.1699, lng: 24.9384 },
  { nom: 'Varsovie', pays: 'Pologne', lat: 52.2297, lng: 21.0122 },
  { nom: 'Cracovie', pays: 'Pologne', lat: 50.0647, lng: 19.945 },
  { nom: 'Prague', pays: 'Tchéquie', lat: 50.0755, lng: 14.4378 },
  { nom: 'Budapest', pays: 'Hongrie', lat: 47.4979, lng: 19.0402 },
  { nom: 'Athènes', pays: 'Grèce', lat: 37.9838, lng: 23.7275 },
  { nom: 'Dublin', pays: 'Irlande', lat: 53.3498, lng: -6.2603 },
  // Amérique du Nord
  { nom: 'New York', pays: 'États-Unis', lat: 40.7128, lng: -74.006 },
  { nom: 'Boston', pays: 'États-Unis', lat: 42.3601, lng: -71.0589 },
  { nom: 'Washington', pays: 'États-Unis', lat: 38.9072, lng: -77.0369 },
  { nom: 'Chicago', pays: 'États-Unis', lat: 41.8781, lng: -87.6298 },
  { nom: 'San Francisco', pays: 'États-Unis', lat: 37.7749, lng: -122.4194 },
  { nom: 'Los Angeles', pays: 'États-Unis', lat: 34.0522, lng: -118.2437 },
  { nom: 'Seattle', pays: 'États-Unis', lat: 47.6062, lng: -122.3321 },
  { nom: 'Austin', pays: 'États-Unis', lat: 30.2672, lng: -97.7431 },
  { nom: 'Miami', pays: 'États-Unis', lat: 25.7617, lng: -80.1918 },
  { nom: 'Toronto', pays: 'Canada', lat: 43.6532, lng: -79.3832 },
  { nom: 'Montréal', pays: 'Canada', lat: 45.5019, lng: -73.5674 },
  { nom: 'Vancouver', pays: 'Canada', lat: 49.2827, lng: -123.1207 },
  { nom: 'Mexico', pays: 'Mexique', lat: 19.4326, lng: -99.1332 },
  { nom: 'Guadalajara', pays: 'Mexique', lat: 20.6597, lng: -103.3496 },
  // Amérique du Sud
  { nom: 'São Paulo', pays: 'Brésil', lat: -23.5505, lng: -46.6333 },
  { nom: 'Rio de Janeiro', pays: 'Brésil', lat: -22.9068, lng: -43.1729 },
  { nom: 'Buenos Aires', pays: 'Argentine', lat: -34.6037, lng: -58.3816 },
  { nom: 'Santiago', pays: 'Chili', lat: -33.4489, lng: -70.6693 },
  { nom: 'Bogotá', pays: 'Colombie', lat: 4.711, lng: -74.0721 },
  { nom: 'Lima', pays: 'Pérou', lat: -12.0464, lng: -77.0428 },
  // Asie
  { nom: 'Tokyo', pays: 'Japon', lat: 35.6762, lng: 139.6503 },
  { nom: 'Osaka', pays: 'Japon', lat: 34.6937, lng: 135.5023 },
  { nom: 'Kyoto', pays: 'Japon', lat: 35.0116, lng: 135.7681 },
  { nom: 'Séoul', pays: 'Corée du Sud', lat: 37.5665, lng: 126.978 },
  { nom: 'Busan', pays: 'Corée du Sud', lat: 35.1796, lng: 129.0756 },
  { nom: 'Taipei', pays: 'Taïwan', lat: 25.033, lng: 121.5654 },
  { nom: 'Hong Kong', pays: 'Chine', lat: 22.3193, lng: 114.1694 },
  { nom: 'Singapour', pays: 'Singapour', lat: 1.3521, lng: 103.8198 },
  { nom: 'Bangkok', pays: 'Thaïlande', lat: 13.7563, lng: 100.5018 },
  { nom: 'Kuala Lumpur', pays: 'Malaisie', lat: 3.139, lng: 101.6869 },
  { nom: 'Tel Aviv', pays: 'Israël', lat: 32.0853, lng: 34.7818 },
  { nom: 'Istanbul', pays: 'Turquie', lat: 41.0082, lng: 28.9784 },
  { nom: 'Dubaï', pays: 'Émirats arabes unis', lat: 25.2048, lng: 55.2708 },
  // Océanie
  { nom: 'Sydney', pays: 'Australie', lat: -33.8688, lng: 151.2093 },
  { nom: 'Melbourne', pays: 'Australie', lat: -37.8136, lng: 144.9631 },
  { nom: 'Brisbane', pays: 'Australie', lat: -27.4698, lng: 153.0251 },
  { nom: 'Auckland', pays: 'Nouvelle-Zélande', lat: -36.8485, lng: 174.7633 },
  // Afrique
  { nom: 'Le Cap', pays: 'Afrique du Sud', lat: -33.9249, lng: 18.4241 },
];
