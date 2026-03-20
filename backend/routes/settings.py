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

@router.get("/")
def load_settings(token: dict = Depends(verify_token)):
    data = firebase_get("settings")
    return data or {}

@router.put("/")
def save_settings(payload: SettingsPayload, token: dict = Depends(require_admin)):
    firebase_set("settings", payload.model_dump())
    return {"message": "Settings saved"}
