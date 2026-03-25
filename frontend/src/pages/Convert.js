import { useState, useRef, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../services/AuthContext';
import toast from 'react-hot-toast';

function UploadBox({ label, file, onChange, loading }) {
  const ref = useRef();
  return (
    <div>
      <p style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>{label}</p>
      <div className={`upload-box ${file?'has-file':''}`}
        onClick={() => !loading && ref.current.click()}>
        <div style={{ fontSize:26 }}>{loading?'⏳':file?'✅':'📁'}</div>
        <p style={{ fontSize:11 }}>{loading?'Processing...':file?'✅ Ready':'ምስል ምረጥ'}</p>
        <input ref={ref} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => onChange(e.target.files[0])} />
      </div>
    </div>
  );
}

export default function Convert() {
  const { user, refreshBalance } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [frontFile,   setFrontFile]   = useState(null);
  const [backFile,    setBackFile]    = useState(null);
  const [profileFile, setProfileFile] = useState(null);

  const [frontLines, setFrontLines] = useState([]);
  const [backLines,  setBackLines]  = useState([]);
  const [fn, setFn] = useState({ amh_n:5,eng_n:6,dob_n:8,sex_n:10,exp_n:12 });
  const [bn, setBn] = useState({ phone_n:3,fin_n:5,addr_amh_n:7,addr_eng_n:8,zone_amh_n:9,zone_eng_n:10,woreda_amh_n:11,woreda_eng_n:12 });

  const [fanManual, setFanManual] = useState('');
  const [finManual, setFinManual] = useState('');
  const [photob64,  setPhotob64]  = useState('');
  const [qrb64,     setQrb64]    = useState('');
  const [natAm,     setNatAm]    = useState('ኢትዮጵያዊ');
  const [natEn,     setNatEn]    = useState('Ethiopian');

  const manualPhotoRef = useRef();
  const manualQrRef    = useRef();

  useEffect(()=>{
    API.get('/settings/').then(({data})=>{
      if(data.nat_am) setNatAm(data.nat_am);
      if(data.nat_en) setNatEn(data.nat_en);
    }).catch(()=>{});
  },[]);

  const [mergedResult, setMergedResult] = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [loading, setLoading] = useState({});
  const setLoad = (k,v) => setLoading(p=>({...p,[k]:v}));

  // ── Auto OCR front ─────────────────────────────────────────────
  useEffect(() => {
    if (!frontFile) return;
    (async () => {
      setLoad('ocr_front', true);
      try {
        const fd = new FormData();
        fd.append('file', frontFile);
        const { data } = await API.post('/convert/ocr/front', fd);
        setFrontLines(data.lines);
        const d = data.detected;
        if (d.full_name)   setFn(p=>({...p,amh_n:d.full_name,eng_n:d.full_name+1}));
        if (d.date_birth)  setFn(p=>({...p,dob_n:d.date_birth}));
        if (d.sex)         setFn(p=>({...p,sex_n:d.sex}));
        if (d.date_expiry) setFn(p=>({...p,exp_n:d.date_expiry}));
        if (d.fan) setFanManual((data.lines[d.fan-1]||'').replace(/\D/g,''));
      } catch { toast.error('Front OCR failed'); }
      finally { setLoad('ocr_front', false); }
    })();
  }, [frontFile]);

  // ── Auto OCR back ──────────────────────────────────────────────
  useEffect(() => {
    if (!backFile) return;
    (async () => {
      setLoad('ocr_back', true);
      try {
        const fd = new FormData();
        fd.append('file', backFile);
        const { data } = await API.post('/convert/ocr/back', fd);
        setBackLines(data.lines);
        const d = data.detected;
        if (d.phone)      setBn(p=>({...p,phone_n:d.phone}));
        if (d.fin)      { setBn(p=>({...p,fin_n:d.fin})); setFinManual((data.lines[d.fin-1]||'').replace(/\D/g,'')); }
        if (d.addr_amh)   setBn(p=>({...p,addr_amh_n:d.addr_amh}));
        if (d.addr_eng)   setBn(p=>({...p,addr_eng_n:d.addr_eng}));
        if (d.zone_amh)   setBn(p=>({...p,zone_amh_n:d.zone_amh}));
        if (d.zone_eng)   setBn(p=>({...p,zone_eng_n:d.zone_eng}));
        if (d.woreda_amh) setBn(p=>({...p,woreda_amh_n:d.woreda_amh}));
        if (d.woreda_eng) setBn(p=>({...p,woreda_eng_n:d.woreda_eng}));
      } catch { toast.error('Back OCR failed'); }
      finally { setLoad('ocr_back', false); }
    })();
  }, [backFile]);

  // ── Auto crop profile ──────────────────────────────────────────
  useEffect(() => {
    if (!profileFile) return;
    (async () => {
      setLoad('crop', true);
      try {
        const fd = new FormData();
        fd.append('file', profileFile);
        const { data } = await API.post('/convert/profile/crop', fd);
        setPhotob64(data.photo_b64);
        setQrb64(data.qr_b64);
      } catch { toast.error('Profile crop failed'); }
      finally { setLoad('crop', false); }
    })();
  }, [profileFile]);

  // ── Admin manual photo/qr handlers ────────────────────────────
  const handleManualPhoto = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => setPhotob64(e.target.result.split(',')[1]);
    r.readAsDataURL(file);
  };
  const handleManualQr = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => setQrb64(e.target.result.split(',')[1]);
    r.readAsDataURL(file);
  };

  // ── Field label helpers for OCR table ─────────────────────────
  const getFrontLabel = (i) => {
    const map = {
      [fn.amh_n-1]: 'አማርኛ ስም',
      [fn.eng_n-1]: 'እንግሊዝኛ ስም',
      [fn.dob_n-1]: 'የትውልድ ቀን',
      [fn.sex_n-1]: 'ፆታ',
      [fn.exp_n-1]: 'ቀን ማብቂያ',
    };
    return map[i] || '';
  };
  const getBackLabel = (i) => {
    const map = {
      [bn.phone_n-1]:     'ስልክ',
      [bn.fin_n-1]:       'FIN',
      [bn.addr_amh_n-1]:  'አድራሻ (አማ)',
      [bn.addr_eng_n-1]:  'አድራሻ (Eng)',
      [bn.zone_amh_n-1]:  'ዞን (አማ)',
      [bn.zone_eng_n-1]:  'ዞን (Eng)',
      [bn.woreda_amh_n-1]:'ወረዳ (አማ)',
      [bn.woreda_eng_n-1]:'ወረዳ (Eng)',
    };
    return map[i] || '';
  };

  // ── Generate ───────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!frontFile) return toast.error('ID Front ያስገቡ');
    if (!backFile)  return toast.error('ID Back ያስገቡ');
    if ((user?.balance ?? 0) < 20) return toast.error('በቂ ብር የለም — Deposit አድርጉ');

    const snPrefix = Math.random() < 0.5 ? '6' : '7';
    const snSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6,'0');
    const snVal    = snPrefix + snSuffix;

    setGenerating(true);
    setMergedResult('');
    try {
      const fdF = new FormData();
      fdF.append('photo_b64',  photob64);
      fdF.append('fan_digits', fanManual);
      fdF.append('field_nums', JSON.stringify(fn));
      fdF.append('ocr_lines',  JSON.stringify(frontLines));
      const respF = await API.post('/convert/generate/front', fdF, { responseType:'blob' });
      const frontUrl = URL.createObjectURL(respF.data);

      const fdB = new FormData();
      fdB.append('qr_b64',     qrb64);
      fdB.append('fin_digits', finManual);
      fdB.append('field_nums', JSON.stringify(bn));
      fdB.append('ocr_lines',  JSON.stringify(backLines));
      fdB.append('sn_val',     snVal);
      fdB.append('nat_am',     natAm);
      fdB.append('nat_en',     natEn);
      const respB = await API.post('/convert/generate/back', fdB, { responseType:'blob' });
      const backUrl = URL.createObjectURL(respB.data);

      const imgF = await loadImg(frontUrl);
      const imgB = await loadImg(backUrl);
      const gap   = 20;
      const totalW = imgF.width + gap + imgB.width;
      const totalH = Math.max(imgF.height, imgB.height);
      const canvas  = document.createElement('canvas');
      canvas.width  = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0,0,totalW,totalH);
      ctx.drawImage(imgF, 0, 0);
      ctx.drawImage(imgB, imgF.width + gap, 0);
      const merged = canvas.toDataURL('image/jpeg', 0.92);
      setMergedResult(merged);

      await API.post('/auth/deduct', { amount: 20 });
      await refreshBalance();
      toast.success('✅ ID ተዘጋጀ!');
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally {
      setGenerating(false);
    }
  };

  const loadImg = src => new Promise((res,rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src     = src;
  });

  const anyLoading = loading.ocr_front || loading.ocr_back || loading.crop;

  // shared table style
  const thStyle = { padding:'6px 8px', textAlign:'left', color:'var(--text-muted)', fontWeight:700, fontSize:11 };
  const tdStyle = { padding:'4px 8px', color:'var(--text-muted)', fontSize:12 };
  const inputStyle = { width:'100%', padding:'4px 6px', border:'1px solid var(--border)', borderRadius:4, fontSize:12, background:'var(--bg)', color:'var(--text)' };

  return (
    <div>
      <h1 className="page-title">🪪 ID Convert</h1>

      {/* Upload */}
      <div className="card">
        <div className="grid-3">
          <UploadBox label="📸 ID Front"     file={frontFile}   loading={loading.ocr_front} onChange={setFrontFile}/>
          <UploadBox label="📸 ID Back"      file={backFile}    loading={loading.ocr_back}  onChange={setBackFile}/>
          <UploadBox label="📷 Profile & QR" file={profileFile} loading={loading.crop}       onChange={setProfileFile}/>
        </div>
      </div>

      {/* Admin: Manual Photo & QR override */}
      {isAdmin && (
        <div className="card">
          <p className="card-title">🔧 Admin — ፎቶ እና QR Manual Upload</p>
          <div className="grid-2">
            <div>
              <p style={{fontSize:12,fontWeight:600,marginBottom:6}}>📸 ፎቶ (manually upload)</p>
              <div className="upload-box" style={{cursor:'pointer',minHeight:100}}
                onClick={()=>manualPhotoRef.current.click()}>
                {photob64
                  ? <img src={`data:image/png;base64,${photob64}`} alt="photo"
                      style={{width:'100%',maxHeight:120,objectFit:'contain',borderRadius:6}}/>
                  : <><div style={{fontSize:24}}>🖼️</div><p style={{fontSize:11}}>ፎቶ ምረጥ</p></>
                }
                <input ref={manualPhotoRef} type="file" accept="image/*" style={{display:'none'}}
                  onChange={e=>handleManualPhoto(e.target.files[0])}/>
              </div>
            </div>
            <div>
              <p style={{fontSize:12,fontWeight:600,marginBottom:6}}>📷 QR Code (manually upload)</p>
              <div className="upload-box" style={{cursor:'pointer',minHeight:100}}
                onClick={()=>manualQrRef.current.click()}>
                {qrb64
                  ? <img src={`data:image/png;base64,${qrb64}`} alt="qr"
                      style={{width:'100%',maxHeight:120,objectFit:'contain',borderRadius:6}}/>
                  : <><div style={{fontSize:24}}>📷</div><p style={{fontSize:11}}>QR ምረጥ</p></>
                }
                <input ref={manualQrRef} type="file" accept="image/*" style={{display:'none'}}
                  onChange={e=>handleManualQr(e.target.files[0])}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Front OCR editable table */}
      {isAdmin && frontLines.length > 0 && (
        <div className="card">
          <p className="card-title">✏️ Front OCR — ማስተካከያ</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'var(--bg)'}}>
                  <th style={{...thStyle,width:32}}>#</th>
                  <th style={{...thStyle,width:110}}>Field</th>
                  <th style={thStyle}>Value</th>
                </tr>
              </thead>
              <tbody>
                {frontLines.map((line, i) => {
                  const label = getFrontLabel(i);
                  return (
                    <tr key={i} style={{borderTop:'1px solid var(--border)', background: label ? 'rgba(59,130,246,0.06)' : 'transparent'}}>
                      <td style={tdStyle}>{i+1}</td>
                      <td style={{...tdStyle, color:'#3b82f6', fontWeight:600}}>{label}</td>
                      <td style={{padding:'3px 4px'}}>
                        <input value={line} style={inputStyle}
                          onChange={e=>{const arr=[...frontLines];arr[i]=e.target.value;setFrontLines(arr);}}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin: Back OCR editable table */}
      {isAdmin && backLines.length > 0 && (
        <div className="card">
          <p className="card-title">✏️ Back OCR — ማስተካከያ</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'var(--bg)'}}>
                  <th style={{...thStyle,width:32}}>#</th>
                  <th style={{...thStyle,width:110}}>Field</th>
                  <th style={thStyle}>Value</th>
                </tr>
              </thead>
              <tbody>
                {backLines.map((line, i) => {
                  const label = getBackLabel(i);
                  return (
                    <tr key={i} style={{borderTop:'1px solid var(--border)', background: label ? 'rgba(59,130,246,0.06)' : 'transparent'}}>
                      <td style={tdStyle}>{i+1}</td>
                      <td style={{...tdStyle, color:'#3b82f6', fontWeight:600}}>{label}</td>
                      <td style={{padding:'3px 4px'}}>
                        <input value={line} style={inputStyle}
                          onChange={e=>{const arr=[...backLines];arr[i]=e.target.value;setBackLines(arr);}}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FAN / FIN */}
      <div className="card">
        <div className="grid-2">
          <div className="form-group" style={{marginBottom:0}}>
            <label>🔖 FAN (16 ዲጂት)</label>
            <input className="form-input" placeholder="1234567890123456"
              value={fanManual} onChange={e=>setFanManual(e.target.value.replace(/\D/g,''))} maxLength={16}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label>🔢 FIN (12 ዲጂት)</label>
            <input className="form-input" placeholder="123456789012"
              value={finManual} onChange={e=>setFinManual(e.target.value.replace(/\D/g,''))} maxLength={12}/>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <button
        className="btn btn-primary btn-full"
        style={{ padding:'14px', fontSize:15, fontWeight:700, marginBottom:16 }}
        onClick={handleContinue}
        disabled={generating || anyLoading}>
        {generating ? '⏳ እየተዘጋጀ ነው...' : anyLoading ? '⏳ ምስሎች እየተዘጋጁ...' : '▶️ Continue — ID አዘጋጅ (20 ETB)'}
      </button>

      {/* Merged result */}
      {mergedResult && (
        <div className="card" style={{textAlign:'center'}}>
          <p className="card-title">✅ ተዘጋጀ!</p>
          <img src={mergedResult} alt="id" style={{width:'100%',borderRadius:8,border:'1px solid var(--border)'}}/>
          <a href={mergedResult} download="fayda_id.jpg" style={{display:'block',marginTop:12}}>
            <button className="btn btn-primary btn-full">⬇️ Download</button>
          </a>
        </div>
      )}
    </div>
  );
}
