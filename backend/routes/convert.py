from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from routes.auth import verify_token
from firebase import firebase_get
import pytesseract
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np
import io
import requests as req_lib
import os
import barcode
from barcode.writer import ImageWriter

router = APIRouter()

FONT_AMH     = os.getenv("FONT_AMH", "AbyssinicaSIL-Regular.ttf")
FONT_ENG     = os.getenv("FONT_ENG", "Inter_18pt-Bold.ttf")
BG_PATH      = os.getenv("BG_PATH",  "20260319_215211.jpg")
BG_PATH_BACK = os.getenv("BG_PATH_BACK", "20260319_211337.jpg")
REMOVE_BG_KEY = os.getenv("REMOVE_BG_KEY", "")

# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════
def is_ethiopic(char):
    cp = ord(char)
    return 0x1200 <= cp <= 0x137F or 0xAB00 <= cp <= 0xAB2F or 0x2D80 <= cp <= 0x2DDF

# ── Font cache ───────────────────────────────────────────────────
_font_cache = {}
def get_font(path, size):
    key = (path, size)
    if key not in _font_cache:
        try:
            _font_cache[key] = ImageFont.truetype(path, size)
        except:
            _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]

# ── Preload background images ─────────────────────────────────────
_bg_front = None
_bg_back  = None

def get_bg_front():
    global _bg_front
    if _bg_front is None:
        _bg_front = Image.open(BG_PATH).convert("RGB")
    return _bg_front.copy()

def get_bg_back():
    global _bg_back
    if _bg_back is None:
        _bg_back = Image.open(BG_PATH_BACK).convert("RGB")
    return _bg_back.copy()

def draw_smart_text(draw, pos, text, size_amh=32, size_eng=28, fill=(45,25,5)):
    f_amh = get_font(FONT_AMH, size_amh)
    f_eng = get_font(FONT_ENG, size_eng)
    x, y = pos
    if not text: return
    cur_script = 'amh' if is_ethiopic(text[0]) else 'eng'
    cur_seg = text[0]
    segments = []
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
        writer  = ImageWriter()
        buf     = io.BytesIO()
        bc      = CODE128(data, writer=writer)
        bc.write(buf, options={
            'write_text': False, 'module_height': max(5, height_px/10),
            'module_width': 0.5, 'quiet_zone': 1.0, 'dpi': 200,
        })
        buf.seek(0)
        img   = Image.open(buf).convert("RGB")
        w, h  = img.size
        new_w = int(w * height_px / h)
        return img.resize((new_w, height_px), Image.LANCZOS)
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
        s  = line.strip()
        ll = s.lower()
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
    """remove.bg API → BGRA"""
    if not REMOVE_BG_KEY:
        return None
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
            pil_nobg = Image.open(io.BytesIO(resp.content)).convert("RGBA")
            gray_pil = pil_nobg.convert('L')
            _, _, _, a = pil_nobg.split()
            bw_rgba  = Image.merge('RGBA', (gray_pil, gray_pil, gray_pil, a))
            return cv2.cvtColor(np.array(bw_rgba), cv2.COLOR_RGBA2BGRA)
    except:
        pass
    return None

def extract_white_card(img_bgr):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, wm = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    k  = np.ones((15,15), np.uint8)
    wm = cv2.morphologyEx(wm, cv2.MORPH_CLOSE, k)
    wm = cv2.morphologyEx(wm, cv2.MORPH_OPEN,  k)
    cnts, _ = cv2.findContours(wm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return None
    bx = cv2.boundingRect(max(cnts, key=cv2.contourArea))
    x,y,w,h = bx
    return img_bgr[y:y+h, x:x+w]

def crop_photo_from_card(card):
    gray_c     = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    ch, cw     = card.shape[:2]
    row_means  = np.mean(gray_c, axis=1)
    crow       = np.where(row_means < 220)[0]
    if len(crow) == 0: return card[:ch//2,:]
    gaps = np.diff(crow)
    if len(gaps) > 0 and np.max(gaps) > 10:
        si    = np.argmax(gaps)
        pad   = 5
        top   = max(0, crow[0]-pad)
        bot   = min(ch, crow[si]+pad)
        crop  = card[top:bot,:]
        cm    = np.mean(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), axis=0)
        lc    = next((j for j in range(len(cm)) if cm[j]<220), 0)
        rc    = next((j for j in range(len(cm)-1,-1,-1) if cm[j]<220), len(cm)-1)
        crop  = crop[:,lc:rc+1]
    else:
        crop  = card[:ch//2,:]
    # 5px trim
    ph, pw = crop.shape[:2]
    crop   = crop[5:ph-5, 5:pw-5]
    return crop

def crop_qr_from_card(card, margin=18):
    gray_c    = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    ch, cw    = card.shape[:2]
    row_means = np.mean(gray_c, axis=1)
    crow      = np.where(row_means < 220)[0]
    if len(crow) == 0: return card[ch//2:,:]
    gaps = np.diff(crow)
    if len(gaps) > 0 and np.max(gaps) > 10:
        si   = np.argmax(gaps)
        qsr  = crow[si+1]
        pad  = 5
        top  = max(0, qsr-pad)
        bot  = min(ch, crow[-1]+pad)
        qr   = card[top:bot,:]
        cm   = np.mean(cv2.cvtColor(qr, cv2.COLOR_BGR2GRAY), axis=0)
        lc   = next((j for j in range(len(cm)) if cm[j]<220), 0)
        rc   = next((j for j in range(len(cm)-1,-1,-1) if cm[j]<220), len(cm)-1)
        tight = qr[:,lc:rc+1]
        th, tw = tight.shape[:2]
        canvas = np.ones((th+margin*2, tw+margin*2, 3), np.uint8)*255
        canvas[margin:margin+th, margin:margin+tw] = tight
        return canvas
    return card[ch//2:,:]

# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════
@router.post("/ocr/front")
async def ocr_front(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    data    = await file.read()
    img     = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    h, w    = img.shape[:2]
    id_only = img[int(h*0.18):int(h*0.85), int(w*0.10):int(w*0.90)]
    gray    = cv2.cvtColor(id_only, cv2.COLOR_BGR2GRAY)
    text    = pytesseract.image_to_string(gray, lang='amh+eng')
    lines   = [l.strip() for l in text.split('\n') if len(l.strip()) > 1]
    return {"lines": lines, "detected": auto_detect_fields(lines)}

@router.post("/ocr/back")
async def ocr_back(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    data    = await file.read()
    img     = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    h, w    = img.shape[:2]
    id_only = img[int(h*0.18):int(h*0.85), int(w*0.10):int(w*0.90)]
    gray    = cv2.cvtColor(id_only, cv2.COLOR_BGR2GRAY)
    text    = pytesseract.image_to_string(gray, lang='amh+eng')
    lines   = [l.strip() for l in text.split('\n') if len(l.strip()) > 1]
    return {"lines": lines, "detected": auto_detect_fields_back(lines)}

@router.post("/profile/crop")
async def crop_profile(file: UploadFile = File(...), token: dict = Depends(verify_token)):
    data   = await file.read()
    img    = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    ph, pw = img.shape[:2]
    card   = extract_white_card(img)
    if card is None:
        card = img

    photo_crop = crop_photo_from_card(card)
    qr_crop    = crop_qr_from_card(card)

    # remove.bg
    bgra = remove_background(photo_crop)
    if bgra is None:
        gray   = cv2.cvtColor(photo_crop, cv2.COLOR_BGR2GRAY)
        bw     = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        bgra   = cv2.cvtColor(bw, cv2.COLOR_BGR2BGRA)
        bgra[:,:,3] = 255

    # encode photo as PNG
    photo_pil = Image.fromarray(cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA), 'RGBA')
    photo_buf = io.BytesIO()
    photo_pil.save(photo_buf, format="PNG")

    # encode QR as PNG
    qr_pil = Image.fromarray(cv2.cvtColor(qr_crop, cv2.COLOR_BGR2RGB))
    qr_buf = io.BytesIO()
    qr_pil.save(qr_buf, format="PNG")

    import base64
    return {
        "photo_b64": base64.b64encode(photo_buf.getvalue()).decode(),
        "qr_b64":    base64.b64encode(qr_buf.getvalue()).decode(),
    }

@router.post("/generate/front")
async def generate_front(
    id_front:    UploadFile = File(...),
    photo_b64:   str = Form(...),
    fan_digits:  str = Form(""),
    field_nums:  str = Form("{}"),
    ocr_lines:   str = Form("[]"),
    token: dict = Depends(verify_token)
):
    import json, base64
    fn    = json.loads(field_nums)
    lines = json.loads(ocr_lines)

    settings = firebase_get("settings") or {}
    p  = settings.get("pos",  {})
    sz = settings.get("size", {})

    def safe(n):
        idx = int(n)-1
        return lines[idx] if 0 <= idx < len(lines) else ""

    bg   = get_bg_front()
    draw = ImageDraw.Draw(bg)
    tc   = (45,25,5)

    draw_smart_text(draw, (p.get('amh_x',620), p.get('amh_y',235)), safe(fn.get('amh_n',5)),  sz.get('amh',32), sz.get('amh',32), tc)
    draw_smart_text(draw, (p.get('eng_x',620), p.get('eng_y',268)), safe(fn.get('eng_n',6)),  sz.get('eng',32), sz.get('eng',32), tc)
    draw_smart_text(draw, (p.get('dob_x',700), p.get('dob_y',390)), safe(fn.get('dob_n',8)),  sz.get('dob',28), sz.get('dob',28), tc)
    draw_smart_text(draw, (p.get('sex_x',620), p.get('sex_y',470)), safe(fn.get('sex_n',10)), sz.get('sex',28), sz.get('sex',28), tc)
    draw_smart_text(draw, (p.get('exp_x',710), p.get('exp_y',555)), safe(fn.get('exp_n',12)), sz.get('exp',28), sz.get('exp',28), tc)

    # FAN
    fan_d = ''.join(c for c in fan_digits if c.isdigit())
    if fan_d:
        fan_fmt = ' '.join(fan_d[i:i+4] for i in range(0,len(fan_d),4))
        draw_smart_text(draw, (p.get('fan_x',575), p.get('fan_y',648)), fan_fmt, sz.get('fan',28), sz.get('fan',28), tc)
        bc_img = generate_barcode_image(fan_d, height_px=int(sz.get('fan_bc',120)))
        if bc_img:
            bc_w = int(p.get('fan_bc_w',300))
            bc_h = int(sz.get('fan_bc',120))
            bc_img = bc_img.resize((bc_w, bc_h), Image.LANCZOS)
            bg.paste(bc_img, (int(p.get('fan_bc_x',575)), int(p.get('fan_bc_y',600))))

    # Photo
    if photo_b64:
        raw   = base64.b64decode(photo_b64)
        ph_im = Image.open(io.BytesIO(raw)).convert("RGBA")
        pw_v  = int(p.get('photo_w',190))
        ph_v  = int(p.get('photo_h',240))
        px_v  = int(p.get('photo_x',105))
        py_v  = int(p.get('photo_y',165))
        ph_im = ph_im.resize((pw_v, ph_v), Image.LANCZOS)
        bg.paste(ph_im, (px_v, py_v), ph_im.split()[3])

    buf = io.BytesIO()
    bg.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=front.png"})

@router.post("/generate/back")
async def generate_back(
    id_back:    UploadFile = File(...),
    qr_b64:    str = Form(""),
    fin_digits: str = Form(""),
    field_nums: str = Form("{}"),
    ocr_lines:  str = Form("[]"),
    token: dict = Depends(verify_token)
):
    import json, base64
    fn    = json.loads(field_nums)
    lines = json.loads(ocr_lines)

    settings = firebase_get("settings") or {}
    p_b  = settings.get("pos_back",  {})
    sz_b = settings.get("size_back", {})

    def safe(n):
        idx = int(n)-1
        return lines[idx] if 0 <= idx < len(lines) else ""

    bg   = get_bg_back()
    draw = ImageDraw.Draw(bg)
    tc   = (45,25,5)

    # FIN
    fin_d = ''.join(c for c in fin_digits if c.isdigit())
    fin_fmt = '-'.join(fin_d[i:i+4] for i in range(0,len(fin_d),4))

    woreda_raw  = safe(fn.get('woreda_amh_n',11))
    woreda_text = ''.join(c for c in woreda_raw if not c.isdigit()).strip()
    woreda_num  = ''.join(c for c in woreda_raw if c.isdigit()).strip()

    draw_smart_text(draw, (p_b.get('phone_x',620),       p_b.get('phone_y',200)),       safe(fn.get('phone_n',3)),     sz_b.get('phone',28),       sz_b.get('phone',28),       tc)
    draw_smart_text(draw, (p_b.get('fin_x',620),         p_b.get('fin_y',250)),         fin_fmt,                       sz_b.get('fin',28),         sz_b.get('fin',28),         tc)
    draw_smart_text(draw, (p_b.get('addr_amh_x',620),    p_b.get('addr_amh_y',300)),    safe(fn.get('addr_amh_n',7)),  sz_b.get('addr_amh',28),    sz_b.get('addr_amh',28),    tc)
    draw_smart_text(draw, (p_b.get('addr_eng_x',620),    p_b.get('addr_eng_y',340)),    safe(fn.get('addr_eng_n',8)),  sz_b.get('addr_eng',28),    sz_b.get('addr_eng',28),    tc)
    draw_smart_text(draw, (p_b.get('zone_amh_x',620),    p_b.get('zone_amh_y',380)),    safe(fn.get('zone_amh_n',9)),  sz_b.get('zone_amh',28),    sz_b.get('zone_amh',28),    tc)
    draw_smart_text(draw, (p_b.get('zone_eng_x',620),    p_b.get('zone_eng_y',420)),    safe(fn.get('zone_eng_n',10)), sz_b.get('zone_eng',28),    sz_b.get('zone_eng',28),    tc)
    draw_smart_text(draw, (p_b.get('woreda_amh_x',620),  p_b.get('woreda_amh_y',460)),  woreda_text,                   sz_b.get('woreda_amh',28),  sz_b.get('woreda_amh',28),  tc)
    draw_smart_text(draw, (p_b.get('woreda_amh_num_x',750),p_b.get('woreda_amh_num_y',460)),woreda_num,               sz_b.get('woreda_amh_num',28),sz_b.get('woreda_amh_num',28),tc)
    draw_smart_text(draw, (p_b.get('woreda_eng_x',620),  p_b.get('woreda_eng_y',500)),  safe(fn.get('woreda_eng_n',12)),sz_b.get('woreda_eng',28), sz_b.get('woreda_eng',28),  tc)

    # QR
    if qr_b64:
        raw   = base64.b64decode(qr_b64)
        qr_im = Image.open(io.BytesIO(raw)).convert("RGB")
        qw    = int(p_b.get('qr_w',200))
        qh    = int(p_b.get('qr_h',200))
        qx    = int(p_b.get('qr_x',100))
        qy    = int(p_b.get('qr_y',150))
        bg.paste(qr_im.resize((qw,qh), Image.LANCZOS), (qx,qy))

    buf = io.BytesIO()
    bg.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=back.png"})
