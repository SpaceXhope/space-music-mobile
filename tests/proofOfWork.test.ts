import { describe, expect, it } from "vitest";
import { argon2id } from "@noble/hashes/argon2.js";
import { type AuthChallenge } from "../src/api/authChallenge";
import { decodeBase64Url, utf8Bytes } from "../src/api/cryptoEncoding";
import { leadingZeroBits, POW_LIMITS, solvePowChallenge } from "../src/api/proofOfWork";

function challenge(overrides: Partial<AuthChallenge> = {}): AuthChallenge {
  return {
    mode: "required", algorithm: "argon2id-v1", token: "public-test-challenge",
    salt: "cHVibGljLXRlc3Qtc2FsdA", difficulty: 3, memoryKiB: 32,
    iterations: 1, parallelism: 1, hashLength: 32,
    expiresAt: new Date(Date.now() + 60000).toISOString(), ...overrides,
  };
}

describe("bounded native PoW", () => {
  it("produces a verifiable argon2id-v1 proof", async () => {
    const input = challenge();
    const proof = await solvePowChallenge(input);
    const hash = argon2id(utf8Bytes(`${input.token}:${proof.nonce}`), decodeBase64Url(input.salt), {
      m: input.memoryKiB, t: input.iterations, p: input.parallelism, dkLen: input.hashLength, version: 0x13,
    });
    expect(proof.token).toBe(input.token);
    expect(leadingZeroBits(hash)).toBeGreaterThanOrEqual(input.difficulty);
  });
  it("handles zero difficulty", async () => {
    expect((await solvePowChallenge(challenge({ difficulty: 0 }))).nonce).toBe("0");
  });
  it.each([
    { algorithm: "unknown" }, { token: "" }, { difficulty: NaN },
    { difficulty: -1 }, { memoryKiB: POW_LIMITS.memoryKiB + 1 },
    { iterations: POW_LIMITS.iterations + 1 }, { parallelism: 0 },
    { hashLength: 100000 }, { salt: "invalid!" }, { salt: "YQ" },
  ])("rejects unbounded or invalid challenges", async (overrides) => {
    await expect(solvePowChallenge(challenge(overrides))).rejects.toMatchObject({ name: "PowCheckError" });
  });
  it.each(["bad-date", new Date(0).toISOString()])("rejects expired challenges", async (expiresAt) => {
    await expect(solvePowChallenge(challenge({ expiresAt }))).rejects.toMatchObject({ code: "AUTH_CHECK_TIMEOUT" });
  });
  it("honors cancellation before starting", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(solvePowChallenge(challenge(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("yields during computation and cancels an in-flight hash", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(solvePowChallenge(challenge({ memoryKiB: 1024, iterations: 2, difficulty: 20 }), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    } finally { clearTimeout(timer); }
  });
  it.each([
    [[], 0], [[0], 8], [[0, 0, 1], 23], [[128], 0], [[64], 1], [[15], 4],
  ])("counts leading zero bits", (bytes, expected) => {
    expect(leadingZeroBits(Uint8Array.from(bytes as number[]))).toBe(expected);
  });
});
