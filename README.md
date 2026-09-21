# S.T.A.L.K.E.R. 2 — progress tracker

Static PDA-style checklist for side content (EN / RU). Progress is stored in the browser (`localStorage`).

Open `index.html` locally — no build step, no server required.

**Live site (after Pages is enabled):**  
https://chernaruski.github.io/STLK2_T/

## Files

```
index.html
css/style.css
js/app.js
js/i18n.js
js/data.js
.github/workflows/pages.yml   ← deploys to GitHub Pages on push
```

## Enable GitHub Pages (one-time)

1. Push this repo to GitHub (already: `chernaruski/STLK2_T`).
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push any commit (or re-run the **Deploy GitHub Pages** workflow under the **Actions** tab).

The workflow copies `index.html`, `css/`, `js/`, and `.nojekyll` to Pages. Site URL:

`https://chernaruski.github.io/STLK2_T/`

## Notes

- Asset paths are relative, so the project Pages URL works as-is.
- `.nojekyll` skips Jekyll processing on the static site.
- Progress stays in each visitor’s browser; nothing is stored on the server.
