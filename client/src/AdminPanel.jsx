import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Wallet
} from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID');
  } catch {
    return iso;
  }
}

function fmtMoney(value) {
  return `Rp${Number(value || 0).toLocaleString('id-ID')}`;
}

function badgeColor(status) {
  if (status === 'Accepted' || status === 'active') return 'ok';
  if (status === 'Rejected' || status === 'suspended' || status === 'banned' || status === 'Failed') return 'bad';
  return 'wait';
}

export default function AdminPanel({ apiBase, secret, token, onExit, notify }) {
  const headers = useMemo(() => {
    const value = { 'Content-Type': 'application/json' };
    if (secret) value['x-admin-secret'] = secret;
    else if (token) value.Authorization = `Bearer ${token}`;
    return value;
  }, [secret, token]);

  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [activeUser, setActiveUser] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState('');

  const call = useCallback(async (path, options = {}) => {
    const response = await fetch(`${apiBase}/api/admin${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request admin gagal.');
    return data;
  }, [apiBase, headers]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, usersData, paymentsData] = await Promise.all([
        call('/stats'),
        call(`/users?search=${encodeURIComponent(search)}&limit=200`),
        call(`/payments?status=${encodeURIComponent(paymentFilter)}&limit=200`)
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
      setUsersTotal(usersData.total || 0);
      setPayments(paymentsData.payments || []);
    } catch (error) {
      notify?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [call, search, paymentFilter, notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openUser(id) {
    try {
      const data = await call(`/users/${id}`);
      setActiveUser(data.user);
      setEditing({
        username: data.user.username,
        email: data.user.email,
        role: data.user.role,
        status: data.user.status,
        emailVerified: data.user.emailVerified,
        password: '',
        conversions: data.user.usage?.conversions || 0,
        subscriptionPlan: data.user.subscription?.plan || 'free',
        subscriptionExpiresAt: data.user.subscription?.expiresAt
          ? new Date(data.user.subscription.expiresAt).toISOString().slice(0, 16)
          : ''
      });
      setTab('user-detail');
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function saveUser() {
    if (!activeUser || !editing) return;
    try {
      const patch = {
        username: editing.username,
        email: editing.email,
        role: editing.role,
        status: editing.status,
        emailVerified: editing.emailVerified,
        usage: { conversions: Number(editing.conversions) || 0 },
        subscription: {
          plan: editing.subscriptionPlan,
          expiresAt: editing.subscriptionExpiresAt ? new Date(editing.subscriptionExpiresAt).toISOString() : null
        }
      };
      if (editing.password) patch.password = editing.password;
      const data = await call(`/users/${activeUser.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      setActiveUser(data.user);
      notify?.('User tersimpan.');
      refresh();
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function extendSub(days) {
    if (!activeUser) return;
    try {
      const data = await call(`/users/${activeUser.id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ days })
      });
      setActiveUser(data.user);
      notify?.(`Langganan +${days} hari.`);
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function resetUsage() {
    if (!activeUser) return;
    try {
      const data = await call(`/users/${activeUser.id}/reset-usage`, { method: 'POST' });
      setActiveUser(data.user);
      setEditing((current) => current ? { ...current, conversions: 0 } : current);
      notify?.('Counter konversi di-reset.');
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function deleteUser() {
    if (!activeUser) return;
    if (!confirm(`Hapus user ${activeUser.username}? Data tidak bisa dikembalikan.`)) return;
    try {
      await call(`/users/${activeUser.id}`, { method: 'DELETE' });
      notify?.('User dihapus.');
      setActiveUser(null);
      setTab('users');
      refresh();
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function promoteToAdmin(target) {
    try {
      const data = await call('/users/promote', { method: 'POST', body: JSON.stringify({ target }) });
      notify?.(`User ${data.user?.username || target} dijadikan admin.`);
      refresh();
      if (activeUser?.id === data.user?.id) setActiveUser(data.user);
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function confirmInvoice(id) {
    try {
      await call(`/payments/${id}/confirm`, { method: 'POST' });
      notify?.('Invoice diterima.');
      refresh();
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  async function rejectInvoice(id) {
    try {
      await call(`/payments/${id}/reject`, { method: 'POST' });
      notify?.('Invoice ditolak.');
      refresh();
    } catch (error) {
      notify?.(error.message, 'error');
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <Crown size={18} /> <span>CMS Admin</span>
        </div>
        <div className="admin-tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><ShieldCheck size={15} /> Overview</button>
          <button className={tab === 'users' || tab === 'user-detail' ? 'active' : ''} onClick={() => setTab('users')}><UserCog size={15} /> Users</button>
          <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}><Wallet size={15} /> Invoices</button>
        </div>
        <div className="admin-actions">
          <button className="secondary" onClick={refresh} disabled={loading}>{loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />} Refresh</button>
          <button className="icon-wide" onClick={onExit}><ArrowLeft size={15} /> Keluar</button>
        </div>
      </header>

      {tab === 'overview' && (
        <section className="admin-grid">
          <article className="stat-card"><span>Total User</span><b>{stats?.users?.total ?? '-'}</b><p>{stats?.users?.verified || 0} terverifikasi</p></article>
          <article className="stat-card"><span>User Paid</span><b>{stats?.users?.paid ?? '-'}</b><p>{stats?.users?.suspended || 0} suspended/banned</p></article>
          <article className="stat-card"><span>Total Konversi</span><b>{stats?.conversions ?? '-'}</b><p>seluruh user</p></article>
          <article className="stat-card"><span>Invoice Pending</span><b>{stats?.invoices?.pending ?? '-'}</b><p>{stats?.invoices?.accepted || 0} diterima</p></article>
          <article className="stat-card wide"><span>Pendapatan Tercatat</span><b>{fmtMoney(stats?.invoices?.revenue)}</b><p>akumulasi invoice diterima</p></article>
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-block">
          <div className="admin-toolbar">
            <div className="search-box">
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari username, email, atau ID" />
            </div>
            <div className="actions tight">
              <input
                placeholder="Promote: username / email / id"
                value={editing?.promoteTarget || ''}
                onChange={(e) => setEditing({ ...(editing || {}), promoteTarget: e.target.value })}
                style={{ background: '#020617', border: '1px solid #1f2937', color: '#e2e8f0', padding: '8px 10px', borderRadius: 10, minWidth: 240 }}
              />
              <button className="secondary" onClick={() => editing?.promoteTarget && promoteToAdmin(editing.promoteTarget)}><Crown size={14} /> Promote ke Admin</button>
            </div>
            <span className="muted">{usersTotal} total user</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Email</th><th>Plan</th><th>Status</th><th>Convert</th><th>Login</th><th>Daftar</th><th></th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><b>{user.username}</b><div className="muted small">{user.id}</div></td>
                    <td>{user.email}{user.emailVerified ? '' : ' (belum verif)'}</td>
                    <td><span className={`badge ${user.subscription?.plan === 'paid' ? 'ok' : 'wait'}`}>{user.subscription?.label || 'Free'}</span></td>
                    <td><span className={`badge ${badgeColor(user.status)}`}>{user.status}</span> {user.role === 'admin' ? <span className="badge ok">admin</span> : null}</td>
                    <td>{user.usage?.conversions || 0}</td>
                    <td>{fmtDate(user.lastLoginAt)}<div className="muted small">{user.loginCount || 0}x</div></td>
                    <td>{fmtDate(user.createdAt)}</td>
                    <td><button className="secondary" onClick={() => openUser(user.id)}>Detail</button></td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={8} className="muted">Tidak ada user.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'user-detail' && activeUser && editing && (
        <section className="admin-block">
          <button className="icon-wide" onClick={() => setTab('users')}><ArrowLeft size={15} /> Kembali</button>
          <div className="admin-detail">
            <div className="admin-card">
              <h3>Identitas</h3>
              <label className="field"><span>Username</span><input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></label>
              <label className="field"><span>Email</span><input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></label>
              <label className="field"><span>Password baru (opsional)</span><input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder="kosongkan kalau tidak diubah" /></label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="field"><span>Role</span>
                  <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="field"><span>Status</span>
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="banned">banned</option>
                  </select>
                </label>
                <label className="field"><span>Email Verified</span>
                  <select value={editing.emailVerified ? 'yes' : 'no'} onChange={(e) => setEditing({ ...editing, emailVerified: e.target.value === 'yes' })}>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="admin-card">
              <h3>Subscription & Usage</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="field"><span>Plan</span>
                  <select value={editing.subscriptionPlan} onChange={(e) => setEditing({ ...editing, subscriptionPlan: e.target.value })}>
                    <option value="free">free</option>
                    <option value="paid">paid</option>
                  </select>
                </label>
                <label className="field"><span>Aktif sampai</span><input type="datetime-local" value={editing.subscriptionExpiresAt} onChange={(e) => setEditing({ ...editing, subscriptionExpiresAt: e.target.value })} /></label>
              </div>
              <label className="field"><span>Counter Konversi</span><input type="number" min={0} value={editing.conversions} onChange={(e) => setEditing({ ...editing, conversions: e.target.value })} /></label>
              <div className="actions">
                <button className="secondary" onClick={() => extendSub(7)}>+7 Hari</button>
                <button className="secondary" onClick={() => extendSub(30)}>+30 Hari</button>
                <button className="secondary" onClick={resetUsage}>Reset Counter</button>
              </div>
            </div>

            <div className="admin-card">
              <h3>Aktivitas</h3>
              <p className="muted">Login terakhir: {fmtDate(activeUser.lastLoginAt)} | Total login: {activeUser.loginCount || 0}</p>
              <p className="muted">IP terakhir: {activeUser.lastLoginIp || '-'}</p>
              <p className="muted small">UA: {activeUser.lastLoginUa || '-'}</p>
              <div className="audit-log">
                {(activeUser.auditLog || []).slice(0, 30).map((entry) => (
                  <div key={entry.id}><b>{entry.event}</b><span>{fmtDate(entry.at)}</span></div>
                ))}
                {!activeUser.auditLog?.length && <p className="muted">Belum ada aktivitas.</p>}
              </div>
            </div>

            <div className="admin-card">
              <h3>Subscription History</h3>
              <div className="audit-log">
                {(activeUser.subscription?.history || []).map((entry, idx) => (
                  <div key={idx}><b>{entry.plan}</b><span>{entry.invoiceId || entry.source || 'manual'}</span><span>{fmtDate(entry.startedAt)} → {fmtDate(entry.expiresAt)}</span></div>
                ))}
                {!activeUser.subscription?.history?.length && <p className="muted">Belum ada history paid.</p>}
              </div>
            </div>

            <div className="admin-card span-2">
              <div className="actions">
                <button className="primary" onClick={saveUser}>Simpan Perubahan</button>
                <button className="icon-wide bad" onClick={deleteUser}><Trash2 size={15} /> Hapus User</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'invoices' && (
        <section className="admin-block">
          <div className="admin-toolbar">
            <div className="segmented compact">
              <button className={paymentFilter === '' ? 'active' : ''} onClick={() => setPaymentFilter('')}>Semua</button>
              <button className={paymentFilter === 'Pending' ? 'active' : ''} onClick={() => setPaymentFilter('Pending')}>Pending</button>
              <button className={paymentFilter === 'Accepted' ? 'active' : ''} onClick={() => setPaymentFilter('Accepted')}>Accepted</button>
              <button className={paymentFilter === 'Rejected' ? 'active' : ''} onClick={() => setPaymentFilter('Rejected')}>Rejected</button>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Invoice</th><th>User</th><th>Paket</th><th>Metode</th><th>Total</th><th>Status</th><th>Dibuat</th><th></th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td><code>{payment.id}</code></td>
                    <td>{payment.userId}</td>
                    <td>{payment.label}</td>
                    <td>{payment.method?.toUpperCase()}{payment.gateway ? ` (${payment.gateway})` : ''}</td>
                    <td>{fmtMoney(payment.amount)}</td>
                    <td><span className={`badge ${badgeColor(payment.status)}`}>{payment.status}</span></td>
                    <td>{fmtDate(payment.createdAt)}</td>
                    <td>
                      {payment.status === 'Pending' && (
                        <div className="actions tight">
                          <button className="secondary" onClick={() => confirmInvoice(payment.id)}>Terima</button>
                          <button className="icon-wide bad" onClick={() => rejectInvoice(payment.id)}>Tolak</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={8} className="muted">Belum ada invoice.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
