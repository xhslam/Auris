"use client";
import { create } from "zustand";
import {
  createNiaContextCard,
  upsertNiaContextCard,
  type NiaContextCard,
  type NiaContextCardOrigin,
} from "@/features/nia/nia-context-card";
import type { NiaContext } from "@/features/nia/nia-context";

export type NiaStandaloneOrigin = NiaContextCardOrigin;
export type NiaStandaloneLaunch = Readonly<{
  browserTarget?: Readonly<{ windowId: string; tabId: string }> | null;
  context?: NiaContext | null;
  origin?: NiaStandaloneOrigin;
}>;

type NiaStandaloneState = Readonly<{
  activeContextCardId: string | null;
  browserTarget: Readonly<{ windowId: string; tabId: string }> | null;
  context: NiaContext | null;
  contextCards: readonly NiaContextCard[];
  contextToken: number;
  isOpen: boolean;
  origin: NiaStandaloneOrigin;
}>;
type NiaStandaloneActions = Readonly<{
  clearContext: () => void;
  close: () => void;
  open: (launch?: NiaStandaloneLaunch) => void;
  removeContextCard: (cardId: string) => void;
  selectContextCard: (cardId: string) => void;
  toggle: () => void;
}>;
const initialState: NiaStandaloneState = {
  activeContextCardId: null,
  browserTarget: null,
  context: null,
  contextCards: [],
  contextToken: 0,
  isOpen: false,
  origin: "home",
};

function resolveActive(cards: readonly NiaContextCard[], cardId: string | null) {
  return cards.find((card) => card.id === cardId) ?? cards.at(-1) ?? null;
}

export const useNiaStandaloneStore = create<NiaStandaloneState & NiaStandaloneActions>()((set, get) => ({
  ...initialState,
  clearContext: () => set((state) => ({
    activeContextCardId: null,
    browserTarget: null,
    context: null,
    contextCards: [],
    contextToken: state.contextToken + 1,
  })),
  close: () => set({ isOpen: false }),
  open: (launch = {}) => set((state) => {
    const origin = launch.origin ?? "home";
    if (!launch.context) {
      return {
        activeContextCardId: null,
        browserTarget: launch.browserTarget ?? null,
        context: null,
        contextCards: [],
        contextToken: state.contextToken + 1,
        isOpen: true,
        origin,
      };
    }
    const card = createNiaContextCard({ context: launch.context, origin });
    const contextCards = upsertNiaContextCard(state.contextCards, card);
    return {
      activeContextCardId: card.id,
      browserTarget: launch.browserTarget ?? state.browserTarget,
      context: card.context,
      contextCards,
      contextToken: state.contextToken + 1,
      isOpen: true,
      origin,
    };
  }),
  removeContextCard: (cardId) => set((state) => {
    const contextCards = state.contextCards.filter((card) => card.id !== cardId);
    const active = resolveActive(contextCards, state.activeContextCardId === cardId ? null : state.activeContextCardId);
    return {
      activeContextCardId: active?.id ?? null,
      browserTarget: active?.kind === "browser" ? state.browserTarget : null,
      context: active?.context ?? null,
      contextCards,
      contextToken: state.contextToken + 1,
      origin: active?.origin ?? state.origin,
    };
  }),
  selectContextCard: (cardId) => set((state) => {
    const active = state.contextCards.find((card) => card.id === cardId);
    if (!active) return state;
    return {
      activeContextCardId: active.id,
      context: active.context,
      contextToken: state.contextToken + 1,
      origin: active.origin,
    };
  }),
  toggle: () => {
    const state = get();
    set({ isOpen: !state.isOpen });
  },
}));

/** 仅供测试重置。 */
export function __resetNiaStandaloneStoreForTests() {
  useNiaStandaloneStore.setState(initialState);
}
