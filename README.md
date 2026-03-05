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

## URL compatibility
Default integrated build (`npm run build` or `npm run serve`) preserves existing URLs:
- `/dashboard...`
- `/smart-search`
- `/m...`
- `/m/login`

## Deploy approach
- Integrated deploy: publish `frontend/dist`.
- Independent deploy:
  1. publish `frontend/dist-web` for web traffic
  2. publish `frontend/dist-mobile` for mobile traffic
  3. route `/m/*` to the mobile artifact at ingress layer

## Migration reference
See:
- `frontend/docs/frontend-split-migration.md`

## Cloud deploy script
Use `deploy/deploy-cloud.sh` on your Linux server to:
- pull latest git code
- install backend/frontend dependencies
- build frontend by target (`all`, `web`, `mobile`)
- restart backend via PM2
- optionally reload nginx

Example:

```bash
cd /www/server/logtool
bash deploy/deploy-cloud.sh --branch main --with-nginx
bash deploy/deploy-cloud.sh --branch main --target web
bash deploy/deploy-cloud.sh --branch main --target mobile
```

Common options:
- `--app-dir /www/server/logtool`
- `--branch <branch-name>`
- `--remote origin`
- `--pm2-name logtool-cluster`
- `--target all|web|mobile` (default: `all`)
- `--allow-dirty` (deploy even with local uncommitted files)

If your server path or PM2 process name differs, pass the corresponding options.

## Branch workflow（分支收尾：推送后自动删分支）

希望流程：从 main 拉分支开发 → 推送 → 自动删掉该分支（远程+本地），不用再手动删本地分支。

1. **从主分支拉取并开新分支、开发**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/xxx
   # 开发、commit...
   ```

2. **推送后一键收尾（自动删远程+本地分支，并回到 main）**
   - **Windows（PowerShell）：**
     ```powershell
     .\deploy\finish-branch.ps1
     ```
   - **Linux / macOS / Git Bash：**
     ```bash
     bash deploy/finish-branch.sh
     ```
   脚本会：推送当前分支 → 切回 main 并 pull → 删除远程分支 → 删除本地分支。

3. **若在 GitHub/GitLab 上通过 MR/PR 合并并已删除远程分支**，只删本地分支时可加参数：
   - PowerShell: `.\deploy\finish-branch.ps1 -NoDeleteRemote`
   - Bash: `bash deploy/finish-branch.sh --no-delete-remote`
