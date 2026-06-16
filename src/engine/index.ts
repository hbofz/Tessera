/** Public surface of the pure rule engine (DESIGN.md §11.2). */
export * from "./types.js";
export * from "./grid.js";
export {
  applyRule,
  applyTransform,
  applyReadout,
  resolveSelect,
  validateRule,
  answersEqual,
} from "./rule.js";
export { readoutShape, type ReadoutShape } from "./readout-shape.js";
export { Prng, hashSeed } from "./prng.js";
export {
  gridAtTick,
  gridAtTime,
  tickForTime,
  graceTicks,
  defaultAccept,
  DEFAULT_PARAMS,
  type GridParams,
  type AcceptGrid,
} from "./clock.js";
export {
  enumerateSelects,
  enumerateTransforms,
  enumerateReadouts,
  enumerateTransformChains,
  enumerateRules,
  allRules,
  ruleSpaceSize,
  type EnumerateOptions,
} from "./enumerate.js";
export {
  blindGuessResistance,
  observationsToCrack,
  strengthReport,
  answerKey,
  type GridSampler,
  type BlindGuessResult,
  type ObservationsResult,
  type StrengthReport,
} from "./strength.js";
