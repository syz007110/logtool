### [English](https://github.com/redis-windows/redis-windows/blob/main/README.md) | [简体中文](https://github.com/redis-windows/redis-windows/blob/main/README.zh_CN.md)

# Redis Windows Version
### With the powerful automated building capability of GitHub Actions, we can compile the latest version of Redis for Windows system in real-time. 
The entire compilation process is completely transparent and open, with the compilation script located in the [.github/workflows/](https://github.com/redis-windows/redis-windows/tree/main/.github/workflows) directory and the compilation logs available on the [Actions](https://github.com/redis-windows/redis-windows/actions) page. In addition, we have added a hash calculation step when the compilation is completed, and the result is printed in the log. This is unmodifiable and recorded in the release page. You can verify the hash value of the downloaded file against the log and release page.  
Our project is absolutely pure and without any hidden features, and can withstand the scrutiny of all experts. If you have any good ideas, please feel free to communicate with us.  

## We provide three operation modes: 
1. Run the start.bat script in the project to start directly with one click.
2. Use the command line.
3. Support running as a system service.

### Command line startup:
cmd startup: 
```shell
redis-server.exe redis.conf
```
powershell startup: 
```shell
./redis-server.exe redis.conf
```

### Service installation:
Can achieve automatic startup on boot. Please run it as an administrator and change RedisService.exe to the actual directory where it is stored.
```shell
sc.exe create Redis binpath=C:\Software\Redis\RedisService.exe start= auto
```
Start service
```shell
net start Redis
```
Out of Service
```shell
net stop Redis
```
Uninstall service
```shell
sc.exe delete Redis
```

![image](https://user-images.githubusercontent.com/515784/215540157-65f55297-cde2-49b3-8ab3-14dca7e11ee0.png)


Project Home: https://github.com/redis-windows/redis-windows

## Acknowledgement: 
[![NetEngine](https://avatars.githubusercontent.com/u/36178221?s=180&v=4)](https://www.zhihu.com/question/424272611/answer/2611312760) 
[![JetBrains Logo (Main) logo](https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.svg)](https://www.jetbrains.com/?from=redis-windows)


## Disclaimer
We suggest that you use it for local development and follow Redis official guidance to deploy it on Linux for production environment. This project doesn't bear any responsibility for any losses caused by using it and is only for learning and exchange purposes.

# Redis服务管理脚本

本目录包含了Redis服务的启动、停止、状态检查等管理脚本。

## 脚本说明

### 1. `start-redis.bat` - Redis启动脚本（推荐使用）
- **用途**: 启动Redis服务
- **特点**: 
  - 自动检查端口占用
  - 检测现有进程
  - 提供详细的启动状态反馈
  - 自动测试连接
- **使用场景**: 手动启动Redis服务

### 2. `stop-redis.bat` - Redis停止脚本
- **用途**: 停止Redis服务
- **特点**:
  - 优先尝试优雅停止
  - 必要时强制终止进程
  - 检查端口释放状态
- **使用场景**: 手动停止Redis服务

### 3. `check-redis.bat` - Redis状态检查脚本
- **用途**: 检查Redis服务状态
- **特点**:
  - 检查进程状态
  - 检查端口占用
  - 检查文件完整性
  - 测试连接状态
  - 提供诊断建议
- **使用场景**: 诊断Redis问题

### 4. `start.bat` - 简单启动脚本（基础版）
- **用途**: 简单的Redis启动
- **特点**: 基础功能，无错误处理
- **使用场景**: 快速启动（不推荐生产环境）

## 使用方法

### 方法1：通过统一启动脚本
```bash
# 在项目根目录运行
start-all.bat

# 选择选项：
# [6] 启动Redis服务
# [7] 停止Redis服务  
# [8] 检查Redis状态
```

### 方法2：直接运行Redis脚本
```bash
# 启动Redis
cd infrastructure\Redis
start-redis.bat

# 停止Redis
stop-redis.bat

# 检查状态
check-redis.bat
```

### 方法3：使用Redis CLI
```bash
# 启动服务
redis-server.exe redis.conf

# 停止服务
redis-cli.exe shutdown

# 测试连接
redis-cli.exe ping
```

## 常见问题解决

### 1. 端口6379被占用
```bash
# 检查端口占用
netstat -ano | findstr :6379

# 查看占用进程
tasklist | findi "PID号"
```

### 2. Redis启动失败
- 检查配置文件 `redis.conf` 是否存在
- 确认 `redis-server.exe` 文件完整
- 以管理员身份运行脚本
- 检查防火墙设置

### 3. 无法连接Redis
- 确认Redis进程正在运行
- 检查端口是否正确监听
- 验证配置文件中的bind设置
- 测试本地连接：`redis-cli.exe ping`

## 配置文件说明

### 关键配置项
- **port**: 监听端口（默认6379）
- **bind**: 绑定地址（默认127.0.0.1）
- **protected-mode**: 保护模式（默认yes）
- **dir**: 数据目录
- **dbfilename**: 数据库文件名

### 安全建议
- 生产环境设置密码认证
- 限制绑定地址
- 启用保护模式
- 定期备份数据文件

## 性能优化

### 内存配置
```conf
# 设置最大内存
maxmemory 256mb

# 内存策略
maxmemory-policy allkeys-lru
```

### 持久化配置
```conf
# 启用RDB快照
save 900 1
save 300 10
save 60 10000

# 启用AOF日志
appendonly yes
appendfsync everysec
```

## 监控和维护

### 健康检查
```bash
# 检查Redis信息
redis-cli.exe info

# 检查内存使用
redis-cli.exe info memory

# 检查连接数
redis-cli.exe info clients
```

### 数据备份
```bash
# 手动保存
redis-cli.exe save

# 备份RDB文件
copy dump.rdb backup_%date:~0,4%%date:~5,2%%date:~8,2%.rdb
```

## 注意事项

- 首次使用前请检查配置文件
- 生产环境建议使用Windows服务方式运行
- 定期检查日志文件
- 监控内存和连接数使用情况
- 备份重要数据
