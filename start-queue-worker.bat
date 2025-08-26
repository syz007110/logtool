chcp 65001
@echo off
echo 启动日志处理队列工作进程...
cd backend
node start-queue-worker.js
pause
