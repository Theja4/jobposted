/* eslint-disable @typescript-eslint/no-explicit-any */

type Client = { from: (table: string) => any; storage: any };

type DocumentRow = {
  id: string;
  user_id: string | null;
  type: string | null;
  job_id: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type StorageObject = {
  name?: string | null;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: unknown;
};

export type RetentionCleanupOptions = {
  now?: Date;
  retentionDays?: number;
  documentBatch?: number;
  storageScanLimit?: number;
  storageUserLimit?: number;
  bucket?: string;
  log?: (message: string) => void;
};

export type RetentionCleanupSummary = {
  ok: true;
  cutoff: string;
  retentionDays: number;
  documentCandidates: number;
  documentRowsDeleted: number;
  storageCandidates: number;
  storageObjectsDeleted: number;
  storageDeleteErrors: number;
  skippedReferencedDocuments: number;
  skippedReferencedStorage: number;
};

const TRANSIENT_DOCUMENT_TYPES = ["tailored_resume", "cover_letter"] as const;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_DOCUMENT_BATCH = 500;
const DEFAULT_STORAGE_SCAN_LIMIT = 1_000;
const DEFAULT_STORAGE_USER_LIMIT = 1_000;
const MAX_BATCH = 5_000;
const REF_CHUNK = 100;

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value!)));
}

function dbErrorMessage(error: unknown) {
  if (!error) return "unknown";
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function retentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

export function isTransientResumeStoragePath(path: string) {
  const clean = path.replace(/^\/+/, "");
  return /^[^/]+\/(?:tailored|transient)\//.test(clean);
}

function isPrunableResumeStoragePath(path: string) {
  const clean = path.replace(/^\/+/, "");
  return /^[^/]+\/(?:tailored|transient|base)\//.test(clean);
}

function isFileObject(object: StorageObject) {
  return Boolean(object.name && object.id);
}

function objectUpdatedAt(object: StorageObject) {
  const value = object.updated_at ?? object.created_at ?? "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function storagePath(prefix: string, name: string) {
  return [prefix.replace(/^\/+|\/+$/g, ""), name.replace(/^\/+|\/+$/g, "")]
    .filter(Boolean)
    .join("/");
}

async function readOldTransientDocuments(client: Client, cutoffIso: string, batch: number) {
  const { data, error } = await client
    .from("documents")
    .select("id,user_id,type,job_id,storage_path,created_at")
    .in("type", [...TRANSIENT_DOCUMENT_TYPES])
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(batch);
  if (error) throw new Error(`document_retention_read_failed: ${dbErrorMessage(error)}`);
  return Array.isArray(data) ? (data as DocumentRow[]) : [];
}

async function readApplicationDocumentReferences(client: Client, docIds: string[]) {
  const referenced = new Set<string>();
  for (const part of chunks(docIds, REF_CHUNK)) {
    const [{ data: resumeRows, error: resumeError }, { data: coverRows, error: coverError }] =
      await Promise.all([
        client.from("applications").select("resume_doc_id").in("resume_doc_id", part),
        client.from("applications").select("cover_letter_doc_id").in("cover_letter_doc_id", part),
      ]);
    if (resumeError) throw new Error(`resume_doc_reference_read_failed: ${dbErrorMessage(resumeError)}`);
    if (coverError) throw new Error(`cover_doc_reference_read_failed: ${dbErrorMessage(coverError)}`);
    for (const row of Array.isArray(resumeRows) ? resumeRows : []) {
      const id = typeof row.resume_doc_id === "string" ? row.resume_doc_id : "";
      if (id) referenced.add(id);
    }
    for (const row of Array.isArray(coverRows) ? coverRows : []) {
      const id = typeof row.cover_letter_doc_id === "string" ? row.cover_letter_doc_id : "";
      if (id) referenced.add(id);
    }
  }
  return referenced;
}

async function readReferencedStoragePaths(client: Client, paths: string[]) {
  const referenced = new Set<string>();
  for (const part of chunks(paths, REF_CHUNK)) {
    const [
      { data: documentRows, error: documentError },
      { data: applicationRows, error: applicationError },
      { data: versionRows, error: versionError },
    ] = await Promise.all([
      client.from("documents").select("storage_path").in("storage_path", part),
      client.from("applications").select("rendered_pdf_path").in("rendered_pdf_path", part),
      client.from("resume_base_versions").select("storage_path").in("storage_path", part),
    ]);
    if (documentError) throw new Error(`document_storage_reference_read_failed: ${dbErrorMessage(documentError)}`);
    if (applicationError) throw new Error(`application_storage_reference_read_failed: ${dbErrorMessage(applicationError)}`);
    if (versionError) throw new Error(`resume_version_storage_reference_read_failed: ${dbErrorMessage(versionError)}`);

    for (const row of Array.isArray(documentRows) ? documentRows : []) {
      if (typeof row.storage_path === "string" && row.storage_path) referenced.add(row.storage_path);
    }
    for (const row of Array.isArray(applicationRows) ? applicationRows : []) {
      if (typeof row.rendered_pdf_path === "string" && row.rendered_pdf_path) referenced.add(row.rendered_pdf_path);
    }
    for (const row of Array.isArray(versionRows) ? versionRows : []) {
      if (typeof row.storage_path === "string" && row.storage_path) referenced.add(row.storage_path);
    }
  }
  return referenced;
}

async function deleteDocumentRows(client: Client, ids: string[]) {
  if (ids.length === 0) return 0;
  let deleted = 0;
  for (const part of chunks(ids, REF_CHUNK)) {
    const { error } = await client.from("documents").delete().in("id", part);
    if (error) throw new Error(`document_retention_delete_failed: ${dbErrorMessage(error)}`);
    deleted += part.length;
  }
  return deleted;
}

async function removeStorageObjects(client: Client, bucket: string, paths: string[]) {
  if (paths.length === 0) return { deleted: 0, errors: 0 };
  let deleted = 0;
  let errors = 0;
  for (const part of chunks(paths, REF_CHUNK)) {
    const { error } = await client.storage.from(bucket).remove(part);
    if (error) {
      errors += part.length;
    } else {
      deleted += part.length;
    }
  }
  return { deleted, errors };
}

async function listStaleTransientStorageObjects(args: {
  client: Client;
  bucket: string;
  cutoff: Date;
  maxFiles: number;
  maxUsers: number;
}) {
  const paths: string[] = [];
  const storage = args.client.storage.from(args.bucket);
  const { data: roots, error } = await storage.list("", {
    limit: args.maxUsers,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`storage_root_list_failed: ${dbErrorMessage(error)}`);

  for (const root of Array.isArray(roots) ? (roots as StorageObject[]) : []) {
    if (paths.length >= args.maxFiles) break;
    const userId = root.name?.trim();
    if (!userId) continue;
    const prefix = `${userId}/tailored`;
    let offset = 0;
    for (;;) {
      if (paths.length >= args.maxFiles) break;
      const limit = Math.min(100, args.maxFiles - paths.length);
      const { data, error: listError } = await storage.list(prefix, {
        limit,
        offset,
        sortBy: { column: "updated_at", order: "asc" },
      });
      if (listError) break;
      const items = Array.isArray(data) ? (data as StorageObject[]) : [];
      if (items.length === 0) break;
      for (const item of items) {
        if (!isFileObject(item)) continue;
        const path = storagePath(prefix, item.name!);
        if (!isTransientResumeStoragePath(path)) continue;
        if (objectUpdatedAt(item) && objectUpdatedAt(item) < args.cutoff.getTime()) paths.push(path);
        if (paths.length >= args.maxFiles) break;
      }
      if (items.length < limit) break;
      offset += items.length;
    }
  }
  return uniqueStrings(paths);
}

async function listStaleBaseStorageObjects(args: {
  client: Client;
  bucket: string;
  cutoff: Date;
  maxFiles: number;
  maxUsers: number;
}) {
  const paths: string[] = [];
  const storage = args.client.storage.from(args.bucket);
  const { data: roots, error } = await storage.list("", {
    limit: args.maxUsers,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`storage_root_list_failed: ${dbErrorMessage(error)}`);

  for (const root of Array.isArray(roots) ? (roots as StorageObject[]) : []) {
    if (paths.length >= args.maxFiles) break;
    const userId = root.name?.trim();
    if (!userId) continue;
    const prefix = `${userId}/base`;
    let offset = 0;
    for (;;) {
      if (paths.length >= args.maxFiles) break;
      const limit = Math.min(100, args.maxFiles - paths.length);
      const { data, error: listError } = await storage.list(prefix, {
        limit,
        offset,
        sortBy: { column: "updated_at", order: "asc" },
      });
      if (listError) break;
      const items = Array.isArray(data) ? (data as StorageObject[]) : [];
      if (items.length === 0) break;
      for (const item of items) {
        if (!isFileObject(item)) continue;
        const path = storagePath(prefix, item.name!);
        if (!isPrunableResumeStoragePath(path)) continue;
        if (objectUpdatedAt(item) && objectUpdatedAt(item) < args.cutoff.getTime()) paths.push(path);
        if (paths.length >= args.maxFiles) break;
      }
      if (items.length < limit) break;
      offset += items.length;
    }
  }
  return uniqueStrings(paths);
}

export async function cleanupTransientDocuments(
  client: Client,
  options: RetentionCleanupOptions = {},
): Promise<RetentionCleanupSummary> {
  const retentionDays = clampInt(options.retentionDays, DEFAULT_RETENTION_DAYS, 1, 365);
  const documentBatch = clampInt(options.documentBatch, DEFAULT_DOCUMENT_BATCH, 1, MAX_BATCH);
  const storageScanLimit = clampInt(options.storageScanLimit, DEFAULT_STORAGE_SCAN_LIMIT, 0, MAX_BATCH);
  const storageUserLimit = clampInt(options.storageUserLimit, DEFAULT_STORAGE_USER_LIMIT, 1, MAX_BATCH);
  const bucket = options.bucket ?? "resumes";
  const now = options.now ?? new Date();
  const cutoff = retentionCutoff(now, retentionDays);
  const cutoffIso = cutoff.toISOString();
  const log = options.log ?? (() => {});

  const summary: RetentionCleanupSummary = {
    ok: true,
    cutoff: cutoffIso,
    retentionDays,
    documentCandidates: 0,
    documentRowsDeleted: 0,
    storageCandidates: 0,
    storageObjectsDeleted: 0,
    storageDeleteErrors: 0,
    skippedReferencedDocuments: 0,
    skippedReferencedStorage: 0,
  };

  const candidates = await readOldTransientDocuments(client, cutoffIso, documentBatch);
  summary.documentCandidates = candidates.length;
  const candidateIds = candidates.map((row) => row.id);
  const referencedDocIds = await readApplicationDocumentReferences(client, candidateIds);
  const deletableDocs = candidates.filter((row) => !referencedDocIds.has(row.id));
  summary.skippedReferencedDocuments = candidates.length - deletableDocs.length;
  const deletedDocPaths = uniqueStrings(
    deletableDocs
      .map((row) => row.storage_path)
      .filter((path): path is string => Boolean(path && isTransientResumeStoragePath(path))),
  );

  summary.documentRowsDeleted = await deleteDocumentRows(
    client,
    deletableDocs.map((row) => row.id),
  );

  const [staleTransientStoragePaths, staleBaseStoragePaths] =
    storageScanLimit > 0
      ? await Promise.all([
          listStaleTransientStorageObjects({
            client,
            bucket,
            cutoff,
            maxFiles: storageScanLimit,
            maxUsers: storageUserLimit,
          }),
          listStaleBaseStorageObjects({
            client,
            bucket,
            cutoff,
            maxFiles: storageScanLimit,
            maxUsers: storageUserLimit,
          }),
        ])
      : [[], []];
  const storageCandidates = uniqueStrings([...deletedDocPaths, ...staleTransientStoragePaths, ...staleBaseStoragePaths]);
  summary.storageCandidates = storageCandidates.length;

  const referencedStorage = await readReferencedStoragePaths(client, storageCandidates);
  const removableStorage = storageCandidates.filter((path) => !referencedStorage.has(path));
  summary.skippedReferencedStorage = storageCandidates.length - removableStorage.length;
  const removed = await removeStorageObjects(client, bucket, removableStorage);
  summary.storageObjectsDeleted = removed.deleted;
  summary.storageDeleteErrors = removed.errors;

  log(
    `retention cleanup: docs ${summary.documentRowsDeleted}/${summary.documentCandidates}, storage ${summary.storageObjectsDeleted}/${summary.storageCandidates}`,
  );
  return summary;
}
