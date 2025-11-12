@echo off
chcp 65001
title LogTool Production Service Manager

:menu
cls
echo ========================================
echo    LogTool 生产环境服务管理
echo ========================================
echo.
echo [1] 启动所有服务
echo [2] 停止所有服务
echo [3] 重启所有服务
echo [4] 查看服务状态
echo [5] 查看日志
echo [6] 启动 Redis
echo [7] 停止 Redis
echo [8] 启动 Nginx
echo [9] 停止 Nginx
echo [10] 重载 Nginx 配置
echo [0] 退出
echo.
set /p choice=请选择操作 (0-10): 

if "%choice%"=="1" goto start-all
if "%choice%"=="2" goto stop-all
if "%choice%"=="3" goto restart-all
if "%choice%"=="4" goto status
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto start-redis
if "%choice%"=="7" goto stop-redis
if "%choice%"=="8" goto start-nginx
if "%choice%"=="9" goto stop-nginx
if "%choice%"=="10" goto reload-nginx
if "%choice%"=="0" goto exit
goto menu

:start-all
cls
echo ========================================
echo    启动所有服务
echo ========================================
echo.

echo [1/3] 启动 Redis...
cd /d "%~dp0infrastructure\Redis"
if exist "redis-server.exe" (
    tasklist | findstr redis-server.exe >nul
    if errorlevel 1 (
        start "Redis Server" /MIN redis-server.exe redis.conf
        timeout /t 2 /nobreak >nul
        echo [√] Redis 已启动
    ) else (
        echo [√] Redis 已在运行
    )
) else (
    echo [错误] 未找到 Redis 服务器
)

echo.
echo [2/3] 启动后端服务 (PM2)...
cd /d "%~dp0"
pm2 start ecosystem.config.js --only logtool-backend 2>nul
if errorlevel 1 (
    echo [警告] PM2 启动失败，尝试直接启动...
    cd backend
    start "LogTool Backend" cmd /k "npm start"
) else (
    echo [√] 后端服务已启动
)

echo.
echo [3/3] 启动 Nginx...
set /p NGINX_PATH="请输入 Nginx 路径 (直接回车使用默认 C:\nginx): "
if "%NGINX_PATH%"=="" set NGINX_PATH=C:\nginx
if exist "%NGINX_PATH%\nginx.exe" (
    tasklist | findstr nginx.exe >nul
    if errorlevel 1 (
        cd /d "%NGINX_PATH%"
        start "Nginx" /MIN nginx.exe
        timeout /t 2 /nobreak >nul
        echo [√] Nginx 已启动
    ) else (
        echo [√] Nginx 已在运行
    )
) else (
    echo [警告] 未找到 Nginx，请手动启动
)

echo.
echo ========================================
echo    所有服务启动完成！
echo ========================================
echo.
pause
goto menu

:stop-all
cls
echo ========================================
echo    停止所有服务
echo ========================================
echo.

echo [1/3] 停止 Redis...
taskkill /IM redis-server.exe /F >nul 2>&1
if errorlevel 1 (
    echo [√] Redis 未运行
) else (
    echo [√] Redis 已停止
)

echo.
echo [2/3] 停止后端服务...
pm2 stop all >nul 2>&1
taskkill /FI "WINDOWTITLE eq LogTool Backend*" /F >nul 2>&1
echo [√] 后端服务已停止

echo.
echo [3/3] 停止 Nginx...
taskkill /IM nginx.exe /F >nul 2>&1
if errorlevel 1 (
    echo [√] Nginx 未运行
) else (
    echo [√] Nginx 已停止
)

echo.
echo ========================================
echo    所有服务已停止
echo ========================================
echo.
pause
goto menu

:restart-all
cls
echo ========================================
echo    重启所有服务
echo ========================================
echo.
call :stop-all
timeout /t 2 /nobreak >nul
call :start-all
goto menu

:status
cls
echo ========================================
echo    服务状态
echo ========================================
echo.

echo [Redis 状态]
tasklist | findstr redis-server.exe >nul
if errorlevel 1 (
    echo 状态: 未运行
) else (
    echo 状态: 运行中
    tasklist | findstr redis-server.exe
)

echo.
echo [后端服务状态 (PM2)]
pm2 status

echo.
echo [Nginx 状态]
tasklist | findstr nginx.exe >nul
if errorlevel 1 (
    echo 状态: 未运行
) else (
    echo 状态: 运行中
    tasklist | findstr nginx.exe
)

echo.
echo [端口占用情况]
netstat -ano | findstr :6379
netstat -ano | findstr :3000
netstat -ano | findstr :80

echo.
pause
goto menu

:logs
cls
echo ========================================
echo    查看日志
echo ========================================
echo.
echo [1] PM2 日志
echo [2] Redis 日志
echo [3] Nginx 访问日志
echo [4] Nginx 错误日志
echo [0] 返回
echo.
set /p log_choice=请选择: 

if "%log_choice%"=="1" (
    pm2 logs
    goto menu
)
if "%log_choice%"=="2" (
    echo Redis 日志位置: infrastructure\Redis\redis.log
    pause
    goto menu
)
if "%log_choice%"=="3" (
    set /p NGINX_PATH="请输入 Nginx 路径: "
    if exist "%NGINX_PATH%\logs\logtool-access.log" (
        type "%NGINX_PATH%\logs\logtool-access.log"
    ) else (
        echo 日志文件不存在
    )
    pause
    goto menu
)
if "%log_choice%"=="4" (
    set /p NGINX_PATH="请输入 Nginx 路径: "
    if exist "%NGINX_PATH%\logs\logtool-error.log" (
        type "%NGINX_PATH%\logs\logtool-error.log"
    ) else (
        echo 日志文件不存在
    )
    pause
    goto menu
)
goto menu

:start-redis
cls
echo 启动 Redis...
cd /d "%~dp0infrastructure\Redis"
if exist "redis-server.exe" (
    start "Redis Server" /MIN redis-server.exe redis.conf
    timeout /t 2 /nobreak >nul
    echo [√] Redis 已启动
) else (
    echo [错误] 未找到 Redis 服务器
)
pause
goto menu

:stop-redis
cls
echo 停止 Redis...
taskkill /IM redis-server.exe /F >nul 2>&1
if errorlevel 1 (
    echo [√] Redis 未运行
) else (
    echo [√] Redis 已停止
)
pause
goto menu

:start-nginx
cls
echo 启动 Nginx...
set /p NGINX_PATH="请输入 Nginx 路径: "
if exist "%NGINX_PATH%\nginx.exe" (
    cd /d "%NGINX_PATH%"
    nginx.exe
    echo [√] Nginx 已启动
) else (
    echo [错误] 未找到 Nginx
)
pause
goto menu

:stop-nginx
cls
echo 停止 Nginx...
taskkill /IM nginx.exe /F >nul 2>&1
if errorlevel 1 (
    echo [√] Nginx 未运行
) else (
    echo [√] Nginx 已停止
)
pause
goto menu

:reload-nginx
cls
echo 重载 Nginx 配置...
set /p NGINX_PATH="请输入 Nginx 路径: "
if exist "%NGINX_PATH%\nginx.exe" (
    cd /d "%NGINX_PATH%"
    nginx.exe -s reload
    echo [√] Nginx 配置已重载
) else (
    echo [错误] 未找到 Nginx
)
pause
goto menu

:exit
echo 感谢使用！
exit

