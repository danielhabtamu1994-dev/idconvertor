"""
Run once to create the first admin user:
  python create_admin.py
"""
import hashlib
import requests
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

FIREBASE_URL    = os.getenv("FIREBASE_URL", "https://fayda-b365f-default-rtdb.firebaseio.com")
FIREBASE_SECRET = os.getenv("FIREBASE_SECRET", "")

def hash_pw(pw): return hashlib.sha256(pw.encode()).hexdigest()

username = input("Admin username: ").strip()
password = input("Admin password: ").strip()

user_data = {
    username: {
        "password": hash_pw(password),
        "role":     "admin",
        "active":   True,
        "created":  datetime.utcnow().isoformat(),
    }
}

url = f"{FIREBASE_URL}/users.json"
if FIREBASE_SECRET:
    url += f"?auth={FIREBASE_SECRET}"

# GET existing users first
r = requests.get(url)
existing = r.json() or {}
existing.update(user_data)

r = requests.put(url, json=existing)
if r.status_code == 200:
    print(f"✅ Admin '{username}' created successfully!")
else:
    print(f"❌ Failed: {r.status_code} {r.text}")
