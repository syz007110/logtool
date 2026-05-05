function buildPartitionedJobId(instanceId, taskId) {
  return `${String(instanceId)}:${String(taskId)}`;
}

module.exports = {
  buildPartitionedJobId
};
