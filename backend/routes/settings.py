from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any
from routes.auth import verify_token, require_admin
from firebase import firebase_get, firebase_set

router = APIRouter()

class SettingsPayload(BaseModel):
    pos:              dict[str, Any]
    size:             dict[str, Any]
    pos_back:         dict[str, Any]
    size_back:        dict[str, Any]
    nat_am:           str = "ኢትዮጵያዊ"
    nat_en:           str = "Ethiopian"
    field_map_front:  dict[str, Any] = {}
    field_map_back:   dict[str, Any] = {}

class ApiSettingsPayload(BaseModel):
    ocr_mode:   str = "normal"   # "normal" or "gemini"
    gemini_key: str = ""

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
    return {"ocr_mode": data.get("ocr_mode","normal"), "gemini_key": data.get("gemini_key","")}

@router.put("/api-settings")
def save_api_settings(payload: ApiSettingsPayload, token: dict = Depends(require_admin)):
    firebase_set("api_settings", payload.model_dump())
    return {"message": "API settings saved"}
