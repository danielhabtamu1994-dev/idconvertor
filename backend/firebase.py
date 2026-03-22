import os
import time
import requests

FIREBASE_URL    = os.getenv("FIREBASE_URL", "https://fayda-b365f-default-rtdb.firebaseio.com")
FIREBASE_SECRET = os.getenv("FIREBASE_SECRET", "")

# ── Settings cache (30 sec TTL) ──────────────────────────────────
_cache     = {}
_cache_ttl = 30  # seconds

def firebase_get(path: str):
    now = time.time()
    if path in _cache and now - _cache[path]['ts'] < _cache_ttl:
        return _cache[path]['data']
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    try:
        r = requests.get(url, timeout=8)
        if r.status_code == 200 and r.text != "null":
            data = r.json()
            _cache[path] = {'data': data, 'ts': now}
            return data
    except:
        pass
    return _cache.get(path, {}).get('data')  # fallback to stale cache

def firebase_set(path: str, data: dict):
    url = f"{FIREBASE_URL}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    r = requests.put(url, json=data, timeout=8)
    if r.status_code == 200:
        _cache[path] = {'data': data, 'ts': time.time()}
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
    if r.status_code == 200 and path in _cache:
        del _cache[path]
    return r.status_code == 200
