const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Native crypto paths must not depend on browser-only TextEncoder, atob or Buffer.
export function utf8Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 3);
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index += 1;
      } else code = 0xfffd;
    } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd;

    if (code < 0x80) bytes[length++] = code;
    else if (code < 0x800) {
      bytes[length++] = 0xc0 | (code >> 6);
      bytes[length++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      bytes[length++] = 0xe0 | (code >> 12);
      bytes[length++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[length++] = 0x80 | (code & 0x3f);
    } else {
      bytes[length++] = 0xf0 | (code >> 18);
      bytes[length++] = 0x80 | ((code >> 12) & 0x3f);
      bytes[length++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[length++] = 0x80 | (code & 0x3f);
    }
  }
  return bytes.subarray(0, length);
}

export function hexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function base64UrlBytes(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    encoded += BASE64URL[a >> 2] + BASE64URL[((a & 3) << 4) | (b >> 4)];
    if (index + 1 < bytes.length) encoded += BASE64URL[((b & 15) << 2) | (c >> 6)];
    if (index + 2 < bytes.length) encoded += BASE64URL[c & 63];
  }
  return encoded;
}

export function decodeBase64Url(value: string, maxBytes = 128): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((maxBytes * 4) / 3) + 2 ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(value)
  ) throw new Error("Invalid base64url value");
  const unpadded = value.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw new Error("Invalid base64url length");
  const bytes = new Uint8Array(Math.floor((unpadded.length * 6) / 8));
  if (bytes.length > maxBytes) throw new Error("Base64url value is too large");
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (const symbol of unpadded) {
    accumulator = (accumulator << 6) | BASE64URL.indexOf(symbol);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (accumulator >> bits) & 255;
    }
  }
  if ((accumulator & ((1 << bits) - 1)) !== 0) throw new Error("Invalid base64url padding");
  return bytes;
}
