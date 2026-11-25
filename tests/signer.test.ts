import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { signRequestAt, RequestSigningError, MAX_SIGNED_BODY_CHARACTERS } from "../src/api/signerCore";
import { base64UrlBytes, decodeBase64Url, hexBytes, utf8Bytes } from "../src/api/cryptoEncoding";

const referenceText = readFileSync(new URL("../src/api/signerWasm.ts", import.meta.url), "utf8");
const encoded = referenceText.match(/SIGNER_WASM_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"/)?.[1];
if (!encoded) throw new Error("Reference WASM is missing");
interface ReferenceExports {
  memory: WebAssembly.Memory;
  liner_alloc: (length: number) => number;
  liner_dealloc: (pointer: number, length: number) => void;
  liner_sign_request: (...arguments_: (number | bigint)[]) => number;
  liner_get_result_ptr: () => number;
  liner_get_result_len: () => number;
}
const reference = new WebAssembly.Instance(new WebAssembly.Module(Buffer.from(encoded, "base64"))).exports as unknown as ReferenceExports;
function wasmSignature(method: string, path: string, body: string, timestamp: number, nonce: string): string {
  const allocations = [method.trim().toUpperCase(), path.split("?", 1)[0].trim(), body, nonce].map((value) => {
    const bytes = Buffer.from(value, "utf8");
    const pointer = reference.liner_alloc(bytes.length);
    new Uint8Array(reference.memory.buffer, pointer, bytes.length).set(bytes);
    return [pointer, bytes.length];
  });
  try {
    const code = reference.liner_sign_request(...allocations[0], ...allocations[1], ...allocations[2], BigInt(timestamp), ...allocations[3]);
    if (code !== 0) throw new Error("Reference signer failed");
    return Buffer.from(new Uint8Array(reference.memory.buffer, reference.liner_get_result_ptr(), reference.liner_get_result_len())).toString("utf8");
  } finally {
    for (const [pointer, length] of allocations) reference.liner_dealloc(pointer, length);
  }
}

describe("Hermes-compatible request signatures", () => {
  const vectors = [
    ["GET", "/v1/tracks", ""],
    ["POST", "/v1/auth/challenge", '{"name":"Тест 🎵"}'],
    ["DELETE", "/v1/me/library/tracks/test", ""],
    [" put ", " /v1/me/playlists?limit=10 ", '{"text":"日本語 — é"}'],
    ["POST", "/v1/auth/login", '{"email":"example@example.invalid","password":"test-only"}'],
    ["GET", "/v1/catalog/search?q=%D1%82%D0%B5%D1%81%D1%82", ""],
    ["PATCH", "/v1/test", "\ud800\udfff\ud800"],
    ["POST", "/v1/test", "a".repeat(65536)],
  ];
  it.each(vectors)("matches the existing WASM for %s %s", (method, path, body) => {
    const timestamp = 1700000000;
    const nonce = "0123456789abcdef";
    const headers = signRequestAt(method, path, body, timestamp, nonce);
    expect(headers["x-liner-signature"]).toBe(wasmSignature(method, path, body, timestamp, nonce));
    expect(headers["x-liner-signature"]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(headers["x-liner-timestamp"]).toBe(String(timestamp));
    expect(headers["x-liner-nonce"]).toBe(nonce);
  });

  it("works without browser globals or WebAssembly at runtime", () => {
    const expected = signRequestAt("GET", "/v1/tracks", "", 1, "0123456789abcdef");
    for (const name of ["WebAssembly", "TextEncoder", "TextDecoder", "atob", "btoa", "Buffer"]) vi.stubGlobal(name, undefined);
    try { expect(signRequestAt("GET", "/v1/tracks", "", 1, "0123456789abcdef")).toEqual(expected); }
    finally { vi.unstubAllGlobals(); }
  });

  it.each([
    ["GET\nPOST", "/v1/test", "", 1, "0123456789abcdef"],
    ["GET", "https://example.invalid", "", 1, "0123456789abcdef"],
    ["GET", "//example.invalid", "", 1, "0123456789abcdef"],
    ["GET", "/v1/test\nother", "", 1, "0123456789abcdef"],
    ["GET", "/v1/test", "", NaN, "0123456789abcdef"],
    ["GET", "/v1/test", "", -1, "0123456789abcdef"],
    ["GET", "/v1/test", "", 1, ""],
    ["POST", "/v1/test", "a".repeat(MAX_SIGNED_BODY_CHARACTERS + 1), 1, "0123456789abcdef"],
  ])("rejects invalid signing input", (method, path, body, timestamp, nonce) => {
    expect(() => signRequestAt(method as string, path as string, body as string, timestamp as number, nonce as string)).toThrow(RequestSigningError);
  });
});

describe("native-safe encodings", () => {
  it.each(["", "ASCII", "Тест 🎵", "日本語", "a\ud800b\udc00c", "\0\r\n", "🪐".repeat(16)])("encodes UTF-8 exactly", (value) => {
    expect(hexBytes(utf8Bytes(value))).toBe(Buffer.from(value).toString("hex"));
  });
  it.each([1, 2, 3, 4, 8, 32, 64])("round-trips %i base64url bytes", (size) => {
    const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 73 + 17) % 256);
    const encodedBytes = base64UrlBytes(bytes);
    expect(encodedBytes).toBe(Buffer.from(bytes).toString("base64url"));
    expect(decodeBase64Url(encodedBytes)).toEqual(bytes);
  });
  it.each(["!", "A", "AZ", "a b", "====", "a".repeat(1000)])("rejects invalid base64url", (value) => {
    expect(() => decodeBase64Url(value)).toThrow();
  });
});
