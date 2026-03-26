import { useState, useRef, useEffect, useCallback } from 'react';
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

function NInput({ value, onChange }) {
  return (
    <input type="number" min={1} value={value}
      onChange={e => onChange(Number(e.target.value) || 1)}
      style={{ width:52, padding:'3px 5px', border:'1px solid var(--border)',
        borderRadius:4, fontSize:12, background:'var(--bg)', color:'var(--text)', textAlign:'center' }}/>
  );
}

const FRONT_MAP_FIELDS = [
  ['amh_n','አማርኛ ስም'],['eng_n','እንግሊዝኛ ስም'],['dob_n','የትውልድ ቀን'],
  ['sex_n','ፆታ'],['exp_n','ቀን ማብቂያ'],
];
const BACK_MAP_FIELDS = [
  ['phone_n','ስልክ'],['fin_n','FIN'],['addr_amh_n','አድራሻ (አማ)'],
  ['addr_eng_n','አድራሻ (Eng)'],['zone_amh_n','ዞን (አማ)'],['zone_eng_n','ዞን (Eng)'],
  ['woreda_amh_n','ወረዳ (አማ)'],['woreda_eng_n','ወረዳ (Eng)'],
];

// ── AdminOCRSection — defined OUTSIDE Convert to avoid remount ──
function AdminOCRSection({ side, lines, setLines, mapping, setMap, fields, getLabel, saveMapping }) {
  const [mapMode, setMapMode] = useState('normal');

  const thStyle  = { padding:'6px 8px', textAlign:'left', color:'var(--text-muted)', fontWeight:700, fontSize:11 };
  const tdStyle  = { padding:'4px 8px', color:'var(--text-muted)', fontSize:12 };
  const inpStyle = { width:'100%', padding:'4px 6px', border:'1px solid var(--border)', borderRadius:4, fontSize:12, background:'var(--bg)', color:'var(--text)' };

  if (lines.length === 0) return null;

  return (
    <div className="card">
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <p className="card-title" style={{margin:0}}>✏️ {side==='front'?'Front':'Back'} OCR — ማስተካከያ</p>
        <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
          {['normal','manual'].map(m=>(
            <button key={m}
              className={`btn btn-sm ${mapMode===m?'btn-primary':'btn-outline'}`}
              style={{fontSize:11,padding:'4px 12px'}}
              onClick={()=>setMapMode(m)}>
              {m==='normal'?'1️⃣ Normal':'2️⃣ Manual'}
            </button>
          ))}
        </div>
      </div>

      {/* NORMAL: editable value table */}
      {mapMode==='normal' && (
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
              {lines.map((line,i)=>{
                const label=getLabel(i);
                return (
                  <tr key={i} style={{borderTop:'1px solid var(--border)',background:label?'rgba(59,130,246,0.06)':'transparent'}}>
                    <td style={tdStyle}>{i+1}</td>
                    <td style={{...tdStyle,color:'#3b82f6',fontWeight:600}}>{label}</td>
                    <td style={{padding:'3px 4px'}}>
                      <input value={line} style={inpStyle} onChange={e=>{
                        const arr=[...lines]; arr[i]=e.target.value; setLines(arr);
                      }}/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MANUAL: assign line numbers to fields */}
      {mapMode==='manual' && (
        <div>
          <div style={{marginBottom:12,padding:'8px 10px',background:'var(--bg)',borderRadius:6}}>
            <p style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,fontWeight:600}}>📋 OCR Lines ({lines.length})</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {lines.map((line,i)=>(
                <span key={i} style={{background:'var(--border)',borderRadius:4,padding:'2px 7px',fontSize:10,whiteSpace:'nowrap'}}>
                  <strong>{i+1}</strong>: {line.slice(0,22)}{line.length>22?'…':''}
                </span>
              ))}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr auto',rowGap:8,columnGap:12,alignItems:'center',fontSize:12,marginBottom:14}}>
            {fields.map(([key,label])=>[
              <span key={key+'l'} style={{fontWeight:500}}>{label}</span>,
              <div key={key+'n'} style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:'var(--text-muted)'}}>line</span>
                <NInput value={mapping[key]} onChange={v=>setMap(p=>({...p,[key]:v}))}/>
                <span style={{fontSize:11,color:'var(--text-muted)',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  → {lines[mapping[key]-1]?.slice(0,14)||'—'}
                </span>
              </div>
            ])}
          </div>

          <button className="btn btn-success btn-sm" onClick={saveMapping}>
            💾 Save Mapping to Firebase
          </button>
          <p style={{fontSize:10,color:'var(--text-muted)',marginTop:5}}>
            ሌላ ፋይል ሲጫን ይህ mapping ይጠቀማል
          </p>
        </div>
      )}
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

  // Track whether a saved manual mapping was loaded from Firebase
  // If true, OCR auto-detect will NOT overwrite fn/bn
  const [hasSavedMapping, setHasSavedMapping] = useState(false);

  const [fanManual, setFanManual] = useState('');
  const [finManual, setFinManual] = useState('');
  const [photob64,  setPhotob64]  = useState('');
  const [qrb64,     setQrb64]    = useState('');
  const [natAm,     setNatAm]    = useState('ኢትዮጵያዊ');
  const [natEn,     setNatEn]    = useState('Ethiopian');

  const manualPhotoRef = useRef();
  const manualQrRef    = useRef();

  // Load settings + saved mappings from Firebase on mount
  useEffect(()=>{
    API.get('/settings/').then(({data})=>{
      if(data.nat_am) setNatAm(data.nat_am);
      if(data.nat_en) setNatEn(data.nat_en);
      if(data.field_map_front && Object.keys(data.field_map_front).length > 0) {
        setFn(p=>({...p,...data.field_map_front}));
        setHasSavedMapping(true);  // ← saved mapping exists, block OCR auto-detect
      }
      if(data.field_map_back && Object.keys(data.field_map_back).length > 0) {
        setBn(p=>({...p,...data.field_map_back}));
      }
    }).catch(()=>{});
  },[]);

  const [mergedResult, setMergedResult] = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [loading,      setLoading]      = useState({});
  const setLoad = (k,v) => setLoading(p=>({...p,[k]:v}));

  // Save mapping to Firebase
  const saveMapping = useCallback(async () => {
    try {
      const { data: cur } = await API.get('/settings/');
      await API.put('/settings/', {
        pos:             cur.pos       || {},
        size:            cur.size      || {},
        pos_back:        cur.pos_back  || {},
        size_back:       cur.size_back || {},
        nat_am:          natAm,
        nat_en:          natEn,
        field_map_front: fn,
        field_map_back:  bn,
      });
      setHasSavedMapping(true);
      toast.success('✅ Mapping saved!');
    } catch { toast.error('Save failed'); }
  }, [fn, bn, natAm, natEn]);

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
        // Only auto-map if no saved mapping exists
        if (!hasSavedMapping) {
          const d = data.detected;
          if (d.full_name)   setFn(p=>({...p,amh_n:d.full_name,eng_n:d.full_name+1}));
          if (d.date_birth)  setFn(p=>({...p,dob_n:d.date_birth}));
          if (d.sex)         setFn(p=>({...p,sex_n:d.sex}));
          if (d.date_expiry) setFn(p=>({...p,exp_n:d.date_expiry}));
          if (d.fan) setFanManual((data.lines[d.fan-1]||'').replace(/\D/g,''));
        }
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
        if (!hasSavedMapping) {
          const d = data.detected;
          if (d.phone)      setBn(p=>({...p,phone_n:d.phone}));
          if (d.fin)      { setBn(p=>({...p,fin_n:d.fin})); setFinManual((data.lines[d.fin-1]||'').replace(/\D/g,'')); }
          if (d.addr_amh)   setBn(p=>({...p,addr_amh_n:d.addr_amh}));
          if (d.addr_eng)   setBn(p=>({...p,addr_eng_n:d.addr_eng}));
          if (d.zone_amh)   setBn(p=>({...p,zone_amh_n:d.zone_amh}));
          if (d.zone_eng)   setBn(p=>({...p,zone_eng_n:d.zone_eng}));
          if (d.woreda_amh) setBn(p=>({...p,woreda_amh_n:d.woreda_amh}));
          if (d.woreda_eng) setBn(p=>({...p,woreda_eng_n:d.woreda_eng}));
        }
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

  const getFrontLabel = (i) => ({
    [fn.amh_n-1]:'አማርኛ ስም',[fn.eng_n-1]:'እንግሊዝኛ ስም',
    [fn.dob_n-1]:'የትውልድ ቀን',[fn.sex_n-1]:'ፆታ',[fn.exp_n-1]:'ቀን ማብቂያ',
  })[i]||'';
  const getBackLabel = (i) => ({
    [bn.phone_n-1]:'ስልክ',[bn.fin_n-1]:'FIN',
    [bn.addr_amh_n-1]:'አድራሻ (አማ)',[bn.addr_eng_n-1]:'አድራሻ (Eng)',
    [bn.zone_amh_n-1]:'ዞን (አማ)',[bn.zone_eng_n-1]:'ዞን (Eng)',
    [bn.woreda_amh_n-1]:'ወረዳ (አማ)',[bn.woreda_eng_n-1]:'ወረዳ (Eng)',
  })[i]||'';

  const handleContinue = async () => {
    if (!frontFile) return toast.error('ID Front ያስገቡ');
    if (!backFile)  return toast.error('ID Back ያስገቡ');
    if ((user?.balance ?? 0) < 20) return toast.error('በቂ ብር የለም — Deposit አድርጉ');

    const snPrefix = Math.random() < 0.5 ? '6' : '7';
    const snSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6,'0');
    const snVal    = snPrefix + snSuffix;

    setGenerating(true); setMergedResult('');
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
      const gap=20, totalW=imgF.width+gap+imgB.width, totalH=Math.max(imgF.height,imgB.height);
      const canvas=document.createElement('canvas');
      canvas.width=totalW; canvas.height=totalH;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,totalW,totalH);
      ctx.drawImage(imgF,0,0); ctx.drawImage(imgB,imgF.width+gap,0);
      setMergedResult(canvas.toDataURL('image/jpeg',0.92));

      await API.post('/auth/deduct', { amount: 20 });
      await refreshBalance();
      toast.success('✅ ID ተዘጋጀ!');
    } catch(e) {
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setGenerating(false); }
  };

  const loadImg = src => new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=rej; img.src=src; });
  const anyLoading = loading.ocr_front || loading.ocr_back || loading.crop;

  return (
    <div>
      <h1 className="page-title">🪪 ID Convert</h1>

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
          {hasSavedMapping && (
            <div style={{fontSize:11,color:'#16a34a',background:'rgba(22,163,74,0.08)',borderRadius:6,padding:'6px 10px',marginBottom:10}}>
              ✅ Saved mapping is active — OCR auto-detect ይሰረዛል
              <button className="btn btn-sm btn-outline" style={{marginLeft:8,fontSize:10,padding:'2px 8px'}}
                onClick={()=>setHasSavedMapping(false)}>
                Reset to auto
              </button>
            </div>
          )}
          <div className="grid-2">
            <div>
              <p style={{fontSize:12,fontWeight:600,marginBottom:6}}>📸 ፎቶ (manually upload)</p>
              <div className="upload-box" style={{cursor:'pointer',minHeight:100}} onClick={()=>manualPhotoRef.current.click()}>
                {photob64
                  ? <img src={`data:image/png;base64,${photob64}`} alt="photo" style={{width:'100%',maxHeight:120,objectFit:'contain',borderRadius:6}}/>
                  : <><div style={{fontSize:24}}>🖼️</div><p style={{fontSize:11}}>ፎቶ ምረጥ</p></>}
                <input ref={manualPhotoRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleManualPhoto(e.target.files[0])}/>
              </div>
            </div>
            <div>
              <p style={{fontSize:12,fontWeight:600,marginBottom:6}}>📷 QR Code (manually upload)</p>
              <div className="upload-box" style={{cursor:'pointer',minHeight:100}} onClick={()=>manualQrRef.current.click()}>
                {qrb64
                  ? <img src={`data:image/png;base64,${qrb64}`} alt="qr" style={{width:'100%',maxHeight:120,objectFit:'contain',borderRadius:6}}/>
                  : <><div style={{fontSize:24}}>📷</div><p style={{fontSize:11}}>QR ምረጥ</p></>}
                <input ref={manualQrRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleManualQr(e.target.files[0])}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <AdminOCRSection side="front" lines={frontLines} setLines={setFrontLines}
          mapping={fn} setMap={setFn} fields={FRONT_MAP_FIELDS} getLabel={getFrontLabel} saveMapping={saveMapping}/>
      )}
      {isAdmin && (
        <AdminOCRSection side="back" lines={backLines} setLines={setBackLines}
          mapping={bn} setMap={setBn} fields={BACK_MAP_FIELDS} getLabel={getBackLabel} saveMapping={saveMapping}/>
      )}

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

      <button className="btn btn-primary btn-full"
        style={{padding:'14px',fontSize:15,fontWeight:700,marginBottom:16}}
        onClick={handleContinue} disabled={generating||anyLoading}>
        {generating?'⏳ እየተዘጋጀ ነው...':anyLoading?'⏳ ምስሎች እየተዘጋጁ...':'▶️ Continue — ID አዘጋጅ (20 ETB)'}
      </button>

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
