@echo off
echo ========================================
echo         logTool 测试数据清空工具
echo ========================================
echo.

echo ⚠️  警告：此操作将清空所有测试数据！
echo.
set /p confirm="确认要清空所有测试数据吗？(y/N): "

if /i not "%confirm%"=="y" (
    echo 操作已取消。
    pause
    exit /b 0
)

echo.
echo 开始清空测试数据...
echo.

REM 进入backend目录
cd backend

REM 检查Node.js环境
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

REM 运行清空脚本
echo 运行数据清空脚本...
node src/scripts/clearTestData.js

if errorlevel 1 (
    echo.
    echo ❌ 数据清空失败！
    echo 请检查：
    echo - 数据库连接是否正常
    echo - .env文件是否配置正确
    echo - MySQL服务是否运行
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo 🎉 测试数据清空完成！
echo ========================================
echo.
echo 可选操作：
echo 1. 重新初始化角色：npm run init-roles
echo 2. 重置数据库（清空+初始化）：npm run reset-db
echo 3. 运行测试脚本验证
echo.
pause 