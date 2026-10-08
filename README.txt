VML V83 FEED WEB PUSH — DEPLOY GUIDE

1) SUPABASE
Open Supabase SQL Editor and run:
  supabase-push-subscriptions.sql

2) BACKEND
Deploy this folder (server.js + package.json) to Render/Railway/Fly.io or another Node HTTPS host.
Set these environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  PUBLIC_APP_URL=https://vmlupdate.netlify.app
  VAPID_SUBJECT=mailto:your-email@example.com
  VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  POLL_MS=8000

Generate VAPID keys locally after npm install:
  npm install
  npm run generate-vapid
Then copy the two keys into the backend environment.

3) NETLIFY FRONTEND
Deploy index.html, sw.js and _redirects to your Netlify site.
IMPORTANT: edit _redirects and replace YOUR-BACKEND-DOMAIN with your real backend URL.
The frontend calls /api, so no backend URL needs to be hard-coded into the HTML.

4) ENABLE PUSH
Open https://vmlupdate.netlify.app/ on Android Chrome.
Login to Feed, tap the 🔔 button, and allow notifications.
Repeat for every user/device that should receive notifications.

5) TEST
Create a new Feed post from another account/device.
The backend polls Supabase every POLL_MS milliseconds and sends Web Push.
The author is skipped based on phone number.
Tap the notification: it opens https://vmlupdate.netlify.app/?feed=POST_ID.
The V83 deep-link code shows the post in a popup with BACK.

SECURITY
- Keep SUPABASE_SERVICE_ROLE_KEY only on the backend.
- Keep VAPID_PRIVATE_KEY only on the backend.
- Never publish .env or private keys to Netlify.
- Web Push requires HTTPS on the frontend.
