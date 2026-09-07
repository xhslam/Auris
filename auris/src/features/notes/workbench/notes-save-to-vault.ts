import { normalizeCjkSpacing } from "@/features/notes/editor/cjk-format-rules";
import { repairSplitSurrogateEntities } from "@/features/notes/markdown/surrogate-repair";
import { getFormatDescriptor } from "@/features/notes/formats/format-registry";
import { safeWriteVaultFile } from "@/features/notes/vault/vault-safe-write";
import type { VaultClient } from "@/features/notes/vault/vault-types";
import {
  clearPendingNoteSave,
  registerPendingNoteSave,
} from "@/features/notes/workbench/notes-pending-saves";

const PENDING_SAVE_CLEAR_DELAY_MS = 1_000;

export type NotesSaveType = "auto" | "manual";

export type SaveNoteToVaultResult =
  | {
      normalizedSource: string;
      status: "saved" | "unchanged";
    }
  | {
      currentRawSource: string | null;
      normalizedSource: string;
      status: "conflict";
    };

export async function saveNoteToVault(
  client: Pick<VaultClient, "readFile" | "writeFile">,
  input: {
    expectedRawSource: string | null;
    path: string;
    rawSource: string;
    saveType: NotesSaveType;
  },
): Promise<SaveNoteToVaultResult> {
  const isMarkdown = getFormatDescriptor(input.path).id === "markdown";
  const normalizedSource = isMarkdown
    ? repairSplitSurrogateEntities(normalizeCjkSpacing(input.rawSource))
    : input.rawSource;
  const saveToken = registerPendingNoteSave(input.path, normalizedSource);

  try {
    const result = await safeWriteVaultFile(client, {
      expectedRawSource: input.expectedRawSource,
      nextRawSource: normalizedSource,
      path: input.path,
    });

    if (result.status === "conflict") {
      clearPendingNoteSave(input.path, saveToken);
      return {
        currentRawSource: result.currentRawSource,
        normalizedSource,
        status: "conflict",
      };
    }

    globalThis.setTimeout(() => {
      clearPendingNoteSave(input.path, saveToken);
    }, PENDING_SAVE_CLEAR_DELAY_MS);

    return {
      normalizedSource,
      status: result.status,
    };
  } catch (error) {
    clearPendingNoteSave(input.path, saveToken);
    throw error;
  }
}
