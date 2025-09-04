@echo off
chcp 65001
title Redis服务停止脚本

echo ========================================
echo           Redis服务停止脚本
echo ========================================
echo.

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 检查Redis进程是否运行
echo 检查Redis进程状态...
tasklist | findstr redis-server.exe >nul
if errorlevel 1 (
    echo ℹ️  Redis服务未运行
    echo.
    echo 检查端口6379状态...
    netstat -an | findstr :6379 >nul
    if errorlevel 1 (
        echo ✅ 端口6379未被占用
    ) else (
        echo ⚠️  端口6379仍被占用，可能被其他程序使用
        netstat -ano | findstr :6379
    )
    pause
    exit /b 0
)

REM 显示Redis进程信息
echo 发现Redis进程：
tasklist | findstr redis-server.exe
echo.

REM 尝试优雅停止Redis
echo 🛑 正在停止Redis服务...
echo 发送SHUTDOWN命令...
redis-cli.exe shutdown >nul 2>&1

REM 等待进程自然退出
echo 等待Redis进程退出...
timeout /t 5 /nobreak >nul

REM 检查是否已停止
tasklist | findstr redis-server.exe >nul
if errorlevel 1 (
    echo ✅ Redis服务已优雅停止
) else (
    echo ⚠️  优雅停止失败，强制终止进程...
    taskkill /IM redis-server.exe /F >nul 2>&1
    timeout /t 2 /nobreak >nul
    
    REM 再次检查
    tasklist | findstr redis-server.exe >nul
    if errorlevel 1 (
        echo ✅ Redis服务已强制停止
    ) else (
        echo ❌ Redis服务停止失败
        echo 请手动检查进程状态
    )
)

REM 检查端口状态
echo.
echo 检查端口6379状态...
netstat -an | findstr :6379 >nul
if errorlevel 1 (
    echo ✅ 端口6379已释放
) else (
    echo ⚠️  端口6379仍被占用
    echo 占用进程信息：
    netstat -ano | findstr :6379
)

echo.
echo Redis服务停止完成！
pause
