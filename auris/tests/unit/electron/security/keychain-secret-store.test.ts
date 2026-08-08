import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createKeychainSecretStore } = require(
  "../../../../electron/security/keychain-secret-store.cjs",
);

function createFakeSafeStorage({
  available = true,
  corruptDecrypt = false,
  lockedEncrypt = false,
} = {}) {
  const vault = new Map<string, string>();
  return {
    decryptString(ciphertext: Buffer) {
      if (!available) throw new Error("unavailable");
      if (corruptDecrypt) throw new Error("corrupt");
      const key = ciphertext.toString("base64");
      const value = vault.get(key);
      if (value == null) throw new Error("missing");
      return value;
    },
    encryptString(plaintext: string) {
      if (!available || lockedEncrypt) throw new Error("locked");
      const ciphertext = Buffer.from(
        Buffer.from(plaintext, "utf8").toString("base64"),
        "utf8",
      );
      vault.set(ciphertext.toString("base64"), plaintext);
      return ciphertext;
    },
    isEncryptionAvailable() {
      return available;
    },
  };
}

describe("keychain secret store", () => {
  it("reports unavailable encryption and refuses encrypt/decrypt", () => {
    const store = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage({ available: false }),
    });
    expect(store.isEncryptionAvailable()).toBe(false);
    expect(() => store.encrypt(Buffer.from("secret"))).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );
    expect(() => store.decrypt(Buffer.from("nope"))).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );
  });

  it("round-trips ciphertext without exposing plaintext helpers", () => {
    const store = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage(),
    });
    const ciphertext = store.encrypt(Buffer.from("cookie=secret", "utf8"));
    expect(Buffer.isBuffer(ciphertext)).toBe(true);
    expect(ciphertext.includes(Buffer.from("secret"))).toBe(false);
    expect(store.decrypt(ciphertext).toString("utf8")).toBe("cookie=secret");
  });

  it("fails closed on locked encrypt and corrupt ciphertext", () => {
    const locked = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage({ lockedEncrypt: true }),
    });
    expect(() => locked.encrypt(Buffer.from("x"))).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );

    const corrupt = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage({ corruptDecrypt: true }),
    });
    const good = createKeychainSecretStore({
      safeStorage: createFakeSafeStorage(),
    });
    const ciphertext = good.encrypt(Buffer.from("payload"));
    expect(() => corrupt.decrypt(ciphertext)).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_NOT_VERIFIED" }),
    );
  });
});
