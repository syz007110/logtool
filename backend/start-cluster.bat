@echo off
chcp 65001
echo ========================================
echo 集群启动脚本
echo ========================================
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

REM 检查Redis是否运行
echo 检查Redis服务状态...
redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo 警告: Redis服务未运行，正在启动Redis...
    start "Redis Server" Redis\redis-server.exe Redis\redis.conf
    timeout /t 3 /nobreak >nul
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo 安装依赖包...
    npm install
    if errorlevel 1 (
        echo 错误: 依赖安装失败
        pause
        exit /b 1
    )
)

REM 设置环境变量
set NODE_ENV=production
set CLUSTER_ENABLED=true
set WORKER_PROCESSES=max
set MAX_MEMORY_RESTART=1G

REM 智能调度配置
set INTELLIGENT_SCHEDULER_ENABLED=true
set PEAK_HOURS_START=8
set PEAK_HOURS_END=1
set OFF_PEAK_HOURS_START=2
set OFF_PEAK_HOURS_END=7

echo 启动集群...
echo 工作进程数: 自动检测CPU核心数
echo 内存限制: 1GB
echo 智能调度: 启用
echo 高峰时段: 08:00-01:59 (1个进程处理历史日志)
echo 非高峰时段: 02:00-07:00 (50%进程处理历史日志)
echo.

REM 启动集群（默认智能模式）
node src/cluster/smartCluster.js

echo.
echo 集群已停止
pause
