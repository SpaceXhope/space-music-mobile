import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64UrlBytes, hexBytes, utf8Bytes } from "./cryptoEncoding";

// Same generated obfuscated API material as signer/src/crypto.rs; never store the derived key.
const API_SEED = Uint8Array.of(
  0x55, 0xc3, 0x5c, 0xaa, 0x3f, 0x3c, 0x32, 0x6d,
  0xaa, 0x63, 0x0f, 0x90, 0x39, 0x5d, 0x66, 0x36,
);
const API_OBFUSCATED = Uint8Array.of(
  0x24, 0x99, 0x56, 0x2b, 0x80, 0x20, 0xc1, 0xb7, 0xf6, 0x7d, 0x74, 0x91,
  0xe4, 0xc3, 0x7f, 0x67, 0x1a, 0x0e, 0x8a, 0xf3, 0x7f, 0x50, 0xaf, 0x2e,
  0x05, 0xd5, 0xa7, 0xb0, 0xbe, 0x6e, 0x31, 0x11, 0x40, 0xf3, 0x42, 0xad,
  0x31, 0xf6, 0xcb, 0xea, 0xb5, 0xba, 0xdd, 0xd0, 0x8e, 0x56, 0x55, 0x8c,
  0xb4, 0xe5, 0x1d, 0x82, 0x69, 0x0c, 0x3f, 0xb2, 0x30, 0x82, 0xa7, 0xf4,
  0x9b, 0xba, 0x9b, 0x70,
);
const API_CHECKSUM = Uint8Array.of(0xe2, 0x09, 0x02, 0x55, 0x83, 0xee, 0xf0, 0x07);
export const MAX_SIGNED_BODY_CHARACTERS = 1_048_576;

export class RequestSigningError extends Error {
  constructor() {
    super("Не удалось подписать запрос. Запрос не отправлен; повторите попытку.");
    this.name = "RequestSigningError";
  }
}

function signingKey(): Uint8Array {
  const key = new Uint8Array(API_OBFUSCATED.length);
  const input = new Uint8Array(API_SEED.length + 1);
  input.set(API_SEED);
  try {
    for (let offset = 0; offset < key.length; offset += 32) {
      input[API_SEED.length] = offset / 32;
      const block = sha256(input);
      for (let index = 0; index < block.length; index += 1) {
        key[offset + index] = API_OBFUSCATED[offset + index] ^ block[index];
      }
      block.fill(0);
    }
    const checksum = sha256(key);
    let difference = 0;
    for (let index = 0; index < API_CHECKSUM.length; index += 1) {
      difference |= checksum[index] ^ API_CHECKSUM[index];
    }
    checksum.fill(0);
    if (difference !== 0) throw new RequestSigningError();
    return key;
  } catch {
    key.fill(0);
    throw new RequestSigningError();
  } finally {
    input.fill(0);
  }
}

export function signRequestAt(
  method: string,
  path: string,
  body: string,
  timestamp: number,
  nonce: string,
): Record<string, string> {
  if (
    typeof method !== "string" || typeof path !== "string" ||
    typeof body !== "string" || body.length > MAX_SIGNED_BODY_CHARACTERS ||
    !Number.isSafeInteger(timestamp) || timestamp < 0 ||
    !/^[a-f0-9]{16}$/.test(nonce)
  ) throw new RequestSigningError();
  const normalizedMethod = method.trim().toUpperCase();
  const normalizedPath = path.split("?", 1)[0].trim();
  if (
    !/^[A-Z]{1,16}$/.test(normalizedMethod) ||
    !normalizedPath.startsWith("/") || normalizedPath.startsWith("//") ||
    normalizedPath.length > 4096 || /[\r\n\0#]/.test(normalizedPath)
  ) throw new RequestSigningError();

  const key = signingKey();
  const bodyBytes = utf8Bytes(body);
  let canonical: Uint8Array | undefined;
  let signature: Uint8Array | undefined;
  let mac: ReturnType<typeof hmac.create> | undefined;
  try {
    const bodyHash = hexBytes(sha256(bodyBytes));
    canonical = utf8Bytes(`${normalizedMethod}\n${normalizedPath}\n${timestamp}\n${nonce}\n${bodyHash}`);
    mac = hmac.create(sha256, key);
    signature = mac.update(canonical).digest();
    return {
      "x-liner-signature": base64UrlBytes(signature),
      "x-liner-timestamp": String(timestamp),
      "x-liner-nonce": nonce,
    };
  } catch {
    throw new RequestSigningError();
  } finally {
    mac?.destroy();
    key.fill(0);
    bodyBytes.fill(0);
    canonical?.fill(0);
    signature?.fill(0);
  }
}
