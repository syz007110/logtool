const { buildMessageOutput } = require('./contracts');

function projectQueueResultToMessageOutput(queueResult) {
  if (!queueResult || typeof queueResult !== 'object') {
    return buildMessageOutput({ attachments: [] }, { strict: false });
  }
  return buildMessageOutput({
    text: queueResult.text,
    attachments: queueResult.attachments
  }, { strict: false });
}

module.exports = {
  projectQueueResultToMessageOutput
};
