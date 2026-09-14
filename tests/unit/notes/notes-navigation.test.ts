import { afterEach, describe, expect, it } from "vitest";
import {
  createNotesFolderNavigateEvent,
  getInitialNotesLocation,
  isNotesFolderNavigateEvent,
  NOTES_LANDING_VISITED_SESSION_KEY,
  writeLastNotesFolder,
} from "@/components/notes-v2/notes-navigation";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("Notes root and folder navigation", () => {
  it("keeps the first Notes entry in the landing state even when a folder was used before", () => {
    expect(getInitialNotesLocation({ hasResumeNote: false })).toEqual({
      type: "landing",
    });
  });

  it("returns to the last active folder only after the landing has been visited in this session", () => {
    writeLastNotesFolder({
      id: "study",
      name: "Study",
      path: "/vaults/study",
    });
    window.sessionStorage.setItem(NOTES_LANDING_VISITED_SESSION_KEY, "true");

    expect(getInitialNotesLocation({ hasResumeNote: false })).toEqual({
      type: "folder",
      folder: {
        id: "study",
        name: "Study",
        path: "/vaults/study",
      },
    });
  });

  it("uses a typed event payload for direct sidebar folder navigation", () => {
    const event = createNotesFolderNavigateEvent({
      id: "study",
      name: "Study",
      path: "/vaults/study",
    });

    expect(isNotesFolderNavigateEvent(event)).toBe(true);
    expect(event.detail.folder.name).toBe("Study");
    expect(isNotesFolderNavigateEvent(new Event("plain"))).toBe(false);
  });
});
