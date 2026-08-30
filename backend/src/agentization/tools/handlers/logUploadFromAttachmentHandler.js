const { uploadLogFromAgentAttachment } = require('../../../services/agentLogUploadService');

async function execute({ args, request, execution }) {
  return uploadLogFromAgentAttachment(args, request, execution);
}

module.exports = {
  execute
};
