/**
 * PM2 进程管理配置文件
 * 用于生产环境部署
 * 
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'logtool-backend',
      script: './backend/src/app.js',
      cwd: process.cwd(),
      instances: 1, // 如果使用集群模式，可以设置为 'max' 或具体数字
      exec_mode: 'fork', // 单进程模式，如果使用集群模式改为 'cluster'
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './backend/logs/pm2-error.log',
      out_file: './backend/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', '.git'],
      instance_var: 'INSTANCE_ID'
    },
    // 集群模式配置（可选，如果使用智能集群）
    {
      name: 'logtool-cluster',
      script: './backend/src/cluster/smartCluster.js',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        CLUSTER_ENABLED: 'true'
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
 * 3. 修改 instances 和 exec_mode 来调整进程数
 * 4. 确保 logs 目录存在并有写权限
 */

