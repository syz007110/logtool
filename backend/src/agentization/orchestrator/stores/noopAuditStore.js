function createNoopAuditStore() {
  return {
    async append() {}
  };
}

module.exports = {
  createNoopAuditStore
};
