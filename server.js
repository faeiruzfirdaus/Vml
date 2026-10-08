require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const POLL_MS = Math.max(5000, Number(process.env.POLL_MS || 8000));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('\nVML PUSH BACKEND: Missing required environment variables.');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const sbHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

let lastFeedIds = new Set();
let baselineReady = false;
let polling = false;

async function supabase(path, options = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...sbHeaders, ...(options.headers || {}) }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || ('Supabase HTTP ' + r.status));
  return text ? JSON.parse(text) : null;
}

function normalizeFeed(data) {
  if (Array.isArray(data)) return data.filter(x => x && typeof x === 'object');
  if (Array.isArray(data?.posts)) return normalizeFeed(data.posts);
  if (Array.isArray(data?.items)) return normalizeFeed(data.items);
  if (Array.isArray(data?.feed)) return normalizeFeed(data.feed);
  return [];
}

async function getFeed() {
  const rows = await supabase('vml_data_store?select=data&path=eq.feed&limit=1', {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  return normalizeFeed(rows?.[0]?.data);
}

async function getSubscriptions() {
  return supabase('vml_push_subscriptions?select=id,endpoint,subscription,phone,name,profile');
}

async function deleteSubscription(id) {
  await supabase('vml_push_subscriptions?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
}

function postUrl(postId) {
  return PUBLIC_APP_URL + '/?feed=' + encodeURIComponent(postId);
}

async function pushNewPost(post) {
  const subscriptions = await getSubscriptions();
  const authorPhone = String(post.phone || '').trim().toLowerCase();
  const bodyText = String(post.text || '').replace(/\s+/g, ' ').trim();
  const body = (post.name || 'VML USER') + ' membuat posting baru' + (bodyText ? ': ' + bodyText.slice(0, 110) : '');
  const payload = JSON.stringify({
    title: 'VML FEED — POST BARU',
    body,
    postId: String(post.id),
    url: postUrl(post.id),
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'vml-feed-' + String(post.id)
  });

  let sent = 0;
  for (const row of subscriptions || []) {
    const targetPhone = String(row.phone || '').trim().toLowerCase();
    if (authorPhone && targetPhone && authorPhone === targetPhone) continue;
    if (!row.subscription?.endpoint) continue;
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 300 });
      sent++;
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) {
        try { await deleteSubscription(row.id); } catch (_) {}
      } else {
        console.warn('VML PUSH SEND:', code || '', err.message || err);
      }
    }
  }
  console.log(new Date().toISOString(), 'POST', post.id, 'push sent:', sent, 'subscribers:', (subscriptions || []).length);
}

async function pollFeed() {
  if (polling) return;
  polling = true;
  try {
    const feed = await getFeed();
    const ids = new Set(feed.map(p => String(p.id)).filter(Boolean));
    if (!baselineReady) {
      lastFeedIds = ids;
      baselineReady = true;
      console.log('VML PUSH: baseline ready, posts:', ids.size);
      return;
    }
    const fresh = feed.filter(p => p?.id && !lastFeedIds.has(String(p.id)));
    lastFeedIds = ids;
    for (const post of fresh.slice(-10)) await pushNewPost(post);
  } catch (err) {
    console.error('VML PUSH POLL:', err.message || err);
  } finally {
    polling = false;
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'VML Web Push Backend' }));
app.get('/vapid-public-key', (_req, res) => res.json({ publicKey: VAPID_PUBLIC_KEY }));

app.post('/subscribe', async (req, res) => {
  try {
    const subscription = req.body?.subscription;
    const user = req.body?.user || {};
    if (!subscription?.endpoint) return res.status(400).json({ ok: false, error: 'Invalid push subscription.' });
    const payload = {
      endpoint: subscription.endpoint,
      subscription,
      phone: String(user.phone || '').trim(),
      name: String(user.name || 'VML USER').slice(0, 120),
      profile: String(user.profile || '').slice(0, 5000),
      updated_at: new Date().toISOString()
    };
    await supabase('vml_push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload)
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('VML PUSH SUBSCRIBE:', err.message || err);
    res.status(500).json({ ok: false, error: 'Subscription save failed.' });
  }
});

app.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ ok: false });
    await supabase('vml_push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), { method: 'DELETE' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Unsubscribe failed.' });
  }
});

app.listen(PORT, () => {
  console.log('VML Web Push Backend listening on port', PORT);
  pollFeed();
  setInterval(pollFeed, POLL_MS);
});
