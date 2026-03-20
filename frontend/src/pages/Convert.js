import { useState, useRef } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

// ── Upload Box ───────────────────────────────────────────────────
function UploadBox({ label, file, onChange }) {
  const ref = useRef();
  return (
    <div>
      <p style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{label}</p>
      <div className={`upload-box ${file?'has-file':''}`} onClick={() => ref.current.click()}>
        <div style={{ fontSize:28 }}>{file ? '✅' : '📁'}</div>
        <p>{file ? file.name : 'Click to upload'}</p>
        <input ref={ref} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => onChange(e.target.files[0])} />
      </div>
    </div>
  );
}

// ── Number Input ────────────────────────────────────────────────
function NInput({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input className="form-input" type="number" min={1} value={value}
        onChange={e => onChange(parseInt(e.target.value)||1)} />
    </div>
  );
}

export default function Convert() {
  // Files
  const [frontFile,   setFrontFile]   = useState(null);
  const [backFile,    setBackFile]    = useState(null);
  const [profileFile, setProfileFile] = useState(null);

  // OCR
  const [frontLines,    setFrontLines]    = useState([]);
  const [backLines,     setBackLines]     = useState([]);
  const [frontDetected, setFrontDetected] = useState({});
  const [backDetected,  setBackDetected]  = useState({});

  // Cropped images (base64)
  const [photob64, setPhotob64] = useState('');
  const [qrb64,    setQrb64]   = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [qrPreview,    setQrPreview]    = useState('');

  // Field numbers — front
  const [fn, setFn] = useState({ amh_n:5, eng_n:6, dob_n:8, sex_n:10, exp_n:12 });
  // Field numbers — back
  const [bn, setBn] = useState({ phone_n:3, fin_n:5, addr_amh_n:7, addr_eng_n:8, zone_amh_n:9, zone_eng_n:10, woreda_amh_n:11, woreda_eng_n:12 });

  // Manuals
  const [fanManual, setFanManual] = useState('');
  const [finManual, setFinManual] = useState('');

  // Results
  const [frontResult, setFrontResult] = useState('');
  const [backResult,  setBackResult]  = useState('');

  const [loading, setLoading] = useState({});
  const setLoad = (k,v) => setLoading(p => ({...p,[k]:v}));

  // ── OCR Front ─────────────────────────────────────────────────
  const ocrFront = async () => {
    if (!frontFile) return toast.error('ID Front ያስገቡ');
    setLoad('ocr_front', true);
    try {
      const fd = new FormData();
      fd.append('file', frontFile);
      const { data } = await API.post('/convert/ocr/front', fd);
      setFrontLines(data.lines);
      setFrontDetected(data.detected);
      // auto-fill field numbers
      const d = data.detected;
      if (d.full_name) setFn(p => ({...p, amh_n:d.full_name, eng_n:d.full_name+1}));
      if (d.date_birth)  setFn(p => ({...p, dob_n:d.date_birth}));
      if (d.sex)         setFn(p => ({...p, sex_n:d.sex}));
      if (d.date_expiry) setFn(p => ({...p, exp_n:d.date_expiry}));
      if (d.fan) {
        const raw = data.lines[d.fan-1] || '';
        setFanManual(raw.replace(/\D/g,''));
      }
      toast.success('OCR ተሳካ');
    } catch(e) { toast.error('OCR failed'); }
    finally { setLoad('ocr_front',false); }
  };

  // ── OCR Back ──────────────────────────────────────────────────
  const ocrBack = async () => {
    if (!backFile) return toast.error('ID Back ያስገቡ');
    setLoad('ocr_back', true);
    try {
      const fd = new FormData();
      fd.append('file', backFile);
      const { data } = await API.post('/convert/ocr/back', fd);
      setBackLines(data.lines);
      setBackDetected(data.detected);
      const d = data.detected;
      if (d.phone)       setBn(p => ({...p, phone_n:d.phone}));
      if (d.fin) {
        setBn(p => ({...p, fin_n:d.fin}));
        setFinManual((data.lines[d.fin-1]||'').replace(/\D/g,''));
      }
      if (d.addr_amh)   setBn(p => ({...p, addr_amh_n:d.addr_amh}));
      if (d.addr_eng)   setBn(p => ({...p, addr_eng_n:d.addr_eng}));
      if (d.zone_amh)   setBn(p => ({...p, zone_amh_n:d.zone_amh}));
      if (d.zone_eng)   setBn(p => ({...p, zone_eng_n:d.zone_eng}));
      if (d.woreda_amh) setBn(p => ({...p, woreda_amh_n:d.woreda_amh}));
      if (d.woreda_eng) setBn(p => ({...p, woreda_eng_n:d.woreda_eng}));
      toast.success('OCR ተሳካ');
    } catch(e) { toast.error('OCR failed'); }
    finally { setLoad('ocr_back',false); }
  };

  // ── Crop Profile ──────────────────────────────────────────────
  const cropProfile = async () => {
    if (!profileFile) return toast.error('Profile & QR ያስገቡ');
    setLoad('crop', true);
    try {
      const fd = new FormData();
      fd.append('file', profileFile);
      const { data } = await API.post('/convert/profile/crop', fd);
      setPhotob64(data.photo_b64);
      setQrb64(data.qr_b64);
      setPhotoPreview(`data:image/png;base64,${data.photo_b64}`);
      setQrPreview(`data:image/png;base64,${data.qr_b64}`);
      toast.success('ፎቶ እና QR ተቆረጠ');
    } catch(e) { toast.error('Crop failed'); }
    finally { setLoad('crop',false); }
  };

  // ── Generate Front ────────────────────────────────────────────
  const genFront = async () => {
    if (!frontFile) return toast.error('ID Front ያስገቡ');
    setLoad('gen_front', true);
    try {
      const fd = new FormData();
      fd.append('id_front',   frontFile);
      fd.append('photo_b64',  photob64);
      fd.append('fan_digits', fanManual);
      fd.append('field_nums', JSON.stringify(fn));
      const resp = await API.post('/convert/generate/front', fd, { responseType:'blob' });
      const url  = URL.createObjectURL(resp.data);
      setFrontResult(url);
      toast.success('Front ID ተዘጋጀ!');
    } catch(e) { toast.error('Generate failed'); }
    finally { setLoad('gen_front',false); }
  };

  // ── Generate Back ─────────────────────────────────────────────
  const genBack = async () => {
    if (!backFile) return toast.error('ID Back ያስገቡ');
    setLoad('gen_back', true);
    try {
      const fd = new FormData();
      fd.append('id_back',    backFile);
      fd.append('qr_b64',    qrb64);
      fd.append('fin_digits', finManual);
      fd.append('field_nums', JSON.stringify(bn));
      const resp = await API.post('/convert/generate/back', fd, { responseType:'blob' });
      const url  = URL.createObjectURL(resp.data);
      setBackResult(url);
      toast.success('Back ID ተዘጋጀ!');
    } catch(e) { toast.error('Generate failed'); }
    finally { setLoad('gen_back',false); }
  };

  const pv = (lines, n) => lines[n-1] || '—';

  return (
    <div>
      <h1 className="page-title">🪪 ID Convert</h1>

      {/* Upload Row */}
      <div className="card">
        <p className="card-title">ምስሎች ያስገቡ</p>
        <div className="grid-3">
          <UploadBox label="📸 ID Front" file={frontFile}   onChange={setFrontFile} />
          <UploadBox label="📸 ID Back"  file={backFile}    onChange={setBackFile} />
          <UploadBox label="📷 Profile & QR" file={profileFile} onChange={f => { setProfileFile(f); }} />
        </div>
        {profileFile && (
          <button className="btn btn-outline btn-sm mt-8" onClick={cropProfile} disabled={loading.crop}>
            {loading.crop ? '⏳ Cropping...' : '✂️ ፎቶ እና QR ቁረጥ'}
          </button>
        )}
        {(photoPreview || qrPreview) && (
          <div className="grid-2 mt-8">
            {photoPreview && <div><p className="text-sm text-muted mb-4">✅ ፎቶ</p><img src={photoPreview} alt="photo" className="preview-img" style={{ maxHeight:160, objectFit:'contain' }}/></div>}
            {qrPreview    && <div><p className="text-sm text-muted mb-4">✅ QR Code</p><img src={qrPreview} alt="qr" className="preview-img" style={{ maxHeight:160, objectFit:'contain' }}/></div>}
          </div>
        )}
      </div>

      {/* Front Section */}
      <div className="card">
        <p className="card-title">🔵 ID Front</p>
        <button className="btn btn-primary btn-sm" onClick={ocrFront} disabled={loading.ocr_front}>
          {loading.ocr_front ? '⏳ OCR...' : '🔍 OCR ሂደት'}
        </button>

        {frontLines.length > 0 && (
          <>
            <hr className="divider" />
            {/* Field Numbers */}
            <div className="grid-3">
              <NInput label="አማርኛ ስም" value={fn.amh_n} onChange={v=>setFn(p=>({...p,amh_n:v}))} />
              <NInput label="እንግሊዝኛ ስም" value={fn.eng_n} onChange={v=>setFn(p=>({...p,eng_n:v}))} />
              <NInput label="የትውልድ ቀን" value={fn.dob_n} onChange={v=>setFn(p=>({...p,dob_n:v}))} />
              <NInput label="ፆታ" value={fn.sex_n} onChange={v=>setFn(p=>({...p,sex_n:v}))} />
              <NInput label="ቀን ማብቂያ" value={fn.exp_n} onChange={v=>setFn(p=>({...p,exp_n:v}))} />
            </div>
            {/* Preview */}
            <div className="grid-2" style={{ fontSize:13, gap:6 }}>
              {[['አማርኛ ስም',fn.amh_n],['እንግሊዝኛ ስም',fn.eng_n],['የትውልድ ቀን',fn.dob_n],['ፆታ',fn.sex_n],['ቀን ማብቂያ',fn.exp_n]].map(([l,n])=>(
                <div key={l} style={{ padding:'4px 8px', background:'var(--bg)', borderRadius:6 }}>
                  <span className="text-muted">{l}: </span><strong>{pv(frontLines,n)}</strong>
                </div>
              ))}
            </div>
            {/* FAN */}
            <div className="form-group mt-8">
              <label>🔖 FAN (16 ዲጂት)</label>
              <input className="form-input" placeholder="1234567890123456"
                value={fanManual} onChange={e=>setFanManual(e.target.value.replace(/\D/g,''))} maxLength={16}/>
              <p className="text-sm text-muted mt-8">{fanManual.length}/16 digits</p>
            </div>
          </>
        )}

        <hr className="divider"/>
        <button className="btn btn-success" onClick={genFront} disabled={loading.gen_front}>
          {loading.gen_front ? '⏳ Generating...' : '✅ Front ID አዘጋጅ'}
        </button>
        {frontResult && (
          <div className="mt-8">
            <img src={frontResult} alt="front" className="preview-img" />
            <a href={frontResult} download="front.png">
              <button className="btn btn-primary btn-sm mt-8">⬇️ Download Front</button>
            </a>
          </div>
        )}
      </div>

      {/* Back Section */}
      <div className="card">
        <p className="card-title">🟠 ID Back</p>
        <button className="btn btn-primary btn-sm" onClick={ocrBack} disabled={loading.ocr_back}>
          {loading.ocr_back ? '⏳ OCR...' : '🔍 OCR ሂደት'}
        </button>

        {backLines.length > 0 && (
          <>
            <hr className="divider" />
            <div className="grid-4">
              <NInput label="ስልክ ቁጥር"      value={bn.phone_n}     onChange={v=>setBn(p=>({...p,phone_n:v}))} />
              <NInput label="FIN"            value={bn.fin_n}       onChange={v=>setBn(p=>({...p,fin_n:v}))} />
              <NInput label="አድራሻ (አማርኛ)"  value={bn.addr_amh_n}  onChange={v=>setBn(p=>({...p,addr_amh_n:v}))} />
              <NInput label="አድራሻ (English)" value={bn.addr_eng_n}  onChange={v=>setBn(p=>({...p,addr_eng_n:v}))} />
              <NInput label="ዞን (አማርኛ)"    value={bn.zone_amh_n}  onChange={v=>setBn(p=>({...p,zone_amh_n:v}))} />
              <NInput label="ዞን (English)"   value={bn.zone_eng_n}  onChange={v=>setBn(p=>({...p,zone_eng_n:v}))} />
              <NInput label="ወረዳ (አማርኛ)"   value={bn.woreda_amh_n} onChange={v=>setBn(p=>({...p,woreda_amh_n:v}))} />
              <NInput label="ወረዳ (English)"  value={bn.woreda_eng_n} onChange={v=>setBn(p=>({...p,woreda_eng_n:v}))} />
            </div>
            <div className="form-group">
              <label>🔢 FIN (12 ዲጂት)</label>
              <input className="form-input" placeholder="123456789012"
                value={finManual} onChange={e=>setFinManual(e.target.value.replace(/\D/g,''))} maxLength={12}/>
              <p className="text-sm text-muted mt-8">{finManual.length}/12 digits</p>
            </div>
          </>
        )}

        <hr className="divider"/>
        <button className="btn btn-success" onClick={genBack} disabled={loading.gen_back}>
          {loading.gen_back ? '⏳ Generating...' : '✅ Back ID አዘጋጅ'}
        </button>
        {backResult && (
          <div className="mt-8">
            <img src={backResult} alt="back" className="preview-img" />
            <a href={backResult} download="back.png">
              <button className="btn btn-primary btn-sm mt-8">⬇️ Download Back</button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
