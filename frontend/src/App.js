import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './services/AuthContext';
import Layout   from './components/Layout';
import Login    from './pages/Login';
import Convert  from './pages/Convert';
import Settings from './pages/Settings';
import Users    from './pages/Users';
import Deposit  from './pages/Deposit';
import './index.css';

function PrivateRoute({ children, adminOnly }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/convert" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login"    element={user ? <Navigate to="/convert" replace /> : <Login />} />
      <Route path="/convert"  element={<PrivateRoute><Convert /></PrivateRoute>} />
      <Route path="/deposit"  element={<PrivateRoute><Deposit /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute adminOnly><Settings /></PrivateRoute>} />
      <Route path="/users"    element={<PrivateRoute adminOnly><Users /></PrivateRoute>} />
      <Route path="*"         element={<Navigate to={user ? "/convert" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration:3000 }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
