function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 499 = konvensi nginx untuk "client menutup request sebelum selesai".
export function clientAbortError(message = 'Request dibatalkan karena client menutup koneksi.') {
  const error = new Error(message);
  error.status = 499;
  error.code = 'client_abort';
  return error;
}

export function createTaskQueue({ name, concurrency = 1, maxQueue = 20 }) {
  const queue = [];
  let active = 0;

  function detach(task) {
    if (task.signal && task.onAbort) task.signal.removeEventListener('abort', task.onAbort);
  }

  async function runNext() {
    if (active >= concurrency || queue.length === 0) return;
    const task = queue.shift();
    // Task dibatalkan saat masih mengantri (belum dijalankan): tolak langsung.
    if (task.cancelled) {
      detach(task);
      task.reject(task.abortErr);
      return runNext();
    }
    active += 1;
    task.startedAt = Date.now();
    task.started = true;

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      detach(task);
      active -= 1;
      runNext();
    }
  }

  function stats() {
    return {
      name,
      active,
      waiting: queue.length,
      concurrency,
      maxQueue
    };
  }

  // Approximation backpressure: true bila push(fn) berpeluang diterima.
  // Ada race window antara pengecekan ini dan push aktual (request lain bisa mengisi
  // slot terakhir), tapi cukup untuk menolak request SEBELUM body besar di-upload.
  function canAccept() {
    return !(active >= concurrency && queue.length >= maxQueue);
  }

  // `signal` opsional (AbortController dari route): bila client memutus koneksi,
  // task yang masih mengantri dibuang dari queue, dan task yang sudah berjalan
  // wajib mengamati signal yang sama (mis. FFmpeg di-kill) supaya slot tidak terbuang.
  function push(fn, { signal } = {}) {
    if (active >= concurrency && queue.length >= maxQueue) {
      const error = new Error('Server sedang penuh memproses audio. Coba lagi beberapa saat.');
      error.status = 503;
      error.retryAfter = 20;
      error.details = [stats()];
      throw error;
    }

    return new Promise((resolve, reject) => {
      const task = {
        fn,
        resolve,
        reject,
        queuedAt: Date.now(),
        cancelled: false,
        started: false,
        signal: null,
        onAbort: null,
        abortErr: clientAbortError()
      };

      if (signal) {
        if (signal.aborted) {
          reject(task.abortErr);
          return;
        }
        task.signal = signal;
        task.onAbort = () => {
          task.cancelled = true;
          if (!task.started) {
            const index = queue.indexOf(task);
            if (index >= 0) queue.splice(index, 1);
            detach(task);
            reject(task.abortErr);
          }
          // Task yang sudah berjalan tidak di-intervensi di sini: fn-nya menerima
          // signal yang sama dan bertanggung jawab menghentikan kerjanya sendiri.
        };
        signal.addEventListener('abort', task.onAbort, { once: true });
      }

      queue.push(task);
      runNext();
    });
  }

  async function drainForTest(maxWaitMs = 5000) {
    const deadline = Date.now() + maxWaitMs;
    while ((active > 0 || queue.length > 0) && Date.now() < deadline) {
      await wait(20);
    }
  }

  return { push, stats, canAccept, drainForTest };
}
