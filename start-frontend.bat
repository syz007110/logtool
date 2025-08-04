chcp 65001
@echo off
echo ========================================
echo LogTool 前端启动脚本
echo ========================================
echo.

echo 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo 检查 npm 环境...
npm --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 npm，请先安装 npm
    pause
    exit /b 1
)

echo 进入前端目录...
cd frontend

echo 检查依赖是否已安装...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
    if errorlevel 1 (
        echo 错误: 依赖安装失败
        pause
        exit /b 1
    )
)

echo 启动前端开发服务器...
echo 前端地址: http://localhost:8080
echo 后端地址: http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo.

npm run dev

pause 