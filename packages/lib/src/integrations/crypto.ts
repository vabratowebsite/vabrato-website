import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encryption for connected-account tokens (Integrations PR 1). A refresh
// token is encrypted with AES-256-GCM before it reaches the database; the key
// lives only in the server's environment (INTEGRATIONS_TOKEN_KEY, 32 bytes in
// base64). The stored form is "v1.<iv>.<ciphertext>.<tag>" (base64url), so a
// later key can be added as v2 and old rows still read. Errors never include
// the token or the key.

const VERSION = "v1";

export class TokenKeyError extends Error {
  constructor() {
    super("INTEGRATIONS_TOKEN_KEY must be 32 bytes in base64");
    this.name = "TokenKeyError";
  }
}

export class TokenDecryptError extends Error {
  constructor() {
    super("The stored token couldn't be read: reconnect the account");
    this.name = "TokenDecryptError";
  }
}

/** The 32-byte key from its base64 form; throws TokenKeyError for anything else. */
export function tokenKey(base64: string | undefined): Buffer {
  const raw = (base64 ?? "").trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) throw new TokenKeyError();
  const key = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length !== 32) throw new TokenKeyError();
  return key;
}

export function encryptToken(plain: string, key: Buffer): string {
  if (key.length !== 32) throw new TokenKeyError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(VERSION));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptToken(stored: string, key: Buffer): string {
  if (key.length !== 32) throw new TokenKeyError();
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new TokenDecryptError();
  try {
    const [, ivText, body, tagText] = parts as [string, string, string, string];
    const iv = Buffer.from(ivText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    // Full-length IV and tag only: a shortened tag would weaken the check.
    if (iv.length !== 12 || tag.length !== 16) throw new TokenDecryptError();
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(VERSION));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptError();
  }
}
