import { describe, it, expect } from 'vitest';
import { createTaskQueue, clientAbortError } from '../services/taskQueue.service.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Task Queue — pembatalan via AbortSignal', () => {
  it('reject langsung (499) bila signal sudah aborted sebelum push', async () => {
    const queue = createTaskQueue({ name: 't1', concurrency: 1 });
    const controller = new AbortController();
    controller.abort();

    await expect(queue.push(async () => 'ok', { signal: controller.signal })).rejects.toMatchObject({
      status: 499,
      code: 'client_abort'
    });
    expect(queue.stats().waiting).toBe(0);
  });

  it('task yang masih mengantri dibuang saat abort dan tidak pernah dijalankan', async () => {
    const queue = createTaskQueue({ name: 't2', concurrency: 1 });
    const controller = new AbortController();
    let ran = false;

    // Slot pertama mengunci concurrency sampai dilepas.
    let releaseFirst;
    const first = queue.push(() => new Promise((resolve) => { releaseFirst = resolve; }));
    const second = queue.push(async () => { ran = true; return 'ok'; }, { signal: controller.signal });

    expect(queue.stats().waiting).toBe(1);
    controller.abort();

    await expect(second).rejects.toMatchObject({ status: 499 });
    releaseFirst('done');
    await expect(first).resolves.toBe('done');
    await wait(30);

    expect(ran).toBe(false);
    expect(queue.stats().waiting).toBe(0);
  });

  it('task yang sedang berjalan menerima signal yang sama (fn mengamati sendiri)', async () => {
    const queue = createTaskQueue({ name: 't3', concurrency: 1 });
    const controller = new AbortController();

    const task = queue.push(() => new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(clientAbortError()), { once: true });
    }), { signal: controller.signal });

    await wait(10);
    controller.abort();

    await expect(task).rejects.toMatchObject({ status: 499 });
    // Slot harus kembali bebas setelah task berjalan di-abort.
    await expect(queue.push(async () => 'next')).resolves.toBe('next');
    expect(queue.stats().active).toBe(0);
  });

  it('push tanpa signal tetap berfungsi seperti sebelumnya', async () => {
    const queue = createTaskQueue({ name: 't4', concurrency: 1 });
    await expect(queue.push(async () => 42)).resolves.toBe(42);
  });
});

describe('Task Queue — canAccept (backpressure sebelum upload body)', () => {
  it('true saat idle, false saat concurrency penuh DAN antrian penuh', async () => {
    const queue = createTaskQueue({ name: 'c1', concurrency: 1, maxQueue: 1 });
    expect(queue.canAccept()).toBe(true);

    let releaseFirst;
    const first = queue.push(() => new Promise((resolve) => { releaseFirst = resolve; }));
    // concurrency penuh tapi antrian masih ada ruang → masih bisa diterima.
    expect(queue.canAccept()).toBe(true);
    const second = queue.push(async () => 'second');
    // concurrency penuh + antrian penuh → harus menolak.
    expect(queue.canAccept()).toBe(false);

    releaseFirst('done');
    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('second');
    await wait(20);
    expect(queue.canAccept()).toBe(true);
  });
});
