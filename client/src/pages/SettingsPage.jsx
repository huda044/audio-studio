import React, { useState } from 'react';
import { KeyRound, ShieldCheck, Loader2, Users, User, Plus, Trash2, Eye, EyeOff, Info, ExternalLink } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Trace } from '../components/ui.jsx';
import { robloxTest } from '../lib/api.js';
import { cleanRobloxId, uid } from '../lib/utils.js';

export default function SettingsPage() {
  const { roblox, setRoblox, groups, setGroups, notify } = useApp();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [trace, setTrace] = useState([]);
  const [form, setForm] = useState({ name: '', groupId: '', creatorUserId: '' });

  function set(patch) { setRoblox((r) => ({ ...r, ...patch })); }

  async function testConnection() {
    if (!roblox.apiKey) { notify('Isi API key dulu.', 'error'); return; }
    const creator = roblox.mode === 'group'
      ? { groupId: cleanRobloxId(roblox.selectedGroupId || roblox.groupId) }
      : { userId: cleanRobloxId(roblox.userId) };
    setTesting(true);
    setTrace([]);
    try {
      const data = await robloxTest({ apiKey: roblox.apiKey, creator });
      setTrace(data.trace || []);
      notify(data.ok ? 'Koneksi Roblox valid.' : (data.error || 'Koneksi gagal.'), data.ok ? 'success' : 'error');
    } catch (e) {
      notify(e.message || 'Test koneksi gagal.', 'error');
    } finally {
      setTesting(false);
    }
  }

  function addGroup() {
    const groupId = cleanRobloxId(form.groupId);
    if (!groupId) { notify('Group ID harus angka.', 'error'); return; }
    if (groups.some((g) => g.groupId === groupId)) { notify('Group sudah ada.', 'error'); return; }
    const next = [...groups, { id: uid('g'), name: form.name.trim() || `Grup ${groupId}`, groupId, creatorUserId: cleanRobloxId(form.creatorUserId) }];
    setGroups(next);
    set({ selectedGroupId: groupId, mode: 'group' });
    setForm({ name: '', groupId: '', creatorUserId: '' });
    notify('Komunitas/grup tersimpan.');
  }

  function removeGroup(id, groupId) {
    setGroups(groups.filter((g) => g.id !== id));
    if (roblox.selectedGroupId === groupId) set({ selectedGroupId: '' });
    notify('Grup dihapus.');
  }

  function clearAll() {
    if (!window.confirm('Hapus semua data tersimpan di browser ini (API key, grup, riwayat)?')) return;
    ['audio-studio-roblox', 'audio-studio-groups', 'audio-studio-history', 'audio-studio-settings'].forEach((k) => localStorage.removeItem(k));
    notify('Data dibersihkan. Muat ulang halaman.', 'info');
  }

  return (
    <div className="grid-3 settings-grid">
      <Card icon={<KeyRound size={18} />} title="Roblox Open Cloud API Key" desc="Tersimpan di browser ini (disamarkan), dikirim ke server hanya saat upload — tidak disimpan di server.">
        <a className="guide-link" href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noopener noreferrer">
          Buat API Key di Roblox Creator Hub <ExternalLink size={14} />
        </a>

        <div className="guide-box">
          <div className="guide-head"><Info size={16} /> Cara Mendapatkan API Key</div>
          <ol className="guide-steps">
            <li>Tekan tombol <b>&quot;Create API Key&quot;</b> di Roblox Creator Hub.</li>
            <li>Buat nama untuk API key kamu (contoh: <b>&quot;CENZ STUDIO&quot;</b>).</li>
            <li>Beri permission <b>read</b> dan <b>write</b> (<b>Assets:Read</b> dan <b>Assets:Write</b>) supaya deteksi moderasi aktif.</li>
            <li>Klik tombol <b>&quot;Save &amp; Generate Key&quot;</b>.</li>
            <li>Salin API key yang dihasilkan (kamu <b>tidak akan bisa melihatnya lagi</b> setelah ini).</li>
            <li>Tempel API key ke form di bawah lalu klik <b>&quot;Test Koneksi&quot;</b> / simpan.</li>
          </ol>
        </div>

        <label className="field">
          <span>API Key</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input" type={showKey ? 'text' : 'password'} placeholder="masukkan API key Roblox"
              value={roblox.apiKey} onChange={(e) => set({ apiKey: e.target.value })} autoComplete="off"
            />
            <button className="btn ghost" onClick={() => setShowKey((v) => !v)} type="button">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>
        <button className="btn block" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
          {testing ? 'Mengecek...' : 'Test Koneksi'}
        </button>
        {trace.length > 0 && <><div className="divider" /><Trace items={trace} /></>}
        <div className="divider" />
        <p className="small muted" style={{ margin: 0 }}>API key & data hanya tersimpan di perangkat ini.</p>
        <button className="btn ghost block" style={{ marginTop: 10 }} onClick={clearAll}><Trash2 size={16} /> Hapus semua data</button>
      </Card>

      <Card icon={<User size={18} />} title="Target Creator" desc="Pilih upload sebagai akun pribadi atau atas nama grup.">
        <div className="toggle-grid" style={{ marginBottom: 14 }}>
          <button type="button" className={`preset ${roblox.mode === 'personal' ? 'active' : ''}`} onClick={() => set({ mode: 'personal' })}>
            <b><User size={14} /> Personal</b><small>Upload ke akun Roblox kamu sendiri.</small>
          </button>
          <button type="button" className={`preset ${roblox.mode === 'group' ? 'active' : ''}`} onClick={() => set({ mode: 'group' })}>
            <b><Users size={14} /> Group</b><small>Upload atas nama grup/komunitas.</small>
          </button>
        </div>
        {roblox.mode === 'personal' ? (
          <label className="field">
            <span>Roblox User ID</span>
            <input className="input" placeholder="cth: 123456789" value={roblox.userId} onChange={(e) => set({ userId: e.target.value })} />
          </label>
        ) : (
          <label className="field">
            <span>Pilih Grup tersimpan</span>
            <select className="select" value={roblox.selectedGroupId} onChange={(e) => set({ selectedGroupId: e.target.value })}>
              <option value="">— pilih grup —</option>
              {groups.map((g) => <option key={g.id} value={g.groupId}>{g.name} ({g.groupId})</option>)}
            </select>
          </label>
        )}
      </Card>

      <Card icon={<Users size={18} />} title="Komunitas / Grup Roblox" desc="Simpan beberapa grup biar tidak isi ulang.">
        <div className="row">
          <label className="field"><span>Nama grup</span><input className="input" placeholder="Nama komunitas" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Group ID</span><input className="input" placeholder="cth: 987654" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} /></label>
        </div>
        <label className="field"><span>Creator User ID (opsional)</span><input className="input" placeholder="ID pemilik/creator" value={form.creatorUserId} onChange={(e) => setForm({ ...form, creatorUserId: e.target.value })} /></label>
        <button className="btn block" onClick={addGroup}><Plus size={16} /> Tambah Grup</button>

        {groups.length > 0 && (
          <div className="list" style={{ marginTop: 16 }}>
            {groups.map((g) => (
              <div className="list-item" key={g.id}>
                <div>
                  <div className="li-title">{g.name}</div>
                  <div className="li-meta">Group {g.groupId}{g.creatorUserId ? ` · creator ${g.creatorUserId}` : ''}</div>
                </div>
                <div className="li-actions">
                  {roblox.selectedGroupId === g.groupId && <span className="badge ok">aktif</span>}
                  <button className="btn ghost sm" onClick={() => removeGroup(g.id, g.groupId)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
