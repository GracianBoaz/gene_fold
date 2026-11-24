from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .config import settings
from .database import engine, Base
from .models import protein
from .routers import resolve, protein as protein_router, structure as structure_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables automatically on startup
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="GeneFold API", lifespan=lifespan)

app.include_router(resolve.router)
app.include_router(protein_router.router)
app.include_router(structure_router.router)



origins = settings.allowed_origins.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "title": "GeneFold API",
        "status": "online",
        "documentation": "/docs",
        "health": "/api/health"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "GeneFold API is running"}

