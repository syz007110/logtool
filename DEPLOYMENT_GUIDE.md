# LogTool 服务器部署指南

本文档提供 LogTool 项目在 Linux 服务器上的完整部署方案。

## 📋 目录

1. [环境要求](#环境要求)
2. [服务器环境准备](#服务器环境准备)
3. [数据库初始化](#数据库初始化)
4. [项目配置](#项目配置)
5. [后端部署（使用 PM2）](#后端部署使用-pm2)
6. [前端部署](#前端部署)
7. [Nginx 配置（静态文件服务和反向代理）](#nginx-配置静态文件服务和反向代理)
8. [服务启动和监控](#服务启动和监控)
9. [常见问题排查](#常见问题排查)
10. [部署检查清单](#部署检查清单)
11. [移动端和桌面端访问](#移动端和桌面端访问)

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

### 2. 导入数据库结构

### 3. 创建 PostgreSQL 数据库 (可选)

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

## 后端部署（使用 PM2）

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

### 3. 配置 PM2 进程管理

在项目根目录创建 `ecosystem.config.js`（如果还没有）：

```bash
cd /path/to/logtool
# 如果已有配置文件，直接使用
# 如果没有，可以创建或使用项目根目录的 ecosystem.config.js
```

**PM2 配置说明:**

项目根目录已提供 `ecosystem.config.js` 配置文件示例。如果使用集群模式（推荐），配置如下：

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

**注意**: 
- **集群模式**：使用 `smartCluster.js`，性能更好，自动管理多个工作进程（推荐生产环境）
- **单进程模式**：使用 `app.js`，适合开发或小规模部署
- 配置文件已在项目根目录，直接使用即可

### 4. 使用 PM2 启动后端服务

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

### 5. PM2 常用管理命令

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

## 前端部署

### 1. 构建前端生产版本

```bash
cd /path/to/logtool/frontend

# 安装依赖（如果还没安装）
npm install

# 构建生产版本
npm run build

# 构建完成后，dist 目录包含所有静态文件
```

### 2. 前端路由说明

**移动端和桌面端已自动区分：**
- **桌面端路由**：`/` 开头的所有路由（如 `/dashboard`, `/login` 等）
- **移动端路由**：`/m` 开头的所有路由（如 `/m/login`, `/m/error` 等）
- **自动识别**：前端会根据路由路径自动加载对应的移动端或桌面端组件
- **Vue Router 自动处理**：无需额外配置，路由会自动切换

**移动端路由列表：**
- `/m/login` - 移动端登录
- `/m` - 移动端主页（重定向到 `/m/error`）
- `/m/error` - 故障码查询
- `/m/logs` - 日志设备列表
- `/m/logs/:deviceId` - 设备日志详情
- `/m/surgeries` - 手术设备列表
- `/m/surgeries/:deviceId` - 设备手术数据
- `/m/profile` - 个人资料

### 3. 配置前端 API 地址（可选）

默认情况下，前端 API 地址配置为 `/api`，会通过 Nginx 自动代理到后端服务（`http://localhost:3000`）。

如果需要修改 API 地址，检查 `frontend/src/api/index.js` 配置文件。

### 4. 部署前端静态文件

```bash
# 将构建好的文件复制到 Nginx 目录
sudo mkdir -p /var/www/logtool
sudo cp -r /path/to/logtool/frontend/dist/* /var/www/logtool/

# 设置权限
sudo chown -R www-data:www-data /var/www/logtool
sudo chmod -R 755 /var/www/logtool
```

---

## Nginx 配置（静态文件服务和反向代理）

### 1. 创建 Nginx 配置文件

```bash
# 复制项目提供的配置文件
sudo cp /path/to/logtool/nginx-logtool.conf /etc/nginx/sites-available/logtool

# 或直接创建
sudo nano /etc/nginx/sites-available/logtool
```

**重要说明：**
- **有域名**：将 `server_name` 改为你的域名（如：`example.com`）
- **只有 IP**：将 `server_name` 改为你的服务器 IP（如：`192.168.1.100`）
- **接受所有访问**：使用 `server_name _;`（不推荐生产环境，但可以用于测试）

**Nginx 配置包含两个主要功能：**
1. **静态文件服务**：直接返回前端构建的 HTML、JS、CSS 等文件
2. **反向代理**：将 `/api` 请求转发到后端服务（`http://localhost:3000`）
3. **移动端自动检测**：根据 User-Agent 自动将移动设备重定向到 `/m` 路径

**Nginx 配置示例（完整配置）:**

项目已提供完整的 `nginx-logtool.conf` 配置文件，主要内容如下：

```nginx
# 前端静态文件服务
# 说明：
# - 有域名时：server_name example.com;
# - 只有IP时：server_name 192.168.1.100; 或 server_name _;
# - 移动端自动检测：Nginx 会根据 User-Agent 自动将移动设备重定向到 /m 路径

server {
    listen 80;
    server_name 42.121.15.87;  # 改为你的域名或IP，或使用 _ 接受所有访问
    
    # 前端静态文件
    root /var/www/logtool;
    index index.html;

    # 移动设备检测 - 定义移动设备的 User-Agent 模式
    map $http_user_agent $is_mobile {
        default 0;
        ~*android|webos|iphone|ipad|ipod|blackberry|iemobile|opera\smini|mobile|palm|windows\sphone 1;
        ~*Mobile|Mobile|MOBILE 1;
    }

    # 静态资源缓存（优先匹配）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # 后端 API 反向代理 - 将 /api 请求转发到后端
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 移动端路径处理
    location ^~ /m {
        try_files $uri $uri/ /index.html;
    }

    # 主要入口页面 - 移动设备自动重定向
    location = / {
        if ($is_mobile) {
            return 301 /m;
        }
        try_files $uri $uri/ /index.html;
    }

    location = /login {
        if ($is_mobile) {
            return 301 /m/login;
        }
        try_files $uri $uri/ /index.html;
    }

    # 桌面端路径正常处理
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 文件上传大小限制
    client_max_body_size 500M;
}
```

**配置说明：**
- **静态文件服务**：`root /var/www/logtool;` 指向前端构建文件目录
- **反向代理**：`location /api` 将 API 请求转发到 `http://localhost:3000`
- **移动端检测**：`map $http_user_agent $is_mobile` 自动识别移动设备
- **路由支持**：`try_files $uri $uri/ /index.html;` 支持 Vue Router History 模式

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

按以下顺序启动服务：

```bash
# 1. 启动基础服务（MySQL、Redis、PostgreSQL）
sudo systemctl start mysql
sudo systemctl start redis
# sudo systemctl start postgresql  # 如果使用 PostgreSQL

# 2. 启动后端服务（使用 PM2）
cd /path/to/logtool
pm2 start ecosystem.config.js
pm2 save

# 3. 启动 Nginx（静态文件服务和反向代理）
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

部署完成后，请确认以下各项：

- [ ] **环境准备**：所有必需软件已安装并运行（Node.js、MySQL、Redis、Nginx、PM2）
- [ ] **数据库**：数据库已创建并导入结构，角色和权限已初始化
- [ ] **后端配置**：
  - [ ] 后端 `.env` 文件已配置
  - [ ] 后端依赖已安装 (`npm install --production`)
  - [ ] 日志和上传目录已创建并有正确权限
- [ ] **后端部署**：
  - [ ] PM2 配置文件已创建（`ecosystem.config.js`）
  - [ ] PM2 已启动后端应用
  - [ ] PM2 已设置开机自启
- [ ] **前端部署**：
  - [ ] 前端依赖已安装
  - [ ] 前端已构建 (`npm run build`)
  - [ ] 前端静态文件已部署到 `/var/www/logtool`
- [ ] **Nginx 配置**：
  - [ ] Nginx 配置文件已创建并启用
  - [ ] 静态文件服务和反向代理配置正确
  - [ ] Nginx 已重载配置
- [ ] **服务验证**：
  - [ ] 后端 API 可访问（`curl http://localhost:3000/api/health`）
  - [ ] 前端页面可访问
  - [ ] 移动端自动检测正常工作
- [ ] **其他**：
  - [ ] 防火墙规则已配置
  - [ ] SSL 证书已配置（如果使用 HTTPS）
  - [ ] 所有服务已设置开机自启

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

## 移动端和桌面端访问

### 访问地址

部署完成后，通过以下方式访问：

- **桌面端**: `http://your-server-ip` 或 `http://your-domain.com`
  - 例如：`http://192.168.1.100` 或 `http://example.com`
  
- **移动端**: `http://your-server-ip/m` 或 `http://your-domain.com/m`
  - 例如：`http://192.168.1.100/m` 或 `http://example.com/m`

- **后端 API**: `http://your-server-ip/api` 或 `http://your-domain.com/api`
  - 例如：`http://192.168.1.100/api` 或 `http://example.com/api`

- **健康检查**: `http://your-server-ip/api/health`

### 关于域名和 IP

**没有域名也可以使用反向代理：**
- ✅ 使用 IP 地址：在 Nginx 配置中设置 `server_name 192.168.1.100;`（你的服务器IP）
- ✅ 接受所有访问：设置 `server_name _;`（适合测试环境）
- ✅ 域名访问：如果有域名，设置为 `server_name example.com;`

**推荐配置：**
- **内网部署**：使用内网 IP，如 `192.168.1.100`
- **公网部署（无域名）**：使用公网 IP，如 `123.45.67.89`
- **生产环境**：建议配置域名并使用 HTTPS

### 移动端自动检测

**Nginx 已配置自动检测移动设备：**
- ✅ **自动识别**：根据 User-Agent 自动识别移动设备（Android、iOS、iPad 等）
- ✅ **自动重定向**：移动设备访问根路径或主要页面时自动重定向到 `/m` 路径
- ✅ **无需手动切换**：用户不需要手动输入 `/m`，系统会自动判断

**工作流程：**
1. 移动设备访问 `http://your-server-ip/` → 自动重定向到 `http://your-server-ip/m`
2. 移动设备访问 `http://your-server-ip/login` → 自动重定向到 `http://your-server-ip/m/login`
3. 桌面设备访问 → 正常加载桌面端界面
4. 已访问移动端路径 `/m/*` → 不再重定向，正常处理

**检测的移动设备类型：**
- Android 手机/平板
- iPhone/iPad/iPod
- BlackBerry
- Windows Phone
- 其他移动浏览器

### iOS Safari PWA 支持（添加到主屏幕）

**已配置的 PWA 功能：**

✅ **独立 WebView 容器**
- 使用 `apple-mobile-web-app-capable: yes` 配置
- 从主屏幕启动时，应用会在独立的 WebView 容器中运行，类似原生 App

✅ **禁止缩放和滑动**
- 通过 `viewport` meta 标签设置 `user-scalable=no` 和 `maximum-scale=1.0`
- 使用 CSS `overscroll-behavior: none` 禁止页面滑出边界
- 使用 `touch-action: manipulation` 禁止双击缩放

✅ **隐藏地址栏**
- 使用 `apple-mobile-web-app-status-bar-style` 配置状态栏
- 在 standalone 模式下自动隐藏 Safari 地址栏和工具栏

✅ **固定到桌面后使用 Logo**
- 配置了多种尺寸的 `apple-touch-icon`
- 支持 iPhone (120x120, 180x180) 和 iPad (152x152)
- 添加到主屏幕时会自动使用配置的图标

✅ **禁止页面滑出边界**
- 通过 CSS `position: fixed` 和 `overscroll-behavior` 实现
- 内容区域可以滚动，但整体页面不会滑出边界

**使用方法：**

1. **在 iOS Safari 中访问网站**
   - 打开 Safari 浏览器
   - 访问 `http://your-server-ip/m` 或移动端路径

2. **添加到主屏幕**
   - 点击底部的分享按钮（□↑图标）
   - 选择"添加到主屏幕"
   - 可以自定义应用名称（默认显示为 "LogTool"）
   - 点击"添加"

3. **从主屏幕启动**
   - 在主屏幕上找到 LogTool 图标
   - 点击图标启动应用
   - 应用将在独立的全屏 WebView 中运行

**注意事项：**

- ⚠️ **图标文件准备**: 需要准备相应的图标文件（见 `frontend/public/PWA_ICONS_GUIDE.md`）
- ⚠️ **HTTPS 要求**: 生产环境建议使用 HTTPS，某些 PWA 功能在 HTTP 下可能受限
- ⚠️ **首次访问**: 首次从主屏幕启动可能需要加载时间，后续访问会更快

**图标文件准备：**

请参考 `frontend/public/PWA_ICONS_GUIDE.md` 文件，准备以下图标：
- `apple-touch-icon.png` (180x180px)
- `apple-touch-icon-180x180.png`
- `apple-touch-icon-152x152.png`
- `apple-touch-icon-120x120.png`
- `logo-192.png` (192x192px)
- `logo-512.png` (512x512px)

所有图标文件应放置在 `frontend/public/Icons/` 目录下。

### Android Chrome PWA 支持

**Android 端的 PWA 体验：**

✅ **独立应用窗口**
- 从主屏幕启动时，应用在独立窗口中运行
- 无地址栏、无浏览器工具栏
- 全屏显示，类似原生应用

✅ **自动添加到主屏幕提示**
- Chrome 会在满足条件时自动显示"添加到主屏幕"横幅
- 用户也可以手动从菜单添加
- 主屏幕显示应用图标和名称

✅ **禁止缩放和滑动**
- 通过 viewport meta 标签禁止缩放
- 通过 CSS 禁止页面滑出边界
- 内容区域可正常滚动

✅ **主题颜色**
- 状态栏和地址栏使用配置的主题色（#155dfc）
- 启动画面自动应用主题色

✅ **应用图标**
- 使用 manifest.json 中配置的图标
- 支持自适应图标（maskable icons）

**与 iOS 的主要差异：**

| 特性 | Android Chrome | iOS Safari |
|------|----------------|------------|
| 添加到主屏幕 | ✅ 自动提示横幅 | ✅ 手动添加（分享菜单） |
| 弹性滑动 | ✅ 不需要（Chrome 本身没有） | ✅ 需要 CSS 配置 |
| 启动画面 | ✅ 自动生成（基于主题色） | ⚠️ 需要单独配置图片 |
| HTTPS 要求 | ⚠️ 强烈建议（某些功能需要） | ✅ 支持 HTTP |

**使用方法：**

1. 在 Android Chrome 中访问 `http://your-server-ip/m`
2. 等待 Chrome 显示"添加到主屏幕"提示（或手动从菜单添加）
3. 从主屏幕启动应用，享受独立窗口体验

**注意事项：**
- ⚠️ **HTTPS 要求**: 生产环境建议使用 HTTPS，某些 PWA 功能在 HTTP 下可能受限
- ⚠️ **安装条件**: Chrome 需要满足一定条件才会显示自动安装提示（访问次数、时间间隔等）
- ⚠️ **图标文件**: 需要准备 `logo-192.png` 和 `logo-512.png`

详细说明请参考 `frontend/public/ANDROID_PWA_GUIDE.md`。

## 总结

部署完成后，你应该能够通过以下方式访问：

- **前端（桌面端）**: `http://your-server-ip` 或 `http://your-domain.com`
- **前端（移动端）**: `http://your-server-ip/m` 或 `http://your-domain.com/m`
- **后端 API**: `http://your-server-ip/api` 或 `http://your-domain.com/api`
- **健康检查**: `http://your-server-ip/api/health`

如有问题，请参考本文档的"常见问题排查"部分，或查看相应的日志文件。

---

**祝部署顺利！** 🚀

