from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from routes.auth import verify_token
from firebase import firebase_get
from PIL import Image, ImageDraw, ImageFont
import cv2, numpy as np, io, os, requests as req_lib, barcode
from barcode.writer import ImageWriter

router = APIRouter()

FONT_AMH     = os.getenv("FONT_AMH",     "AbyssinicaSIL-Regular.ttf")
FONT_ENG     = os.getenv("FONT_ENG",     "Inter_18pt-Bold.ttf")
BG_PATH      = os.getenv("BG_PATH",      "20260319_215211.jpg")
BG_PATH_BACK = os.getenv("BG_PATH_BACK", "20260319_211337.jpg")
REMOVE_BG_KEY = os.getenv("REMOVE_BG_KEY", "")

# ── Font cache ───────────────────────────────────────────────────
_font_cache = {}
def get_font(path, size):
    key = (path, size)
    if key not in _font_cache:
        try:    _font_cache[key] = ImageFont.truetype(path, size)
        except: _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]

# ── Background image cache ───────────────────────────────────────
_bg_front_cache = None
_bg_back_cache  = None

def get_bg_front():
    global _bg_front_cache
    if _bg_front_cache is None:
        _bg_front_cache = Image.open(BG_PATH).convert("RGB")
    return _bg_front_cache.copy()

def get_bg_back():
    global _bg_back_cache
    if _bg_back_cache is None:
        _bg_back_cache = Image.open(BG_PATH_BACK).convert("RGB")
    return _bg_back_cache.copy()

# ── Helpers ──────────────────────────────────────────────────────
def is_ethiopic(char):
    cp = ord(char)
    return 0x1200 <= cp <= 0x137F or 0xAB00 <= cp <= 0xAB2F

def draw_smart_text(draw, pos, text, size_amh=32, size_eng=28, fill=(45,25,5)):
    f_amh = get_font(FONT_AMH, size_amh)
    f_eng = get_font(FONT_ENG, size_eng)
    x, y  = pos
    if not text: return
    cur_script = 'amh' if is_ethiopic(text[0]) else 'eng'
    cur_seg    = text[0]
    segments   = []
    for ch in text[1:]:
        script = 'amh' if is_ethiopic(ch) else 'eng'
        if script == cur_script:
            cur_seg += ch
        else:
            segments.append((cur_script, cur_seg))
            cur_script, cur_seg = script, ch
    segments.append((cur_script, cur_seg))
    for script, seg in segments:
        font = f_amh if script == 'amh' else f_eng
        draw.text((x, y), seg, font=font, fill=fill)
        bbox = font.getbbox(seg)
        x += bbox[2] - bbox[0]

def generate_barcode_image(data: str, height_px: int = 120):
    try:
        CODE128 = barcode.get_barcode_class('code128')
        buf     = io.BytesIO()
        CODE128(data, writer=ImageWriter()).write(buf, options={
            'write_text': False, 'module_height': max(5, height_px/10),
            'module_width': 0.5, 'quiet_zone': 1.0, 'dpi': 200,
        })
        buf.seek(0)
        img   = Image.open(buf).convert("RGB")
        w, h  = img.size
        return img.resize((int(w*height_px/h), height_px), Image.LANCZOS)
    except:
        return None

def auto_detect_fields(lines):
    KEYWORDS = {
        'full_name':   ['full name','ሙሉ ስም','fullname'],
        'date_birth':  ['date of birth','date of berth','የትውልድ ቀን'],
        'sex':         ['sex','ፆታ'],
        'date_expiry': ['date of expiry','date of expire','የሚያበቃበት ቀን','expiry'],
    }
    found = {}
    for i, line in enumerate(lines):
        ll = line.lower().strip()
        if 'fan' not in found:
            d = ''.join(c for c in line.strip() if c.isdigit())
            if len(d) == 16: found['fan'] = i+1
        for field, kws in KEYWORDS.items():
            if field in found: continue
            for kw in kws:
                if kw in ll:
                    if i+2 <= len(lines): found[field] = i+2
                    break
    return found

def auto_detect_fields_back(lines):
    found = {}
    addr_anchor = None
    for i, line in enumerate(lines):
        s = line.strip(); ll = s.lower()
        if 'phone' not in found:
            d = ''.join(c for c in s if c.isdigit())
            if len(d) == 10: found['phone'] = i+1
        if 'fin' not in found:
            d = ''.join(c for c in s if c.isdigit())
            if len(d) == 12: found['fin'] = i+1
        if addr_anchor is None and ('address' in ll or 'አድራሻ' in s):
            addr_anchor = i
    if addr_anchor is not None:
        def si(off):
            idx = addr_anchor + off
            return idx+1 if idx < len(lines) else None
        found.update({'addr_amh':si(2),'addr_eng':si(3),'zone_amh':si(4),
                      'zone_eng':si(5),'woreda_amh':si(6),'woreda_eng':si(7)})
    return found

def remove_background(img_bgr):
    if not REMOVE_BG_KEY: return None
    try:
        _, buf = cv2.imencode('.png', img_bgr)
        resp = req_lib.post(
            "https://api.remove.bg/v1.0/removebg",
            files={"image_file": ("photo.png", buf.tobytes(), "image/png")},
            data={"size": "auto"},
            headers={"X-Api-Key": REMOVE_BG_KEY},
            timeout=30,
        )
        if resp.status_code == 200:
            pil  = Image.open(io.BytesIO(resp.content)).convert("RGBA")
            gray = pil.convert('L')
            _, _, _, a = pil.split()
            bw   = Image.merge('RGBA', (gray, gray, gray, a))
            return cv2.cvtColor(np.array(bw), cv2.COLOR_RGBA2BGRA)
    except: pass
    return None

def extract_white_card(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, wm = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    k = np.ones((15,15), np.uint8)
    wm = cv2.morphologyEx(wm, cv2.MORPH_CLOSE, k)
    wm = cv2.morphologyEx(wm, cv2.MORPH_OPEN,  k)
    cnts, _ = cv2.findContours(wm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return None
    x,y,w,h = cv2.boundingRect(max(cnts, key=cv2.contourArea))
    return img[y:y+h, x:x+w]

def crop_photo_from_card(card):
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    ch, cw = card.shape[:2]
    rm = np.mean(gray, axis=1)
    crow = np.where(rm < 220)[0]
    if len(crow) == 0: return card[:ch//2,:]
    gaps = np.diff(crow)
    if len(gaps) > 0 and np.max(gaps) > 10:
        si  = np.argmax(gaps)
        top = max(0, crow[0]-5); bot = min(ch, crow[si]+5)
        crop = card[top:bot,:]
        cm = np.mean(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), axis=0)
        lc = next((j for j in range(len(cm)) if cm[j]<220), 0)
        rc = next((j for j in range(len(cm)-1,-1,-1) if cm[j]<220), len(cm)-1)
        crop = crop[:,lc:rc+1]
    else:
        crop = card[:ch//2,:]
    ph, pw = crop.shape[:2]
    return crop[5:ph-5, 5:pw-5]

def crop_qr_from_card(card, margin=18):
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    ch, cw = card.shape[:2]
    rm   = np.mean(gray, axis=1)
    crow = np.where(rm < 220)[0]
    if len(crow) == 0: return card[ch//2:,:]
    gaps = np.diff(crow)
    if len(gaps) > 0 and np.max(gaps) > 10:
        si  = np.argmax(gaps)
        top = max(0, crow[si+1]-5); bot = min(ch, crow[-1]+5)
        qr  = card[top:bot,:]
        cm  = np.mean(cv2.cvtColor(qr, cv2.COLOR_BGR2GRAY), axis=0)
        lc  = next((j for j in range(len(cm)) if cm[j]<220), 0)
        rc  = next((j for j in range(len(cm)-1,-1,-1) if cm[j]<220), len(cm)-1)
        tight = qr[:,lc:rc+1]
        th, tw = tight.shape[:2]
        canvas = np.ones((th+margin*2, tw+margin*2, 3), np.uint8)*255
        canvas[margin:margin+th, margin:margin+tw] = tight
        return canvas
    return card[ch//2:,:]

# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════
import pytesseract

@router.post("/ocr/front")
async def ocr_front(file: UploadFile = File(...), token=Depends(verify_token)):
    data    = await file.read()
    img     = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    h, w    = img.shape[:2]
    id_only = img[int(h*0.18):int(h*0.85), int(w*0.10):int(w*0.90)]
    gray    = cv2.cvtColor(id_only, cv2.COLOR_BGR2GRAY)
    text    = pytesseract.image_to_string(gray, lang='amh+eng')
    lines   = [l.strip() for l in text.split('\n') if len(l.strip()) > 1]
    return {"lines": lines, "detected": auto_detect_fields(lines)}

@router.post("/ocr/back")
async def ocr_back(file: UploadFile = File(...), token=Depends(verify_token)):
    data    = await file.read()
    img     = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    h, w    = img.shape[:2]
    id_only = img[int(h*0.18):int(h*0.85), int(w*0.10):int(w*0.90)]
    gray    = cv2.cvtColor(id_only, cv2.COLOR_BGR2GRAY)
    text    = pytesseract.image_to_string(gray, lang='amh+eng')
    lines   = [l.strip() for l in text.split('\n') if len(l.strip()) > 1]
    return {"lines": lines, "detected": auto_detect_fields_back(lines)}

@router.post("/profile/crop")
async def crop_profile(file: UploadFile = File(...), token=Depends(verify_token)):
    import base64
    data  = await file.read()
    img   = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    _card = extract_white_card(img)
    card  = _card if _card is not None else img


    photo_crop = crop_photo_from_card(card)
    qr_crop    = crop_qr_from_card(card)

    bgra = remove_background(photo_crop)
    if bgra is None:
        gray = cv2.cvtColor(photo_crop, cv2.COLOR_BGR2GRAY)
        bw   = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        bgra = cv2.cvtColor(bw, cv2.COLOR_BGR2BGRA)
        bgra[:,:,3] = 255

    photo_pil = Image.fromarray(cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA), 'RGBA')
    photo_buf = io.BytesIO(); photo_pil.save(photo_buf, format="PNG")

    qr_pil = Image.fromarray(cv2.cvtColor(qr_crop, cv2.COLOR_BGR2RGB))
    qr_buf = io.BytesIO(); qr_pil.save(qr_buf, format="PNG")

    return {
        "photo_b64": base64.b64encode(photo_buf.getvalue()).decode(),
        "qr_b64":    base64.b64encode(qr_buf.getvalue()).decode(),
    }


def gregorian_to_ethiopian(year, month, day):
    import datetime as _dt2
    d  = _dt2.date(year, month, day)
    ny = _dt2.date(year, 9, 11)
    if d < ny:
        et_year = year - 8
        ny      = _dt2.date(year - 1, 9, 11)
    else:
        et_year = year - 7
    delta    = (d - ny).days
    et_month = delta // 30 + 1
    et_day   = delta % 30 + 1
    # Ethiopian: day/month_number/year  e.g. 14/07/2018
    et_str = f"{et_day:02d}/{et_month:02d}/{et_year}"
    # Gregorian with word month e.g. 23/Mar/2026
    ENG_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    greg_str = f"{day:02d}/{ENG_MONTHS[month-1]}/{year}"
    return et_str, greg_str

@router.post("/generate/front")
async def generate_front(
    photo_b64:  str = Form(...),
    fan_digits: str = Form(""),
    field_nums: str = Form("{}"),
    ocr_lines:  str = Form("[]"),
    token=Depends(verify_token)
):
    import json, base64, datetime as _dt
    fn    = json.loads(field_nums)
    lines = json.loads(ocr_lines)
    s     = firebase_get("settings") or {}
    p     = s.get("pos",  {})
    sz    = s.get("size", {})

    # Auto dates
    today     = _dt.date.today()
    greg_str  = today.strftime("%d/%m/%Y")
    et_str, _ = gregorian_to_ethiopian(today.year, today.month, today.day)

    def safe(n):
        idx = int(n)-1
        return lines[idx] if 0 <= idx < len(lines) else ""

    bg   = get_bg_front()
    draw = ImageDraw.Draw(bg)
    tc   = (45,25,5)

    draw_smart_text(draw, (p.get('amh_x',620),p.get('amh_y',235)), safe(fn.get('amh_n',5)),  sz.get('amh',32),sz.get('amh',32),tc)
    draw_smart_text(draw, (p.get('eng_x',620),p.get('eng_y',268)), safe(fn.get('eng_n',6)),  sz.get('eng',32),sz.get('eng',32),tc)
    draw_smart_text(draw, (p.get('dob_x',700),p.get('dob_y',390)), safe(fn.get('dob_n',8)),  sz.get('dob',28),sz.get('dob',28),tc)
    draw_smart_text(draw, (p.get('sex_x',620),p.get('sex_y',470)), safe(fn.get('sex_n',10)), sz.get('sex',28),sz.get('sex',28),tc)
    draw_smart_text(draw, (p.get('exp_x',710),p.get('exp_y',555)), safe(fn.get('exp_n',12)), sz.get('exp',28),sz.get('exp',28),tc)
    # Date of Issue — rotated 90° (vertical, like on real ID)
    def draw_rotated(bg_img, text, x, y, font_size, fill):
        from PIL import Image as _Img, ImageDraw as _IDraw, ImageFont as _IFont
        f = get_font(FONT_ENG, font_size)
        bbox = f.getbbox(text)
        tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
        tmp = _Img.new('RGBA', (tw+4, th+4), (0,0,0,0))
        td  = _IDraw.Draw(tmp)
        td.text((2,2), text, font=f, fill=fill)
        rotated = tmp.rotate(90, expand=True)
        bg_img.paste(rotated, (x, y), rotated)

    draw_rotated(bg, greg_str, int(p.get('iss_greg_x',30)), int(p.get('iss_greg_y',100)), int(sz.get('iss_greg',22)), tc)
    draw_rotated(bg, et_str,   int(p.get('iss_et_x',55)),  int(p.get('iss_et_y',100)),  int(sz.get('iss_et',22)),   tc)

    fan_d = ''.join(c for c in fan_digits if c.isdigit())
    if fan_d:
        fan_fmt = ' '.join(fan_d[i:i+4] for i in range(0,len(fan_d),4))
        draw_smart_text(draw, (p.get('fan_x',575),p.get('fan_y',648)), fan_fmt, sz.get('fan',28),sz.get('fan',28),tc)
        bc_img = generate_barcode_image(fan_d, height_px=int(sz.get('fan_bc',120)))
        if bc_img:
            bc_img = bc_img.resize((int(p.get('fan_bc_w',300)), int(sz.get('fan_bc',120))), Image.LANCZOS)
            bg.paste(bc_img, (int(p.get('fan_bc_x',575)), int(p.get('fan_bc_y',600))))

    if photo_b64:
        ph_im = Image.open(io.BytesIO(base64.b64decode(photo_b64))).convert("RGBA")
        ph_im = ph_im.resize((int(p.get('photo_w',190)), int(p.get('photo_h',240))), Image.LANCZOS)
        bg.paste(ph_im, (int(p.get('photo_x',105)), int(p.get('photo_y',165))), ph_im.split()[3])

    buf = io.BytesIO()
    bg.save(buf, format="JPEG", quality=92, optimize=True)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg",
        headers={"Content-Disposition": "attachment; filename=front.jpg"})

@router.post("/generate/back")
async def generate_back(
    qr_b64:     str = Form(""),
    fin_digits: str = Form(""),
    field_nums: str = Form("{}"),
    ocr_lines:  str = Form("[]"),
    sn_val:     str = Form(""),
    nat_am:     str = Form(""),
    nat_en:     str = Form(""),
    token=Depends(verify_token)
):
    import json, base64
    fn    = json.loads(field_nums)
    lines = json.loads(ocr_lines)
    s     = firebase_get("settings") or {}
    p_b   = s.get("pos_back",  {})
    sz_b  = s.get("size_back", {})

    def safe(n):
        idx = int(n)-1
        return lines[idx] if 0 <= idx < len(lines) else ""

    bg   = get_bg_back()
    draw = ImageDraw.Draw(bg)
    tc   = (45,25,5)

    fin_d   = ''.join(c for c in fin_digits if c.isdigit())
    fin_fmt = '-'.join(fin_d[i:i+4] for i in range(0,len(fin_d),4))

    woreda_raw  = safe(fn.get('woreda_amh_n',11))
    woreda_text = ''.join(c for c in woreda_raw if not c.isdigit()).strip()
    woreda_num  = ''.join(c for c in woreda_raw if c.isdigit()).strip()

    draw_smart_text(draw,(p_b.get('phone_x',620),        p_b.get('phone_y',200)),        safe(fn.get('phone_n',3)),     sz_b.get('phone',28),       sz_b.get('phone',28),       tc)
    draw_smart_text(draw,(p_b.get('fin_x',620),          p_b.get('fin_y',250)),          fin_fmt,                       sz_b.get('fin',28),         sz_b.get('fin',28),         tc)
    draw_smart_text(draw,(p_b.get('addr_amh_x',620),     p_b.get('addr_amh_y',300)),     safe(fn.get('addr_amh_n',7)),  sz_b.get('addr_amh',28),    sz_b.get('addr_amh',28),    tc)
    draw_smart_text(draw,(p_b.get('addr_eng_x',620),     p_b.get('addr_eng_y',340)),     safe(fn.get('addr_eng_n',8)),  sz_b.get('addr_eng',28),    sz_b.get('addr_eng',28),    tc)
    draw_smart_text(draw,(p_b.get('zone_amh_x',620),     p_b.get('zone_amh_y',380)),     safe(fn.get('zone_amh_n',9)),  sz_b.get('zone_amh',28),    sz_b.get('zone_amh',28),    tc)
    draw_smart_text(draw,(p_b.get('zone_eng_x',620),     p_b.get('zone_eng_y',420)),     safe(fn.get('zone_eng_n',10)), sz_b.get('zone_eng',28),    sz_b.get('zone_eng',28),    tc)
    draw_smart_text(draw,(p_b.get('woreda_amh_x',620),   p_b.get('woreda_amh_y',460)),   woreda_text,                   sz_b.get('woreda_amh',28),  sz_b.get('woreda_amh',28),  tc)
    draw_smart_text(draw,(p_b.get('woreda_amh_num_x',750),p_b.get('woreda_amh_num_y',460)),woreda_num,                  sz_b.get('woreda_amh_num',28),sz_b.get('woreda_amh_num',28),tc)
    draw_smart_text(draw,(p_b.get('woreda_eng_x',620),   p_b.get('woreda_eng_y',500)),   safe(fn.get('woreda_eng_n',12)),sz_b.get('woreda_eng',28), sz_b.get('woreda_eng',28),  tc)

    # SN
    if sn_val:
        draw_smart_text(draw,(p_b.get('sn_x',620),p_b.get('sn_y',560)), sn_val, sz_b.get('sn',24),sz_b.get('sn',24),tc)
    # ዜግነት — use passed value, fallback to settings default
    _nat_am = nat_am or s.get("nat_am", "ኢትዮጵያዊ")
    _nat_en = nat_en or s.get("nat_en", "Ethiopian")
    if _nat_am:
        draw_smart_text(draw,(p_b.get('nat_am_x',620),p_b.get('nat_am_y',590)), _nat_am, sz_b.get('nat_am',24),sz_b.get('nat_am',24),tc)
    if _nat_en:
        draw_smart_text(draw,(p_b.get('nat_en_x',620),p_b.get('nat_en_y',615)), _nat_en, sz_b.get('nat_en',24),sz_b.get('nat_en',24),tc)

    if qr_b64:
        qr_im = Image.open(io.BytesIO(base64.b64decode(qr_b64))).convert("RGB")
        qr_im = qr_im.resize((int(p_b.get('qr_w',200)), int(p_b.get('qr_h',200))), Image.LANCZOS)
        bg.paste(qr_im, (int(p_b.get('qr_x',100)), int(p_b.get('qr_y',150))))

    buf = io.BytesIO()
    bg.save(buf, format="JPEG", quality=92, optimize=True)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg",
        headers={"Content-Disposition": "attachment; filename=back.jpg"})
