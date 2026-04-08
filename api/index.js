require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');

// --- Firebase init (cached for serverless) ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

const app = express();

// --- CORS ---
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-admin-key'],
}));
app.use(express.json());

// --- Rate limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// --- Helpers ---
function getIdentifier(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  let hash = 0;
  const str = ip + ua;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function verifyTurnstile(token, ip) {
  if (!token) return false;
  if (process.env.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA') return true;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function isAdmin(req) {
  return req.headers['x-admin-key'] === process.env.ADMIN_KEY;
}

// ===== ROUTES =====


// GET /api/statements
app.get('/api/statements', async (req, res) => {
  try {
    const snap = await db.collection('statements').orderBy('votes', 'desc').get();
    const statements = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(statements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/statements — admin creates a statement
app.post('/api/statements', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { text } = req.body;
  if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Text too short' });
  try {
    const ref = await db.collection('statements').add({
      text: text.trim(),
      votes: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/statements/:id — admin deletes a statement
app.delete('/api/statements/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await db.collection('statements').doc(req.params.id).delete();
    // Delete associated votes
    const votesSnap = await db.collection('votes').where('statementId', '==', req.params.id).get();
    const batch = db.batch();
    votesSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/vote
app.post('/api/vote', async (req, res) => {
  const { statementId, type, turnstileToken } = req.body;
  if (!statementId || !['up', 'down'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  const valid = await verifyTurnstile(turnstileToken, ip);
  if (!valid) return res.status(403).json({ error: 'Turnstile verification failed.' });

  const identifier = getIdentifier(req);

  try {
    const statRef = db.collection('statements').doc(statementId);
    const voteId = `${statementId}_${identifier}`;
    const voteRef = db.collection('votes').doc(voteId);

    const [statDoc, voteDoc] = await Promise.all([statRef.get(), voteRef.get()]);

    if (!statDoc.exists) return res.status(404).json({ error: 'Statement not found' });

    const currentVotes = statDoc.data().votes || 0;

    if (voteDoc.exists) {
      const existingType = voteDoc.data().type;
      if (existingType === type) {
        // Retract
        const delta = type === 'up' ? -1 : 1;
        await Promise.all([
          voteRef.delete(),
          statRef.update({ votes: admin.firestore.FieldValue.increment(delta) }),
        ]);
        const updated = await statRef.get();
        return res.json({ statement: { id: updated.id, ...updated.data() }, action: 'retracted', userVote: null });
      } else {
        // Switch
        const delta = type === 'up' ? 2 : -2;
        await Promise.all([
          voteRef.update({ type }),
          statRef.update({ votes: admin.firestore.FieldValue.increment(delta) }),
        ]);
        const updated = await statRef.get();
        return res.json({ statement: { id: updated.id, ...updated.data() }, action: 'changed', userVote: type });
      }
    }

    // New vote
    await Promise.all([
      voteRef.set({ statementId, identifier, type, createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      statRef.update({ votes: admin.firestore.FieldValue.increment(type === 'up' ? 1 : -1) }),
    ]);
    const updated = await statRef.get();
    return res.json({ statement: { id: updated.id, ...updated.data() }, action: 'added', userVote: type });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/my-votes
app.get('/api/my-votes', async (req, res) => {
  const identifier = getIdentifier(req);
  try {
    const snap = await db.collection('votes').where('identifier', '==', identifier).get();
    const result = {};
    snap.docs.forEach(d => { result[d.data().statementId] = d.data().type; });
    res.json(result);
  } catch {
    res.json({});
  }
});

// Serve static files from the root
app.use(express.static(path.join(__dirname, '..')));

// Fallback to index.html for frontend
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found' });
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

module.exports = app;
