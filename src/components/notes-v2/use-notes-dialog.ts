"use client";

import { useCallback, useState, createElement } from "react";
import type { JSX } from "react";
import { NotesInputDialog, NotesConfirmDialog } from "@/components/notes-v2/notes-input-dialog";

type InputDialogState = {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
};

type ConfirmDialogState = {
  message: string;
  confirmLabel?: string;
  resolve: (confirmed: boolean) => void;
};

export type NotesDialogHandles = {
  promptFn: (title: string, defaultValue?: string, placeholder?: string) => Promise<string | null>;
  confirmFn: (message: string, confirmLabel?: string) => Promise<boolean>;
  renderDialogs: () => JSX.Element | null;
};

export function useNotesDialog(): NotesDialogHandles {
  const [inputState, setInputState] = useState<InputDialogState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  const promptFn = useCallback(
    (title: string, defaultValue = "", placeholder = ""): Promise<string | null> => {
      return new Promise((resolve) => {
        setInputState({ title, defaultValue, placeholder, resolve });
      });
    },
    [],
  );

  const confirmFn = useCallback(
    (message: string, confirmLabel?: string): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmState({ message, confirmLabel, resolve });
      });
    },
    [],
  );

  const renderDialogs = useCallback((): JSX.Element | null => {
    if (inputState) {
      return createElement(NotesInputDialog, {
        title: inputState.title,
        placeholder: inputState.placeholder,
        defaultValue: inputState.defaultValue,
        confirmLabel: inputState.confirmLabel,
        onConfirm: (value: string) => {
          setInputState(null);
          inputState.resolve(value);
        },
        onCancel: () => {
          setInputState(null);
          inputState.resolve(null);
        },
      });
    }

    if (confirmState) {
      return createElement(NotesConfirmDialog, {
        message: confirmState.message,
        confirmLabel: confirmState.confirmLabel,
        onConfirm: () => {
          setConfirmState(null);
          confirmState.resolve(true);
        },
        onCancel: () => {
          setConfirmState(null);
          confirmState.resolve(false);
        },
      });
    }

    return null;
  }, [inputState, confirmState]);

  return { promptFn, confirmFn, renderDialogs };
}
