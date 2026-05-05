function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInMemoryTaskStore() {
  const byTaskId = new Map();
  const canonicalToTaskId = new Map();

  function createTask(task) {
    const existingTaskId = canonicalToTaskId.get(task.canonicalId);
    if (existingTaskId) {
      const existing = byTaskId.get(existingTaskId);
      return { created: false, task: existing ? clone(existing) : null };
    }

    const stored = clone(task);
    byTaskId.set(task.taskId, stored);
    canonicalToTaskId.set(task.canonicalId, task.taskId);
    return { created: true, task: clone(stored) };
  }

  function getTask(taskId) {
    const found = byTaskId.get(String(taskId || ''));
    return found ? clone(found) : null;
  }

  function getTaskByCanonicalId(canonicalId) {
    const taskId = canonicalToTaskId.get(String(canonicalId || ''));
    if (!taskId) return null;
    const found = byTaskId.get(taskId);
    return found ? clone(found) : null;
  }

  function updateTask(taskId, mutateFn) {
    const current = byTaskId.get(String(taskId || ''));
    if (!current) return null;
    const next = clone(current);
    mutateFn(next);
    byTaskId.set(next.taskId, next);
    canonicalToTaskId.set(next.canonicalId, next.taskId);
    return clone(next);
  }

  return {
    createTask,
    getTask,
    getTaskByCanonicalId,
    updateTask
  };
}

module.exports = {
  createInMemoryTaskStore
};
