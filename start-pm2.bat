@echo off
REM Set environment variables for PM2
REM Method 1: Use environment variables (if service runs as user account)
REM set HOMEPATH=%USERPROFILE%
REM set USERPROFILE=%USERPROFILE%
REM set PM2_HOME=%USERPROFILE%\.pm2

REM Method 2: Hardcode user path (recommended, because service may run as SYSTEM account)
REM Please modify the path below according to your actual username
set HOMEPATH=C:\Users\songyz1
set USERPROFILE=C:\Users\songyz1
set PM2_HOME=C:\Users\songyz1\.pm2

REM Change to project directory
cd /d D:\project\logtool

REM Execute PM2 resurrect
D:\tool\node\node_global\pm2.cmd resurrect

