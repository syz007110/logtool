chcp 65001
@echo off
echo 正在启动logTool后端服务...
echo.

REM 进入backend目录
cd backend

REM 检查.env文件是否存在
if not exist ".env" (
    echo 错误：未找到.env配置文件
    echo 请根据README.md中的配置创建.env文件
    pause
    exit /b 1
)


REM 检查node_modules是否存在
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
)

REM 启动服务
echo 启动后端服务...
npm start

pause 