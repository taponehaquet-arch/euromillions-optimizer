"""EuroMillions Optimizer — Backend FastAPI avec parser robuste multi-format FDJ"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd, numpy as np, json, io, os
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

app = FastAPI(title="EuroMillions Optimizer API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class MLConfig(BaseModel):
    nGrids: int = 10; topBalls: int = 15; topStars: int = 6
    mesoMonths: int = 4; microWeeks: int = 4
    wMacro: float = 0.40; wMeso: float = 0.35; wMicro: float = 0.25

session_draws = []

# ─── PARSER ROBUSTE MULTI-FORMAT FDJ ────────────────────────────
def _parse_date(s):
    s = str(s).strip()
    for fmt in ["%d/%m/%Y","%d/%m/%y","%Y%m%d"]:
        try: return pd.to_datetime(s, format=fmt)
        except: pass
    return pd.NaT

def _valid_mask(r):
    return (r.b1.between(1,50)&r.b2.between(1,50)&r.b3.between(1,50)&
            r.b4.between(1,50)&r.b5.between(1,50)&r.e1.between(1,12)&r.e2.between(1,12))

def _load_standard(df):
    r = pd.DataFrame()
    r["date"] = df["date_de_tirage"].apply(_parse_date)
    for i in range(1,6): r[f"b{i}"] = pd.to_numeric(df[f"boule_{i}"], errors="coerce")
    for i in range(1,3): r[f"e{i}"] = pd.to_numeric(df[f"etoile_{i}"], errors="coerce")
    return r.dropna().pipe(lambda x: x[_valid_mask(x)])

def _load_shifted(df):
    """Format FDJ 2016-2019 avec colonne numéro_de_tirage_dans_le_cycle qui décale tout."""
    r = pd.DataFrame()
    r["date"] = df["jour_de_tirage"].apply(_parse_date)
    r["b1"] = pd.to_numeric(df["date_de_forclusion"], errors="coerce")
    r["b2"] = pd.to_numeric(df["boule_1"], errors="coerce")
    r["b3"] = pd.to_numeric(df["boule_2"], errors="coerce")
    r["b4"] = pd.to_numeric(df["boule_3"], errors="coerce")
    r["b5"] = pd.to_numeric(df["boule_4"], errors="coerce")
    r["e1"] = pd.to_numeric(df["boule_5"], errors="coerce")
    r["e2"] = pd.to_numeric(df["etoile_1"], errors="coerce")
    return r.dropna().pipe(lambda x: x[_valid_mask(x)])

def parse_fdj_csv(content: bytes) -> list:
    for enc in ["utf-8-sig","ascii","latin-1","MacRoman"]:
        try: text = content.decode(enc); break
        except: pass
    else: text = content.decode("latin-1", errors="replace")

    df = pd.read_csv(io.StringIO(text), sep=";", dtype=str, low_memory=False)
    df.columns = [c.strip().lower() for c in df.columns]

    # Détecter le format par le contenu de date_de_tirage
    sample = str(df.get("date_de_tirage", pd.Series(["?"])).iloc[0]).strip()
    is_real_date = ("/" in sample and sample.count("/") == 2) or (len(sample)==8 and sample.isdigit())

    result = _load_standard(df) if is_real_date else _load_shifted(df)

    if len(result) == 0:
        raise ValueError(f"Aucun tirage valide. Format date détecté: '{sample}'")

    draws = []
    for _, r in result.sort_values("date").iterrows():
        draws.append({
            "date": r["date"].strftime("%Y-%m-%d"),
            "balls": sorted([int(r.b1),int(r.b2),int(r.b3),int(r.b4),int(r.b5)]),
            "stars": sorted([int(r.e1),int(r.e2)]),
        })
    return draws

# ─── ML ENGINE ──────────────────────────────────────────────────
def run_ml_engine(draws: list, config: MLConfig) -> dict:
    n = len(draws)
    dates = [datetime.fromisoformat(d["date"]) for d in draws]
    max_date = max(dates)

    ball_freq = np.zeros(51); star_freq = np.zeros(13); cooc = np.zeros((51,51))
    for d in draws:
        for b in d["balls"]: ball_freq[b] += 1
        for s in d["stars"]: star_freq[s] += 1
        for i in range(5):
            for j in range(i+1,5):
                a,b = d["balls"][i],d["balls"][j]
                cooc[a][b] += 1; cooc[b][a] += 1

    diversity = np.array([len(np.where(cooc[i]>0)[0])/49 for i in range(51)])
    macro_b = (ball_freq/(ball_freq.max()+1e-9))*0.6 + diversity*0.4
    macro_e = star_freq/(star_freq.max()+1e-9)
    macro_b[0]=0; macro_e[0]=0

    meso_cut = max_date - timedelta(days=config.mesoMonths*30)
    meso_b = np.zeros(51); meso_e = np.zeros(13)
    for d,dt in zip(draws,dates):
        if dt >= meso_cut:
            w = np.exp(-(max_date-dt).days/30)
            for b in d["balls"]: meso_b[b] += w
            for s in d["stars"]: meso_e[s] += w
    meso_b /= (meso_b.max()+1e-9); meso_e /= (meso_e.max()+1e-9)

    micro_cut = max_date - timedelta(weeks=config.microWeeks)
    last_b = {}; last_e = {}
    for d,dt in zip(draws,dates):
        for b in d["balls"]: last_b[b]=dt
        for s in d["stars"]: last_e[s]=dt

    micro_b = np.zeros(51); micro_e = np.zeros(13)
    ag = (n/50)*(1/5)*3.5
    for i in range(1,51): micro_b[i] = min((max_date-last_b.get(i,max_date-timedelta(days=999))).days/(ag*3),1.0)
    ags = (n/12)*(1/2)*3.5
    for i in range(1,13): micro_e[i] = min((max_date-last_e.get(i,max_date-timedelta(days=999))).days/(ags*3),1.0)

    rec_b = np.zeros(51); rec_e = np.zeros(13)
    for d,dt in zip(draws,dates):
        if dt >= micro_cut:
            for b in d["balls"]: rec_b[b] += 1
            for s in d["stars"]: rec_e[s] += 1
    micro_b = micro_b*0.6+(rec_b/(rec_b.max()+1e-9))*0.4
    micro_e = micro_e*0.6+(rec_e/(rec_e.max()+1e-9))*0.4

    wM,wMe,wMi = config.wMacro,config.wMeso,config.wMicro
    comp_b = macro_b*wM+meso_b*wMe+micro_b*wMi
    comp_e = macro_e*wM+meso_e*wMe+micro_e*wMi
    comp_b /= (comp_b.max()+1e-9); comp_e /= (comp_e.max()+1e-9)

    from math import comb as C
    top_b = sorted(range(1,51),key=lambda x:-comp_b[x])[:config.topBalls]
    top_s = sorted(range(1,13),key=lambda x:-comp_e[x])[:config.topStars]
    space = C(config.topBalls,5)*C(config.topStars,2)
    total = C(50,5)*C(12,2)

    grids = []; seen = set(); usage = np.zeros(51)
    attempts = 0
    while len(grids) < config.nGrids and attempts < config.nGrids*300:
        attempts += 1
        bw = np.array([max(comp_b[b]*(1-0.3*(usage[b]/max(len(grids),1))),0.05) for b in top_b]); bw /= bw.sum()
        sw = np.array([comp_e[s] for s in top_s]); sw /= sw.sum()
        balls = sorted(np.random.choice(top_b,5,replace=False,p=bw).tolist())
        stars = sorted(np.random.choice(top_s,2,replace=False,p=sw).tolist())
        key = (tuple(balls),tuple(stars))
        if key in seen: continue
        seen.add(key)
        for b in balls: usage[b] += 1
        cs = sum(cooc[balls[i]][balls[j]] for i in range(5) for j in range(i+1,5))/100
        bs = np.mean([comp_b[b] for b in balls]); ss = np.mean([comp_e[s] for s in stars])
        score = bs*0.5+ss*0.2+cs*0.3
        grids.append({"id":len(grids)+1,"balls":balls,"stars":stars,
                      "score":round(float(score),4),"ballScore":round(float(bs),4),
                      "starScore":round(float(ss),4),"coocScore":round(float(cs),4)})

    grids.sort(key=lambda x:-x["score"])
    gap_b = {i:int((max_date-last_b.get(i,max_date-timedelta(days=999))).days) for i in range(1,51)}
    gap_e = {i:int((max_date-last_e.get(i,max_date-timedelta(days=999))).days) for i in range(1,13)}

    return {
        "n_draws":n, "date_from":dates[0].isoformat(), "date_to":max_date.isoformat(),
        "grids":grids, "topBalls":top_b, "topStars":top_s,
        "searchSpace":space, "totalSpace":total, "reduction":round((1-space/total)*100,1),
        "scores":{"balls":{str(i):round(float(comp_b[i]),4) for i in range(1,51)},
                  "stars":{str(i):round(float(comp_e[i]),4) for i in range(1,13)}},
        "frequencies":{"balls":{str(i):int(ball_freq[i]) for i in range(1,51)},
                       "stars":{str(i):int(star_freq[i]) for i in range(1,13)}},
        "gaps":{"balls":{str(i):gap_b[i] for i in range(1,51)},
                "stars":{str(i):gap_e[i] for i in range(1,13)}},
        "layers":{"macro":{"balls":{str(i):round(float(macro_b[i]),4) for i in range(1,51)}},
                  "meso": {"balls":{str(i):round(float(meso_b[i]),4)  for i in range(1,51)}},
                  "micro":{"balls":{str(i):round(float(micro_b[i]),4) for i in range(1,51)}}},
    }

# ─── ROUTES ─────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    global session_draws
    content = await file.read()
    try:
        draws = parse_fdj_csv(content)
    except Exception as e:
        raise HTTPException(422, f"Erreur parsing: {e}")
    session_draws = draws
    return {"ok":True,"n_draws":len(draws),
            "date_from":draws[0]["date"],"date_to":draws[-1]["date"],
            "message":f"{len(draws)} tirages chargés"}

@app.post("/api/analyze")
async def analyze(config: MLConfig):
    if not session_draws:
        raise HTTPException(400,"Uploadez d'abord votre CSV")
    if abs(config.wMacro+config.wMeso+config.wMicro-1.0)>0.02:
        raise HTTPException(400,"Les poids doivent sommer à 1.0")
    try: return run_ml_engine(session_draws, config)
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/api/status")
async def status():
    return {"ok":True,"draws_loaded":len(session_draws),"ready":len(session_draws)>0}

# Servir le frontend React en production
frontend_build = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_build.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_build/"assets")), name="assets")
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index = frontend_build/"index.html"
        return FileResponse(str(index)) if index.exists() else {"error":"Frontend non compilé"}
