import * as Crypto from "expo-crypto";
import { hexBytes } from "./cryptoEncoding";
import { RequestSigningError, signRequestAt } from "./signerCore";

let serverOffsetMs = 0;

export function syncServerTime(dateHeader: string | null): void {
  if (!dateHeader) return;
  const serverTime = Date.parse(dateHeader);
  if (Number.isFinite(serverTime)) serverOffsetMs = serverTime - Date.now();
}

export async function signRequest(
  method: string,
  path: string,
  body = "",
): Promise<Record<string, string>> {
  let nonceBytes: Uint8Array | undefined;
  try {
    nonceBytes = await Crypto.getRandomBytesAsync(8);
    if (nonceBytes.length !== 8) throw new RequestSigningError();
    const timestamp = Math.floor((Date.now() + serverOffsetMs) / 1000);
    return signRequestAt(method, path, body, timestamp, hexBytes(nonceBytes));
  } catch {
    throw new RequestSigningError();
  } finally {
    nonceBytes?.fill(0);
  }
}
