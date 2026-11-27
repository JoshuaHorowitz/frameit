// Shared admin pieces for a game's list of questions (FrameIt) or prompts (FOMO).
import { useState } from 'react';

// Round setup: what's lined up for this round, with a dice button, a search
// over the list (tap one to use it), and "Use “…”" for something typed.
export function PromptPicker({ label, current, typed, items, onPick, onRandom, emptyText }) {
  const [text, setText] = useState('');
  const q = text.trim().toLowerCase();
  const matches = q ? items.filter((t) => t.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = items.find((t) => t.toLowerCase() === q);
  const use = (value) => {
    onPick(value);
    setText('');
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2 className="label">{label}</h2>
      <div className="list-row" style={{ padding: '12px 6px 12px 14px' }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 18, lineHeight: 1.35 }}>
          {current ?? emptyText}
          {current && typed && <span className="chip gold" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>Typed</span>}
        </span>
        <button className="icon-btn" aria-label={`Random ${label.toLowerCase()}`} onClick={onRandom}>🎲</button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) use(exact ?? text);
        }}
      >
        <input
          className="input"
          style={{ fontSize: 16, padding: '12px 14px' }}
          placeholder={`Search the list or type your own ${label.toLowerCase()}…`}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
      </form>
      {matches.map((t) => (
        <button key={t} className="list-row" style={{ border: 0, textAlign: 'left', minHeight: 44, padding: '10px 14px', lineHeight: 1.35 }} onClick={() => use(t)}>
          {t}
        </button>
      ))}
      {q && !exact && (
        <button className="btn secondary small" onClick={() => use(text)}>
          Use “{text.trim()}” for this round
        </button>
      )}
    </div>
  );
}

// Settings: the whole list with search, add, delete and restore.
// items: [{ text, custom }]. noun: 'question' | 'prompt'.
export function BankEditor({ noun, items, removedBuiltIns, onAdd, onRemove, onRestore }) {
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const shown = items.filter((q) => q.text.toLowerCase().includes(filter.trim().toLowerCase()));
  const added = items.filter((q) => q.custom).length;
  const plural = `${noun}s`;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onAdd(draft);
          setDraft('');
        }}
      >
        <input className="input" placeholder={`Add a ${noun}…`} value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" style={{ width: 'auto' }} type="submit">Add</button>
      </form>
      <div className="spread">
        <span className="small">
          {items.length} {plural} in the list{added ? ` (${added} added by you)` : ''}
        </span>
        <button className="btn secondary small" style={{ width: 'auto' }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'View & edit'}
        </button>
      </div>
      {open && (
        <div className="stack" style={{ gap: 6 }}>
          <input className="input" style={{ fontSize: 16, padding: '10px 14px' }} placeholder={`Search ${plural}…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {shown.map((q) => (
            <div key={q.text} className="list-row" style={{ alignItems: 'flex-start', padding: '10px 4px 10px 14px', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 15, lineHeight: 1.4 }}>
                {q.text}
                {q.custom && <span className="chip gold" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>Added</span>}
              </span>
              <button
                className="icon-btn"
                aria-label={`Delete ${noun}: ${q.text}`}
                onClick={() => (!q.custom || window.confirm(`Delete this ${noun}? ${plural[0].toUpperCase() + plural.slice(1)} you added can't be restored.`)) && onRemove(q.text)}
              >
                ✕
              </button>
            </div>
          ))}
          {shown.length === 0 && <p className="small">No {plural} match.</p>}
          {removedBuiltIns > 0 && (
            <button className="btn secondary small" onClick={onRestore}>
              Restore {removedBuiltIns} deleted built-in {removedBuiltIns === 1 ? noun : plural}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
