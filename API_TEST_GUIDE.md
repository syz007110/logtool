# 后端API测试指南

## 前置条件

### 1. 数据库设置
确保MySQL数据库已安装并运行：

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

## 运行测试脚本

### 1. 基础API测试
```bash
# 在项目根目录运行
node test-api.js
```

**测试内容：**
- 服务器连接测试
- 用户注册/登录
- 故障码创建/查询
- 多语言配置查询
- 用户列表查询

**预期输出：**
```
🚀 开始测试后端API...

1. 测试服务器连接...
✅ 服务器运行正常: logTool backend is running.

2. 测试用户注册...
✅ 用户注册成功: { message: '用户注册成功' }

3. 测试用户登录...
✅ 用户登录成功，获取到JWT token

4. 测试故障码创建...
✅ 故障码创建成功: { id: 1, code: 'E001', ... }

5. 测试故障码查询...
✅ 故障码查询成功，共找到 1 条记录

🎉 API测试完成！
```

### 2. 用户管理功能测试
```bash
node test-user-management.js
```

**测试内容：**
- 用户注册（多个用户）
- 用户登录
- 用户列表查询
- 用户创建（管理员功能）
- 用户信息更新
- 用户角色查询
- 错误情况测试（重复注册、错误密码、无认证）

**预期输出：**
```
🔐 开始用户管理功能测试...

1. 测试用户注册...
✅ 用户 testuser1 注册成功: 用户注册成功
✅ 用户 testuser2 注册成功: 用户注册成功

2. 测试用户登录...
✅ 用户登录成功，获取到JWT token

3. 测试获取用户列表...
✅ 获取用户列表成功，共 3 个用户

4. 测试创建新用户...
✅ 创建新用户成功: 创建成功

5. 测试更新用户信息...
✅ 更新用户信息成功: 更新成功

🎉 用户管理功能测试完成！
```

### 3. 角色权限测试
```bash
node test-role-permissions.js
```

**测试内容：**
- 创建三种角色的测试用户（管理员、专家用户、普通用户）
- 测试用户管理权限
- 测试故障码管理权限
- 测试故障码查询权限
- 测试角色管理权限

**预期输出：**
```
🎭 开始角色权限测试...

1. 创建测试用户...
✅ admin 用户注册成功
✅ expert 用户注册成功
✅ normal 用户注册成功

2. 用户登录获取token...
✅ admin 用户登录成功
✅ expert 用户登录成功
✅ normal 用户登录成功

3. 测试用户管理权限...
✅ 管理员可以查看用户列表
✅ 专家用户正确被拒绝访问用户列表
✅ 普通用户正确被拒绝访问用户列表

4. 测试故障码管理权限...
✅ 管理员可以创建故障码
✅ 专家用户可以创建故障码
✅ 普通用户正确被拒绝创建故障码

🎉 角色权限测试完成！
```

### 4. 用户角色管理测试
```bash
node test-user-roles.js
```

**测试内容：**
- 创建管理员用户
- 创建测试用户
- 角色分配
- 用户角色查询

**预期输出：**
```
🔗 开始用户角色管理测试...

1. 创建管理员用户并登录...
✅ 管理员用户注册成功
✅ 管理员登录成功

2. 创建测试用户...
✅ 测试用户创建成功，ID: 2

3. 测试角色分配...
✅ 角色分配成功: 角色分配成功

4. 测试获取用户角色...
✅ 获取用户角色成功
用户角色: 专家用户

🎉 用户角色管理测试完成！
```

## 测试脚本详解

### test-api.js
- **用途**：验证基础API功能是否正常
- **适用场景**：开发初期、部署后验证
- **运行时间**：约30秒

### test-user-management.js
- **用途**：全面测试用户管理功能
- **适用场景**：用户系统开发、权限验证
- **运行时间**：约45秒

### test-role-permissions.js
- **用途**：验证三种角色的权限控制
- **适用场景**：权限系统开发、安全测试
- **运行时间**：约60秒

### test-user-roles.js
- **用途**：测试用户角色分配功能
- **适用场景**：角色管理功能开发
- **运行时间**：约30秒

## 批量运行测试

### 使用批处理文件（Windows）
```bash
# 双击运行或在命令行执行
test-all.bat
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
node test-api.js              # 基础API测试
node test-user-management.js  # 用户管理测试
node test-role-permissions.js # 角色权限测试
node test-user-roles.js       # 用户角色管理测试
```

## 常见问题解决

### 1. 连接被拒绝
```
❌ 测试过程中发生错误: connect ECONNREFUSED 127.0.0.1:3000
💡 提示：请确保后端服务器正在运行 (npm start)
```

**解决方案：**
- 检查后端服务是否启动
- 确认端口3000没有被占用
- 检查.env文件配置

### 2. 数据库连接失败
```
数据库连接失败: Access denied for user ''@'localhost'
```

**解决方案：**
- 检查.env文件中的数据库配置
- 确认MySQL服务正在运行
- 验证数据库用户权限

### 3. 角色不存在
```
❌ 角色分配失败: 角色不存在
```

**解决方案：**
- 运行 `npm run init-roles` 初始化角色
- 检查角色ID是否正确（1=管理员，2=专家用户，3=普通用户）

### 4. 权限不足
```
❌ 用户列表查询失败: 权限不足
```

**解决方案：**
- 确保测试用户有正确的角色分配
- 检查权限中间件配置
- 验证JWT token是否有效

## 测试结果解读

### ✅ 成功标志
- 所有API调用返回200/201状态码
- 看到"✅"标记的测试项
- 最后显示"🎉 测试完成！"

### ❌ 失败标志
- API调用返回4xx/5xx状态码
- 看到"❌"标记的测试项
- 出现错误信息

### ⚠️ 警告标志
- 看到"⚠️"标记的测试项
- 通常是重复数据或已存在的资源
- 不影响测试结果

## API接口列表

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

### XML导出
- `GET /api/error-codes/export` - 导出故障码为XML格式

## 最佳实践

1. **按顺序运行**：先运行基础测试，再运行复杂测试
2. **清理数据**：测试前确保数据库干净
3. **检查日志**：关注控制台输出的详细信息
4. **定期测试**：每次代码修改后都运行测试
5. **记录问题**：将失败的测试记录下来，便于调试 