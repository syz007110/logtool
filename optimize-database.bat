@echo off
echo 正在优化数据库索引...
cd backend
node src/scripts/optimizeIndexes.js
pause
