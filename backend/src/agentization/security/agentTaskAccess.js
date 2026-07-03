function canReadAgentTask(taskRow, reqUser, isAdmin) {
  if (!taskRow) return false;
  if (isAdmin) return true;
  const requestUserId = String(reqUser?.id || '').trim();
  const taskUserId = String(taskRow.user_id || '').trim();
  if (!requestUserId || !taskUserId) return false;
  return taskUserId === requestUserId;
}

module.exports = {
  canReadAgentTask
};
