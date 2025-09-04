chcp 65001
@echo off
echo ========================================
echo 日志工具多进程集群启动脚本
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

echo 启动多进程集群...
echo 工作进程数: 自动检测CPU核心数
echo 内存限制: 1GB
echo.

REM 启动集群
node src/cluster.js

echo.
echo 集群已停止
pause
