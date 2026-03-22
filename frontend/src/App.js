import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './services/AuthContext';
import Layout   from './components/Layout';
import Login    from './pages/Login';
import Convert  from './pages/Convert';
import Settings from './pages/Settings';
import Users    from './pages/Users';
import Deposit  from './pages/Deposit';
import Agent    from './pages/Agent';
import './index.css';

function Private({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role==='agent'?'/agent':'/convert'} replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  const home = user ? (user.role==='agent'?'/agent':'/convert') : '/login';
  return (
    <Routes>
      <Route path="/login"    element={user?<Navigate to={home} replace/>:<Login/>}/>
      <Route path="/convert"  element={<Private roles={['user','admin']}><Convert/></Private>}/>
      <Route path="/deposit"  element={<Private><Deposit/></Private>}/>
      <Route path="/settings" element={<Private roles={['admin']}><Settings/></Private>}/>
      <Route path="/users"    element={<Private roles={['admin']}><Users/></Private>}/>
      <Route path="/agent"    element={<Private roles={['agent','admin']}><Agent/></Private>}/>
      <Route path="*"         element={<Navigate to={home} replace/>}/>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes/>
        <Toaster position="top-right" toastOptions={{duration:3000}}/>
      </BrowserRouter>
    </AuthProvider>
  );
}
