import React, { useEffect, useMemo, useRef, useState } from 'react';
import { History, Trash2, RefreshCw, Copy, Search, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, EmptyState, StatusBadge } from '../components/ui.jsx';
import { assetStatus } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';

function pendingParts(entry) {
  return (entry.parts || []).filter((p) => p.status === 'Pending' && p.operationId);
}

export default function HistoryPage() {
  const { history, setHistory, roblox, notify } = useApp();
  const [q, setQ] = useState('');
  const [checking, setChecking] = useState('');
  const autoBusyRef = useRef(false);
  // Waktu "sekarang" untuk hitung kadaluarsa — diambil via effect (bukan saat
  // render) supaya render tetap murni.
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setNowTs(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  // Memo: filter + toLowerCase di seluruh history cukup mahal untuk daftar panjang.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((h) => String(h.title || '').toLowerCase().includes(needle));
  }, [history, q]);

  const pendingEntryIds = useMemo(
    () => history.filter((h) => pendingParts(h).length > 0).map((h) => h.id),
    [history]
  );

  function copy(text) { navigator.clipboard?.writeText(text); notify('Disalin.'); }

  function removeEntry(id) { setHistory(history.filter((h) => h.id !== id)); }

  // Terapkan hasil pengecekan status ke state. Kembalikan ringkasan perubahan
  // supaya auto-polling bisa memberi notifikasi tanpa spam.
  function applyUpdates(updates) {
    let changed = 0;
    let accepted = 0;
    setHistory((prev) => prev.map((h) => {
      const relevant = updates.filter((u) => u.entryId === h.id);
      if (!relevant.length) return h;
      let touched = false;
      const parts = h.parts.map((p) => {
        const u = relevant.find((x) => x.update.part === p.part);
        if (!u || !u.update.status || u.update.status === p.status) return p;
        touched = true;
        changed += 1;
        if (u.update.status === 'Accepted') accepted += 1;
        return {
          ...p,
          status: u.update.status,
          assetId: u.update.assetId || p.assetId,
          rbxassetid: u.update.rbxassetid || p.rbxassetid,
          error: u.update.error || p.error
        };
      });
      return touched ? { ...h, parts } : h;
    }));
    return { changed, accepted };
  }

  async function fetchUpdatesFor(entries) {
    const results = await Promise.all(entries.flatMap((entry) => pendingParts(entry).map(async (p) => {
      try {
        const status = await assetStatus({ operationId: p.operationId, apiKey: roblox.apiKey });
        return { entryId: entry.id, update: { part: p.part, ...status } };
      } catch {
        return null; // satu part gagal dicek tidak boleh menggagalkan yang lain
      }
    })));
    return results.filter(Boolean);
  }

  async function recheck(entry) {
    if (!roblox.apiKey) { notify('Isi API key dulu di Pengaturan.', 'error'); return; }
    const pending = pendingParts(entry);
    if (!pending.length) { notify('Tidak ada part pending.', 'info'); return; }
    setChecking(entry.id);
    try {
      const updates = await fetchUpdatesFor([entry]);
      const { changed } = applyUpdates(updates);
      notify(changed ? 'Status diperbarui.' : 'Belum ada perubahan status.', changed ? 'success' : 'info');
    } finally {
      setChecking('');
    }
  }

  // Auto-refresh: selama ada part Pending (dan API key tersedia), cek moderasi
  // Roblox tiap 12 detik tanpa perlu klik manual. Berhenti sendiri saat kosong.
  useEffect(() => {
    if (!pendingEntryIds.length || !roblox.apiKey) return undefined;
    const id = setInterval(async () => {
      if (autoBusyRef.current) return;
      autoBusyRef.current = true;
      try {
        const entries = history.filter((h) => pendingEntryIds.includes(h.id));
        const updates = await fetchUpdatesFor(entries);
        const { accepted } = applyUpdates(updates);
        if (accepted) notify(`${accepted} asset diterima Roblox.`, 'success');
      } finally {
        autoBusyRef.current = false;
      }
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEntryIds.join(','), roblox.apiKey]);

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
        {pendingEntryIds.length > 0 && roblox.apiKey && (
          <p className="small muted" style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 className="spin" size={12} /> Memantau moderasi Roblox otomatis (tiap 12 detik) untuk {pendingEntryIds.length} lagu…
          </p>
        )}
      </Card>

      <div className="list" style={{ marginTop: 16 }}>
        {filtered.map((entry) => {
          const accepted = (entry.parts || []).filter((p) => p.status === 'Accepted').length;
          const total = (entry.parts || []).length;
          const hasPending = (entry.parts || []).some((p) => p.status === 'Pending');
          // File hasil di server hanya hidup 3 jam sejak konversi — beri tahu user.
          const fileExpired = nowTs > 0 && entry.createdAt && (nowTs - new Date(entry.createdAt).getTime()) > 3 * 60 * 60 * 1000;
          return (
            <Card key={entry.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="li-title" title={entry.title}>{entry.title}</div>
                  <div className="li-meta">
                    {new Date(entry.createdAt).toLocaleString('id-ID')} · {formatDuration(entry.duration)} · {accepted}/{total} diterima · {entry.mode || 'personal'}
                  </div>
                </div>
                <div className="li-actions">
                  {fileExpired && <span className="chip" title="File hasil konversi sudah dibersihkan server (3 jam). Konversi ulang bila butuh file-nya.">file kadaluarsa</span>}
                  {hasPending && <button className="btn ghost sm" disabled={checking === entry.id} onClick={() => recheck(entry)} title="Cek status sekarang">{checking === entry.id ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}</button>}
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
