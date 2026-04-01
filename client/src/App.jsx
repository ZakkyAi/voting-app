import { useState, useEffect, useCallback } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { Toaster, toast } from 'react-hot-toast';
import { getStatements, getMyVotes, castVote, createStatement, deleteStatement } from './api';
import './index.css';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

// ─── Utility ───────────────────────────────────────────────────────────────
function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getRankClass(rank) {
  if (rank === 1) return 'rank-1';
  if (rank === 2) return 'rank-2';
  if (rank === 3) return 'rank-3';
  return 'rank-other';
}

function getRankLabel(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

// ─── VoteBar ───────────────────────────────────────────────────────────────
function VoteBar({ votes, maxVotes }) {
  if (maxVotes === 0) return null;
  const pct = Math.max(0, Math.min(100, ((votes + maxVotes) / (maxVotes * 2)) * 100));
  const color = votes > 0 ? 'var(--up-color)' : votes < 0 ? 'var(--down-color)' : 'var(--text-muted)';
  return (
    <div className="vote-bar">
      <div className="vote-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── StatementCard ─────────────────────────────────────────────────────────
function StatementCard({ statement, rank, userVote, onVote, isAdmin, adminKey, onDelete }) {
  const [busy, setBusy] = useState(false);

  const handleVote = async (type) => {
    if (busy) return;
    setBusy(true);
    await onVote(statement._id, type);
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this statement?')) return;
    await onDelete(statement._id);
  };

  const voteClass = statement.votes > 0 ? 'positive' : statement.votes < 0 ? 'negative' : 'zero';
  const rankClass = getRankClass(rank);

  return (
    <article className={`statement-card ${rankClass}`}>
      {/* Rank */}
      <div className={`rank-badge ${rankClass}`}>{getRankLabel(rank)}</div>

      {/* Content */}
      <div className="card-content">
        <p className="card-text">{statement.text}</p>
        <div className="card-meta">{timeAgo(statement.createdAt)}</div>
        <VoteBar votes={statement.votes} maxVotes={50} />

        {isAdmin && (
          <div className="admin-actions" style={{ marginTop: 10 }}>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Delete</button>
          </div>
        )}
      </div>

      {/* Vote Controls */}
      <div className="vote-controls">
        <button
          className={`vote-btn up ${userVote === 'up' ? 'active' : ''}`}
          onClick={() => handleVote('up')}
          disabled={busy}
          title="Upvote"
          aria-label="Upvote"
        >
          ▲
        </button>
        <span className={`vote-count ${voteClass}`}>{statement.votes > 0 ? '+' : ''}{statement.votes}</span>
        <button
          className={`vote-btn down ${userVote === 'down' ? 'active' : ''}`}
          onClick={() => handleVote('down')}
          disabled={busy}
          title="Downvote"
          aria-label="Downvote"
        >
          ▼
        </button>
      </div>
    </article>
  );
}

// ─── TurnstileModal ────────────────────────────────────────────────────────
function TurnstileModal({ onVerified, onCancel, action }) {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  const handleSuccess = (t) => {
    setToken(t);
    setReady(true);
  };

  return (
    <div className="turnstile-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="turnstile-modal">
        <h3>Quick Verification</h3>
        <p>Please verify you're human before {action === 'up' ? 'upvoting' : 'downvoting'}. This keeps results fair.</p>
        <div className="turnstile-widget">
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={handleSuccess}
            options={{ theme: 'dark', size: 'normal' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!ready}
            onClick={() => onVerified(token)}
          >
            {ready ? 'Submit Vote ✓' : 'Verifying…'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminPanel ────────────────────────────────────────────────────────────
function AdminPanel({ onClose, adminKey, setAdminKey, statements, onCreated, onDeleted }) {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setAdminKey(keyInput.trim());
    setAuthed(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await createStatement(text.trim(), adminKey);
      onCreated(res.data);
      setText('');
      toast.success('Statement created!');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create';
      setError(msg);
      if (err.response?.status === 403) setAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteStatement(id, adminKey);
      onDeleted(id);
      toast.success('Statement deleted');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete';
      if (err.response?.status === 403) { setAuthed(false); return; }
      toast.error(msg);
    }
  };

  return (
    <div className="admin-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-panel" style={{ position: 'relative' }}>
        <button className="close-btn" onClick={onClose}>×</button>
        <h2><span className="icon">⚙</span> Admin Panel</h2>

        {!authed ? (
          <form className="admin-auth" onSubmit={handleLogin}>
            <div className="input-group">
              <label>Admin Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter admin key…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary">Unlock Admin →</button>
          </form>
        ) : (
          <>
            <form className="admin-form" onSubmit={handleCreate}>
              <div className="input-group">
                <label>New Statement</label>
                <textarea
                  className="input-field"
                  placeholder="Enter a statement for people to vote on…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                  required
                />
              </div>
              {error && <div className="error-banner">{error}</div>}
              <button type="submit" className="btn btn-primary" disabled={loading || !text.trim()}>
                {loading ? 'Creating…' : '+ Add Statement'}
              </button>
            </form>

            <div className="admin-statements-list">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                All Statements ({statements.length})
              </p>
              {statements.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No statements yet.</p>
              )}
              {statements.map(s => (
                <div key={s._id} className="admin-statement-item">
                  <p className="admin-statement-text">{s.text}</p>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s._id)}>Delete</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [statements, setStatements] = useState([]);
  const [myVotes, setMyVotes] = useState({}); // { statementId: 'up' | 'down' }
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [pendingVote, setPendingVote] = useState(null); // { id, type }

  // Load statements & my votes
  const loadData = useCallback(async () => {
    try {
      const [stmtsRes, votesRes] = await Promise.all([getStatements(), getMyVotes()]);
      setStatements(stmtsRes.data);
      setMyVotes(votesRes.data);
    } catch {
      toast.error('Failed to load statements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Initiate vote → open Turnstile modal
  const handleVoteRequest = (statementId, type) => {
    setPendingVote({ id: statementId, type });
  };

  // After Turnstile verified → send actual vote
  const handleVoteVerified = async (token) => {
    if (!pendingVote) return;
    const { id, type } = pendingVote;
    setPendingVote(null);

    try {
      const res = await castVote(id, type, token);
      const updated = res.data.statement;
      const userVote = res.data.userVote;
      const action = res.data.action;

      setStatements(prev =>
        [...prev.map(s => s._id === updated._id ? updated : s)]
          .sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt))
      );
      setMyVotes(prev => ({ ...prev, [id]: userVote }));

      if (action === 'retracted') toast('Vote removed', { icon: '↩' });
      else if (action === 'changed') toast(type === 'up' ? '👍 Changed to upvote!' : '👎 Changed to downvote!');
      else toast.success(type === 'up' ? '👍 Upvoted!' : '👎 Downvoted!');
    } catch (err) {
      const msg = err.response?.data?.error || 'Vote failed';
      toast.error(msg);
    }
  };

  const totalVotes = statements.reduce((sum, s) => sum + Math.abs(s.votes), 0);
  const maxVotes = statements.length > 0 ? Math.max(...statements.map(s => s.votes)) : 0;

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-accent)', fontFamily: 'Inter, sans-serif' },
        }}
      />

      <main className="app-container">
        {/* Header */}
        <header className="header">
          <div className="header-badge">
            <span className="dot" />
            Live Voting
          </div>
          <h1>Community Votes</h1>
          <p>Vote on statements anonymously. No account needed — just your honest opinion.</p>
        </header>

        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-chip">📋 <strong>{statements.length}</strong> statements</div>
          <div className="stat-chip">🗳 <strong>{totalVotes}</strong> total votes</div>
          <div className="stat-chip">🏆 Top score: <strong>{maxVotes > 0 ? `+${maxVotes}` : maxVotes}</strong></div>
        </div>

        {/* Statements */}
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : statements.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No statements yet</h3>
            <p>The admin hasn't posted any statements. Check back soon!</p>
          </div>
        ) : (
          <div>
            <div className="statements-header">
              <span className="statements-title">Ranked by votes</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click ▲▼ to vote or retract</span>
            </div>
            <div className="statements-list" role="list">
              {statements.map((s, i) => (
                <StatementCard
                  key={s._id}
                  statement={s}
                  rank={i + 1}
                  userVote={myVotes[s._id]}
                  onVote={handleVoteRequest}
                  isAdmin={!!adminKey && showAdmin}
                  adminKey={adminKey}
                  onDelete={(id) => {
                    setStatements(prev => prev.filter(x => x._id !== id));
                    toast.success('Statement deleted');
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Admin FAB */}
      <button
        className="admin-toggle-btn"
        onClick={() => setShowAdmin(true)}
        title="Admin Panel"
        aria-label="Open admin panel"
        id="admin-fab"
      >
        ⚙
      </button>

      {/* Admin Panel */}
      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          adminKey={adminKey}
          setAdminKey={setAdminKey}
          statements={statements}
          onCreated={(s) => {
            setStatements(prev =>
              [...prev, s].sort((a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt))
            );
          }}
          onDeleted={(id) => setStatements(prev => prev.filter(x => x._id !== id))}
        />
      )}

      {/* Turnstile Modal */}
      {pendingVote && (
        <TurnstileModal
          action={pendingVote.type}
          onVerified={handleVoteVerified}
          onCancel={() => setPendingVote(null)}
        />
      )}
    </>
  );
}
