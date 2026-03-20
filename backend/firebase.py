import os
import requests

FIREBASE_URL = os.getenv("FIREBASE_URL", "https://fayda-b365f-default-rtdb.firebaseio.com")
FIREBASE_SECRET = os.getenv("FIREBASE_SECRET", "")

def firebase_get(path: str):
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    r = requests.get(url, timeout=8)
    if r.status_code == 200 and r.text != "null":
        return r.json()
    return None

def firebase_set(path: str, data: dict):
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    r = requests.put(url, json=data, timeout=8)
    return r.status_code == 200

def firebase_push(path: str, data: dict):
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    r = requests.post(url, json=data, timeout=8)
    return r.json() if r.status_code == 200 else None

def firebase_delete(path: str):
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    r = requests.delete(url, timeout=8)
    return r.status_code == 200
