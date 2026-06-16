import type {
  ExtensionApplicationUpsert,
  ExtensionSyncQueueStatus,
} from "@jobposted/shared";

export const APPLICATION_SYNC_ALARM = "jobposted.applicationSync.retry";

const SYNC_QUEUE_KEY = "jobposted.applicationSync.queue.v1";
const MAX_PENDING_SYNCS = 50;

export type PendingApplicationSync = {
  id: string;
  dedupeKey: string;
  payload: ExtensionApplicationUpsert;
  attempts: number;
  queuedAt: string;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  lastError?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

export function retryDelayMs(attempts: number) {
  const schedule = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
  return schedule[Math.min(Math.max(0, attempts), schedule.length - 1)] ?? schedule.at(-1)!;
}

function dedupeKey(payload: ExtensionApplicationUpsert) {
  return [
    payload.platform,
    payload.jobUrl.trim().toLowerCase(),
    payload.status,
    payload.appliedAt,
  ].join("|");
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function writeQueue(items: PendingApplicationSync[]) {
  await chrome.storage.local.set({ [SYNC_QUEUE_KEY]: items.slice(-MAX_PENDING_SYNCS) });
}

export async function readPendingApplicationSyncs(): Promise<PendingApplicationSync[]> {
  const result = await chrome.storage.local.get(SYNC_QUEUE_KEY);
  const value = result[SYNC_QUEUE_KEY];
  return Array.isArray(value) ? (value as PendingApplicationSync[]) : [];
}

export async function enqueueApplicationSync(
  payload: ExtensionApplicationUpsert,
  error: string,
): Promise<PendingApplicationSync> {
  const queue = await readPendingApplicationSyncs();
  const key = dedupeKey(payload);
  const existing = queue.find((item) => item.dedupeKey === key);
  const nextRetryAt = new Date(Date.now() + retryDelayMs(existing?.attempts ?? 0)).toISOString();
  const item: PendingApplicationSync = existing
    ? {
        ...existing,
        lastError: error,
        nextRetryAt,
      }
    : {
        id: createId(),
        dedupeKey: key,
        payload,
        attempts: 0,
        queuedAt: nowIso(),
        lastAttemptAt: null,
        nextRetryAt,
        lastError: error,
      };

  const next = existing
    ? queue.map((candidate) => (candidate.id === existing.id ? item : candidate))
    : [...queue, item];
  await writeQueue(next);
  await scheduleNextApplicationSyncRetry(next);
  return item;
}

export async function markApplicationSyncAttempt(
  id: string,
  error: string,
): Promise<PendingApplicationSync | null> {
  const queue = await readPendingApplicationSyncs();
  const current = queue.find((item) => item.id === id);
  if (!current) return null;
  const attempts = current.attempts + 1;
  const item: PendingApplicationSync = {
    ...current,
    attempts,
    lastAttemptAt: nowIso(),
    nextRetryAt: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
    lastError: error,
  };
  await writeQueue(queue.map((candidate) => (candidate.id === id ? item : candidate)));
  await scheduleNextApplicationSyncRetry();
  return item;
}

export async function removeApplicationSync(id: string) {
  const queue = await readPendingApplicationSyncs();
  await writeQueue(queue.filter((item) => item.id !== id));
  await scheduleNextApplicationSyncRetry();
}

export function dueApplicationSyncs(
  queue: PendingApplicationSync[],
  now = Date.now(),
): PendingApplicationSync[] {
  return queue.filter((item) => !item.nextRetryAt || Date.parse(item.nextRetryAt) <= now);
}

export function syncQueueStatusFrom(queue: PendingApplicationSync[]): ExtensionSyncQueueStatus {
  const sorted = [...queue].sort((a, b) => {
    const aTime = Date.parse(a.nextRetryAt ?? a.queuedAt) || 0;
    const bTime = Date.parse(b.nextRetryAt ?? b.queuedAt) || 0;
    return aTime - bTime;
  });
  const mostRecent = [...queue].sort((a, b) => {
    const aTime = Date.parse(a.lastAttemptAt ?? a.queuedAt) || 0;
    const bTime = Date.parse(b.lastAttemptAt ?? b.queuedAt) || 0;
    return bTime - aTime;
  })[0];
  return {
    pending: queue.length,
    lastError: mostRecent?.lastError ?? null,
    lastAttemptAt: mostRecent?.lastAttemptAt ?? null,
    nextRetryAt: sorted[0]?.nextRetryAt ?? null,
  };
}

export async function readSyncQueueStatus() {
  return syncQueueStatusFrom(await readPendingApplicationSyncs());
}

export async function scheduleNextApplicationSyncRetry(queue?: PendingApplicationSync[]) {
  const items = queue ?? (await readPendingApplicationSyncs());
  if (items.length === 0) {
    await chrome.alarms.clear(APPLICATION_SYNC_ALARM);
    return;
  }
  const nextAt = items.reduce((earliest, item) => {
    const time = Date.parse(item.nextRetryAt ?? item.queuedAt);
    if (!Number.isFinite(time)) return earliest;
    return Math.min(earliest, time);
  }, Date.now() + retryDelayMs(0));
  await chrome.alarms.create(APPLICATION_SYNC_ALARM, { when: Math.max(Date.now() + 1_000, nextAt) });
}
