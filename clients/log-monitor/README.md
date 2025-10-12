# Log Monitor Client 使用指南

本客户端是一个独立的 Windows 桌面应用（Electron），用于在本地监听指定目录中的日志文件并自动上传到后端系统，支持断点续传、失败重试、托盘控制和基础状态展示。

## 1. 系统要求
- Windows 10/11（64 位）
- 已安装 Node.js（建议 LTS），具备网络访问后端 API 的权限
- 能访问后端地址（HTTP/HTTPS）

## 2. 项目位置与结构
- 客户端路径：`clients/log-monitor/`
- 关键目录/文件：
  - `src/main/`：Electron 主进程（监听、上传、托盘、IPC）
  - `src/renderer/`：简易 UI（配置、登录、健康检查、监听管理、上传状态）
  - `src/main/services/`：`config`、`watcher`、`uploader`、`storage`
  - `package.json`：依赖与脚本
  - 运行时数据与日志：`%APPDATA%/LogMonitor/`

## 3. 安装与启动（开发模式）
```powershell
cd D:\code\Log\v0.1.1\logtool\clients\log-monitor
npm i
# 如 Electron 下载较慢，可使用镜像：
# $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
# npm i
npm run dev
```
如果遇到 “Electron failed to install correctly” 错误：
```powershell
rmdir -Recurse -Force node_modules\electron
npm cache clean --force
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm i electron@31 -D
npm i
npm run dev
```

## 4. 首次配置
启动后窗口内按顺序操作：
1) 设置 `API Base URL`（例如 `http://localhost:3000/api`），点击 Save Config。
2) 在 Login 区域输入用户名与密码，点击 Login，成功后会写入 token 至配置。
3) 在 Watcher 区域：
   - `Watch Paths`：填写需监听的目录，多个目录用分号分隔，例如：`C:\\logs;D:\\more`。
   - `Depth`：递归深度，默认 4。
   - `Extensions`：监听的文件扩展名，默认 `.medbot`，多个用分号分隔。
   - 点击 `Apply Watch` 生效。
4) 在 Uploader 区域：
   - 设置 `Concurrency`（并发度，默认 3），点击 `Apply`。
   - 可点击 `Pause/Resume` 暂停/恢复上传。

## 5. 上传行为与后端对接
- 每个文件单独以 `multipart/form-data` 方式 POST 至 `/api/logs/upload`。
- 请求头包含：
  - `Authorization: Bearer <token>`
  - `X-Upload-Source: auto-upload`（自动上传标识，后端路由至历史队列）
  - `X-Client-Id: <客户端唯一ID>`
  - `X-Device-Id: <设备编号>`（阶段3初步从文件名提取，如 `4371-04`）
  - `X-Decrypt-Key`（当提取到密钥时再携带，当前版本默认不携带）
- 后端已限制单次请求总大小 ≤ 200MB；客户端按“逐文件”上传，避免一次请求超限。

## 6. 监听与任务
- 监听：使用 `chokidar` 监控所配目录的新增/修改文件（按扩展名过滤，带写入稳定等待），发现文件即加入本地上传队列。
- 并发与重试：
  - 默认并发 3，可在 UI 调整。
  - 失败指数退避重试：1min → 5min → 30min。
- 去重：按“文件绝对路径 + 修改时间”签名，避免重复入队。

## 7. 断点续传与持久化
- 本地任务快照：`%APPDATA%/LogMonitor/data/tasks.json`
- 客户端重启后会恢复历史任务并继续上传。

## 8. 客户端日志与排障
- 客户端日志：`%APPDATA%/LogMonitor/client.log`
  - 记录文件上传成功/失败与耗时、错误原因，方便排障。
- UI 底部显示日志路径提示；上传列表实时显示状态与重试次数。

## 9. 托盘控制
- 右键托盘菜单：
  - Pause Upload / Resume Upload：暂停/恢复上传（内部通过设置并发 0/恢复并发实现）。
  - Show Window：显示主窗口。
  - Quit：退出应用。

## 10. 常见问题（FAQ）
- Electron 安装失败（下载不完整/被拦截）
  - 参见上文“安装与启动”，使用镜像源并清理缓存后重试。
- 429 频率限制
  - 后端启用限流策略：请降低并发或适当分批上传，稍后自动重试。
- 无法访问后端
  - 检查后端 `health` 接口与网络，确认 `API Base URL` 无误（尾部应含 `/api`）。

## 11. 安全建议
- 优先使用 HTTPS；token 安全保存，避免明文外泄。
- `client.log` 为排障用途，不记录密钥明文；如需更严格的日志策略可再收紧。

## 12. 清理与卸载
- 删除客户端目录不会清理数据；如需清理：
  - 删除 `%APPDATA%/LogMonitor/`（包含 `config.json`、`data/tasks.json`、`client.log`）。

## 13. 已完成功能（阶段）
- 阶段0：后端队列路由接入（`auto-upload` → 历史队列）、200MB 校验、`X-Client-Id`。
- 阶段1：客户端骨架、配置持久化、登录、健康检查。
- 阶段2：目录监听、任务队列、并发上传、指数退避、UI 状态。
- 阶段3：设备编号初步提取（文件名正则）、去重、上传头部对接。
- 阶段4：托盘暂停/恢复、UI 控制。
- 阶段5：断点恢复增强、客户端日志与耗时记录。

## 14. 规划中的增强
- 从 `systemInfo.txt` 递归提取密钥，并调用后端 auto-fill 接口反向补全设备编号。
- 压缩包（zip/7z）内部扫描与上传策略。
- 自动更新与安装包（electron-builder）。

如需进一步定制（多语言、代理、开机自启、自动更新、打包发布），可在此项目基础上扩展配置与构建脚本。


