import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import toast from 'react-hot-toast';

const NAV = {
  admin: [
    { path:'/convert',  icon:'🪪', label:'ID Convert' },
    { path:'/settings', icon:'⚙️', label:'Settings' },
    { path:'/users',    icon:'👥', label:'Users' },
    { path:'/deposit',  icon:'💰', label:'Deposit' },
  ],
  user: [
    { path:'/convert', icon:'🪪', label:'ID Convert' },
    { path:'/deposit', icon:'💰', label:'Deposit' },
  ],
  agent: [
    { path:'/agent', icon:'🔗', label:'Referral' },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const role     = user?.role || 'user';
  const navItems = NAV[role] || NAV.user;

  const doLogout = () => {
    logout(); toast.success('Signed out'); nav('/login');
  };

  const roleLabel = { admin:'👑 Admin', user:'👤 User', agent:'🔗 Agent' };

  return (
    <div className="app-layout">
      {open && <div className="sidebar-overlay" onClick={()=>setOpen(false)}/>}

      <aside className={`sidebar ${open?'sidebar-open':''}`}>
        <div className="sidebar-logo">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h2>🪪 Fayda ID</h2>
            <button className="close-sidebar" onClick={()=>setOpen(false)}>✕</button>
          </div>
          <p>Converter System</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item=>(
            <button key={item.path}
              className={`nav-item ${loc.pathname===item.path?'active':''}`}
              onClick={()=>{ nav(item.path); setOpen(false); }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <strong>{user?.phone}</strong>
            <p>{roleLabel[role]}</p>
          </div>
          <button className="nav-item" style={{marginTop:8,color:'rgba(255,255,255,.7)'}} onClick={doLogout}>
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="topbar">
          <button className="hamburger" onClick={()=>setOpen(o=>!o)}>
            <span/><span/><span/>
          </button>
          <span className="topbar-title">
            {role==='admin'?'👑 Admin Panel':role==='agent'?'🔗 Agent':' 🪪 ID Converter'}
          </span>
          <div className="topbar-right">
            {role==='user' && (
              <>
                <div className="balance-badge">💳 <strong>{user?.balance??0}</strong> ETB</div>
                <button className="btn btn-primary btn-sm" onClick={()=>nav('/deposit')}>➕ Deposit</button>
              </>
            )}
            {role==='admin' && (
              <div style={{display:'flex',gap:4}}>
                <button className="icon-btn" title="Users"    onClick={()=>nav('/users')}>👥</button>
                <button className="icon-btn" title="Deposit"  onClick={()=>nav('/deposit')}>💰</button>
                <button className="icon-btn" title="Settings" onClick={()=>nav('/settings')}>⚙️</button>
              </div>
            )}
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
