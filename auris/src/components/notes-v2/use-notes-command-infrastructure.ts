"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  NotesCommandBus,
  type NotesCommandContext,
  type NotesCommandSurface,
} from "@/features/notes/commands/notes-command-bus";
import { createDefaultNotesShortcutRegistry } from "@/features/notes/commands/notes-command-catalog";
import { shortcutFromKeyboardEvent } from "@/features/notes/commands/notes-shortcut-registry";
import {
  loadNotesShortcutOverrides,
  NOTES_SHORTCUTS_EVENT,
} from "@/features/notes/commands/notes-shortcut-settings";
import type { NotesEditorMode } from "@/features/notes/editor/editor-types";

type CommandInfrastructureInput = {
  editorMode: NotesEditorMode;
  hasActiveDocument: boolean;
  onOpenBrowser?: () => void;
  onOpenNiaPicker?: () => void;
  onOpenPalette?: () => void;
  onSave?: () => void;
  onSaveAll?: () => void;
  onSetEditorMode?: (mode: NotesEditorMode) => void;
  onToggleTerminal?: () => void;
};

function getActiveSurface(target: EventTarget | null): NotesCommandSurface {
  if (!(target instanceof Element)) {
    return "global";
  }
  if (target.closest(".xterm")) {
    return "terminal";
  }
  if (target.closest(".ProseMirror")) {
    return "prosemirror";
  }
  if (target.closest(".cm-editor")) {
    return "codemirror";
  }
  return "global";
}

export function useNotesCommandInfrastructure(
  input: CommandInfrastructureInput,
) {
  const inputRef = useRef(input);
  const bus = useMemo(() => new NotesCommandBus(), []);
  const [shortcutOverrides, setShortcutOverrides] = useState(() =>
    loadNotesShortcutOverrides(),
  );
  const shortcuts = useMemo(
    () =>
      createDefaultNotesShortcutRegistry(shortcutOverrides),
    [shortcutOverrides],
  );
  const [commands, setCommands] = useState(() => bus.list());

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    const refresh = () =>
      setShortcutOverrides(loadNotesShortcutOverrides());

    window.addEventListener(NOTES_SHORTCUTS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NOTES_SHORTCUTS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const unregister = [
      bus.register({
        handler: () => inputRef.current.onSave?.(),
        id: "notes.save",
        title: "Save note",
      }),
      bus.register({
        handler: () => inputRef.current.onSaveAll?.(),
        id: "notes.saveAll",
        title: "Save all notes",
      }),
      bus.register({
        handler: () => inputRef.current.onOpenPalette?.(),
        id: "notes.palette",
        title: "Open command palette",
      }),
      bus.register({
        handler: () =>
          inputRef.current.onSetEditorMode?.(
            inputRef.current.editorMode === "source" ? "wysiwyg" : "source",
          ),
        id: "notes.source",
        title: "Toggle Markdown source",
      }),
      bus.register({
        handler: () =>
          inputRef.current.onSetEditorMode?.(
            inputRef.current.editorMode === "split" ? "wysiwyg" : "split",
          ),
        id: "notes.split",
        title: "Toggle Markdown split",
      }),
      bus.register({
        handler: () => inputRef.current.onToggleTerminal?.(),
        id: "notes.terminal",
        title: "Toggle terminal",
      }),
      bus.register({
        handler: () => inputRef.current.onOpenBrowser?.(),
        id: "notes.browser",
        title: "Open embedded browser",
      }),
      bus.register({
        handler: () => inputRef.current.onOpenNiaPicker?.(),
        id: "notes.niaPicker",
        title: "Open Nia actions",
      }),
    ];
    setCommands(bus.list());
    return () => unregister.forEach((dispose) => dispose());
  }, [bus]);

  useEffect(() => {
    const contextFor = (surface: NotesCommandSurface): NotesCommandContext => ({
      activeSurface: surface,
      editorMode: inputRef.current.editorMode,
      hasActiveDocument: inputRef.current.hasActiveDocument,
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const surface = getActiveSurface(event.target);
      const binding =
        shortcuts.find(shortcutFromKeyboardEvent(event), contextFor(surface)) ??
        shortcuts.find(shortcutFromKeyboardEvent(event), contextFor("global"));
      if (!binding || !bus.has(binding.commandId)) {
        return;
      }
      event.preventDefault();
      void bus.execute(binding.commandId, contextFor(surface));
    };
    const unsubscribeMenu = window.shadowingDesktop?.menu?.onCommand?.(
      (commandId) => {
        void bus.execute(commandId, contextFor("global"));
      },
    );

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribeMenu?.();
    };
  }, [bus, shortcuts]);

  return {
    bus,
    commands,
    conflicts: shortcuts.getConflicts({
      activeSurface: "global",
      editorMode: input.editorMode,
      hasActiveDocument: input.hasActiveDocument,
    }),
    shortcuts,
  };
}
