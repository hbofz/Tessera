import { describe, it, expect, beforeEach } from "vitest";
import {
  attemptLogin,
  newLoginState,
  type Enrollment,
  type LoginState,
  type RateLimitConfig,
} from "./login.js";
import { OptionAVerifier } from "./verifier.js";
import { gridAtTick, tickForTime, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { Answer, Rule } from "../engine/types.js";

const SEED = "login-seed";
const RULE: Rule = {
  select: { type: "all" },
  transforms: [{ type: "shift", dir: "right" }],
  readout: { type: "line", which: { kind: "row", index: 0 }, order: "ltr" },
};

const verifier = new OptionAVerifier();

function makeEnrollment(): Enrollment {
  return {
    credential: verifier.enroll(RULE),
    seed: SEED,
    params: DEFAULT_PARAMS,
  };
}

/** The answer an honest user would tap at a given tick. */
function honestAnswer(tick: number): Answer {
  return applyRule(gridAtTick(SEED, tick, DEFAULT_PARAMS), RULE);
}

/** A wall-clock time (ms) squarely inside a given tick. */
function timeAtTick(tick: number): number {
  return (tick + 0.5) * DEFAULT_PARAMS.periodSeconds * 1000;
}

describe("attemptLogin — happy path & grace window (§10)", () => {
  let enrollment: Enrollment;
  let state: LoginState;
  beforeEach(() => {
    enrollment = makeEnrollment();
    state = newLoginState();
  });

  it("PASS on the current tick", () => {
    const now = timeAtTick(10);
    const out = attemptLogin(enrollment, state, verifier, honestAnswer(10), now);
    expect(out).toEqual({ result: "pass", tick: 10 });
  });

  it("PASS using a previous-tick answer (t-1) within the grace window", () => {
    const now = timeAtTick(10);
    // User was a touch slow: they computed the answer for tick 9.
    const out = attemptLogin(enrollment, state, verifier, honestAnswer(9), now);
    expect(out.result).toBe("pass");
    if (out.result === "pass") expect(out.tick).toBe(9);
  });

  it("PASS using a next-tick answer (t+1) within the grace window", () => {
    const now = timeAtTick(10);
    const out = attemptLogin(enrollment, state, verifier, honestAnswer(11), now);
    expect(out.result).toBe("pass");
    if (out.result === "pass") expect(out.tick).toBe(11);
  });

  it("FAIL when the answer matches no tick in the window (e.g. tick 7 at tick 10)", () => {
    const now = timeAtTick(10);
    const stale = honestAnswer(7);
    // Guard: tick 7's answer must actually differ from ticks 9/10/11, else this
    // test is vacuous. If it collides we skip the assertion.
    const windowAnswers = [9, 10, 11].map((t) => JSON.stringify(honestAnswer(t)));
    if (windowAnswers.includes(JSON.stringify(stale))) return;
    const out = attemptLogin(enrollment, state, verifier, stale, now);
    expect(out).toEqual({ result: "fail", reason: "no-match" });
  });

  it("the grace tick used matches what the clock would floor", () => {
    const now = timeAtTick(10);
    expect(tickForTime(now)).toBe(10);
  });
});

describe("attemptLogin — replay defense", () => {
  it("blocks reusing the same tick after a successful login", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();
    const now = timeAtTick(20);
    const ans = honestAnswer(20);

    const first = attemptLogin(enrollment, state, verifier, ans, now);
    expect(first.result).toBe("pass");

    // Same answer, same tick, moments later — must be rejected as replay.
    const second = attemptLogin(enrollment, state, verifier, ans, now + 10);
    expect(second).toEqual({ result: "fail", reason: "replay" });
  });

  it("monotonic-tick: a captured EARLIER-tick answer can't be replayed after a later login (finding #1)", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();

    // Legit login at tick 25 sets the high-water mark.
    const legit = attemptLogin(enrollment, state, verifier, honestAnswer(25), timeAtTick(25));
    expect(legit.result).toBe("pass");

    // Attacker replays a captured answer for an EARLIER tick (24) while the
    // server clock has rolled to 25 (so 24 is still in the grace window of 25).
    // Without monotonic enforcement this would pass; it must now be replay.
    const replay = attemptLogin(enrollment, state, verifier, honestAnswer(24), timeAtTick(25));
    if (JSON.stringify(honestAnswer(24)) === JSON.stringify(honestAnswer(25))) return; // skip if answers collide
    expect(replay).toEqual({ result: "fail", reason: "replay" });
  });

  it("a new tick is still accepted after a prior tick was consumed", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();

    const a = attemptLogin(enrollment, state, verifier, honestAnswer(30), timeAtTick(30));
    expect(a.result).toBe("pass");

    const b = attemptLogin(enrollment, state, verifier, honestAnswer(31), timeAtTick(31));
    expect(b.result).toBe("pass");
    if (b.result === "pass") expect(b.tick).toBe(31);
  });
});

describe("attemptLogin — rate limiting (§6)", () => {
  const tight: RateLimitConfig = { maxAttempts: 3, windowMs: 60_000 };

  it("blocks after maxAttempts wrong guesses within the window", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();
    const base = timeAtTick(40);
    const wrong: Answer = { kind: "line", value: ["X" as never] }; // never matches

    for (let i = 0; i < 3; i++) {
      const out = attemptLogin(enrollment, state, verifier, wrong, base + i, tight);
      expect(out.result).toBe("fail");
    }
    const blocked = attemptLogin(enrollment, state, verifier, wrong, base + 3, tight);
    expect(blocked.result).toBe("fail");
    if (blocked.result === "fail" && blocked.reason === "rate-limited") {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    } else {
      throw new Error("expected rate-limited");
    }
  });

  it("rate limit even blocks an otherwise-correct answer (throttle is unconditional)", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();
    const base = timeAtTick(50);
    const wrong: Answer = { kind: "count", value: -1 };

    for (let i = 0; i < 3; i++) attemptLogin(enrollment, state, verifier, wrong, base + i, tight);

    // Now submit the CORRECT answer — still throttled because the window is full.
    const out = attemptLogin(enrollment, state, verifier, honestAnswer(50), base + 4, tight);
    expect(out.result).toBe("fail");
    if (out.result === "fail") expect(out.reason).toBe("rate-limited");
  });

  it("attempts outside the window are forgiven (sliding window)", () => {
    const enrollment = makeEnrollment();
    const state = newLoginState();
    const wrong: Answer = { kind: "count", value: -1 };

    // 3 attempts at tick 60.
    const base = timeAtTick(60);
    for (let i = 0; i < 3; i++) attemptLogin(enrollment, state, verifier, wrong, base + i, tight);

    // Well past the window: a correct answer at a later tick should pass.
    const later = base + tight.windowMs + 1;
    const laterTick = tickForTime(later);
    const out = attemptLogin(enrollment, state, verifier, honestAnswer(laterTick), later, tight);
    expect(out.result).toBe("pass");
  });
});
