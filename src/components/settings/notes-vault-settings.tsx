"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DesktopVaultFileRecord,
  DesktopVaultRoot,
} from "@/platform/desktop/desktop-bridge";
import styles from "@/components/settings/notes-vault-settings.module.css";

type BusyOperation = "add" | "create-file" | "create-folder" | "delete-entry" | "remove-root" | "trash-root" | "switch-root" | null;

function normalizeRelativePath(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }

  return normalized;
}

function fileLabel(entry: DesktopVaultFileRecord): string {
  return entry.isDirectory ? "Folder" : "File";
}

export function NotesVaultSettings() {
  const vault = useMemo(() => {
    if (typeof window === "undefined") return null;
    const candidate = window.shadowingDesktop?.vault;
    return candidate && typeof candidate.listRoots === "function" && typeof candidate.listFiles === "function"
      ? candidate
      : null;
  }, []);
  const [roots, setRoots] = useState<DesktopVaultRoot[]>([]);
  const [entries, setEntries] = useState<DesktopVaultFileRecord[]>([]);
  const [createPath, setCreatePath] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<BusyOperation>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vault?.listRoots || !vault.listFiles) return;

    try {
      const [nextRoots, nextEntries] = await Promise.all([
        vault.listRoots(),
        vault.listFiles(),
      ]);
      setRoots(nextRoots);
      setEntries(
        [...nextEntries].sort((left, right) => {
          if (Boolean(left.isDirectory) !== Boolean(right.isDirectory)) {
            return left.isDirectory ? -1 : 1;
          }
          return left.relativePath.localeCompare(right.relativePath, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Vault settings.");
    }
  }, [vault]);

  useEffect(() => {
    void refresh();
    if (!vault?.onDidChange) return undefined;
    return vault.onDidChange(() => {
      void refresh();
    });
  }, [refresh, vault]);

  const run = useCallback(
    async (operation: Exclude<BusyOperation, null>, action: () => Promise<void>) => {
      setBusy(operation);
      setError(null);
      setMessage(null);
      try {
        await action();
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Vault action failed.");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const createEntry = useCallback(
    (kind: "file" | "folder") => {
      const relativePath = normalizeRelativePath(createPath);
      if (!relativePath) {
        setError("Enter a relative path inside the active Vault. Paths cannot be empty or escape the Vault.");
        return;
      }
      if (!vault) return;

      if (kind === "file") {
        const filePath = /\.[^/]+$/.test(relativePath)
          ? relativePath
          : `${relativePath}.md`;
        void run("create-file", async () => {
          await vault.saveFile(filePath, "");
          setCreatePath("");
          setMessage(`Created ${filePath}.`);
        });
        return;
      }

      if (!vault.createDirectory) {
        setError("This desktop version does not support folder creation yet.");
        return;
      }
      void run("create-folder", async () => {
        await vault.createDirectory?.(relativePath);
        setCreatePath("");
        setMessage(`Created ${relativePath}.`);
      });
    },
    [createPath, run, vault],
  );

  const deleteEntry = useCallback(
    (entry: DesktopVaultFileRecord) => {
      if (!vault) return;
      const confirmed = window.confirm(
        `Move ${entry.isDirectory ? "folder" : "file"} “${entry.relativePath}” to the Auris Trash?`,
      );
      if (!confirmed) return;
      void run("delete-entry", async () => {
        await vault.removeFile(entry.relativePath);
        setMessage(`Moved ${entry.relativePath} to the Auris Trash.`);
      });
    },
    [run, vault],
  );

  const removeRoot = useCallback(
    (root: DesktopVaultRoot) => {
      if (!vault?.removeRoot) {
        setError("This desktop version does not support removing Vaults from the list yet.");
        return;
      }
      const confirmed = window.confirm(
        `Remove “${root.name}” from Auris? Its folder and files will remain on your computer.`,
      );
      if (!confirmed) return;
      void run("remove-root", async () => {
        await vault.removeRoot?.(root.path);
        setMessage(`Removed ${root.name} from the Vault list.`);
      });
    },
    [run, vault],
  );

  const trashRoot = useCallback(
    (root: DesktopVaultRoot) => {
      if (!vault?.trashRoot) {
        setError("This desktop version does not support moving an entire Vault to the system Trash yet.");
        return;
      }
      const confirmed = window.confirm(
        `Move the entire Vault folder “${root.name}” and all of its contents to the system Trash? This also removes it from Auris.`,
      );
      if (!confirmed) return;
      void run("trash-root", async () => {
        await vault.trashRoot?.(root.path);
        setMessage(`Moved ${root.name} to the system Trash.`);
      });
    },
    [run, vault],
  );

  const filteredEntries = entries.filter((entry) =>
    entry.relativePath.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  );

  if (!vault?.listRoots || !vault.listFiles) {
    return (
      <div className={styles.unavailable} role="status">
        Vault management is available in the Auris desktop app.
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="notes-vaults-heading">
        <div className={styles.headingRow}>
          <div>
            <h2 id="notes-vaults-heading" className={styles.heading}>Vaults</h2>
            <p className={styles.help}>Add a folder, switch Vaults, remove an entry from Auris, or move an entire Vault folder to the system Trash.</p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy !== null}
            onClick={() => {
              void run("add", async () => {
                await vault.pickDirectory();
                setMessage("Vault selection updated.");
              });
            }}
          >
            {busy === "add" ? "Adding…" : "Add Vault"}
          </button>
        </div>

        <div className={styles.rootList}>
          {roots.length === 0 ? (
            <p className={styles.empty}>No Vault folders have been added yet.</p>
          ) : (
            roots.map((root) => (
              <article key={root.path} className={styles.rootCard} data-active={root.isActive ? "true" : "false"}>
                <div className={styles.rootSummary}>
                  <div className={styles.rootNameRow}>
                    <strong>{root.name}</strong>
                    {root.isActive ? <span className={styles.activePill}>Active</span> : null}
                    {!root.available ? <span className={styles.unavailablePill}>Unavailable</span> : null}
                  </div>
                  <code className={styles.path}>{root.path}</code>
                </div>
                <div className={styles.actions}>
                  {!root.isActive ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={!root.available || busy !== null}
                      onClick={() => {
                        if (!vault.setRoot) return;
                        void run("switch-root", async () => {
                          await vault.setRoot?.(root.path);
                          setMessage(`Switched to ${root.name}.`);
                        });
                      }}
                    >
                      Open
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy !== null}
                    onClick={() => removeRoot(root)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={busy !== null || !root.available}
                    onClick={() => trashRoot(root)}
                  >
                    Delete Folder
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="notes-vault-files-heading">
        <div>
          <h2 id="notes-vault-files-heading" className={styles.heading}>Active Vault contents</h2>
          <p className={styles.help}>Create a Markdown file or folder in the active Vault. Deleting an item moves it to the Auris Trash.</p>
        </div>
        <div className={styles.createRow}>
          <label className={styles.srOnly} htmlFor="notes-vault-new-path">New file or folder path</label>
          <input
            id="notes-vault-new-path"
            className={styles.input}
            value={createPath}
            onChange={(event) => setCreatePath(event.target.value)}
            placeholder="e.g. daily/2026-08-22 or projects/plan.md"
          />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy !== null}
            onClick={() => createEntry("file")}
          >
            {busy === "create-file" ? "Creating…" : "New File"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy !== null}
            onClick={() => createEntry("folder")}
          >
            {busy === "create-folder" ? "Creating…" : "New Folder"}
          </button>
        </div>

        <div className={styles.filterRow}>
          <label className={styles.filterLabel} htmlFor="notes-vault-filter">Find an item</label>
          <input
            id="notes-vault-filter"
            className={styles.filterInput}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files and folders"
          />
          <span className={styles.count}>{filteredEntries.length} items</span>
        </div>

        <div className={styles.entryList} aria-live="polite">
          {filteredEntries.length === 0 ? (
            <p className={styles.empty}>{entries.length === 0 ? "The active Vault is empty." : "No items match this filter."}</p>
          ) : (
            filteredEntries.map((entry) => (
              <div key={entry.relativePath} className={styles.entry}>
                <div className={styles.entrySummary}>
                  <span className={styles.kind}>{fileLabel(entry)}</span>
                  <code className={styles.entryPath}>{entry.relativePath}</code>
                </div>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={busy !== null}
                  onClick={() => deleteEntry(entry)}
                >
                  {busy === "delete-entry" ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
