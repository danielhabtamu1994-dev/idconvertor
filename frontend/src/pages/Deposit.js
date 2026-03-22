import { useState } from 'react';
import toast from 'react-hot-toast';

export default function Deposit() {
  const [amount, setAmount] = useState('');
  const [step,   setStep]   = useState(1);

  const handleDeposit = () => {
    if (!amount || parseInt(amount) < 10) return toast.error('ቢያንስ 10 ETB ያስገቡ');
    setStep(2);
  };

  return (
    <div>
      <h1 className="page-title">💰 Deposit</h1>

      <div className="card" style={{ maxWidth:440 }}>
        {step === 1 && (
          <>
            <p className="card-title">Telebirr ተጠቀም</p>
            <div className="form-group">
              <label>መጠን (ETB)</label>
              <input className="form-input" type="number" min={10} placeholder="ለምሳሌ 100"
                value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleDeposit}>
              ➕ Deposit አድርግ
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="card-title">✅ ለ Telebirr ክፍያ</p>
            <div style={{ background:'var(--primary-lt)', borderRadius:8, padding:16, marginBottom:16 }}>
              <p style={{ fontSize:13, marginBottom:8 }}>ወደ ዚህ ቁጥር ይላኩ፦</p>
              <p style={{ fontSize:24, fontWeight:700, color:'var(--primary)' }}>0912 345 678</p>
              <p style={{ fontSize:13, marginTop:8, color:'var(--text-muted)' }}>
                መጠን: <strong>{amount} ETB</strong>
              </p>
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
              ክፍያ ከፈጸሙ በኋላ screenshot ያስቀርቡ — admin ያረጋግጣል።
            </p>
            <button className="btn btn-outline btn-full" onClick={() => setStep(1)}>
              ↩️ ተመለስ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
