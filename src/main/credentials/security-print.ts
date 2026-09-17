/**
 * What `security` PRINTS for an item's payload, read back as the bytes the item
 * holds (Phase 204, moved into a file of its own in Phase 281).
 *
 * WHY THIS IS ITS OWN MODULE. Two domains read what `find-generic-password -w`
 * prints: `./security.ts`, which every credential move in this domain goes
 * through, and `../usage/credentials.ts`, the meter's reader, which decodes
 * since Phase 281 because a payload printed as hex reached its JSON parser raw
 * and read `missing` (research 126 §2.7). Phase 281 also has `./security.ts`
 * ask `../usage/credentials.ts` which names are Claude Code's, so if the
 * decoder stayed in `./security.ts` the two modules would run each other at
 * import time, which `build/assert-no-runtime-cycles.mjs` refuses. This file
 * imports nothing, so both can depend on it and neither depends on the other
 * through it. `./security.ts` re-exports it, so the domain's one reading of
 * `security`'s output is still reached from the file that runs `security`.
 *
 * NOTHING HERE IS LOGGED AND NOTHING HERE THROWS. The answer is a string.
 */

/**
 * What `find-generic-password -w` printed, as the bytes the item holds.
 *
 * MEASURED: `security` prints the payload verbatim when it is printable and
 * prints it as HEX when it is not, and in both cases it adds exactly one
 * trailing newline. A trim would corrupt a payload with trailing spaces, so
 * exactly one newline is removed and nothing else.
 *
 * THE DISAMBIGUATION, and it follows from the same measurement. `security`
 * prints hex ONLY when the payload is not printable. So a run of hex digits
 * whose decoding is itself printable cannot be a hex PRINTING, because the
 * payload it would have come from would have been printed raw: the text is the
 * payload. The decoding is taken only when it holds a character `security`
 * would have refused to print, which is what forced the hex form.
 *
 * A residual ambiguity is left on purpose and it is harmless: a payload whose
 * own text is the hex of a control character is read as that control
 * character. Every write in this domain is verified by reading it back and
 * comparing bytes, so a payload that cannot survive this round trip refuses
 * the write rather than corrupting a store. Neither vendor writes one: both
 * write JSON, which is never a run of hex digits.
 */
export function decodeKeychainPayload(raw: string): string {
  const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  if (text.length === 0) return text;
  if (text.length % 2 !== 0 || !/^[0-9a-f]+$/.test(text)) return text;
  const bytes = Buffer.from(text, 'hex');
  const decoded = bytes.toString('utf8');
  // Not valid UTF-8, so it was never a payload this product wrote.
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return text;
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0008\u000a-\u001f\u007f]/.test(decoded) ? decoded : text;
}
