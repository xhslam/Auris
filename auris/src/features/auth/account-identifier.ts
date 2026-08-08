export type AccountIdentifierType = "email" | "phone";

export function normalizeAccountIdentifier(account: string) {
  return account.trim().toLowerCase();
}

export function inferAccountIdentifierType(
  accountIdentifier: string,
): AccountIdentifierType {
  return accountIdentifier.includes("@") ? "email" : "phone";
}
