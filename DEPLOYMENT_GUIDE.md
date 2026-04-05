# 🗳 Voting App — Deployment Guide

## Architecture Overview

```asdasd
React (Vite) client  →  /api/*  →  Express (Vercel serverless)  →  MongoDB Atlas
        ↓                                      ↑
Cloudflare Turnstile widget  →  token  →  server verification
```

## Step 1 — Set up MongoDB Atlas (Free)

1. Go to https://cloud.mongodb.com → Create free account
2. Create a **Free M0 cluster**
3. **Database Access** → Add user with password
4. **Network Access** → Add IP: `0.0.0.0/0` (allow all — required for Vercel)
5. **Connect** → **Drivers** → Copy your connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/votingapp?retryWrites=true&w=majority
   ```

## Step 2 — Set up Cloudflare Turnstile (Free)

1. https://dash.cloudflare.com → **Turnstile** → **Add Site**
2. Enter your Vercel URL (e.g. `voting-app.vercel.app`)
3. Choose **Managed** → Create
4. Save both keys:
   - **Site Key** (public, frontend)
   - **Secret Key** (private, backend env var)

NOTE: For local dev, use the free Cloudflare test keys (already set in `client/.env.local`):
- Site Key: `1x00000000000000000000AA`
- Secret Key: `1x0000000000000000000000000000000AA`

## Step 3 — Deploy to Vercel

### Using Vercel CLI
```bash
npm install -g vercel
# From project root d:\web\VOTING
vercel
```

### Using Vercel Dashboard
1. Push to GitHub
2. New Project → Import repo
3. Root Directory: `./` (the root, NOT `/client`)
4. Build Command: `npm run build`
5. Output Directory: `client/dist`

### Environment Variables (Vercel Project Settings)

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string |
| `ADMIN_KEY` | A strong password for admin access |
| `TURNSTILE_SECRET_KEY` | Your Cloudflare Turnstile secret key |
| `CLIENT_URL` | `https://your-app.vercel.app` |
| `VITE_TURNSTILE_SITE_KEY` | Your Cloudflare Turnstile site key |

WARNING: All `VITE_` prefixed vars must also be in Vercel Dashboard so the build embeds them.

## Step 4 — Local Development

Create `.env` in `d:\web\VOTING\` root:
```
MONGODB_URI=mongodb+srv://...
ADMIN_KEY=yourpassword
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
PORT=3001
```

Terminal 1: `node api/server.js`
Terminal 2: `cd client && npm run dev`  →  http://localhost:5173

## How the App Works

### For Voters
- See all statements ranked by net votes
- Click ▲ to upvote, ▼ to downvote
- Complete Cloudflare Turnstile (auto-passes for humans)
- Click same button again to RETRACT your vote
- Switching ▲→▼ changes vote (score changes by 2)
- Scores can go NEGATIVE if downvotes exceed upvotes
- Higher votes = higher position in the list

### For Admins
- Click ⚙ button (bottom-right)
- Enter your ADMIN_KEY password
- Add new statements for people to vote on
- Delete statements (removes all votes too)

### Anti-Spam Layers

| Layer | What it does |
|---|---|
| Cloudflare Turnstile | Every vote requires human verification |
| IP + UA fingerprint | One vote per person per statement (server) |
| Rate limiting | Max 60 API requests / 15 minutes / IP |
| MongoDB unique index | Database-level deduplication |

## Project Structure

```
d:\web\VOTING\
├── api/
│   ├── index.js        <- Express API (Vercel serverless entry)
│   └── server.js       <- Local dev wrapper
├── client/
│   ├── src/
│   │   ├── App.jsx     <- Main React UI
│   │   ├── api.js      <- API client
│   │   ├── main.jsx    <- Entry point
│   │   └── index.css   <- Dark glassmorphism styling
│   ├── .env.local      <- Local env vars
│   └── vite.config.js  <- Dev server proxy
├── package.json        <- Root (server deps + build)
├── vercel.json         <- Vercel routing config
└── .gitignore
```
