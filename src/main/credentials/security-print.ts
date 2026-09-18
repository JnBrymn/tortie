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
 * Would `security` print this payload verbatim? (Phase 281.1)
 *
 * MEASURED on a scratch keychain, 2026-09-17, twice (the Phase 281.1 measure
 * verifier and its fix round): `find-generic-password -w` prints the payload
 * raw when EVERY BYTE is in 0x20–0x7E, which is `isprint` in the C locale,
 * and prints it as lowercase hex when any byte is outside that range. A
 * trailing space (0x20) and a tilde (0x7E) print raw; a tab (0x09), DEL
 * (0x7F), a control character, and EVERY non-ASCII character (an accented
 * letter, an emoji, whose UTF-8 bytes are all 0x80 or above) print as hex.
 *
 * Until Phase 281.1 the decoder's table admitted only the control characters
 * and DEL, so a credential JSON holding a tab or any non-ASCII character
 * (`JSON.stringify` keeps those raw, and an MCP server name can hold either)
 * came back from the shipping readers as the hex string itself: the meter's
 * parser read `missing`, the sign-in line Phase 281 exists to remove, and
 * `readStore` captured nothing. Both fake `security` programs printed by the
 * same wrong table, so no unit test or gate could see it.
 *
 * ONE PREDICATE, asked by the decoder here and by both fakes when they print
 * (`__tests__/first-match-security.ts`, `build/credentials-conformance-
 * probe.mts`), so the model and the reading of it cannot drift apart again.
 * A character outside 0x20–0x7E in a JS string is exactly a byte outside
 * that range in its UTF-8 form: a lone surrogate encodes to bytes above 0x7F
 * as well.
 */
export function securityPrintsRaw(payload: string): boolean {
  return !/[^\x20-\x7e]/.test(payload);
}

/**
 * What `find-generic-password -w` printed, as the bytes the item holds.
 *
 * MEASURED: `security` prints the payload verbatim when {@link securityPrintsRaw}
 * holds of it and prints it as HEX when it does not, and in both cases it adds
 * exactly one trailing newline. A trim would corrupt a payload with trailing
 * spaces, so exactly one newline is removed and nothing else.
 *
 * THE DISAMBIGUATION, and it follows from the same measurement. `security`
 * prints hex ONLY when the payload holds a byte outside 0x20–0x7E. So a run of
 * hex digits whose decoding is itself made of such bytes cannot be a hex
 * PRINTING, because the payload it would have come from would have been
 * printed raw: the text is the payload. The decoding is taken only when it
 * holds a character `security` would have refused to print, which is what
 * forced the hex form.
 *
 * A residual ambiguity is left on purpose and it is harmless: a payload whose
 * own text is the hex of bytes `security` will not print (a control
 * character, or a non-ASCII character since Phase 281.1) is read as those
 * bytes. Every write in this domain is verified by reading it back and
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
  return securityPrintsRaw(decoded) ? text : decoded;
}
