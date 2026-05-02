/**
 * Liste de mots interdits pour l'anti-insulte.
 * Ajoute ou retire des mots selon tes besoins.
 */
export const BAD_WORDS: string[] = [
  // Insultes françaises
  'connard', 'connarde', 'salope', 'pute', 'putain', 'enculé', 'enculée',
  'fdp', 'fils de pute', 'batard', 'bâtard', 'pd', 'tapette', 'pédé',
  'merde', 'bordel', 'nique', 'niquer', 'va te faire', 'tg', 'ta gueule',
  'crétin', 'idiot', 'imbécile', 'abruti', 'débile', 'déchet',
  'casse toi', 'casse-toi', 'ferme ta gueule', 'ftg',
  // Insultes anglaises courantes
  'fuck', 'bitch', 'asshole', 'bastard', 'cunt', 'slut', 'whore', 'dick',
  'nigga', 'nigger', 'faggot',
];

/**
 * Vérifie si un message contient un mot interdit.
 */
export function containsBadWord(content: string): boolean {
  const lower = content.toLowerCase();
  return BAD_WORDS.some((word) => {
    // Vérifie si le mot est présent (avec ou sans séparation)
    const regex = new RegExp(`(^|\\s|[^a-zA-ZÀ-ÿ])${escapeRegex(word)}($|\\s|[^a-zA-ZÀ-ÿ])`, 'i');
    return regex.test(lower) || lower.includes(word);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
