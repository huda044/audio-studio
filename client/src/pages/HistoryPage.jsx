import React, { useState } from 'react';
import { History, Trash2, RefreshCw, Copy, Search, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, EmptyState, StatusBadge } from '../components/ui.jsx';
import { assetStatus } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

export default function HistoryPage() {
  const { history, setHistory, roblox, notify } = useApp();
  const [q, setQ] = useState('');
  const [checking, setChecking] = useState('');

  const filtered = history.filter((h) => !q.trim() || String(h.title || '').toLowerCase().includes(q.trim().toLowerCase()));

  function copy(text) { navigator.clipboard?.writeText(text); notify('Disalin.'); }

  function removeEntry(id) { setHistory(history.filter((h) => h.id !== id)); }

  async function recheck(entry) {
    if (!roblox.apiKey) { notify('Isi API key dulu di Pengaturan.', 'error'); return; }
    const pending = (entry.parts || []).filter((p) => p.status === 'Pending' && p.operationId);
    if (!pending.length) { notify('Tidak ada part pending.', 'info'); return; }
    setChecking(entry.id);
    try {
      const updates = await Promise.all(pending.map(async (p) => {
        try { return { part: p.part, ...(await assetStatus({ operationId: p.operationId, apiKey: roblox.apiKey })) }; }
        catch { return null; }
      }));
      setHistory(history.map((h) => h.id !== entry.id ? h : {
        ...h,
        parts: h.parts.map((p) => {
          const u = updates.find((x) => x && x.part === p.part);
          return u ? { ...p, status: u.status, assetId: u.assetId || p.assetId, rbxassetid: u.rbxassetid || p.rbxassetid, error: u.error || p.error } : p;
        })
      }));
      notify('Status diperbarui.');
    } finally {
      setChecking('');
    }
  }

  if (!history.length) {
    return <Card><EmptyState icon={<History size={26} />} title="Belum ada riwayat">Hasil konversi yang kamu upload ke Roblox akan tampil di sini.</EmptyState></Card>;
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-dim)' }} />
            <input className="input" style={{ paddingLeft: 34 }} placeholder="Cari judul..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn ghost" onClick={() => { if (window.confirm('Hapus semua riwayat?')) setHistory([]); }}><Trash2 size={16} /> Bersihkan</button>
        </div>
      </Card>

      <div className="list" style={{ marginTop: 16 }}>
        {filtered.map((entry) => {
          const accepted = (entry.parts || []).filter((p) => p.status === 'Accepted').length;
          const total = (entry.parts || []).length;
          const hasPending = (entry.parts || []).some((p) => p.status === 'Pending');
          return (
            <Card key={entry.id} className="" >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="li-title">{entry.title}</div>
                  <div className="li-meta">
                    {new Date(entry.createdAt).toLocaleString('id-ID')} · {formatDuration(entry.duration)} · {accepted}/{total} diterima · {entry.mode || 'personal'}
                  </div>
                </div>
                <div className="li-actions">
                  {hasPending && <button className="btn ghost sm" disabled={checking === entry.id} onClick={() => recheck(entry)}>{checking === entry.id ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}</button>}
                  <button className="btn ghost sm" onClick={() => removeEntry(entry.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="list" style={{ marginTop: 12 }}>
                {(entry.parts || []).map((p) => (
                  <div className="trace-row" key={p.part} style={{ alignItems: 'center' }}>
                    <StatusBadge status={p.status} />
                    <span style={{ flex: 1, minWidth: 0 }} className="muted">{p.rbxassetid || p.error || 'Menunggu...'}</span>
                    {p.rbxassetid && <button className="btn ghost sm" onClick={() => copy(p.rbxassetid)}><Copy size={13} /></button>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
