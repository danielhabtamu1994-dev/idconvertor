import React, { useState, useRef, useEffect } from 'react';
import { useState, useEffect, useRef } from 'react';
import API from '../services/api';
import toast from 'react-hot-toast';

const DEFAULT_POS = {
  amh_x:620,amh_y:235,eng_x:620,eng_y:268,dob_x:700,dob_y:390,
  sex_x:620,sex_y:470,exp_x:710,exp_y:555,fan_x:575,fan_y:648,
  fan_bc_x:575,fan_bc_y:600,fan_bc_w:300,photo_x:105,photo_y:165,photo_w:190,photo_h:240,
};
const DEFAULT_SIZE = { amh:32,eng:32,dob:28,sex:28,exp:28,fan:28,fan_bc:120 };
const DEFAULT_POS_BACK = {
  phone_x:620,phone_y:200,fin_x:620,fin_y:250,
  addr_amh_x:620,addr_amh_y:300,addr_eng_x:620,addr_eng_y:340,
  zone_amh_x:620,zone_amh_y:380,zone_eng_x:620,zone_eng_y:420,
  woreda_amh_x:620,woreda_amh_y:460,woreda_amh_num_x:750,woreda_amh_num_y:460,
  woreda_eng_x:620,woreda_eng_y:500,qr_x:100,qr_y:150,qr_w:200,qr_h:200,
};
const DEFAULT_SIZE_BACK = {
  phone:28,fin:28,addr_amh:28,addr_eng:28,zone_amh:28,zone_eng:28,
  woreda_amh:28,woreda_amh_num:28,woreda_eng:28,
};
const FRONT_FIELDS = [
  ['amh','አማርኛ ስም'],['eng','እንግሊዝኛ ስም'],['dob','የትውልድ ቀን'],
  ['sex','ፆታ'],['exp','ቀን ማብቂያ'],['fan','🔖 FAN'],
  ['iss_greg','📅 Date of Issue (Eng)'],['iss_et','📅 የተሰጠበት ቀን (አማ)'],
];
const BACK_FIELDS = [
  ['phone','📞 ስልክ'],['fin','🔢 FIN'],
  ['addr_amh','🏠 አድራሻ (አማ)'],['addr_eng','🏠 አድራሻ (Eng)'],
  ['zone_amh','🗺️ ዞን (አማ)'],['zone_eng','🗺️ ዞን (Eng)'],
  ['woreda_amh','📍 ወረዳ (አማ)'],['woreda_amh_num','📍 ወረዳ ቁጥር'],
  ['woreda_eng','📍 ወረዳ (Eng)'],
  ['sn','🔢 SN (7 ዲጂት)'],['nat_am','🌍 ዜግነት (አማ)'],['nat_en','🌍 ዜግነት (Eng)'],
];
const SAMPLE_FRONT = {
  amh:'ዳኒኤል ሀብታሙ',eng:'Daniel Habtamu',dob:'1994-03-21',
  sex:'Male',exp:'2030-03-21',fan:'1462 6858 6588 5576',
  iss_greg:'23/03/2026',iss_et:'14/ሚያዝያ/2018',
};
const SAMPLE_BACK = {
  phone:'0912345678',fin:'1234-5678-9012',addr_amh:'አዲስ አበባ',
  addr_eng:'Addis Ababa',zone_amh:'ቦሌ ዞን',zone_eng:'Bole Zone',
  woreda_amh:'ወረዳ',woreda_amh_num:'08',woreda_eng:'Woreda 08',
  sn:'6123456',nat_am:'ኢትዮጵያዊ',nat_en:'Ethiopian',
};

function N({ value, onChange }) {
  const [local, setLocal] = React.useState(String(value));
  React.useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <input
      inputMode="numeric"
      value={local}
      onChange={e => { const v=e.target.value.replace(/[^0-9]/g,''); setLocal(v); }}
      onBlur={() => { const n=parseInt(local)||0; setLocal(String(n)); onChange(n); }}
      style={{ width:'100%',padding:'5px 6px',border:'1.5px solid var(--border)',borderRadius:6,fontSize:12,outline:'none' }}
    />
  );
}

function PreviewCanvas({ tab, pos, size, posBack, sizeBack, bgFront, bgBack }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const bg  = tab==='front' ? bgFront : bgBack;
    // BG_W/BG_H = actual background image dimensions
    const BG_W = 3264, BG_H = 1854;

    const draw = (s) => {
      ctx.textBaseline='top';
      if (tab==='front') {
        [['amh',SAMPLE_FRONT.amh],['eng',SAMPLE_FRONT.eng],['dob',SAMPLE_FRONT.dob],
         ['sex',SAMPLE_FRONT.sex],['exp',SAMPLE_FRONT.exp]].forEach(([k,t])=>{
          ctx.fillStyle='rgba(45,25,5,.9)'; ctx.font=`bold ${(size[k]||28)*s}px Inter`;
          ctx.fillText(t,pos[`${k}_x`]*s,pos[`${k}_y`]*s);
        });
        // iss_greg and iss_et — rotated 90° like real ID
        [[' iss_greg',SAMPLE_FRONT.iss_greg],['iss_et',SAMPLE_FRONT.iss_et]].forEach(([k,t])=>{
          const fz = (size[k.trim()]||22)*s;
          const x  = pos[`${k.trim()}_x`]*s;
          const y  = pos[`${k.trim()}_y`]*s;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-Math.PI/2);
          ctx.fillStyle='rgba(45,25,5,.9)'; ctx.font=`bold ${fz}px Inter`;
          ctx.fillText(t, 0, 0);
          ctx.restore();
        });
        // FAN
        ctx.fillStyle='rgba(45,25,5,.9)'; ctx.font=`bold ${(size.fan||28)*s}px Inter`;
        ctx.fillText(SAMPLE_FRONT.fan, pos.fan_x*s, pos.fan_y*s);
        // barcode placeholder
        const bx=pos.fan_bc_x*s,by=pos.fan_bc_y*s,bw=(pos.fan_bc_w||300)*s,bh=(size.fan_bc||120)*s;
        ctx.fillStyle='#000';
        for(let i=0;i<30;i++){if(i%3===0)continue;ctx.fillRect(bx+(bw/30)*i,by,(bw/30)*.7,bh);}
        // photo placeholder
        ctx.fillStyle='rgba(100,116,139,.25)';
        ctx.fillRect(pos.photo_x*s,pos.photo_y*s,pos.photo_w*s,pos.photo_h*s);
        ctx.fillStyle='#64748b';ctx.font=`${11*s}px Inter`;ctx.textAlign='center';
        ctx.fillText('ፎቶ',(pos.photo_x+pos.photo_w/2)*s,(pos.photo_y+pos.photo_h/2)*s);
        ctx.textAlign='left';
      } else {
        [['phone',SAMPLE_BACK.phone],['fin',SAMPLE_BACK.fin],
         ['addr_amh',SAMPLE_BACK.addr_amh],['addr_eng',SAMPLE_BACK.addr_eng],
         ['zone_amh',SAMPLE_BACK.zone_amh],['zone_eng',SAMPLE_BACK.zone_eng],
         ['woreda_amh',SAMPLE_BACK.woreda_amh],['woreda_amh_num',SAMPLE_BACK.woreda_amh_num],
         ['woreda_eng',SAMPLE_BACK.woreda_eng],
         ['sn',SAMPLE_BACK.sn],['nat_am',SAMPLE_BACK.nat_am],['nat_en',SAMPLE_BACK.nat_en]].forEach(([k,t])=>{
          const xk=k==='woreda_amh_num'?'woreda_amh_num_x':`${k}_x`;
          const yk=k==='woreda_amh_num'?'woreda_amh_num_y':`${k}_y`;
          ctx.fillStyle='rgba(45,25,5,.9)';ctx.font=`bold ${(sizeBack[k]||28)*s}px Inter`;
          ctx.fillText(t,posBack[xk]*s,posBack[yk]*s);
        });
        ctx.fillStyle='rgba(0,0,0,.12)';
        ctx.fillRect(posBack.qr_x*s,posBack.qr_y*s,posBack.qr_w*s,posBack.qr_h*s);
        ctx.fillStyle='#334155';ctx.font=`${12*s}px Inter`;ctx.textAlign='center';
        ctx.fillText('QR',(posBack.qr_x+posBack.qr_w/2)*s,(posBack.qr_y+posBack.qr_h/2)*s);
        ctx.textAlign='left';
      }
    };

    if (!bg) {
      const s = c.width / BG_W;
      c.height = BG_H * s;
      ctx.fillStyle='#e2e8f0'; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle='#94a3b8'; ctx.font='13px Inter'; ctx.textAlign='center';
      ctx.fillText('Background ምስል ያስገቡ', c.width/2, 20);
      ctx.textAlign='left';
      draw(s);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const s = c.width/img.naturalWidth;
      c.height = img.naturalHeight*s;
      ctx.drawImage(img,0,0,c.width,c.height);
      draw(s);
    };
    img.src=bg;
  },[tab,pos,size,posBack,sizeBack,bgFront,bgBack]);
  return <canvas ref={ref} width={480} style={{width:'100%',borderRadius:8,border:'1px solid var(--border)'}}/>;
}

export default function Settings() {
  const [pos,      setPos]      = useState(DEFAULT_POS);
  const [size,     setSize]     = useState(DEFAULT_SIZE);
  const [posBack,  setPosBack]  = useState(DEFAULT_POS_BACK);
  const [sizeBack, setSizeBack] = useState(DEFAULT_SIZE_BACK);
  const [depSettings, setDepSettings] = useState({ telebirr_phone:'', account_name:'' });
  const [saving,   setSaving]   = useState(false);
  const [tab,      setTab]      = useState('front');
  const [bgFront,  setBgFront]  = useState('');
  const [bgBack,   setBgBack]   = useState('');
  const [natAm,    setNatAm]    = useState('ኢትዮጵያዊ');
  const [natEn,    setNatEn]    = useState('Ethiopian');
  const [ocrMode,  setOcrMode]  = useState('normal');
  const [geminiKey,setGeminiKey]= useState('');
  const fgRef = useRef(); const bgRef = useRef();

  useEffect(()=>{
    API.get('/settings/').then(({data})=>{
      if(data.pos)       setPos(p=>({...p,...data.pos}));
      if(data.size)      setSize(p=>({...p,...data.size}));
      if(data.pos_back)  setPosBack(p=>({...p,...data.pos_back}));
      if(data.size_back) setSizeBack(p=>({...p,...data.size_back}));
      if(data.nat_am)    setNatAm(data.nat_am);
      if(data.nat_en)    setNatEn(data.nat_en);
    // Load API settings separately
    API.get('/settings/api-settings').then(({data:a})=>{
      if(a.ocr_mode)   setOcrMode(a.ocr_mode);
      if(a.gemini_key) setGeminiKey(a.gemini_key);
    }).catch(()=>{});
    }).catch(()=>{});
    API.get('/auth/deposit-settings').then(({data})=>{
      setDepSettings(data);
    }).catch(()=>{});
  },[]);

  const save = async()=>{
    setSaving(true);
    try{
      await API.put('/settings/',{pos,size,pos_back:posBack,size_back:sizeBack,nat_am:natAm,nat_en:natEn});
      toast.success('✅ Settings saved!');
    }catch{ toast.error('Save failed'); }
    finally{ setSaving(false); }
  };

  const saveDepSettings = async()=>{
    try{
      await API.put('/auth/deposit-settings', depSettings);
      toast.success('✅ Deposit settings saved!');
    }catch{ toast.error('Failed'); }
  };

  const saveApiSettings = async () => {
    try {
      await API.put('/settings/api-settings', { ocr_mode: ocrMode, gemini_key: geminiKey });
      toast.success('✅ API Settings saved!');
    } catch { toast.error('Failed'); }
  };

  const loadBg=(file,setter)=>{
    if(!file) return;
    const r=new FileReader();
    r.onload=e=>setter(e.target.result);
    r.readAsDataURL(file);
  };

  const upPos =(k,v)=>setPos(p=>({...p,[k]:v}));
  const upSz  =(k,v)=>setSize(p=>({...p,[k]:v}));
  const upPosB=(k,v)=>setPosBack(p=>({...p,[k]:v}));
  const upSzB =(k,v)=>setSizeBack(p=>({...p,[k]:v}));

  const FieldGrid=({fields,isBack})=>(
    <div style={{display:'grid',gridTemplateColumns:'auto 58px 58px 58px',gap:5,fontSize:12,alignItems:'center'}}>
      {['Field','X','Y','Size'].map(h=><span key={h} style={{fontWeight:700,color:'var(--text-muted)',fontSize:11}}>{h}</span>)}
      {fields.map(([key,label])=>{
        const xKey = key==='woreda_amh_num'?'woreda_amh_num_x':`${key}_x`;
        const yKey = key==='woreda_amh_num'?'woreda_amh_num_y':`${key}_y`;
        return (
          <React.Fragment key={key}>
            <span style={{fontSize:12,paddingRight:6}}>{label}</span>
            <N key={key+'_x'} value={isBack?posBack[xKey]:pos[`${key}_x`]}
               onChange={v=>isBack?upPosB(xKey,v):upPos(`${key}_x`,v)}/>
            <N key={key+'_y'} value={isBack?posBack[yKey]:pos[`${key}_y`]}
               onChange={v=>isBack?upPosB(yKey,v):upPos(`${key}_y`,v)}/>
            <N key={key+'_sz'} value={isBack?sizeBack[key]:size[key]}
               onChange={v=>isBack?upSzB(key,v):upSz(key,v)}/>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <h1 className="page-title" style={{margin:0}}>⚙️ Settings</h1>
        <div style={{display:'flex',gap:8,marginLeft:'auto',flexWrap:'wrap'}}>
          {['front','back','deposit','api'].map(t=>(
            <button key={t} className={`btn btn-sm ${tab===t?'btn-primary':'btn-outline'}`} onClick={()=>setTab(t)}>
              {t==='front'?'🔵 Front':t==='back'?'🟠 Back':t==='deposit'?'💰 Deposit':'🤖 API'}
            </button>
          ))}
          {tab!=='deposit' && tab!=='api' && (
            <button className="btn btn-success btn-sm" onClick={save} disabled={saving}>
              {saving?'⏳...':'💾 Save'}
            </button>
          )}
        </div>
      </div>

      {/* API Settings tab */}
      {tab==='api' && (
        <div className="card" style={{maxWidth:480}}>
          <p className="card-title">🤖 OCR Mode</p>

          {/* Mode toggle */}
          <div style={{display:'flex',gap:10,marginBottom:20}}>
            {['normal','gemini'].map(m=>(
              <button key={m}
                className={`btn btn-sm ${ocrMode===m?'btn-primary':'btn-outline'}`}
                style={{flex:1,padding:'10px 0',fontSize:13}}
                onClick={()=>setOcrMode(m)}>
                {m==='normal'?'1️⃣ Normal (Tesseract)':'2️⃣ API (Gemini)'}
              </button>
            ))}
          </div>

          {/* Gemini key input — only when gemini selected */}
          {ocrMode==='gemini' && (
            <div className="form-group">
              <label>🔑 Gemini API Key</label>
              <input className="form-input"
                type="password"
                placeholder="AIza..."
                value={geminiKey}
                onChange={e=>setGeminiKey(e.target.value)}/>
              <p style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                Google AI Studio → <strong>makersuite.google.com</strong> → Get API Key
              </p>
            </div>
          )}

          {ocrMode==='normal' && (
            <div style={{background:'var(--bg)',borderRadius:8,padding:12,fontSize:12,color:'var(--text-muted)'}}>
              ✅ Tesseract OCR — free, works offline. Accuracy depends on image quality.
            </div>
          )}

          <button className="btn btn-primary" style={{marginTop:12}} onClick={saveApiSettings}>
            💾 Save API Settings
          </button>
        </div>
      )}

      {/* Deposit settings tab */}
      {tab==='deposit' && (
        <div className="card" style={{maxWidth:440}}>
          <p className="card-title">💰 Deposit Settings</p>
          <div className="form-group">
            <label>Telebirr ስልክ ቁጥር</label>
            <input className="form-input" placeholder="09xxxxxxxx"
              value={depSettings.telebirr_phone}
              onChange={e=>setDepSettings(p=>({...p,telebirr_phone:e.target.value}))}/>
          </div>
          <div className="form-group">
            <label>Account Name</label>
            <input className="form-input" placeholder="ዳኒኤል ሀብታሙ"
              value={depSettings.account_name}
              onChange={e=>setDepSettings(p=>({...p,account_name:e.target.value}))}/>
          </div>
          <button className="btn btn-primary" onClick={saveDepSettings}>💾 Save</button>
        </div>
      )}

      {/* Front / Back tabs — 2 column layout */}
      {(tab==='front'||tab==='back') && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>
          {/* Controls */}
          <div>
            {/* BG upload */}
            <div className="card">
              <p className="card-title">🖼️ Background ምስል</p>
              <input ref={tab==='front'?fgRef:bgRef} type="file" accept="image/*" style={{display:'none'}}
                onChange={e=>loadBg(e.target.files[0], tab==='front'?setBgFront:setBgBack)}/>
              <button className="btn btn-outline btn-sm"
                onClick={()=>(tab==='front'?fgRef:bgRef).current.click()}>
                📁 ምስል ምረጥ
              </button>
            </div>

            {/* Nationality defaults (back tab only) */}
            {tab==='back' && (
              <div className="card">
                <p className="card-title">🌍 ዜግነት Default</p>
                <div style={{display:'grid',gap:8}}>
                  <div>
                    <p style={{fontSize:11,marginBottom:3,color:'var(--text-muted)'}}>አማርኛ</p>
                    <input className="form-input" value={natAm} onChange={e=>setNatAm(e.target.value)} placeholder="ኢትዮጵያዊ"/>
                  </div>
                  <div>
                    <p style={{fontSize:11,marginBottom:3,color:'var(--text-muted)'}}>English</p>
                    <input className="form-input" value={natEn} onChange={e=>setNatEn(e.target.value)} placeholder="Ethiopian"/>
                  </div>
                </div>
              </div>
            )}

            {/* Text fields */}
            <div className="card">
              <p className="card-title">📝 Text Fields</p>
              <FieldGrid fields={tab==='front'?FRONT_FIELDS:BACK_FIELDS} isBack={tab==='back'}/>
            </div>

            {tab==='front' && (<>
              {/* Barcode */}
              <div className="card">
                <p className="card-title">📊 FAN Barcode</p>
                <div style={{display:'grid',gridTemplateColumns:'auto 58px 58px 58px',gap:5,fontSize:12,alignItems:'center'}}>
                  {['Field','X','Y','H/W'].map(h=><span key={h} style={{fontWeight:700,color:'var(--text-muted)',fontSize:11}}>{h}</span>)}
                  <span>Position</span><N value={pos.fan_bc_x} onChange={v=>upPos('fan_bc_x',v)}/><N value={pos.fan_bc_y} onChange={v=>upPos('fan_bc_y',v)}/><span/>
                  <span>Height</span><span/><span/><N value={size.fan_bc} onChange={v=>upSz('fan_bc',v)}/>
                  <span>Width</span><N value={pos.fan_bc_w} onChange={v=>upPos('fan_bc_w',v)}/><span/><span/>
                </div>
              </div>
              {/* Photo */}
              <div className="card">
                <p className="card-title">📸 ፎቶ</p>
                <div style={{display:'grid',gridTemplateColumns:'auto 58px 58px 58px',gap:5,fontSize:12,alignItems:'center'}}>
                  {['Field','X','Y','W/H'].map(h=><span key={h} style={{fontWeight:700,color:'var(--text-muted)',fontSize:11}}>{h}</span>)}
                  <span>Position</span><N value={pos.photo_x} onChange={v=>upPos('photo_x',v)}/><N value={pos.photo_y} onChange={v=>upPos('photo_y',v)}/><span/>
                  <span>Width</span><N value={pos.photo_w} onChange={v=>upPos('photo_w',v)}/><span/><span/>
                  <span>Height</span><span/><span/><N value={pos.photo_h} onChange={v=>upPos('photo_h',v)}/>
                </div>
              </div>
            </>)}

            {tab==='back' && (
              <div className="card">
                <p className="card-title">📷 QR Code</p>
                <div style={{display:'grid',gridTemplateColumns:'auto 58px 58px 58px',gap:5,fontSize:12,alignItems:'center'}}>
                  {['Field','X','Y','W/H'].map(h=><span key={h} style={{fontWeight:700,color:'var(--text-muted)',fontSize:11}}>{h}</span>)}
                  <span>Position</span><N value={posBack.qr_x} onChange={v=>upPosB('qr_x',v)}/><N value={posBack.qr_y} onChange={v=>upPosB('qr_y',v)}/><span/>
                  <span>Width</span><N value={posBack.qr_w} onChange={v=>upPosB('qr_w',v)}/><span/><span/>
                  <span>Height</span><span/><span/><N value={posBack.qr_h} onChange={v=>upPosB('qr_h',v)}/>
                </div>
              </div>
            )}

            <button className="btn btn-outline btn-sm"
              onClick={()=>tab==='front'?(setPos({...DEFAULT_POS}),setSize({...DEFAULT_SIZE})):(setPosBack({...DEFAULT_POS_BACK}),setSizeBack({...DEFAULT_SIZE_BACK}))}>
              ↩️ Reset
            </button>
          </div>

          {/* Live preview */}
          <div style={{position:'sticky',top:76}}>
            <div className="card">
              <p className="card-title">👁️ Live Preview</p>
              <PreviewCanvas tab={tab} pos={pos} size={size} posBack={posBack} sizeBack={sizeBack} bgFront={bgFront} bgBack={bgBack}/>
              <p className="text-sm text-muted mt-8" style={{textAlign:'center'}}>Sample data ተጠቅሞ ያሳያሉ</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
