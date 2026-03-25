# LogTool

## Frontend targets
Frontend now supports explicit web/mobile boundaries with a shared code core.

- `all` target: integrated build (legacy behavior, all routes)
- `web` target: web-focused build
- `mobile` target: mobile-focused build

## Run frontend
From `frontend/`:

```bash
npm install
npm run serve
npm run serve:web
npm run serve:mobile
```

## Build frontend
From `frontend/`:

```bash
npm run build
npm run build:web
npm run build:mobile
```

Build output directories:
- `frontend/dist` (all)
- `frontend/dist-web` (web)
- `frontend/dist-mobile` (mobile)

## Cloud deploy script
Use `deploy/deploy-cloud.sh` on your Linux server to:
- pull latest git code
- install backend/frontend dependencies
- build frontend by target (`all`, `web`, `mobile`)
- sync frontend artifacts to nginx deploy directory
- restart backend via PM2
- optionally reload nginx

Example:

```bash
cd ~/logtool
bash deploy/deploy-cloud.sh --repo-dir ~/logtool --deploy-dir /www/server/logtool --branch main --target all --with-nginx
bash deploy/deploy-cloud.sh --repo-dir ~/logtool --deploy-dir /www/server/logtool --branch main --target web
bash deploy/deploy-cloud.sh --repo-dir ~/logtool --deploy-dir /www/server/logtool --branch main --target mobile
```

Common options:
- `--repo-dir ~/logtool`
- `--deploy-dir /www/server/logtool`
- `--app-dir <path>` (alias of `--repo-dir`)
- `--branch <branch-name>`
- `--remote origin`
- `--pm2-name logtool-cluster`
- `--target all|web|mobile` (default: `all`)
- `--allow-dirty` (deploy even with local uncommitted files)

If your server path or PM2 process name differs, pass the corresponding options.

## 故障码释义规则

释义（explanation）支持占位符、转义表、过滤器及 JSON 规则，解析逻辑见 `backend/src/utils/explanationParser.js`。

### 占位符

| 占位符 | 对应参数 |
|--------|----------|
| `{0}` | param1 |
| `{1}` | param2 |
| `{2}` | param3 |
| `{3}` | param4 |

### 转义表 `{i:d}`

- `d` 为转义表索引，定义在 `shared/config/FaultMappings.json`
- `{0:0}`：跳过映射，直接使用参数原始值
- `{0:1}`～`{0:50}`：按转义表将参数值映射为可读文本

### 过滤器 `{i|filter}`

在 `|` 后可接过滤器，支持链式：`{0|scale(0.001)|round(2)}`

| 过滤器 | 说明 |
|--------|------|
| `scale(n)` | 数值 × n |
| `mul(n)` | 数值 × n |
| `div(n)` | 数值 ÷ n |
| `round(n)` | 四舍五入，保留 n 位小数 |
| `fixed(n)` | 固定 n 位小数 |
| `unit(ms->s)` | 单位换算（见 `unitMappings.json`） |
| `hex(n)` | 转十六进制，n 为最小位数 |
| `zpad(n)` | 左侧补零至 n 位 |
| `prefix('x')` | 数值前加前缀 |
| `suffix('x')` | 数值后加后缀 |
| `ascii()` | 数值转 ASCII 字符 |
| `asciiHex()` | 十六进制字符串转 ASCII |
| `highByte` | 取高字节 |
| `lowByte` | 取低字节 |

### 组合格式

- `{0:1|scale(0.001)}`：先转义表映射，再应用过滤器

### JSON 规则

当释义以 `{` 或 `[` 开头且为合法 JSON 时，按规则匹配：

```json
{
  "rules": [
    { "match": { "param1": 1 }, "template": "模板A", "priority": 0 },
    { "match": { "param1": { "gt": 10 } }, "template": "模板B" }
  ],
  "fallback": "默认模板"
}
```

`match` 支持：`eq`、`gt`、`gte`、`lt`、`lte`、`in`、`between`、`bitAnd`、`regex`。

### 快捷提示触发条件

| 用户输入 | 提示内容 |
|----------|----------|
| `{`、`{0`、`{0}`+`|` 等 | 占位符、**全部 14 个过滤器**（统一显示，避免时序导致只显示 7 个） |
| `{0` 后输入 `:`（即 `{0:`） | 转义表索引（0 跳过映射、1~50 转义表），输入数字可前缀过滤 |
| `"param1": { "` 或 `"param2": { "gt` 等 | **match 操作符**：eq、gt、gte、lt、lte、in、between、bitAnd、regex |
| 文档开头或空行 + **Ctrl+Space** | JSON 规则结构、占位符 |

> 输入时自动触发补全；空行/开头需按 Ctrl+Space 显式触发。`{`、`{0`、`{0|` 均显示全部 14 个过滤器，避免因补全时序导致仍显示 7 个。**新建故障码**时释义输入框会自动填充默认 JSON 规则模板。

### 相关文件

| 文件 | 作用 |
|------|------|
| `shared/config/FaultMappings.json` | 转义表（前后端共用） |
| `backend/src/config/unitMappings.json` | 单位换算（`unit` 过滤器） |
| `backend/src/utils/explanationParser.js` | 解析逻辑 |
| `frontend/src/utils/explanationEditor.js` | 编辑器补全与校验 |

## 维护（Docker）

进入 MySQL 容器进行数据库维护：

```bash
cd ~/logtool
docker exec -it logtool-mysql-1 mysql -u root -p
```

进入 Clickhouse 容器进行数据库维护：

```bash
docker exec -it logtool-clickhouse-1 clickhouse-client
```

进入ES 容器进行检索维护

```bash
#检查索引
curl -s -u elastic:Mykey "http://localhost:9200/_cat/indices?v"
#检查是否可以访问
curl -s -u elastic:940927syz "http://localhost:9200"
```