# Gym Progress

Upload a set of photos each day; the page turns them into a streak tracker and a
day-by-day timeline. Photos live in a private Supabase Storage bucket (`gym-photos`),
one folder per date.

## Deploy to Vercel

1. Push this folder to a GitHub repo. `.env` is gitignored — check that it did **not** get
   committed, since it holds your Supabase secret key:

   ```
   git init && git add -A && git commit -m "gym progress tracker"
   git status --short          # .env must not appear
   ```

2. On Vercel: **Add New → Project → Import** the repo. Leave every build setting alone —
   no framework, no build command. `vercel.json` handles the rest.

3. Before the first deploy, add three **Environment Variables** (all environments):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://abemsnqunjxffrimkbmf.supabase.co` |
   | `SUPABASE_SECRET_KEY` | your `sb_secret_…` key |
   | `APP_PASSWORD` | the password you want for the site |

4. Deploy, open the URL, enter the password. It's remembered on that device.

If you skip `APP_PASSWORD`, **the site is open to anyone with the URL** — including the
upload and delete endpoints. Always set it in production.

## Run locally

```
node server.js          # reads .env, serves http://localhost:4321
```

The local server runs the same `api/*.js` handlers Vercel does, so local behaviour
matches production.

## How it works

- **Upload** — the date box defaults to today. Pick photos (or drag them in) and hit Save.
  Each photo is shrunk in the browser to max 1600px JPEG before upload, so a 5MB phone
  photo lands around 300KB. They upload one per request, since hosted functions cap
  request bodies at 4.5MB.
- **Storage** — `gym-photos/YYYY-MM-DD/<timestamp>.jpg` in a **private** bucket. Images are
  proxied through `/api/image`, so no photo of yours sits on a public URL.
- **Tracker** — current streak (counts today or yesterday as the endpoint, so an unfinished
  day never zeroes it), best streak, days logged, total photos, days tracking, and a
  12-week calendar grid shaded by how many photos each day has.
- **Auth** — one shared password in `APP_PASSWORD`. The browser sends it as a header on API
  calls and as a cookie for `<img>` requests, which cannot carry headers.

## Layout

```
api/
  days.js     GET    list every day with photos, newest first
  upload.js   POST   save one photo  { date, dataUrl, seq }
  photo.js    DELETE remove one photo  ?date=&file=
  image.js    GET    proxy a photo out of the private bucket
lib/store.js  Supabase calls + the password check, shared by all handlers
public/index.html   the entire frontend
server.js     local dev server, runs the same handlers
vercel.json   static root + the /uploads/:date/:file rewrite
```

No npm dependencies — it runs on Node's built-in `fetch` and `http`.
