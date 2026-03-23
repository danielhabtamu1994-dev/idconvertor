import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../services/AuthContext';
import toast from 'react-hot-toast';

export default function Deposit() {
  const { user } = useAuth();
  const [amount,   setAmount]   = useState('');
  const [smsText,  setSmsText]  = useState('');
  const [settings, setSettings] = useState({ telebirr_phone:'', account_name:'' });
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    API.get('/auth/deposit-settings').then(({data})=>setSettings(data)).catch(()=>{});
  }, []);

  const submit = async () => {
    if (!amount || parseInt(amount) < 10) return toast.error('ቢያንስ 10 ETB ያስገቡ');
    if (!smsText.trim()) return toast.error('SMS text ያስገቡ');
    setLoading(true);
    try {
      await API.post('/auth/deposit-request', {
        amount:   parseInt(amount),
        sms_text: smsText,
        phone:    user?.phone,
      });
      toast.success('✅ Request ተላከ — Admin ያረጋግጣል');
      setDone(true);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  if (done) return (
    <div>
      <h1 className="page-title">💰 Deposit</h1>
      <div className="card" style={{textAlign:'center',padding:'32px 20px',maxWidth:440}}>
        <div style={{fontSize:48}}>✅</div>
        <p style={{fontWeight:700,fontSize:16,marginTop:12}}>Request ተላከ!</p>
        <p className="text-muted text-sm" style={{marginTop:8}}>Admin ካረጋገጠ በኋላ balance ይጨምርልዎታል።</p>
        <button className="btn btn-outline mt-8" onClick={()=>{setDone(false);setAmount('');setSmsText('');}}>← ወደ ኋላ</button>
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="page-title">💰 Deposit</h1>
      <div className="card" style={{maxWidth:440}}>

        {/* Account info */}
        {settings.account_name && (
          <div style={{marginBottom:16}}>
            <p style={{fontSize:11,color:'var(--text-muted)',marginBottom:2}}>👤 አካውንት ስም</p>
            <p style={{fontSize:18,fontWeight:700}}>{settings.account_name}</p>
          </div>
        )}
        {settings.telebirr_phone && (
          <div style={{background:'var(--primary-lt)',borderRadius:10,padding:14,marginBottom:20}}>
            <p style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>📱 Telebirr ቁጥር</p>
            <p style={{fontSize:28,fontWeight:800,color:'var(--primary)',letterSpacing:2}}>{settings.telebirr_phone}</p>
          </div>
        )}

        {/* Amount */}
        <div className="form-group">
          <label>የብር መጠን (ETB)</label>
          <input className="form-input" type="number" min={10} placeholder="ለምሳሌ 100"
            value={amount} onChange={e=>setAmount(e.target.value)}/>
        </div>

        {/* SMS */}
        <div className="form-group">
          <label>Telebirr SMS Text</label>
          <textarea className="form-input" rows={5}
            placeholder="ከ Telebirr SMS ያለውን ጽሁፍ ይቅዱ እዚህ ያስቀምጡ..."
            value={smsText} onChange={e=>setSmsText(e.target.value)}
            style={{resize:'vertical'}}/>
        </div>

        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? '⏳...' : '📤 Deposit'}
        </button>
      </div>
    </div>
  );
}
