FROM node:18-alpine AS build
WORKDIR /app

# 仅安装依赖
COPY backend/package*.json ./
RUN npm ci --only=production

# 复制源码
COPY backend . 

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/app.js"]

