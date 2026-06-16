import { describe, expect, it } from "vitest";
import {
  cleanupTransientDocuments,
  isTransientResumeStoragePath,
  retentionCutoff,
} from "./retention.js";

type Row = Record<string, unknown>;

function fakeClient() {
  const state = {
    documents: [
      {
        id: "doc_unref",
        user_id: "user_1",
        type: "tailored_resume",
        job_id: "job_1",
        storage_path: "user_1/tailored/old.pdf",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "doc_ref",
        user_id: "user_1",
        type: "tailored_resume",
        job_id: "job_2",
        storage_path: "user_1/tailored/ref.pdf",
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "doc_new",
        user_id: "user_1",
        type: "tailored_resume",
        job_id: "job_3",
        storage_path: "user_1/tailored/new.pdf",
        created_at: "2026-06-14T00:00:00.000Z",
      },
      {
        id: "doc_base",
        user_id: "user_1",
        type: "base_resume",
        job_id: null,
        storage_path: "user_1/base/base.pdf",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ] as Row[],
    applications: [
      {
        id: "app_1",
        resume_doc_id: "doc_ref",
        cover_letter_doc_id: null,
        rendered_pdf_path: "user_1/tailored/pinned.pdf",
      },
    ] as Row[],
    resume_base_versions: [{ id: "base_1", storage_path: "user_1/base/base.pdf" }] as Row[],
    removed: [] as string[],
  };

  class Query {
    private selected = "";
    private deleting = false;
    private filters: Array<{ column: string; values: unknown[] }> = [];
    private ltFilter: { column: string; value: string } | null = null;
    private limitValue = Infinity;

    constructor(private table: keyof typeof state) {}

    select(value: string) {
      this.selected = value;
      return this;
    }

    delete() {
      this.deleting = true;
      return this;
    }

    in(column: string, values: unknown[]) {
      this.filters.push({ column, values });
      return this;
    }

    lt(column: string, value: string) {
      this.ltFilter = { column, value };
      return this;
    }

    order() {
      return this;
    }

    limit(value: number) {
      this.limitValue = value;
      return this;
    }

    private execute() {
      if (this.deleting) {
        const idFilter = this.filters.find((filter) => filter.column === "id");
        const ids = new Set(idFilter?.values ?? []);
        state.documents = state.documents.filter((row) => !ids.has(row.id));
        return { data: null, error: null };
      }

      let rows = [...(state[this.table] as Row[])];
      for (const filter of this.filters) {
        const values = new Set(filter.values);
        rows = rows.filter((row) => values.has(row[filter.column]));
      }
      if (this.ltFilter) {
        rows = rows.filter((row) => String(row[this.ltFilter!.column] ?? "") < this.ltFilter!.value);
      }
      if (this.selected === "id,user_id,type,job_id,storage_path,created_at") {
        rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      }
      rows = rows.slice(0, this.limitValue);
      return { data: rows, error: null };
    }

    then(resolve: (value: { data: Row[] | null; error: null }) => void) {
      resolve(this.execute());
    }
  }

  return {
    state,
    client: {
      from(table: keyof typeof state) {
        return new Query(table);
      },
      storage: {
        from() {
          return {
            async list(prefix: string) {
              if (!prefix) return { data: [{ name: "user_1", id: null }], error: null };
              if (prefix === "user_1/tailored") {
                return {
                  data: [
                    { name: "old.pdf", id: "old", updated_at: "2026-05-01T00:00:00.000Z" },
                    { name: "orphan.pdf", id: "orphan", updated_at: "2026-05-01T00:00:00.000Z" },
                    { name: "pinned.pdf", id: "pinned", updated_at: "2026-05-01T00:00:00.000Z" },
                    { name: "new.pdf", id: "new", updated_at: "2026-06-14T00:00:00.000Z" },
                  ],
                  error: null,
                };
              }
              if (prefix === "user_1/base") {
                return {
                  data: [
                    { name: "base.pdf", id: "base", updated_at: "2026-05-01T00:00:00.000Z" },
                    { name: "abandoned.pdf", id: "abandoned", updated_at: "2026-05-01T00:00:00.000Z" },
                  ],
                  error: null,
                };
              }
              return { data: [], error: null };
            },
            async remove(paths: string[]) {
              state.removed.push(...paths);
              return { data: [], error: null };
            },
          };
        },
      },
    },
  };
}

describe("retention cleanup", () => {
  it("identifies transient resume storage paths", () => {
    expect(isTransientResumeStoragePath("user_1/tailored/job.pdf")).toBe(true);
    expect(isTransientResumeStoragePath("/user_1/transient/job.pdf")).toBe(true);
    expect(isTransientResumeStoragePath("user_1/base/base.pdf")).toBe(false);
  });

  it("computes the retention cutoff", () => {
    expect(retentionCutoff(new Date("2026-06-15T00:00:00.000Z"), 14).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("deletes stale unreferenced transient documents and storage only", async () => {
    const { client, state } = fakeClient();
    const summary = await cleanupTransientDocuments(client as never, {
      now: new Date("2026-06-15T00:00:00.000Z"),
      retentionDays: 14,
      documentBatch: 50,
      storageScanLimit: 50,
    });

    expect(summary.documentCandidates).toBe(2);
    expect(summary.documentRowsDeleted).toBe(1);
    expect(summary.skippedReferencedDocuments).toBe(1);
    expect(state.documents.map((row) => row.id)).toEqual(["doc_ref", "doc_new", "doc_base"]);
    expect(state.removed.sort()).toEqual([
      "user_1/base/abandoned.pdf",
      "user_1/tailored/old.pdf",
      "user_1/tailored/orphan.pdf",
    ]);
    expect(summary.skippedReferencedStorage).toBe(2);
  });
});
