@echo off
chcp 65001
title Redis服务启动脚本

echo ========================================
echo           Redis服务启动脚本
echo ========================================
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查Redis服务器程序
if not exist "redis-server.exe" (
    echo ❌ 错误：未找到 redis-server.exe
    echo 请确保Redis已正确安装在此目录下
    pause
    exit /b 1
)

REM 检查配置文件
if not exist "redis.conf" (
    echo ❌ 错误：未找到 redis.conf 配置文件
    echo 请确保配置文件存在
    pause
    exit /b 1
)

REM 检查端口是否被占用
echo 检查端口6379是否被占用...
netstat -an | findstr :6379 >nul
if not errorlevel 1 (
    echo ⚠️  警告：端口6379已被占用
    echo 正在检查占用进程...
    netstat -ano | findstr :6379
    echo.
    set /p choice=是否强制启动Redis？(y/N): 
    if /i "%choice%"=="y" (
        echo 强制启动Redis...
    ) else (
        echo 取消启动
        pause
        exit /b 0
    )
)

REM 检查Redis进程是否已运行
tasklist | findstr redis-server.exe >nul
if not errorlevel 1 (
    echo ⚠️  警告：Redis进程已在运行
    echo 进程信息：
    tasklist | findstr redis-server.exe
    echo.
    set /p choice=是否重启Redis？(y/N): 
    if /i "%choice%"=="y" (
        echo 停止现有Redis进程...
        taskkill /IM redis-server.exe /F >nul 2>&1
        timeout /t 2 /nobreak >nul
    ) else (
        echo 取消启动
        pause
        exit /b 0
    )
)

REM 启动Redis服务
echo.
echo 🚀 启动Redis服务...
echo 配置文件: %cd%\redis.conf
echo 端口: 6379
echo.

start "Redis服务" cmd /k "cd /d %cd% && redis-server.exe redis.conf"

REM 等待服务启动
echo 等待Redis服务启动...
for /l %%i in (1,1,10) do (
    timeout /t 1 /nobreak >nul
    netstat -an | findstr :6379 >nul
    if not errorlevel 1 (
        echo ✅ Redis服务启动成功！
        echo.
        echo 服务信息：
        echo - 端口: 6379
        echo - 配置文件: %cd%\redis.conf
        echo - 进程ID: 
        tasklist | findstr redis-server.exe
        echo.
        echo 测试连接...
        redis-cli.exe ping
        echo.
        echo Redis服务已成功启动！
        pause
        exit /b 0
    )
    echo 等待中... %%i/10
)

echo ❌ Redis服务启动失败
echo.
echo 可能的原因：
echo 1. 端口6379被其他程序占用
echo 2. 配置文件有误
echo 3. 权限不足
echo 4. Redis程序损坏
echo.
echo 诊断信息：
echo - 端口状态：
netstat -an | findstr :6379
echo.
echo - 进程状态：
tasklist | findstr redis-server.exe
echo.
echo 建议：
echo 1. 检查端口占用情况
echo 2. 验证配置文件
echo 3. 以管理员身份运行
echo 4. 重新安装Redis
echo.
pause
exit /b 1
