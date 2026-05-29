function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTaskQueue({ name, concurrency = 1, maxQueue = 20 }) {
  const queue = [];
  let active = 0;

  async function runNext() {
    if (active >= concurrency || queue.length === 0) return;
    const task = queue.shift();
    active += 1;
    task.startedAt = Date.now();

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
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

  function push(fn) {
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
        queuedAt: Date.now()
      };
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

  return { push, stats, drainForTest };
}
