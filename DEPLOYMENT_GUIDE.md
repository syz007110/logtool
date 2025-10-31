# LogTool 服务器部署指南

本文档提供 LogTool 项目在 Linux 服务器上的完整部署方案。

## 📋 目录

1. [环境要求](#环境要求)
2. [服务器环境准备](#服务器环境准备)
3. [数据库初始化](#数据库初始化)
4. [项目配置](#项目配置)
5. [前端构建和部署](#前端构建和部署)
6. [后端部署](#后端部署)
7. [使用进程管理器（PM2）](#使用进程管理器pm2)
8. [Nginx 反向代理配置](#nginx-反向代理配置)
9. [服务启动和监控](#服务启动和监控)
10. [常见问题排查](#常见问题排查)

---

## 环境要求

### 必需软件

- **Node.js**: 16.x 或更高版本
- **MySQL**: 8.0+ 
- **Redis**: 6.0+
- **PostgreSQL**: 12+ (可选，用于手术分析功能)
- **Nginx**: 1.18+ (推荐，用于反向代理)
- **PM2**: 进程管理工具 (推荐)

### 系统要求

- **操作系统**: Linux (Ubuntu 20.04+, CentOS 7+, Debian 10+)
- **内存**: 至少 4GB (推荐 8GB+)
- **磁盘空间**: 至少 20GB 可用空间
- **CPU**: 2 核以上 (推荐 4 核+)

---

## 服务器环境准备

### 1. 更新系统包

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. 安装 Node.js

```bash
# 方式1: 使用 NodeSource 仓库 (推荐)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 方式2: 使用 nvm (适合多版本管理)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 验证安装
node --version
npm --version
```

### 3. 安装 MySQL

```bash
# Ubuntu/Debian
sudo apt install mysql-server -y
sudo systemctl start mysql
sudo systemctl enable mysql

# CentOS/RHEL
sudo yum install mysql-server -y
sudo systemctl start mysqld
sudo systemctl enable mysqld

# 安全配置
sudo mysql_secure_installation
```

### 4. 安装 Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server -y

# CentOS/RHEL
sudo yum install redis -y

# 启动并设置开机自启
sudo systemctl start redis
sudo systemctl enable redis

# 验证
redis-cli ping
```

### 5. 安装 PostgreSQL (可选)

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib -y

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib -y
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 6. 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 7. 安装 PM2 (进程管理工具)

```bash
sudo npm install -g pm2
```

---

## 数据库初始化

### 1. 创建 MySQL 数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE IF NOT EXISTS logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 创建用户并授权 (可选，建议使用专用用户)
CREATE USER 'logtool'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON logtool.* TO 'logtool'@'localhost';
FLUSH PRIVILEGES;

# 退出
EXIT;
```

### 2. 导入数据库结构

```bash
# 进入项目目录
cd /path/to/logtool

# 导入数据库初始化脚本
mysql -u root -p logtool < infrastructure/database/init_database.sql
```

### 3. 创建 PostgreSQL 数据库 (可选)

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE logtool;
CREATE USER logtool WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE logtool TO logtool;

# 退出
\q

# 导入手术统计表结构
sudo -u postgres psql -d logtool -f infrastructure/database/surgery_tables_postgresql.sql
```

---

## 项目配置

### 1. 克隆或确认项目代码

```bash
# 如果已通过 git 下载，确认在正确的目录
cd /path/to/logtool

# 如果还未下载，可以克隆
# git clone <repository-url> /path/to/logtool
```

### 2. 安装项目依赖

```bash
# 安装后端依赖
cd backend
npm install --production

# 安装前端依赖
cd ../frontend
npm install
```

### 3. 配置后端环境变量

```bash
# 进入后端目录
cd /path/to/logtool/backend

# 创建 .env 文件 (如果没有)
cp .env.example .env  # 如果有示例文件
# 或直接创建
nano .env
```

**后端 `.env` 配置示例（生产环境）:**

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=logtool
DB_USER=logtool
DB_PASSWORD=your_secure_password
DB_DIALECT=mysql

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# PostgreSQL配置 (可选)
POSTGRES_USER=logtool
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=logtool
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_SSL=false

# 应用配置
PORT=3000
NODE_ENV=production
JWT_SECRET=your_very_secure_jwt_secret_key_change_this

# 队列配置
QUEUE_CONCURRENCY=5
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_DELAY=2000

# 速率限制配置
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=30000
RATE_LIMIT_MAX_REQUESTS=50

# 缓存配置
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
CACHE_MAX_KEYS=1000
SEARCH_CACHE_TTL_SECONDS=180

# 集群配置
CLUSTER_ENABLED=true
WORKER_PROCESSES=max
MAX_MEMORY_RESTART=1G
AUTO_RESTART_ENABLED=true
MAX_RESTART_ATTEMPTS=5
RESTART_DELAY=1000
HEARTBEAT_TIMEOUT=30000

# 日志配置
LOG_LEVEL=INFO
LOG_FORMAT=structured
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs/
```

### 4. 初始化角色和权限

```bash
cd /path/to/logtool/backend
npm run init-roles
npm run init-permissions
```

---

## 前端构建和部署

### 1. 构建前端生产版本

```bash
cd /path/to/logtool/frontend

# 构建生产版本
npm run build

# 构建完成后，dist 目录包含所有静态文件
```

### 2. 配置前端 API 地址

如果需要修改 API 地址，检查 `frontend/src/api/` 目录下的配置文件。

### 3. 部署前端静态文件

#### 方式1: 使用 Nginx 直接服务静态文件（推荐）

```bash
# 将构建好的文件复制到 Nginx 目录
sudo mkdir -p /var/www/logtool
sudo cp -r /path/to/logtool/frontend/dist/* /var/www/logtool/

# 设置权限
sudo chown -R www-data:www-data /var/www/logtool
sudo chmod -R 755 /var/www/logtool
```

#### 方式2: 使用后端服务静态文件

修改后端配置，将静态文件目录指向 `frontend/dist`。

---

## 后端部署

### 1. 创建必要的目录

```bash
cd /path/to/logtool/backend

# 创建日志目录
mkdir -p logs
mkdir -p uploads/logs
mkdir -p uploads/feedback
mkdir -p uploads/temp

# 设置权限
chmod -R 755 logs uploads
```

### 2. 测试后端启动

```bash
cd /path/to/logtool/backend

# 测试启动（手动运行，确认无错误后 Ctrl+C 停止）
npm start
```

如果启动成功，应该能看到服务运行在配置的端口上。

---

## 使用进程管理器（PM2）

### 1. 创建 PM2 配置文件

在项目根目录创建 `ecosystem.config.js`:

```bash
cd /path/to/logtool
nano ecosystem.config.js
```

**PM2 配置示例:**

```javascript
module.exports = {
  apps: [
    {
      name: 'logtool-backend',
      script: './backend/src/app.js',
      cwd: '/path/to/logtool/backend',
      instances: 'max', // 或者指定数字，如 4
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
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
      ignore_watch: ['node_modules', 'logs', 'uploads']
    },
    {
      name: 'logtool-cluster',
      script: './backend/src/cluster/smartCluster.js',
      cwd: '/path/to/logtool/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './backend/logs/cluster-error.log',
      out_file: './backend/logs/cluster-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '2G',
      watch: false
    }
  ]
};
```

**注意**: 根据你的需求选择使用 `app.js` (单进程) 或 `smartCluster.js` (集群模式)。集群模式通常性能更好，但需要确保配置正确。

### 2. 启动应用

```bash
cd /path/to/logtool

# 使用配置文件启动
pm2 start ecosystem.config.js

# 或者直接启动（不使用配置文件）
cd backend
pm2 start src/app.js --name logtool-backend -i max

# 保存 PM2 进程列表
pm2 save

# 设置 PM2 开机自启
pm2 startup
# 执行上一条命令输出的命令（通常是 sudo 命令）
```

### 3. PM2 常用命令

```bash
# 查看运行状态
pm2 status

# 查看日志
pm2 logs logtool-backend
pm2 logs --lines 100  # 查看最近100行

# 重启应用
pm2 restart logtool-backend

# 停止应用
pm2 stop logtool-backend

# 删除应用
pm2 delete logtool-backend

# 监控
pm2 monit

# 查看详细信息
pm2 describe logtool-backend
```

---

## Nginx 反向代理配置

### 1. 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/logtool
```

**Nginx 配置示例:**

```nginx
# 前端静态文件服务
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 IP
    
    # 前端静态文件
    root /var/www/logtool;
    index index.html;

    # 前端路由支持（Vue Router）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 支持（如果需要）
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 上传文件大小限制
    client_max_body_size 500M;
}
```

### 2. 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/logtool /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 3. SSL/HTTPS 配置（可选但推荐）

使用 Let's Encrypt 免费 SSL 证书:

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d your-domain.com

# 证书会自动续期，也可以手动测试
sudo certbot renew --dry-run
```

---

## 服务启动和监控

### 1. 启动顺序

```bash
# 1. 启动 MySQL
sudo systemctl start mysql
sudo systemctl status mysql

# 2. 启动 Redis
sudo systemctl start redis
sudo systemctl status redis

# 3. 启动 PostgreSQL (如果使用)
sudo systemctl start postgresql
sudo systemctl status postgresql

# 4. 启动后端服务 (PM2)
cd /path/to/logtool
pm2 start ecosystem.config.js
pm2 save

# 5. 启动 Nginx (如果配置了)
sudo systemctl start nginx
sudo systemctl status nginx
```

### 2. 验证服务

```bash
# 检查后端 API
curl http://localhost:3000/health
# 或
curl http://localhost:3000/api/health

# 检查前端
curl http://localhost:80

# 检查 Redis
redis-cli ping

# 检查 MySQL
mysql -u logtool -p -e "SELECT 1;"

# 检查 PM2
pm2 status
pm2 logs --lines 50
```

### 3. 设置开机自启

```bash
# MySQL, Redis, PostgreSQL, Nginx 已通过 systemctl enable 设置

# PM2 开机自启
pm2 startup
# 执行输出的命令
pm2 save
```

---

## 常见问题排查

### 1. 后端服务无法启动

```bash
# 查看详细错误日志
cd /path/to/logtool/backend
npm start

# 检查端口是否被占用
sudo netstat -tulpn | grep 3000
# 或
sudo lsof -i :3000

# 检查环境变量
cat .env

# 检查数据库连接
mysql -u logtool -p -e "USE logtool; SHOW TABLES;"
```

### 2. 数据库连接失败

```bash
# 检查 MySQL 服务状态
sudo systemctl status mysql

# 测试数据库连接
mysql -u logtool -p -h localhost

# 检查防火墙
sudo ufw status
sudo ufw allow 3306  # 如果需要

# 检查 MySQL 配置
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
# 确认 bind-address = 127.0.0.1 或 0.0.0.0
```

### 3. Redis 连接失败

```bash
# 检查 Redis 服务
sudo systemctl status redis
redis-cli ping

# 检查 Redis 配置
sudo nano /etc/redis/redis.conf
# 确认 bind 和 requirepass 设置
```

### 4. 前端无法访问后端 API

```bash
# 检查 Nginx 配置
sudo nginx -t
sudo tail -f /var/log/nginx/error.log

# 检查后端是否运行
pm2 status
curl http://localhost:3000/api/health

# 检查 CORS 配置（如果直接访问）
# 查看 backend/src/app.js 中的 CORS 设置
```

### 5. PM2 进程频繁重启

```bash
# 查看错误日志
pm2 logs logtool-backend --err

# 检查内存使用
pm2 monit

# 查看详细错误
pm2 describe logtool-backend

# 降低内存限制或增加服务器内存
# 编辑 ecosystem.config.js 中的 max_memory_restart
```

### 6. 文件上传失败

```bash
# 检查上传目录权限
ls -la /path/to/logtool/backend/uploads/
sudo chown -R $USER:$USER /path/to/logtool/backend/uploads/
sudo chmod -R 755 /path/to/logtool/backend/uploads/

# 检查 Nginx 上传大小限制
# 在 Nginx 配置中设置 client_max_body_size
```

---

## 部署检查清单

- [ ] 所有必需软件已安装并运行
- [ ] 数据库已创建并导入结构
- [ ] 后端 `.env` 文件已配置
- [ ] 前端已构建 (`npm run build`)
- [ ] 后端依赖已安装 (`npm install --production`)
- [ ] 角色和权限已初始化
- [ ] PM2 已配置并启动应用
- [ ] Nginx 已配置并运行
- [ ] 防火墙规则已配置
- [ ] SSL 证书已配置（如果使用 HTTPS）
- [ ] 服务已设置开机自启
- [ ] 日志文件目录权限正确
- [ ] 测试访问前端和后端 API

---

## 备份和维护

### 1. 数据库备份

```bash
# MySQL 备份
mysqldump -u logtool -p logtool > backup_$(date +%Y%m%d_%H%M%S).sql

# PostgreSQL 备份 (如果使用)
pg_dump -U logtool logtool > backup_postgres_$(date +%Y%m%d_%H%M%S).sql

# 自动化备份脚本 (添加到 crontab)
# 0 2 * * * /path/to/backup_script.sh
```

### 2. 日志轮转

```bash
# 配置 logrotate
sudo nano /etc/logrotate.d/logtool

# 内容示例:
/path/to/logtool/backend/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $USER $USER
}
```

### 3. 监控和告警

考虑使用以下工具：
- **PM2 Plus**: PM2 的监控服务
- **Prometheus + Grafana**: 系统监控
- **Sentry**: 错误追踪
- **Uptime Kuma**: 服务可用性监控

---

## 快速部署脚本示例

可以创建一个自动化部署脚本 `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "开始部署 LogTool..."

# 1. 更新代码
git pull origin main

# 2. 安装后端依赖
cd backend
npm install --production

# 3. 初始化数据库（如果需要）
# mysql -u root -p logtool < ../infrastructure/database/init_database.sql

# 4. 初始化角色（如果需要）
# npm run init-roles

# 5. 构建前端
cd ../frontend
npm install
npm run build

# 6. 复制前端文件
sudo cp -r dist/* /var/www/logtool/

# 7. 重启后端
cd ..
pm2 restart ecosystem.config.js

# 8. 重载 Nginx
sudo systemctl reload nginx

echo "部署完成！"
```

使用:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 总结

部署完成后，你应该能够通过以下方式访问：

- **前端**: `http://your-server-ip` 或 `http://your-domain.com`
- **后端 API**: `http://your-server-ip/api` 或 `http://your-domain.com/api`
- **健康检查**: `http://your-server-ip/api/health`

如有问题，请参考本文档的"常见问题排查"部分，或查看相应的日志文件。

---

**祝部署顺利！** 🚀

