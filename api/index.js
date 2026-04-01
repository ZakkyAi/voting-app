const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// --- MongoDB connection (cached for serverless) ---
let cachedDb = null;
async function connectDB() {
  if (cachedDb) return cachedDb;
  const conn = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  cachedDb = conn;
  return cachedDb;
}

// --- Schemas ---
const statementSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 500 },
  votes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const voteSchema = new mongoose.Schema({
  statementId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Statement' },
  identifier: { type: String, required: true }, // IP + UA hash
  type: { type: String, enum: ['up', 'down'], required: true },
  createdAt: { type: Date, default: Date.now },
});
voteSchema.index({ statementId: 1, identifier: 1 }, { unique: true });

const Statement = mongoose.models.Statement || mongoose.model('Statement', statementSchema);
const Vote = mongoose.models.Vote || mongoose.model('Vote', voteSchema);

// --- Helpers ---
function getIdentifier(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  // Simple hash for identifier
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
  // Allow bypass in test/dev mode with dummy sitekey
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

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// GET /api/statements — list all sorted by votes desc
app.get('/api/statements', async (req, res) => {
  try {
    await connectDB();
    const statements = await Statement.find({}).sort({ votes: -1, createdAt: -1 }).lean();
    res.json(statements);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/statements — admin creates a statement
app.post('/api/statements', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { text } = req.body;
  if (!text || text.trim().length < 3) return res.status(400).json({ error: 'Text too short' });
  try {
    await connectDB();
    const statement = await Statement.create({ text: text.trim() });
    res.status(201).json(statement);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/statements/:id — admin deletes a statement
app.delete('/api/statements/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await connectDB();
    await Statement.findByIdAndDelete(req.params.id);
    await Vote.deleteMany({ statementId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/vote — cast or change a vote
app.post('/api/vote', async (req, res) => {
  const { statementId, type, turnstileToken } = req.body;
  if (!statementId || !['up', 'down'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  // Verify Turnstile
  const valid = await verifyTurnstile(turnstileToken, ip);
  if (!valid) return res.status(403).json({ error: 'Turnstile verification failed. Please complete the challenge.' });

  const identifier = getIdentifier(req);

  try {
    await connectDB();

    const statement = await Statement.findById(statementId);
    if (!statement) return res.status(404).json({ error: 'Statement not found' });

    const existing = await Vote.findOne({ statementId, identifier });

    if (existing) {
      if (existing.type === type) {
        // Same vote → retract it
        await Vote.deleteOne({ _id: existing._id });
        const delta = type === 'up' ? -1 : 1;
        statement.votes += delta;
        await statement.save();
        return res.json({ statement, action: 'retracted', userVote: null });
      } else {
        // Different vote → switch it
        const delta = type === 'up' ? 2 : -2;
        existing.type = type;
        await existing.save();
        statement.votes += delta;
        await statement.save();
        return res.json({ statement, action: 'changed', userVote: type });
      }
    }

    // New vote
    await Vote.create({ statementId, identifier, type });
    statement.votes += type === 'up' ? 1 : -1;
    await statement.save();
    return res.json({ statement, action: 'added', userVote: type });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(429).json({ error: 'Duplicate vote detected' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/my-votes — return which statements the user voted on (by identifier)
app.get('/api/my-votes', async (req, res) => {
  const identifier = getIdentifier(req);
  try {
    await connectDB();
    const votes = await Vote.find({ identifier }).lean();
    const result = {};
    votes.forEach(v => { result[v.statementId.toString()] = v.type; });
    res.json(result);
  } catch {
    res.json({});
  }
});

module.exports = app;
