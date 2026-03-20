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
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const navItems = user?.role === 'admin' ? NAV_ADMIN : NAV_USER;

  const doLogout = () => {
    logout();
    toast.success('Signed out');
    nav('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>🪪 Fayda ID</h2>
          <p>Converter System</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.path}
              className={`nav-item ${loc.pathname === item.path ? 'active':''}`}
              onClick={() => nav(item.path)}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-badge">
            <strong>{user?.username}</strong>
            <p>{user?.role === 'admin' ? '👑 Admin' : '👤 User'}</p>
          </div>
          <button className="nav-item" style={{ marginTop:8, color:'rgba(255,255,255,.7)' }} onClick={doLogout}>
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
