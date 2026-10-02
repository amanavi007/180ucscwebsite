import { describe, expect, it } from "vitest";
import { CONFLICT_ERROR, commitTransition, type TeamProfileStore } from "./team-page-store";
import type { TeamProfileRow, Transition } from "./team-page";

const row: TeamProfileRow = {
  bio: null,
  linkedin_url: null,
  major: null,
  photo_path: "u/new.jpg",
  listed: true,
  pending_bio: null,
  pending_linkedin_url: null,
  pending_major: null,
  pending_photo_path: null,
  pending_submitted_at: null,
};
const t: Transition = { row, deletePaths: ["u/old.jpg"] };

function fakeStore(over: Partial<TeamProfileStore> = {}) {
  const calls: string[] = [];
  const store: TeamProfileStore = {
    async insert() {
      calls.push("insert");
      return {};
    },
    async updateIfUnchanged(_id, _row, expected) {
      calls.push(`update:${expected}`);
      return { matched: true };
    },
    async removePhotos(paths) {
      calls.push(`remove:${paths.join(",")}`);
    },
    ...over,
  };
  return { store, calls };
}

describe("commitTransition", () => {
  it("updates guarded by the loaded updated_at, then deletes orphaned photos", async () => {
    const { store, calls } = fakeStore();
    const err = await commitTransition(store, "id", { row, updatedAt: "T1" }, t);
    expect(err).toBeUndefined();
    expect(calls).toEqual(["update:T1", "remove:u/old.jpg"]);
  });

  it("returns a conflict and deletes NOTHING when the row changed since it was loaded", async () => {
    const { store, calls } = fakeStore({
      async updateIfUnchanged() {
        return { matched: false };
      },
    });
    const err = await commitTransition(store, "id", { row, updatedAt: "T1" }, t);
    expect(err).toBe(CONFLICT_ERROR);
    expect(calls).toEqual([]);
  });

  it("inserts when there was no row, and a concurrent-create insert error leaves photos alone", async () => {
    const ok = fakeStore();
    expect(await commitTransition(ok.store, "id", null, t)).toBeUndefined();
    expect(ok.calls).toEqual(["insert", "remove:u/old.jpg"]);

    const dup = fakeStore({
      async insert() {
        return { error: "duplicate key" };
      },
    });
    expect(await commitTransition(dup.store, "id", null, t)).toBe("duplicate key");
    expect(dup.calls).toEqual([]);
  });

  it("surfaces a write error without deleting photos", async () => {
    const { store, calls } = fakeStore({
      async updateIfUnchanged() {
        return { error: "boom", matched: false };
      },
    });
    expect(await commitTransition(store, "id", { row, updatedAt: "T1" }, t)).toBe("boom");
    expect(calls).toEqual([]);
  });

  it("skips storage when there is nothing to delete", async () => {
    const { store, calls } = fakeStore();
    await commitTransition(store, "id", { row, updatedAt: "T1" }, { row, deletePaths: [] });
    expect(calls).toEqual(["update:T1"]);
  });
});
