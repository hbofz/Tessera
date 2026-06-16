/** Public surface of the auth layer (login/verify loop, §10). */
export type { Credential, Verifier } from "./verifier.js";
export { OptionAVerifier, OPTION_A_KIND } from "./verifier.js";
export {
  attemptLogin,
  newLoginState,
  DEFAULT_RATE_LIMIT,
  type Enrollment,
  type LoginState,
  type LoginOutcome,
  type RateLimitConfig,
} from "./login.js";
