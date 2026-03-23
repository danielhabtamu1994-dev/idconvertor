import { useState, useEffect } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

export default function Users() {
  const [users,    setUsers]    = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [form,     setForm]     = useState({ phone:'', password:'', role:'user' });
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState('users');
  const [balanceModal, setBalanceModal] = useState(null);

  const load         = () => API.get('/auth/users').then(r=>setUsers(r.data)).catch(()=>{});
  const loadDeposits = () => API.get('/auth/deposit-requests').then(r=>setDeposits(r.data)).catch(()=>{});

  useEffect(()=>{ load(); loadDeposits(); },[]);

  const create = async e => {
    e.preventDefault(); setLoading(true);
    try {
      await API.post('/auth/register', form);
      toast.success('✅ Created!');
      setForm({phone:'',password:'',role:'user'});
      load();
    } catch(e){ toast.error(e.response?.data?.detail||'Failed'); }
    finally{ setLoading(false); }
  };

  const toggle = async phone => {
    try { const r=await API.patch(`/auth/users/${phone}/toggle`); toast.success(r.data.active?'✅ Enabled':'🔒 Disabled'); load(); }
    catch{ toast.error('Failed'); }
  };

  const del = async phone => {
    if(!window.confirm(`${phone} ይሰረዝ?`)) return;
    try { await API.delete(`/auth/users/${phone}`); toast.success('Deleted'); load(); }
    catch(e){ toast.error(e.response?.data?.detail||'Failed'); }
  };

  const saveBalance = async () => {
    try {
      await API.patch(`/auth/users/${balanceModal.phone}/balance`,{balance:parseInt(balanceModal.amount)||0});
      toast.success('✅ Balance updated'); setBalanceModal(null); load();
    } catch{ toast.error('Failed'); }
  };

  const approveDeposit = async key => {
    try { await API.patch(`/auth/deposit-requests/${key}/approve`); toast.success('✅ Approved!'); loadDeposits(); load(); }
    catch(e){ toast.error(e.response?.data?.detail||'Failed'); }
  };

  const rejectDeposit = async key => {
    try { await API.patch(`/auth/deposit-requests/${key}/reject`); toast.success('Rejected'); loadDeposits(); }
    catch{ toast.error('Failed'); }
  };

  const pendingCount = deposits.filter(([,d])=>d.status==='pending').length;

  return (
    <div>
      <h1 className="page-title">👥 Users</h1>

      <div className="flex-center gap-8" style={{marginBottom:16,flexWrap:'wrap'}}>
        {[
          {key:'users',   label:'👥 Users'},
          {key:'deposits',label:`💰 Deposits${pendingCount>0?` (${pendingCount})`:''}` },
          {key:'add',     label:'➕ Add User'},
        ].map(t=>(
          <button key={t.key} className={`btn btn-sm ${tab===t.key?'btn-primary':'btn-outline'}`} onClick={()=>setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Users table */}
      {tab==='users' && (
        <div className="card">
          <p className="card-title">All Users ({users.length})</p>
          <div style={{overflowX:'auto'}}>
            <table className="table">
              <thead><tr><th>ስልክ</th><th>Role</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.phone}>
                    <td><strong>{u.phone}</strong></td>
                    <td>
                      <span className="badge" style={{
                        background:u.role==='admin'?'#dbeafe':u.role==='agent'?'#fef9c3':'#dcfce7',
                        color:u.role==='admin'?'#1d4ed8':u.role==='agent'?'#854d0e':'#166534'}}>
                        {u.role==='admin'?'👑 Admin':u.role==='agent'?'🔗 Agent':'👤 User'}
                      </span>
                    </td>
                    <td>
                      <span style={{fontWeight:600,color:'var(--primary)'}}>{u.balance||0} ETB</span>
                      <button className="btn btn-outline btn-sm" style={{marginLeft:6,padding:'2px 7px'}}
                        onClick={()=>setBalanceModal({phone:u.phone,amount:u.balance||0})}>✏️</button>
                    </td>
                    <td><span className={`badge ${u.active?'badge-user':'badge-off'}`}>{u.active?'Active':'Disabled'}</span></td>
                    <td>
                      <div className="flex-center gap-8">
                        <button className="btn btn-outline btn-sm" onClick={()=>toggle(u.phone)}>{u.active?'🔒':'🔓'}</button>
                        <button className="btn btn-danger btn-sm"  onClick={()=>del(u.phone)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deposits */}
      {tab==='deposits' && (
        <div className="card">
          <p className="card-title">💰 Deposit Requests</p>
          {deposits.length===0 ? (
            <p className="text-muted text-sm" style={{textAlign:'center',padding:'20px 0'}}>ምንም request የለም</p>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table className="table">
                <thead><tr><th>ስልክ</th><th>መጠን</th><th>SMS</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {deposits.map(([key, d])=>(
                    <tr key={key}>
                      <td><strong>{d.phone}</strong></td>
                      <td><strong style={{color:'var(--primary)'}}>{d.amount} ETB</strong></td>
                      <td style={{maxWidth:200}}>
                        <div style={{fontSize:11,background:'var(--bg)',borderRadius:6,padding:'4px 8px',maxHeight:60,overflow:'auto',fontFamily:'monospace'}}>
                          {d.sms_text}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${d.status==='approved'?'badge-user':d.status==='rejected'?'badge-off':'badge-admin'}`}>
                          {d.status==='approved'?'✅ Approved':d.status==='rejected'?'❌ Rejected':'⏳ Pending'}
                        </span>
                      </td>
                      <td>
                        {d.status==='pending' && (
                          <div className="flex-center gap-8">
                            <button className="btn btn-success btn-sm" onClick={()=>approveDeposit(key)}>✅ Approve</button>
                            <button className="btn btn-danger btn-sm"  onClick={()=>rejectDeposit(key)}>❌ Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add user */}
      {tab==='add' && (
        <div className="card" style={{maxWidth:440}}>
          <p className="card-title">➕ Add User / Agent</p>
          <form onSubmit={create}>
            <div className="form-group">
              <label>ስልክ ቁጥር</label>
              <input className="form-input" placeholder="09xxxxxxxx"
                value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} required/>
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-input" type="password"
                value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} required/>
            </div>
            <div className="form-group">
              <label>Role</label>
              <select className="form-input" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                <option value="user">👤 User</option>
                <option value="agent">🔗 Agent</option>
                <option value="admin">👑 Admin</option>
              </select>
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading?'⏳...':'➕ Create'}
            </button>
          </form>
        </div>
      )}

      {/* Balance modal */}
      {balanceModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:12,padding:24,width:'100%',maxWidth:320}}>
            <p style={{fontWeight:700,marginBottom:14}}>💳 {balanceModal.phone}</p>
            <div className="form-group">
              <label>Balance (ETB)</label>
              <input className="form-input" type="number"
                value={balanceModal.amount}
                onChange={e=>setBalanceModal(p=>({...p,amount:e.target.value}))}/>
            </div>
            <div className="flex-center gap-8 mt-8">
              <button className="btn btn-primary" onClick={saveBalance}>✅ Save</button>
              <button className="btn btn-outline" onClick={()=>setBalanceModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
