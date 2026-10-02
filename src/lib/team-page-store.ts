import type { TeamProfileRow, Transition } from "./team-page";

export interface LoadedTeamProfile {
  row: TeamProfileRow;
  updatedAt: string;
}

export interface TeamProfileStore {
  insert(profileId: string, row: TeamProfileRow): Promise<{ error?: string }>;
  /** Writes only if the row's updated_at still equals `expectedUpdatedAt`; `matched` is false when it changed underneath us. */
  updateIfUnchanged(
    profileId: string,
    row: TeamProfileRow,
    expectedUpdatedAt: string,
  ): Promise<{ error?: string; matched: boolean }>;
  removePhotos(paths: string[]): Promise<void>;
}

export const CONFLICT_ERROR = "This profile was just changed by someone else. Refresh and try again.";

/**
 * Persists a transition computed from `before`. The write is guarded by the
 * loaded updated_at so two concurrent actions can't both act on stale state;
 * storage objects are deleted only after the write succeeded.
 */
export async function commitTransition(
  store: TeamProfileStore,
  profileId: string,
  before: LoadedTeamProfile | null,
  t: Transition,
): Promise<string | undefined> {
  if (before) {
    const res = await store.updateIfUnchanged(profileId, t.row, before.updatedAt);
    if (res.error) return res.error;
    if (!res.matched) return CONFLICT_ERROR;
  } else {
    const res = await store.insert(profileId, t.row);
    if (res.error) return res.error;
  }
  if (t.deletePaths.length > 0) await store.removePhotos(t.deletePaths);
  return undefined;
}
