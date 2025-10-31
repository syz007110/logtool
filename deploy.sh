#!/bin/bash
#
# LogTool 自动化部署脚本
# 使用方法: ./deploy.sh
#

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目路径（根据实际情况修改）
PROJECT_DIR=$(pwd)
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}    LogTool 自动化部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查是否在项目根目录
if [ ! -d "$BACKEND_DIR" ] || [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 1. 更新代码（如果使用 git）
read -p "是否从 git 拉取最新代码? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[1/8] 更新代码...${NC}"
    git pull origin main || echo "警告: git pull 失败，继续执行..."
    echo -e "${GREEN}✓ 代码更新完成${NC}"
else
    echo -e "${YELLOW}[1/8] 跳过代码更新${NC}"
fi

# 2. 检查 Node.js
echo -e "${YELLOW}[2/8] 检查 Node.js 环境...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未找到 Node.js，请先安装 Node.js${NC}"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js 版本: $NODE_VERSION${NC}"

# 3. 检查 MySQL
echo -e "${YELLOW}[3/8] 检查 MySQL 服务...${NC}"
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}警告: 未找到 mysql 客户端${NC}"
else
    if systemctl is-active --quiet mysql || systemctl is-active --quiet mysqld; then
        echo -e "${GREEN}✓ MySQL 服务运行中${NC}"
    else
        echo -e "${YELLOW}警告: MySQL 服务未运行${NC}"
    fi
fi

# 4. 检查 Redis
echo -e "${YELLOW}[4/8] 检查 Redis 服务...${NC}"
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓ Redis 服务运行中${NC}"
    else
        echo -e "${YELLOW}警告: Redis 服务未运行或无法连接${NC}"
    fi
else
    echo -e "${YELLOW}警告: 未找到 redis-cli${NC}"
fi

# 5. 安装后端依赖
echo -e "${YELLOW}[5/8] 安装后端依赖...${NC}"
cd "$BACKEND_DIR"
if [ ! -f ".env" ]; then
    echo -e "${RED}错误: 未找到 backend/.env 文件${NC}"
    echo -e "${YELLOW}请先创建 .env 文件并配置环境变量${NC}"
    exit 1
fi

npm install --production
echo -e "${GREEN}✓ 后端依赖安装完成${NC}"

# 6. 安装前端依赖并构建
echo -e "${YELLOW}[6/8] 安装前端依赖...${NC}"
cd "$FRONTEND_DIR"
npm install
echo -e "${GREEN}✓ 前端依赖安装完成${NC}"

echo -e "${YELLOW}[7/8] 构建前端生产版本...${NC}"
npm run build
if [ ! -d "dist" ]; then
    echo -e "${RED}错误: 前端构建失败，未找到 dist 目录${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 前端构建完成${NC}"

# 7. 复制前端文件到 Nginx 目录（如果配置了）
read -p "是否复制前端文件到 /var/www/logtool? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[8/8] 部署前端文件...${NC}"
    sudo mkdir -p /var/www/logtool
    sudo cp -r "$FRONTEND_DIR/dist"/* /var/www/logtool/
    sudo chown -R www-data:www-data /var/www/logtool
    sudo chmod -R 755 /var/www/logtool
    echo -e "${GREEN}✓ 前端文件部署完成${NC}"
else
    echo -e "${YELLOW}[8/8] 跳过前端文件部署${NC}"
fi

# 8. 重启 PM2 应用
cd "$PROJECT_DIR"
if command -v pm2 &> /dev/null; then
    echo ""
    echo -e "${YELLOW}重启 PM2 应用...${NC}"
    
    if pm2 list | grep -q "logtool"; then
        pm2 restart ecosystem.config.js || pm2 restart all
        echo -e "${GREEN}✓ PM2 应用已重启${NC}"
    else
        echo -e "${YELLOW}未找到运行中的 PM2 应用，正在启动...${NC}"
        if [ -f "ecosystem.config.js" ]; then
            pm2 start ecosystem.config.js
            pm2 save
            echo -e "${GREEN}✓ PM2 应用已启动${NC}"
        else
            echo -e "${YELLOW}警告: 未找到 ecosystem.config.js，请手动启动应用${NC}"
        fi
    fi
else
    echo -e "${YELLOW}警告: 未找到 PM2，请手动重启应用${NC}"
fi

# 9. 重载 Nginx（如果配置了）
if command -v nginx &> /dev/null && [ -f /etc/nginx/sites-enabled/logtool ]; then
    read -p "是否重载 Nginx 配置? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo nginx -t && sudo systemctl reload nginx
        echo -e "${GREEN}✓ Nginx 已重载${NC}"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "检查服务状态:"
echo "  - PM2 状态: pm2 status"
echo "  - PM2 日志: pm2 logs"
echo "  - 后端健康检查: curl http://localhost:3000/health"
echo "  - Nginx 状态: sudo systemctl status nginx"
echo ""

