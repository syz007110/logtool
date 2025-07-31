# 后端 API 测试指南

## 前置条件

### 1. 数据库设置

确保 MySQL 数据库已安装并运行：

```sql
-- 创建数据库
CREATE DATABASE logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 导入数据库结构
mysql -u root -p logtool < db_schema.sql
```

### 2. 环境配置

在项目根目录创建 `.env` 文件：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=logtool

# JWT 密钥
JWT_SECRET=your_jwt_secret_key_here

# 其他配置
PORT=3000
NODE_ENV=development
```

### 3. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装测试依赖（在项目根目录）
npm install axios
```

## 启动服务

### 1. 初始化角色

```bash
cd backend
npm run init-roles
```

### 2. 启动后端服务

```bash
npm start
```

如果看到以下输出，说明服务启动成功：

```
数据库连接成功
Server is running on port 3000
```

启动前端的方法如下：

1. **进入前端目录**  
   在命令行中进入 `frontend` 目录：
   ```
   cd frontend
   ```
2. **安装依赖**  
   如果是第一次启动或依赖有变动，需要先安装依赖：
   ```
   npm install
   ```
3. **启动开发服务器**  
   启动前端开发环境：
   ```
   npm run dev
   ```

### 手动运行所有测试

```bash
# 1. 安装依赖
npm install axios

# 2. 启动后端服务
cd backend
npm run init-roles
npm start

# 3. 运行测试（新开命令行窗口）
# 测试脚本已删除，请使用手动测试方法
```

## API 接口列表

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 故障码管理

- `GET /api/error-codes` - 获取故障码列表
- `POST /api/error-codes` - 创建故障码
- `PUT /api/error-codes/:id` - 更新故障码
- `DELETE /api/error-codes/:id` - 删除故障码

### 用户管理

- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

### 角色管理

- `GET /api/roles` - 获取角色列表
- `POST /api/roles` - 创建角色
- `PUT /api/roles/:id` - 更新角色
- `DELETE /api/roles/:id` - 删除角色

### 用户角色管理

- `POST /api/user-roles/assign` - 分配角色
- `DELETE /api/user-roles/:user_id/:role_id` - 移除角色
- `GET /api/user-roles/user/:user_id` - 获取用户角色
- `GET /api/user-roles/role/:role_id` - 获取角色用户
- `PUT /api/user-roles/:user_id/:role_id` - 更新角色信息
- `POST /api/user-roles/batch-assign` - 批量分配角色

### 多语言配置

- `GET /api/i18n` - 获取多语言配置
- `POST /api/i18n` - 创建多语言配置
- `PUT /api/i18n/:id` - 更新多语言配置
- `DELETE /api/i18n/:id` - 删除多语言配置

### XML 导出

- `GET /api/error-codes/export` - 导出故障码为 XML 格式

## 最佳实践

1. **按顺序运行**：先运行基础测试，再运行复杂测试
2. **清理数据**：测试前确保数据库干净
3. **检查日志**：关注控制台输出的详细信息
4. **定期测试**：每次代码修改后都运行测试
5. **记录问题**：将失败的测试记录下来，便于调试
