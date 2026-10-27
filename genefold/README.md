# GeneFold

Full-stack application with a Python FastAPI backend and a React + Vite + Tailwind CSS frontend.

## Backend
The backend is built with FastAPI and runs on Python.

### Setup and Run
Open a terminal and run:
```bash
# If you are in the protein/ root folder:
cd genefold/backend

# Activate the existing virtual environment (Windows):
.\venv\Scripts\activate
# (Or on Mac/Linux: source venv/bin/activate)

# Run the API server:
uvicorn app.main:app --reload
```
API will be running at `http://localhost:8000` (docs at `http://localhost:8000/docs`).

## Frontend
The frontend is built with React, Vite, Tailwind CSS, and 3Dmol.

### Setup and Run
Open a second terminal and run:
```bash
# If you are in the protein/ root folder:
cd genefold/frontend

# Run the development server:
npm run dev
```
The app will be running at `http://localhost:5173`.
