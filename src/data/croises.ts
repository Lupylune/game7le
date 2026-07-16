/**
 * Mini-grilles de mots croisés 5×5, conçues à la main et vérifiées :
 * chaque suite contiguë de 2 cases ou plus (ligne ou colonne) est un mot indicé.
 * `#` = case noire.
 */
export interface Croise {
  grille: string[]; // 5 lignes de 5 caractères
  horizontaux: { ligne: number; mot: string; indice: string }[];
  verticaux: { col: number; mot: string; indice: string }[];
}

export const CROISES: Croise[] = [
  {
    grille: ['SUCRE', '##H#L', 'LAINE', '##E#V', 'MINCE'],
    horizontaux: [
      { ligne: 0, mot: 'SUCRE', indice: 'Il adoucit le café' },
      { ligne: 2, mot: 'LAINE', indice: 'Le mouton la fournit' },
      { ligne: 4, mot: 'MINCE', indice: "Contraire d'épais" },
    ],
    verticaux: [
      { col: 2, mot: 'CHIEN', indice: "Le meilleur ami de l'homme" },
      { col: 4, mot: 'ELEVE', indice: "Il use les bancs de l'école" },
    ],
  },
  {
    grille: ['TASSE', '##A#T', 'SEPIA', '##I#G', 'MONDE'],
    horizontaux: [
      { ligne: 0, mot: 'TASSE', indice: 'On y boit le thé' },
      { ligne: 2, mot: 'SEPIA', indice: 'Brun des photos anciennes' },
      { ligne: 4, mot: 'MONDE', indice: 'La Terre entière' },
    ],
    verticaux: [
      { col: 2, mot: 'SAPIN', indice: 'Roi des forêts à Noël' },
      { col: 4, mot: 'ETAGE', indice: "Niveau d'un immeuble" },
    ],
  },
  {
    grille: ['ECOLE', '##A#P', 'SUSHI', '##I#C', 'BUSTE'],
    horizontaux: [
      { ligne: 0, mot: 'ECOLE', indice: 'On y apprend à lire' },
      { ligne: 2, mot: 'SUSHI', indice: 'Bouchée japonaise' },
      { ligne: 4, mot: 'BUSTE', indice: 'Sculpture sans jambes' },
    ],
    verticaux: [
      { col: 2, mot: 'OASIS', indice: "Point d'eau au désert" },
      { col: 4, mot: 'EPICE', indice: 'Le poivre en est une' },
    ],
  },
];
