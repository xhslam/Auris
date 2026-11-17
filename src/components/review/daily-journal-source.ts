import type { DesktopBridge } from "@/platform/desktop/desktop-bridge";

type JournalVault = DesktopBridge["vault"];

export async function getDailyJournalPrefix(vault: JournalVault) {
  const directory = await vault.getDirectoryInfo();
  if (!directory.hasVault) return null;
  return directory.directoryName?.toLowerCase() === "daily" ? "" : "daily/";
}

export async function countDailyJournalDays(vault: JournalVault, today: string) {
  const prefix = await getDailyJournalPrefix(vault);
  if (prefix === null) return 0;

  const days = new Set<string>();
  for (const file of await vault.listFiles()) {
    if (file.isDirectory || file.size === 0 || !file.relativePath.startsWith(prefix)) continue;
    const date = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(file.relativePath.slice(prefix.length))?.[1];
    if (!date || date > today) continue;
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date) {
      days.add(date);
    }
  }
  return days.size;
}
