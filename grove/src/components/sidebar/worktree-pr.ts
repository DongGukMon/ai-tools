import { useEffect } from "react";
import { create } from "zustand";
import { runCommandSafely } from "../../lib/command";
import { getWorktreePrUrl } from "../../lib/platform";

const WORKTREE_PR_CACHE_TTL_MS = 60_000;

export interface WorktreePrLookupInput {
  projectOrg: string;
  projectRepo: string;
  worktreeBranch: string;
  worktreePath: string;
}

interface WorktreePrEntry {
  loading: boolean;
  url: string | null;
  fetchedAt: number | null;
}

interface WorktreePrState {
  entries: Record<string, WorktreePrEntry>;
  ensureWorktreePrUrl: (key: string, worktreePath: string) => Promise<void>;
}

const EMPTY_ENTRY: WorktreePrEntry = {
  loading: false,
  url: null,
  fetchedAt: null,
};

const inflightRequests = new Map<string, Promise<void>>();

function isEntryFresh(entry: WorktreePrEntry | undefined): boolean {
  return (
    entry != null &&
    entry.fetchedAt != null &&
    Date.now() - entry.fetchedAt < WORKTREE_PR_CACHE_TTL_MS
  );
}

export function createWorktreePrLookupKey(
  projectOrg: string,
  projectRepo: string,
  worktreeBranch: string,
): string | null {
  const org = projectOrg.trim();
  const repo = projectRepo.trim();
  const branch = worktreeBranch.trim();

  if (!org || !repo || !branch) {
    return null;
  }

  return `${org}/${repo}:${branch}`;
}

export function selectWorktreePrEntry(
  state: WorktreePrState,
  key: string | null,
): WorktreePrEntry {
  if (!key) {
    return EMPTY_ENTRY;
  }

  return state.entries[key] ?? EMPTY_ENTRY;
}

export const useWorktreePrStore = create<WorktreePrState>((set, get) => ({
  entries: {},
  ensureWorktreePrUrl: async (key, worktreePath) => {
    const cachedEntry = get().entries[key];
    if (isEntryFresh(cachedEntry)) {
      return;
    }

    const existingRequest = inflightRequests.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          loading: true,
          url: cachedEntry?.url ?? null,
          fetchedAt: cachedEntry?.fetchedAt ?? null,
        },
      },
    }));

    const request = (async () => {
      const url = await runCommandSafely(
        () => getWorktreePrUrl(worktreePath),
        { errorToast: false },
      );

      set((state) => ({
        entries: {
          ...state.entries,
          [key]: {
            loading: false,
            url,
            fetchedAt: Date.now(),
          },
        },
      }));
    })().finally(() => {
      inflightRequests.delete(key);
    });

    inflightRequests.set(key, request);
    return request;
  },
}));

export function resetWorktreePrLookupState(): void {
  inflightRequests.clear();
  useWorktreePrStore.setState({ entries: {} });
}

export function useWorktreePrUrl(input: WorktreePrLookupInput) {
  const key = createWorktreePrLookupKey(
    input.projectOrg,
    input.projectRepo,
    input.worktreeBranch,
  );
  const entry = useWorktreePrStore((state) => selectWorktreePrEntry(state, key));

  useEffect(() => {
    if (!key) {
      return;
    }

    void useWorktreePrStore.getState().ensureWorktreePrUrl(key, input.worktreePath);
  }, [input.worktreePath, key]);

  return {
    isLoading: entry.loading,
    url: entry.url,
  };
}
