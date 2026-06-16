/** Public surface of the auth layer (login/verify loop, §10). */
export type { Credential, Verifier } from "./verifier.js";
export { OptionAVerifier, OPTION_A_KIND, recoverOptionARule } from "./verifier.js";
export { OptionBVerifier, OPTION_B_KIND } from "./option-b-verifier.js";
export { canonicalRule } from "./canonical.js";
export { Sha256VerifyHash, sha256Hex, digestsEqual, type VerifyHash } from "./verifyhash.js";
// scrypt slow hash retained for the design record / higher-hardness deployments
// (see slowhash.ts); not the app default. Note: depends on node:crypto.
export { ScryptSlowHash, DEFAULT_SCRYPT, type SlowHash, type ScryptParams } from "./slowhash.js";
export {
  saveEnrollment,
  loadEnrollment,
  clearEnrollment,
  type KeyValueStore,
} from "./persistence.js";
export {
  attemptLogin,
  newLoginState,
  DEFAULT_RATE_LIMIT,
  type Enrollment,
  type LoginState,
  type LoginOutcome,
  type RateLimitConfig,
} from "./login.js";
