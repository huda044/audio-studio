import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const sidebarVariants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { x: '-100%', opacity: 0, transition: { duration: 0.2 } },
};

const navContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};

const navItemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

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
      {/* Desktop sidebar */}
      <aside className="app-sidebar">
        <SidebarContent
          activePage={activePage}
          onNavigate={onNavigate}
          currentUser={currentUser}
          onOpenAdmin={onOpenAdmin}
          onLogout={onLogout}
          isAdmin={isAdmin}
          invoicePending={invoicePending}
          historyCount={historyCount}
          queueCount={queueCount}
          libraryCount={libraryCount}
        />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="app-sidebar mobile"
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
                <X size={18} />
              </button>
              <SidebarContent
                activePage={activePage}
                onNavigate={(id) => { onNavigate(id); setMobileOpen(false); }}
                currentUser={currentUser}
                onOpenAdmin={onOpenAdmin}
                onLogout={onLogout}
                isAdmin={isAdmin}
                invoicePending={invoicePending}
                historyCount={historyCount}
                queueCount={queueCount}
                libraryCount={libraryCount}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
    </div>
  );
}

function SidebarContent({
  activePage,
  onNavigate,
  currentUser,
  onOpenAdmin,
  onLogout,
  isAdmin,
  invoicePending,
  historyCount,
  queueCount,
  libraryCount
}) {
  return (
    <>
      <div className="sidebar-brand">
        <motion.div
          className="sidebar-logo"
          whileHover={{ rotate: 8, scale: 1.1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          L
        </motion.div>
        <div>
          <p className="sidebar-brand-name">LuciVoid</p>
          <p className="sidebar-brand-tag">Audio Studio</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div className="sidebar-group" key={group.section}>
            <p className="sidebar-section">{group.section}</p>
            <motion.div variants={navContainerVariants} initial="hidden" animate="show">
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
                  <motion.button
                    key={item.id}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                    type="button"
                    variants={navItemVariants}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {isActive && (
                      <motion.div
                        className="sidebar-active-bar"
                        layoutId="sidebar-active"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {badge ? <span className="sidebar-badge">{badge}</span> : null}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        ))}

        {isAdmin && (
          <div className="sidebar-group sidebar-admin-group">
            <p className="sidebar-section">ADMIN</p>
            <motion.button
              className="sidebar-item admin"
              onClick={onOpenAdmin}
              type="button"
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.97 }}
            >
              <Crown size={16} />
              <span>CMS Admin</span>
            </motion.button>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        {currentUser ? (
          <motion.div
            className="sidebar-user"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              className="sidebar-avatar"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              {(currentUser.username || '?')[0]?.toUpperCase()}
            </motion.div>
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{currentUser.username}</p>
              <p className="sidebar-user-plan">
                {currentUser.role === 'admin' ? 'Admin' : (currentUser.subscription?.label || 'Free')}
              </p>
            </div>
            <motion.button
              className="sidebar-logout"
              onClick={onLogout}
              title="Logout"
              type="button"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <LogOut size={14} />
            </motion.button>
          </motion.div>
        ) : (
          <div className="sidebar-user guest">
            <User size={16} />
            <span>Belum login</span>
          </div>
        )}
      </div>
    </>
  );
}
