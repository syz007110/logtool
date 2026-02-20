const redis = require('redis');
const errorCodeCache = require('./errorCodeCache');

class ErrorCodeCacheSyncService {
  constructor() {
    this.channel = 'cache:error_code:reload';
    this.processId = `pid_${process.pid}`;
    this.pubClient = null;
    this.subClient = null;
    this.subscribed = false;
    this.reloadPromise = null;
  }

  getRedisClientOptions() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT, 10) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB, 10) || 0;
    const url = process.env.REDIS_URL || `redis://${host}:${port}`;
    const clientOpts = { url };
    if (password) clientOpts.password = password;
    if (Number.isFinite(db)) clientOpts.database = db;
    return clientOpts;
  }

  async ensurePublisher() {
    if (this.pubClient && this.pubClient.isOpen) return true;
    try {
      const clientOpts = this.getRedisClientOptions();
      this.pubClient = redis.createClient(clientOpts);
      this.pubClient.on('error', (e) => {
        console.error('[error-code-cache-sync] Redis PUB error:', e.message);
      });
      await this.pubClient.connect();
      return true;
    } catch (e) {
      console.warn('[error-code-cache-sync] publisher init failed:', e.message);
      return false;
    }
  }

  async initializeSubscriber() {
    if (this.subscribed && this.subClient && this.subClient.isOpen) return true;
    try {
      const clientOpts = this.getRedisClientOptions();
      this.subClient = redis.createClient(clientOpts);
      this.subClient.on('error', (e) => {
        console.error('[error-code-cache-sync] Redis SUB error:', e.message);
      });
      await this.subClient.connect();
      await this.subClient.subscribe(this.channel, async (message) => {
        await this.handleSyncMessage(message);
      });
      this.subscribed = true;
      console.log('[error-code-cache-sync] subscriber ready');
      return true;
    } catch (e) {
      console.warn('[error-code-cache-sync] subscriber init failed:', e.message);
      return false;
    }
  }

  async handleSyncMessage(message) {
    try {
      const payload = JSON.parse(message);
      if (!payload || payload.source === this.processId) return;
      await this.reloadLocalCache(`redis:${payload.reason || 'unknown'}`);
    } catch (e) {
      console.warn('[error-code-cache-sync] invalid message:', e.message);
    }
  }

  async reloadLocalCache(reason = 'manual') {
    if (this.reloadPromise) return this.reloadPromise;
    this.reloadPromise = (async () => {
      try {
        await errorCodeCache.reloadCache();
        console.log(`[error-code-cache-sync] local cache reloaded (${reason})`);
      } catch (e) {
        console.warn('[error-code-cache-sync] local cache reload failed:', e.message);
      } finally {
        this.reloadPromise = null;
      }
    })();
    return this.reloadPromise;
  }

  async publishReload(reason = 'manual', meta = {}) {
    const ok = await this.ensurePublisher();
    if (!ok || !this.pubClient || !this.pubClient.isOpen) return false;
    try {
      const payload = JSON.stringify({
        source: this.processId,
        reason,
        at: Date.now(),
        ...meta
      });
      await this.pubClient.publish(this.channel, payload);
      return true;
    } catch (e) {
      console.warn('[error-code-cache-sync] publish failed:', e.message);
      return false;
    }
  }
}

module.exports = new ErrorCodeCacheSyncService();
