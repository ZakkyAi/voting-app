import { useState, useEffect, useCallback } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { getStatements, getMyVotes, castVote, createStatement, deleteStatement } from './api';
import './index.css';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

function timeAgo(date) {
  if (!date) return '';
  const ts = date._seconds ? date._seconds * 1000 : new Date(date).getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── StatementCard ─────────────────────────────────────────────────────────
function StatementCard({ statement, rank, userVote, onVote, isAdmin, onDelete }) {
  const [busy, setBusy] = useState(false);

  const handleVote = async (type) => {
    if (busy) return;
    setBusy(true);
    await onVote(statement.id, type);
    setBusy(false);
  };

  const voteClass = statement.votes > 0 ? 'positive' : statement.votes < 0 ? 'negative' : '';

  return (
    <article className="card">
      <div className="card-rank">#{rank}</div>
      <div className="card-body">
        <p className="card-text">{statement.text}</p>
        <span className="card-time">{timeAgo(statement.createdAt)}</span>
      </div>
      <div className="card-actions">
        <button
          className={`vote-btn up${userVote === 'up' ? ' active' : ''}`}
          onClick={() => handleVote('up')}
          disabled={busy}
          aria-label="Upvote"
        >▲</button>
        <span className={`vote-num ${voteClass}`}>
          {statement.votes > 0 ? '+' : ''}{statement.votes}
        </span>
        <button
          className={`vote-btn down${userVote === 'down' ? ' active' : ''}`}
          onClick={() => handleVote('down')}
          disabled={busy}
          aria-label="Downvote"
        >▼</button>
        {isAdmin && (
          <button
            className="del-btn"
            onClick={() => window.confirm('Delete?') && onDelete(statement.id)}
          >✕</button>
        )}
      </div>
    </article>
  );
}

// ─── TurnstileModal ────────────────────────────────────────────────────────
function TurnstileModal({ onVerified, onCancel }) {
  const [token, setToken] = useState(null);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <p className="modal-title">Verify you're human</p>
        <p className="modal-sub">Complete the check below to cast your vote.</p>
        <div className="turnstile-wrap">
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={setToken}
            options={{ theme: 'light', size: 'normal' }}
          />
        </div>
        <div className="modal-btns">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={!token} onClick={() => onVerified(token)}>
            Submit Vote
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AdminPanel ────────────────────────────────────────────────────────────
function AdminPanel({ onClose, statements, onCreated, onDeleted }) {
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [adminKey, setAdminKey] = useState('');
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
    } catch (err) {
      if (err.response?.status === 403) setAuthed(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <p className="modal-title">Admin Panel</p>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {!authed ? (
          <form onSubmit={handleLogin} className="form">
            <input
              type="password"
              className="input"
              placeholder="Admin key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary">Unlock</button>
          </form>
        ) : (
          <>
            <form onSubmit={handleCreate} className="form">
              <textarea
                className="input"
                placeholder="New statement…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                required
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btn-primary" disabled={loading || !text.trim()}>
                {loading ? 'Adding…' : '+ Add Statement'}
              </button>
            </form>

            <div className="admin-list">
              {statements.map(s => (
                <div key={s.id} className="admin-item">
                  <span className="admin-item-text">{s.text}</span>
                  <button className="del-btn" onClick={() => handleDelete(s.id)}>✕</button>
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
  const [myVotes, setMyVotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pendingVote, setPendingVote] = useState(null);
  const [msg, setMsg] = useState('');

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  const loadData = useCallback(async () => {
    try {
      const [stmtsRes, votesRes] = await Promise.all([getStatements(), getMyVotes()]);
      setStatements(stmtsRes.data);
      setMyVotes(votesRes.data);
    } catch {
      showMsg('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleVoteRequest = (statementId, type) => {
    setPendingVote({ id: statementId, type });
  };

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
        [...prev.map(s => s.id === updated.id ? updated : s)]
          .sort((a, b) => b.votes - a.votes)
      );
      setMyVotes(prev => ({ ...prev, [id]: userVote }));
      if (action === 'retracted') showMsg('Vote removed');
      else if (action === 'changed') showMsg(type === 'up' ? 'Changed to upvote' : 'Changed to downvote');
      else showMsg(type === 'up' ? 'Upvoted!' : 'Downvoted!');
    } catch (err) {
      showMsg(err.response?.data?.error || 'Vote failed');
    }
  };

  return (
    <>
      <main className="container">
        <header className="header">
          <h1>Community Votes</h1>
          <p>Vote anonymously. No account needed.</p>
        </header>

        {msg && <div className="toast">{msg}</div>}

        {loading ? (
          <p className="loading">Loading…</p>
        ) : statements.length === 0 ? (
          <p className="empty">No statements yet.</p>
        ) : (
          <div className="list">
            {statements.map((s, i) => (
              <StatementCard
                key={s.id}
                statement={s}
                rank={i + 1}
                userVote={myVotes[s.id]}
                onVote={handleVoteRequest}
                isAdmin={showAdmin}
                onDelete={(id) => {
                  setStatements(prev => prev.filter(x => x.id !== id));
                }}
              />
            ))}
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setShowAdmin(true)} aria-label="Admin" id="admin-fab">⚙</button>

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          statements={statements}
          onCreated={(s) => setStatements(prev => [s, ...prev])}
          onDeleted={(id) => setStatements(prev => prev.filter(x => x.id !== id))}
        />
      )}

      {pendingVote && (
        <TurnstileModal
          onVerified={handleVoteVerified}
          onCancel={() => setPendingVote(null)}
        />
      )}
    </>
  );
}
