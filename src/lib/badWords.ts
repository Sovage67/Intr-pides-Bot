/**
 * Liste de mots interdits par défaut pour l'anti-insulte.
 * La liste custom par serveur est stockée dans AntiInsulteConfig.words
 */
export const DEFAULT_BAD_WORDS: string[] = [
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
 * Normalise le leetspeak : @sshole → asshole, f*ck → fck, c0nnard → connard
 */
function normalizeLeetspeak(text: string): string {
  return text
    .replace(/@/g, 'a')
    .replace(/4/g, 'a')
    .replace(/€/g, 'e')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/!/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/\+/g, 't')
    .replace(/7/g, 't')
    .replace(/\*/g, '')   // f*ck → fck (suffisant pour matcher)
    .replace(/\./g, '')   // f.u.c.k → fuck
    .replace(/-/g, '');   // f-u-c-k → fuck
}

/**
 * Collapse les répétitions de lettres : connnnard → connard, saaalope → salope
 */
function collapseRepeats(text: string): string {
  return text.replace(/(.)\1{2,}/g, '$1$1');
}

/**
 * Prépare le contenu pour la détection (lowercase + leetspeak + phonétique)
 */
function normalizeContent(text: string): string {
  return collapseRepeats(normalizeLeetspeak(text.toLowerCase()));
}

/**
 * Vérifie si un message contient un mot interdit.
 * Détecte aussi les variantes leetspeak (@sshole, f*ck, c0nnard)
 * et phonétiques (connnnard, saaalope).
 */
export function containsBadWord(
  content: string,
  extraWords: string[] = [],
  removedWords: string[] = [],
): { found: boolean; word: string | null } {
  const normalized = normalizeContent(content);
  const original   = content.toLowerCase();

  const activeDefaults = DEFAULT_BAD_WORDS.filter(w => !removedWords.includes(w));
  const allWords = [...activeDefaults, ...extraWords];

  for (const word of allWords) {
    const normalizedWord = normalizeContent(word);
    const escaped = escapeRegex(normalizedWord);
    const regex = new RegExp(`(^|\\s|[^a-zA-ZÀ-ÿ])${escaped}($|\\s|[^a-zA-ZÀ-ÿ])`, 'i');

    // Vérification sur le contenu normalisé (leetspeak + répétitions)
    if (regex.test(normalized) || normalized.includes(normalizedWord)) {
      return { found: true, word };
    }
    // Vérification sur le contenu original (cas simple)
    const escapedOrig = escapeRegex(word);
    const regexOrig = new RegExp(`(^|\\s|[^a-zA-ZÀ-ÿ])${escapedOrig}($|\\s|[^a-zA-ZÀ-ÿ])`, 'i');
    if (regexOrig.test(original) || original.includes(word)) {
      return { found: true, word };
    }
  }
  return { found: false, word: null };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
