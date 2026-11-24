"""
Vercel serverless entry point for the GeneFold FastAPI backend.
Vercel looks for `app` exported from api/index.py.
All app code lives in api/app/ — no sys.path hacks needed.
"""
from app.main import app
