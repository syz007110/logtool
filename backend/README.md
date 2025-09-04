# 后端服务启动说明

## 启动方式

### 1. 开发模式（单进程）
```bash
# 普通启动 - 单进程开发模式
npm start

# 开发模式 - 支持热重载
npm run dev
```

### 2. 生产模式（集群模式）
```bash
# 集群启动 - 多进程生产模式
npm run cluster

# 集群开发模式 - 支持热重载
npm run cluster:dev
```

## 区别说明

- **开发模式**: 单进程运行，适合开发和调试
- **集群模式**: 多进程运行，适合生产环境，自动根据CPU核心数创建工作进程

## 环境变量

- `PORT`: 服务端口（默认3000）
- `WORKER_PROCESSES`: 集群模式下的工作进程数（默认根据CPU核心数自动设置）
- `NODE_ENV`: 环境模式（development/production）

## 注意事项

- 开发时建议使用 `npm run dev` 或 `npm start`
- 生产环境建议使用 `npm run cluster`
- 确保端口3000未被占用
