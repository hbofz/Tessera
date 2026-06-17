import { describe, it, expect } from "vitest";
import { isBackendConfigured, friendlyError, BackendNotConfiguredError } from "./backend.js";

/**
 * The whole point of the lazy client: importing backend.ts must NOT throw,
 * whether or not .env is present, so the solo sandbox (and the app) load fine on
 * a fresh checkout. The fact that the imports at the top of this file resolved —
 * and isBackendConfigured() returns without throwing — is the guarantee.
 * (We don't assert a specific true/false, since that depends on whether the
 * dev's checkout happens to have a .env loaded by Vite.)
 */
describe("backend env guard", () => {
  it("importing the module does not crash, and the guard is callable", () => {
    expect(typeof isBackendConfigured()).toBe("boolean");
  });

  it("maps a not-configured error to a helpful message", () => {
    expect(friendlyError(new BackendNotConfiguredError())).toMatch(/\.env/);
  });

  it("maps network errors to a calm message", () => {
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/connection/i);
  });

  it("passes through an unknown error's text", () => {
    expect(friendlyError(new Error("weird thing"))).toBe("weird thing");
  });
});
