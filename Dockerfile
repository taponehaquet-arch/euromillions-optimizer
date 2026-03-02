# ── Étape 1 : Build React ──────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json .
RUN npm install

COPY frontend/ .
RUN npm run build
# Résultat : /app/frontend/dist

# ── Étape 2 : Backend Python + fichiers statiques ──────────────
FROM python:3.11-slim

WORKDIR /app

# Dépendances Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code backend
COPY backend/ ./backend/

# Copier le build React dans le dossier que FastAPI va servir
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Port Railway (défaut 8080)
ENV PORT=8080
EXPOSE 8080

# Lancer FastAPI
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
