/**
 * Lexer CLI NetLab — tokenizer murni (tanpa efek samping).
 *
 * Mengubah satu baris CLI mentah menjadi array Token datar. Aturan:
 * - Kata diawali '/' → SLASH (pemisah path, RouterOS) + segmen path sebagai COMMAND.
 * - Kata berbentuk key=value → FLAG + EQUALS + VALUE (nilai tetap utuh walau berisi '/').
 * - Kata diawali '-' (mis. --detail) → FLAG (tanda '-' dilepas).
 * - Kata lain → COMMAND, kecuali posisinya tepat setelah EQUALS → VALUE.
 * - Kutip ganda/tunggal dilepas dari nilai, nilai berspasi tetap satu token.
 */

import type { Token } from './types';

/** Memisahkan input menjadi kata-kata, menghormati kutipan ganda/tunggal. */
export function splitWords(input: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      // Kutipan di awal ATAU tengah kata (mis. `address="..."`): masuk mode
      // kutip tanpa menambahkan penanda ke kata — pembuka maupun penutup
      // dibuang, sehingga nilai berspasi tetap satu kata utuh dan seimbang
      // (`name="R1 Lab"` → satu kata `name=R1 Lab`; stripQuotes di tokenize
      // tidak lagi menemukan kutip yatim).
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        words.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  return words;
}

/** Melepas kutip terluar bila ada ('foo' atau "foo bar" → foo / foo bar). */
export function stripQuotes(word: string): string {
  if (word.length >= 2) {
    const first = word[0];
    const last = word[word.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return word.slice(1, -1);
    }
  }
  return word;
}

/**
 * Tokenisasi satu baris perintah CLI menjadi Token[].
 *
 * Contoh: "/ip address add address=192.168.1.1/24 interface=ether1" →
 * [SLASH(''), COMMAND('ip'), COMMAND('address'), COMMAND('add'),
 *  FLAG('address'), EQUALS('='), VALUE('192.168.1.1/24'),
 *  FLAG('interface'), EQUALS('='), VALUE('ether1')]
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  for (const rawWord of splitWords(input)) {
    const word = stripQuotes(rawWord);

    // key=value → FLAG + EQUALS + VALUE ('=' pertama sebagai pemisah).
    const eqIndex = word.indexOf('=');
    if (eqIndex > 0) {
      const key = word.slice(0, eqIndex).replace(/^-+/, '');
      const value = stripQuotes(word.slice(eqIndex + 1));
      tokens.push({ type: 'FLAG', value: key });
      tokens.push({ type: 'EQUALS', value: '=' });
      tokens.push({ type: 'VALUE', value });
      continue;
    }

    // Path RouterOS: "/ip address" atau "/ip/address" → SLASH + segmen COMMAND.
    if (word.startsWith('/')) {
      tokens.push({ type: 'SLASH', value: '' });
      for (const segment of word.slice(1).split('/')) {
        if (segment) tokens.push({ type: 'COMMAND', value: segment });
      }
      continue;
    }

    // '--detail' / '-f' → FLAG.
    if (word.startsWith('-') && word.length > 1) {
      tokens.push({ type: 'FLAG', value: word.replace(/^-+/, '') });
      continue;
    }

    // Posisi setelah EQUALS → VALUE (argumen pertama dari CLI juga pernah VALUE
    // untuk perintah tanpa '=' — diputuskan oleh parser, bukan lexer).
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === 'EQUALS') {
      tokens.push({ type: 'VALUE', value: word });
    } else {
      tokens.push({ type: 'COMMAND', value: word });
    }
  }
  return tokens;
}