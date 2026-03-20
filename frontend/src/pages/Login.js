import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import API from '../services/api';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm]   = useState({ username:'', password:'' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', form);
      login(data.token, data.role, data.username);
      toast.success(`Welcome, ${data.username}!`);
      nav('/convert');
    } catch(err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ width:360 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, background:'var(--primary)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:26 }}>🪪</div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Fayda ID Converter</h1>
          <p className="text-muted text-sm" style={{ marginTop:4 }}>Sign in to continue</p>
        </div>

        <div className="card" style={{ padding:28 }}>
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Username</label>
              <input className="form-input" placeholder="Enter username"
                value={form.username} onChange={e => setForm({...form, username:e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-input" type="password" placeholder="Enter password"
                value={form.password} onChange={e => setForm({...form, password:e.target.value})} required />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop:8 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
