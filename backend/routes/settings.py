from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any
from routes.auth import verify_token, require_admin
from firebase import firebase_get, firebase_set

router = APIRouter()

class SettingsPayload(BaseModel):
    pos:        dict[str, Any]
    size:       dict[str, Any]
    pos_back:   dict[str, Any]
    size_back:  dict[str, Any]
    nat_am:           str = "ኢትዮጵያዊ"
    nat_en:           str = "Ethiopian"
    field_map_front:  dict[str, Any] = {}
    field_map_back:   dict[str, Any] = {}

class ApiSettingsPayload(BaseModel):
    ocr_mode:        str = "normal"
    gemini_key:      str = ""
    gemini_model:    str = "gemini-2.5-flash"
    openai_key:      str = ""
    active_ocr_mode: str = "gemini"   # "gemini"|"tesseract"|"easyocr"|"single"|"light"

@router.get("/")
def load_settings(token: dict = Depends(verify_token)):
    data = firebase_get("settings")
    return data or {}

@router.put("/")
def save_settings(payload: SettingsPayload, token: dict = Depends(require_admin)):
    firebase_set("settings", payload.model_dump())
    return {"message": "Settings saved"}

@router.get("/api-settings")
def load_api_settings(token: dict = Depends(require_admin)):
    data = firebase_get("api_settings") or {}
    return {
        "ocr_mode":        data.get("ocr_mode",        "normal"),
        "gemini_key":      data.get("gemini_key",      ""),
        "gemini_model":    data.get("gemini_model",    "gemini-2.5-flash"),
        "openai_key":      data.get("openai_key",      ""),
        "active_ocr_mode": data.get("active_ocr_mode", "gemini"),
    }

@router.put("/api-settings")
def save_api_settings(payload: ApiSettingsPayload, token: dict = Depends(require_admin)):
    firebase_set("api_settings", payload.model_dump())
    return {"message": "API settings saved"}
