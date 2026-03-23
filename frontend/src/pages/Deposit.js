import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../services/AuthContext';
import toast from 'react-hot-toast';

export default function Deposit() {
  const { user } = useAuth();
  const [amount,   setAmount]   = useState('');
  const [smsText,  setSmsText]  = useState('');
  const [step,     setStep]     = useState(1);
  const [settings, setSettings] = useState({ telebirr_phone:'', account_name:'' });
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    API.get('/auth/deposit-settings').then(({data})=>setSettings(data)).catch(()=>{});
  }, []);

  const handleRequest = async () => {
    if (!amount || parseInt(amount)<10) return toast.error('ቢያንስ 10 ETB ያስገቡ');
    setStep(2);
  };

  const submitDeposit = async () => {
    if (!smsText.trim()) return toast.error('SMS text ያስገቡ');
    setLoading(true);
    try {
      await API.post('/auth/deposit-request', {
        amount: parseInt(amount),
        sms_text: smsText,
        phone: user?.phone,
      });
      toast.success('✅ Request ተላከ — Admin ያረጋግጣል');
      setStep(3);
    } catch { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h1 className="page-title">💰 Deposit</h1>

      <div className="card" style={{maxWidth:440}}>

        {step === 1 && (
          <>
            <p className="card-title">Telebirr ክፍያ</p>
            {settings.telebirr_phone && (
              <div style={{background:'var(--primary-lt)',borderRadius:8,padding:14,marginBottom:16}}>
                <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>ወደዚህ ቁጥር ይላኩ፦</p>
                <p style={{fontSize:24,fontWeight:800,color:'var(--primary)'}}>{settings.telebirr_phone}</p>
                {settings.account_name && (
                  <p style={{fontSize:13,marginTop:4}}>👤 <strong>{settings.account_name}</strong></p>
                )}
              </div>
            )}
            <div className="form-group">
              <label>የሚያስገቡት መጠን (ETB)</label>
              <input className="form-input" type="number" min={10} placeholder="ለምሳሌ 100"
                value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleRequest}>ቀጥል →</button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="card-title">SMS Text ያስቅርቡ</p>
            <div style={{background:'#f0fdf4',borderRadius:8,padding:12,marginBottom:14,fontSize:13}}>
              <p>💳 <strong>{amount} ETB</strong> → <strong>{settings.telebirr_phone}</strong></p>
            </div>
            <div className="form-group">
              <label>Telebirr SMS Text</label>
              <textarea className="form-input" rows={5}
                placeholder="ከ Telebirr SMS ያለውን ጽሁፍ ይቅዱ እዚህ ያስቀምጡ..."
                value={smsText} onChange={e=>setSmsText(e.target.value)}
                style={{resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-outline" onClick={()=>setStep(1)}>← ተመለስ</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={submitDeposit} disabled={loading}>
                {loading?'⏳...':'📤 Request ላክ'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{textAlign:'center',padding:'20px 0'}}>
            <div style={{fontSize:48}}>✅</div>
            <p style={{fontWeight:700,fontSize:16,marginTop:12}}>Request ተላከ!</p>
            <p className="text-muted text-sm" style={{marginTop:8}}>
              Admin ካረጋገጠ በኋላ balance ይጨምርልዎታል።
            </p>
            <button className="btn btn-outline mt-8" onClick={()=>{setStep(1);setAmount('');setSmsText('');}}>
              ← ወደ ኋላ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
