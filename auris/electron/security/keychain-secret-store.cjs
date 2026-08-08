"use strict";

const { createBrowserPublicError } = require("../shared/browser-contract.cjs");

const NIA_PROVIDER_SECRET_NAMESPACE = "nia-provider";
const ALLOWED_NAMESPACES = Object.freeze([NIA_PROVIDER_SECRET_NAMESPACE]);
const ACCOUNT_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;

function createKeychainSecretStore({ safeStorage, persistence } = {}) {
  if (!safeStorage || typeof safeStorage !== "object") {
    throw new TypeError("An Electron safeStorage adapter is required.");
  }

  function isEncryptionAvailable() {
    try {
      return safeStorage.isEncryptionAvailable?.() === true;
    } catch {
      return false;
    }
  }

  function assertAvailable() {
    if (!isEncryptionAvailable()) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-encryption",
      });
    }
  }

  function encrypt(plaintext) {
    assertAvailable();
    const buffer = Buffer.isBuffer(plaintext)
      ? plaintext
      : Buffer.from(String(plaintext ?? ""), "utf8");
    let encrypted;
    try {
      encrypted = safeStorage.encryptString(buffer.toString("utf8"));
    } catch {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-encrypt",
      });
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-encrypt",
      });
    }
    return Buffer.from(encrypted);
  }

  function decrypt(ciphertext) {
    assertAvailable();
    const input = Buffer.isBuffer(ciphertext)
      ? ciphertext
      : Buffer.from(ciphertext ?? []);
    if (input.length === 0) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-decrypt",
      });
    }
    let plaintext;
    try {
      plaintext = safeStorage.decryptString(input);
    } catch {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-decrypt",
      });
    }
    if (typeof plaintext !== "string") {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-decrypt",
      });
    }
    return Buffer.from(plaintext, "utf8");
  }

  function assertPersistence() {
    if (
      !persistence ||
      typeof persistence.get !== "function" ||
      typeof persistence.set !== "function" ||
      typeof persistence.delete !== "function"
    ) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-persistence",
      });
    }
  }

  function assertNamespace(namespace) {
    if (!ALLOWED_NAMESPACES.includes(namespace)) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-namespace",
      });
    }
  }

  function assertAccount(account) {
    if (typeof account !== "string" || !ACCOUNT_PATTERN.test(account)) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-account",
      });
    }
  }

  function vaultKey(namespace, account) {
    return `${namespace}:${account}`;
  }

  function createOpaqueRef(namespace, account) {
    return Object.freeze({
      kind: "keychain-ref",
      namespace,
      account,
    });
  }

  function assertOpaqueRef(ref) {
    if (
      !ref ||
      typeof ref !== "object" ||
      ref.kind !== "keychain-ref" ||
      typeof ref.namespace !== "string" ||
      typeof ref.account !== "string"
    ) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-ref",
      });
    }
    assertNamespace(ref.namespace);
    assertAccount(ref.account);
    return ref;
  }

  async function putNamespacedSecret({ namespace, account } = {}, plaintext) {
    assertPersistence();
    assertNamespace(namespace);
    assertAccount(account);
    if (plaintext == null || (typeof plaintext !== "string" && !Buffer.isBuffer(plaintext))) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-plaintext",
      });
    }
    const ciphertext = encrypt(plaintext);
    await persistence.set(vaultKey(namespace, account), ciphertext);
    return createOpaqueRef(namespace, account);
  }

  async function getNamespacedSecret(ref) {
    assertPersistence();
    const opaque = assertOpaqueRef(ref);
    const ciphertext = await persistence.get(vaultKey(opaque.namespace, opaque.account));
    if (!ciphertext || !Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
      throw createBrowserPublicError("CAPABILITY_NOT_VERIFIED", {
        capability: "keychain-missing",
      });
    }
    return decrypt(ciphertext);
  }

  async function deleteNamespacedSecret(ref) {
    assertPersistence();
    const opaque = assertOpaqueRef(ref);
    await persistence.delete(vaultKey(opaque.namespace, opaque.account));
  }

  return Object.freeze({
    decrypt,
    deleteNamespacedSecret,
    encrypt,
    getNamespacedSecret,
    isEncryptionAvailable,
    putNamespacedSecret,
  });
}

module.exports = {
  NIA_PROVIDER_SECRET_NAMESPACE,
  createKeychainSecretStore,
};
