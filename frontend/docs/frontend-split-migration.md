# Frontend Split Migration Note

## Goal
Introduce explicit frontend boundaries so web and mobile can be developed and deployed relatively independently while preserving existing behavior and URLs.

## New structure
- `src/apps/web/`
  - `WebAppShell.vue`: web shell wrapper
  - `routes.js`: web route module
- `src/apps/mobile/`
  - `MobileAppShell.vue`: mobile shell wrapper
  - `routes.js`: mobile route module
- `src/apps/shared/`
  - `target.js`: runtime target selection (`all`/`web`/`mobile`)
- `src/router/`
  - `index.js`: route composition by target
  - `guards.js`: shared route guards

Shared cross-app modules remain centralized and unchanged in purpose:
- `src/api/`
- `src/store/`
- `src/i18n/`

## URL compatibility
Default target is `all`, which keeps existing URLs working:
- Web paths (for example): `/dashboard...`, `/smart-search`, `/login`
- Mobile paths: `/m...`, `/m/login`

Target-specific builds also include compatibility redirects where practical:
- `web` target redirects `/m/*` to `/login`
- `mobile` target redirects web entry paths to `/m` or `/m/login`

## Build/run targets
Environment flag:
- `VUE_APP_TARGET=all|web|mobile`

Scripts:
- `npm run serve` (all)
- `npm run serve:web`
- `npm run serve:mobile`
- `npm run build` (all)
- `npm run build:web`
- `npm run build:mobile`

Output directories:
- `all` -> `dist`
- `web` -> `dist-web`
- `mobile` -> `dist-mobile`

## Independent deployment approach
1. Build each target separately:
   - `npm run build:web`
   - `npm run build:mobile`
2. Deploy `dist-web` and `dist-mobile` as separate static artifacts (or separate hosts).
3. Route traffic by prefix (`/m`) at gateway/CDN/nginx level to the mobile artifact when split-hosting is desired.
4. Keep backend API contract unchanged (`/api` proxy/baseURL remains the same).

## Risk controls in this migration
- No backend contract changes.
- Existing shared store/api/i18n behavior preserved.
- Route guards remain centralized and consistent across targets.
- Default `all` target preserves current integrated runtime behavior.
