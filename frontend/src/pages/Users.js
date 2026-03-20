import { useState, useEffect } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

export default function Users() {
  const [users,   setUsers]   = useState([]);
  const [form,    setForm]    = useState({ username:'', password:'', role:'user' });
  const [loading, setLoading] = useState(false);

  const load = () => API.get('/auth/users').then(r => setUsers(r.data)).catch(()=>{});
  useEffect(() => { load(); }, []);

  const create = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post('/auth/register', form);
      toast.success('User created!');
      setForm({ username:'', password:'', role:'user' });
      load();
    } catch(e) { toast.error(e.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  const toggle = async username => {
    try {
      const r = await API.patch(`/auth/users/${username}/toggle`);
      toast.success(r.data.active ? 'Enabled' : 'Disabled');
      load();
    } catch(e) { toast.error('Failed'); }
  };

  const del = async username => {
    if (!window.confirm(`Delete "${username}"?`)) return;
    try {
      await API.delete(`/auth/users/${username}`);
      toast.success('Deleted');
      load();
    } catch(e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  return (
    <div>
      <h1 className="page-title">👥 Users</h1>

      {/* Create form */}
      <div className="card">
        <p className="card-title">➕ Add User</p>
        <form onSubmit={create}>
          <div className="grid-3">
            <div className="form-group">
              <label>Username</label>
              <input className="form-input" value={form.username}
                onChange={e=>setForm(p=>({...p,username:e.target.value}))} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e=>setForm(p=>({...p,password:e.target.value}))} required />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select className="form-input" value={form.role}
                onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
            {loading ? '⏳...' : '➕ Create User'}
          </button>
        </form>
      </div>

      {/* Users table */}
      <div className="card">
        <p className="card-title">All Users ({users.length})</p>
        <table className="table">
          <thead>
            <tr>
              <th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username}>
                <td><strong>{u.username}</strong></td>
                <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                <td><span className={`badge ${u.active?'badge-user':'badge-off'}`}>{u.active?'Active':'Disabled'}</span></td>
                <td className="text-muted">{u.created ? new Date(u.created).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="flex-center gap-8">
                    <button className="btn btn-outline btn-sm" onClick={()=>toggle(u.username)}>
                      {u.active ? '🔒 Disable' : '🔓 Enable'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={()=>del(u.username)}>
                      🗑️ Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
