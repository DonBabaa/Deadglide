# Hosting DeadSlide on Cloudflare Pages

The game is a static site built by Vite, plus one small function for the shared leaderboards
(`functions/api/leaderboard.js`). Cloudflare Pages builds it from GitHub every time `main` is pushed.

## One-time setup (in the Cloudflare dashboard)

1. **Create the project.** Workers & Pages → Create → Pages → Connect to Git → choose the `Deadglide` repository.
2. **Build settings.**
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Deploy.** The first build gives the site its address (`something.pages.dev`). The game works at this point; only
   the shared leaderboards do not.
4. **Create the leaderboard's storage.** Storage & Databases → KV → Create a namespace. Any name will do
   (for example `deadslide-leaderboard`).
5. **Bind it to the site.** Open the Pages project → Settings → Bindings (or Functions → KV namespace bindings) → Add.
   - Variable name: `LEADERBOARD` (exactly this: the function looks for it by name)
   - KV namespace: the one from step 4
   Add it for Production. Add it for Preview too if you want boards on preview builds.
6. **Redeploy** (Deployments → the latest one → Retry deployment), so the function picks the binding up.

## Checking it

Open `https://<your-site>.pages.dev/api/leaderboard` in a browser.

- `{"top":[]}` means it is working.
- A message about "no storage yet" means the binding in step 5 is missing or misnamed, or step 6 was skipped.

## Things to know

- **Saves are per address.** Gold, purchases and progress are kept in each player's browser under the site's address.
  At the new address everyone starts fresh, unless you point the same custom domain at it.
- **Old scores do not come across.** The Netlify boards stay on Netlify.
- **A new score can take up to a minute to appear** for everyone: that is how this storage works.
- **`netlify.toml` and `netlify/`** are no longer used. They are harmless here and can be deleted once the move is
  confirmed (and `@netlify/blobs` removed from `package.json`).
