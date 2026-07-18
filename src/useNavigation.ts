import React, { useState, useEffect, useCallback, useRef } from 'react';
/**
 * useNavigation — Simple & Predictable Back-Button Navigation
 * -----------------------------------------------------------
 * Logic:
 *   • Back while modal/detail is open  → close modal, stay on current tab
 *   • Back while on any tab (not dashboard) → go to dashboard
 *   • Back while on dashboard → do nothing (prevent app exit)
 *
 * Uses the History API with a two-entry stack:
 *   Entry 0: always "dashboard" (the anchor, never popped)
 *   Entry 1: current tab (pushed on every tab change)
 *
 * Modals do NOT push history — they are managed purely in React state.
 * The popstate handler decides what to do based on current React state.
 */


// ─── Types ──────────────────────────────────────────────────────────────────

export type TabName =
  | 'dashboard'
  | 'cases'
  | 'clients'
  | 'calendar'
  | 'fees'
  | 'reminders'
  | 'team'
  | 'documents'
  | 'admin';

export type ModalName =
  | 'search'
  | 'ai'
  | 'settings'
  | 'newCase'
  | 'newClient'
  | 'newLawyer'
  | 'newSession'
  | 'caseDetail'
  | 'clientDetail'
  | 'delete';

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_TABS: TabName[] = [
  'dashboard', 'cases', 'clients', 'calendar',
  'fees', 'reminders', 'team', 'documents', 'admin',
];

const TAB_PATHS: Record<TabName, string> = {
  dashboard:  '/',
  cases:      '/cases',
  clients:    '/clients',
  calendar:   '/calendar',
  fees:       '/fees',
  reminders:  '/reminders',
  team:       '/team',
  documents:  '/documents',
  admin:      '/admin',
};

const PATH_TABS: Record<string, TabName> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]: [string, string]) => [path, tab as TabName])
);

const LS_TAB_KEY = 'nasser_nav_tab';

// ─── Helpers ────────────────────────────────────────────────────────────────

function tabFromUrl(): TabName | null {
  return PATH_TABS[window.location.pathname] ?? null;
}

function tabFromStorage(): TabName | null {
  const saved = localStorage.getItem(LS_TAB_KEY);
  if (saved && VALID_TABS.includes(saved as TabName)) return saved as TabName;
  return null;
}

function resolveInitialTab(): TabName {
  return tabFromUrl() ?? tabFromStorage() ?? 'dashboard';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NavigationState {
  tab: TabName;
  activeModal: ModalName | null;
  showExitConfirm: boolean;
  confirmExit:   () => void;
  cancelExit:    () => void;
  navigateTo:    (tab: TabName) => void;
  openModal:     (modal: ModalName) => void;
  closeModal:    (modal: ModalName) => void;
  closeAllModals: () => void;
  isOpen:        (modal: ModalName) => boolean;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useNavigation(): NavigationState {
  const initialTab = resolveInitialTab();

  const [tab, setTabState]       = useState<TabName>(initialTab);
  const [activeModal, setModal]  = useState<ModalName | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Refs for use inside event handlers (avoid stale closures)
  const tabRef         = useRef<TabName>(initialTab);
  const activeModalRef = useRef<ModalName | null>(null);
  const exitingRef     = useRef(false);

  // Keep refs in sync
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { activeModalRef.current = activeModal; }, [activeModal]);

  // ── Bootstrap ────────────────────────────────────────────────────────
  // Set up a two-entry history stack:
  //   [0] dashboard anchor  (replaceState — always the floor)
  //   [1] current tab       (pushState — only if not dashboard)
  useEffect(() => {
    const initial = resolveInitialTab();
    setTabState(initial);
    tabRef.current = initial;
    localStorage.setItem(LS_TAB_KEY, initial);

    // Entry 0: the dashboard anchor
    window.history.replaceState({ type: 'anchor' }, '', '/');

    // Entry 1: current tab (only if not dashboard)
    if (initial !== 'dashboard') {
      window.history.pushState(
        { type: 'tab', tab: initial },
        '',
        TAB_PATHS[initial]
      );
    }
  }, []);

  // ── popstate handler ─────────────────────────────────────────────────
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const currentModal = activeModalRef.current;
      const currentTab   = tabRef.current;

      // ── Case 1: a modal is open → close it, stay on current tab ──
      if (currentModal) {
        setModal(null);
        activeModalRef.current = null;
        // Re-push the current tab entry so the stack stays intact
        window.history.pushState(
          { type: 'tab', tab: currentTab },
          '',
          TAB_PATHS[currentTab]
        );
        return;
      }

      const state = e.state as { type: string; tab?: TabName } | null;

      // ── Case 2: popped to the anchor (state.type === 'anchor') ──
      if (!state || state.type === 'anchor') {
        if (currentTab !== 'dashboard') {
          // Go to dashboard
          setTabState('dashboard');
          tabRef.current = 'dashboard';
          setModal(null);
          activeModalRef.current = null;
          localStorage.setItem(LS_TAB_KEY, 'dashboard');
          window.history.replaceState({ type: 'anchor' }, '', '/');
        } else {
          // Already on dashboard → show exit confirm dialog
          if (exitingRef.current) { exitingRef.current = false; return; }
          setShowExitConfirm(true);
        }
        return;
      }

      // ── Case 3: popped to a tab entry ──
      // This happens on forward navigation or multi-step back — sync state
      if (state.type === 'tab' && state.tab) {
        setTabState(state.tab);
        tabRef.current = state.tab;
        setModal(null);
        activeModalRef.current = null;
        localStorage.setItem(LS_TAB_KEY, state.tab);
      }
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── navigateTo ───────────────────────────────────────────────────────
  const navigateTo = useCallback((newTab: TabName) => {
    const currentTab   = tabRef.current;
    const currentModal = activeModalRef.current;

    if (newTab === currentTab && !currentModal) return; // no-op

    // Close any open modal silently
    if (currentModal) {
      setModal(null);
      activeModalRef.current = null;
    }

    setTabState(newTab);
    tabRef.current = newTab;
    localStorage.setItem(LS_TAB_KEY, newTab);

    if (newTab === 'dashboard') {
      // Going to dashboard → restore anchor, no extra entry
      window.history.replaceState({ type: 'anchor' }, '', '/');
    } else {
      // Push new tab on top of anchor
      // First ensure anchor is at bottom of our two-entry stack
      // by replacing current and pushing new, or just pushing new
      window.history.pushState(
        { type: 'tab', tab: newTab },
        '',
        TAB_PATHS[newTab]
      );
    }
  }, []);

  // ── openModal / closeModal ────────────────────────────────────────────
  // Modals are PURE React state — no history push.
  // Back button is intercepted in popstate before it pops anything.
  const openModal = useCallback((modal: ModalName) => {
    if (activeModalRef.current === modal) return;
    setModal(modal);
    activeModalRef.current = modal;
  }, []);

  const closeModal = useCallback((modal: ModalName) => {
    if (activeModalRef.current !== modal) return;
    setModal(null);
    activeModalRef.current = null;
  }, []);

  const closeAllModals = useCallback(() => {
    setModal(null);
    activeModalRef.current = null;
  }, []);

  const isOpen = useCallback(
    (modal: ModalName) => activeModal === modal,
    [activeModal]
  );

  // ── Exit confirm ─────────────────────────────────────────────────────
  const confirmExit = useCallback(() => {
    setShowExitConfirm(false);
    exitingRef.current = true;
    // Actually exit — go back past our anchor
    window.history.back();
    // Reset flag after short delay in case browser blocks exit (e.g. Android Chrome)
    setTimeout(() => { exitingRef.current = false; }, 500);
  }, []);

  const cancelExit = useCallback(() => {
    setShowExitConfirm(false);
    // Re-anchor so we can catch the next back press
    window.history.replaceState({ type: 'anchor' }, '', '/');
  }, []);

  return { tab, activeModal, showExitConfirm, confirmExit, cancelExit, navigateTo, openModal, closeModal, closeAllModals, isOpen };
}
