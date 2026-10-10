import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, LOCAL_PREFIX, pushLocalDrafts, type AutosaveStatus, type DraftRecord } from './draftSync';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
const rec = (label: string): DraftRecord => ({ id: 'd1', label, data: { label } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createAutosaver', () => {
  it('waits for a pause in typing and saves only the latest version', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(1000);
    a.schedule(rec('B'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(rec('B'));
  });

  it('stop cancels the queued save and waits for the one in flight', async () => {
    let finish: () => void = () => undefined;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
    a.schedule(rec('B'));
    let stopped = false;
    const stopping = a.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(1);
    a.schedule(rec('C'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps a copy on the device when saving fails, then retries and clears it', async () => {
    const storage = memoryStorage();
    const statuses: AutosaveStatus['kind'][] = [];
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage, onStatus: (s) => statuses.push(s.kind) });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.m.has(`${LOCAL_PREFIX}d1`)).toBe(true);
    expect(statuses.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(storage.m.has(`${LOCAL_PREFIX}d1`)).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('writes the queued draft to the device synchronously when the page is closing', () => {
    const storage = memoryStorage();
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save: vi.fn(), storage, onStatus: () => undefined });
    a.schedule(rec('A'));
    a.persistLocal();
    expect(JSON.parse(storage.m.get(`${LOCAL_PREFIX}d1`)!)).toEqual(rec('A'));
  });

  it('resume allows saving again after a failed invoice save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    await a.stop();
    a.resume();
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('pushLocalDrafts', () => {
  it('sends device copies and clears only the ones that were saved', async () => {
    const storage = memoryStorage();
    storage.setItem(`${LOCAL_PREFIX}a`, JSON.stringify({ id: 'a', label: 'A', data: {} }));
    storage.setItem(`${LOCAL_PREFIX}b`, JSON.stringify({ id: 'b', label: 'B', data: {} }));
    storage.setItem('unrelated', 'x');
    const save = vi.fn((r: DraftRecord) => (r.id === 'a' ? Promise.resolve() : Promise.reject(new Error('offline'))));
    expect(await pushLocalDrafts(storage, save)).toBe(1);
    expect(storage.m.has(`${LOCAL_PREFIX}a`)).toBe(false);
    expect(storage.m.has(`${LOCAL_PREFIX}b`)).toBe(true);
    expect(storage.m.has('unrelated')).toBe(true);
  });

  it('skips drafts that already exist as invoices or were deleted and clears them from storage', async () => {
    const storage = memoryStorage();
    storage.setItem(`${LOCAL_PREFIX}exist`, JSON.stringify({ id: 'exist', label: 'E', data: {} }));
    storage.setItem(`${LOCAL_PREFIX}deleted`, JSON.stringify({ id: 'deleted', label: 'D', data: {} }));
    storage.setItem(`${LOCAL_PREFIX}valid`, JSON.stringify({ id: 'valid', label: 'V', data: {} }));
    const save = vi.fn().mockResolvedValue(undefined);
    const shouldSkip = vi.fn(async (id: string) => id === 'exist' || id === 'deleted');

    const sent = await pushLocalDrafts(storage, save, shouldSkip);
    expect(sent).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'valid' }));
    expect(storage.m.has(`${LOCAL_PREFIX}exist`)).toBe(false);
    expect(storage.m.has(`${LOCAL_PREFIX}deleted`)).toBe(false);
    expect(storage.m.has(`${LOCAL_PREFIX}valid`)).toBe(false);
  });
});
