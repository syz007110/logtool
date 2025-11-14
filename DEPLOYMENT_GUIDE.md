# LogTool 服务器部署指南

本文档提供 LogTool 项目在 **Windows** 和 **Ubuntu/Linux** 服务器上的完整部署方案。

## 📋 目录

1. [环境要求](#环境要求)
2. [环境准备](#环境准备)
   - [Ubuntu/Linux 环境准备](#ubuntu-linux-环境准备)
   - [Windows 环境准备](#windows-环境准备)
3. [数据库配置](#数据库配置)
4. [项目配置](#项目配置)
5. [后端部署（使用 PM2）](#后端部署使用-pm2)
   - [Ubuntu/Linux 后端部署](#ubuntu-linux-后端部署)
   - [Windows 后端部署](#windows-后端部署)
6. [前端部署](#前端部署)
7. [Nginx 配置](#nginx-配置)
   - [Ubuntu/Linux Nginx 配置](#ubuntu-linux-nginx-配置)
   - [Windows Nginx 配置](#windows-nginx-配置)
8. [服务启动和监控](#服务启动和监控)
9. [自启动配置](#自启动配置)
   - [Ubuntu/Linux 自启动配置](#ubuntu-linux-自启动配置)
   - [Windows 自启动配置](#windows-自启动配置)
10. [防火墙配置](#防火墙配置)
11. [域名访问配置](#域名访问配置)
12. [常见问题排查](#常见问题排查)
13. [部署检查清单](#部署检查清单)
14. [移动端和桌面端访问](#移动端和桌面端访问)

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

- **操作系统**: 
  - Ubuntu 20.04+, CentOS 7+, Debian 10+ (Linux)
  - Windows 10/11, Windows Server 2016+ (Windows)
- **内存**: 至少 4GB (推荐 8GB+)
- **磁盘空间**: 至少 20GB 可用空间
- **CPU**: 2 核以上 (推荐 4 核+)

---

## 环境准备

### Ubuntu/Linux 环境准备

#### 1. 更新系统包

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

#### 2. 安装 Node.js

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

#### 3. 安装 MySQL

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

#### 4. 安装 Redis

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

#### 5. 安装 PostgreSQL (可选)

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib -y

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib -y
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 6. 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

#### 7. 安装 PM2 (进程管理工具)

```bash
sudo npm install -g pm2
```

---

### Windows 环境准备

#### 1. 安装必需软件

**Node.js**
- 下载：https://nodejs.org/ (推荐 LTS 版本 16+)
- 安装后验证：
```cmd
node --version
npm --version
```

**MySQL**
- 下载：https://dev.mysql.com/downloads/mysql/
- 安装 MySQL 8.0+
- 启动 MySQL 服务（Windows 服务）

**Redis**
- 项目已包含 Redis（`infrastructure/Redis/`）
- 或下载：https://github.com/microsoftarchive/redis/releases
- 启动方式：使用项目提供的 `start-redis.bat`

**PostgreSQL（可选，用于手术分析）**
- 下载：https://www.postgresql.org/download/windows/
- 安装 PostgreSQL 12+

**Nginx（Windows 版）**
- 下载：http://nginx.org/en/download.html
- 解压到 `C:\nginx` 或自定义路径

#### 2. 检查端口占用

```cmd
# 检查常用端口
netstat -ano | findstr :3000
netstat -ano | findstr :80
netstat -ano | findstr :6379
netstat -ano | findstr :3306
```

#### 3. 安装 PM2

```cmd
npm install -g pm2
npm install -g pm2-windows-startup
```

---

## 数据库配置

### 1. 创建 MySQL 数据库

**Ubuntu/Linux:**
```bash
mysql -u root -p
```

**Windows:**
使用 MySQL Workbench 或命令行

**SQL 命令（通用）:**
```sql
CREATE DATABASE IF NOT EXISTS logtool 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;
```

### 2. 导入数据库结构

**Ubuntu/Linux:**
```bash
cd /path/to/logtool/infrastructure/database
mysql -u root -p logtool < init_database.sql
```

**Windows:**
- **方法1：使用 MySQL Workbench**
  1. 打开 MySQL Workbench
  2. 连接到数据库服务器
  3. 选择 `logtool` 数据库
  4. 导入 `infrastructure/database/init_database.sql`

- **方法2：使用命令行**
```cmd
cd infrastructure\database
mysql -u root -p logtool < init_database.sql
```

### 3. 初始化角色和权限

**Ubuntu/Linux:**
```bash
cd /path/to/logtool/backend
npm install
npm run init-roles
npm run init-permissions
```

**Windows:**
```cmd
cd backend
npm install
npm run init-roles
npm run init-permissions
```

---

## 项目配置

### 1. 克隆或确认项目代码

**Ubuntu/Linux:**
```bash
# 如果已通过 git 下载，确认在正确的目录
cd /path/to/logtool

# 如果还未下载，可以克隆
# git clone <repository-url> /path/to/logtool
```

**Windows:**
```cmd
cd D:\code\Log\v0.1.1\logtool
```

### 2. 安装项目依赖

**生产环境推荐使用 `npm ci`（确保依赖版本一致）：**

**Ubuntu/Linux:**
```bash
# 安装后端依赖
cd backend
npm ci

# 安装前端依赖
cd ../frontend
npm ci
```

**Windows:**
```cmd
# 后端依赖
cd backend
npm ci

# 前端依赖
cd ..\frontend
npm ci
```

**说明：**
- `npm ci` 基于 `package-lock.json` 精确安装，确保生产环境与开发环境依赖版本一致
- 比 `npm install` 更快、更可靠
- 如果 `package-lock.json` 与 `package.json` 不匹配会报错，避免版本不一致问题
- **重要**：确保 `package-lock.json` 已提交到代码库

**如果前端只需要构建（不需要 devDependencies）：**
```bash
# Ubuntu/Linux
cd frontend
npm ci --production
npm run build
```

```cmd
# Windows
cd frontend
npm ci --production
npm run build
```

### 3. 配置后端环境变量

**Ubuntu/Linux:**
```bash
# 进入后端目录
cd /path/to/logtool/backend

# 创建 .env 文件 (如果没有)
cp .env.example .env  # 如果有示例文件
# 或直接创建
nano .env
```

**Windows:**
在 `backend` 目录创建 `.env` 文件

**后端 `.env` 配置示例（生产环境）:**

```env
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

### 4. 构建前端

**Ubuntu/Linux:**
```bash
cd /path/to/logtool/frontend
npm run build
```

**Windows:**
```cmd
cd frontend
npm run build
```

构建完成后，前端文件在 `frontend/dist/` 目录。

---

## 后端部署（使用 PM2）

### Ubuntu/Linux 后端部署

#### 1. 创建必要的目录

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

#### 2. 测试后端启动

```bash
cd /path/to/logtool/backend

# 测试启动（手动运行，确认无错误后 Ctrl+C 停止）
npm start
```

如果启动成功，应该能看到服务运行在配置的端口上。

#### 3. 配置 PM2 进程管理

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

#### 4. 使用 PM2 启动后端服务

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

#### 5. PM2 常用管理命令

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

### Windows 后端部署

#### 1. 配置 PM2 启动脚本

项目根目录已有 `ecosystem.config.js`，Windows 上可以直接使用，但需要调整路径：

```javascript
module.exports = {
  apps: [
    {
      name: 'logtool-backend',
      script: './backend/src/app.js',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './backend/logs/pm2-error.log',
      out_file: './backend/logs/pm2-out.log',
      // Windows 路径使用正斜杠或双反斜杠
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      watch: false
    }
  ]
};
```

#### 2. 启动服务

```cmd
# 进入项目根目录
cd D:\code\Log\v0.1.1\logtool

# 启动后端
pm2 start ecosystem.config.js --only logtool-backend

# 或启动集群模式
pm2 start ecosystem.config.js --only logtool-cluster

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 保存配置
pm2 save
```

#### 3. 配置 PM2 开机自启

Windows 上配置 PM2 自启动有几种方法，推荐使用方法1。

**方法1：使用 pm2-windows-startup（推荐）**

**步骤：**

1. **安装 pm2-windows-startup**（如果还没安装）：

**⚠️ 重要：必须以管理员身份运行 PowerShell 或 CMD**

```cmd
npm install -g pm2-windows-startup
```

**如果遇到权限错误（EPERM）：**
- 确保以管理员身份运行（右键点击 PowerShell/CMD，选择"以管理员身份运行"）
- 或者使用 `--prefix` 安装到用户目录：
```cmd
npm install -g pm2-windows-startup --prefix %APPDATA%\npm
```

2. **启动应用并保存**：
```cmd
# 进入项目根目录
cd D:\project\logtool

# 启动应用
pm2 start ecosystem.config.js --only logtool-cluster

# 保存进程列表
pm2 save
```

3. **配置开机自启**：

**⚠️ 重要：必须以管理员身份运行**

**方法A：使用 npx（推荐，最简单，无需添加到 PATH）**

```cmd
# ⚠️ 注意：在 Windows 上不要使用 pm2 startup（会报错 "Init system not found"）
# 使用 npx 运行 pm2-windows-startup（以管理员身份运行）
npx pm2-windows-startup install
```

**方法B：直接使用命令（如果已添加到 PATH）**

```cmd
# ⚠️ 注意：在 Windows 上不要使用 pm2 startup（会报错 "Init system not found"）
# 直接使用 pm2-windows-startup install（以管理员身份运行）
pm2-windows-startup install
```

**如果命令找不到 `pm2-windows-startup`：**
- ✅ **推荐**：使用 `npx pm2-windows-startup install`（无需添加到 PATH）
- 检查是否已安装：`npm list -g pm2-windows-startup`
- 如果未安装，参考步骤1重新安装
- 如果已安装但找不到，可能需要将 npm 全局路径添加到系统 PATH

**重要提示**：
- ❌ **不要使用** `pm2 startup`（这是 Linux/Ubuntu 的命令，Windows 上会报错）
- ✅ **直接使用** `pm2-windows-startup install`（需要管理员权限）
- ⚠️ **安装和配置都需要管理员权限**

5. **验证配置**：
```cmd
# 查看 PM2 状态
pm2 status

# 重启电脑测试是否自动启动
```

**管理命令：**
```cmd
# 卸载自启动（使用 npx 或直接命令）
npx pm2-windows-startup uninstall
# 或
pm2-windows-startup uninstall

# 查看自启动状态（使用 npx 或直接命令）
npx pm2-windows-startup status
# 或
pm2-windows-startup status
```

**方法2：使用 Windows 任务计划程序（备选方案）**

如果方法1不工作，可以使用任务计划程序：

**步骤：**

1. 按 `Win + R`，输入 `taskschd.msc`，打开"任务计划程序"

2. 创建基本任务：
   - **名称**：PM2 LogTool 自启动
   - **描述**：LogTool 后端服务开机自启动

3. 设置触发器：
   - 选择"当计算机启动时"

4. 设置操作：
   - 选择"启动程序"
   - **程序或脚本**：`C:\Users\<用户名>\AppData\Roaming\npm\pm2.cmd`（或 pm2 的完整路径）
   - **参数**：`resurrect`
   - **起始于**：`D:\code\Log\v0.1.1\logtool`（项目根目录）

5. 完成创建

**或者使用命令行创建**（以管理员身份）：
```cmd
schtasks /create /tn "PM2 LogTool AutoStart" /tr "pm2 resurrect" /sc onstart /ru SYSTEM /rl HIGHEST /f
```

**方法3：使用 NSSM 注册为服务（最可靠）**

如果需要更可靠的服务管理，可以使用 NSSM：

**步骤1：创建启动脚本 `start-pm2.bat`**

在项目根目录创建 `start-pm2.bat` 文件：

```batch
@echo off
REM 设置环境变量（关键！）
REM 方法1：使用环境变量（如果服务以用户账户运行）
REM set HOMEPATH=%USERPROFILE%
REM set USERPROFILE=%USERPROFILE%
REM set PM2_HOME=%USERPROFILE%\.pm2

REM 方法2：硬编码用户路径（推荐，因为服务可能以 SYSTEM 账户运行）
REM 请根据实际用户名修改下面的路径
set HOMEPATH=C:\Users\songyz1
set USERPROFILE=C:\Users\songyz1
set PM2_HOME=C:\Users\songyz1\.pm2

REM 切换到项目目录
cd /d D:\project\logtool
REM 执行 PM2 resurrect
D:\tool\node\node_global\pm2.cmd resurrect
```

**重要提示**：
- 将 `C:\Users\songyz1` 替换为你的实际用户名
- 将 `D:\project\logtool` 替换为你的实际项目路径
- 将 `D:\tool\node\node_global\pm2.cmd` 替换为你的 PM2 实际路径

**步骤2：确保 PM2 已保存进程列表**

```cmd
cd D:\project\logtool
pm2 save
```

**步骤3：使用 NSSM 注册服务**

有两种方式：

**方法A：使用批处理脚本（推荐）**

```cmd
cd C:\nssm-2.24\win64

# 停止并删除旧服务（如果存在）
nssm stop PM2-LogTool
nssm remove PM2-LogTool confirm

# 安装服务（使用批处理脚本）
nssm install PM2-LogTool "D:\project\logtool\start-pm2.bat"

# 设置工作目录
nssm set PM2-LogTool AppDirectory "D:\project\logtool"

# 设置日志输出
nssm set PM2-LogTool AppStdout "D:\project\logtool\backend\logs\pm2-service-stdout.log"
nssm set PM2-LogTool AppStderr "D:\project\logtool\backend\logs\pm2-service-stderr.log"

# 设置启动类型
nssm set PM2-LogTool Start SERVICE_AUTO_START

# 启动服务
nssm start PM2-LogTool

# 查看服务状态
nssm status PM2-LogTool
```

**方法B：直接使用 PM2 命令（不使用批处理脚本）**

```cmd
cd C:\nssm-2.24\win64

# 停止并删除旧服务（如果存在）
nssm stop PM2-LogTool
nssm remove PM2-LogTool confirm

# 安装服务（直接使用 PM2 命令）
nssm install PM2-LogTool "D:\tool\node\node_global\pm2.cmd"

# 设置启动参数
nssm set PM2-LogTool AppParameters "resurrect"

# 设置工作目录
nssm set PM2-LogTool AppDirectory "D:\project\logtool"

# 重要：设置环境变量（解决 HOMEPATH 问题）
# PM2 需要 HOMEPATH 和 PM2_HOME 环境变量来找到 .pm2 目录
# 注意：NSSM 设置多个环境变量需要多次调用，或使用 GUI 编辑器

# 方法1：使用命令行（需要多次调用）
nssm set PM2-LogTool AppEnvironmentExtra "HOMEPATH=C:\Users\songyz1"
nssm set PM2-LogTool AppEnvironmentExtra "USERPROFILE=C:\Users\songyz1"
nssm set PM2-LogTool AppEnvironmentExtra "PM2_HOME=C:\Users\songyz1\.pm2"

# 方法2：使用 GUI 编辑器设置环境变量（推荐，更直观）
# nssm edit PM2-LogTool
# 在 GUI 中：
# 1. 点击 "Environment" 标签
# 2. 添加：HOMEPATH=C:\Users\songyz1
# 3. 添加：USERPROFILE=C:\Users\songyz1
# 4. 添加：PM2_HOME=C:\Users\songyz1\.pm2
# 5. 点击 "Set" 保存

# 设置日志输出
nssm set PM2-LogTool AppStdout "D:\project\logtool\backend\logs\pm2-service-stdout.log"
nssm set PM2-LogTool AppStderr "D:\project\logtool\backend\logs\pm2-service-stderr.log"

# 设置启动类型
nssm set PM2-LogTool Start SERVICE_AUTO_START

# 启动服务
nssm start PM2-LogTool

# 查看服务状态
nssm status PM2-LogTool
```

**注意**：
- 方法A（批处理脚本）更简单可靠，推荐使用
- 方法B（直接命令）需要手动设置环境变量，如果环境变量设置不正确，PM2 可能找不到 dump 文件
- 如果使用方法B，确保将 `C:\Users\songyz1` 替换为你的实际用户名

**步骤4：验证服务**

```cmd
# 查看日志
type D:\project\logtool\backend\logs\pm2-service-stderr.log
type D:\project\logtool\backend\logs\pm2-service-stdout.log

# 检查 PM2 进程
pm2 list
```

**常见问题**：

1. **错误：`[PM2][ERROR] No processes saved; DUMP file doesn't exist`**
   - 原因：PM2 找不到 dump 文件，通常是因为 `PM2_HOME` 环境变量未设置
   - 解决：确保 `start-pm2.bat` 中设置了 `PM2_HOME` 环境变量，指向正确的用户目录

2. **错误：`[PM2][Initialization] Defaulting to /etc/.pm2`**
   - 原因：服务以 SYSTEM 账户运行，找不到用户目录
   - 解决：在批处理脚本中硬编码用户路径（如 `C:\Users\songyz1`）

3. **服务状态为 `SERVICE_PAUSED`**
   - 查看错误日志：`type D:\project\logtool\backend\logs\pm2-service-stderr.log`
   - 检查环境变量是否正确设置
   - 尝试手动运行批处理脚本：`D:\project\logtool\start-pm2.bat`

**推荐使用方法3（NSSM）**，最可靠且易于管理。

---

## 前端部署

### 1. 构建前端生产版本

**Ubuntu/Linux:**
```bash
cd /path/to/logtool/frontend

# 安装依赖（如果还没安装）
npm install

# 构建生产版本
npm run build

# 构建完成后，dist 目录包含所有静态文件
```

**Windows:**
```cmd
cd frontend
npm run build
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

**Ubuntu/Linux:**
```bash
# 将构建好的文件复制到 Nginx 目录
sudo mkdir -p /var/www/logtool
sudo cp -r /path/to/logtool/frontend/dist/* /var/www/logtool/

# 设置权限
sudo chown -R www-data:www-data /var/www/logtool
sudo chmod -R 755 /var/www/logtool
```

**Windows:**
```cmd
# 创建目录
mkdir C:\www\logtool

# 复制前端构建文件
xcopy /E /I frontend\dist\* C:\www\logtool\
```

---

## Nginx 配置

### Ubuntu/Linux Nginx 配置

#### 1. 创建 Nginx 配置文件

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

#### 2. 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/logtool /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

#### 3. SSL/HTTPS 配置（可选但推荐）

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

### Windows Nginx 配置

#### 1. 修改 Nginx 配置文件

编辑 `nginx.conf`（或 Nginx 安装目录的 `conf/nginx.conf`）：

**重要修改点：**
- 将 Linux 路径改为 Windows 路径
- 修改 `server_name` 为你的 IP 或域名
- 修改 `root` 路径为前端构建文件目录

```nginx
# Windows 路径示例
server {
    listen 80;
    # 局域网访问：使用内网 IP 或域名
    # 外网访问：使用公网 IP 或域名，或使用 _ 接受所有访问
    server_name 192.168.1.100;  # 改为你的内网 IP
    # 或 server_name _;  # 接受所有访问（测试用）
    
    # Windows 路径（使用正斜杠或双反斜杠）
    root C:/www/logtool;  # 或 C:\\www\\logtool
    index index.html;
    
    # 日志配置（Windows 路径）
    access_log C:/nginx/logs/logtool-access.log;
    error_log C:/nginx/logs/logtool-error.log;
    
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

#### 2. 创建前端文件目录

```cmd
# 创建目录
mkdir C:\www\logtool

# 复制前端构建文件
xcopy /E /I frontend\dist\* C:\www\logtool\
```

#### 3. 测试 Nginx 配置

```cmd
cd C:\nginx
nginx.exe -t
```

#### 4. 启动 Nginx

```cmd
# 启动
nginx.exe

# 停止
nginx.exe -s stop

# 重载配置
nginx.exe -s reload
```

**注意**：`nginx.exe` 是手动启动方式，不会自动启动。如需开机自启，请参考"自启动配置"章节。

#### 5. 将 Nginx 注册为 Windows 服务（推荐）

使用 NSSM（Non-Sucking Service Manager）：

1. 下载 NSSM：https://nssm.cc/download
2. 解压到 `C:\nssm`
3. 注册服务：

```cmd
cd C:\nssm\win64
nssm install Nginx "C:\nginx\nginx.exe"
nssm set Nginx AppDirectory "C:\nginx"
nssm start Nginx
```

---

## 服务启动和监控

### Ubuntu/Linux 服务启动

#### 1. 启动顺序

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

#### 2. 验证服务

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

#### 3. 设置开机自启

```bash
# MySQL, Redis, PostgreSQL, Nginx 已通过 systemctl enable 设置

# PM2 开机自启
pm2 startup
# 执行输出的命令
pm2 save
```

---

### Windows 服务启动

#### 1. 启动顺序

按以下顺序启动服务：

```cmd
# 1. 启动基础服务（MySQL、Redis）
# MySQL 通常已作为 Windows 服务运行
# Redis 需要手动启动或配置为服务

# 2. 启动后端服务（使用 PM2）
cd D:\code\Log\v0.1.1\logtool
pm2 start ecosystem.config.js --only logtool-cluster
pm2 save

# 3. 启动 Nginx（静态文件服务和反向代理）
cd C:\nginx
nginx.exe
```

#### 2. 验证服务

```cmd
# 检查后端 API（使用 PowerShell）
Invoke-WebRequest -Uri http://localhost:3000/api/health -UseBasicParsing

# 检查前端（使用 PowerShell）
Invoke-WebRequest -Uri http://localhost:80 -UseBasicParsing

# 检查 Redis
cd D:\code\Log\v0.1.1\logtool\infrastructure\Redis
redis-cli ping

# 检查 PM2
pm2 status
pm2 logs --lines 50
```

#### 3. 快速启动脚本

创建 `start-production.bat`：

```batch
@echo off
chcp 65001
title LogTool Production Startup

echo ========================================
echo    LogTool Production Startup
echo ========================================
echo.

echo [1/4] Starting Redis...
cd /d "%~dp0infrastructure\Redis"
start "Redis" redis-server.exe redis.conf
timeout /t 2 /nobreak >nul

echo [2/4] Starting Backend with PM2...
cd /d "%~dp0"
pm2 start ecosystem.config.js --only logtool-cluster
timeout /t 3 /nobreak >nul

echo [3/4] Starting Nginx...
cd /d "C:\nginx"
nginx.exe
timeout /t 2 /nobreak >nul

echo [4/4] Checking services...
echo.
echo Redis Status:
redis-cli ping
echo.
echo PM2 Status:
pm2 status
echo.
echo Nginx Status:
tasklist | findstr nginx.exe
echo.
echo ========================================
echo    All services started!
echo ========================================
echo.
echo Access URLs:
echo   - Frontend: http://your-ip-or-domain
echo   - Backend API: http://your-ip-or-domain/api
echo.
pause
```

---

## 自启动配置

### Ubuntu/Linux 自启动配置

#### 1. Redis 自启动

```bash
# 启动并设置开机自启
sudo systemctl start redis
sudo systemctl enable redis
```

#### 2. 后端服务自启动

使用 PM2：

```bash
pm2 startup
# 执行输出的命令
pm2 save
```

#### 3. Nginx 自启动

```bash
sudo systemctl enable nginx
```

---

### Windows 自启动配置

#### 1. Redis 自启动

**方法1：使用 NSSM 注册为服务（推荐）**

NSSM (Non-Sucking Service Manager) 是最简单可靠的方式。

**步骤：**

1. **下载 NSSM**：
   - 下载地址：https://nssm.cc/download
   - 解压到 `C:\nssm`（或任意目录）

2. **注册 Redis 服务**（以管理员身份运行 CMD）：

```cmd
# 进入 NSSM 目录（根据你的实际路径调整）
cd C:\nssm\win64

# 安装 Redis 服务（替换为你的实际路径）
nssm install Redis "D:\code\Log\v0.1.1\logtool\infrastructure\Redis\redis-server.exe"

# 设置工作目录（重要：必须先设置工作目录）
nssm set Redis AppDirectory "D:\code\Log\v0.1.1\logtool\infrastructure\Redis"

# 设置启动参数（使用相对路径，只写文件名）
# 注意：必须使用相对路径，因为 AppDirectory 已经设置了工作目录
nssm set Redis AppParameters "redis.conf"

# 设置服务描述
nssm set Redis Description "LogTool Redis Server"

# 设置启动类型为自动
nssm set Redis Start SERVICE_AUTO_START

# 启动服务
nssm start Redis
```

**管理服务：**

```cmd
# 启动服务
nssm start Redis

# 停止服务
nssm stop Redis

# 重启服务
nssm restart Redis

# 查看服务状态
nssm status Redis

# 删除服务（卸载）
nssm remove Redis confirm
```

**方法2：使用 Windows 任务计划程序**

适合不想安装额外工具的情况。

**步骤：**

1. 按 `Win + R`，输入 `taskschd.msc`，打开"任务计划程序"
2. 点击右侧"创建基本任务"
3. 填写任务信息：
   - **名称**：Redis 自启动
   - **描述**：LogTool Redis 服务开机自启动
4. 设置触发器：
   - 选择"当计算机启动时"
5. 设置操作：
   - 选择"启动程序"
   - **程序或脚本**：`D:\code\Log\v0.1.1\logtool\infrastructure\Redis\redis-server.exe`
   - **参数**：`redis.conf`（使用相对路径，因为"起始于"已设置工作目录）
   - **起始于**：`D:\code\Log\v0.1.1\logtool\infrastructure\Redis`（工作目录）
6. 完成创建

**方法3：使用 sc.exe 创建服务（如果 Redis 提供 RedisService.exe）**

如果 Redis 目录中有 `RedisService.exe`，可以使用 Windows 内置的 `sc.exe`：

```cmd
# 以管理员身份运行
sc.exe create Redis binpath="D:\code\Log\v0.1.1\logtool\infrastructure\Redis\RedisService.exe" start= auto

# 启动服务
net start Redis

# 停止服务
net stop Redis

# 删除服务
sc.exe delete Redis
```

**注意**：此方法需要 `RedisService.exe`，如果只有 `redis-server.exe`，请使用方法1或方法2。

**验证 Redis 自启动：**

```cmd
# 方法1：检查服务状态（NSSM 或 sc.exe）
sc query Redis

# 方法2：检查进程
tasklist | findstr redis-server.exe

# 方法3：测试连接
cd D:\code\Log\v0.1.1\logtool\infrastructure\Redis
redis-cli ping
# 应该返回: PONG
```

#### 2. 后端服务自启动

参考"Windows 后端部署"章节中的"配置 PM2 开机自启"部分。

#### 3. Nginx 自启动

使用 NSSM 注册为服务（见"Windows Nginx 配置"章节）。

---

## 防火墙配置

### Ubuntu/Linux 防火墙配置

#### 1. 使用 UFW（Ubuntu 默认防火墙）

```bash
# 开放 HTTP 端口
sudo ufw allow 80/tcp

# 开放后端 API 端口（如果直接访问）
sudo ufw allow 3000/tcp

# 开放 Redis 端口（如果需要外部访问）
sudo ufw allow 6379/tcp

# 启用防火墙
sudo ufw enable

# 查看防火墙状态
sudo ufw status
```

#### 2. 使用 firewalld（CentOS/RHEL）

```bash
# 开放 HTTP 端口
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

### Windows 防火墙配置

#### 1. 开放端口（Windows 防火墙）

**方法1：使用图形界面**
1. 打开"Windows Defender 防火墙"
2. 点击"高级设置"
3. 选择"入站规则" → "新建规则"
4. 选择"端口" → "TCP"
5. 输入端口：`80`, `3000`, `6379`（根据需要）
6. 允许连接
7. 应用到所有配置文件
8. 命名规则（如：LogTool HTTP）

**方法2：使用命令行（管理员权限）**

```cmd
# 开放 HTTP 端口
netsh advfirewall firewall add rule name="LogTool HTTP" dir=in action=allow protocol=TCP localport=80

# 开放后端 API 端口（如果直接访问）
netsh advfirewall firewall add rule name="LogTool API" dir=in action=allow protocol=TCP localport=3000

# 开放 Redis 端口（如果需要外部访问）
netsh advfirewall firewall add rule name="Redis" dir=in action=allow protocol=TCP localport=6379
```

#### 2. 检查防火墙规则

```cmd
netsh advfirewall firewall show rule name="LogTool HTTP"
```

---

## 域名访问配置

### 方案一：局域网内使用域名（推荐）

#### 1. 固定服务器 IP

在路由器中设置 DHCP 保留，将服务器 MAC 地址绑定到固定 IP（如 `192.168.1.100`）。

#### 2. 配置 hosts 文件（每台访问的电脑）

**Windows:**
编辑 `C:\Windows\System32\drivers\etc\hosts`（需要管理员权限）：
```
192.168.1.100 logtool.local
192.168.1.100 www.logtool.local
```
刷新 DNS 缓存：
```cmd
ipconfig /flushdns
```

**Ubuntu/Linux:**
编辑 `/etc/hosts`（需要 sudo 权限）：
```
192.168.1.100 logtool.local
192.168.1.100 www.logtool.local
```

#### 3. 修改 Nginx 配置

```nginx
server {
    listen 80;
    server_name logtool.local www.logtool.local;
    # 或同时支持 IP 访问
    # server_name logtool.local www.logtool.local 192.168.1.100;
    
    root /var/www/logtool;  # Ubuntu/Linux
    # root C:/www/logtool;  # Windows
    
    # ... 其他配置
}
```

#### 4. 访问测试

浏览器访问：`http://logtool.local`

### 方案二：自建内网 DNS 服务器

如果需要多台电脑访问，可以搭建内网 DNS：

1. **使用 dnsmasq（WSL 或 Docker）**
2. **使用 Windows DNS Server**（需要 Windows Server）
3. **使用路由器 DNS 功能**（如果路由器支持）

### 方案三：外网访问

#### 1. 使用内网穿透（推荐，最简单）

**使用 ngrok：**
```bash
# Ubuntu/Linux
# 下载 ngrok: https://ngrok.com/download
ngrok config add-authtoken YOUR_TOKEN
ngrok http 80
```

```cmd
# Windows
# 下载 ngrok: https://ngrok.com/download
ngrok config add-authtoken YOUR_TOKEN
ngrok http 80
```

**使用 frp：**
需要一台有公网 IP 的服务器作为中转。

#### 2. 使用端口映射（需要公网 IP）

1. 在路由器配置端口转发：
   - 外部端口：80
   - 内部 IP：你的电脑内网 IP
   - 内部端口：80

2. 配置动态域名（DDNS）：
   - 使用花生壳、No-IP 等服务
   - 在路由器或电脑上配置 DDNS 客户端

3. 修改 Nginx 配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 你的域名
    # 或 server_name _;  # 接受所有访问
    # ... 其他配置
}
```

---

## 常见问题排查

### Ubuntu/Linux 常见问题

#### 1. 后端服务无法启动

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

#### 2. 数据库连接失败

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

#### 3. Redis 连接失败

```bash
# 检查 Redis 服务
sudo systemctl status redis
redis-cli ping

# 检查 Redis 配置
sudo nano /etc/redis/redis.conf
# 确认 bind 和 requirepass 设置
```

#### 4. 前端无法访问后端 API

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

#### 5. PM2 进程频繁重启

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

#### 6. 文件上传失败

```bash
# 检查上传目录权限
ls -la /path/to/logtool/backend/uploads/
sudo chown -R $USER:$USER /path/to/logtool/backend/uploads/
sudo chmod -R 755 /path/to/logtool/backend/uploads/

# 检查 Nginx 上传大小限制
# 在 Nginx 配置中设置 client_max_body_size
```

---

### Windows 常见问题

#### 1. 端口被占用

```cmd
# 查看端口占用
netstat -ano | findstr :80
netstat -ano | findstr :3000

# 结束进程（替换 PID）
taskkill /PID <PID> /F
```

#### 2. Nginx 无法启动

- 检查配置文件语法：`nginx.exe -t`
- 检查端口是否被占用
- 检查路径是否正确（Windows 路径格式）
- 查看错误日志：`C:\nginx\logs\error.log`

#### 3. 后端无法连接数据库

- 检查 MySQL 服务是否启动
- 检查 `.env` 配置是否正确
- 检查防火墙是否阻止连接
- 测试连接：`mysql -u root -p -h localhost`

#### 4. Redis 连接失败

- 检查 Redis 是否启动：`redis-cli ping`
- 检查端口是否正确
- 检查防火墙设置

#### 5. 前端页面空白或 404

- 检查 Nginx `root` 路径是否正确
- 检查前端文件是否已构建并复制到正确位置
- 检查 Nginx 配置中的 `try_files` 设置

#### 6. PM2 进程无法启动

- 检查 Node.js 版本：`node --version`（需要 16+）
- 检查依赖是否安装：`cd backend && npm install`
- 查看 PM2 日志：`pm2 logs`

#### 6.1. PM2 startup 报错 "Init system not found"

**错误信息：**
```
[PM2][ERROR] Init system not found
Error: Init system not found
```

**原因：**
- `pm2 startup` 是 Linux/Ubuntu 的命令，在 Windows 上不支持
- Windows 需要使用 `pm2-windows-startup` 包

**解决方法：**

1. **安装 pm2-windows-startup**（如果还没安装）：

**⚠️ 必须以管理员身份运行 PowerShell 或 CMD**

```cmd
# 以管理员身份打开 PowerShell 或 CMD，然后执行：
npm install -g pm2-windows-startup
```

**如果遇到权限错误（EPERM）：**
- 确保以管理员身份运行（右键点击 PowerShell/CMD，选择"以管理员身份运行"）
- 或者使用 `--prefix` 安装到用户目录：
```cmd
npm install -g pm2-windows-startup --prefix %APPDATA%\npm
```

2. **配置开机自启**（不要使用 `pm2 startup`）：

**方法A：使用 npx（推荐，最简单）**

```cmd
# 以管理员身份运行，使用 npx 无需添加到 PATH
npx pm2-windows-startup install
```

**方法B：直接使用命令（如果已添加到 PATH）**

```cmd
# 以管理员身份运行
pm2-windows-startup install
```

3. **验证安装**：
```cmd
# 使用 npx
npx pm2-windows-startup status

# 或直接使用（如果已添加到 PATH）
pm2-windows-startup status
```

**注意：**
- ❌ **不要使用** `pm2 startup`（这是 Linux 命令）
- ✅ **使用** `pm2-windows-startup install`（Windows 专用）
- ⚠️ **安装和配置都需要管理员权限**

#### 6.2. pm2-windows-startup 命令找不到

**错误信息：**
```
'pm2-windows-startup' 不是内部或外部命令，也不是可运行的程序或批处理文件。
```

**原因：**
- `pm2-windows-startup` 未安装
- npm 全局路径未添加到系统 PATH

**解决方法：**

**✅ 最简单的方法：使用 npx（推荐）**

无需添加到 PATH，直接使用：
```cmd
# 以管理员身份运行
npx pm2-windows-startup install
```

**其他方法：**

1. **检查是否已安装**：
```cmd
npm list -g pm2-windows-startup
```

2. **如果未安装，以管理员身份安装**：
```cmd
# 以管理员身份打开 PowerShell 或 CMD
npm install -g pm2-windows-startup
```

3. **如果已安装但找不到，检查 npm 全局路径**：
```cmd
npm config get prefix
```

4. **将 npm 全局路径添加到系统 PATH**：
   - 打开"系统属性" → "高级" → "环境变量"
   - 在"系统变量"中找到 `Path`，点击"编辑"
   - 添加 npm 全局路径（例如：`C:\Program Files\nodejs\node_global`）
   - 或者添加用户 npm 路径（例如：`%APPDATA%\npm`）
   - 重启命令行窗口

5. **或者使用完整路径**：
```cmd
# 找到 pm2-windows-startup.cmd 的完整路径，例如：
"C:\Program Files\nodejs\node_global\pm2-windows-startup.cmd" install
```

#### 7. 局域网无法访问

- 检查 Windows 防火墙规则
- 检查 Nginx `server_name` 配置
- 检查路由器端口转发（如果从外网访问）
- 使用 `ipconfig` 查看本机 IP 地址

#### 8. 域名无法解析

- 检查 hosts 文件是否正确配置
- 刷新 DNS 缓存：`ipconfig /flushdns`
- 检查 Nginx `server_name` 是否匹配域名

---

## 部署检查清单

部署完成后，请确认以下各项：

- [ ] **环境准备**：所有必需软件已安装并运行（Node.js、MySQL、Redis、Nginx、PM2）
- [ ] **数据库**：数据库已创建并导入结构，角色和权限已初始化
- [ ] **后端配置**：
  - [ ] 后端 `.env` 文件已配置
  - [ ] 后端依赖已安装 (`npm ci`)
  - [ ] 日志和上传目录已创建并有正确权限
- [ ] **后端部署**：
  - [ ] PM2 配置文件已创建（`ecosystem.config.js`）
  - [ ] PM2 已启动后端应用
  - [ ] PM2 已设置开机自启
- [ ] **前端部署**：
  - [ ] 前端依赖已安装
  - [ ] 前端已构建 (`npm run build`)
  - [ ] 前端静态文件已部署到正确位置（`/var/www/logtool` 或 `C:\www\logtool`）
- [ ] **Nginx 配置**：
  - [ ] Nginx 配置文件已创建并启用
  - [ ] 静态文件服务和反向代理配置正确
  - [ ] Nginx 已重载配置
- [ ] **服务验证**：
  - [ ] 后端 API 可访问（`curl http://localhost:3000/api/health` 或 `Invoke-WebRequest`）
  - [ ] 前端页面可访问
  - [ ] 移动端自动检测正常工作
- [ ] **其他**：
  - [ ] 防火墙规则已配置
  - [ ] SSL 证书已配置（如果使用 HTTPS）
  - [ ] 所有服务已设置开机自启

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

---

## 总结

部署完成后，你应该能够通过以下方式访问：

- **前端（桌面端）**: `http://your-server-ip` 或 `http://your-domain.com`
- **前端（移动端）**: `http://your-server-ip/m` 或 `http://your-domain.com/m`
- **后端 API**: `http://your-server-ip/api` 或 `http://your-domain.com/api`
- **健康检查**: `http://your-server-ip/api/health`

### Windows 部署要点：

1. **路径格式**：所有配置文件中的路径改为 Windows 格式
2. **服务管理**：使用 PM2 管理 Node.js 进程，使用 NSSM 管理其他服务
3. **防火墙**：确保开放必要端口
4. **域名访问**：局域网内使用 hosts 文件，外网使用内网穿透或端口映射
5. **自启动**：配置 Windows 服务或任务计划程序

### Ubuntu/Linux 部署要点：

1. **服务管理**：使用 systemd 管理系统服务，使用 PM2 管理 Node.js 进程
2. **权限管理**：注意文件和目录权限设置
3. **防火墙**：使用 UFW 或 firewalld 配置防火墙规则
4. **SSL/HTTPS**：推荐使用 Let's Encrypt 配置 HTTPS

如有问题，请参考本文档的"常见问题排查"部分，或查看相应的日志文件。

---

**祝部署顺利！** 🚀
