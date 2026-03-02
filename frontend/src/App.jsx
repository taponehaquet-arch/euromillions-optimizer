import { useState, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, Legend
} from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "";   // même origine en prod Railway

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  bg:       "#07090f",
  surface:  "#0e1420",
  card:     "#121a2b",
  border:   "#1c2b44",
  accent1:  "#00d4ff",
  accent2:  "#ff6b35",
  accent3:  "#a855f7",
  gold:     "#fbbf24",
  green:    "#10b981",
  red:      "#ef4444",
  text:     "#e2e8f0",
  muted:    "#4b6080",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function comb(n, k) {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return Math.floor(r);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Erreur API");
  }
  return res.json();
}

// ─── COMPOSANTS UI ───────────────────────────────────────────────────────────
function Ball({ n, type = "ball", size = 42, glow }) {
  const isStar = type === "star";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: size * 0.33, fontWeight: 800,
      background: isStar
        ? "radial-gradient(circle at 35% 35%, #fde68a, #b45309)"
        : "radial-gradient(circle at 35% 35%, #60a5fa, #1e3a8a)",
      color: isStar ? "#000" : "#fff",
      boxShadow: glow
        ? `0 0 14px ${isStar ? C.gold : C.accent1}88`
        : `0 2px 8px #00000060`,
      border: `2px solid ${glow ? (isStar ? C.gold : C.accent1) : "transparent"}`,
      transition: "all 0.2s",
    }}>
      {n < 10 ? `0${n}` : n}
    </div>
  );
}

function GridCard({ g, rank }) {
  const isTop = rank <= 3;
  const rankColors = ["#fbbf24","#94a3b8","#cd7f32"];
  return (
    <div style={{
      background: C.card, borderRadius: 14,
      border: `1px solid ${isTop ? rankColors[rank-1]+"44" : C.border}`,
      borderLeft: `4px solid ${isTop ? rankColors[rank-1] : C.border}`,
      padding: "16px 20px",
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow="0 12px 40px #00000080"; }}
      onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="none"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:12, fontWeight:800, color: isTop ? rankColors[rank-1] : C.muted }}>
          {rank === 1 ? "🏆" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`} GRILLE
        </span>
        <span style={{ fontSize:11, fontFamily:"monospace", color: C.muted }}>
          score <span style={{ color: C.accent1, fontWeight:700 }}>{g.score}</span>
        </span>
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        {g.balls.map(b => <Ball key={b} n={b} glow size={44} />)}
        <span style={{ color: C.muted, fontSize:16, margin:"0 2px" }}>✦</span>
        {g.stars.map(s => <Ball key={s} n={s} type="star" glow size={38} />)}
      </div>
      <div style={{ display:"flex", gap:16, marginTop:10, fontSize:10, color: C.muted }}>
        <Pill label="Boules" val={g.ballScore} color={C.accent1} />
        <Pill label="Étoiles" val={g.starScore} color={C.gold} />
        <Pill label="Co-occ." val={g.coocScore} color={C.accent3} />
      </div>
    </div>
  );
}

function Pill({ label, val, color }) {
  return (
    <span>
      <span style={{ color }}>{label}</span>
      {" "}<span style={{ color, fontWeight:700, fontFamily:"monospace" }}>{val}</span>
    </span>
  );
}

function Slider({ label, value, min, max, step, onChange, color=C.accent1, unit="" }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontSize:11, color: C.text }}>{label}</span>
        <span style={{ fontSize:11, color, fontWeight:700, fontFamily:"monospace" }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width:"100%", accentColor:color, cursor:"pointer" }} />
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", gap:3, background:C.surface, padding:4, borderRadius:10, marginBottom:20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex:1, padding:"8px 10px", borderRadius:7, cursor:"pointer",
          background: active===t.id ? C.card : "transparent",
          border: active===t.id ? `1px solid ${C.border}` : "1px solid transparent",
          color: active===t.id ? C.text : C.muted,
          fontSize:11, fontWeight: active===t.id ? 700 : 400,
          transition:"all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function ChartBox({ title, sub, children }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 22px", marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:sub?4:14 }}>{title}</div>
      {sub && <div style={{ fontSize:10, color:C.muted, marginBottom:14 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const bg = type==="error" ? C.red : type==="ok" ? C.green : C.accent1;
  return (
    <div style={{
      position:"fixed", bottom:24, right:24, zIndex:999,
      background: bg, color:"#000", padding:"12px 20px",
      borderRadius:10, fontWeight:700, fontSize:13,
      boxShadow:"0 8px 30px #00000060",
      animation:"fadeIn 0.3s ease",
    }}>{msg}</div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const fileRef = useRef();
  const [fileName, setFileName] = useState("");
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [nDraws, setNDraws] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ msg:"", type:"" });
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("grilles");

  const [cfg, setCfg] = useState({
    nGrids:10, topBalls:15, topStars:6,
    mesoMonths:4, microWeeks:4,
    wMacro:0.40, wMeso:0.35, wMicro:0.25,
  });

  const notify = (msg, type="info", ms=3500) => {
    setToast({msg, type});
    setTimeout(() => setToast({msg:"",type:""}), ms);
  };

  // Upload CSV
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await apiFetch("/api/upload", { method:"POST", body:fd });
      setNDraws(res.n_draws);
      setCsvLoaded(true);
      notify(`✅ ${res.n_draws} tirages chargés !`, "ok");
    } catch(err) {
      notify(`❌ ${err.message}`, "error");
      setCsvLoaded(false);
    } finally {
      setLoading(false);
    }
  };

  // Lancer ML
  const runAnalysis = useCallback(async () => {
    if (!csvLoaded) return notify("Uploadez d'abord votre CSV", "error");
    const wSum = cfg.wMacro+cfg.wMeso+cfg.wMicro;
    if (Math.abs(wSum-1)>0.02) return notify(`Les poids doivent sommer à 1.0 (actuellement ${wSum.toFixed(2)})`, "error");
    setLoading(true);
    try {
      const res = await apiFetch("/api/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify(cfg),
      });
      setResult(res);
      setTab("grilles");
      notify(`🎯 ${res.grids.length} grilles générées — réduction ${res.reduction}%`, "ok");
    } catch(err) {
      notify(`❌ ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [csvLoaded, cfg]);

  const wTotal = cfg.wMacro+cfg.wMeso+cfg.wMicro;
  const wOk = Math.abs(wTotal-1)<0.02;

  // Données charts
  const ballChartData = result ? Array.from({length:50},(_,i)=>({
    n: i+1,
    Score: +(+result.scores.balls[i+1]*100).toFixed(1),
    Fréquence: result.frequencies.balls[i+1],
    Macro: +(+result.layers.macro.balls[i+1]*100).toFixed(1),
    Méso: +(+result.layers.meso.balls[i+1]*100).toFixed(1),
    Micro: +(+result.layers.micro.balls[i+1]*100).toFixed(1),
  })) : [];

  const starChartData = result ? Array.from({length:12},(_,i)=>({
    n: i+1,
    Score: +(+result.scores.stars[i+1]*100).toFixed(1),
    Fréquence: result.frequencies.stars[i+1],
  })) : [];

  const gapData = result ? Array.from({length:50},(_,i)=>({
    n: i+1,
    Écart: result.gaps.balls[i+1],
  })) : [];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* NAV */}
      <nav style={{
        background:`linear-gradient(90deg,#080e1c,#110a22)`,
        borderBottom:`1px solid ${C.border}`,
        padding:"0 28px", height:60,
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:36, height:36, borderRadius:10, fontSize:18,
            background:"linear-gradient(135deg,#00d4ff,#a855f7)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>🎰</div>
          <div>
            <span style={{ fontWeight:800, fontSize:16 }}>EuroMillions</span>
            <span style={{ color:C.accent1, fontWeight:800, fontSize:16 }}> Optimizer</span>
            <div style={{ fontSize:9, color:C.muted }}>ML 3 couches · FastAPI + React</div>
          </div>
        </div>
        {result && (
          <div style={{ display:"flex", gap:20 }}>
            {[
              ["Tirages",`${result.n_draws}`],
              ["Réduction",`${result.reduction}%`,C.green],
              ["Espace",`${result.searchSpace?.toLocaleString()} grilles`,C.accent1],
            ].map(([l,v,c=C.text])=>(
              <div key={l} style={{ textAlign:"right" }}>
                <div style={{ fontSize:9, color:C.muted }}>{l}</div>
                <div style={{ fontSize:14, fontWeight:800, color:c, fontFamily:"monospace" }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div style={{ display:"flex", maxWidth:1400, margin:"0 auto", padding:"20px 20px 0" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width:270, flexShrink:0, marginRight:20,
          background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:14, padding:18,
          position:"sticky", top:20, height:"fit-content",
        }}>
          <p style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:16 }}>⚙️ Configuration</p>

          {/* Upload zone */}
          <div style={{
            border:`2px dashed ${csvLoaded ? C.green : C.border}`,
            borderRadius:10, padding:14, textAlign:"center",
            marginBottom:18, cursor:"pointer",
          }} onClick={()=>fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleFile} />
            <div style={{ fontSize:26, marginBottom:4 }}>{csvLoaded?"✅":"📂"}</div>
            <div style={{ fontSize:10, color: csvLoaded?C.green:C.muted, lineHeight:1.5 }}>
              {csvLoaded ? `${fileName}\n${nDraws} tirages` : "Cliquer pour importer\nCSV FDJ officiel"}
            </div>
          </div>

          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginBottom:14 }}>
            <p style={{ fontSize:10, color:C.muted, fontWeight:600, marginBottom:10 }}>GÉNÉRATION</p>
            <Slider label="Nombre de grilles" value={cfg.nGrids} min={1} max={50} step={1}
              onChange={v=>setCfg(c=>({...c,nGrids:v}))} />
            <Slider label="Boules candidates" value={cfg.topBalls} min={5} max={30} step={1}
              onChange={v=>setCfg(c=>({...c,topBalls:v}))}
              unit={` → ${comb(cfg.topBalls,5).toLocaleString()} comb.`} />
            <Slider label="Étoiles candidates" value={cfg.topStars} min={2} max={12} step={1}
              onChange={v=>setCfg(c=>({...c,topStars:v}))} />
          </div>

          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginBottom:14 }}>
            <p style={{ fontSize:10, color:C.muted, fontWeight:600, marginBottom:10 }}>FENÊTRES</p>
            <Slider label="Méso (moyen terme)" value={cfg.mesoMonths} min={1} max={12} step={1}
              onChange={v=>setCfg(c=>({...c,mesoMonths:v}))} unit=" mois" color={C.accent2} />
            <Slider label="Micro (court terme)" value={cfg.microWeeks} min={1} max={12} step={1}
              onChange={v=>setCfg(c=>({...c,microWeeks:v}))} unit=" sem." color={C.green} />
          </div>

          <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginBottom:18 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <p style={{ fontSize:10, color:C.muted, fontWeight:600 }}>PONDÉRATIONS</p>
              <span style={{ fontSize:10, fontWeight:700, color: wOk?C.green:C.red }}>
                {(wTotal*100).toFixed(0)}% {wOk?"✓":"≠100%"}
              </span>
            </div>
            <Slider label="Macro (long terme)" value={cfg.wMacro} min={0.1} max={0.8} step={0.05}
              onChange={v=>setCfg(c=>({...c,wMacro:+v.toFixed(2)}))} color="#a855f7" />
            <Slider label="Méso (moyen terme)" value={cfg.wMeso} min={0.1} max={0.8} step={0.05}
              onChange={v=>setCfg(c=>({...c,wMeso:+v.toFixed(2)}))} color={C.accent2} />
            <Slider label="Micro (court terme)" value={cfg.wMicro} min={0.05} max={0.5} step={0.05}
              onChange={v=>setCfg(c=>({...c,wMicro:+v.toFixed(2)}))} color={C.green} />
          </div>

          <button onClick={runAnalysis} disabled={loading||!csvLoaded||!wOk} style={{
            width:"100%", padding:"13px 0", borderRadius:10, border:"none",
            background: csvLoaded&&wOk ? "linear-gradient(135deg,#00d4ff,#a855f7)" : C.border,
            color: csvLoaded&&wOk ? "#000" : C.muted,
            fontWeight:800, fontSize:13, cursor: csvLoaded&&wOk?"pointer":"not-allowed",
            transition:"all 0.2s",
          }}>
            {loading ? "⏳ Analyse en cours..." : "🔄 Lancer l'analyse ML"}
          </button>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex:1, minWidth:0 }}>
          {!result && !loading && (
            <div style={{ textAlign:"center", padding:"70px 30px" }}>
              <div style={{ fontSize:72, marginBottom:16 }}>🎰</div>
              <h1 style={{ fontSize:26, fontWeight:900, marginBottom:10 }}>
                EuroMillions <span style={{ color:C.accent1 }}>Optimizer</span>
              </h1>
              <p style={{ color:C.muted, fontSize:14, maxWidth:480, margin:"0 auto 36px" }}>
                Importez votre historique FDJ, configurez les paramètres ML,
                et générez des grilles statistiquement optimisées.
              </p>
              <div style={{ display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap" }}>
                {[
                  ["📊","Macro","10 ans · fréquences · co-occurrences","#a855f7"],
                  ["📈","Méso","3-6 mois · pondération exponentielle",C.accent2],
                  ["⚡","Micro","2-6 sem. · écarts · momentum",C.green],
                ].map(([icon,title,desc,color])=>(
                  <div key={title} style={{
                    background:C.card, border:`1px solid ${C.border}`,
                    borderTop:`3px solid ${color}`,
                    borderRadius:12, padding:"16px 18px", width:200, textAlign:"left",
                  }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
                    <div style={{ fontWeight:700, marginBottom:4 }}>{title}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign:"center", padding:80, color:C.muted }}>
              <div style={{ fontSize:40, marginBottom:12 }}>⚙️</div>
              <div style={{ fontSize:14 }}>Calcul des modèles ML en cours...</div>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Banner stats */}
              <div style={{
                display:"flex", gap:16, flexWrap:"wrap", marginBottom:20,
                background:C.card, border:`1px solid ${C.border}`,
                borderRadius:12, padding:"12px 18px",
              }}>
                {[
                  ["📅 Tirages analysés", result.n_draws, C.text],
                  ["🗜️ Réduction espace", result.reduction+"%", C.green],
                  ["🎯 Grilles possibles", result.searchSpace?.toLocaleString(), C.gold],
                  ["📉 vs initial", comb(50,5)*comb(12,2)+" → "+result.searchSpace?.toLocaleString(), C.accent1],
                ].map(([l,v,c])=>(
                  <div key={l}>
                    <div style={{ fontSize:9, color:C.muted }}>{l}</div>
                    <div style={{ fontSize:15, fontWeight:800, color:c, fontFamily:"monospace" }}>{v}</div>
                  </div>
                ))}
              </div>

              <Tabs tabs={[
                {id:"grilles",label:"🎯 Grilles"},
                {id:"scores",label:"📊 Scores ML"},
                {id:"freq",label:"📈 Fréquences"},
                {id:"gaps",label:"⏱ Écarts"},
              ]} active={tab} onChange={setTab} />

              {/* GRILLES */}
              {tab==="grilles" && (
                <div>
                  <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                    <div style={{ flex:"1 1 240px", background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:9, color:C.muted, marginBottom:8 }}>TOP BOULES SÉLECTIONNÉES</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {result.topBalls?.map(b=><Ball key={b} n={b} size={34} glow />)}
                      </div>
                    </div>
                    <div style={{ flex:"1 1 140px", background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:9, color:C.muted, marginBottom:8 }}>TOP ÉTOILES SÉLECTIONNÉES</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {result.topStars?.map(s=><Ball key={s} n={s} type="star" size={34} glow />)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))", gap:12 }}>
                    {result.grids.map((g,i)=><GridCard key={g.id} g={g} rank={i+1} />)}
                  </div>
                </div>
              )}

              {/* SCORES */}
              {tab==="scores" && (
                <div>
                  <ChartBox title="📊 Score composite par boule (1–50)" sub="Combinaison des 3 couches Macro · Méso · Micro">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={ballChartData} margin={{top:5,right:10,bottom:5,left:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="n" tick={{fill:C.muted,fontSize:9}} interval={4} />
                        <YAxis tick={{fill:C.muted,fontSize:9}} />
                        <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8}} />
                        <Legend />
                        <Bar dataKey="Score"  fill={C.accent1} radius={[3,3,0,0]} />
                        <Bar dataKey="Macro"  fill="#a855f7"   radius={[3,3,0,0]} />
                        <Bar dataKey="Méso"   fill={C.accent2} radius={[3,3,0,0]} />
                        <Bar dataKey="Micro"  fill={C.green}   radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                  <ChartBox title="⭐ Score composite par étoile (1–12)">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={starChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="n" tick={{fill:C.muted,fontSize:10}} />
                        <YAxis tick={{fill:C.muted,fontSize:10}} />
                        <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8}} />
                        <Bar dataKey="Score" radius={[4,4,0,0]}>
                          {starChartData.map((_,i)=><Cell key={i} fill={C.gold} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                </div>
              )}

              {/* FRÉQUENCES */}
              {tab==="freq" && (
                <div>
                  <ChartBox title="📈 Fréquences historiques — Boules" sub={`Sur ${result.n_draws} tirages`}>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={ballChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="n" tick={{fill:C.muted,fontSize:9}} interval={4} />
                        <YAxis tick={{fill:C.muted,fontSize:9}} />
                        <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8}} />
                        <Bar dataKey="Fréquence" radius={[3,3,0,0]}>
                          {ballChartData.map((e,i)=><Cell key={i} fill={`hsl(${200+e.Fréquence/8}deg,70%,50%)`} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                  <ChartBox title="⭐ Fréquences historiques — Étoiles">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={starChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="n" tick={{fill:C.muted,fontSize:10}} />
                        <YAxis tick={{fill:C.muted,fontSize:10}} />
                        <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8}} />
                        <Bar dataKey="Fréquence" radius={[4,4,0,0]}>
                          {starChartData.map((_,i)=><Cell key={i} fill={C.gold} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                </div>
              )}

              {/* ÉCARTS */}
              {tab==="gaps" && (
                <ChartBox title="⏱ Écart depuis dernière apparition — Boules" sub="Rouge = en manque depuis >30j · Vert = récent">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={gapData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="n" tick={{fill:C.muted,fontSize:9}} interval={4} />
                      <YAxis tick={{fill:C.muted,fontSize:9}} />
                      <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8}}
                        formatter={v=>[`${v} jours`,"Écart"]} />
                      <Bar dataKey="Écart" radius={[3,3,0,0]}>
                        {gapData.map((e,i)=>(
                          <Cell key={i} fill={e.Écart>30?C.red:e.Écart>14?C.gold:C.green} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", gap:20, marginTop:10, fontSize:10, color:C.muted }}>
                    <span><span style={{color:C.green}}>■</span> &lt;14j récent</span>
                    <span><span style={{color:C.gold}}>■</span> 14–30j moyen</span>
                    <span><span style={{color:C.red}}>■</span> &gt;30j en manque</span>
                  </div>
                </ChartBox>
              )}
            </>
          )}
        </main>
      </div>

      <div style={{ textAlign:"center", padding:20, color:C.muted, fontSize:9, marginTop:20 }}>
        ⚠️ Outil analytique uniquement. EuroMillions est un jeu de hasard. Jouez de manière responsable.
      </div>

      <Toast {...toast} />
    </div>
  );
}
