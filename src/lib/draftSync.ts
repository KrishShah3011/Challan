export interface DraftRecord {
  id: string;
  label: string;
  data: unknown;
}

export type AutosaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'offline' };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const LOCAL_PREFIX = 'pending-draft:';

export interface Autosaver {
  /** Queue the latest version; it is sent after `delayMs` without further changes. */
  schedule(rec: DraftRecord): void;
  /** Send the queued version now (used when leaving the page). */
  flushNow(): Promise<void>;
  /** Synchronously copy the queued version to the device (used on beforeunload). */
  persistLocal(): void;
  /** Drop anything queued and wait for the request in flight. Call before save_invoice. */
  stop(): Promise<void>;
  resume(): void;
  /** Remove the device copy of a draft (after the invoice itself was saved). */
  forget(id: string): void;
}

export function createAutosaver(opts: {
  delayMs: number;
  retryMs: number;
  save: (rec: DraftRecord) => Promise<void>;
  storage: Store;
  onStatus: (s: AutosaveStatus) => void;
}): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending: DraftRecord | null = null;
  let stopped = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = (ms: number) => {
    clear();
    timer = setTimeout(() => void flushNow(), ms);
  };

  async function flushNow(): Promise<void> {
    clear();
    while (inflight) await inflight; // one request at a time, in order
    if (!pending || stopped) return;
    const rec = pending;
    pending = null;
    opts.onStatus({ kind: 'saving' });
    inflight = opts
      .save(rec)
      .then(
        () => {
          opts.storage.removeItem(LOCAL_PREFIX + rec.id);
          opts.onStatus({ kind: 'saved', at: new Date() });
        },
        () => {
          opts.storage.setItem(LOCAL_PREFIX + rec.id, JSON.stringify(rec));
          opts.onStatus({ kind: 'offline' });
          if (!pending) pending = rec; // retry unless something newer is already waiting
          if (!stopped) arm(opts.retryMs);
        },
      )
      .finally(() => {
        inflight = null;
      });
    await inflight;
  }

  return {
    schedule(rec) {
      if (stopped) return;
      pending = rec;
      arm(opts.delayMs);
    },
    flushNow,
    persistLocal() {
      if (pending) opts.storage.setItem(LOCAL_PREFIX + pending.id, JSON.stringify(pending));
    },
    async stop() {
      stopped = true;
      clear();
      pending = null;
      while (inflight) await inflight;
    },
    resume() {
      stopped = false;
    },
    forget(id) {
      opts.storage.removeItem(LOCAL_PREFIX + id);
    },
  };
}

/** On app start: send drafts that were kept on this device while offline. Returns how many were sent. */
export async function pushLocalDrafts(storage: Store, save: (rec: DraftRecord) => Promise<void>): Promise<number> {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(LOCAL_PREFIX)) keys.push(k);
  }
  let sent = 0;
  for (const k of keys) {
    const raw = storage.getItem(k);
    if (!raw) continue;
    try {
      await save(JSON.parse(raw) as DraftRecord);
      storage.removeItem(k);
      sent++;
    } catch {
      // still offline; try again on the next start
    }
  }
  return sent;
}
