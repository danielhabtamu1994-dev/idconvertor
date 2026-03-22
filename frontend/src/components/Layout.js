import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import toast from 'react-hot-toast';

const NAV_USER = [
  { path:'/convert', icon:'🪪', label:'ID Convert' },
];
const NAV_ADMIN = [
  { path:'/convert',  icon:'🪪', label:'ID Convert' },
  { path:'/settings', icon:'⚙️', label:'Settings' },
  { path:'/users',    icon:'👥', label:'Users' },
  { path:'/deposit',  icon:'💰', label:'Deposit' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const navItems = user?.role === 'admin' ? NAV_ADMIN : NAV_USER;
  const isAdmin  = user?.role === 'admin';

  const doLogout = () => {
    logout();
    toast.success('Signed out');
    nav('/login');
  };

  return (
    <div className="app-layout">

      {/* Mobile overlay */}
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h2>🪪 Fayda ID</h2>
            <button className="close-sidebar" onClick={() => setOpen(false)}>✕</button>
          </div>
          <p>Converter System</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.path}
              className={`nav-item ${loc.pathname === item.path ? 'active':''}`}
              onClick={() => { nav(item.path); setOpen(false); }}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <strong>{user?.username}</strong>
            <p>{isAdmin ? '👑 Admin' : '👤 User'}</p>
          </div>
          <button className="nav-item" style={{ marginTop:8, color:'rgba(255,255,255,.7)' }} onClick={doLogout}>
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main wrapper */}
      <div className="main-wrapper">

        {/* Top Bar */}
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(o => !o)}>
            <span/><span/><span/>
          </button>

          <span className="topbar-title">
            {isAdmin ? '👑 Admin Panel' : '🪪 ID Converter'}
          </span>

          <div className="topbar-right">
            {!isAdmin && (
              <>
                <div className="balance-badge">
                  💳 <strong>{user?.balance ?? 0}</strong> ETB
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => nav('/deposit')}>
                  ➕ Deposit
                </button>
              </>
            )}
            {isAdmin && (
              <div style={{ display:'flex', gap:4 }}>
                <button className="icon-btn" onClick={() => nav('/users')}>👥</button>
                <button className="icon-btn" onClick={() => nav('/deposit')}>💰</button>
                <button className="icon-btn" onClick={() => nav('/settings')}>⚙️</button>
              </div>
            )}
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
