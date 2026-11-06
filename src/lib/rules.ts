// Règles de classement par compétition (explications affichées et barème du simulateur).

export interface Rules {
  points: string[]; // barème
  bonus: string[];
  places: { range: string; label: string; tone?: 'up' | 'mid' | 'down' }[];
  tiebreak: string;
  /** Écart maximal pour le bonus défensif (simulateur, texte). */
  defensiveGap: number;
  offensive: string;
}

const STANDARD_BONUS = (gap: number, offensive: string) => [
  `Bonus offensif : +1 point pour l'équipe qui marque ${offensive}, qu'elle gagne ou perde.`,
  `Bonus défensif : +1 point pour l'équipe qui perd de ${gap} points ou moins.`,
];
const WDL = ['Victoire : 4 points', 'Match nul : 2 points', 'Défaite : 0 point'];

export const RULES: Record<string, Rules> = {
  top14: {
    points: WDL,
    offensive: '3 essais de plus que l’adversaire',
    defensiveGap: 5,
    bonus: [
      "Bonus offensif : +1 point pour une équipe qui gagne en marquant au moins 3 essais de plus que l'adversaire.",
      'Bonus défensif : +1 point pour une équipe qui perd de 5 points ou moins.',
    ],
    places: [
      { range: '1er – 2e', label: 'Qualifiés directement pour les demi-finales', tone: 'up' },
      { range: '3e – 6e', label: 'Barrages (le 3e reçoit le 6e, le 4e reçoit le 5e)', tone: 'up' },
      { range: '7e – 12e', label: 'Maintien assuré', tone: 'mid' },
      { range: '13e', label: "Match d'accession contre le finaliste de Pro D2", tone: 'down' },
      { range: '14e', label: 'Relégué en Pro D2', tone: 'down' },
    ],
    tiebreak: "En cas d'égalité : points terrain dans les confrontations directes, puis différence de points, puis nombre d'essais…",
  },
  'champions-cup': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: STANDARD_BONUS(7, 'au moins 4 essais'),
    places: [
      { range: '1er – 4e de poule', label: 'Qualifiés pour les huitièmes de finale (les mieux classés reçoivent)', tone: 'up' },
      { range: '5e de poule', label: 'Repêché en huitièmes de finale de la Challenge Cup', tone: 'mid' },
      { range: '6e de poule', label: 'Éliminé', tone: 'down' },
    ],
    tiebreak: "En cas d'égalité dans une poule : confrontation directe si elle a eu lieu, puis différence de points, puis nombre d'essais.",
  },
  'challenge-cup': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: STANDARD_BONUS(7, 'au moins 4 essais'),
    places: [
      { range: '1er – 4e de poule', label: 'Qualifiés pour les huitièmes de finale', tone: 'up' },
      { range: '5e – 6e de poule', label: 'Éliminés', tone: 'down' },
    ],
    tiebreak: "En cas d'égalité dans une poule : confrontation directe, puis différence de points, puis nombre d'essais.",
  },
  'six-nations': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: [...STANDARD_BONUS(7, 'au moins 4 essais'), "Grand Chelem (5 victoires sur 5) : +3 points, pour que le vainqueur du Grand Chelem soit toujours premier."],
    places: [
      { range: '1er', label: 'Vainqueur du Tournoi', tone: 'up' },
      { range: '6e', label: "Cuillère de bois", tone: 'down' },
    ],
    tiebreak: "En cas d'égalité : différence de points, puis nombre d'essais. Sinon, titre partagé.",
  },
  'nations-championship': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: STANDARD_BONUS(7, 'au moins 4 essais'),
    places: [{ range: 'Haut du classement', label: 'Qualification pour la phase finale (règlement de World Rugby)', tone: 'up' }],
    tiebreak: "En cas d'égalité : différence de points, puis nombre d'essais.",
  },
  'rugby-championship': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: STANDARD_BONUS(7, 'au moins 4 essais'),
    places: [{ range: '1er', label: 'Vainqueur du Rugby Championship', tone: 'up' }],
    tiebreak: "En cas d'égalité : nombre de victoires, puis différence de points, puis nombre d'essais.",
  },
  'coupe-du-monde': {
    points: WDL,
    offensive: 'au moins 4 essais',
    defensiveGap: 7,
    bonus: STANDARD_BONUS(7, 'au moins 4 essais'),
    places: [
      { range: '1er – 2e de poule', label: 'Qualifiés pour les quarts de finale', tone: 'up' },
      { range: 'Autres', label: 'Éliminés', tone: 'down' },
    ],
    tiebreak: "En cas d'égalité : confrontation directe, puis différence de points, puis nombre d'essais.",
  },
};

/** Ton (couleur) de la place `rank` sur `total` pour la compétition, d'après ses règles. */
export function placeTone(slug: string, rank: number, total: number): 'up' | 'mid' | 'down' | null {
  if (slug === 'top14') return rank <= 6 ? 'up' : rank >= 13 ? 'down' : null;
  if (slug === 'champions-cup') return rank <= 4 ? 'up' : rank === 5 ? 'mid' : 'down';
  if (slug === 'challenge-cup') return rank <= 4 ? 'up' : 'down';
  if (slug === 'coupe-du-monde') return rank <= 2 ? 'up' : null;
  if (slug === 'six-nations' || slug === 'rugby-championship') return rank === 1 ? 'up' : null;
  void total;
  return null;
}
