import { useState, useEffect } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

export default function Deposit() {
  const [amount,  setAmount]  = useState('');
  const [step,    setStep]    = useState(1);
  const [settings,setSettings]= useState({ telebirr_phone:'', account_name:'' });

  useEffect(()=>{
    API.get('/auth/deposit-settings').then(({data})=>setSettings(data)).catch(()=>{});
  },[]);

  const handleDeposit = () => {
    if (!amount || parseInt(amount)<10) return toast.error('ቢያንስ 10 ETB ያስገቡ');
    setStep(2);
  };

  return (
    <div>
      <h1 className="page-title">💰 Deposit</h1>

      <div className="card" style={{maxWidth:440}}>
        {step===1 ? (
          <>
            <p className="card-title">Telebirr ተጠቀም</p>
            <div className="form-group">
              <label>መጠን (ETB)</label>
              <input className="form-input" type="number" min={10} placeholder="ለምሳሌ 100"
                value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleDeposit}>➕ ቀጥል</button>
          </>
        ) : (
          <>
            <p className="card-title">✅ Telebirr ክፍያ</p>
            <div style={{background:'var(--primary-lt)',borderRadius:8,padding:16,marginBottom:14}}>
              <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:6}}>ወደዚህ ቁጥር ይላኩ፦</p>
              <p style={{fontSize:26,fontWeight:800,color:'var(--primary)'}}>
                {settings.telebirr_phone || '—'}
              </p>
              {settings.account_name && (
                <p style={{fontSize:13,marginTop:4}}>Account: <strong>{settings.account_name}</strong></p>
              )}
              <p style={{fontSize:13,marginTop:8}}>መጠን: <strong>{amount} ETB</strong></p>
            </div>
            <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>
              ክፍያ ከፈጸሙ በኋላ screenshot admin ይላኩ — balance ይጨምርልዎታል።
            </p>
            <button className="btn btn-outline btn-full" onClick={()=>setStep(1)}>↩️ ተመለስ</button>
          </>
        )}
      </div>
    </div>
  );
}
