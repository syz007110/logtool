const path = require('path');

const SCAN_WORKSPACE_ROOT = process.env.AGENT_SCAN_WORKSPACE_ROOT
  ? path.resolve(String(process.env.AGENT_SCAN_WORKSPACE_ROOT))
  : path.resolve(__dirname, '../../uploads/agent-scan-workspaces');

module.exports = {
  SCAN_WORKSPACE_ROOT
};
