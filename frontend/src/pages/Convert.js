import { useState, useRef, useEffect } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

function UploadBox({ label, file, onChange, loading }) {
  const ref = useRef();
  return (
    <div>
      <p style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{label}</p>
      <div className={`upload-box ${file?'has-file':''}`} onClick={() => !loading && ref.current.click()}>
        <div style={{ fontSize:28 }}>{loading ? '⏳' : file ? '✅' : '📁'}</div>
        <p style={{ fontSize:12 }}>{loading ? 'Processing...' : file ? file.name : 'Click to upload'}</p>
        <input ref={ref} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => onChange(e.target.files[0])} />
      </div>
    </div>
  );
}

export default function Convert() {
  const [frontFile,   setFrontFile]   = useState(null);
  const [backFile,    setBackFile]    = useState(null);
  const [profileFile, setProfileFile] = useState(null);

  const [frontLines, setFrontLines] = useState([]);
  const [backLines,  setBackLines]  = useState([]);
  const [fn, setFn] = useState({ amh_n:5, eng_n:6, dob_n:8, sex_n:10, exp_n:12 });
  const [bn, setBn] = useState({ phone_n:3, fin_n:5, addr_amh_n:7, addr_eng_n:8, zone_amh_n:9, zone_eng_n:10, woreda_amh_n:11, woreda_eng_n:12 });

  const [fanManual, setFanManual] = useState('');
  const [finManual, setFinManual] = useState('');

  const [photob64,     setPhotob64]     = useState('');
  const [qrb64,        setQrb64]        = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [qrPreview,    setQrPreview]    = useState('');

  const [frontResult, setFrontResult] = useState('');
  const [backResult,  setBackResult]  = useState('');

  const [loading, setLoading] = useState({});
  const setLoad = (k,v) => setLoading(p => ({...p,[k]:v}));

  // ── Auto OCR front when file selected ─────────────────────────
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
        if (d.full_name)   setFn(p => ({...p, amh_n:d.full_name, eng_n:d.full_name+1}));
        if (d.date_birth)  setFn(p => ({...p, dob_n:d.date_birth}));
        if (d.sex)         setFn(p => ({...p, sex_n:d.sex}));
        if (d.date_expiry) setFn(p => ({...p, exp_n:d.date_expiry}));
        if (d.fan) setFanManual((data.lines[d.fan-1]||'').replace(/\D/g,''));
        toast.success('Front OCR ተሳካ ✅');
      } catch { toast.error('Front OCR failed'); }
      finally { setLoad('ocr_front', false); }
    })();
  }, [frontFile]);

  // ── Auto OCR back when file selected ──────────────────────────
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
        if (d.phone)       setBn(p => ({...p, phone_n:d.phone}));
        if (d.fin) { setBn(p => ({...p, fin_n:d.fin})); setFinManual((data.lines[d.fin-1]||'').replace(/\D/g,'')); }
        if (d.addr_amh)    setBn(p => ({...p, addr_amh_n:d.addr_amh}));
        if (d.addr_eng)    setBn(p => ({...p, addr_eng_n:d.addr_eng}));
        if (d.zone_amh)    setBn(p => ({...p, zone_amh_n:d.zone_amh}));
        if (d.zone_eng)    setBn(p => ({...p, zone_eng_n:d.zone_eng}));
        if (d.woreda_amh)  setBn(p => ({...p, woreda_amh_n:d.woreda_amh}));
        if (d.woreda_eng)  setBn(p => ({...p, woreda_eng_n:d.woreda_eng}));
        toast.success('Back OCR ተሳካ ✅');
      } catch { toast.error('Back OCR failed'); }
      finally { setLoad('ocr_back', false); }
    })();
  }, [backFile]);

  // ── Auto crop profile when file selected ──────────────────────
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
        setPhotoPreview(`data:image/png;base64,${data.photo_b64}`);
        setQrPreview(`data:image/png;base64,${data.qr_b64}`);
        toast.success('ፎቶ እና QR ተቆረጠ ✅');
      } catch { toast.error('Crop failed'); }
      finally { setLoad('crop', false); }
    })();
  }, [profileFile]);

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
      setFrontResult(URL.createObjectURL(resp.data));
      toast.success('Front ID ተዘጋጀ! 🎉');
    } catch { toast.error('Generate failed'); }
    finally { setLoad('gen_front', false); }
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
      setBackResult(URL.createObjectURL(resp.data));
      toast.success('Back ID ተዘጋጀ! 🎉');
    } catch { toast.error('Generate failed'); }
    finally { setLoad('gen_back', false); }
  };

  const pv = (lines, n) => lines[n-1] || '—';

  return (
    <div>
      <h1 className="page-title">🪪 ID Convert</h1>

      {/* Upload Row */}
      <div className="card">
        <p className="card-title">ምስሎች ያስገቡ</p>
        <div className="grid-3">
          <UploadBox label="📸 ID Front"      file={frontFile}   loading={loading.ocr_front} onChange={setFrontFile} />
          <UploadBox label="📸 ID Back"       file={backFile}    loading={loading.ocr_back}  onChange={setBackFile} />
          <UploadBox label="📷 Profile & QR"  file={profileFile} loading={loading.crop}       onChange={setProfileFile} />
        </div>

        {/* Photo + QR preview */}
        {(photoPreview || qrPreview) && (
          <div className="grid-2 mt-8">
            {photoPreview && (
              <div>
                <p className="text-sm text-muted" style={{ marginBottom:4 }}>✅ ፎቶ</p>
                <img src={photoPreview} alt="photo" className="preview-img" style={{ maxHeight:140, objectFit:'contain' }}/>
              </div>
            )}
            {qrPreview && (
              <div>
                <p className="text-sm text-muted" style={{ marginBottom:4 }}>✅ QR Code</p>
                <img src={qrPreview} alt="qr" className="preview-img" style={{ maxHeight:140, objectFit:'contain' }}/>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAN / FIN side by side */}
      <div className="card">
        <p className="card-title">🔖 FAN &amp; FIN</p>
        <div className="grid-2">
          <div className="form-group">
            <label>🔖 FAN (16 ዲጂት — ID Front)</label>
            <input className="form-input" placeholder="1234567890123456"
              value={fanManual} onChange={e => setFanManual(e.target.value.replace(/\D/g,''))} maxLength={16}/>
            <p className="text-sm text-muted mt-8">{fanManual.length}/16</p>
          </div>
          <div className="form-group">
            <label>🔢 FIN (12 ዲጂት — ID Back)</label>
            <input className="form-input" placeholder="123456789012"
              value={finManual} onChange={e => setFinManual(e.target.value.replace(/\D/g,''))} maxLength={12}/>
            <p className="text-sm text-muted mt-8">{finManual.length}/12</p>
          </div>
        </div>
      </div>

      {/* Generate Buttons */}
      <div className="grid-2">
        <div className="card">
          <p className="card-title">🔵 Front ID</p>
          {frontLines.length > 0 && (
            <div style={{ fontSize:12, marginBottom:12, color:'var(--text-muted)' }}>
              {[['አማርኛ ስም',fn.amh_n],['እንግሊዝኛ ስም',fn.eng_n],['የትውልድ ቀን',fn.dob_n],['ፆታ',fn.sex_n],['ቀን ማብቂያ',fn.exp_n]].map(([l,n])=>(
                <div key={l}>• {l}: <strong>{pv(frontLines,n)}</strong></div>
              ))}
            </div>
          )}
          <button className="btn btn-success btn-full" onClick={genFront} disabled={loading.gen_front}>
            {loading.gen_front ? '⏳ Generating...' : '✅ Front ID አዘጋጅ'}
          </button>
          {frontResult && (
            <div className="mt-8">
              <img src={frontResult} alt="front" className="preview-img"/>
              <a href={frontResult} download="front.png">
                <button className="btn btn-primary btn-sm mt-8">⬇️ Download</button>
              </a>
            </div>
          )}
        </div>

        <div className="card">
          <p className="card-title">🟠 Back ID</p>
          {backLines.length > 0 && (
            <div style={{ fontSize:12, marginBottom:12, color:'var(--text-muted)' }}>
              {[['ስልክ',bn.phone_n],['አድራሻ (አማ)',bn.addr_amh_n],['ዞን (አማ)',bn.zone_amh_n],['ወረዳ',bn.woreda_amh_n]].map(([l,n])=>(
                <div key={l}>• {l}: <strong>{pv(backLines,n)}</strong></div>
              ))}
            </div>
          )}
          <button className="btn btn-success btn-full" onClick={genBack} disabled={loading.gen_back}>
            {loading.gen_back ? '⏳ Generating...' : '✅ Back ID አዘጋጅ'}
          </button>
          {backResult && (
            <div className="mt-8">
              <img src={backResult} alt="back" className="preview-img"/>
              <a href={backResult} download="back.png">
                <button className="btn btn-primary btn-sm mt-8">⬇️ Download</button>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
