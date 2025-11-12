@echo off
chcp 65001
title LogTool Hosts 文件配置工具

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请以管理员权限运行此脚本！
    pause
    exit /b 1
)

set HOSTS_FILE=C:\Windows\System32\drivers\etc\hosts

:menu
cls
echo ========================================
echo    Hosts 文件配置工具
echo ========================================
echo.
echo [1] 添加域名映射
echo [2] 删除域名映射
echo [3] 查看当前映射
echo [4] 刷新 DNS 缓存
echo [0] 退出
echo.
set /p choice=请选择操作 (0-4): 

if "%choice%"=="1" goto add-host
if "%choice%"=="2" goto remove-host
if "%choice%"=="3" goto view-hosts
if "%choice%"=="4" goto flush-dns
if "%choice%"=="0" goto exit
goto menu

:add-host
cls
echo ========================================
echo    添加域名映射
echo ========================================
echo.
set /p IP="请输入 IP 地址 (例如: 192.168.1.100): "
set /p DOMAIN="请输入域名 (例如: logtool.local): "

REM 检查是否已存在
findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul
if not errorlevel 1 (
    echo [警告] 域名 %DOMAIN% 已存在，是否覆盖？(Y/N)
    set /p overwrite=
    if /i not "%overwrite%"=="Y" goto menu
    
    REM 删除旧记录
    powershell -Command "(Get-Content '%HOSTS_FILE%') | Where-Object {$_ -notmatch '%DOMAIN%'} | Set-Content '%HOSTS_FILE%'"
)

REM 添加新记录
echo %IP% %DOMAIN% >> "%HOSTS_FILE%"
echo [√] 已添加: %IP% %DOMAIN%

echo.
echo 是否刷新 DNS 缓存？(Y/N)
set /p flush=
if /i "%flush%"=="Y" (
    ipconfig /flushdns
    echo [√] DNS 缓存已刷新
)

pause
goto menu

:remove-host
cls
echo ========================================
echo    删除域名映射
echo ========================================
echo.
set /p DOMAIN="请输入要删除的域名: "

findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul
if errorlevel 1 (
    echo [错误] 未找到域名 %DOMAIN%
    pause
    goto menu
)

powershell -Command "(Get-Content '%HOSTS_FILE%') | Where-Object {$_ -notmatch '%DOMAIN%'} | Set-Content '%HOSTS_FILE%'"
echo [√] 已删除域名 %DOMAIN%

echo.
echo 是否刷新 DNS 缓存？(Y/N)
set /p flush=
if /i "%flush%"=="Y" (
    ipconfig /flushdns
    echo [√] DNS 缓存已刷新
)

pause
goto menu

:view-hosts
cls
echo ========================================
echo    当前 Hosts 映射
echo ========================================
echo.
type "%HOSTS_FILE%"
echo.
pause
goto menu

:flush-dns
cls
echo 刷新 DNS 缓存...
ipconfig /flushdns
echo [√] DNS 缓存已刷新
pause
goto menu

:exit
exit

