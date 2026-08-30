import React, { useRef, useState } from 'react';
import { KeyRound, ShieldCheck, Loader2, Users, User, Plus, Trash2, Eye, EyeOff, Info, ExternalLink, Save, CheckCircle2, Download, Upload } from 'lucide-react';
import { useApp } from '../App.jsx';
import { Card, Trace } from '../components/ui.jsx';
import { robloxTest } from '../lib/api.js';
import { cleanRobloxId, uid } from '../lib/utils.js';
import { normalizeSettings } from '../lib/utils.js';
import { defaultSettings } from '../lib/constants.js';

export default function SettingsPage() {
  const { roblox, setRoblox, groups, setGroups, notify, history, setHistory, customPresets, setCustomPresets, settings, setSettings } = useApp();
  const importInputRef = useRef(null);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [trace, setTrace] = useState([]);
  const [form, setForm] = useState({ name: '', groupId: '', creatorUserId: '' });
  // Draft key dipisah dari state tersimpan: key baru BARU aktif setelah tombol
  // "Simpan Key" ditekan. Sebelumnya setiap ketikan langsung tersimpan — sering
  // membuat user ragu apakah key sudah aman atau belum.
  const [keyDraft, setKeyDraft] = useState(roblox.apiKey);
  const savedKey = roblox.apiKey;
  const keyDirty = keyDraft.trim() !== savedKey;

  function saveKey() {
    const trimmed = keyDraft.trim();
    if (!trimmed) { notify('Tempel API key dulu sebelum menyimpan.', 'error'); return; }
    set({ apiKey: trimmed });
    setKeyDraft(trimmed);
    notify('API key tersimpan di browser ini.');
  }

  function removeKey() {
    set({ apiKey: '' });
    setKeyDraft('');
    notify('API key dihapus dari browser ini.', 'info');
  }

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
    ['audio-studio-roblox', 'audio-studio-groups', 'audio-studio-history', 'audio-studio-settings', 'audio-studio-custom-presets'].forEach((k) => localStorage.removeItem(k));
    notify('Data dibersihkan. Muat ulang halaman.', 'info');
  }

  // ============ Backup / restore data ke file JSON ============
  function exportData() {
    if (!window.confirm('File backup akan berisi API key Roblox (teks polos).\nSimpan file ini dengan aman — jangan dibagikan. Lanjutkan?')) return;
    try {
      const data = {
        app: 'lucivoid-audio-studio',
        version: 1,
        exportedAt: new Date().toISOString(),
        roblox,
        groups,
        history,
        customPresets,
        settings
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `lucivoid-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      notify('Backup JSON diunduh.');
    } catch (e) {
      notify(`Gagal membuat backup: ${e.message}`, 'error');
    }
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.app !== 'lucivoid-audio-studio') {
        notify('File bukan backup LuciVoid Audio Studio.', 'error');
        return;
      }
      if (!window.confirm('Timpa SEMUA data di browser ini dengan isi file backup?')) return;
      if (data.roblox && typeof data.roblox === 'object') setRoblox({ apiKey: '', mode: 'personal', userId: '', groupId: '', selectedGroupId: '', ...data.roblox });
      if (Array.isArray(data.groups)) setGroups(data.groups);
      if (Array.isArray(data.history)) setHistory(data.history);
      if (Array.isArray(data.customPresets)) setCustomPresets(data.customPresets);
      if (data.settings && typeof data.settings === 'object') setSettings(normalizeSettings({ ...defaultSettings, ...data.settings }));
      notify('Data dipulihkan. Halaman dimuat ulang…');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      notify(`Backup tidak valid: ${e.message}`, 'error');
    }
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
            <li>Buat nama untuk API key kamu (contoh: <b>&quot;LuciVoid Studio&quot;</b>).</li>
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
              value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoComplete="off"
            />
            <button className="btn ghost" onClick={() => setShowKey((v) => !v)} type="button">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>

        <div className="chips" style={{ marginBottom: 12 }}>
          {savedKey
            ? <span className="chip"><CheckCircle2 size={12} style={{ color: 'var(--good)', verticalAlign: '-2px' }} /> Tersimpan di browser · <b>••••{savedKey.slice(-4)}</b></span>
            : <span className="chip">Belum ada key tersimpan</span>}
          {keyDirty && keyDraft.trim() && <span className="chip"><b>Perubahan belum disimpan</b></span>}
        </div>

        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn primary" onClick={saveKey} disabled={!keyDirty || !keyDraft.trim()}>
            <Save size={16} /> Simpan Key
          </button>
          <button className="btn" onClick={removeKey} disabled={!savedKey}>
            <Trash2 size={16} /> Hapus Key
          </button>
        </div>

        <button className="btn block" onClick={testConnection} disabled={testing || !savedKey}>
          {testing ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
          {testing ? 'Mengecek...' : 'Test Koneksi (pakai key tersimpan)'}
        </button>
        {trace.length > 0 && <><div className="divider" /><Trace items={trace} /></>}
        <div className="divider" />
        <p className="small muted" style={{ margin: 0 }}>API key & data hanya tersimpan di perangkat ini.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn block" onClick={exportData}><Download size={16} /> Backup data</button>
          <button className="btn block" onClick={() => importInputRef.current?.click()}><Upload size={16} /> Impor data</button>
        </div>
        <input
          ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }}
        />
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
