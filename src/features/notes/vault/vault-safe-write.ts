import type { VaultClient } from "@/features/notes/vault/vault-types";

export type SafeVaultWriteResult =
  | { status: "saved" }
  | { status: "unchanged" }
  | { currentRawSource: string | null; status: "conflict" };

export type SafeVaultWriteInput = {
  expectedRawSource: string | null;
  nextRawSource: string;
  path: string;
};

export async function safeWriteVaultFile(
  client: Pick<VaultClient, "readFile" | "writeFile">,
  input: SafeVaultWriteInput,
): Promise<SafeVaultWriteResult> {
  const currentRawSource = await client.readFile(input.path);

  if (currentRawSource === input.nextRawSource) {
    return { status: "unchanged" };
  }

  if (currentRawSource !== input.expectedRawSource) {
    return {
      currentRawSource,
      status: "conflict",
    };
  }

  await client.writeFile(input.path, input.nextRawSource);
  return { status: "saved" };
}
