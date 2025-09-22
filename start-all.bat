@echo off
chcp 65001
title LogTool Startup Script

:menu
cls
echo ========================================
echo           LogTool Startup Script
echo ========================================
echo.
echo Please select service to start:
echo.
echo [1] Start Backend (Dev Mode)
echo [2] Start Backend (Intelligent Cluster Mode)
echo [3] Start Frontend
echo [4] Start All Services
echo [5] Database Management
echo [6] Start Redis
echo [7] Stop Redis
echo [8] Check Redis Status
echo [9] Test Redis
echo [0] Exit
echo.
set /p choice=Enter choice (1-0): 

if "%choice%"=="1" goto start-backend-dev
if "%choice%"=="2" goto start-backend-cluster
if "%choice%"=="3" goto start-frontend
if "%choice%"=="4" goto start-all
if "%choice%"=="5" goto database-management
if "%choice%"=="6" goto start-redis
if "%choice%"=="7" goto stop-redis
if "%choice%"=="8" goto check-redis
if "%choice%"=="9" goto test-redis
if "%choice%"=="0" goto exit
goto menu

:start-backend-dev
cls
echo ========================================
echo Start Backend Service (Dev Mode)
echo ========================================
echo.
cd backend
if not exist ".env" (
    echo Error: .env file not found
    echo Please create .env file according to README.md
    pause
    goto menu
)
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)
echo Starting backend dev service...
echo Backend URL: http://localhost:3000
echo.
echo Press Ctrl+C to stop server
echo.
npm start
pause
goto menu

:start-backend-cluster
cls
echo ========================================
echo Start Backend Service (Intelligent Cluster Mode)
echo ========================================
echo.
cd backend
if not exist ".env" (
    echo Error: .env file not found
    echo Please create .env file according to README.md
    pause
    goto menu
)
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)
echo Starting backend cluster service...
echo Backend URL: http://localhost:3000
echo Worker processes: Auto-detect CPU cores
echo Intelligent scheduling: Enabled
echo Peak hours: 08:00-01:59 (1 process for history logs)
echo Off-peak hours: 02:00-07:00 (50% processes for history logs)
echo.
echo Press Ctrl+C to stop server
echo.
npm run cluster
pause
goto menu

:database-management
cls
echo ========================================
echo Database Management
echo ========================================
echo.
echo Please select database operation:
echo.
echo [1] Initialize Database
echo [2] Clear Database Data
echo [3] Initialize Roles
echo [4] Check Database Status
echo [0] Back to Main Menu
echo.
set /p db_choice=Enter choice (1-4, 0): 

if "%db_choice%"=="1" goto init-database
if "%db_choice%"=="2" goto clear-database
if "%db_choice%"=="3" goto init-roles
if "%db_choice%"=="4" goto check-database
if "%db_choice%"=="0" goto menu
goto database-management

:start-frontend
cls
echo ========================================
echo Start Frontend Service
echo ========================================
echo.
cd frontend
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)
echo Starting frontend dev server...
echo Frontend URL: http://localhost:8080
echo Backend URL: http://localhost:3000
echo.
echo Press Ctrl+C to stop server
echo.
npm run dev
pause
goto menu

:start-all
cls
echo ========================================
echo Start All Services
echo ========================================
echo.
echo Starting backend and frontend services...
echo.

echo Starting backend service...
cd backend
if not exist ".env" (
    echo Error: .env file not found
    pause
    goto menu
)
if not exist "node_modules" (
    echo Installing backend dependencies...
    npm install
)
start "Backend Service (Intelligent Cluster)" cmd /k "cd /d %cd% && npm run cluster"

timeout /t 5 /nobreak >nul

echo Starting frontend service...
cd ..\frontend
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
)
start "Frontend Service" cmd /k "cd /d %cd% && npm run dev"

echo.
echo All services started!
echo Backend URL: http://localhost:3000
echo Frontend URL: http://localhost:8080
echo.
echo Press any key to return to menu...
pause >nul
goto menu

:start-redis
cls
echo ========================================
echo Start Redis Service
echo ========================================
echo.
echo Starting Redis service...
echo.

cd /d "%~dp0infrastructure\Redis"
if not exist "redis-server.exe" (
    echo Error: Redis server not found
    echo Please ensure Redis is properly installed
    pause
    goto menu
)

if not exist "redis.conf" (
    echo Error: Redis config file not found
    pause
    goto menu
)

echo Starting Redis service...
echo Config file: redis.conf
echo Port: 6379
echo.
echo Press Ctrl+C to stop Redis
echo.

redis-server.exe redis.conf

echo.
echo Redis service stopped
pause
goto menu

:stop-redis
cls
echo ========================================
echo Stop Redis Service
echo ========================================
echo.
echo Stopping Redis service...
echo.

tasklist | findstr redis-server.exe >nul
if errorlevel 1 (
    echo Redis service not running
    pause
    goto menu
)

echo Stopping Redis process...
taskkill /IM redis-server.exe /F >nul 2>&1

echo Redis service stopped
pause
goto menu

:check-redis
cls
echo ========================================
echo Check Redis Status
echo ========================================
echo.
echo Checking Redis service status...
echo.

cd /d "%~dp0infrastructure\Redis"

echo Redis process status:
tasklist | findstr redis-server.exe >nul
if not errorlevel 1 (
    echo Running
    tasklist | findstr redis-server.exe
) else (
    echo Not running
)

echo.
echo Port 6379 status:
netstat -an | findstr :6379 >nul
if not errorlevel 1 (
    echo Occupied
) else (
    echo Not occupied
)

echo.
echo File check:
if exist "redis-server.exe" (echo redis-server.exe: Exists) else (echo redis-server.exe: Not found)
if exist "redis.conf" (echo redis.conf: Exists) else (echo redis.conf: Not found)
if exist "redis-cli.exe" (echo redis-cli.exe: Exists) else (echo redis-cli.exe: Not found)

pause
goto menu

:test-redis
cls
echo ========================================
echo Test Redis Connection
echo ========================================
echo.
echo Testing Redis connection...
echo.

cd /d "%~dp0infrastructure\Redis"

if not exist "redis-cli.exe" (
    echo Error: redis-cli.exe not found
    pause
    goto menu
)

echo Testing PING command...
redis-cli.exe ping

echo.
echo Test completed
pause
goto menu

:init-database
cls
echo ========================================
echo Initialize Database
echo ========================================
echo.
echo This will create the database structure.
echo Make sure MySQL service is running.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo Creating database structure...
cd /d "%~dp0infrastructure\database"
if exist "init_database.sql" (
    echo Found init_database.sql
    echo Please run the following command manually:
    echo.
    echo mysql -u root -p logtool ^< init_database.sql
    echo.
    echo Or use a database management tool to import the file.
) else (
    echo Error: init_database.sql not found
)
pause
goto database-management

:clear-database
cls
echo ========================================
echo Clear Database Data
echo ========================================
echo.
echo WARNING: This will delete ALL data from the database!
echo Make sure you have a backup before proceeding.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo Clearing database data...
cd /d "%~dp0infrastructure\database"
if exist "clear_data.sql" (
    echo Found clear_data.sql
    echo Please run the following command manually:
    echo.
    echo mysql -u root -p logtool ^< clear_data.sql
    echo.
    echo Or use a database management tool to import the file.
) else (
    echo Error: clear_data.sql not found
)
pause
goto database-management

:init-roles
cls
echo ========================================
echo Initialize Roles
echo ========================================
echo.
echo This will initialize user roles and permissions.
echo Make sure the backend is properly configured.
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo Initializing roles...
cd /d "%~dp0backend"
if exist "node_modules" (
    echo Running: npm run init-roles
    npm run init-roles
) else (
    echo Error: node_modules not found. Please install dependencies first.
)
pause
goto database-management

:check-database
cls
echo ========================================
echo Check Database Status
echo ========================================
echo.
echo Checking database connection...
echo.
echo Please ensure MySQL service is running and configured.
echo.
echo To test database connection, start the backend service.
echo.
echo Database configuration should be in .env file:
echo - DB_HOST=localhost
echo - DB_PORT=3306
echo - DB_NAME=logtool
echo - DB_USER=root
echo - DB_PASSWORD=your_password
echo.
pause
goto database-management

:exit
echo Thank you for using LogTool!
exit
