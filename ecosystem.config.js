/**
 * PM2 进程管理配置文件
 * 用于生产环境部署
 * 
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup systemd -u <用户名> --hp <用户home路径>
 * 
 * 注意:
 *   如果执行 pm2 startup 后出现 User=undefined，需要手动修复：
 *   1. 编辑 /etc/systemd/system/pm2-<用户名>.service
 *   2. 将 User=undefined 改为 User=<实际用户名> (例如: User=root)
 *   3. 执行: systemctl daemon-reload
 *   4. 或者重新运行: pm2 unstartup systemd && pm2 startup systemd -u <用户名> --hp <用户home路径>
 */

module.exports = {
  apps: [
    // 集群模式配置（使用智能集群）
    // 注意: PM2 只启动一个 master 进程，worker 进程由 smartCluster.js 内部通过 cluster.fork() 创建
    // 使用 pm2 monit 可以看到所有进程，或使用 ps aux | grep node 查看
    {
      name: 'logtool-cluster',
      script: './backend/src/cluster/smartCluster.js',
      cwd: process.cwd(),
      instances: 1, // PM2 层面只启动一个 master 进程，worker 进程由集群管理器创建
      exec_mode: 'fork', // 必须使用 fork 模式，因为 smartCluster.js 内部自己管理 worker

      env: {
        NODE_ENV: 'production',
        CLUSTER_ENABLED: 'true',
        // WORKER_PROCESSES: 4, // 不设置则使用 CPU 核心数，或设置为具体数字
        // 可选：启用智能调度
        // INTELLIGENT_SCHEDULER_ENABLED: 'true',
        // 可选：启用进程分离（用户请求和日志处理分离）
        // PROCESS_SEPARATION_ENABLED: 'true',
        // USER_REQUEST_WORKERS: '2', // 用户请求处理进程数
        // LOG_PROCESSING_WORKERS: '2' // 日志处理进程数
      },
      error_file: './backend/logs/cluster-error.log',
      out_file: './backend/logs/cluster-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', '.git']
    }
  ]
};

/**
 * 说明:
 * 1. 根据你的需求选择使用 'logtool-backend' 或 'logtool-cluster'
 * 2. 如果使用集群模式，只需要启动 logtool-cluster，不需要同时启动 logtool-backend
 * 3. PM2 只显示一个 master 进程，worker 进程由 smartCluster.js 内部管理
 *    - 查看所有进程: pm2 monit 或 ps aux | grep node
 *    - worker 进程数量由 WORKER_PROCESSES 环境变量控制（默认使用 CPU 核心数）
 * 4. 确保 logs 目录存在并有写权限
 * 
 * 启动集群模式:
 *   pm2 start ecosystem.config.js --only logtool-cluster
 *   pm2 save
 * 
 * 查看进程详情:
 *   pm2 monit          # 查看所有进程（包括 worker）
 *   pm2 logs           # 查看日志
 *   pm2 describe logtool-cluster  # 查看详细信息
 */

