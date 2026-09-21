# S.T.A.L.K.E.R. 2 — progress tracker

Static PDA-style checklist for side content (EN / RU). Progress is stored in the browser (`localStorage`).

Open `index.html` locally — no build step, no server required.

## Files

```
index.html
css/style.css
js/app.js
js/i18n.js
js/data.js   ← catalog + EN/RU strings
```

## Deploy to GitHub Pages (new repo)

Do this once you have created an empty GitHub repository (no README/license if you prefer a clean first push).

### 1. Local repo (in this folder)

```bash
git init
git add .
git commit -m "Initial commit: STALKER 2 field log"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Replace `YOUR_USER` / `YOUR_REPO` with your GitHub username and repo name.

### 2. Enable Pages

1. On GitHub: **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` → folder `/ (root)` → **Save**

After a minute or two the site is at:

`https://YOUR_USER.github.io/YOUR_REPO/`

(If the repo is named `YOUR_USER.github.io`, the site is at the domain root instead.)

### Notes

- `.nojekyll` is included so GitHub does not run Jekyll on this static site.
- Asset paths are relative (`css/…`, `js/…`), so project Pages URLs work without a custom `base`.
- Do not commit secrets; this project has none.
