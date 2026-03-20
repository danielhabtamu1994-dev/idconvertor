import { useState, useEffect } from 'react';
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

function NumInput({ value, onChange }) {
  return (
    <input className="form-input" type="number" value={value}
      onChange={e => onChange(parseInt(e.target.value)||0)}
      style={{ padding:'6px 8px', fontSize:13 }} />
  );
}

function SettingsTable({ title, fields, pos, size, onPos, onSize }) {
  return (
    <div className="card">
      <p className="card-title">{title}</p>
      <div className="settings-hdr">
        <span>Field</span><span>X</span><span>Y</span><span>Size</span>
      </div>
      {fields.map(([key, label]) => (
        <div className="settings-row" key={key}>
          <label>{label}</label>
          <NumInput value={pos[`${key}_x`]||0} onChange={v=>onPos(`${key}_x`,v)} />
          <NumInput value={pos[`${key}_y`]||0} onChange={v=>onPos(`${key}_y`,v)} />
          <NumInput value={size[key]||0}         onChange={v=>onSize(key,v)} />
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const [pos,      setPos]      = useState(DEFAULT_POS);
  const [size,     setSize]     = useState(DEFAULT_SIZE);
  const [posBack,  setPosBack]  = useState(DEFAULT_POS_BACK);
  const [sizeBack, setSizeBack] = useState(DEFAULT_SIZE_BACK);
  const [saving, setSaving]     = useState(false);
  const [tab, setTab]           = useState('front');

  useEffect(() => {
    API.get('/settings/').then(({data}) => {
      if (data.pos)       setPos(p  => ({...p,  ...data.pos}));
      if (data.size)      setSize(p => ({...p,  ...data.size}));
      if (data.pos_back)  setPosBack(p  => ({...p, ...data.pos_back}));
      if (data.size_back) setSizeBack(p => ({...p, ...data.size_back}));
    }).catch(()=>{});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await API.put('/settings/', { pos, size, pos_back:posBack, size_back:sizeBack });
      toast.success('Settings saved!');
    } catch(e) { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const resetFront = () => { setPos({...DEFAULT_POS}); setSize({...DEFAULT_SIZE}); };
  const resetBack  = () => { setPosBack({...DEFAULT_POS_BACK}); setSizeBack({...DEFAULT_SIZE_BACK}); };

  const upPos  = (k,v) => setPos(p  => ({...p, [k]:v}));
  const upSize = (k,v) => setSize(p => ({...p, [k]:v}));
  const upPosB = (k,v) => setPosBack(p  => ({...p, [k]:v}));
  const upSzB  = (k,v) => setSizeBack(p => ({...p, [k]:v}));

  const FRONT_FIELDS = [
    ['amh','አማርኛ ስም'],['eng','እንግሊዝኛ ስም'],['dob','የትውልድ ቀን'],
    ['sex','ፆታ'],['exp','ቀን ማብቂያ'],['fan','🔖 FAN (ጽሁፍ)'],
  ];
  const BACK_FIELDS = [
    ['phone','📞 ስልክ'],['fin','🔢 FIN'],
    ['addr_amh','🏠 አድራሻ (አማርኛ)'],['addr_eng','🏠 አድራሻ (Eng)'],
    ['zone_amh','🗺️ ዞን (አማርኛ)'],['zone_eng','🗺️ ዞን (Eng)'],
    ['woreda_amh','📍 ወረዳ (አማርኛ)'],['woreda_amh_num','📍 ወረዳ ቁጥር'],
    ['woreda_eng','📍 ወረዳ (Eng)'],
  ];

  return (
    <div>
      <div className="flex-center gap-12" style={{ marginBottom:20 }}>
        <h1 className="page-title" style={{ margin:0 }}>⚙️ Settings</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save All'}
        </button>
      </div>

      {/* Tab */}
      <div className="flex-center gap-8" style={{ marginBottom:16 }}>
        {['front','back'].map(t => (
          <button key={t} className={`btn ${tab===t?'btn-primary':'btn-outline'}`} onClick={()=>setTab(t)}>
            {t==='front'?'🔵 Front':'🟠 Back'}
          </button>
        ))}
      </div>

      {tab === 'front' && (
        <>
          <SettingsTable title="Front — Text Fields" fields={FRONT_FIELDS}
            pos={pos} size={size} onPos={upPos} onSize={upSize} />

          {/* Barcode special */}
          <div className="card">
            <p className="card-title">📊 FAN Barcode</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[['fan_bc_x','X'],['fan_bc_y','Y'],['fan_bc','Height'],['fan_bc_w','Width']].map(([k,l])=>(
                <div key={k} className="form-group">
                  <label>{l}</label>
                  {k==='fan_bc'
                    ? <NumInput value={size[k]||0}    onChange={v=>upSize(k,v)} />
                    : <NumInput value={pos[k]||0}     onChange={v=>upPos(k,v)} />
                  }
                </div>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div className="card">
            <p className="card-title">📸 ፎቶ</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[['photo_x','X'],['photo_y','Y'],['photo_w','Width'],['photo_h','Height']].map(([k,l])=>(
                <div key={k} className="form-group">
                  <label>{l}</label>
                  <NumInput value={pos[k]||0} onChange={v=>upPos(k,v)} />
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-outline btn-sm" onClick={resetFront}>↩️ Reset Front</button>
        </>
      )}

      {tab === 'back' && (
        <>
          <SettingsTable title="Back — Text Fields" fields={BACK_FIELDS}
            pos={posBack} size={sizeBack} onPos={upPosB} onSize={upSzB} />

          {/* QR */}
          <div className="card">
            <p className="card-title">📷 QR Code</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
              {[['qr_x','X'],['qr_y','Y'],['qr_w','Width'],['qr_h','Height']].map(([k,l])=>(
                <div key={k} className="form-group">
                  <label>{l}</label>
                  <NumInput value={posBack[k]||0} onChange={v=>upPosB(k,v)} />
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-outline btn-sm" onClick={resetBack}>↩️ Reset Back</button>
        </>
      )}
    </div>
  );
}
