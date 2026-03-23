import { useState, useEffect } from 'react';
import API from '../services/api';

export default function Agent() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    API.get('/auth/agent/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) return <div style={{ padding:20 }}>⏳ Loading...</div>;

  const copyLink = () => {
    navigator.clipboard.writeText(stats.referral_link);
    alert('✅ Link ተኮፒሯል!');
  };

  return (
    <div>
      <h1 className="page-title">🔗 Agent Dashboard</h1>

      {/* Stats grid */}
      <div className="grid-2" style={{marginBottom:12}}>
        <div className="card" style={{textAlign:'center'}}>
          <p className="text-muted text-sm">ስልክ ቁጥር</p>
          <p style={{fontSize:18,fontWeight:700,marginTop:4}}>{stats.phone}</p>
        </div>
        <div className="card" style={{textAlign:'center'}}>
          <p className="text-muted text-sm">Referral Code</p>
          <p style={{fontSize:32,fontWeight:800,color:'var(--primary)',letterSpacing:4,marginTop:4}}>{stats.referral_code}</p>
        </div>
      </div>
      <div className="grid-2" style={{marginBottom:12}}>
        <div className="card" style={{textAlign:'center'}}>
          <p className="text-muted text-sm">የገቡ ሰዎች</p>
          <p style={{fontSize:32,fontWeight:800,color:'var(--primary)',marginTop:4}}>{stats.referral_count}</p>
        </div>
        <div className="card" style={{textAlign:'center'}}>
          <p className="text-muted text-sm">የተሰሩ IDs</p>
          <p style={{fontSize:32,fontWeight:800,color:'var(--primary)',marginTop:4}}>{stats.id_count}</p>
        </div>
      </div>
      <div className="card" style={{textAlign:'center',marginBottom:12}}>
        <p className="text-muted text-sm">ገቢ (1 ID = 5 ብር)</p>
        <p style={{fontSize:36,fontWeight:800,color:'#16a34a',marginTop:4}}>{stats.earnings} ብር</p>
      </div>

      {/* Referral link */}
      <div className="card">
        <p className="card-title">📎 Referral Link</p>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{flex:1,background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:8,padding:'10px 14px',fontSize:13,wordBreak:'break-all',fontFamily:'monospace'}}>
            {stats.referral_link}
          </div>
          <button className="btn btn-primary" onClick={copyLink}>📋 Copy</button>
        </div>
        <p className="text-sm text-muted mt-8">
          ይህን link ሌሎች ሰዎች ሲጠቀሙ sign up ሲያደርጉ ቁጥርህ ይጨምራል።
        </p>
      </div>
    </div>
  );
}
