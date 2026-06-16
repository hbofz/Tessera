/**
 * Slow hash for the Option B verifier (DESIGN.md §6).
 *
 * §6: "a deliberately slow hash (Argon2/scrypt)" — because R is low-entropy, a
 * leaked verifier is offline-brute-forceable, so the per-guess cost must be high.
 *
 * SEAM: the verifier depends on the SlowHash interface, not a concrete impl, so:
 *   - Node (server + tests) uses scrypt (built into node:crypto).
 *   - A browser client can inject a Web Crypto PBKDF2 or wasm-Argon2 impl with
 *     the SAME interface — no verifier change. (The browser path is left as a
 *     future injection point; v1 runs the verifier server-side / in Node.)
 *
 * The hash MUST be deterministic given (input, salt) so enrollment and
 * verification agree. scrypt is deterministic. Output is hex for easy storage.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export interface SlowHash {
  /** Hash `input` with `salt` (both strings) → hex digest. Deterministic. */
  hash(input: string, saltHex: string): string;
  /** Fresh random salt as hex. */
  newSalt(): string;
}

/** scrypt parameters. N=2^15 is a reasonable interactive cost; r/p standard. */
export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLen: number;
}

export const DEFAULT_SCRYPT: ScryptParams = { N: 1 << 15, r: 8, p: 1, keyLen: 32 };

export class ScryptSlowHash implements SlowHash {
  constructor(private readonly params: ScryptParams = DEFAULT_SCRYPT) {}

  hash(input: string, saltHex: string): string {
    const salt = Buffer.from(saltHex, "hex");
    // maxmem must accommodate N*r*128 bytes; bump it for N=2^15.
    const maxmem = 128 * this.params.N * this.params.r * 2;
    const out = scryptSync(input, salt, this.params.keyLen, {
      N: this.params.N,
      r: this.params.r,
      p: this.params.p,
      maxmem,
    });
    return out.toString("hex");
  }

  newSalt(): string {
    return randomBytes(16).toString("hex");
  }
}

const HEX = /^[0-9a-fA-F]*$/;

/** Constant-time comparison of two hex digests (avoid a timing oracle on the
 *  stored verifier). Returns false on length mismatch.
 *
 *  Guards against non-hex input: `Buffer.from(x, "hex")` SILENTLY drops invalid
 *  characters, so two different non-hex strings could decode to equal buffers
 *  and falsely compare equal. We reject non-hex / odd-length input outright so a
 *  mis-supplied digest fails closed rather than giving a false match. */
export function digestsEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  if (aHex.length % 2 !== 0) return false;
  if (!HEX.test(aHex) || !HEX.test(bHex)) return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
