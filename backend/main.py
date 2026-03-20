from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, settings, convert

app = FastAPI(title="Fayda ID Converter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(convert.router,  prefix="/api/convert",  tags=["convert"])

@app.get("/")
def root():
    return {"status": "ok", "app": "Fayda ID Converter"}
