export type AuthPurpose = "login" | "register";
export type CheckMode = "off" | "optional" | "required";
export type AuthPhase = "challenge" | "human-check" | "proof-of-work" | "sign-in";

export interface AuthChallenge {
  mode: CheckMode;
  algorithm: string;
  token: string;
  salt: string;
  difficulty: number;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
  expiresAt: string;
  turnstile?: { mode: CheckMode; siteKey?: string; edge?: boolean };
}

export interface HumanCheckRequest {
  action: AuthPurpose;
  mode: Exclude<CheckMode, "off">;
  signal?: AbortSignal;
}

export interface AuthRequestOptions {
  signal?: AbortSignal;
  onPhase?: (phase: AuthPhase) => void;
  humanCheck?: (request: HumanCheckRequest) => Promise<string | null>;
}

export function abortError(): Error {
  const error = new Error("Проверка отменена.");
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function isCheckMode(value: unknown): value is CheckMode {
  return value === "off" || value === "optional" || value === "required";
}
