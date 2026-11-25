import { argon2idAsync } from "@noble/hashes/argon2.js";
import { type AuthChallenge, throwIfAborted } from "./authChallenge";
import { decodeBase64Url, utf8Bytes } from "./cryptoEncoding";

export const SUPPORTED_POW_ALGORITHM = "argon2id-v1";
export const POW_LIMITS = {
  memoryKiB: 32_768,
  iterations: 4,
  parallelism: 2,
  difficulty: 20,
  hashLength: 64,
  attempts: 4096,
  budgetMs: 55_000,
  expiryMarginMs: 3000,
} as const;

export class PowCheckError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PowCheckError";
  }
}

export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) bits += 8;
    else return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

function validateChallenge(challenge: AuthChallenge): Uint8Array {
  const integer = (value: number, min: number, max: number) =>
    Number.isSafeInteger(value) && value >= min && value <= max;
  if (
    challenge.algorithm !== SUPPORTED_POW_ALGORITHM ||
    typeof challenge.token !== "string" || !challenge.token || challenge.token.length > 8192 ||
    !integer(challenge.parallelism, 1, POW_LIMITS.parallelism) ||
    !integer(challenge.memoryKiB, 8 * challenge.parallelism, POW_LIMITS.memoryKiB) ||
    !integer(challenge.iterations, 1, POW_LIMITS.iterations) ||
    !integer(challenge.hashLength, 4, POW_LIMITS.hashLength) ||
    !integer(challenge.difficulty, 0, Math.min(POW_LIMITS.difficulty, challenge.hashLength * 8))
  ) throw new PowCheckError("AUTH_CHECK_UNSUPPORTED", "Параметры проверки входа не поддерживаются этим устройством.");
  try {
    const salt = decodeBase64Url(challenge.salt, 64);
    if (salt.length < 8) throw new Error("Salt is too short");
    return salt;
  } catch {
    throw new PowCheckError("AUTH_CHECK_INVALID", "Сервер прислал некорректную проверку входа.");
  }
}

export async function solvePowChallenge(
  challenge: AuthChallenge,
  signal?: AbortSignal,
): Promise<{ token: string; nonce: string }> {
  throwIfAborted(signal);
  const salt = validateChallenge(challenge);
  const startedAt = Date.now();
  const expiresAt = Date.parse(challenge.expiresAt);
  const deadline = Math.min(startedAt + POW_LIMITS.budgetMs, expiresAt - POW_LIMITS.expiryMarginMs);
  const timeout = () => new PowCheckError("AUTH_CHECK_TIMEOUT", "Проверка входа заняла слишком много времени. Повторите попытку.");
  const checkBudget = () => {
    throwIfAborted(signal);
    if (!Number.isFinite(deadline) || Date.now() >= deadline) throw timeout();
  };
  const maxTries = Math.min(POW_LIMITS.attempts, 2 ** Math.min(challenge.difficulty + 6, 30));
  try {
    for (let nonce = 0; nonce < maxTries; nonce += 1) {
      checkBudget();
      const password = utf8Bytes(`${challenge.token}:${nonce}`);
      let hash: Uint8Array | undefined;
      try {
        hash = await argon2idAsync(password, salt, {
          m: challenge.memoryKiB,
          t: challenge.iterations,
          p: challenge.parallelism,
          dkLen: challenge.hashLength,
          version: 0x13,
          asyncTick: 8,
          maxmem: POW_LIMITS.memoryKiB * 1024,
          onProgress: checkBudget,
        });
        checkBudget();
        if (leadingZeroBits(hash) >= challenge.difficulty) return { token: challenge.token, nonce: String(nonce) };
      } finally {
        password.fill(0);
        hash?.fill(0);
      }
    }
    throw timeout();
  } finally {
    salt.fill(0);
  }
}
