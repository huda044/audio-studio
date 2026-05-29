import React, { useState } from 'react';
import {
  Music2,
  History,
  KeyRound,
  Users,
  CreditCard,
  Settings,
  Crown,
  ChevronRight,
  LogOut,
  Menu,
  X,
  User,
  ListMusic,
  Library,
  Receipt
} from 'lucide-react';

const NAV = [
  { section: 'PIPELINE', items: [
    { id: 'pipeline', label: 'Konversi Audio', icon: Music2 },
    { id: 'queue', label: 'YouTube Queue', icon: ListMusic },
    { id: 'history', label: 'Riwayat Upload', icon: History },
  ]},
  { section: 'ROBLOX', items: [
    { id: 'library', label: 'Asset Library', icon: Library },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'groups', label: 'Manajemen Grup', icon: Users },
  ]},
  { section: 'AKUN', items: [
    { id: 'billing', label: 'Langganan', icon: CreditCard },
    { id: 'invoice', label: 'Invoice', icon: Receipt },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ]}
];

export default function AppShell({
  activePage,
  onNavigate,
  currentUser,
  onOpenAdmin,
  onLogout,
  pageTitle,
  pageActions,
  children,
  invoicePending = 0,
  historyCount = 0,
  queueCount = 0,
  libraryCount = 0
}) {
  const isAdmin = currentUser?.role === 'admin';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
            <X size={18} />
          </button>
        )}
        <div className="sidebar-brand">
          <div className="sidebar-logo">L</div>
          <div>
            <p className="sidebar-brand-name">LuciVoid</p>
            <p className="sidebar-brand-tag">Audio Studio</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((group) => (
            <div className="sidebar-group" key={group.section}>
              <p className="sidebar-section">{group.section}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                let badge = null;
                if (item.id === 'history' && historyCount > 0) badge = historyCount;
                else if (item.id === 'billing' && invoicePending > 0) badge = invoicePending;
                else if (item.id === 'invoice' && invoicePending > 0) badge = invoicePending;
                else if (item.id === 'queue' && queueCount > 0) badge = queueCount;
                else if (item.id === 'library' && libraryCount > 0) badge = libraryCount;
                return (
                  <button
                    key={item.id}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                    type="button"
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {badge ? <span className="sidebar-badge">{badge}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}

          {isAdmin && (
            <div className="sidebar-group sidebar-admin-group">
              <p className="sidebar-section">ADMIN</p>
              <button className="sidebar-item admin" onClick={onOpenAdmin} type="button">
                <Crown size={16} />
                <span>Admin Panel</span>
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          {currentUser ? (
            <div className="sidebar-user">
              <div className="sidebar-avatar">{(currentUser.username || '?')[0]?.toUpperCase()}</div>
              <div className="sidebar-user-info">
                <p className="sidebar-user-name">{currentUser.username}</p>
                <p className="sidebar-user-plan">
                  {currentUser.role === 'admin' ? 'Admin' : (currentUser.subscription?.label || 'Free')}
                </p>
              </div>
              <button className="sidebar-logout" onClick={onLogout} title="Logout" type="button">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="sidebar-user guest">
              <User size={16} />
              <span>Belum login</span>
            </div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-title">
            <button className="sidebar-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Buka menu">
              <Menu size={18} />
            </button>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">{pageActions}</div>
        </header>
        <div className="app-content">{children}</div>
      </div>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}
