import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import API from '../services/api';
import toast from 'react-hot-toast';

export default function Login() {
  const [tab,     setTab]     = useState('login');
  const [form,    setForm]    = useState({ phone:'', password:'', confirm:'' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const refCode = params.get('ref') || '';
  const [manualRef, setManualRef] = useState('');

  const up = (k, v) => setForm(p => ({...p, [k]:v}));

  const doLogin = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', { phone: form.phone, password: form.password });
      login(data.token, data.role, data.phone, data.balance);
      toast.success(`Welcome! 👋`);
      nav(data.role === 'agent' ? '/agent' : '/convert');
    } catch(err) {
      toast.error(err.response?.data?.detail || 'Login failed');
    } finally { setLoading(false); }
  };

  const doSignup = async e => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Password አይስማሙም');
    if (form.password.length < 6) return toast.error('Password ቢያንስ 6 ፊደላት');
    setLoading(true);
    try {
      const { data } = await API.post('/auth/signup', {
        phone:         form.phone,
        password:      form.password,
        referral_code: refCode || manualRef,
      });
      login(data.token, data.role, data.phone, data.balance);
      toast.success('✅ ተመዝግበዋል!');
      nav('/convert');
    } catch(err) {
      toast.error(err.response?.data?.detail || 'Signup failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:16 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:56, height:56, background:'var(--primary)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:26 }}>🪪</div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Fayda ID Converter</h1>
          <p className="text-muted text-sm" style={{ marginTop:4 }}>
            {refCode ? `📎 Referral code: ${refCode}` : 'Sign in or create account'}
          </p>
        </div>

        {/* Tab */}
        <div style={{ display:'flex', background:'var(--border)', borderRadius:10, padding:3, marginBottom:20 }}>
          {['login','signup'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
                background: tab===t ? '#fff' : 'transparent',
                color: tab===t ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: tab===t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                transition:'all .15s' }}>
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding:24 }}>
          {tab === 'login' ? (
            <form onSubmit={doLogin}>
              <div className="form-group">
                <label>ስልክ ቁጥር</label>
                <input className="form-input" placeholder="09xxxxxxxx"
                  value={form.phone} onChange={e => up('phone', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="form-input" type="password" placeholder="••••••••"
                  value={form.password} onChange={e => up('password', e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop:8 }}>
                {loading ? '⏳...' : '🔐 Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={doSignup}>
              {refCode ? (
                <div style={{background:'var(--primary-lt)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--primary)'}}>
                  📎 Referral code: <strong>{refCode}</strong>
                </div>
              ) : (
                <div className="form-group">
                  <label>Referral Code (ካለ)</label>
                  <input className="form-input" placeholder="4 ዲጂት ኮድ (ካለ)"
                    value={manualRef} onChange={e=>setManualRef(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4}/>
                </div>
              )}
              <div className="form-group">
                <label>ስልክ ቁጥር</label>
                <input className="form-input" placeholder="09xxxxxxxx"
                  value={form.phone} onChange={e => up('phone', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="form-input" type="password" placeholder="ቢያንስ 6 ፊደላት"
                  value={form.password} onChange={e => up('password', e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password አረጋግጥ</label>
                <input className="form-input" type="password" placeholder="ዳግም ይጻፉ"
                  value={form.confirm} onChange={e => up('confirm', e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop:8 }}>
                {loading ? '⏳...' : '✅ Sign Up'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
