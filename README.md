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
