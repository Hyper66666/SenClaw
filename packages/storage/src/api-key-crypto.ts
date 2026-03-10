import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";

const API_KEY_PREFIX = "sk_";
const API_KEY_BODY_LENGTH = 43;
const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const API_KEY_PATTERN = new RegExp(
  `^${API_KEY_PREFIX}[A-Za-z0-9]{${API_KEY_BODY_LENGTH}}$`,
);
const BCRYPT_ROUNDS = 10;

function base62Encode(buffer: Buffer): string {
  let value = BigInt(`0x${buffer.toString("hex")}`);

  if (value === 0n) {
    return "0".padStart(API_KEY_BODY_LENGTH, "0");
  }

  let encoded = "";
  while (value > 0n) {
    encoded = BASE62_ALPHABET[Number(value % 62n)] + encoded;
    value /= 62n;
  }

  return encoded.padStart(API_KEY_BODY_LENGTH, "0");
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${base62Encode(randomBytes(32))}`;
}

export function isValidApiKeyFormat(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

export function computeApiKeyLookupHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashApiKey(value: string): Promise<string> {
  return hash(value, BCRYPT_ROUNDS);
}

export async function verifyApiKey(
  value: string,
  keyHash: string,
): Promise<boolean> {
  return compare(value, keyHash);
}
