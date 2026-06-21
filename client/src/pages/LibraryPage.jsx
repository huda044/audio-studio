import React, { useMemo, useState } from 'react';
import { Library, Copy, Search, Music2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, EmptyState } from '../components/ui.jsx';
import { formatDuration } from '../lib/format.js';

export default function LibraryPage() {
  const { history, notify } = useApp();
  const [q, setQ] = useState('');

  const assets = useMemo(() => {
    const out = [];
    for (const entry of history) {
      for (const part of entry.parts || []) {
        if (part.status === 'Accepted' && part.rbxassetid) {
          out.push({
            key: `${entry.id}-${part.part}`,
            title: (entry.parts || []).length > 1 ? `${entry.title} — Part ${part.part}` : entry.title,
            rbxassetid: part.rbxassetid,
            assetId: part.assetId,
            createdAt: entry.createdAt,
            duration: entry.duration
          });
        }
      }
    }
    return out;
  }, [history]);

  const filtered = assets.filter((a) => !q.trim() || a.title.toLowerCase().includes(q.trim().toLowerCase()) || String(a.assetId).includes(q.trim()));

  function copy(text) { navigator.clipboard?.writeText(text); notify('rbxassetid disalin.'); }

  if (!assets.length) {
    return <Card><EmptyState icon={<Library size={26} />} title="Library masih kosong">Asset yang berhasil diterima Roblox akan muncul di sini lengkap dengan rbxassetid-nya.</EmptyState></Card>;
  }

  return (
    <div>
      <Card>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-dim)' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Cari judul atau asset ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      <div className="list" style={{ marginTop: 16 }}>
        {filtered.map((a) => (
          <div className="list-item" key={a.key}>
            <span className="fc-ico" style={{ color: 'var(--accent)' }}><Music2 size={20} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="li-title">{a.title}</div>
              <div className="li-meta">{a.rbxassetid} · {formatDuration(a.duration)}</div>
            </div>
            <div className="li-actions">
              <button className="btn ghost sm" onClick={() => copy(a.rbxassetid)}><Copy size={14} /> Salin</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
