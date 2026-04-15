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

def remove_background_mediapipe(img_bgr):
    """Remove background using MediaPipe Selfie Segmentation (~2MB model, memory-efficient).
    Returns BGRA numpy array: grayscale B&W foreground, transparent background.
    Falls back to full-opaque grayscale if mediapipe fails.
    """
    try:
        import mediapipe as mp
        h, w = img_bgr.shape[:2]

        # MediaPipe requires RGB input
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        with mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0) as seg:
            result = seg.process(img_rgb)

        # result.segmentation_mask is float32 0.0–1.0 (1.0 = foreground person)
        mask_f = result.segmentation_mask  # shape (h, w)

        # Smooth mask edges slightly to avoid hard jagged borders
        mask_blur = cv2.GaussianBlur(mask_f, (9, 9), 0)

        # Threshold: >0.6 is confident foreground
        alpha = (mask_blur > 0.6).astype(np.uint8) * 255  # shape (h, w)

        # Grayscale foreground (B&W output as required)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Assemble BGRA: all 3 color channels = gray, alpha = mask
        bgra = np.zeros((h, w, 4), dtype=np.uint8)
        bgra[:, :, 0] = gray   # B
        bgra[:, :, 1] = gray   # G
        bgra[:, :, 2] = gray   # R
        bgra[:, :, 3] = alpha  # A

        return bgra

    except Exception as e:
        print("MEDIAPIPE BG REMOVE ERROR:", e)
        # Fallback: grayscale with full opaque alpha (no crash)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        bw   = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        bgra = cv2.cvtColor(bw, cv2.COLOR_BGR2BGRA)
        bgra[:, :, 3] = 255
        return bgra

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

def crop_photo_by_percent(img):
    """Crop profile photo from screenshot using percentage-based coordinates.
    Coordinates are device-resolution-independent.
    Left: 26.15%  Right: 73.85%  Top: 18.75%  Bottom: 47.25%
    """
    h, w = img.shape[:2]
    x1 = int(w * 0.2615)
    x2 = int(w * 0.7385)
    y1 = int(h * 0.1875)
    y2 = int(h * 0.4725)
    return img[y1:y2, x1:x2]

# ── Single mode crop percentages (edit these values as needed) ────
SINGLE_PHOTO_LEFT   = 0.2615
SINGLE_PHOTO_RIGHT  = 0.7385
SINGLE_PHOTO_TOP    = 0.1875
SINGLE_PHOTO_BOTTOM = 0.4725

# ── Light mode crop percentages (edit these values as needed) ─────
LIGHT_PHOTO_LEFT   = 0.2615
LIGHT_PHOTO_RIGHT  = 0.7385
LIGHT_PHOTO_TOP    = 0.1875
LIGHT_PHOTO_BOTTOM = 0.4725

def crop_photo_single(img):
    """Single mode: separate crop percentages from default."""
    h, w = img.shape[:2]
    return img[int(h*SINGLE_PHOTO_TOP):int(h*SINGLE_PHOTO_BOTTOM),
               int(w*SINGLE_PHOTO_LEFT):int(w*SINGLE_PHOTO_RIGHT)]

def crop_photo_light(img):
    """Light mode: separate crop percentages from default."""
    h, w = img.shape[:2]
    return img[int(h*LIGHT_PHOTO_TOP):int(h*LIGHT_PHOTO_BOTTOM),
               int(w*LIGHT_PHOTO_LEFT):int(w*LIGHT_PHOTO_RIGHT)]

# ── GitHub static QR (used by single + light modes) ──────────────
GITHUB_QR_URL = os.getenv("GITHUB_QR_URL",
    "https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/qr1.png")

def _fetch_github_qr() -> bytes | None:
    """Download the static QR image from GitHub. Returns PNG bytes or None."""
    try:
        resp = req_lib.get(GITHUB_QR_URL, timeout=10)
        if resp.ok:
            return resp.content
    except Exception as e:
        print("GITHUB QR FETCH ERROR:", e)
    return None

# ── OCR image preprocessing: grayscale + thresholding ────────────
def preprocess_for_ocr(image_bytes: bytes, method: str = "adaptive") -> bytes:
    """
    Convert image to grayscale and apply thresholding for better OCR accuracy.
    method: 'adaptive' (cv2.adaptiveThreshold) | 'otsu' (Otsu binarization)
    Returns PNG bytes of preprocessed image.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if method == "otsu":
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:  # adaptive (default — handles uneven lighting better)
        thresh = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31,
            C=10
        )

    ok, buf = cv2.imencode(".png", thresh)
    return buf.tobytes() if ok else image_bytes

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
# ══════════════════════════════════════════════════════════════════
# Gemini Vision OCR helpers
# ══════════════════════════════════════════════════════════════════
def _get_gemini_key():
    cfg = firebase_get("api_settings") or {}
    return cfg.get("gemini_key", "")

def _detect_mime(image_bytes: bytes) -> str:
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n': return "image/png"
    if image_bytes[:3] == b'\xff\xd8\xff':       return "image/jpeg"
    if image_bytes[:4] == b'GIF8':                 return "image/gif"
    if image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP': return "image/webp"
    return "image/jpeg"


def _gemini_ocr(image_bytes: bytes, prompt: str, gemini_key: str, model: str = "gemini-2.5-flash") -> dict:
    import requests as _req, base64 as _b64, json as _j
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={gemini_key}"
    )
    body = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": _detect_mime(image_bytes), "data": _b64.b64encode(image_bytes).decode()}},
                {"text": prompt}
            ]
        }],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json"
        }
    }
    resp = _req.post(url, json=body, timeout=40)
    print("GEMINI STATUS:", resp.status_code)
    print("GEMINI RESP TEXT:", resp.text[:800])
    if not resp.ok:
        resp.raise_for_status()
    rj = _j.loads(resp.text)
    text = rj["candidates"][0]["content"]["parts"][0]["text"]
    text = text.strip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s:e+1]
    return _j.loads(text)

PROMPT_FRONT = """TASK: OCR extraction from an Ethiopian Digital ID card (front side).
OUTPUT: Return ONLY a raw JSON object. No markdown, no explanation, no extra text.

STRICT RULES:
- You are a pixel-reader, not a language model. Do NOT autocorrect, normalize, or guess.
- Ethiopic script has 7 vowel forms per consonant base. Each form is a distinct character.
  Read the exact vowel mark on every character. These pairs are most often confused:
    Base ሰ: ሰ ሱ ሲ ሳ ሴ ስ ሶ  — check the right/bottom mark carefully
    Base ደ: ደ ዱ ዲ ዳ ዴ ድ ዶ  — ደ vs ድ differ only in a small bottom mark
    Base ረ: ረ ሩ ሪ ራ ሬ ር ሮ  — ረ vs ሬ vs ር look very similar
    Base በ: በ ቡ ቢ ባ ቤ ብ ቦ
    Base ነ: ነ ኑ ኒ ና ኔ ን ኖ
    Base ተ: ተ ቱ ቲ ታ ቴ ት ቶ
    Base ለ: ለ ሉ ሊ ላ ሌ ል ሎ
- DO NOT apply Amharic grammar or spelling knowledge. Treat it as pixel data only.
- If a field is not visible or unclear, use empty string "".
- Numbers: digits only, no spaces, no dashes.

Return this JSON and nothing else:
{"full_name_amh":"","full_name_eng":"","date_of_birth_greg":"","date_of_birth_et":"","sex":"","date_of_expiry_greg":"","date_of_expiry_et":"","fan":""}"""

PROMPT_BACK = """TASK: OCR extraction from an Ethiopian Digital ID card (back side).
OUTPUT: Return ONLY a raw JSON object. No markdown, no explanation, no extra text.

STRICT RULES:
- You are a pixel-reader, not a language model. Do NOT autocorrect, normalize, or guess.
- Ethiopic script has 7 vowel forms per consonant base. Each form is a distinct character.
  Read the exact vowel mark on every character. These pairs are most often confused:
    Base ሰ: ሰ ሱ ሲ ሳ ሴ ስ ሶ  — check the right/bottom mark carefully
    Base ደ: ደ ዱ ዲ ዳ ዴ ድ ዶ  — ደ vs ድ differ only in a small bottom mark
    Base ረ: ረ ሩ ሪ ራ ሬ ር ሮ  — ረ vs ሬ vs ር look very similar
    Base በ: በ ቡ ቢ ባ ቤ ብ ቦ
    Base ነ: ነ ኑ ኒ ና ኔ ን ኖ
    Base ተ: ተ ቱ ቲ ታ ቴ ት ቶ
    Base ለ: ለ ሉ ሊ ላ ሌ ል ሎ
- DO NOT apply Amharic grammar or address normalization. Copy pixel data only.
- Woreda field: SPLIT text and number. e.g. card shows "ወረዳ 05" → woreda_amh="ወረዳ", woreda_num="05"
- phone: 10 digits only. fin: 12 digits only, no dashes.
- If a field is not visible or unclear, use empty string "".

Return this JSON and nothing else:
{"phone":"","fin":"","address_amh":"","address_eng":"","zone_amh":"","zone_eng":"","woreda_amh":"","woreda_num":"","woreda_eng":""}"""


# ══════════════════════════════════════════════════════════════════
# Tesseract OCR helpers (Amharic + English fallback)
# ══════════════════════════════════════════════════════════════════
def _tesseract_ocr_lines(image_bytes: bytes, lang: str = "amh+eng") -> list[str]:
    """Run Tesseract on image bytes and return list of non-empty lines."""
    try:
        import pytesseract
        from PIL import Image as _PILImg
        img = _PILImg.open(io.BytesIO(image_bytes)).convert("RGB")
        custom_config = r"--oem 1 --psm 6"
        raw_text = pytesseract.image_to_string(img, lang=lang, config=custom_config)
        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
        return lines
    except Exception as e:
        print("TESSERACT ERROR:", e)
        return []


def _get_openai_key() -> str:
    cfg = firebase_get("api_settings") or {}
    return cfg.get("openai_key", "") or os.getenv("OPENAI_API_KEY", "")


GPT_FRONT_SYSTEM = """You are a field-mapper for Ethiopian National ID (Fayda) front side OCR output.
You receive a numbered list of text lines extracted by Tesseract OCR.
Your job: identify which LINE NUMBER contains each field.
Do NOT copy the text value. Return the LINE NUMBER (integer) for each field, or null if not found.

Rules:
- full_name_amh: line with Ethiopic (Amharic) full name
- full_name_eng: line with Latin-script full name
- date_of_birth_greg: line with Gregorian birth date (dd/mm/yyyy or similar)
- sex: line with sex/gender (ወንድ/Male/ሴት/Female or similar)
- date_of_expiry_greg: line with expiry date
- fan: line with a 16-digit number (Fayda Account Number)

Return ONLY raw JSON, no markdown:
{"full_name_amh": <int|null>, "full_name_eng": <int|null>, "date_of_birth_greg": <int|null>, "sex": <int|null>, "date_of_expiry_greg": <int|null>, "fan": <int|null>}"""

GPT_BACK_SYSTEM = """You are a field-mapper for Ethiopian National ID (Fayda) back side OCR output.
You receive a numbered list of text lines extracted by Tesseract OCR.
Your job: identify which LINE NUMBER contains each field.
Do NOT copy the text value. Return the LINE NUMBER (integer) for each field, or null if not found.

Rules:
- phone: line with a 10-digit phone number
- fin: line with a 12-digit FIN number
- address_amh: line with Ethiopic address text
- address_eng: line with Latin-script address text
- zone_amh: line with Ethiopic zone name
- zone_eng: line with Latin-script zone name
- woreda_amh: line with Ethiopic woreda name (may include a number)
- woreda_num: line number that contains the woreda number (same line as woreda_amh usually)
- woreda_eng: line with Latin-script woreda name

Return ONLY raw JSON, no markdown:
{"phone": <int|null>, "fin": <int|null>, "address_amh": <int|null>, "address_eng": <int|null>, "zone_amh": <int|null>, "zone_eng": <int|null>, "woreda_amh": <int|null>, "woreda_num": <int|null>, "woreda_eng": <int|null>}"""


def _gpt_map_lines(lines: list[str], system_prompt: str, openai_key: str) -> dict:
    """Send numbered OCR lines to GPT-4.1-nano and get field→line_number mapping."""
    import requests as _req, json as _j
    numbered = "\n".join(f"{i+1}. {ln}" for i, ln in enumerate(lines))
    body = {
        "model": "gpt-4.1-nano",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"OCR lines:\n{numbered}"}
        ],
        "temperature": 0,
        "max_tokens": 300,
    }
    resp = _req.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
        json=body, timeout=30
    )
    print("GPT NANO STATUS:", resp.status_code)
    print("GPT NANO RESP:", resp.text[:600])
    resp.raise_for_status()
    rj = _j.loads(resp.text)
    content = rj["choices"][0]["message"]["content"].strip()
    s, e = content.find("{"), content.rfind("}")
    if s != -1 and e != -1:
        content = content[s:e+1]
    return _j.loads(content)


def _tesseract_front_pipeline(image_bytes: bytes, openai_key: str):
    """Full Tesseract→GPT pipeline for front ID. Returns (lines, detected, mapping)."""
    # Preprocess: grayscale + adaptive threshold for better Amharic OCR
    processed = preprocess_for_ocr(image_bytes, method="adaptive")
    lines = _tesseract_ocr_lines(processed, lang="amh+eng")
    if not lines:  # fallback to raw image
        lines = _tesseract_ocr_lines(image_bytes, lang="amh+eng")
    if not lines:
        return [], {}, {}
    mapping = _gpt_map_lines(lines, GPT_FRONT_SYSTEM, openai_key)
    # Convert to detected format (1-indexed)
    detected = {}
    field_map = {
        "full_name_amh": "full_name",
        "full_name_eng": "full_name_eng",
        "date_of_birth_greg": "date_birth",
        "sex": "sex",
        "date_of_expiry_greg": "date_expiry",
        "fan": "fan",
    }
    for gpt_key, det_key in field_map.items():
        v = mapping.get(gpt_key)
        if v: detected[det_key] = v
    return lines, detected, mapping


def _tesseract_back_pipeline(image_bytes: bytes, openai_key: str):
    """Full Tesseract→GPT pipeline for back ID. Returns (lines, detected, mapping)."""
    processed = preprocess_for_ocr(image_bytes, method="adaptive")
    lines = _tesseract_ocr_lines(processed, lang="amh+eng")
    if not lines:
        lines = _tesseract_ocr_lines(image_bytes, lang="amh+eng")
    if not lines:
        return [], {}, {}
    mapping = _gpt_map_lines(lines, GPT_BACK_SYSTEM, openai_key)
    detected = {}
    field_map = {
        "phone": "phone",
        "fin": "fin",
        "address_amh": "addr_amh",
        "address_eng": "addr_eng",
        "zone_amh": "zone_amh",
        "zone_eng": "zone_eng",
        "woreda_amh": "woreda_amh",
        "woreda_eng": "woreda_eng",
    }
    for gpt_key, det_key in field_map.items():
        v = mapping.get(gpt_key)
        if v: detected[det_key] = v
    return lines, detected, mapping


def _easyocr_lines(image_bytes: bytes, langs: list = None) -> list[str]:
    """Run EasyOCR on image bytes and return list of non-empty lines."""
    try:
        import easyocr
        _langs = langs or ['am', 'en']
        reader = easyocr.Reader(_langs, gpu=False, verbose=False)
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        results = reader.readtext(img, detail=0, paragraph=False)
        lines = [ln.strip() for ln in results if ln.strip()]
        return lines
    except Exception as e:
        print("EASYOCR ERROR:", e)
        return []


def _easyocr_front_pipeline(image_bytes: bytes, openai_key: str):
    """Full EasyOCR→GPT pipeline for front ID. Returns (lines, detected, mapping)."""
    processed = preprocess_for_ocr(image_bytes, method="adaptive")
    lines = _easyocr_lines(processed, langs=['am', 'en'])
    if not lines:
        lines = _easyocr_lines(image_bytes, langs=['am', 'en'])
    if not lines:
        return [], {}, {}
    mapping = _gpt_map_lines(lines, GPT_FRONT_SYSTEM, openai_key)
    detected = {}
    field_map = {
        "full_name_amh": "full_name",
        "full_name_eng": "full_name_eng",
        "date_of_birth_greg": "date_birth",
        "sex": "sex",
        "date_of_expiry_greg": "date_expiry",
        "fan": "fan",
    }
    for gpt_key, det_key in field_map.items():
        v = mapping.get(gpt_key)
        if v:
            detected[det_key] = v
    return lines, detected, mapping


def _easyocr_back_pipeline(image_bytes: bytes, openai_key: str):
    """Full EasyOCR→GPT pipeline for back ID. Returns (lines, detected, mapping)."""
    processed = preprocess_for_ocr(image_bytes, method="adaptive")
    lines = _easyocr_lines(processed, langs=['am', 'en'])
    if not lines:
        lines = _easyocr_lines(image_bytes, langs=['am', 'en'])
    if not lines:
        return [], {}, {}
    mapping = _gpt_map_lines(lines, GPT_BACK_SYSTEM, openai_key)
    detected = {}
    field_map = {
        "phone": "phone", "fin": "fin",
        "address_amh": "addr_amh", "address_eng": "addr_eng",
        "zone_amh": "zone_amh", "zone_eng": "zone_eng",
        "woreda_amh": "woreda_amh", "woreda_eng": "woreda_eng",
    }
    for gpt_key, det_key in field_map.items():
        v = mapping.get(gpt_key)
        if v:
            detected[det_key] = v
    return lines, detected, mapping


def _normalize_sex(raw: str) -> str:
    s = raw.strip().lower()
    if any(x in s for x in ["male","ወንድ","m"]):
        return "ወንድ | Male"
    if any(x in s for x in ["female","ሴት","f"]):
        return "ሴት | Female"
    return raw

def _gemini_front_to_lines(g: dict):
    """Convert Gemini JSON to lines[] + detected{} format for frontend compatibility."""
    lines = [
        g.get("full_name_amh",""),
        g.get("full_name_eng",""),
        g.get("date_of_birth_greg",""),
        g.get("date_of_birth_et",""),
        _normalize_sex(g.get("sex","")),
        g.get("date_of_expiry_greg",""),
        g.get("date_of_expiry_et",""),
        g.get("fan",""),
    ]
    detected = {
        "full_name": 1 if g.get("full_name_amh") else None,
        "date_birth": 3 if g.get("date_of_birth_greg") else None,
        "sex": 5 if g.get("sex") else None,
        "date_expiry": 6 if g.get("date_of_expiry_greg") else None,
        "fan": 8 if g.get("fan") else None,
    }
    return lines, {k:v for k,v in detected.items() if v}

def _gemini_back_to_lines(g: dict):
    """Convert Gemini JSON to lines[] + detected{} format for frontend compatibility."""
    lines = [
        "",                              # 1 placeholder
        "",                              # 2 placeholder
        g.get("phone",""),               # 3
        "",                              # 4 placeholder
        g.get("fin",""),                 # 5
        "",                              # 6 placeholder
        g.get("address_amh",""),         # 7
        g.get("address_eng",""),         # 8
        g.get("zone_amh",""),            # 9
        g.get("zone_eng",""),            # 10
        g.get("woreda_amh","") + " " + g.get("woreda_num",""),  # 11 combined
        g.get("woreda_eng",""),          # 12
    ]
    detected = {
        "phone": 3 if g.get("phone") else None,
        "fin":   5 if g.get("fin") else None,
        "addr_amh":   7 if g.get("address_amh") else None,
        "addr_eng":   8 if g.get("address_eng") else None,
        "zone_amh":   9 if g.get("zone_amh") else None,
        "zone_eng":  10 if g.get("zone_eng") else None,
        "woreda_amh":11 if g.get("woreda_amh") else None,
        "woreda_eng":12 if g.get("woreda_eng") else None,
    }
    return lines, {k:v for k,v in detected.items() if v}


@router.post("/ocr/front")
async def ocr_front(
    file: UploadFile = File(...),
    mode: str = Form("gemini"),   # "gemini" | "tesseract" | "easyocr" | "single" | "light"
    token=Depends(verify_token)
):
    data = await file.read()

    # ── Tesseract + GPT-nano mode ──────────────────────────────────
    if mode == "tesseract":
        openai_key = _get_openai_key()
        if not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key is not configured.")
        try:
            lines, detected, mapping = _tesseract_front_pipeline(data, openai_key)
            if not lines:
                raise HTTPException(status_code=502, detail="Tesseract returned no text.")
            return {"lines": lines, "detected": detected, "mapping": mapping, "source": "tesseract"}
        except HTTPException:
            raise
        except Exception as e:
            import traceback; print("TESSERACT FRONT ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"Tesseract/GPT OCR failed: {str(e)}")

    # ── EasyOCR + GPT-nano mode ────────────────────────────────────
    if mode == "easyocr":
        openai_key = _get_openai_key()
        if not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key is not configured.")
        try:
            lines, detected, mapping = _easyocr_front_pipeline(data, openai_key)
            if not lines:
                raise HTTPException(status_code=502, detail="EasyOCR returned no text.")
            return {"lines": lines, "detected": detected, "mapping": mapping, "source": "easyocr"}
        except HTTPException:
            raise
        except Exception as e:
            import traceback; print("EASYOCR FRONT ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"EasyOCR/GPT OCR failed: {str(e)}")

    # ── Single mode — uses Gemini OCR, separate crop (no QR needed) ─
    if mode == "single":
        gemini_key = _get_gemini_key()
        if not gemini_key:
            raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
        try:
            g = _gemini_ocr(data, PROMPT_FRONT, gemini_key)
            lines, detected = _gemini_front_to_lines(g)
            return {"lines": lines, "detected": detected, "source": "single"}
        except Exception as e:
            import traceback; print("SINGLE FRONT ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"Single mode OCR failed: {str(e)}")

    # ── Light mode — uses Gemini OCR, expiry computed from issue date ─
    if mode == "light":
        gemini_key = _get_gemini_key()
        if not gemini_key:
            raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
        try:
            g = _gemini_ocr(data, PROMPT_FRONT, gemini_key)
            lines, detected = _gemini_front_to_lines(g)
            return {"lines": lines, "detected": detected, "source": "light"}
        except Exception as e:
            import traceback; print("LIGHT FRONT ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"Light mode OCR failed: {str(e)}")

    # ── Gemini mode (default) ──────────────────────────────────────
    gemini_key = _get_gemini_key()
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
    try:
        g = _gemini_ocr(data, PROMPT_FRONT, gemini_key)
        lines, detected = _gemini_front_to_lines(g)
        return {"lines": lines, "detected": detected, "source": "gemini"}
    except Exception as e:
        import traceback; print("GEMINI FRONT ERROR:", str(e)); print(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Gemini OCR failed: {str(e)}")

@router.post("/ocr/back")
async def ocr_back(
    file: UploadFile = File(...),
    mode: str = Form("gemini"),   # "gemini" | "tesseract" | "easyocr" | "single" | "light"
    token=Depends(verify_token)
):
    data = await file.read()

    # ── Tesseract + GPT-nano mode ──────────────────────────────────
    if mode == "tesseract":
        openai_key = _get_openai_key()
        if not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key is not configured.")
        try:
            lines, detected, mapping = _tesseract_back_pipeline(data, openai_key)
            if not lines:
                raise HTTPException(status_code=502, detail="Tesseract returned no text.")
            return {"lines": lines, "detected": detected, "mapping": mapping, "source": "tesseract"}
        except HTTPException:
            raise
        except Exception as e:
            import traceback; print("TESSERACT BACK ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"Tesseract/GPT OCR failed: {str(e)}")

    # ── EasyOCR + GPT-nano mode ────────────────────────────────────
    if mode == "easyocr":
        openai_key = _get_openai_key()
        if not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key is not configured.")
        try:
            lines, detected, mapping = _easyocr_back_pipeline(data, openai_key)
            if not lines:
                raise HTTPException(status_code=502, detail="EasyOCR returned no text.")
            return {"lines": lines, "detected": detected, "mapping": mapping, "source": "easyocr"}
        except HTTPException:
            raise
        except Exception as e:
            import traceback; print("EASYOCR BACK ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"EasyOCR/GPT OCR failed: {str(e)}")

    # ── Single / Light modes — back side uses Gemini OCR ──────────
    if mode in ("single", "light"):
        gemini_key = _get_gemini_key()
        if not gemini_key:
            raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
        try:
            g = _gemini_ocr(data, PROMPT_BACK, gemini_key)
            lines, detected = _gemini_back_to_lines(g)
            return {"lines": lines, "detected": detected, "source": mode}
        except Exception as e:
            import traceback; print(f"{mode.upper()} BACK ERROR:", str(e)); print(traceback.format_exc())
            raise HTTPException(status_code=502, detail=f"{mode} mode back OCR failed: {str(e)}")

    # ── Gemini mode (default) ──────────────────────────────────────
    gemini_key = _get_gemini_key()
    if not gemini_key:
        raise HTTPException(status_code=400, detail="Gemini API key is not configured.")
    try:
        g = _gemini_ocr(data, PROMPT_BACK, gemini_key)
        lines, detected = _gemini_back_to_lines(g)
        return {"lines": lines, "detected": detected, "source": "gemini"}
    except Exception as e:
        import traceback; print("GEMINI BACK ERROR:", str(e)); print(traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Gemini OCR failed: {str(e)}")

@router.post("/profile/crop")
async def crop_profile(
    file: UploadFile = File(...),
    mode: str = Form("gemini"),   # "gemini"|"tesseract"|"easyocr"|"single"|"light"
    token=Depends(verify_token)
):
    import base64
    data = await file.read()

    # Robust decode: try multiple strategies
    img = None

    # Strategy 1: standard cv2 decode
    try:
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        pass

    # Strategy 2: cv2 IMREAD_UNCHANGED (handles some edge cases)
    if img is None:
        try:
            arr = np.frombuffer(data, dtype=np.uint8)
            raw = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
            if raw is not None:
                if len(raw.shape) == 2:
                    img = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
                elif raw.shape[2] == 4:
                    img = cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)
                else:
                    img = raw
        except Exception:
            pass

    # Strategy 3: PIL (handles HEIC, webp, unusual JPEG variants)
    if img is None:
        try:
            pil_img = Image.open(io.BytesIO(data)).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            pass

    # Strategy 4: write to temp file and re-read (some decoders need file path)
    if img is None:
        try:
            import tempfile, os
            suffix = '.jpg'
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(data)
                tmp_path = tmp.name
            img = cv2.imread(tmp_path, cv2.IMREAD_COLOR)
            os.unlink(tmp_path)
        except Exception:
            pass

    if img is None:
        raise HTTPException(status_code=400, detail="ምስሉን decode ማድረግ አልተቻለም። JPG ወይም PNG ይጠቀሙ።")

    # ── Choose crop function based on mode ────────────────────────
    if mode == "single":
        photo_crop = crop_photo_single(img)
    elif mode == "light":
        photo_crop = crop_photo_light(img)
    else:
        photo_crop = crop_photo_by_percent(img)

    # ── QR: single/light → GitHub static QR; others → auto-detect ─
    qr_bytes = None
    if mode in ("single", "light"):
        qr_bytes = _fetch_github_qr()

    if qr_bytes:
        qr_pil = Image.open(io.BytesIO(qr_bytes)).convert("RGB")
        qr_buf = io.BytesIO()
        qr_pil.save(qr_buf, format="PNG")
        qr_b64 = base64.b64encode(qr_buf.getvalue()).decode()
    else:
        _card   = extract_white_card(img)
        qr_crop = crop_qr_from_card(_card if _card is not None else img)
        qr_pil  = Image.fromarray(cv2.cvtColor(qr_crop, cv2.COLOR_BGR2RGB))
        qr_buf  = io.BytesIO()
        qr_pil.save(qr_buf, format="PNG")
        qr_b64  = base64.b64encode(qr_buf.getvalue()).decode()

    bgra = remove_background_mediapipe(photo_crop)
    photo_pil = Image.fromarray(cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA), 'RGBA')
    photo_buf = io.BytesIO()
    photo_pil.save(photo_buf, format="PNG")

    return {
        "photo_b64": base64.b64encode(photo_buf.getvalue()).decode(),
        "qr_b64":    qr_b64,
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
    ocr_mode:   str = Form("gemini"),
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

    # ── Light mode: expiry = today + 8 years ─────────────────────
    if ocr_mode == "light":
        import calendar as _cal
        exp_year  = today.year + 8
        exp_month = today.month
        # Handle Feb 29 → Feb 28 in non-leap years
        max_day   = _cal.monthrange(exp_year, exp_month)[1]
        exp_day   = min(today.day, max_day)
        exp_date  = _dt.date(exp_year, exp_month, exp_day)
        ENG_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        exp_greg  = exp_date.strftime("%Y/%m/%d")     # 2034/08/01
        exp_greg2 = f"{exp_year}/{ENG_MONTHS[exp_month-1]}/{exp_day:02d}"  # 2034/Aug/01
        exp_display = f"{exp_greg} | {exp_greg2}"
        expiry_text = exp_display
    else:
        expiry_text = safe(fn.get('exp_n', 12))

    bg   = get_bg_front()
    draw = ImageDraw.Draw(bg)
    tc   = (45,25,5)

    draw_smart_text(draw, (p.get('amh_x',620),p.get('amh_y',235)), safe(fn.get('amh_n',5)),  sz.get('amh',32),sz.get('amh',32),tc)
    draw_smart_text(draw, (p.get('eng_x',620),p.get('eng_y',268)), safe(fn.get('eng_n',6)),  sz.get('eng',32),sz.get('eng',32),tc)
    draw_smart_text(draw, (p.get('dob_x',700),p.get('dob_y',390)), safe(fn.get('dob_n',8)),  sz.get('dob',28),sz.get('dob',28),tc)
    draw_smart_text(draw, (p.get('sex_x',620),p.get('sex_y',470)), safe(fn.get('sex_n',10)), sz.get('sex',28),sz.get('sex',28),tc)
    draw_smart_text(draw, (p.get('exp_x',710),p.get('exp_y',555)), expiry_text,               sz.get('exp',28),sz.get('exp',28),tc)
    # Date of Issue — rotated 90° (vertical, like on real ID)
    def draw_rotated(bg_img, text, x, y, font_size, fill):
        from PIL import Image as _Img, ImageDraw as _IDraw
        f    = get_font(FONT_ENG, font_size)
        # Use getlength + font size for reliable dimensions (avoid bbox clipping)
        pad  = font_size          # generous padding on all sides
        try:
            tw = int(f.getlength(text))
        except AttributeError:
            bbox = f.getbbox(text)
            tw   = bbox[2] - bbox[0]
        th   = font_size + 4      # line height ≈ font_size
        tmp  = _Img.new('RGBA', (tw + pad*2, th + pad*2), (0,0,0,0))
        td   = _IDraw.Draw(tmp)
        td.text((pad, pad), text, font=f, fill=fill)
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
        # Second photo placement
        ph_im2 = Image.open(io.BytesIO(base64.b64decode(photo_b64))).convert("RGBA")
        ph_im2 = ph_im2.resize((int(p.get('photo2_w',80)), int(p.get('photo2_h',100))), Image.LANCZOS)
        bg.paste(ph_im2, (int(p.get('photo2_x',900)), int(p.get('photo2_y',165))), ph_im2.split()[3])

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
