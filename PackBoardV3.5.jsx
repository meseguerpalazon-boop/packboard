import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/* ════════════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ════════════════════════════════════════════════════════════════════ */
const T = {
  side:      "#0B1220",
  sideActive:"rgba(59,130,246,0.16)",
  sideBord:  "#1E293B",
  sideText:  "#94A3B8",
  sideTextAct:"#60A5FA",

  bg:      "#F6F7FB",
  surface: "#FFFFFF",
  border:  "#E7E9F0",
  title:   "#0F172A",
  body:    "#475569",
  muted:   "#94A3B8",

  blue:    "#3B82F6",
  blueLt:  "#93C5FD",
  green:   "#10B981",
  greenLt: "#6EE7B7",
  violet:  "#8B5CF6",
  orange:  "#F59E0B",
  red:     "#EF4444",
};
/* Paleta ampliada reutilizada por los componentes CRM (alias de T) */
const C = {
  ...T,
  brand:T.blue, brandLt:T.blueLt, brandBg:"#EFF6FF",
  ok:T.green, okBg:"#ECFDF5",
  warn:T.orange, warnBg:"#FFFBEB",
  crit:T.red, critBg:"#FEF2F2",
  info:T.blue, infoBg:"#EFF6FF",
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const NAV = [
  { id:"dashboard", icon:"🏠", label:"Dashboard" },
  { id:"crm",       icon:"📇", label:"CRM" },
  { id:"clientes",  icon:"👥", label:"Clientes" },
  { id:"rutas",     icon:"🗺️", label:"Rutas" },
  { id:"ofertas",   icon:"📄", label:"Ofertas" },
  { id:"pedidos",   icon:"🛒", label:"Pedidos" },
  { id:"facturas",  icon:"🧾", label:"Facturas" },
  { id:"agenda",    icon:"📅", label:"Agenda" },
  { id:"whatsapp",  icon:"💬", label:"WhatsApp" },
  { id:"gmail",     icon:"📧", label:"Gmail" },
  { id:"noticias",  icon:"📰", label:"Noticias" },
  { id:"ia",        icon:"✨", label:"IA" },
  { id:"reportes",  icon:"📊", label:"Reportes" },
  { id:"config",    icon:"⚙️", label:"Configuración" },
];

/* ─── AUTENTICACIÓN — usuario maestro + subusuarios con permisos ────── */
const USERS_KEY = "packboard-usuarios";
const SESSION_KEY = "packboard-session";
const ALL_MODULE_IDS = NAV.map(n=>n.id);
function randomSalt(){
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function hashPassword(password, salt){
  const enc = new TextEncoder().encode(salt+"::"+password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ─── helpers generales ──────────────────────────────────────────────── */
const fmtE = v => `${Math.round(v).toLocaleString("es-ES")} €`;
const fmtE2 = v => v==null?"—":`${parseFloat(v).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
const pct  = v => `${v>0?"+":""}${v.toFixed(1)}%`;
const today = () => new Date().toISOString().split("T")[0];
const uid = () => Date.now() + Math.random();
const fmtN = v => parseFloat(v)||0;
async function load(key){ try{ const r = await window.storage.get(key); return r?.value?JSON.parse(r.value):null; }catch{ return null; } }
async function save(key,val){ try{ await window.storage.set(key,JSON.stringify(val)); }catch{} }

/* ─── pantalla completa (móvil / escritorio) ────────────────────────── */
function isStandalonePWA(){
  if(typeof window==="undefined") return false;
  return (window.matchMedia?.("(display-mode: standalone)").matches) || window.navigator.standalone===true;
}
function isCurrentlyFullscreen(){
  if(typeof document==="undefined") return false;
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}
function useFullscreen(){
  const [isFullscreen, setIsFullscreen] = useState(()=>isCurrentlyFullscreen());
  useEffect(()=>{
    const onChange = () => setIsFullscreen(isCurrentlyFullscreen());
    ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"].forEach(ev=>document.addEventListener(ev, onChange));
    return () => ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"].forEach(ev=>document.removeEventListener(ev, onChange));
  },[]);

  // toggle devuelve una promesa que resuelve en true (éxito) o false (bloqueado/no soportado),
  // para que quien lo llame pueda avisar al usuario en vez de fallar en silencio.
  const toggle = () => new Promise((resolve)=>{
    const el = document.documentElement;
    if(!isCurrentlyFullscreen()){
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if(!req){ resolve(false); return; }
      const result = req.call(el);
      if(result && typeof result.then === "function"){
        result.then(()=>resolve(true)).catch(()=>resolve(false));
      } else {
        // Safari antiguo/webkit no siempre devuelve promesa: comprobamos tras un tick
        setTimeout(()=>resolve(isCurrentlyFullscreen()), 150);
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if(!exit){ resolve(false); return; }
      const result = exit.call(document);
      if(result && typeof result.then === "function"){
        result.then(()=>resolve(true)).catch(()=>resolve(false));
      } else {
        setTimeout(()=>resolve(!isCurrentlyFullscreen()), 150);
      }
    }
  });
  return [isFullscreen, toggle];
}

function genSerie(base, meses=12, volat=0.12){
  let v = base;
  return Array.from({length:meses},(_,i)=>{
    v = v * (1 + 0.015 + (Math.random()*volat - volat/2));
    return Math.round(v);
  });
}

function genDashboardData(){
  const cobrado = genSerie(140000, 12, 0.10);
  const meta    = cobrado.map(v=>Math.round(v*1.10 + Math.random()*8000));
  const margen  = Array.from({length:12},()=> +(24+Math.random()*10).toFixed(1));
  return {
    kpis: {
      ventasHoy:     { v: Math.round(9000+Math.random()*6000),  d: +(6+Math.random()*10).toFixed(1) },
      pipelineActivo:{ v: Math.round(210000+Math.random()*60000), d: +(4+Math.random()*8).toFixed(1) },
      cobradoHoy:    { v: Math.round(6000+Math.random()*4000),  d: +(8+Math.random()*12).toFixed(1) },
      margenNeto:    { v: +(25+Math.random()*8).toFixed(1),     d: +(0.5+Math.random()*2.5).toFixed(1) },
      contactosNuevos:{ v: Math.round(80+Math.random()*60),     d: +(10+Math.random()*15).toFixed(1) },
      velocidadVenta:{ v: Math.round(18+Math.random()*14),      d: -(2+Math.random()*6).toFixed(1) },
      tasaConversion:{ v: +(18+Math.random()*15).toFixed(1),    d: +(1+Math.random()*4).toFixed(1) },
      ticketMedio:   { v: Math.round(1800+Math.random()*2200),  d: +(2+Math.random()*6).toFixed(1) },
      facturacionMes:{ v: Math.round(120000+Math.random()*40000), d: +(5+Math.random()*10).toFixed(1) },
    },
    ingresos: MONTHS.map((m,i)=>({ mes:m, cobrado:cobrado[i], meta:meta[i] })),
    margenSerie: MONTHS.map((m,i)=>({ mes:m, margen:margen[i] })),
    pipeline: [
      { fase:"Pendiente",   color:"#CBD5E1", v: Math.round(50000+Math.random()*20000) },
      { fase:"Visitado",    color:"#34D399", v: Math.round(38000+Math.random()*18000) },
      { fase:"Interesado",  color:"#FBBF24", v: Math.round(28000+Math.random()*15000) },
      { fase:"Propuesta",   color:"#60A5FA", v: Math.round(26000+Math.random()*14000) },
      { fase:"Negociación", color:"#A78BFA", v: Math.round(22000+Math.random()*12000) },
      { fase:"Cerrado",     color:"#10B981", v: Math.round(15000+Math.random()*10000) },
    ],
    cobro: {
      cobrado:   Math.round(150000+Math.random()*40000),
      pendiente: Math.round(60000+Math.random()*30000),
    },
    actividad: [
      { icon:"✅", color:T.green,  bg:"#ECFDF5", titulo:"Factura FAC-2025-0451 cobrada", sub:"Cliente: Frigoríficos del Norte SL", t:"Hoy, 11:24" },
      { icon:"📄", color:T.blue,   bg:"#EFF6FF", titulo:"Nueva oferta OF-2025-078 creada", sub:"Cliente: LogiTrans Ibérica SL", t:"Hoy, 10:15" },
      { icon:"👤", color:T.orange, bg:"#FFFBEB", titulo:"Nuevo contacto añadido", sub:"Carlos Gutiérrez · Director de Compras", t:"Hoy, 09:42" },
      { icon:"📅", color:T.violet, bg:"#F5F3FF", titulo:"Reunión con PackFresh SL", sub:"Visita comercial programada", t:"Hoy, 09:00" },
    ],
  };
}

/* ─── mini sparkline ──────────────────────────────────────────────────── */
function Spark({ data, color }){
  if(!data || data.length<2) return null;
  const w=140,h=34;
  const min=Math.min(...data), max=Math.max(...data);
  const range = (max-min)||1;
  const pts = data.map((v,i)=>{
    const x = (i/(data.length-1))*w;
    const y = h - ((v-min)/range)*h;
    return `${x},${y}`;
  }).join(" ");
  const areaPts = `0,${h} ${pts} ${w},${h}`;
  const gid = `sg-${color.replace("#","")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function KpiCard({ label, value, delta, spark, color, isPct }){
  const up = delta >= 0;
  return (
    <div style={{ background:T.surface, borderRadius:16, padding:"16px 18px", border:`1px solid ${T.border}`, boxShadow:"0 1px 2px rgba(15,23,42,.04)" }}>
      <div style={{ fontSize:12.5, color:T.body, marginBottom:8, fontWeight:500 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:10 }}>
        <span style={{ fontSize:23, fontWeight:800, color:T.title, letterSpacing:-0.4 }}>{value}</span>
        <span style={{ fontSize:12, fontWeight:700, color: up?T.green:T.red, display:"flex", alignItems:"center", gap:2 }}>
          {up?"↑":"↓"} {Math.abs(delta).toFixed(1)}{isPct?" pp":"%"}
        </span>
      </div>
      <Spark data={spark} color={color}/>
      <div style={{ fontSize:10.5, color:T.muted, marginTop:4 }}>vs ayer</div>
    </div>
  );
}

function IngresosTooltip({ active, payload, label }){
  if(!active || !payload?.length) return null;
  const cobrado = payload.find(p=>p.dataKey==="cobrado")?.value;
  const meta    = payload.find(p=>p.dataKey==="meta")?.value;
  return (
    <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", boxShadow:"0 8px 24px rgba(15,23,42,.12)", fontSize:12 }}>
      <div style={{ fontWeight:700, color:T.title, marginBottom:6 }}>{label} 2026</div>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
        <span style={{ width:7,height:7,borderRadius:"50%",background:T.blue }}/>
        <span style={{ color:T.body }}>Cobrado</span>
        <strong style={{ marginLeft:"auto", color:T.title }}>{fmtE(cobrado)}</strong>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ width:7,height:7,borderRadius:"50%",background:T.muted }}/>
        <span style={{ color:T.body }}>Meta</span>
        <strong style={{ marginLeft:"auto", color:T.title }}>{fmtE(meta)}</strong>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AGENDA
   ════════════════════════════════════════════════════════════════════ */
function toGCalDate(dateStr, timeStr){
  const [h,m] = (timeStr||"10:00").split(":");
  return `${dateStr.replace(/-/g,"")}T${h.padStart(2,"0")}${m.padStart(2,"0")}00`;
}
function gcalLink(ev){
  const startD = toGCalDate(ev.fecha, ev.hora);
  const endDate = new Date(`${ev.fecha}T${(ev.hora||"10:00")}:00`);
  endDate.setMinutes(endDate.getMinutes() + (ev.duracion||60));
  const endD = `${endDate.getFullYear()}${String(endDate.getMonth()+1).padStart(2,"0")}${String(endDate.getDate()).padStart(2,"0")}T${String(endDate.getHours()).padStart(2,"0")}${String(endDate.getMinutes()).padStart(2,"0")}00`;
  const params = new URLSearchParams({
    action:"TEMPLATE",
    text: ev.titulo,
    dates: `${startD}/${endD}`,
    details: ev.notas||"",
    location: ev.lugar||"",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function buildICS(eventos){
  const pad = n => String(n).padStart(2,"0");
  const toICSDate = (fecha,hora) => {
    const d = new Date(`${fecha}T${hora||"10:00"}:00`);
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  };
  const body = eventos.map(ev=>{
    const start = toICSDate(ev.fecha, ev.hora);
    const endDate = new Date(`${ev.fecha}T${ev.hora||"10:00"}:00`);
    endDate.setMinutes(endDate.getMinutes()+(ev.duracion||60));
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    return [
      "BEGIN:VEVENT",
      `UID:${ev.id}@packboard`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${ev.titulo}`,
      `DESCRIPTION:${(ev.notas||"").replace(/\n/g," ")}`,
      `LOCATION:${ev.lugar||""}`,
      "END:VEVENT",
    ].join("\n");
  }).join("\n");
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PackBoard//ES\n${body}\nEND:VCALENDAR`;
}
const inputStyle = { padding:"9px 12px", borderRadius:9, border:`1px solid ${T.border}`, fontSize:13, color:T.title, outline:"none", boxSizing:"border-box" };

function AgendaView(){
  const [eventos, setEventos] = useState([]);
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo:"", fecha:today(), hora:"10:00", duracion:60, lugar:"", notas:"" });

  useEffect(()=>{ (async()=>{ const d = await load("packboard-agenda"); if(d) setEventos(d); setReady(true); })(); },[]);

  const addEvento = async () => {
    if(!form.titulo.trim()) return;
    const nuevo = { id: uid(), ...form };
    const updated = [...eventos, nuevo];
    setEventos(updated);
    await save("packboard-agenda", updated);
    setForm({ titulo:"", fecha:today(), hora:"10:00", duracion:60, lugar:"", notas:"" });
    setShowForm(false);
  };
  const delEvento = async (id) => {
    const updated = eventos.filter(e=>e.id!==id);
    setEventos(updated);
    await save("packboard-agenda", updated);
  };
  const exportarICS = () => {
    if(eventos.length===0) return;
    const ics = buildICS(eventos);
    const blob = new Blob([ics], { type:"text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "packboard-agenda.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  const ordenados = [...eventos].sort((a,b)=> (a.fecha+a.hora).localeCompare(b.fecha+b.hora));

  return (
    <div>
      <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:14, padding:"16px 20px", marginBottom:18 }}>
        <div style={{ fontWeight:700, color:T.title, fontSize:13, marginBottom:6 }}>📅 Cómo funciona la sincronización con Google Calendar</div>
        <div style={{ fontSize:12.5, color:T.body, lineHeight:1.6 }}>
          PackBoard no puede escribir directamente en tu Google Calendar desde el navegador sin exponer credenciales. Cada evento tiene un botón <strong>"+ Google Calendar"</strong> que abre el evento ya rellenado — solo pulsas <em>Guardar</em>. Para subir todos de golpe, usa <strong>"Exportar .ics"</strong> e impórtalo desde Google Calendar → Configuración → Importar y exportar.
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <h2 style={{ fontSize:18, fontWeight:800, color:T.title, margin:0 }}>Agenda ({eventos.length})</h2>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={exportarICS} style={{ padding:"8px 16px", borderRadius:9, border:`1px solid ${T.border}`, background:"#fff", color:T.body, fontSize:12.5, fontWeight:700, cursor:"pointer" }}>⬇️ Exportar .ics</button>
          <button onClick={()=>setShowForm(s=>!s)} style={{ padding:"8px 16px", borderRadius:9, border:"none", background:T.blue, color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer" }}>{showForm?"✕ Cancelar":"+ Nuevo evento"}</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background:T.surface, borderRadius:14, padding:18, border:`1px solid ${T.border}`, marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10, marginBottom:10 }}>
            <input value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} placeholder="Título (ej. Visita a Juver Alimentación)" style={inputStyle}/>
            <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))} style={inputStyle}/>
            <input type="time" value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))} style={inputStyle}/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <input value={form.lugar} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))} placeholder="Lugar / dirección" style={inputStyle}/>
            <input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas" style={inputStyle}/>
          </div>
          <button onClick={addEvento} style={{ padding:"8px 18px", borderRadius:9, border:"none", background:T.title, color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer" }}>Guardar evento</button>
        </div>
      )}

      {!ready ? <div style={{ color:T.muted, fontSize:13 }}>Cargando agenda…</div> :
       ordenados.length===0 ? (
        <div style={{ background:T.surface, borderRadius:14, border:`1px dashed ${T.border}`, padding:32, textAlign:"center", color:T.muted, fontSize:13 }}>
          Sin eventos todavía. Crea el primero con "+ Nuevo evento".
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {ordenados.map(ev=>(
            <div key={ev.id} style={{ background:T.surface, borderRadius:12, border:`1px solid ${T.border}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ background:"#EFF6FF", color:T.blue, borderRadius:9, padding:"8px 10px", textAlign:"center", minWidth:56 }}>
                <div style={{ fontSize:15, fontWeight:800 }}>{ev.fecha.split("-")[2]}</div>
                <div style={{ fontSize:9, fontWeight:700 }}>{MONTHS[+ev.fecha.split("-")[1]-1]}</div>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:T.title }}>{ev.titulo}</div>
                <div style={{ fontSize:11.5, color:T.muted, marginTop:2 }}>🕐 {ev.hora} {ev.lugar && `· 📍 ${ev.lugar}`}</div>
              </div>
              <a href={gcalLink(ev)} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, fontWeight:700, color:T.blue, textDecoration:"none", border:`1px solid #BFDBFE`, background:"#EFF6FF", borderRadius:8, padding:"6px 12px", whiteSpace:"nowrap" }}>+ Google Calendar</a>
              <button onClick={()=>delEvento(ev.id)} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:13 }}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   GMAIL — helpers de OAuth (Google Identity Services) y de la API
   ════════════════════════════════════════════════════════════════════ */
function loadGsiScript(){
  return new Promise((resolve,reject)=>{
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const existing = document.getElementById("gsi-client-script");
    if (existing) { existing.addEventListener("load",()=>resolve()); existing.addEventListener("error",()=>reject(new Error("gsi"))); return; }
    const s = document.createElement("script");
    s.id = "gsi-client-script";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });
}
function b64urlDecode(str){
  try {
    const norm = str.replace(/-/g,"+").replace(/_/g,"/");
    const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
    return decodeURIComponent(atob(pad).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join(""));
  } catch { return ""; }
}
function b64urlEncode(str){
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function buildRawEmail({ to, subject, body }){
  const msg = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject||"(sin asunto)")))}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
  return b64urlEncode(msg);
}
function extraerCuerpoEmail(payload){
  if(!payload) return "";
  if(payload.mimeType==="text/plain" && payload.body?.data) return b64urlDecode(payload.body.data);
  if(payload.parts){
    const plain = payload.parts.find(p=>p.mimeType==="text/plain");
    if(plain?.body?.data) return b64urlDecode(plain.body.data);
    for(const p of payload.parts){ const r = extraerCuerpoEmail(p); if(r) return r; }
  }
  if(payload.body?.data) return b64urlDecode(payload.body.data);
  return "";
}
function limpiarRemitente(from){
  const m = (from||"").match(/^"?([^"<]*)"?\s*<?([^>]*)>?$/);
  return m ? { nombre:(m[1]||m[2]||"").trim(), email:(m[2]||m[1]||"").trim() } : { nombre:from, email:from };
}

/* ════════════════════════════════════════════════════════════════════
   WHATSAPP — analizador de chats exportados
   ════════════════════════════════════════════════════════════════════ */
function WhatsAppView({ clientes, addTarea, addInteraccion, showToast }){
  const [raw, setRaw] = useState("");
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const analizar = async () => {
    if(!raw.trim()) return;
    setLoading(true); setItems(null);
    const nombresClientes = clientes.map(c=>c.empresa).join(", ") || "(sin clientes registrados aún)";
    const prompt = `Eres un asistente comercial. Te paso una conversación de WhatsApp exportada con un cliente de una empresa de packaging/cartón. Detecta consultas, pedidos y quejas.

Clientes ya registrados en el CRM (para intentar hacer match por nombre si aparece): ${nombresClientes}

CONVERSACIÓN:
"""
${raw.slice(0, 6000)}
"""

Devuelve SOLO un array JSON (sin texto adicional, sin markdown, sin backticks) con este formato exacto:
[{"tipo":"pedido|consulta|queja","resumen":"resumen breve en español, máx 20 palabras","clienteProbable":"nombre si se identifica o null","prioridad":"alta|media|baja"}]

Si no detectas nada relevante, devuelve un array vacío [].`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1200, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"[]";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setItems(Array.isArray(parsed)?parsed:[]);
    } catch {
      setItems([]);
      showToast?.("No se pudo analizar el chat","warn");
    }
    setLoading(false);
  };

  const crearTareaDesde = async (item) => {
    const cl = clientes.find(c=>c.empresa.toLowerCase()===String(item.clienteProbable||"").toLowerCase());
    await addTarea({ titulo:`[WhatsApp] ${item.resumen}`, notas:`Detectado automáticamente · tipo: ${item.tipo}`, vencimiento:today(), prioridad:item.prioridad==="alta"?"alta":item.prioridad==="baja"?"baja":"media", clienteId: cl?cl.id:null });
    if(cl) await addInteraccion({ clienteId:cl.id, tipo:"nota", nota:`WhatsApp: ${item.resumen}` });
    showToast?.("Tarea creada desde WhatsApp");
  };

  const TIPO_COLOR = { pedido:T.green, consulta:T.blue, queja:T.red };
  const TIPO_ICON  = { pedido:"📦", consulta:"❓", queja:"⚠️" };

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>WhatsApp</h1>
        <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Detecta pedidos, consultas y quejas en tus conversaciones</p>
      </div>

      <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, padding:"16px 20px", marginBottom:18 }}>
        <div style={{ fontWeight:700, color:T.title, fontSize:13, marginBottom:6 }}>💬 Por qué no se conecta directamente a WhatsApp</div>
        <div style={{ fontSize:12.5, color:T.body, lineHeight:1.6 }}>
          WhatsApp no ofrece ninguna API pública para leer chats personales — solo existe la <strong>API de WhatsApp Business</strong>, que requiere una cuenta de empresa verificada por Meta y un servidor propio con webhooks, algo fuera del alcance de esta app. La alternativa real que sí funciona: exporta la conversación desde WhatsApp (abre el chat → ⋮ → Más → Exportar chat → sin archivos multimedia) y pégala aquí. La IA la analiza igual.
        </div>
      </div>

      <Card style={{ marginBottom:16 }}>
        <SectionTitle>Pegar conversación exportada</SectionTitle>
        <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Pega aquí el texto exportado del chat de WhatsApp…"
          style={{ width:"100%", minHeight:160, padding:"10px 12px", borderRadius:9, border:`1px solid ${C.border}`, fontSize:12.5, color:C.title, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"monospace" }}/>
        <Btn onClick={analizar} disabled={loading||!raw.trim()} style={{ marginTop:10 }}>{loading?"Analizando…":"🤖 Analizar con IA"}</Btn>
      </Card>

      {items && (
        items.length===0 ? (
          <div style={{ textAlign:"center", padding:30, color:C.muted, fontSize:12.5 }}>No se detectaron pedidos, consultas ni quejas en este texto.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {items.map((it,i)=>(
              <Card key={i}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div style={{ display:"flex", gap:10 }}>
                    <span style={{ fontSize:18 }}>{TIPO_ICON[it.tipo]||"📝"}</span>
                    <div>
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                        <Badge label={it.tipo} color={TIPO_COLOR[it.tipo]||C.muted} bg={`${TIPO_COLOR[it.tipo]||C.muted}18`}/>
                        {it.clienteProbable && <span style={{ fontSize:11, color:C.brand, fontWeight:700 }}>{it.clienteProbable}</span>}
                      </div>
                      <div style={{ fontSize:12.5, color:C.title }}>{it.resumen}</div>
                    </div>
                  </div>
                  <Btn size="sm" onClick={()=>crearTareaDesde(it)}>+ Crear tarea</Btn>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   GMAIL — bandeja, análisis IA de pedidos/consultas, redacción y envío
   ════════════════════════════════════════════════════════════════════ */
function GmailModule({ clientId, clientes, addTarea, addInteraccion, showToast }){
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [accessToken, setAccessToken] = useState(null);

  const [tab, setTab] = useState("bandeja"); // bandeja | redactar
  const [emails, setEmails] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedBody, setSelectedBody] = useState("");
  const [loadingBody, setLoadingBody] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [destinatario, setDestinatario] = useState("");
  const [asunto, setAsunto] = useState("");
  const [instruccion, setInstruccion] = useState("");
  const [borrador, setBorrador] = useState("");
  const [redactando, setRedactando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const conectar = async () => {
    const cid = (clientId||"").trim();
    if(!cid){ setConnectError("Primero configura tu Client ID de Google en Configuración."); return; }
    if(!cid.endsWith(".apps.googleusercontent.com")){ setConnectError('Ese Client ID no tiene el formato esperado (debería terminar en ".apps.googleusercontent.com"). Revisa que lo copiaste completo.'); return; }
    let embedded = false;
    try{ embedded = window.self !== window.top; }catch{ embedded = true; }
    if(embedded){
      setConnectError(`Estás viendo PackBoard dentro de una vista previa/iframe (por ejemplo, la vista previa de Claude). Google bloquea el inicio de sesión de Gmail en iframes por seguridad — abre PackBoard en una pestaña normal del navegador (la URL directa donde lo tengas desplegado, no dentro de otra página) e inténtalo de nuevo ahí.`);
      return;
    }
    setConnecting(true); setConnectError("");
    const timeoutId = setTimeout(()=>{
      setConnecting(false);
      setConnectError(`Google no respondió tras 12s. Motivos más probables: (1) el navegador bloqueó la ventana emergente — revisa el icono de bloqueo en la barra de direcciones y permite emergentes para este sitio; (2) el origen "${window.location.origin}" no está añadido en "Orígenes autorizados de JavaScript" de tu Client ID en Google Cloud Console.`);
    }, 12000);
    try{
      await loadGsiScript();
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose",
        callback: (resp) => {
          clearTimeout(timeoutId);
          setConnecting(false);
          if(resp.error){
            console.error("Gmail OAuth error:", resp);
            setConnectError(`Google devolvió un error: "${resp.error}"${resp.error_description?" — "+resp.error_description:""}. Si el error es "access_denied", revisa que tu email esté añadido como "Usuario de prueba" en la pantalla de consentimiento OAuth.`);
            return;
          }
          setAccessToken(resp.access_token);
          setConnected(true);
          cargarBandeja(resp.access_token);
        },
        error_callback: (err) => {
          clearTimeout(timeoutId);
          setConnecting(false);
          console.error("Gmail OAuth error_callback:", err);
          const tipo = err?.type || "desconocido";
          const msg = tipo==="popup_failed_to_open"
            ? "El navegador impidió abrir la ventana de Google. Permite las ventanas emergentes para este sitio y vuelve a intentarlo."
            : tipo==="popup_closed"
            ? "Cerraste la ventana de Google antes de terminar el inicio de sesión."
            : `Google no pudo iniciar el proceso (tipo: ${tipo}). Comprueba que "${window.location.origin}" está en "Orígenes autorizados de JavaScript" de tu Client ID.`;
          setConnectError(msg);
        },
      });
      tokenClient.requestAccessToken();
    }catch(e){
      clearTimeout(timeoutId);
      setConnecting(false);
      console.error("Gmail connect exception:", e);
      setConnectError("No se pudo cargar el sistema de login de Google: "+(e?.message||"error desconocido")+". Revisa tu conexión a internet.");
    }
  };

  const cargarBandeja = async (token) => {
    setLoadingList(true);
    try{
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox", { headers:{ Authorization:`Bearer ${token||accessToken}` } });
      const listData = await listRes.json();
      const ids = (listData.messages||[]).map(m=>m.id);
      const detalles = await Promise.all(ids.map(async id=>{
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers:{ Authorization:`Bearer ${token||accessToken}` } });
        const d = await r.json();
        const headers = d.payload?.headers||[];
        const get = n => headers.find(h=>h.name===n)?.value||"";
        return { id, from:get("From"), subject:get("Subject")||"(sin asunto)", date:get("Date"), snippet:d.snippet||"" };
      }));
      setEmails(detalles);
    }catch{
      showToast?.("No se pudo cargar la bandeja de Gmail","warn");
    }
    setLoadingList(false);
  };

  const abrirEmail = async (email) => {
    setSelected(email); setSelectedBody(""); setAnalysis(null); setLoadingBody(true);
    try{
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${email.id}?format=full`, { headers:{ Authorization:`Bearer ${accessToken}` } });
      const d = await r.json();
      setSelectedBody(extraerCuerpoEmail(d.payload) || email.snippet);
    }catch{
      setSelectedBody(email.snippet||"No se pudo cargar el contenido del correo.");
    }
    setLoadingBody(false);
  };

  const analizarEmail = async () => {
    if(!selected) return;
    setAnalyzing(true); setAnalysis(null);
    const nombresClientes = clientes.map(c=>c.empresa).join(", ")||"(sin clientes registrados aún)";
    const prompt = `Eres un asistente comercial de una empresa de packaging/cartón. Analiza este email recibido de un posible cliente.

De: ${selected.from}
Asunto: ${selected.subject}
Cuerpo:
"""
${selectedBody.slice(0,4000)}
"""

Clientes ya registrados en el CRM: ${nombresClientes}

Devuelve SOLO un objeto JSON (sin markdown, sin backticks, sin texto adicional) con este formato exacto:
{"tipo":"pedido|consulta|queja|otro","resumen":"resumen en español, máx 25 palabras","clienteProbable":"nombre exacto de la lista si coincide, o null","urgente":true,"respuestaSugerida":"borrador breve de respuesta en español, máx 60 palabras"}`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:500, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"{}";
      setAnalysis(JSON.parse(text.replace(/```json|```/g,"").trim()));
    }catch{
      showToast?.("No se pudo analizar el email","warn");
    }
    setAnalyzing(false);
  };

  const crearTareaDesdeEmail = async () => {
    if(!analysis || !selected) return;
    const cl = clientes.find(c=>c.empresa.toLowerCase()===String(analysis.clienteProbable||"").toLowerCase());
    await addTarea({ titulo:`[Gmail] ${analysis.resumen}`, notas:`De: ${selected.from}\nAsunto: ${selected.subject}`, vencimiento:today(), prioridad:analysis.urgente?"alta":"media", clienteId: cl?cl.id:null });
    if(cl) await addInteraccion({ clienteId:cl.id, tipo:"email", nota:analysis.resumen });
    showToast?.("Tarea creada desde el email");
  };

  const usarRespuestaSugerida = () => {
    if(!analysis || !selected) return;
    const remitente = limpiarRemitente(selected.from);
    setDestinatario(remitente.email);
    setAsunto(selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`);
    setBorrador(analysis.respuestaSugerida||"");
    setTab("redactar");
  };

  const redactarConIA = async () => {
    if(!instruccion.trim()) return;
    setRedactando(true);
    const prompt = `Eres Pedro, comercial de una empresa de packaging/cartón. Redacta un email profesional en español según esta instrucción: "${instruccion}".
${destinatario?`Va dirigido a: ${destinatario}.`:""}
Devuelve SOLO el cuerpo del email, sin asunto, sin firma final, tono cercano pero profesional. Máximo 120 palabras.`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:400, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      setBorrador(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"");
    }catch{ showToast?.("Error generando el borrador","warn"); }
    setRedactando(false);
  };

  const enviarEmail = async () => {
    if(!destinatario.trim() || !borrador.trim()){ showToast?.("Falta destinatario o contenido del email","warn"); return; }
    setEnviando(true);
    try{
      const raw = buildRawEmail({ to:destinatario, subject:asunto, body:borrador });
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method:"POST", headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" },
        body: JSON.stringify({ raw }),
      });
      if(!res.ok) throw new Error("send failed");
      showToast?.("Email enviado ✓");
      setDestinatario(""); setAsunto(""); setInstruccion(""); setBorrador("");
    }catch{
      showToast?.("No se pudo enviar el email. Revisa el token/permisos.","warn");
    }
    setEnviando(false);
  };

  if(!connected){
    return (
      <div>
        <div style={{ marginBottom:14 }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Gmail</h1>
          <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Lee correos de clientes, detecta pedidos y consultas con IA, y redacta respuestas</p>
        </div>
        <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, padding:"16px 20px", marginBottom:18 }}>
          <div style={{ fontWeight:700, color:T.title, fontSize:13, marginBottom:6 }}>🔑 Configuración necesaria (una sola vez)</div>
          <div style={{ fontSize:12.5, color:T.body, lineHeight:1.6 }}>
            Gmail exige que cada aplicación tenga su propio "Client ID" de Google — no hay forma de saltarse esto por seguridad, ni yo puedo crearlo por ti porque requiere tu cuenta de Google. Ve a <strong>Configuración</strong>, sigue los pasos indicados ahí (Google Cloud Console → credenciales OAuth) y pega el Client ID. Se hace una vez y queda guardado.
          </div>
        </div>
        <Card style={{ textAlign:"center", padding:40 }}>
          <div style={{ fontSize:38, marginBottom:12 }}>📧</div>
          {connectError && <div style={{ color:T.crit, fontSize:12, marginBottom:12, maxWidth:360, marginLeft:"auto", marginRight:"auto" }}>{connectError}</div>}
          <Btn onClick={conectar} disabled={connecting}>{connecting?"Conectando…":"🔗 Conectar con Gmail"}</Btn>
          <div style={{ fontSize:10.5, color:T.muted, marginTop:14, lineHeight:1.6 }}>
            Tu origen actual es <code style={{ background:T.bg, padding:"1px 5px", borderRadius:4 }}>{typeof window!=="undefined"?window.location.origin:""}</code> — tiene que estar añadido exactamente así (mismo protocolo, dominio y puerto) en "Orígenes autorizados de JavaScript" de tu Client ID en Google Cloud Console.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Gmail</h1>
          <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Conectado · {emails.length} correos en bandeja</p>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[["bandeja","📥 Bandeja"],["redactar","✏️ Redactar"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ padding:"7px 14px", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", border:`1px solid ${tab===k?T.blue:T.border}`, background:tab===k?"#EFF6FF":"transparent", color:tab===k?T.blue:T.muted }}>{l}</button>
          ))}
        </div>
      </div>

      {tab==="bandeja" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.3fr", gap:14 }}>
          <Card style={{ padding:0, overflow:"hidden" }}>
            <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11.5, fontWeight:700, color:C.muted }}>BANDEJA DE ENTRADA</span>
              <button onClick={()=>cargarBandeja()} style={{ background:"transparent", border:"none", color:C.brand, fontSize:11, fontWeight:700, cursor:"pointer" }}>↻ Actualizar</button>
            </div>
            <div style={{ maxHeight:520, overflowY:"auto" }}>
              {loadingList ? <div style={{ padding:20, textAlign:"center", color:C.muted, fontSize:12 }}>Cargando…</div> :
               emails.length===0 ? <div style={{ padding:20, textAlign:"center", color:C.muted, fontSize:12 }}>Sin correos</div> :
               emails.map(e=>{
                const remitente = limpiarRemitente(e.from);
                return (
                  <div key={e.id} onClick={()=>abrirEmail(e)} style={{ padding:"11px 14px", borderBottom:`1px solid ${C.border}`, cursor:"pointer", background:selected?.id===e.id?C.brandBg:"transparent" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.title, marginBottom:2 }}>{remitente.nombre||remitente.email}</div>
                    <div style={{ fontSize:11.5, color:C.body, marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.subject}</div>
                    <div style={{ fontSize:10.5, color:C.muted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.snippet}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            {!selected ? (
              <div style={{ textAlign:"center", padding:40, color:C.muted, fontSize:12.5 }}>Selecciona un correo de la izquierda para leerlo y analizarlo.</div>
            ) : (
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:C.title, marginBottom:4 }}>{selected.subject}</div>
                <div style={{ fontSize:11.5, color:C.muted, marginBottom:14 }}>De: {selected.from} · {selected.date}</div>
                {loadingBody ? <div style={{ color:C.muted, fontSize:12 }}>Cargando contenido…</div> : (
                  <div style={{ fontSize:12.5, color:C.body, lineHeight:1.7, whiteSpace:"pre-wrap", background:C.bg, borderRadius:10, padding:14, marginBottom:14, maxHeight:220, overflowY:"auto" }}>{selectedBody}</div>
                )}
                <Btn onClick={analizarEmail} disabled={analyzing || loadingBody} style={{ width:"100%", marginBottom:12 }}>{analyzing?"Analizando…":"🤖 Analizar con IA"}</Btn>

                {analysis && (
                  <div style={{ background:C.bg, borderRadius:10, padding:14 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                      <Badge label={analysis.tipo} color={analysis.tipo==="pedido"?C.ok:analysis.tipo==="queja"?C.crit:C.brand} bg={`${analysis.tipo==="pedido"?C.ok:analysis.tipo==="queja"?C.crit:C.brand}18`}/>
                      {analysis.urgente && <Badge label="urgente" color={C.crit} bg={C.critBg}/>}
                      {analysis.clienteProbable && <span style={{ fontSize:11, color:C.brand, fontWeight:700 }}>{analysis.clienteProbable}</span>}
                    </div>
                    <div style={{ fontSize:12.5, color:C.title, marginBottom:10 }}>{analysis.resumen}</div>
                    {analysis.respuestaSugerida && (
                      <div style={{ fontSize:11.5, color:C.body, background:C.surface, borderRadius:8, padding:10, marginBottom:10, fontStyle:"italic" }}>"{analysis.respuestaSugerida}"</div>
                    )}
                    <div style={{ display:"flex", gap:8 }}>
                      <Btn size="sm" onClick={crearTareaDesdeEmail}>+ Crear tarea</Btn>
                      <Btn size="sm" variant="outline" onClick={usarRespuestaSugerida}>✏️ Responder con IA</Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab==="redactar" && (
        <Card style={{ maxWidth:640 }}>
          <SectionTitle>Redactar y enviar</SectionTitle>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10, marginBottom:12 }}>
            <div><Label>Destinatario</Label><Input value={destinatario} onChange={setDestinatario} placeholder="cliente@empresa.com"/></div>
            <div><Label>Asunto</Label><Input value={asunto} onChange={setAsunto} placeholder="Asunto"/></div>
          </div>
          <div style={{ marginBottom:10 }}>
            <Label>Qué quieres decir (la IA lo redacta por ti)</Label>
            <div style={{ display:"flex", gap:8 }}>
              <Input value={instruccion} onChange={setInstruccion} placeholder="Ej. recuérdale que la oferta vence mañana y pregúntale si necesita más info"/>
              <Btn onClick={redactarConIA} disabled={redactando}>{redactando?"…":"✨ Redactar"}</Btn>
            </div>
          </div>
          <Label>Cuerpo del email</Label>
          <textarea value={borrador} onChange={e=>setBorrador(e.target.value)} placeholder="El borrador aparecerá aquí — también puedes escribirlo tú directamente"
            style={{ width:"100%", minHeight:160, padding:"10px 12px", borderRadius:9, border:`1px solid ${C.border}`, fontSize:12.5, color:C.title, outline:"none", resize:"vertical", boxSizing:"border-box", marginBottom:12 }}/>
          <Btn onClick={enviarEmail} disabled={enviando} style={{ width:"100%" }}>{enviando?"Enviando…":"📤 Enviar email"}</Btn>
        </Card>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   NOTICIAS — hitos de empresas de la Región de Murcia, vía IA + búsqueda web
   ════════════════════════════════════════════════════════════════════ */
const NOTICIAS_KEY = "packboard-noticias";
const DESCUBIERTAS_KEY = "packboard-empresas-descubiertas";
const ULTIMO_CHEQUEO_KEY = "packboard-noticias-ultimo-chequeo";
const NOTICIA_CATS = {
  facturacion:      { label:"Facturación",       icon:"💰", color:T.green },
  cierre_ejercicio: { label:"Cierre de ejercicio",icon:"📊", color:T.blue },
  adquisicion:      { label:"Adquisición",        icon:"🤝", color:T.violet },
  ampliacion:       { label:"Ampliación",         icon:"🏗️", color:T.orange },
  premio:           { label:"Premio",             icon:"🏆", color:"#D97706" },
  subvencion:       { label:"Subvención",         icon:"💶", color:T.green },
  otro:             { label:"Noticia",            icon:"📰", color:T.muted },
};
function empresasParaNoticias(clientes, descubiertas){
  const clientesMapped = clientes.map(c=>({ id:`cl-${c.id}`, nombre:c.empresa, ciudad:c.ciudad||"", esCliente:true }));
  const nombresConocidos = new Set(clientesMapped.map(c=>c.nombre.toLowerCase()));
  const seedMapped = PROSPECTOS_SEED.filter(p=>!nombresConocidos.has(p.nombre.toLowerCase())).map(p=>({ id:p.id, nombre:p.nombre, ciudad:p.ciudad, esCliente:false }));
  seedMapped.forEach(s=>nombresConocidos.add(s.nombre.toLowerCase()));
  const descMapped = (descubiertas||[]).filter(d=>!nombresConocidos.has(d.nombre.toLowerCase())).map(d=>({ id:`desc-${d.id}`, nombre:d.nombre, ciudad:d.ciudad||"", esCliente:false, esDescubierta:true }));
  return [...clientesMapped, ...seedMapped, ...descMapped];
}
function mailtoLink(email, asunto, cuerpo){
  const params = new URLSearchParams({ subject: asunto||"", body: cuerpo||"" });
  return `mailto:${email||""}?${params.toString()}`;
}

function NewsModule({ clientes, noticias, setNoticias, descubiertas, setDescubiertas, addTarea, addCliente, addInteraccion, showToast }){
  const [seleccion, setSeleccion] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [buscandoIds, setBuscandoIds] = useState(new Set());
  const [progresoTotal, setProgresoTotal] = useState(0);
  const [progresoActual, setProgresoActual] = useState(0);
  const [descubriendo, setDescubriendo] = useState(false);
  const [chequeoAutoHecho, setChequeoAutoHecho] = useState(false);
  const [emailAnalisis, setEmailAnalisis] = useState({}); // { [key]: {loading, data} }

  const empresas = empresasParaNoticias(clientes, descubiertas);

  const buscarNoticiasEmpresa = useCallback(async (empresa) => {
    setBuscandoIds(s=>new Set([...s, empresa.id]));
    const prompt = `Eres un asistente de investigación empresarial en España. Busca en internet — prioriza especialmente LinkedIn (publicaciones de la empresa, de sus directivos, o menciones), pero incluye también medios regionales (Murcia Plaza, La Opinión de Murcia, La Verdad, La Razón Región de Murcia), notas de prensa, boletines oficiales (BORM) o la propia web de la empresa — noticias RECIENTES (idealmente de los últimos 12 meses) y VERIFICABLES sobre esta empresa de la Región de Murcia:

Empresa: ${empresa.nombre}
${empresa.ciudad?`Ubicación conocida: ${empresa.ciudad}`:""}

Busca específicamente si hay noticias de:
- Aumento significativo de facturación o buenos resultados económicos
- Cierre de ejercicio destacado
- Adquisiciones o fusiones (como compradora o comprada)
- Ampliación de instalaciones, nueva nave, nueva fábrica
- Premios empresariales recibidos, u otorgados por la propia empresa
- Subvenciones o ayudas públicas importantes concedidas
- Cualquier otro hito relevante para felicitar a la empresa

IMPORTANTE: Solo incluye información que hayas encontrado realmente y puedas respaldar con una fuente. Si no encuentras nada relevante y reciente, devuelve un array vacío — no inventes ni supongas.

Devuelve SOLO un array JSON (sin markdown, sin backticks, sin texto adicional) con este formato exacto:
[{"categoria":"facturacion|cierre_ejercicio|adquisicion|ampliacion|premio|subvencion|otro","titulo":"título breve en español","resumen":"resumen en español, máx 40 palabras","fuente":"nombre de la fuente, ej. LinkedIn, Murcia Plaza, web de la empresa","url":"URL real si la tienes, si no null","fecha":"fecha aproximada si la conoces (texto libre), si no null"}]`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1200, messages:[{role:"user",content:prompt}], tools:[{type:"web_search_20250305", name:"web_search"}] }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"[]";
      const match = text.match(/\[[\s\S]*\]/);
      const nuevosItems = match ? JSON.parse(match[0]) : [];
      setNoticias(prev=>({ ...prev, [empresa.id]: { empresaNombre:empresa.nombre, esCliente:empresa.esCliente, items:nuevosItems, buscadoEl:new Date().toISOString() } }));
    }catch(e){
      console.error("Error buscando noticias:", e);
    }
    setBuscandoIds(s=>{ const n=new Set(s); n.delete(empresa.id); return n; });
  }, [setNoticias]);

  const descubrirEmpresas = useCallback(async () => {
    setDescubriendo(true);
    const conocidas = empresas.map(e=>e.nombre);
    const prompt = `Eres un consultor de desarrollo de negocio para un comercial de packaging/cartón ondulado en la Región de Murcia (España).

Busca en internet empresas REALES con sede en la Región de Murcia que cumplan TODAS estas condiciones:
- Facturan más de 3 millones de euros al año — verifícalo con una fuente pública (eInforma, Axesor, Informa, memoria anual, registro mercantil, prensa económica) y cita esa fuente
- Pertenecen a un sector con consumo probable alto de cartón ondulado: alimentación, bebidas, química/droguería, industria/manufactura, farmacéutica, logística, agrícola/hortofrutícola
- NO están en esta lista de empresas que ya conozco: ${conocidas.join(", ")||"(ninguna todavía)"}

Para cada empresa que encuentres y puedas verificar, explica por qué sería buena oportunidad para vender cartón ondulado.

Devuelve SOLO un array JSON (sin markdown, sin texto adicional), máximo 8 empresas, con este formato exacto:
[{"nombre":"","sector":"alimentacion|quimica|industria|otro","ciudad":"","facturacionAprox":"texto ej. '~15M€ (2024)'","fuenteFacturacion":"nombre de la fuente","razonCarton":"por qué consumiría cartón ondulado, máx 30 palabras"}]

Si no puedes verificar ninguna con fuente real, devuelve un array vacío.`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1500, messages:[{role:"user",content:prompt}], tools:[{type:"web_search_20250305", name:"web_search"}] }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"[]";
      const match = text.match(/\[[\s\S]*\]/);
      const nuevas = match ? JSON.parse(match[0]) : [];
      if(nuevas.length>0){
        const conNombresIds = nuevas.map(n=>({ id:uid(), ...n, descubiertaEl:today() }));
        setDescubiertas(prev=>{
          const existentes = new Set(prev.map(p=>p.nombre.toLowerCase()));
          return [...prev, ...conNombresIds.filter(n=>!existentes.has(n.nombre.toLowerCase()))];
        });
        showToast?.(`${nuevas.length} empresa${nuevas.length!==1?"s":""} nueva${nuevas.length!==1?"s":""} descubierta${nuevas.length!==1?"s":""}`);
      }
    }catch(e){
      console.error("Error descubriendo empresas:", e);
    }
    setDescubriendo(false);
  }, [empresas, setDescubiertas, showToast]);

  // Chequeo automático diario: al abrir el módulo, si hoy no se ha comprobado todavía,
  // refresca en segundo plano las empresas menos revisadas y busca empresas nuevas.
  useEffect(()=>{
    if(chequeoAutoHecho || empresas.length===0) return;
    (async()=>{
      const ultimo = await load(ULTIMO_CHEQUEO_KEY);
      if(ultimo===today()){ setChequeoAutoHecho(true); return; }
      setChequeoAutoHecho(true);
      await save(ULTIMO_CHEQUEO_KEY, today());
      const pendientes = [...empresas]
        .sort((a,b)=> new Date(noticias[a.id]?.buscadoEl||0) - new Date(noticias[b.id]?.buscadoEl||0))
        .slice(0,5);
      for(const emp of pendientes){ await buscarNoticiasEmpresa(emp); }
      await descubrirEmpresas();
    })();
  }, [empresas, noticias, chequeoAutoHecho, buscarNoticiasEmpresa, descubrirEmpresas]);

  const toggle = (id) => setSeleccion(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleTodas = () => {
    const visibles = empresas.filter(e=>e.nombre.toLowerCase().includes(busqueda.toLowerCase()));
    setSeleccion(s=> s.size>=visibles.length ? new Set() : new Set(visibles.map(e=>e.id)));
  };

  const buscarSeleccionadas = async () => {
    const lista = empresas.filter(e=>seleccion.has(e.id));
    if(lista.length===0){ showToast?.("Selecciona al menos una empresa","warn"); return; }
    setProgresoTotal(lista.length); setProgresoActual(0);
    for(const empresa of lista){ await buscarNoticiasEmpresa(empresa); setProgresoActual(p=>p+1); }
    setProgresoTotal(0); setProgresoActual(0);
    showToast?.("Búsqueda de noticias completada");
  };

  const crearTareaFelicitacion = async (empresaId, empresaNombre, noticia, idx) => {
    const cl = clientes.find(c=>c.empresa.toLowerCase()===empresaNombre.toLowerCase());
    await addTarea({ titulo:`Felicitar a ${empresaNombre}: ${noticia.titulo}`, notas:`${noticia.resumen}\nFuente: ${noticia.fuente}${noticia.url?` — ${noticia.url}`:""}`, vencimiento:today(), prioridad:"media", clienteId: cl?cl.id:null });
    if(cl) await addInteraccion({ clienteId:cl.id, tipo:"nota", nota:`Noticia detectada: ${noticia.titulo}` });
    const entry = noticias[empresaId];
    if(entry){
      const items = entry.items.map((it,i)=>i===idx?{...it,leida:true}:it);
      setNoticias(prev=>({ ...prev, [empresaId]:{ ...entry, items } }));
    }
    showToast?.("Tarea de felicitación creada");
  };

  const descartarNoticia = (empresaId, idx) => {
    const entry = noticias[empresaId];
    if(!entry) return;
    const items = entry.items.filter((_,i)=>i!==idx);
    setNoticias(prev=>({ ...prev, [empresaId]:{ ...entry, items } }));
  };

  const analizarYRedactar = async (empresaId, empresaNombre, noticia, idx) => {
    const key = `${empresaId}-${idx}`;
    setEmailAnalisis(s=>({ ...s, [key]:{ loading:true, data:null } }));
    const prompt = `Eres un asistente comercial de una empresa de packaging/cartón ondulado en España. Tu comercial quiere contactar por primera vez con esta empresa aprovechando una noticia reciente como excusa natural de entrada.

Empresa: ${empresaNombre}
Noticia: ${noticia.titulo} — ${noticia.resumen} (fuente: ${noticia.fuente}${noticia.url?`, ${noticia.url}`:""})

1. Busca en internet un email de contacto público de esta empresa (general, comercial, o de un responsable de compras/logística si lo encuentras). Si no encuentras uno verificable con fuente, indica null en "email" — no inventes uno.
2. Redacta un email profesional en español, corto (máximo 130 palabras), que: felicite por la noticia de forma natural y específica (no genérica), presente brevemente a Pedro como proveedor de cartón ondulado/packaging, y proponga una breve llamada o visita. Tono cercano, puerta de entrada — no venta agresiva.

Devuelve SOLO un objeto JSON (sin markdown, sin texto adicional): {"email":"string o null","emailVerificado":true|false,"asunto":"string","cuerpo":"string"}`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:700, messages:[{role:"user",content:prompt}], tools:[{type:"web_search_20250305", name:"web_search"}] }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"{}";
      const match = text.match(/\{[\s\S]*\}/);
      const data = match ? JSON.parse(match[0]) : { email:null, emailVerificado:false, asunto:"", cuerpo:"" };
      setEmailAnalisis(s=>({ ...s, [key]:{ loading:false, data } }));
    }catch(e){
      console.error("Error analizando email:", e);
      setEmailAnalisis(s=>({ ...s, [key]:{ loading:false, data:null } }));
      showToast?.("No se pudo generar el análisis/email","warn");
    }
  };

  const anadirDescubierta = async (d) => {
    await addCliente({ empresa:d.nombre, sector: d.sector==="alimentacion"?"ali":d.sector==="quimica"?"con":"ind", ciudad:d.ciudad||"", notas:`Descubierta por IA · ${d.facturacionAprox||""} (${d.fuenteFacturacion||"sin fuente"})\n${d.razonCarton||""}` });
    setDescubiertas(prev=>prev.filter(x=>x.id!==d.id));
    showToast?.(`"${d.nombre}" añadida a Clientes`);
  };
  const descartarDescubierta = (id) => setDescubiertas(prev=>prev.filter(x=>x.id!==id));

  const empresasFiltradas = empresas.filter(e=>e.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const feed = Object.entries(noticias)
    .filter(([id])=>empresas.some(e=>e.id===id))
    .flatMap(([id,entry])=>(entry.items||[]).map((item,idx)=>({ empresaId:id, empresa:entry.empresaNombre, esCliente:entry.esCliente, buscadoEl:entry.buscadoEl, idx, ...item })))
    .sort((a,b)=> new Date(b.buscadoEl) - new Date(a.buscadoEl));

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Noticias</h1>
        <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Hitos de empresas para tener un motivo real para llamarlas — más descubrimiento diario de nuevas empresas de la región</p>
      </div>

      <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:14, padding:"16px 20px", marginBottom:18 }}>
        <div style={{ fontWeight:700, color:T.title, fontSize:13, marginBottom:6 }}>🔎 Cómo funciona</div>
        <div style={{ fontSize:12.5, color:T.body, lineHeight:1.6 }}>
          Cada vez que abres este módulo por primera vez en el día, refresca automáticamente las empresas menos revisadas y busca empresas nuevas de la Región de Murcia (+3M€ de facturación, sectores con alto consumo de cartón ondulado) — solo mientras la app esté abierta, no hay forma de ejecutar esto en segundo plano con la app cerrada. Prioriza LinkedIn, pero como esa red restringe el rastreo automático, complementa esto con tu propia revisión manual de vez en cuando. Solo se muestran noticias y facturaciones con fuente verificable.
        </div>
      </div>

      {descubiertas.length>0 && (
        <Card style={{ marginBottom:16 }}>
          <SectionTitle>🆕 Empresas descubiertas ({descubiertas.length})</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {descubiertas.map(d=>(
              <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, padding:"10px 12px", background:C.bg, borderRadius:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color:C.title }}>{d.nombre}</span>
                    <Badge label={SECTOR_LABEL[d.sector]||d.sector} color={C.brand} bg={C.brandBg}/>
                  </div>
                  <div style={{ fontSize:11, color:C.body, marginBottom:3 }}>{d.razonCarton}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{d.ciudad&&`${d.ciudad} · `}{d.facturacionAprox} · fuente: {d.fuenteFacturacion}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                  <Btn size="sm" onClick={()=>anadirDescubierta(d)}>+ Añadir</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>descartarDescubierta(d.id)}>✕</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom:16 }}>
        <SectionTitle action={<div style={{display:"flex",gap:8}}>
          <Btn size="sm" variant="ghost" onClick={toggleTodas}>{seleccion.size>=empresasFiltradas.length&&empresasFiltradas.length>0?"Deseleccionar todas":"Seleccionar todas"}</Btn>
          <Btn size="sm" variant="outline" onClick={descubrirEmpresas} disabled={descubriendo}>{descubriendo?"Buscando…":"🔍 Descubrir nuevas empresas"}</Btn>
        </div>}>Empresas a vigilar ({empresas.length})</SectionTitle>
        <Input value={busqueda} onChange={setBusqueda} placeholder="Buscar empresa…" style={{ marginBottom:10 }}/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:6, maxHeight:260, overflowY:"auto", marginBottom:14 }}>
          {empresasFiltradas.map(e=>{
            const entry = noticias[e.id];
            const buscando = buscandoIds.has(e.id);
            return (
              <label key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, border:`1px solid ${C.border}`, cursor:"pointer", background:seleccion.has(e.id)?C.brandBg:C.surface, fontSize:11.5 }}>
                <input type="checkbox" checked={seleccion.has(e.id)} onChange={()=>toggle(e.id)} style={{ width:14, height:14, cursor:"pointer" }}/>
                <span style={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre}{e.esCliente&&<span style={{color:C.brand}}> ★</span>}</span>
                {buscando ? <span style={{ fontSize:9.5, color:C.brand }}>buscando…</span> :
                 entry ? <span style={{ fontSize:9.5, color:C.muted }}>{entry.items.filter(i=>!i.leida).length} noticias</span> : null}
              </label>
            );
          })}
        </div>
        <Btn onClick={buscarSeleccionadas} disabled={seleccion.size===0 || progresoTotal>0}>
          {progresoTotal>0 ? `Buscando… ${progresoActual}/${progresoTotal}` : `🔍 Buscar noticias de ${seleccion.size||""} empresa${seleccion.size!==1?"s":""}`}
        </Btn>
      </Card>

      {feed.filter(n=>!n.leida).length===0 ? (
        <Card style={{ textAlign:"center", padding:36 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📰</div>
          <div style={{ fontSize:13, color:C.muted }}>Sin noticias pendientes. Selecciona empresas arriba y pulsa "Buscar", o espera al chequeo automático de mañana.</div>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {feed.filter(n=>!n.leida).map((n,i)=>{
            const cat = NOTICIA_CATS[n.categoria]||NOTICIA_CATS.otro;
            const key = `${n.empresaId}-${n.idx}`;
            const ea = emailAnalisis[key];
            return (
              <Card key={key}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                      <Badge label={`${cat.icon} ${cat.label}`} color={cat.color} bg={`${cat.color}18`}/>
                      <span style={{ fontSize:12, fontWeight:700, color:C.brand }}>{n.empresa}</span>
                      {n.esCliente && <Badge label="cliente" color={C.ok} bg={C.okBg}/>}
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.title, marginBottom:4 }}>{n.titulo}</div>
                    <div style={{ fontSize:12, color:C.body, lineHeight:1.6, marginBottom:6 }}>{n.resumen}</div>
                    <div style={{ fontSize:10.5, color:C.muted }}>
                      Fuente: {n.fuente}{n.fecha?` · ${n.fecha}`:""}
                      {n.url && <> · <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color:C.brand }}>ver fuente ↗</a></>}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                    <Btn size="sm" onClick={()=>crearTareaFelicitacion(n.empresaId, n.empresa, n, n.idx)}>🎉 Felicitar</Btn>
                    <Btn size="sm" variant="outline" onClick={()=>analizarYRedactar(n.empresaId, n.empresa, n, n.idx)} disabled={ea?.loading}>{ea?.loading?"…":"✉️ Redactar email"}</Btn>
                    <Btn size="sm" variant="ghost" onClick={()=>descartarNoticia(n.empresaId, n.idx)}>✕ Descartar</Btn>
                  </div>
                </div>

                {ea?.data && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontSize:11, color:C.muted }}>Email destino:</span>
                      {ea.data.email ? (
                        <>
                          <strong style={{ fontSize:11.5, color:C.title }}>{ea.data.email}</strong>
                          <Badge label={ea.data.emailVerificado?"verificado":"no verificado"} color={ea.data.emailVerificado?C.ok:C.warn} bg={ea.data.emailVerificado?C.okBg:C.warnBg}/>
                        </>
                      ) : <span style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>No se encontró un email verificable — búscalo manualmente en su web o LinkedIn.</span>}
                    </div>
                    <div style={{ background:C.bg, borderRadius:8, padding:12, marginBottom:8 }}>
                      <div style={{ fontSize:11.5, fontWeight:700, color:C.title, marginBottom:6 }}>Asunto: {ea.data.asunto}</div>
                      <div style={{ fontSize:11.5, color:C.body, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{ea.data.cuerpo}</div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <a href={mailtoLink(ea.data.email, ea.data.asunto, ea.data.cuerpo)} style={{ flex:1, textAlign:"center", padding:"8px", borderRadius:8, background:C.brand, color:"#fff", fontSize:11.5, fontWeight:700, textDecoration:"none" }}>✉️ Abrir borrador</a>
                      <button onClick={()=>{ navigator.clipboard?.writeText(`Asunto: ${ea.data.asunto}\n\n${ea.data.cuerpo}`); showToast?.("Copiado"); }} style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.body, fontSize:11.5, fontWeight:700, cursor:"pointer" }}>📋 Copiar</button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RUTAS — optimizador TSP + Google Maps real + análisis IA
   ════════════════════════════════════════════════════════════════════ */
const HOME_DEFAULT = { lat:38.0247, lon:-1.1729, direccion:"Plaza de los Portales S/N, Altorreal, 30506 Molina de Segura, Murcia" };
const CIUDADES = {
  "murcia":[37.9922,-1.1307], "molina de segura":[37.9897,-1.2139], "alcantarilla":[37.9718,-1.2119],
  "cartagena":[37.6051,-0.9862], "lorca":[37.6744,-1.7016], "jumilla":[38.4736,-1.3268],
  "san javier":[37.8039,-0.8347], "torre pacheco":[37.7443,-0.9558], "aguilas":[37.4059,-1.5824],
  "águilas":[37.4059,-1.5824], "cieza":[38.2394,-1.4197], "yecla":[38.6122,-1.1152],
  "totana":[37.7708,-1.5013], "alicante":[38.3452,-0.4810], "elche":[38.2622,-0.7011],
  "mazarron":[37.5988,-1.3163], "mazarrón":[37.5988,-1.3163], "fuente alamo":[37.7311,-1.1544],
  "fuente álamo":[37.7311,-1.1544], "archena":[38.1156,-1.3007], "caravaca":[38.1052,-1.8641],
  "caravaca de la cruz":[38.1052,-1.8641],
};
function geocodeCiudad(ciudad, home){
  if(!ciudad) return null;
  const key = ciudad.trim().toLowerCase();
  if(CIUDADES[key]) return { lat:CIUDADES[key][0], lon:CIUDADES[key][1], aprox:false };
  // fallback: offset pseudo-aleatorio pero estable respecto a la base, para ciudades no catalogadas
  const hash = [...key].reduce((a,c)=>a+c.charCodeAt(0),0);
  return { lat: home.lat + ((hash%20)-10)*0.018, lon: home.lon + ((hash%17)-8)*0.018, aprox:true };
}
function haversine(lat1,lon1,lat2,lon2){
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10;
}
function optimizeRoute(paradas, home){
  let unvisited = [...paradas], route = [], curLat=home.lat, curLon=home.lon, distTotal=0;
  while(unvisited.length){
    let bestI=0, bestD=Infinity;
    unvisited.forEach((p,i)=>{ const d=haversine(curLat,curLon,p.lat,p.lon); if(d<bestD){bestD=d;bestI=i;} });
    const next = unvisited.splice(bestI,1)[0];
    distTotal += bestD;
    route.push({...next, kmDesdeAnterior:bestD});
    curLat=next.lat; curLon=next.lon;
  }
  // vuelta a casa
  distTotal += haversine(curLat,curLon,home.lat,home.lon);
  return { route, distTotal: Math.round(distTotal*10)/10 };
}
function gmapsMultiStopLink(route, home){
  const dest = home; // la ruta vuelve a casa
  const waypoints = route.map(p=>`${p.lat},${p.lon}`).join("|");
  const params = new URLSearchParams({ api:"1", origin:`${home.lat},${home.lon}`, destination:`${dest.lat},${dest.lon}`, travelmode:"driving" });
  let url = `https://www.google.com/maps/dir/?${params.toString()}`;
  if(waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
  return url;
}

/* ════════════════════════════════════════════════════════════════════
   PROSPECTOS — investigación real (alimentación/química/industria)
   centrada en Altorreal / Molina de Segura, con potencial de consumo
   de cartón y facilidad de entrada estimados
   ════════════════════════════════════════════════════════════════════ */
const PROSPECTOS_SEED = [
  { id:"p1", nombre:"Fini Golosinas España", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Ctra. de Madrid, Km 385, 30500 Molina de Segura", telefono:"968 644 400",
    datos:"~1.157 empleados · grupo con +480M€ facturación en el clúster de golosinas de Molina", consumo:95, barrera:"alta",
    argumento:"Líder mundial de golosinas exportado a más de 100 países: cada caramelo va envasado individualmente y después en caja expositora y cartón de exportación — el mayor volumen de cartón de tu zona. La entrada directa a su línea principal es difícil (proveedor homologado), así que la estrategia es buscar una línea secundaria, un nuevo almacén o un pico de producción no cubierto por su proveedor actual.",
    dia:"Lunes" },
  { id:"p2", nombre:"Zukán", sector:"industria", ciudad:"Molina de Segura",
    direccion:"C/ Magallanes 182, Pol. Ind. La Estrella, 30500 Molina de Segura", telefono:"968 389 054",
    datos:"200-500 empleados · ~296M€ facturación · proveedor B2B de azúcares para golosinas, zumos, lácteos y conservas", consumo:88, barrera:"media",
    argumento:"Fabrican y envasan azúcares sólidos y líquidos a medida para toda la industria alimentaria de la zona — consumen sacos, big-bags y embalaje industrial de cartón en volumen alto y constante. Al ser B2B industrial (no marca de consumo), el proceso de homologación suele ser más ágil que en una multinacional de marca.",
    dia:"Lunes" },
  { id:"p3", nombre:"Francisco Aragón (Bosque Verde)", sector:"quimica", ciudad:"Molina de Segura",
    direccion:"Ctra. de Madrid, Km 387, 30500 Molina de Segura", telefono:null,
    datos:"Interproveedor de Mercadona · ~190M€ facturación · fábrica nueva inaugurada recientemente", consumo:80, barrera:"alta",
    argumento:"Fabrican ambientadores, insecticidas y limpieza doméstica en exclusiva para Mercadona. Acaban de terminar una fábrica nueva junto a la actual para ampliar capacidad — toda ampliación de producción implica nueva necesidad de embalaje secundario. Es el momento de presentarte, aunque el canal esté muy controlado.",
    dia:"Lunes" },

  { id:"p4", nombre:"Vidal Golosinas (Vidal Candies)", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Av. Gutiérrez Mellado, S/N, 30500 Molina de Segura", telefono:null,
    datos:"Fabricante desde 1963 · certificaciones BRC, IFS y Kosher · exportador", consumo:78, barrera:"media",
    argumento:"Golosinas certificadas para exportación internacional — las certificaciones BRC/IFS exigen packaging trazable y de calidad constante, un buen argumento para presentar cartón certificado.",
    dia:"Martes" },
  { id:"p5", nombre:"Martín Braun", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Molina de Segura (Pol. Ind.)", telefono:null,
    datos:"~17,6M€ facturación · ingredientes para pastelería y heladería", consumo:60, barrera:"media",
    argumento:"Proveedor de ingredientes a obradores y heladerías de toda la región — envían pedidos B2B recurrentes que van en caja, buen volumen recurrente aunque de empresa mediana.",
    dia:"Martes" },
  { id:"p6", nombre:"Gluck and Sweet", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Molina de Segura (Pol. Ind.)", telefono:null,
    datos:"~9,3M€ facturación · confitería", consumo:48, barrera:"baja",
    argumento:"Empresa mediana de confitería — decisión de compra ágil, buena para primeros cierres y referencias dentro del clúster dulce de Molina.",
    dia:"Martes" },

  { id:"p7", nombre:"Sánchez Cano", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Molina de Segura (Pol. Ind.)", telefono:null,
    datos:"~8,7M€ facturación · confitería", consumo:45, barrera:"baja",
    argumento:"Fabricante local de confitería, tamaño accesible — en empresas de este volumen el gerente suele atender directamente sin filtros.",
    dia:"Miércoles" },
  { id:"p8", nombre:"Especialidades del Obrador", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Molina de Segura (Pol. Ind.)", telefono:null,
    datos:"~3,1M€ facturación · bollería y confitería", consumo:38, barrera:"baja",
    argumento:"Obrador de tamaño pequeño-mediano, ideal para un cierre rápido y para pedir referencias hacia otras confiterías vecinas.",
    dia:"Miércoles" },
  { id:"p9", nombre:"Pastelería Gimar", sector:"alimentacion", ciudad:"Molina de Segura",
    direccion:"Molina de Segura (Pol. Ind.)", telefono:null,
    datos:"~2,9M€ facturación · pastelería y heladería industrial", consumo:36, barrera:"baja",
    argumento:"Igual que el anterior: volumen menor pero barrera de entrada mínima. Completa un día de visitas cortas y cierres ágiles en la misma zona.",
    dia:"Miércoles" },

  { id:"p10", nombre:"Hefame", sector:"industria", ciudad:"Murcia",
    direccion:"Ctra. Santomera-Abanilla, 158, Murcia", telefono:"968 277 500",
    datos:"1.275 empleados · ~1.929M€ facturación · 72.000 pedidos diarios a 6.200 farmacias", consumo:92, barrera:"alta",
    argumento:"Cada uno de sus 72.000 pedidos diarios sale en una caja de cartón — consumo diario masivo y constante, el más predecible de toda la lista. Requiere pasar homologación de calidad, así que lleva ficha técnica y muestra antes de llamar.",
    dia:"Jueves" },
  { id:"p11", nombre:"Juver Alimentación", sector:"alimentacion", ciudad:"Murcia",
    direccion:"C. Julio Cortázar, 46, Churra, Murcia", telefono:"968 356 900",
    datos:"412 empleados · ~163M€ facturación · 14.000 t de fruta procesada al año, en expansión", consumo:75, barrera:"media",
    argumento:"Procesan 14.000 toneladas de fruta al año en una sola fábrica — cada lote de zumo sale en caja secundaria de cartón. Están en expansión activa, lo que suele traducirse en nuevas líneas y nuevos proveedores buscados.",
    dia:"Jueves" },

  { id:"p12", nombre:"MercaMurcia", sector:"alimentacion", ciudad:"Murcia",
    direccion:"Av. Mercamurcia, 18, El Palmar, Murcia", telefono:"968 869 130",
    datos:"150+ operadores mayoristas de fruta, verdura, carne y pescado bajo un mismo recinto", consumo:70, barrera:"baja",
    argumento:"Sin filtros corporativos: hablas directamente con el dueño de cada puesto. Una sola visita (idealmente entre 5h y 8h de la mañana) puede darte 8-10 contactos cualificados de golpe.",
    dia:"Viernes" },
];
const SECTOR_LABEL = { alimentacion:"🥩 Alimentación", quimica:"🧪 Química", industria:"⚙️ Industria" };
const BARRERA_COLOR = { baja:T.green, media:T.orange, alta:T.red };
const DIAS_SEMANA = ["Lunes","Martes","Miércoles","Jueves","Viernes"];

/* ─── PLAN SEMANAL — prospectos reales agrupados por día ────────────── */
const PLAN_KEY = "packboard-plan-semanal";
const PLAN_HIST_KEY = "packboard-plan-semanal-historial";
SECTOR_LABEL.cliente = "📇 Cliente";

function planPorDefecto(){
  const dias = {};
  DIAS_SEMANA.forEach(d=>{ dias[d] = PROSPECTOS_SEED.filter(p=>p.dia===d).map(p=>p.id); });
  return { dias };
}
function empresaFromCliente(c){
  return {
    id:`cl-${c.id}`, nombre:c.empresa, sector:"cliente", ciudad:c.ciudad,
    direccion:c.ciudad, telefono:c.telefono||null,
    datos:"Ya es cliente en tu CRM", consumo:50, barrera:"baja",
    argumento: c.notas || "Cliente existente en tu cartera — visita de seguimiento o desarrollo de cuenta.",
  };
}

function PlanSemanalView({ home, clientes, addCliente, showToast }){
  const [plan, setPlan] = useState(null);
  const [planReady, setPlanReady] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [aiNote, setAiNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [added, setAdded] = useState(new Set());
  const [analisisVisita, setAnalisisVisita] = useState({}); // { [empresaId]: {loading, texto} }
  const [pickerDia, setPickerDia] = useState(null); // día con el selector de "+ Añadir" abierto
  const [pickerBusqueda, setPickerBusqueda] = useState("");

  useEffect(()=>{
    (async()=>{
      const savedPlan = await load(PLAN_KEY);
      setPlan(savedPlan || planPorDefecto());
      const savedHist = await load(PLAN_HIST_KEY);
      setHistorial(savedHist||[]);
      setPlanReady(true);
    })();
  },[]);

  const empresaPool = [
    ...PROSPECTOS_SEED,
    ...clientes.filter(c=>c.ciudad && c.ciudad.trim()).map(empresaFromCliente),
  ];
  const buscarEmpresa = (id) => empresaPool.find(e=>e.id===id);

  const guardarPlan = async (nuevo) => { setPlan(nuevo); await save(PLAN_KEY, nuevo); };

  const anadirADia = (dia, empresaId) => {
    if(plan.dias[dia].includes(empresaId)) return;
    guardarPlan({ ...plan, dias:{ ...plan.dias, [dia]:[...plan.dias[dia], empresaId] } });
    setPickerDia(null); setPickerBusqueda("");
  };
  const quitarDeDia = (dia, empresaId) => {
    guardarPlan({ ...plan, dias:{ ...plan.dias, [dia]: plan.dias[dia].filter(id=>id!==empresaId) } });
  };

  const completarDia = async (dia) => {
    const empresasActuales = plan.dias[dia].map(buscarEmpresa).filter(Boolean);
    const registro = { id:uid(), dia, fecha:today(), empresas: empresasActuales.map(e=>e.nombre) };
    const nuevoHist = [registro, ...historial].slice(0,30);
    setHistorial(nuevoHist);
    await save(PLAN_HIST_KEY, nuevoHist);

    const ocupadas = new Set(Object.entries(plan.dias).filter(([d])=>d!==dia).flatMap(([,ids])=>ids));
    const siguientes = empresaPool
      .filter(e=>!ocupadas.has(e.id))
      .sort((a,b)=>(b.consumo||0)-(a.consumo||0))
      .slice(0,3)
      .map(e=>e.id);

    await guardarPlan({ ...plan, dias:{ ...plan.dias, [dia]: siguientes } });
    showToast?.(`${dia} completado — nueva ruta generada para la semana que viene`);
  };

  const borrarDelHistorial = async (id) => {
    const nuevo = historial.filter(h=>h.id!==id);
    setHistorial(nuevo);
    await save(PLAN_HIST_KEY, nuevo);
  };

  const rutaDelDia = (empresas) => {
    const paradas = empresas.map(p=>{ const geo = geocodeCiudad(p.ciudad, home); return { lat:geo.lat, lon:geo.lon, name:p.nombre }; });
    const { route } = optimizeRoute(paradas, home);
    return gmapsMultiStopLink(route, home);
  };

  const anadirCliente = async (p) => {
    await addCliente({ empresa:p.nombre, sector: p.sector==="alimentacion"?"ali":p.sector==="quimica"?"con":p.sector==="cliente"?"ali":"ind", ciudad:p.ciudad, telefono:p.telefono||"", notas:p.argumento });
    setAdded(s=>new Set([...s, p.id]));
    showToast?.(`"${p.nombre}" añadido a Clientes`);
  };

  const analizarVisita = async (empresa) => {
    setAnalisisVisita(s=>({ ...s, [empresa.id]:{ loading:true, texto:"" } }));
    const prompt = `Eres un consultor de ventas B2B experto en el sector de packaging y cartón ondulado en España. Vas a asesorar a un comercial que tiene una visita programada a esta empresa:

Empresa: ${empresa.nombre}
Sector: ${SECTOR_LABEL[empresa.sector]||empresa.sector}
Ubicación: ${empresa.ciudad}${empresa.direccion?` (${empresa.direccion})`:""}
Datos conocidos: ${empresa.datos||"no disponibles"}
Argumento comercial ya identificado: ${empresa.argumento||"ninguno todavía"}

Busca información actualizada sobre esta empresa si puedes. Da tu análisis en español, sin relleno, con estas secciones exactas:

## Sobre la empresa
(2-3 frases: qué hacen, tamaño aproximado, contexto reciente si lo encuentras)
## Consumo estimado de cartón
(razona qué tipo de packaging necesitarían y por qué, según su actividad)
## Posibles proveedores actuales
(competidores probables del sector cartón/packaging que podrían ya trabajar con ellos, y por qué lo intuyes)
## Barreras de entrada
(máximo 3, específicas de esta empresa, no genéricas)
## Cómo afrontar la visita
(3-4 consejos muy concretos y accionables para maximizar el éxito de esta visita en particular)

No inventes datos muy específicos que no puedas fundamentar. Máximo 260 palabras.`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:1200,
          messages:[{role:"user",content:prompt}],
          tools:[{type:"web_search_20250305", name:"web_search"}],
        }),
      });
      const d = await res.json();
      const texto = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta.";
      setAnalisisVisita(s=>({ ...s, [empresa.id]:{ loading:false, texto } }));
    }catch{
      setAnalisisVisita(s=>({ ...s, [empresa.id]:{ loading:false, texto:"Error analizando la visita." } }));
    }
  };

  const analizarSemana = async () => {
    setAiLoading(true); setAiNote("");
    const resumen = DIAS_SEMANA.map(dia=>{
      const empresas = plan.dias[dia].map(buscarEmpresa).filter(Boolean);
      return `${dia}: ${empresas.map(e=>`${e.nombre} (${SECTOR_LABEL[e.sector]}, consumo ${e.consumo}/100, barrera ${e.barrera})`).join(", ")||"(vacío)"}`;
    }).join("\n");
    const prompt = `Eres consultor de ventas B2B de packaging/cartón. Comercial único, base en ${home.direccion}.

PLAN SEMANAL ACTUAL:
${resumen}

Da tu valoración breve en español, sin relleno:
1. ¿El orden de días tiene sentido (empezar por los de mayor volumen y barrera alta, terminar por los de cierre rápido)?
2. Si tuvieras que quitar UNA empresa de la semana por ser la de peor relación esfuerzo/resultado, ¿cuál sería y por qué?
3. Una acción concreta para el fin de semana de preparación antes del lunes.

Máximo 130 palabras.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:600, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      setAiNote(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta.");
    } catch { setAiNote("Error conectando con el servicio de IA."); }
    setAiLoading(false);
  };

  if(!planReady) return <div style={{ color:T.muted, fontSize:13, marginBottom:20 }}>Cargando plan semanal…</div>;

  const porDia = DIAS_SEMANA.map(dia => ({ dia, empresas: plan.dias[dia].map(buscarEmpresa).filter(Boolean).sort((a,b)=>b.consumo-a.consumo) }));

  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ background:`linear-gradient(135deg,#0B1220,${T.blue})`, borderRadius:16, padding:"20px 24px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ color:"#93C5FD", fontSize:11, fontWeight:700, letterSpacing:1.5 }}>PLAN SEMANAL · IA + INVESTIGACIÓN REAL</div>
            <div style={{ color:"#fff", fontSize:18, fontWeight:800, marginTop:4 }}>{empresaPool.length} empresas disponibles · cerca de {home.direccion.split(",")[0]}</div>
            <div style={{ color:"#BFDBFE", fontSize:12, marginTop:4 }}>Añade, quita y marca días como completados a tu gusto</div>
          </div>
          <button onClick={analizarSemana} disabled={aiLoading} style={{ background:"#fff", color:T.title, border:"none", borderRadius:10, padding:"10px 18px", fontSize:12.5, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" }}>
            {aiLoading?"Analizando…":"🤖 Analizar semana con IA"}
          </button>
        </div>
        {aiNote && <div style={{ marginTop:14, background:"rgba(255,255,255,.1)", borderRadius:10, padding:14, fontSize:12.5, color:"#E0E7FF", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{aiNote}</div>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 }}>
        {porDia.map(({dia, empresas})=>(
          <div key={dia} style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 14px", background:T.bg, borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12.5, fontWeight:800, color:T.title }}>{dia}</span>
              <span style={{ fontSize:10.5, color:T.muted }}>{empresas.length} paradas</span>
            </div>
            <div style={{ padding:10, display:"flex", flexDirection:"column", gap:8, flex:1 }}>
              {empresas.length===0 && <div style={{ fontSize:10.5, color:T.muted, textAlign:"center", padding:12, border:`1px dashed ${T.border}`, borderRadius:8 }}>Sin empresas — añade alguna</div>}
              {empresas.map(p=>{
                const av = analisisVisita[p.id];
                return (
                <div key={p.id} style={{ border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden" }}>
                  <div onClick={()=>setExpandedId(expandedId===p.id?null:p.id)} style={{ padding:"9px 11px", cursor:"pointer" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:T.title }}>{p.nombre}</span>
                      <span style={{ fontSize:9, fontWeight:800, color:BARRERA_COLOR[p.barrera], background:`${BARRERA_COLOR[p.barrera]}18`, borderRadius:5, padding:"1px 6px", whiteSpace:"nowrap" }}>{p.barrera}</span>
                    </div>
                    <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{SECTOR_LABEL[p.sector]} · consumo {p.consumo}/100</div>
                    <div style={{ background:T.bg, borderRadius:99, height:4, marginTop:5 }}>
                      <div style={{ width:`${p.consumo}%`, height:"100%", borderRadius:99, background:T.blue }}/>
                    </div>
                  </div>
                  {expandedId===p.id && (
                    <div style={{ padding:"0 11px 11px" }}>
                      <div style={{ fontSize:10.5, color:T.body, lineHeight:1.5, marginBottom:8 }}>{p.argumento}</div>
                      <div style={{ fontSize:9.5, color:T.muted, marginBottom:8 }}>{p.direccion}{p.telefono&&` · 📞 ${p.telefono}`}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        <button onClick={()=>anadirCliente(p)} disabled={added.has(p.id)} style={{ width:"100%", padding:"6px", borderRadius:7, border:"none", background:added.has(p.id)?T.green:T.blue, color:"#fff", fontSize:11, fontWeight:700, cursor:added.has(p.id)?"default":"pointer" }}>
                          {added.has(p.id)?"✓ En Clientes":"+ Añadir a Clientes"}
                        </button>
                        <button onClick={()=>analizarVisita(p)} disabled={av?.loading} style={{ width:"100%", padding:"6px", borderRadius:7, border:`1px solid ${T.violet}55`, background:"#F5F3FF", color:T.violet, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          {av?.loading?"Analizando…":"🔍 Analizar visita con IA"}
                        </button>
                        <button onClick={()=>quitarDeDia(dia,p.id)} style={{ width:"100%", padding:"6px", borderRadius:7, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          ✕ Quitar de este día
                        </button>
                      </div>
                      {av?.texto && (
                        <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
                          {parseInformeSecciones(av.texto).map((s,i)=>(
                            <div key={i} style={{ background:T.bg, borderRadius:8, padding:"9px 11px" }}>
                              {s.heading && <div style={{ fontSize:10.5, fontWeight:800, color:T.violet, marginBottom:4 }}>{s.heading}</div>}
                              <div style={{ fontSize:10.5, color:T.body, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{s.body}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );})}

              {pickerDia===dia ? (
                <div style={{ border:`1px solid ${T.border}`, borderRadius:9, padding:8 }}>
                  <input value={pickerBusqueda} onChange={e=>setPickerBusqueda(e.target.value)} placeholder="Buscar empresa…" autoFocus
                    style={{ width:"100%", padding:"6px 9px", borderRadius:7, border:`1px solid ${T.border}`, fontSize:11.5, outline:"none", boxSizing:"border-box", marginBottom:6 }}/>
                  <div style={{ maxHeight:160, overflowY:"auto", display:"flex", flexDirection:"column", gap:3 }}>
                    {empresaPool
                      .filter(e=>!plan.dias[dia].includes(e.id) && e.nombre.toLowerCase().includes(pickerBusqueda.toLowerCase()))
                      .slice(0,30)
                      .map(e=>(
                        <div key={e.id} onClick={()=>anadirADia(dia,e.id)} style={{ padding:"5px 8px", borderRadius:6, cursor:"pointer", fontSize:11 }}
                          onMouseEnter={ev=>ev.currentTarget.style.background=T.bg} onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                          {e.nombre} <span style={{ color:T.muted, fontSize:9.5 }}>· {e.ciudad}</span>
                        </div>
                      ))}
                  </div>
                  <button onClick={()=>{setPickerDia(null);setPickerBusqueda("");}} style={{ width:"100%", marginTop:6, padding:"5px", borderRadius:6, border:"none", background:"transparent", color:T.muted, fontSize:10.5, cursor:"pointer" }}>Cancelar</button>
                </div>
              ) : (
                <button onClick={()=>setPickerDia(dia)} style={{ width:"100%", padding:"7px", borderRadius:8, border:`1px dashed ${T.border}`, background:"transparent", color:T.blue, fontSize:11, fontWeight:700, cursor:"pointer" }}>+ Añadir empresa</button>
              )}
            </div>
            <div style={{ padding:10, display:"flex", flexDirection:"column", gap:6 }}>
              {empresas.length>0 && <a href={rutaDelDia(empresas)} target="_blank" rel="noopener noreferrer" style={{ display:"block", textAlign:"center", padding:"7px", borderRadius:8, background:T.bg, color:T.blue, fontSize:11, fontWeight:700, textDecoration:"none" }}>🗺️ Ruta del día</a>}
              <button onClick={()=>completarDia(dia)} disabled={empresas.length===0} style={{ padding:"7px", borderRadius:8, border:"none", background:empresas.length===0?T.bg:T.green, color:empresas.length===0?T.muted:"#fff", fontSize:11, fontWeight:700, cursor:empresas.length===0?"default":"pointer" }}>✓ Ruta completada</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:10.5, color:T.muted, marginTop:10, marginBottom:20, lineHeight:1.5 }}>
        Datos de facturación y plantilla de fuentes públicas (Murcia Plaza, eInforma, Axesor, Kompass) — verifícalos antes de una negociación formal. Las direcciones de polígono sin número de nave son aproximadas. "✓ Ruta completada" archiva el día en el historial y propone automáticamente las 3 empresas de mayor consumo aún no visitadas para la próxima semana.
      </div>

      {historial.length>0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, fontFamily:"monospace", letterSpacing:.5, marginBottom:8 }}>HISTORIAL DE RUTAS COMPLETADAS ({historial.length})</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {historial.map(h=>(
              <div key={h.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"8px 12px", fontSize:11.5, gap:10 }}>
                <span style={{ color:T.muted, minWidth:70 }}>{h.fecha}</span>
                <span style={{ color:T.body, fontWeight:700, minWidth:70 }}>{h.dia}</span>
                <span style={{ color:T.body, flex:1 }}>{h.empresas.join(" · ")}</span>
                <button onClick={()=>borrarDelHistorial(h.id)} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:13 }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RutasView({ clientes, home, setHome, addCliente, showToast }){
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [result, setResult] = useState(null);
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [editHome, setEditHome] = useState(false);
  const [homeDraft, setHomeDraft] = useState(home.direccion);

  useEffect(()=>{ (async()=>{ const h = await load("packboard-rutas"); if(h) setHistorial(h); })(); },[]);

  const conCiudad = clientes.filter(c=>c.ciudad && c.ciudad.trim());
  const toggle = (id) => setSelectedIds(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  const guardarHome = () => {
    const geo = geocodeCiudad(homeDraft, HOME_DEFAULT) || HOME_DEFAULT;
    setHome({ lat:geo.lat, lon:geo.lon, direccion:homeDraft.trim()||HOME_DEFAULT.direccion });
    setEditHome(false);
  };

  const calcular = async () => {
    const paradas = conCiudad.filter(c=>selectedIds.has(c.id)).map(c=>{
      const geo = geocodeCiudad(c.ciudad, home);
      return { id:c.id, name:c.empresa, ciudad:c.ciudad, fase:c.fase, sector:c.sector, lat:geo.lat, lon:geo.lon, aprox:geo.aprox };
    });
    if(paradas.length<1){ return; }
    const { route, distTotal } = optimizeRoute(paradas, home);
    setResult({ route, distTotal });
    setAiAdvice("");
    const nueva = { id:uid(), fecha:today(), paradas:route.map(r=>r.name), km:distTotal };
    const updated = [nueva, ...historial].slice(0,10);
    setHistorial(updated);
    await save("packboard-rutas", updated);
  };

  const analizarIA = async () => {
    if(!result) return;
    setAiLoading(true); setAiAdvice("");
    const faseLbl = f => (FASES.find(x=>x.id===f)||{}).label || f || "—";
    const listado = result.route.map((p,i)=>`${i+1}. ${p.name} (${p.ciudad}) — fase: ${faseLbl(p.fase)} — ${p.kmDesdeAnterior}km desde la parada anterior`).join("\n");
    const prompt = `Eres un asistente de planificación comercial para un comercial de packaging/cartón que va a hacer una ruta de visitas hoy.

RUTA CALCULADA (orden ya optimizado por distancia, ${result.distTotal}km totales ida y vuelta, saliendo y volviendo a ${home.direccion}):
${listado}

Dame en español, sin relleno:
1. Si el orden por distancia tiene sentido comercial o si recomendarías anteponer alguna visita por su fase de pipeline (ej. una negociación cerca de cerrarse no debería esperar al final del día).
2. Un tip breve y concreto para la primera visita.
3. Una advertencia si detectas huecos de tiempo grandes entre paradas por la distancia.

Máximo 120 palabras, directo, en formato lista corta.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:500, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      setAiAdvice(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta.");
    } catch { setAiAdvice("Error conectando con el servicio de IA."); }
    setAiLoading(false);
  };

  return (
    <div>
      <PlanSemanalView home={home} clientes={clientes} addCliente={addCliente} showToast={showToast}/>

      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Rutas manuales</h1>
        <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>La ruta sale de tu dirección y vuelve a ella al terminar</p>
      </div>

      <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:15 }}>🏠</span>
        {!editHome ? (
          <>
            <span style={{ fontSize:12.5, color:T.body, flex:1 }}>Salida y llegada: <strong>{home.direccion}</strong></span>
            <button onClick={()=>{ setHomeDraft(home.direccion); setEditHome(true); }} style={{ background:"transparent", border:"none", color:T.blue, fontSize:11.5, fontWeight:700, cursor:"pointer" }}>✏️ Cambiar</button>
          </>
        ) : (
          <>
            <input value={homeDraft} onChange={e=>setHomeDraft(e.target.value)} placeholder="Ej. Molina de Segura, Murcia" style={{ ...inputStyle, flex:1 }}/>
            <button onClick={guardarHome} style={{ background:T.blue, color:"#fff", border:"none", borderRadius:7, padding:"6px 12px", fontSize:11.5, fontWeight:700, cursor:"pointer" }}>Guardar</button>
          </>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.3fr", gap:16 }}>
        {/* Selección de clientes */}
        <Card>
          <SectionTitle>Clientes con ciudad registrada ({conCiudad.length})</SectionTitle>
          {conCiudad.length===0 ? (
            <div style={{ fontSize:12.5, color:C.muted, textAlign:"center", padding:20 }}>Ningún cliente tiene ciudad todavía. Añádela al editar el cliente.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:420, overflowY:"auto" }}>
              {conCiudad.map(c=>{
                const sec = CRM_SECTORES.find(s=>s.id===c.sector);
                const fase = FASES.find(f=>f.id===c.fase);
                return (
                  <label key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:9, border:`1px solid ${C.border}`, cursor:"pointer", background:selectedIds.has(c.id)?C.brandBg:C.surface }}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={()=>toggle(c.id)} style={{ width:15, height:15, cursor:"pointer" }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:C.title }}>{c.empresa}</div>
                      <div style={{ fontSize:11, color:C.muted }}>📍 {c.ciudad} {sec&&`· ${sec.icon} ${sec.nombre}`}</div>
                    </div>
                    {fase && <Badge label={fase.label} color={fase.color} bg={`${fase.color}18`}/>}
                  </label>
                );
              })}
            </div>
          )}
          <Btn onClick={calcular} disabled={selectedIds.size===0} style={{ width:"100%", marginTop:14 }}>⚡ Calcular ruta óptima ({selectedIds.size})</Btn>
        </Card>

        {/* Resultado */}
        <Card>
          <SectionTitle>Ruta optimizada</SectionTitle>
          {!result ? (
            <div style={{ fontSize:12.5, color:C.muted, textAlign:"center", padding:40 }}>Selecciona clientes y pulsa "Calcular ruta óptima" para ver el orden más eficiente.</div>
          ) : (
            <>
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                <StatCard label="Distancia total (ida y vuelta)" value={`${result.distTotal} km`} color={C.brand} icon="📏"/>
                <StatCard label="Paradas" value={result.route.length} color={C.ok} icon="📍"/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
                <div style={{ fontSize:11, color:C.muted, paddingLeft:2 }}>🏠 Salida: {home.direccion}</div>
                {result.route.map((p,i)=>(
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:C.bg, borderRadius:9 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:C.brand, color:"#fff", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12.5, fontWeight:700, color:C.title }}>{p.name}</div>
                      <div style={{ fontSize:10.5, color:C.muted }}>{p.ciudad}{p.aprox&&" (ubicación aproximada)"}</div>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, fontFamily:"monospace" }}>+{p.kmDesdeAnterior}km</div>
                  </div>
                ))}
                <div style={{ fontSize:11, color:C.muted, paddingLeft:2 }}>🏠 Vuelta a: {home.direccion}</div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <a href={gmapsMultiStopLink(result.route, home)} target="_blank" rel="noopener noreferrer" style={{ flex:1, textAlign:"center", padding:"9px 14px", borderRadius:9, background:C.brand, color:"#fff", fontSize:12.5, fontWeight:700, textDecoration:"none" }}>🗺️ Abrir ruta en Google Maps</a>
                <Btn variant="outline" onClick={analizarIA} disabled={aiLoading}>{aiLoading?"Analizando…":"🤖 Analizar con IA"}</Btn>
              </div>
              {aiAdvice && (
                <div style={{ marginTop:14, background:"#F5F3FF", border:"1px solid #DDD6FE", borderRadius:10, padding:14, fontSize:12.5, color:C.body, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{aiAdvice}</div>
              )}
            </>
          )}
        </Card>
      </div>

      {historial.length>0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, fontFamily:"monospace", letterSpacing:.5, marginBottom:8 }}>HISTORIAL DE RUTAS ({historial.length})</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {historial.map(h=>(
              <div key={h.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:"8px 12px", fontSize:11.5, gap:8 }}>
                <span style={{ color:C.muted }}>{h.fecha}</span>
                <span style={{ color:C.body, flex:1, margin:"0 12px" }}>{h.paradas.join(" → ")}</span>
                <strong style={{ color:C.brand }}>{h.km} km</strong>
                <button onClick={async()=>{ const nuevo=historial.filter(x=>x.id!==h.id); setHistorial(nuevo); await save("packboard-rutas", nuevo); }} style={{ background:"transparent", border:"none", color:C.muted, cursor:"pointer", fontSize:13 }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   IA — Análisis Ejecutivo
   ════════════════════════════════════════════════════════════════════ */
/* ─── exportación de informes a PDF / Excel — SIEMPRE funciona ───────
   1º intento: jsPDF / SheetJS si están cargadas por CDN (archivo nativo)
   Fallback (sin dependencias, 100% navegador): imprimir→PDF y CSV      */
function informeHTML(titulo, kpis, texto){
  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const kpisHtml = kpis.map(k=>`<tr><td>${esc(k.label)}</td><td class="v">${esc(k.value)}</td></tr>`).join("");
  const seccionesHtml = parseInformeSecciones(texto).map(s=>`
    <div class="sec">${s.heading?`<h3>${esc(s.heading)}</h3>`:""}<p>${esc(s.body).replace(/\n/g,"<br/>")}</p></div>
  `).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(titulo)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:36px;color:#0F172A;max-width:720px;margin:0 auto;}
    .top{background:#0B1220;color:#fff;padding:22px 26px;border-radius:10px;margin-bottom:22px;}
    .top h1{margin:0 0 4px;font-size:20px;}
    .top .sub{color:#93C5FD;font-size:11px;}
    table{width:100%;border-collapse:collapse;margin-bottom:26px;}
    td{padding:7px 0;border-bottom:1px solid #E5E7EB;font-size:12.5px;}
    td.v{text-align:right;font-weight:700;}
    .sec{border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:10px;}
    .sec h3{margin:0 0 6px;font-size:13px;color:#1D4ED8;}
    .sec p{margin:0;font-size:12.5px;line-height:1.7;color:#374151;}
    .foot{margin-top:24px;font-size:10px;color:#94A3B8;}
    @media print { body{padding:14px;} .top{background:#0B1220 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
  </style></head><body>
    <div class="top"><h1>${esc(titulo)}</h1><div class="sub">PackBoard · ${esc(new Date().toLocaleDateString("es-ES"))}</div></div>
    <table>${kpisHtml}</table>
    ${seccionesHtml}
    <div class="foot">PackBoard · Confidencial</div>
  </body></html>`;
}
function printFallbackPDF(titulo, kpis, texto){
  const win = window.open("", "_blank");
  if(!win){ alert("Tu navegador ha bloqueado la ventana emergente. Permítela para poder guardar el informe como PDF."); return; }
  win.document.write(informeHTML(titulo, kpis, texto));
  win.document.close();
  setTimeout(()=>{ try{ win.focus(); win.print(); }catch{} }, 350);
}
function csvFallbackExcel(titulo, kpis, texto){
  const esc = v => { const s=String(v??""); return /[",;\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
  const rows = [
    [titulo], [`Generado: ${new Date().toLocaleString("es-ES")}`], [],
    ["INDICADOR","VALOR"], ...kpis.map(k=>[k.label,k.value]), [],
    ["INFORME"], ...texto.replace(/#{1,3}\s?/g,"").split("\n").map(l=>[l]),
  ];
  const csv = "\uFEFF"+rows.map(r=>r.map(esc).join(";")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${titulo.replace(/\s+/g,"_")}_${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
function exportInformePDF(titulo, kpis, texto){
  if (typeof window.jsPDF === "undefined") { printFallbackPDF(titulo, kpis, texto); return; }
  try{
    const { jsPDF } = window;
    const doc = new jsPDF("p","mm","a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 22;

    doc.setFillColor(11,18,32);
    doc.rect(0,0,pageWidth,42,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(255,255,255);
    doc.text(titulo, 15, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(190,200,220);
    doc.text(`PackBoard · Informe generado el ${new Date().toLocaleDateString("es-ES")}`, 15, y+9);

    y = 56;
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(29,78,216);
    doc.text("INDICADORES CLAVE", 15, y); y+=7;
    doc.setDrawColor(29,78,216); doc.setLineWidth(0.4); doc.line(15,y-2,pageWidth-15,y-2); y+=5;

    doc.setFontSize(10);
    kpis.forEach(k=>{
      doc.setFont("helvetica","normal"); doc.setTextColor(100,110,125);
      doc.text(`${k.label}`, 15, y);
      doc.setFont("helvetica","bold"); doc.setTextColor(15,23,42);
      doc.text(`${k.value}`, pageWidth-15, y, { align:"right" });
      y+=6.5;
      if(y>pageHeight-25){ doc.addPage(); y=20; }
    });

    y+=6;
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(29,78,216);
    doc.text("INFORME", 15, y); y+=7;
    doc.line(15,y-2,pageWidth-15,y-2); y+=6;

    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(55,65,81);
    const cleanText = texto.replace(/#{1,3}\s?/g,"").trim();
    cleanText.split("\n").forEach(paragraph=>{
      const lines = doc.splitTextToSize(paragraph, pageWidth-30);
      lines.forEach(line=>{
        if(y>pageHeight-15){ doc.addPage(); y=20; }
        doc.text(line, 15, y); y+=5.5;
      });
      y+=1.5;
    });

    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text("PackBoard · Confidencial", 15, pageHeight-8);

    doc.save(`${titulo.replace(/\s+/g,"_")}_${today()}.pdf`);
  }catch{
    printFallbackPDF(titulo, kpis, texto);
  }
}
function exportInformeExcel(titulo, kpis, texto){
  if (typeof window.XLSX === "undefined") { csvFallbackExcel(titulo, kpis, texto); return; }
  try{
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    const kpiRows = [[titulo],[`Generado: ${new Date().toLocaleString("es-ES")}`],[""],["INDICADOR","VALOR"], ...kpis.map(k=>[k.label,k.value])];
    const ws1 = XLSX.utils.aoa_to_sheet(kpiRows);
    ws1["!cols"] = [{wch:34},{wch:22}];
    XLSX.utils.book_append_sheet(wb, ws1, "KPIs");

    const informeRows = [["INFORME"],[""], ...texto.replace(/#{1,3}\s?/g,"").split("\n").map(l=>[l])];
    const ws2 = XLSX.utils.aoa_to_sheet(informeRows);
    ws2["!cols"] = [{wch:110}];
    XLSX.utils.book_append_sheet(wb, ws2, "Informe");

    XLSX.writeFile(wb, `${titulo.replace(/\s+/g,"_")}_${today()}.xlsx`);
  }catch{
    csvFallbackExcel(titulo, kpis, texto);
  }
}

/* ─── catálogo de los 3 informes ejecutivos ─────────────────────────── */
const REPORT_TYPES = [
  {
    id:"personal", label:"Mi rendimiento", icon:"🧑‍💼", color:T.blue,
    subtitulo:"Para ti — cómo vas esta semana",
    kpis:(data,crm)=>{
      const k = data.kpis;
      const ofertasEnviadas = crm ? crm.ofertas.length : 0;
      const ofertasAceptadas = crm ? crm.ofertas.filter(o=>o.estado==="aceptada").length : 0;
      const pedidos = crm ? crm.pedidos.length : 0;
      const comisionEst = crm ? crm.facturas.filter(f=>f.cobrada).reduce((a,f)=>a+fmtN(f.baseImponible)*0.05,0) : 0;
      return [
        { label:"Ventas de hoy", value:fmtE(k.ventasHoy.v) },
        { label:"Contactos nuevos", value:k.contactosNuevos.v },
        { label:"Velocidad de venta", value:`${k.velocidadVenta.v} días` },
        { label:"Tasa de conversión", value:`${k.tasaConversion.v}%` },
        { label:"Ofertas enviadas", value:ofertasEnviadas },
        { label:"Ofertas aceptadas", value:ofertasAceptadas },
        { label:"Pedidos cerrados", value:pedidos },
        { label:"Comisión generada (est.)", value:fmtE(comisionEst) },
      ];
    },
    prompt:(data,crm,kpisTxt)=>`Eres un coach de ventas hablando directamente con Pedro, comercial único de una empresa de packaging/cartón. Dale un informe PERSONAL en segunda persona ("tú"), cercano pero honesto, sobre cómo va su actividad.

SUS DATOS:
${kpisTxt}

Estructura en español, sin relleno, sin emojis:
## Cómo vas
(3-4 frases directas sobre su rendimiento actual)
## Lo que está funcionando
(máximo 2 puntos)
## Lo que puedes mejorar
(máximo 2 puntos, honesto pero constructivo)
## Tu plan para esta semana
(3 acciones muy concretas y accionables)

No inventes datos que no se han dado. Máximo 200 palabras.`,
  },
  {
    id:"comercial", label:"Dirección Comercial", icon:"📈", color:T.violet,
    subtitulo:"Estado del pipeline y del embudo de ventas",
    kpis:(data,crm)=>{
      const totalPipeline = data.pipeline.reduce((a,p)=>a+p.v,0);
      const enviadas = crm ? crm.ofertas.filter(o=>o.estado==="enviada").length : 0;
      const aceptadas = crm ? crm.ofertas.filter(o=>o.estado==="aceptada").length : 0;
      const rechazadas = crm ? crm.ofertas.filter(o=>o.estado==="rechazada").length : 0;
      const clientesActivos = crm ? crm.clientes.filter(c=>c.fase!=="perdido").length : 0;
      return [
        { label:"Pipeline total", value:fmtE(totalPipeline) },
        { label:"Tasa de conversión del funnel", value:`${data.kpis.tasaConversion.v}%` },
        { label:"Velocidad media de venta", value:`${data.kpis.velocidadVenta.v} días` },
        { label:"Ofertas activas (enviadas)", value:enviadas },
        { label:"Ofertas aceptadas", value:aceptadas },
        { label:"Ofertas rechazadas", value:rechazadas },
        { label:"Clientes activos en cartera", value:clientesActivos },
        { label:"Ticket medio", value:fmtE(data.kpis.ticketMedio.v) },
      ];
    },
    prompt:(data,crm,kpisTxt)=>`Eres consultor de ventas B2B preparando un informe para la DIRECCIÓN COMERCIAL de una empresa de packaging/cartón (comercial único trabajando en campo). Enfócate en la salud del pipeline, el embudo y la velocidad de conversión — no en cifras contables ni de margen.

DATOS DEL PIPELINE:
${kpisTxt}

Estructura en español, tono profesional, sin relleno, sin emojis:
## Estado del pipeline
(resumen de la salud del embudo)
## Riesgos de conversión
(máximo 3, solo si los datos los justifican)
## Recomendaciones tácticas
(máximo 3, accionables esta semana)

No inventes datos que no se han dado. Máximo 200 palabras.`,
  },
  {
    id:"gerencia", label:"Gerencia", icon:"🏛️", color:T.green,
    subtitulo:"Visión estratégica del negocio",
    kpis:(data,crm)=>{
      const facturado = data.ingresos.reduce((a,m)=>a+m.cobrado,0);
      const pendiente = crm ? crm.facturas.filter(f=>!f.cobrada).reduce((a,f)=>a+fmtN(f.total),0) : data.cobro.pendiente;
      const vencidas = crm ? crm.facturas.filter(f=>!f.cobrada&&f.fechaVencimiento&&new Date(f.fechaVencimiento)<new Date()).length : 0;
      return [
        { label:"Facturación (año)", value:fmtE(facturado) },
        { label:"Margen neto", value:`${data.kpis.margenNeto.v}%` },
        { label:"Cobrado", value:fmtE(data.cobro.cobrado) },
        { label:"Pendiente de cobro", value:fmtE(pendiente) },
        { label:"Facturas vencidas", value:vencidas },
        { label:"Clientes en cartera", value:crm?crm.clientes.length:0 },
        { label:"Pipeline activo", value:fmtE(data.kpis.pipelineActivo.v) },
      ];
    },
    prompt:(data,crm,kpisTxt)=>`Eres un analista senior preparando el informe ejecutivo para GERENCIA de una empresa distribuidora de packaging/cartón. Enfócate en rentabilidad, riesgo financiero y visión estratégica — no en detalle operativo del día a día.

DATOS DEL NEGOCIO:
${kpisTxt}

Estructura en español, tono ejecutivo, sin relleno, sin emojis:
## Resumen ejecutivo
(3-4 frases sobre el estado general del negocio)
## Riesgos estratégicos
(máximo 3, solo si los datos los justifican: impagos, concentración de cartera, margen)
## Recomendaciones para el próximo trimestre
(máximo 3, estratégicas, no operativas)

No inventes datos que no se han dado. Máximo 200 palabras.`,
  },
];

/* ─── parser de secciones "## Título" del informe generado por IA ───── */
function parseInformeSecciones(texto){
  const clean = (texto||"").replace(/\r/g,"");
  const parts = clean.split(/\n(?=##\s)/).map(s=>s.trim()).filter(Boolean);
  if(parts.length===0) return [{ heading:null, body:clean }];
  return parts.map(p=>{
    const m = p.match(/^##\s*(.+)/);
    if(m){ return { heading:m[1].trim(), body:p.slice(m[0].length).trim() }; }
    return { heading:null, body:p };
  });
}

/* ─── gráfico de apoyo, distinto según el tipo de informe ────────────── */
function InformeChart({ tipoId, data, crm }){
  if(tipoId==="personal"){
    const chartData = [
      { name:"Enviadas", v: crm?crm.ofertas.length:0 },
      { name:"Aceptadas", v: crm?crm.ofertas.filter(o=>o.estado==="aceptada").length:0 },
      { name:"Pedidos", v: crm?crm.pedidos.length:0 },
    ];
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="name" tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false}/>
          <Tooltip/>
          <Bar dataKey="v" name="Cantidad" radius={[6,6,0,0]} fill={T.blue}/>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if(tipoId==="comercial"){
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.pipeline}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="fase" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
          <Tooltip formatter={v=>fmtE(v)}/>
          <Bar dataKey="v" name="Valor" radius={[6,6,0,0]}>
            {data.pipeline.map((p,i)=><Cell key={i} fill={p.color}/>)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <div>
        <div style={{ fontSize:10, color:T.muted, textAlign:"center", marginBottom:4 }}>Cobrado vs pendiente</div>
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie data={[{name:"Cobrado",value:data.cobro.cobrado},{name:"Pendiente",value:data.cobro.pendiente}]} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
              <Cell fill={T.green}/><Cell fill={T.red}/>
            </Pie>
            <Tooltip formatter={v=>fmtE(v)}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div style={{ fontSize:10, color:T.muted, textAlign:"center", marginBottom:4 }}>Facturación mensual</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data.ingresos}>
            <defs>
              <linearGradient id="informeGerenciaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.blue} stopOpacity={0.25}/>
                <stop offset="100%" stopColor={T.blue} stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
            <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
            <Tooltip formatter={v=>fmtE(v)}/>
            <Area type="monotone" dataKey="cobrado" stroke={T.blue} fill="url(#informeGerenciaGrad)" strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── modal de informe completo: KPIs + gráfico + texto por secciones ─ */
function InformeModal({ tipo, data, crm, kpis, texto, onClose }){
  const secciones = parseInformeSecciones(texto);
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:T.bg, borderRadius:18, width:"100%", maxWidth:720, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ position:"sticky", top:0, background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:2 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:19 }}>{tipo.icon}</span>
            <div>
              <div style={{ fontSize:14.5, fontWeight:800, color:T.title }}>{tipo.label}</div>
              <div style={{ fontSize:10.5, color:T.muted }}>{new Date().toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"})}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", fontSize:22, cursor:"pointer", color:T.muted }}>✕</button>
        </div>

        <div style={{ padding:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8, marginBottom:18 }}>
            {kpis.map(k=>(
              <div key={k.label} style={{ background:T.surface, borderRadius:11, padding:"10px 12px", border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:9.5, color:T.muted, marginBottom:3 }}>{k.label}</div>
                <div style={{ fontSize:15, fontWeight:800, color:tipo.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:16, marginBottom:18 }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:T.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:.5 }}>Visualización</div>
            <InformeChart tipoId={tipo.id} data={data} crm={crm}/>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
            {secciones.map((s,i)=>(
              <div key={i} style={{ background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:"15px 17px" }}>
                {s.heading && <div style={{ fontSize:12.5, fontWeight:800, color:tipo.color, marginBottom:7 }}>{s.heading}</div>}
                <div style={{ fontSize:12, color:T.body, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{s.body}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={()=>exportInformePDF(tipo.label, kpis, texto)} style={{ flex:"1 1 140px", padding:"11px", borderRadius:9, border:"none", background:T.red, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>📄 Descargar PDF</button>
            <button onClick={()=>exportInformeExcel(tipo.label, kpis, texto)} style={{ flex:"1 1 140px", padding:"11px", borderRadius:9, border:"none", background:T.green, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Descargar Excel</button>
            <button onClick={()=>printFallbackPDF(tipo.label, kpis, texto)} style={{ flex:"1 1 140px", padding:"11px", borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.body, fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨️ Imprimir</button>
          </div>
          <div style={{ fontSize:10, color:T.muted, marginTop:8, lineHeight:1.5 }}>
            La descarga funciona siempre: si tu proyecto tiene cargadas las librerías jsPDF/SheetJS genera un archivo nativo directamente; si no, se abre automáticamente el diálogo de "Imprimir → Guardar como PDF" del navegador, o un .csv que Excel abre igual.
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ tipo, data, crm }){
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const kpis = tipo.kpis(data, crm);

  const generar = async () => {
    setLoading(true);
    const kpisTxt = kpis.map(k=>`- ${k.label}: ${k.value}`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:800, messages:[{role:"user",content:tipo.prompt(data,crm,kpisTxt)}] }),
      });
      const d = await res.json();
      setTexto(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta del modelo.");
    } catch {
      setTexto("Error conectando con el servicio de IA. Inténtalo de nuevo.");
    }
    setLoading(false);
  };

  const copiar = () => {
    navigator.clipboard?.writeText(texto).then(()=>{ setCopiado(true); setTimeout(()=>setCopiado(false),2000); });
  };

  const preview = texto.replace(/#{1,3}\s?/g,"").slice(0,160);

  return (
    <div style={{ background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      {showModal && <InformeModal tipo={tipo} data={data} crm={crm} kpis={kpis} texto={texto} onClose={()=>setShowModal(false)}/>}
      <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}`, background:`${tipo.color}0D` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
          <span style={{ fontSize:18 }}>{tipo.icon}</span>
          <span style={{ fontSize:14, fontWeight:800, color:T.title }}>{tipo.label}</span>
        </div>
        <div style={{ fontSize:11, color:T.muted }}>{tipo.subtitulo}</div>
      </div>

      <div style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:5, borderBottom:`1px solid ${T.border}` }}>
        {kpis.slice(0,4).map(k=>(
          <div key={k.label} style={{ display:"flex", justifyContent:"space-between", fontSize:11.5 }}>
            <span style={{ color:T.muted }}>{k.label}</span>
            <strong style={{ color:T.title }}>{k.value}</strong>
          </div>
        ))}
      </div>

      <div style={{ padding:18, flex:1, display:"flex", flexDirection:"column" }}>
        {!texto && !loading && (
          <button onClick={generar} style={{ padding:"10px", borderRadius:9, border:"none", background:tipo.color, color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer" }}>✨ Generar informe</button>
        )}
        {loading && <div style={{ textAlign:"center", padding:24, color:T.muted, fontSize:12 }}>Generando…</div>}
        {texto && !loading && (
          <>
            <div style={{ fontSize:12, color:T.body, lineHeight:1.6, marginBottom:12 }}>{preview}{texto.length>160?"…":""}</div>
            <button onClick={()=>setShowModal(true)} style={{ padding:"9px", borderRadius:9, border:"none", background:tipo.color, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:10 }}>🔍 Ver informe completo</button>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:"auto" }}>
              <button onClick={generar} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.body, fontSize:11, fontWeight:700, cursor:"pointer" }}>↻ Regenerar</button>
              <button onClick={copiar} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:8, border:"none", background:copiado?T.green:"#EFF6FF", color:copiado?"#fff":T.blue, fontSize:11, fontWeight:700, cursor:"pointer" }}>{copiado?"✓ Copiado":"📋 Copiar"}</button>
              <button onClick={()=>exportInformePDF(tipo.label, kpis, texto)} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:8, border:"none", background:"#FEF2F2", color:T.red, fontSize:11, fontWeight:700, cursor:"pointer" }}>📄 PDF</button>
              <button onClick={()=>exportInformeExcel(tipo.label, kpis, texto)} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:8, border:"none", background:"#ECFDF5", color:T.green, fontSize:11, fontWeight:700, cursor:"pointer" }}>📊 Excel</button>
              <button onClick={()=>printFallbackPDF(tipo.label, kpis, texto)} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.body, fontSize:11, fontWeight:700, cursor:"pointer" }}>🖨️ Imprimir</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IAExecutivoView({ data, crm }){
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Informes IA</h1>
        <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Tres informes ejecutivos independientes, cada uno con sus propios KPIs — descárgalos en PDF o Excel</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:16 }}>
        {REPORT_TYPES.map(tipo=><ReportCard key={tipo.id} tipo={tipo} data={data} crm={crm}/>)}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ALERTAS EN TIEMPO REAL — detección automática sobre datos del CRM
   ════════════════════════════════════════════════════════════════════ */
function computeAlerts(crm, noticias, descubiertas){
  if(!crm) return [];
  const { clientes, facturas, tareas, ofertas } = crm;
  const hoy = today();
  const alerts = [];

  facturas.filter(f=>!f.cobrada && f.fechaVencimiento && f.fechaVencimiento < hoy).forEach(f=>{
    const cl = clientes.find(c=>c.id===f.clienteId);
    alerts.push({ id:`fv-${f.id}`, sev:"crit", icon:"🧾", msg:`Factura vencida${cl?` — ${cl.empresa}`:""} (${fmtE2(f.total)})`, tab:"facturas" });
  });
  facturas.filter(f=>{
    if(f.cobrada || !f.fechaVencimiento) return false;
    const dias = (new Date(f.fechaVencimiento) - new Date(hoy))/86400000;
    return dias>=0 && dias<=3;
  }).forEach(f=>{
    const cl = clientes.find(c=>c.id===f.clienteId);
    alerts.push({ id:`fp-${f.id}`, sev:"warn", icon:"⏳", msg:`Factura vence en ≤3 días${cl?` — ${cl.empresa}`:""}`, tab:"facturas" });
  });
  (tareas||[]).filter(t=>!t.completada && t.vencimiento && t.vencimiento < hoy).forEach(t=>{
    alerts.push({ id:`tv-${t.id}`, sev:"crit", icon:"✅", msg:`Tarea vencida: ${t.titulo}`, tab:"clientes" });
  });
  (tareas||[]).filter(t=>!t.completada && t.vencimiento===hoy).forEach(t=>{
    alerts.push({ id:`th-${t.id}`, sev:"warn", icon:"📌", msg:`Tarea para hoy: ${t.titulo}`, tab:"clientes" });
  });
  (ofertas||[]).filter(o=>{
    if(o.estado!=="enviada") return false;
    const dias = (new Date(hoy) - new Date(o.fecha))/86400000;
    return dias>=14;
  }).forEach(o=>{
    const cl = clientes.find(c=>c.id===o.clienteId);
    alerts.push({ id:`oe-${o.id}`, sev:"warn", icon:"📄", msg:`Oferta sin respuesta hace +14 días${cl?` — ${cl.empresa}`:""}`, tab:"ofertas" });
  });

  Object.entries(noticias||{}).forEach(([empresaId,entry])=>{
    (entry.items||[]).forEach((item,idx)=>{
      if(item.leida) return;
      const cat = NOTICIA_CATS[item.categoria]||NOTICIA_CATS.otro;
      alerts.push({ id:`nt-${empresaId}-${idx}`, sev:"warn", icon:cat.icon, msg:`${entry.empresaNombre}: ${item.titulo}`, tab:"noticias" });
    });
  });
  if((descubiertas||[]).length>0){
    alerts.push({ id:"desc-nuevas", sev:"warn", icon:"🆕", msg:`${descubiertas.length} empresa${descubiertas.length!==1?"s":""} nueva${descubiertas.length!==1?"s":""} descubierta${descubiertas.length!==1?"s":""} para prospectar`, tab:"noticias" });
  }

  const sevOrder = { crit:0, warn:1 };
  return alerts.sort((a,b)=>sevOrder[a.sev]-sevOrder[b.sev]).slice(0,16);
}

function NotificationBell({ crm, noticias, descubiertas, setTab }){
  const [open, setOpen] = useState(false);
  const alerts = computeAlerts(crm, noticias, descubiertas);
  const critCount = alerts.filter(a=>a.sev==="crit").length;
  return (
    <div style={{ position:"relative" }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ position:"relative", cursor:"pointer" }}>
        <span style={{ fontSize:17 }}>🔔</span>
        {alerts.length>0 && (
          <span style={{ position:"absolute", top:-4, right:-6, background:critCount>0?T.red:T.orange, color:"#fff", fontSize:9, fontWeight:800, borderRadius:99, width:15, height:15, display:"flex", alignItems:"center", justifyContent:"center" }}>{alerts.length}</span>
        )}
      </div>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:"fixed", inset:0, zIndex:998 }}/>
          <div style={{ position:"absolute", top:28, right:0, width:340, maxHeight:420, overflowY:"auto", background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, boxShadow:"0 16px 40px rgba(15,23,42,.18)", zIndex:999 }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${T.border}`, fontSize:12.5, fontWeight:800, color:T.title }}>
              Alertas detectadas ({alerts.length})
            </div>
            {alerts.length===0 ? (
              <div style={{ padding:20, textAlign:"center", fontSize:12.5, color:T.muted }}>Sin alertas activas ahora mismo 🎉</div>
            ) : alerts.map(a=>(
              <div key={a.id} onClick={()=>{ setTab(a.tab); setOpen(false); }} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"10px 16px", borderBottom:`1px solid ${T.border}`, cursor:"pointer" }}>
                <span style={{ fontSize:14 }}>{a.icon}</span>
                <span style={{ fontSize:12, color:T.body, flex:1, lineHeight:1.4 }}>{a.msg}</span>
                <span style={{ width:6, height:6, borderRadius:"50%", background:a.sev==="crit"?T.red:T.orange, marginTop:5, flexShrink:0 }}/>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CATÁLOGO DE KPIs — dashboard personalizable
   ════════════════════════════════════════════════════════════════════ */
const KPI_CATALOG = [
  { id:"ventasHoy",      label:"Ventas (Hoy)",        cat:"Ventas",    color:T.blue,
    get:(d)=>({ value:fmtE(d.kpis.ventasHoy.v), delta:d.kpis.ventasHoy.d, base:d.kpis.ventasHoy.v }) },
  { id:"pipelineActivo", label:"Pipeline activo",     cat:"Ventas",    color:T.blue,
    get:(d)=>({ value:fmtE(d.kpis.pipelineActivo.v), delta:d.kpis.pipelineActivo.d, base:d.kpis.pipelineActivo.v }) },
  { id:"tasaConversion", label:"Tasa de conversión",  cat:"Ventas",    color:T.violet, isPct:true,
    get:(d)=>({ value:`${d.kpis.tasaConversion.v}%`, delta:d.kpis.tasaConversion.d, base:d.kpis.tasaConversion.v }) },
  { id:"ticketMedio",    label:"Ticket medio",        cat:"Ventas",    color:T.orange,
    get:(d)=>({ value:fmtE(d.kpis.ticketMedio.v), delta:d.kpis.ticketMedio.d, base:d.kpis.ticketMedio.v }) },
  { id:"velocidadVenta", label:"Velocidad venta",     cat:"Ventas",    color:T.blue,
    get:(d)=>({ value:`${d.kpis.velocidadVenta.v} días`, delta:d.kpis.velocidadVenta.d, base:d.kpis.velocidadVenta.v }) },
  { id:"contactosNuevos",label:"Contactos nuevos",    cat:"Ventas",    color:T.orange,
    get:(d)=>({ value:d.kpis.contactosNuevos.v, delta:d.kpis.contactosNuevos.d, base:d.kpis.contactosNuevos.v }) },
  { id:"cobradoHoy",     label:"Cobrado (Hoy)",       cat:"Finanzas",  color:T.green,
    get:(d)=>({ value:fmtE(d.kpis.cobradoHoy.v), delta:d.kpis.cobradoHoy.d, base:d.kpis.cobradoHoy.v }) },
  { id:"pendienteCobro", label:"Pendiente de cobro",  cat:"Finanzas",  color:T.red,
    get:(d,crm)=>{ const v = crm? crm.facturas.filter(f=>!f.cobrada).reduce((a,f)=>a+fmtN(f.total),0) : d.cobro.pendiente; return { value:fmtE(v), delta:-3.1, base:v }; } },
  { id:"facturasVencidas",label:"Facturas vencidas",  cat:"Finanzas",  color:T.red,
    get:(d,crm)=>{ const v = crm? crm.facturas.filter(f=>!f.cobrada&&f.fechaVencimiento&&new Date(f.fechaVencimiento)<new Date()).length : 0; return { value:v, delta:0, base:Math.max(v,1) }; } },
  { id:"facturacionMes", label:"Facturación (mes)",   cat:"Dirección", color:T.green,
    get:(d)=>({ value:fmtE(d.kpis.facturacionMes.v), delta:d.kpis.facturacionMes.d, base:d.kpis.facturacionMes.v }) },
  { id:"margenNeto",     label:"Margen neto",         cat:"Dirección", color:T.violet, isPct:true,
    get:(d)=>({ value:`${d.kpis.margenNeto.v}%`, delta:d.kpis.margenNeto.d, base:d.kpis.margenNeto.v }) },
  { id:"clientesActivos",label:"Clientes activos",    cat:"Dirección", color:T.blue,
    get:(d,crm)=>{ const v = crm? crm.clientes.filter(c=>c.fase!=="perdido").length : 0; return { value:v, delta:0, base:Math.max(v,1) }; } },
];
const DEFAULT_KPIS = ["ventasHoy","pipelineActivo","cobradoHoy","margenNeto","facturacionMes","velocidadVenta"];
const MAX_KPIS = 8;

function KpiPickerModal({ selected, onSave, onClose }){
  const [sel, setSel] = useState(new Set(selected));
  const toggle = (id) => setSel(s=>{
    const n = new Set(s);
    if(n.has(id)) n.delete(id);
    else if(n.size < MAX_KPIS) n.add(id);
    return n;
  });
  const categorias = ["Ventas","Dirección","Finanzas"];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:T.surface, borderRadius:16, padding:26, width:"100%", maxWidth:520, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:T.title }}>Personalizar KPIs</h2>
          <button onClick={onClose} style={{ background:"transparent", border:"none", fontSize:20, cursor:"pointer", color:T.muted }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:18 }}>Elige hasta {MAX_KPIS} indicadores para el dashboard. {sel.size}/{MAX_KPIS} seleccionados.</div>

        {categorias.map(cat=>(
          <div key={cat} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:T.muted, fontFamily:"monospace", letterSpacing:1, marginBottom:8 }}>{cat.toUpperCase()}{cat==="Dirección"?" · recomendado para informes":""}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {KPI_CATALOG.filter(k=>k.cat===cat).map(k=>(
                <label key={k.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:9, border:`1px solid ${T.border}`, cursor:"pointer", background:sel.has(k.id)?"#EFF6FF":T.surface }}>
                  <input type="checkbox" checked={sel.has(k.id)} onChange={()=>toggle(k.id)} disabled={!sel.has(k.id)&&sel.size>=MAX_KPIS} style={{ width:15, height:15, cursor:"pointer" }}/>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:k.color, flexShrink:0 }}/>
                  <span style={{ fontSize:12.5, color:T.title, fontWeight:600 }}>{k.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:6 }}>
          <button onClick={onClose} style={{ padding:"8px 18px", borderRadius:9, border:`1px solid ${T.border}`, background:"transparent", color:T.body, fontSize:12.5, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
          <button onClick={()=>onSave([...sel])} disabled={sel.size===0} style={{ padding:"8px 20px", borderRadius:9, border:"none", background:T.blue, color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer", opacity:sel.size===0?.5:1 }}>Guardar selección</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD PRINCIPAL
   ════════════════════════════════════════════════════════════════════ */
/* ─── gráfico de Ingresos con tipo seleccionable (área/barras/líneas) ── */
function IngresosChart({ data, tipo }){
  if(tipo==="bar"){
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
          <Tooltip content={<IngresosTooltip/>}/>
          <Bar dataKey="meta" fill={T.muted} opacity={0.3} radius={[6,6,0,0]}/>
          <Bar dataKey="cobrado" fill={T.blue} radius={[6,6,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if(tipo==="line"){
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
          <Tooltip content={<IngresosTooltip/>}/>
          <Line type="monotone" dataKey="meta" stroke={T.muted} strokeWidth={1.5} strokeDasharray="5 4" dot={false}/>
          <Line type="monotone" dataKey="cobrado" stroke={T.blue} strokeWidth={2.5} dot={{r:3}} activeDot={{r:5}}/>
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.blue} stopOpacity={0.22}/>
            <stop offset="100%" stopColor={T.blue} stopOpacity={0.01}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
        <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false}/>
        <YAxis tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
        <Tooltip content={<IngresosTooltip/>}/>
        <Area type="monotone" dataKey="meta" stroke={T.muted} strokeDasharray="5 4" strokeWidth={1.5} fill="none" dot={false}/>
        <Area type="monotone" dataKey="cobrado" stroke={T.blue} strokeWidth={2.5} fill="url(#ig)" dot={{ r:0 }} activeDot={{ r:5, fill:T.blue, stroke:"#fff", strokeWidth:2 }}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── gráfico de tendencia con métrica y tipo seleccionables ─────────── */
function TrendChart({ ingresos, margenSerie, metric, tipo }){
  const dataset = metric==="margen" ? margenSerie : ingresos;
  const dataKey = metric==="margen" ? "margen" : "cobrado";
  const color = metric==="margen" ? T.violet : T.blue;
  const fmtY = metric==="margen" ? (v=>`${v}%`) : (v=>`${Math.round(v/1000)}K`);
  const tipTexto = metric==="margen" ? (v=>`${v}%`) : (v=>fmtE(v));

  const tip = ({active,payload,label}) => active&&payload?.length ? (
    <div style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 10px", fontSize:11 }}>
      <div style={{ color:T.muted }}>{label}</div>
      <strong style={{ color }}>{tipTexto(payload[0].value)}</strong>
    </div>
  ) : null;

  if(tipo==="bar"){
    return (
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={dataset}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} interval={metric==="margen"?1:undefined}/>
          <YAxis tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmtY}/>
          <Tooltip content={tip}/>
          <Bar dataKey={dataKey} fill={color} radius={[6,6,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if(tipo==="area"){
    return (
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={dataset}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22}/>
              <stop offset="100%" stopColor={color} stopOpacity={0.01}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} interval={metric==="margen"?1:undefined}/>
          <YAxis tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmtY}/>
          <Tooltip content={tip}/>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill="url(#trendGrad)" dot={false} activeDot={{ r:5, fill:color, stroke:"#fff", strokeWidth:2 }}/>
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={dataset}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
        <XAxis dataKey="mes" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} interval={metric==="margen"?1:undefined}/>
        <YAxis tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmtY}/>
        <Tooltip content={tip}/>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r:5, fill:color, stroke:"#fff", strokeWidth:2 }}/>
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── desglose real por sectores, calculado desde el CRM ────────────── */
function calcularPorSector(crm){
  return CRM_SECTORES.map(s=>{
    if(!crm) return { ...s, clientes:0, facturado:0, pipeline:0 };
    const clientesSector = crm.clientes.filter(c=>c.sector===s.id);
    const idsClientes = new Set(clientesSector.map(c=>c.id));
    const facturado = crm.facturas.filter(f=>f.cobrada && idsClientes.has(f.clienteId)).reduce((a,f)=>a+fmtN(f.total),0);
    const pipeline = crm.ofertas.filter(o=>o.estado==="enviada" && idsClientes.has(o.clienteId)).reduce((a,o)=>a+totalOferta(o),0);
    return { ...s, clientes:clientesSector.length, facturado, pipeline };
  }).sort((a,b)=>b.facturado-a.facturado);
}

/* ─── panel de análisis IA embebido en el propio Dashboard ──────────── */
function DashboardAIInsights({ data, porSector }){
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);

  const analizar = async () => {
    setLoading(true); setTexto("");
    const sectorTxt = porSector.filter(s=>s.clientes>0).map(s=>`${s.nombre}: ${s.clientes} clientes, ${fmtE(s.facturado)} facturado, ${fmtE(s.pipeline)} en pipeline`).join("\n") || "(sin clientes asignados a sector todavía)";
    const prompt = `Eres un analista de datos comercial. Observa este dashboard de una empresa de packaging/cartón y da 3-4 observaciones cortas y accionables en español, en formato lista con guiones, cada una empezando con un emoji relevante, sin títulos ni secciones:

KPIs actuales:
- Ventas hoy: ${fmtE(data.kpis.ventasHoy.v)}
- Pipeline activo: ${fmtE(data.kpis.pipelineActivo.v)}
- Margen neto: ${data.kpis.margenNeto.v}%
- Cobrado: ${fmtE(data.cobro.cobrado)} · Pendiente: ${fmtE(data.cobro.pendiente)}

Desglose real por sector (datos del CRM):
${sectorTxt}

Detecta cosas como concentración excesiva de facturación en un solo sector (riesgo de dependencia), riesgo de cobro pendiente alto, o una oportunidad clara según el desglose. No inventes datos que no se han dado. Máximo 70 palabras en total.`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:350, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      setTexto(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta.");
    }catch{ setTexto("Error conectando con el servicio de IA."); }
    setLoading(false);
  };

  return (
    <div style={{ background:`linear-gradient(135deg,#0B1220,${T.blue})`, borderRadius:16, padding:"16px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:220 }}>
        <div style={{ color:"#93C5FD", fontSize:10.5, fontWeight:700, letterSpacing:1.2, marginBottom:4 }}>ANÁLISIS IA DEL DASHBOARD</div>
        {texto ? (
          <div style={{ color:"#fff", fontSize:12.5, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{texto}</div>
        ) : (
          <div style={{ color:"#BFDBFE", fontSize:12.5 }}>{loading?"Analizando tu dashboard…":"Pulsa analizar para que la IA revise tus KPIs y sectores en tiempo real."}</div>
        )}
      </div>
      <button onClick={analizar} disabled={loading} style={{ background:"#fff", color:T.title, border:"none", borderRadius:9, padding:"9px 18px", fontSize:12, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
        {loading?"…":texto?"↻ Reanalizar":"✨ Analizar"}
      </button>
    </div>
  );
}

/* ─── botón: informe completo del Dashboard con IA, exportable ──────── */
function DashboardReportButton({ data, crm, porSector, activeKpis }){
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState("");
  const [showModal, setShowModal] = useState(false);

  const kpis = [
    ...activeKpis.map(k=>({ label:k.label, value:k.get(data,crm).value })),
    ...porSector.filter(s=>s.clientes>0).slice(0,6).map(s=>({ label:`Facturado — ${s.nombre}`, value: fmtE(s.facturado) })),
  ];
  const tipo = { id:"dashboard", icon:"📊", label:"Informe del Dashboard", color:T.blue };

  const generar = async () => {
    setLoading(true); setTexto("");
    const kpisTxt = kpis.map(k=>`- ${k.label}: ${k.value}`).join("\n");
    const sectorTxt = porSector.filter(s=>s.clientes>0).map(s=>`${s.nombre}: ${s.clientes} clientes, ${fmtE(s.facturado)} facturado, ${fmtE(s.pipeline)} pipeline`).join("\n")||"(sin clientes con sector asignado todavía)";
    const prompt = `Eres un analista de negocio revisando el dashboard completo de una empresa de packaging/cartón ondulado (comercial único). Genera un informe breve y ejecutivo en español, listo para compartir.

KPIs mostrados en el dashboard ahora mismo:
${kpisTxt}

Desglose real por sector (datos del CRM):
${sectorTxt}

Pipeline por fase: ${data.pipeline.map(p=>`${p.fase}: ${fmtE(p.v)}`).join(", ")}
Cobro: ${fmtE(data.cobro.cobrado)} cobrado, ${fmtE(data.cobro.pendiente)} pendiente

Estructura en español, sin relleno, sin emojis:
## Resumen general
(3-4 frases sobre el estado del negocio ahora mismo)
## Sectores y concentración
(qué destaca del desglose sectorial, si hay riesgo de dependencia de un sector)
## Riesgos detectados
(máximo 3, solo si los datos los justifican)
## Recomendaciones
(máximo 3, accionables)

No inventes datos que no se han dado. Máximo 220 palabras en total.`;
    try{
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:900, messages:[{role:"user",content:prompt}] }),
      });
      const d = await res.json();
      setTexto(d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Sin respuesta.");
      setShowModal(true);
    }catch{
      setTexto("Error conectando con el servicio de IA.");
      setShowModal(true);
    }
    setLoading(false);
  };

  return (
    <>
      <button onClick={generar} disabled={loading} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:9, border:"none", background:T.blue, color:"#fff", fontSize:12.5, fontWeight:700, cursor:"pointer" }}>
        {loading?"Generando…":"📄 Informe completo con IA"}
      </button>
      {showModal && <InformeModal tipo={tipo} data={data} crm={crm} kpis={kpis} texto={texto} onClose={()=>setShowModal(false)}/>}
    </>
  );
}

function DashboardView({ data, periodo, setPeriodo, crm, selectedKpis, setSelectedKpis }){
  const k = data.kpis;
  const totalCobro = data.cobro.cobrado + data.cobro.pendiente;
  const cobradoPct = Math.round((data.cobro.cobrado/totalCobro)*100);
  const maxPipeline = Math.max(...data.pipeline.map(p=>p.v));
  const totalPipeline = data.pipeline.reduce((a,p)=>a+p.v,0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chartType, setChartType] = useState("area");
  const [cobroTipo, setCobroTipo] = useState("donut");
  const [trendMetric, setTrendMetric] = useState("margen");
  const [trendTipo, setTrendTipo] = useState("line");
  const [sectorTipo, setSectorTipo] = useState("bar");
  const porSector = calcularPorSector(crm);
  const sectoresActivos = porSector.filter(s=>s.clientes>0);
  const maxSector = Math.max(1, ...sectoresActivos.map(s=>s.facturado));

  const activeKpis = (selectedKpis||DEFAULT_KPIS).map(id=>KPI_CATALOG.find(k=>k.id===id)).filter(Boolean);
  const cols = activeKpis.length<=4 ? activeKpis.length : activeKpis.length<=6 ? activeKpis.length : 4;

  return (
    <div>
      {pickerOpen && <KpiPickerModal selected={selectedKpis||DEFAULT_KPIS} onClose={()=>setPickerOpen(false)} onSave={(ids)=>{ setSelectedKpis(ids); setPickerOpen(false); }}/>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, color:T.title, margin:0, letterSpacing:-0.5 }}>Dashboard</h1>
          <p style={{ fontSize:13, color:T.muted, margin:"3px 0 0" }}>Resumen general de tu negocio</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <DashboardReportButton data={data} crm={crm} porSector={porSector} activeKpis={activeKpis}/>
          <button onClick={()=>setPickerOpen(true)} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", borderRadius:9, border:`1px solid ${T.border}`, background:"#fff", color:T.body, fontSize:12.5, fontWeight:700, cursor:"pointer" }}>⚙️ Personalizar KPIs</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:12, marginBottom:20 }}>
        {activeKpis.map(kpi=>{
          const r = kpi.get(data, crm);
          return <KpiCard key={kpi.id} label={kpi.label} value={r.value} delta={r.delta} spark={genSerie(Math.max(r.base,1)*0.8,10,0.22)} color={kpi.color} isPct={kpi.isPct}/>;
        })}
      </div>

      <DashboardAIInsights data={data} porSector={porSector}/>

      <div style={{ display:"grid", gridTemplateColumns:"1.7fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:T.title }}>Ingresos vs Meta</div>
              <div style={{ display:"flex", gap:14, marginTop:8 }}>
                <span style={{ fontSize:11.5, color:T.body, display:"flex", alignItems:"center", gap:5 }}><span style={{width:14,height:2,background:T.blue,display:"inline-block"}}/>Cobrado</span>
                <span style={{ fontSize:11.5, color:T.body, display:"flex", alignItems:"center", gap:5 }}><span style={{width:14,height:0,borderTop:`2px dashed ${T.muted}`,display:"inline-block"}}/>Meta</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:2, background:T.bg, borderRadius:9, padding:3 }}>
                {[["area","📈"],["bar","📊"],["line","〰️"]].map(([tp,ic])=>(
                  <button key={tp} onClick={()=>setChartType(tp)} title={tp} style={{
                    width:28, height:26, borderRadius:6, fontSize:12.5, cursor:"pointer", border:"none",
                    background: chartType===tp?"#fff":"transparent",
                    boxShadow: chartType===tp?"0 1px 3px rgba(15,23,42,.1)":"none",
                  }}>{ic}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:4, background:T.bg, borderRadius:9, padding:3 }}>
                {["Anual","Mensual","Diario"].map(p=>(
                  <button key={p} onClick={()=>setPeriodo(p)} style={{
                    padding:"5px 12px", borderRadius:7, fontSize:11.5, fontWeight:700, cursor:"pointer", border:"none",
                    background: periodo===p?"#fff":"transparent",
                    color: periodo===p?T.blue:T.muted,
                    boxShadow: periodo===p?"0 1px 3px rgba(15,23,42,.1)":"none",
                  }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
          <IngresosChart data={data.ingresos} tipo={chartType}/>
        </div>

        <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}` }}>
          <div style={{ fontWeight:800, fontSize:15, color:T.title, marginBottom:16 }}>Pipeline por etapa</div>
          {data.pipeline.map(p=>(
            <div key={p.fase} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12.5, marginBottom:5 }}>
                <span style={{ color:T.body }}>{p.fase}</span>
                <span style={{ color:T.muted }}>{Math.round((p.v/totalPipeline)*100)}%</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ flex:1, background:T.bg, borderRadius:99, height:8 }}>
                  <div style={{ width:`${(p.v/maxPipeline)*100}%`, height:"100%", borderRadius:99, background:p.color }}/>
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:T.title, minWidth:64, textAlign:"right" }}>{fmtE(p.v)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.2fr", gap:14 }}>
        <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontWeight:800, fontSize:15, color:T.title }}>Cobro vs Pendiente de cobro</div>
            <div style={{ display:"flex", gap:2, background:T.bg, borderRadius:8, padding:2 }}>
              {[["donut","◔"],["bar","▤"]].map(([tp,ic])=>(
                <button key={tp} onClick={()=>setCobroTipo(tp)} style={{ width:24, height:22, borderRadius:5, fontSize:11, cursor:"pointer", border:"none", background:cobroTipo===tp?"#fff":"transparent", boxShadow:cobroTipo===tp?"0 1px 3px rgba(15,23,42,.1)":"none" }}>{ic}</button>
              ))}
            </div>
          </div>
          {cobroTipo==="donut" ? (
            <div style={{ position:"relative", display:"flex", justifyContent:"center" }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={[{name:"Cobrado",value:data.cobro.cobrado},{name:"Pendiente",value:data.cobro.pendiente}]}
                    cx="50%" cy="50%" innerRadius={56} outerRadius={78} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    <Cell fill={T.green}/>
                    <Cell fill={T.red}/>
                  </Pie>
                  <Tooltip formatter={v=>fmtE(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position:"absolute", top:"38%", left:0, right:0, textAlign:"center" }}>
                <div style={{ fontSize:19, fontWeight:800, color:T.title }}>{fmtE(totalCobro)}</div>
                <div style={{ fontSize:10.5, color:T.muted }}>Total</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[{name:"Cobrado",v:data.cobro.cobrado,fill:T.green},{name:"Pendiente",v:data.cobro.pendiente,fill:T.red}]}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                <XAxis dataKey="name" tick={{fill:T.muted,fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
                <Tooltip formatter={v=>fmtE(v)}/>
                <Bar dataKey="v" radius={[6,6,0,0]}>
                  <Cell fill={T.green}/><Cell fill={T.red}/>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:T.green }}/>
              <span style={{ fontSize:12, color:T.body, flex:1 }}>Cobrado</span>
              <strong style={{ fontSize:12.5, color:T.title }}>{fmtE(data.cobro.cobrado)}</strong>
              <span style={{ fontSize:11, color:T.muted }}>{cobradoPct}%</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:T.red }}/>
              <span style={{ fontSize:12, color:T.body, flex:1 }}>Pendiente</span>
              <strong style={{ fontSize:12.5, color:T.title }}>{fmtE(data.cobro.pendiente)}</strong>
              <span style={{ fontSize:11, color:T.muted }}>{100-cobradoPct}%</span>
            </div>
          </div>
        </div>

        <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <select value={trendMetric} onChange={e=>setTrendMetric(e.target.value)} style={{ fontWeight:800, fontSize:13, color:T.title, border:"none", background:"transparent", cursor:"pointer", outline:"none" }}>
              <option value="margen">Margen neto (%)</option>
              <option value="cobrado">Cobrado mensual</option>
            </select>
            <div style={{ display:"flex", gap:2, background:T.bg, borderRadius:8, padding:2 }}>
              {[["area","📈"],["bar","📊"],["line","〰️"]].map(([tp,ic])=>(
                <button key={tp} onClick={()=>setTrendTipo(tp)} style={{ width:24, height:22, borderRadius:5, fontSize:11, cursor:"pointer", border:"none", background:trendTipo===tp?"#fff":"transparent", boxShadow:trendTipo===tp?"0 1px 3px rgba(15,23,42,.1)":"none" }}>{ic}</button>
              ))}
            </div>
          </div>
          <TrendChart ingresos={data.ingresos} margenSerie={data.margenSerie} metric={trendMetric} tipo={trendTipo}/>
        </div>

        <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontWeight:800, fontSize:15, color:T.title }}>Actividad reciente</div>
            <span style={{ fontSize:11.5, color:T.blue, fontWeight:700, cursor:"pointer" }}>Ver todo</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {data.actividad.map((a,i)=>(
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <div style={{ background:a.bg, color:a.color, width:30, height:30, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>{a.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:T.title }}>{a.titulo}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{a.sub}</div>
                </div>
                <div style={{ fontSize:10.5, color:T.muted, whiteSpace:"nowrap" }}>{a.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background:T.surface, borderRadius:16, padding:"18px 20px", border:`1px solid ${T.border}`, marginTop:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontWeight:800, fontSize:15, color:T.title }}>Desglose por sectores</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:10.5, color:T.muted, fontFamily:"monospace" }}>datos reales de tu CRM</span>
            <div style={{ display:"flex", gap:2, background:T.bg, borderRadius:8, padding:2 }}>
              {[["bar","▤"],["pie","◔"]].map(([tp,ic])=>(
                <button key={tp} onClick={()=>setSectorTipo(tp)} style={{ width:24, height:22, borderRadius:5, fontSize:11, cursor:"pointer", border:"none", background:sectorTipo===tp?"#fff":"transparent", boxShadow:sectorTipo===tp?"0 1px 3px rgba(15,23,42,.1)":"none" }}>{ic}</button>
              ))}
            </div>
          </div>
        </div>
        {!crm ? (
          <div style={{ color:T.muted, fontSize:12.5, textAlign:"center", padding:24 }}>Cargando datos del CRM…</div>
        ) : sectoresActivos.length===0 ? (
          <div style={{ color:T.muted, fontSize:12.5, textAlign:"center", padding:24 }}>Todavía no tienes clientes con sector asignado. Se rellenará solo según vayas dando de alta clientes en el CRM.</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:24 }}>
            {sectorTipo==="bar" ? (
              <ResponsiveContainer width="100%" height={Math.max(160, sectoresActivos.length*34)}>
                <BarChart data={sectoresActivos} layout="vertical" margin={{ left:6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                  <XAxis type="number" tick={{fill:T.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>fmtE(v)} domain={[0,maxSector*1.15]}/>
                  <YAxis type="category" dataKey="nombre" tick={{fill:T.body,fontSize:11}} axisLine={false} tickLine={false} width={92}/>
                  <Tooltip formatter={v=>fmtE(v)}/>
                  <Bar dataKey="facturado" name="Facturado" radius={[0,6,6,0]}>
                    {sectoresActivos.map((s,i)=><Cell key={i} fill={s.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, sectoresActivos.length*20)}>
                <PieChart>
                  <Pie data={sectoresActivos} cx="50%" cy="50%" innerRadius={0} outerRadius={90} dataKey="facturado" nameKey="nombre" label={({nombre,percent})=>`${nombre} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {sectoresActivos.map((s,i)=><Cell key={i} fill={s.color}/>)}
                  </Pie>
                  <Tooltip formatter={v=>fmtE(v)}/>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:9, justifyContent:"center" }}>
              {sectoresActivos.map(s=>(
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:15 }}>{s.icon}</span>
                  <span style={{ flex:1, fontSize:12, color:T.body }}>{s.nombre}</span>
                  <span style={{ fontSize:10, color:T.muted }}>{s.clientes} cli.</span>
                  <strong style={{ fontSize:12, color:T.title, minWidth:74, textAlign:"right" }}>{fmtE(s.facturado)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CRM — constantes, helpers UI y storage
   ════════════════════════════════════════════════════════════════════ */
const CRM_SECTORES = [
  {id:"log",nombre:"Logística",icon:"🚚",color:"#6366F1"},
  {id:"ali",nombre:"Alimentación",icon:"🥩",color:"#10B981"},
  {id:"far",nombre:"Farmacéutico",icon:"💊",color:"#3B82F6"},
  {id:"ret",nombre:"Retail",icon:"🛒",color:"#F59E0B"},
  {id:"con",nombre:"Construcción",icon:"🏗️",color:"#EF4444"},
  {id:"tec",nombre:"Tecnología",icon:"💻",color:"#8B5CF6"},
  {id:"ind",nombre:"Industria",icon:"⚙️",color:"#06B6D4"},
];
const FASES = [
  {id:"prospecto", label:"Prospecto",   color:"#64748B"},
  {id:"contactado",label:"Contactado",  color:"#6366F1"},
  {id:"interes",   label:"Interesado",  color:"#F59E0B"},
  {id:"propuesta", label:"Propuesta",   color:"#3B82F6"},
  {id:"negociacion",label:"Negociación",color:"#8B5CF6"},
  {id:"cerrado",   label:"Cerrado ✓",  color:"#059669"},
  {id:"perdido",   label:"Perdido",     color:"#DC2626"},
];
const TIPOS_INTERACCION = [
  {id:"llamada",label:"📞 Llamada",color:C.info},
  {id:"email",  label:"📧 Email",  color:C.brand},
  {id:"visita", label:"🤝 Visita", color:C.ok},
  {id:"nota",   label:"📝 Nota",   color:C.muted},
  {id:"reunion",label:"🗓️ Reunión",color:"#8B5CF6"},
];
const PRIORIDADES = [
  {id:"alta",label:"🔴 Alta",color:C.crit},
  {id:"media",label:"🟡 Media",color:C.warn},
  {id:"baja",label:"🟢 Baja",color:C.ok},
];

const KEYS = {
  clientes:"crm-clientes", contactos:"crm-contactos",
  interacciones:"crm-interacciones", tareas:"crm-tareas",
  catalogo:"crm-catalogo", ofertas:"crm-ofertas",
  pedidos:"crm-pedidos", facturas:"crm-facturas",
  config:"crm-config",
};

/* ─── copia de seguridad completa (exportar/importar todo el storage) ── */
const BACKUP_KEYS = [
  KEYS.clientes, KEYS.contactos, KEYS.interacciones, KEYS.tareas, KEYS.catalogo,
  KEYS.ofertas, KEYS.pedidos, KEYS.facturas, KEYS.config,
  "packboard-agenda", "packboard-kpis-selected", "packboard-config-home",
  "packboard-config-gmail-clientid", "packboard-rutas",
  "packboard-plan-semanal", "packboard-plan-semanal-historial",
  "packboard-noticias", "packboard-empresas-descubiertas", "packboard-noticias-ultimo-chequeo",
  "packboard-usuarios",
];
async function exportarCopiaCompleta(){
  const backup = { app:"PackBoard", version:1, exportadoEl:new Date().toISOString(), datos:{} };
  for(const key of BACKUP_KEYS){
    const val = await load(key);
    if(val!==null && val!==undefined) backup.datos[key] = val;
  }
  const blob = new Blob([JSON.stringify(backup,null,2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `packboard-copia-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
}
async function importarCopiaCompleta(file){
  const text = await file.text();
  const backup = JSON.parse(text);
  if(!backup || typeof backup.datos!=="object") throw new Error("El archivo no tiene el formato de una copia de PackBoard.");
  const claves = Object.keys(backup.datos);
  for(const key of claves){ await save(key, backup.datos[key]); }
  return claves.length;
}

function precioPorTramo(linea) {
  const cant = fmtN(linea.cantidad);
  const base = fmtN(linea.precioUnit);
  const tramos = (linea.tramos||[])
    .filter(t=>t.desde!==""&&t.precio!=="")
    .map(t=>({desde:fmtN(t.desde),precio:fmtN(t.precio)}))
    .sort((a,b)=>a.desde-b.desde);
  let precio = base;
  for (const t of tramos) { if (cant>=t.desde) precio=t.precio; }
  return precio;
}
const totalLinea  = l => precioPorTramo(l)*fmtN(l.cantidad);
const totalOferta = o => (o.lineas||[]).reduce((a,l)=>a+totalLinea(l),0);

/* ─── átomos UI reutilizables del CRM ─────────────────────────────── */
function Badge({label,color,bg}){
  return <span style={{fontSize:10,fontWeight:700,color:color||C.brand,background:bg||C.brandBg,border:`1px solid ${color||C.brand}33`,borderRadius:5,padding:"2px 8px",whiteSpace:"nowrap"}}>{label}</span>;
}
function Btn({onClick,children,variant="primary",size="md",disabled,style={}}){
  const base={cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:8,fontWeight:700,fontFamily:"inherit",transition:"opacity .15s",...style};
  const sz = size==="sm"?{padding:"5px 12px",fontSize:11}:size==="lg"?{padding:"10px 24px",fontSize:14}:{padding:"7px 16px",fontSize:12};
  const vr = variant==="primary"?{background:C.brand,color:"#fff"}
    :variant==="ok"?{background:C.ok,color:"#fff"}
    :variant==="danger"?{background:C.crit,color:"#fff"}
    :variant==="ghost"?{background:"transparent",color:C.muted,border:`1px solid ${C.border}`}
    :{background:C.bg,color:C.body,border:`1px solid ${C.border}`};
  return <button onClick={disabled?undefined:onClick} style={{...base,...sz,...vr,opacity:disabled?.5:1}}>{children}</button>;
}
function Input({value,onChange,placeholder,type="text",style={}}){
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{width:"100%",padding:"8px 11px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,color:C.title,background:C.surface,outline:"none",boxSizing:"border-box",...style}}/>;
}
function Select({value,onChange,options,style={}}){
  return <select value={value} onChange={e=>onChange(e.target.value)}
    style={{width:"100%",padding:"8px 11px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,color:C.title,background:C.surface,outline:"none",...style}}>
    {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
  </select>;
}
function Label({children}){ return <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:4,letterSpacing:.3}}>{children}</div>; }
function Card({children,style={}}){ return <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,padding:18,boxShadow:"0 1px 2px rgba(15,23,42,.04)",...style}}>{children}</div>; }
function SectionTitle({children,action}){
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
    <h3 style={{fontSize:13,fontWeight:700,color:C.title,margin:0,textTransform:"uppercase",letterSpacing:.5}}>{children}</h3>
    {action}
  </div>;
}
function StatCard({label,value,color,icon}){
  return <div style={{background:C.surface,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`,borderLeft:`3px solid ${color||C.brand}`}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{icon} {label}</div>
    <div style={{fontSize:20,fontWeight:800,color:color||C.title}}>{value}</div>
  </div>;
}
function NuevaFacturaForm({pedido,ofertaTitulo,crearFactura,onDone}){
  const [base,setBase]   = useState(String(pedido.importeBase||""));
  const [iva,setIva]     = useState("21");
  const [venc,setVenc]   = useState("");
  const submit = async()=>{
    if(!venc||!base) return;
    await crearFactura(pedido.id,pedido.clienteId,parseFloat(base),venc,parseFloat(iva)||21);
    onDone();
  };
  return(
    <div style={{background:C.brandBg,borderRadius:10,padding:14,border:`1px dashed ${C.brand}66`,marginTop:10}}>
      <div style={{fontSize:12,fontWeight:700,color:C.brand,marginBottom:10}}>🧾 Generar factura — {ofertaTitulo||"Pedido"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:8}}>
        <div><Label>Base imponible (€)</Label><Input value={base} onChange={setBase} type="number"/></div>
        <div><Label>IVA %</Label><Input value={iva} onChange={setIva} type="number"/></div>
        <div><Label>Vencimiento</Label><Input value={venc} onChange={setVenc} type="date"/></div>
        <Btn onClick={submit} style={{alignSelf:"flex-end",height:36}}>Crear</Btn>
      </div>
    </div>
  );
}

/* ─── CRM KANBAN (tab "crm") ───────────────────────────────────────── */
function CRMKanban({ clientes, ofertas, facturas, dragId, setDragId, moverFase, setClienteId, setModal, setTab }){
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>CRM — Pipeline</h1>
          <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Arrastra tarjetas entre fases para mover a un cliente por el embudo</p>
        </div>
        <Btn onClick={()=>setModal({type:"addCliente"})}>+ Nuevo cliente</Btn>
      </div>
      {clientes.length===0 ? (
        <Card style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:38,marginBottom:12}}>📇</div>
          <div style={{fontSize:15,fontWeight:700,color:C.title,marginBottom:8}}>Sin clientes todavía</div>
          <Btn onClick={()=>setModal({type:"addCliente"})}>+ Crear primer cliente</Btn>
        </Card>
      ) : (
        <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:12 }}>
          {FASES.map(fase=>{
            const cards = clientes.filter(c=>c.fase===fase.id);
            const volumen = cards.reduce((a,c)=>{
              const facts = facturas.filter(f=>f.clienteId===c.id&&f.cobrada);
              return a + facts.reduce((b,f)=>b+fmtN(f.baseImponible),0);
            },0);
            return (
              <div key={fase.id} onDragOver={e=>e.preventDefault()} onDrop={()=>{ if(dragId) moverFase(dragId,fase.id); setDragId(null); }}
                style={{ minWidth:220, maxWidth:220, flexShrink:0, background:C.bg, borderRadius:12, border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", maxHeight:600 }}>
                <div style={{ padding:"11px 13px", borderBottom:`2px solid ${fase.color}`, background:C.surface, borderRadius:"12px 12px 0 0" }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:fase.color }}>{fase.label}</span>
                    <span style={{ fontSize:11, color:C.muted, background:C.bg, borderRadius:99, padding:"1px 7px" }}>{cards.length}</span>
                  </div>
                  {volumen>0 && <div style={{ fontSize:10, color:C.muted, marginTop:2, fontFamily:"monospace" }}>{fmtE2(volumen)} cobrado</div>}
                </div>
                <div style={{ padding:8, overflowY:"auto", flex:1, display:"flex", flexDirection:"column", gap:7 }}>
                  {cards.length===0 && <div style={{ fontSize:11, color:C.muted, textAlign:"center", padding:16, border:`1px dashed ${C.border}`, borderRadius:8, margin:4 }}>Arrastra aquí</div>}
                  {cards.map(c=>{
                    const sec = CRM_SECTORES.find(s=>s.id===c.sector);
                    const nOfertas = ofertas.filter(o=>o.clienteId===c.id).length;
                    return (
                      <div key={c.id} draggable onDragStart={()=>setDragId(c.id)} onClick={()=>{ setClienteId(c.id); setTab("clientes"); }}
                        style={{ background:C.surface, borderRadius:9, padding:"10px 12px", border:`1px solid ${C.border}`, cursor:"pointer", boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
                        <div style={{ fontWeight:700, fontSize:13, color:C.title, marginBottom:3 }}>{c.empresa}</div>
                        {sec && <span style={{ fontSize:10, color:sec.color, fontWeight:600 }}>{sec.icon} {sec.nombre}</span>}
                        <div style={{ display:"flex", gap:8, marginTop:6 }}>
                          {nOfertas>0 && <span style={{ fontSize:10, color:C.muted }}>📑 {nOfertas}</span>}
                          {c.ciudad && <span style={{ fontSize:10, color:C.muted }}>📍 {c.ciudad}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── CLIENTES — lista + ficha ─────────────────────────────────────── */
function ClientesView({ clienteId, setClienteId, clientes, contactos, interacciones, tareas, ofertas, pedidos, facturas, catalogo, config, search, setSearch, filterFase, setFilterFase, filterSector, setFilterSector, setModal, delCliente, setConfirm, editCliente, addInteraccion, delInteraccion, toggleTarea, delTarea, moverFase, crearPedido, crearFactura, marcarCobrada, delOferta, delPedido, delFactura, cambiarEstadoOferta }){
  if (clienteId) {
    return <FichaCliente clienteId={clienteId} clientes={clientes} contactos={contactos} interacciones={interacciones} tareas={tareas} ofertas={ofertas} pedidos={pedidos} facturas={facturas} catalogo={catalogo} config={config} setModal={setModal} editCliente={editCliente} addInteraccion={addInteraccion} delInteraccion={delInteraccion} toggleTarea={toggleTarea} delTarea={delTarea} moverFase={moverFase} crearPedido={crearPedido} crearFactura={crearFactura} marcarCobrada={marcarCobrada} delOferta={delOferta} delPedido={delPedido} delFactura={delFactura} cambiarEstadoOferta={cambiarEstadoOferta} onBack={()=>setClienteId(null)} setConfirm={setConfirm}/>;
  }

  const filtrados = clientes.filter(c=>{
    const q = search.toLowerCase();
    const matchQ = !q || (c.empresa||"").toLowerCase().includes(q) || (c.ciudad||"").toLowerCase().includes(q);
    const matchF = filterFase==="todas" || c.fase===filterFase;
    const matchS = filterSector==="todos" || c.sector===filterSector;
    return matchQ && matchF && matchS;
  });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Clientes ({clientes.length})</h1>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="outline" onClick={()=>setModal({type:"scanCard"})}>📇 Escanear tarjeta</Btn>
          <Btn onClick={()=>setModal({type:"addCliente"})}>+ Nuevo cliente</Btn>
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
        <Input value={search} onChange={setSearch} placeholder="Buscar por empresa o ciudad…" style={{ maxWidth:240 }}/>
        <select value={filterFase} onChange={e=>setFilterFase(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12.5, color:C.body, background:C.surface, outline:"none" }}>
          <option value="todas">Todas las fases</option>
          {FASES.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={filterSector} onChange={e=>setFilterSector(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12.5, color:C.body, background:C.surface, outline:"none" }}>
          <option value="todos">Todos los sectores</option>
          {CRM_SECTORES.map(s=><option key={s.id} value={s.id}>{s.icon} {s.nombre}</option>)}
        </select>
      </div>

      {filtrados.length===0 ? (
        <Card style={{ textAlign:"center", padding:40 }}>
          <div style={{ fontSize:38, marginBottom:12 }}>📇</div>
          <div style={{ fontSize:15, fontWeight:700, color:C.title, marginBottom:8 }}>Sin resultados</div>
          <div style={{ fontSize:12.5, color:C.muted }}>Prueba a cambiar el filtro o crea un nuevo cliente.</div>
        </Card>
      ) : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:C.bg }}>
              {["Empresa","Sector","Fase","Ciudad","Contacto","Ofertas","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontFamily:"monospace", letterSpacing:1, color:C.muted, fontWeight:700 }}>{h.toUpperCase()}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.map(c=>{
                const sec = CRM_SECTORES.find(s=>s.id===c.sector);
                const fase = FASES.find(f=>f.id===c.fase);
                const nOfertas = ofertas.filter(o=>o.clienteId===c.id).length;
                return (<tr key={c.id} style={{ borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:"11px 14px", fontWeight:700, color:C.title, cursor:"pointer" }} onClick={()=>setClienteId(c.id)}>{c.empresa}</td>
                  <td style={{ padding:"11px 14px" }}>{sec && <span style={{ color:sec.color, fontSize:12 }}>{sec.icon} {sec.nombre}</span>}</td>
                  <td style={{ padding:"11px 14px" }}>{fase && <Badge label={fase.label} color={fase.color} bg={`${fase.color}18`}/>}</td>
                  <td style={{ padding:"11px 14px", color:C.muted, fontSize:12 }}>{c.ciudad||"—"}</td>
                  <td style={{ padding:"11px 14px", color:C.muted, fontSize:12 }}>{c.contactoPrincipal||"—"}</td>
                  <td style={{ padding:"11px 14px", color:C.muted, fontSize:12 }}>{nOfertas}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <Btn size="sm" variant="outline" onClick={()=>setClienteId(c.id)}>Ver</Btn>
                      <Btn size="sm" variant="danger" onClick={()=>delCliente(c.id)}>🗑️</Btn>
                    </div>
                  </td>
                </tr>);
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function FichaCliente({clienteId,clientes,contactos,interacciones,tareas,ofertas,pedidos,facturas,catalogo,config,setModal,editCliente,addInteraccion,delInteraccion,toggleTarea,delTarea,moverFase,crearPedido,crearFactura,marcarCobrada,delOferta,delPedido,delFactura,cambiarEstadoOferta,onBack,setConfirm}){
  const [subTab,setSubTab]=useState("info");
  const [notiForm,setNotiForm]=useState({tipo:"llamada",nota:""});
  const [facturaShowFor,setFacturaShowFor]=useState(null);

  const cl = clientes.find(c=>c.id===clienteId);
  if(!cl) return <div style={{color:C.muted}}>Cliente no encontrado</div>;

  const sec  = CRM_SECTORES.find(s=>s.id===cl.sector);
  const fase = FASES.find(f=>f.id===cl.fase);
  const clContactos = contactos.filter(c=>c.clienteId===clienteId);
  const clInter     = interacciones.filter(i=>i.clienteId===clienteId).sort((a,b)=>b.fecha?.localeCompare(a.fecha||"")||0);
  const clTareas    = tareas.filter(t=>t.clienteId===clienteId).sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||""));
  const clOfertas   = ofertas.filter(o=>o.clienteId===clienteId);
  const clPedidos   = pedidos.filter(p=>p.clienteId===clienteId);
  const clFacturas  = facturas.filter(f=>f.clienteId===clienteId).sort((a,b)=>b.fechaEmision?.localeCompare(a.fechaEmision||"")||0);
  const comisionTotal = clFacturas.filter(f=>f.cobrada).reduce((a,f)=>a+(+(fmtN(f.baseImponible)*(config.comisionPct/100)).toFixed(2)),0);

  const SUBTABS=[["info","ℹ️ Info"],["contactos",`👤 Contactos (${clContactos.length})`],["actividad",`📋 Actividad (${clInter.length})`],["tareas",`✅ Tareas (${clTareas.length})`],["ofertas",`📑 Ofertas (${clOfertas.length})`],["pedidos",`📦 Pedidos (${clPedidos.length})`],["facturas",`🧾 Facturas (${clFacturas.length})`]];
  const comisionDe = f => +(fmtN(f.baseImponible)*(config.comisionPct/100)).toFixed(2);

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>← Volver</button>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            {sec&&<span style={{fontSize:22}}>{sec.icon}</span>}
            <h1 style={{fontSize:20,fontWeight:800,color:C.title,margin:0}}>{cl.empresa}</h1>
            {fase&&<Badge label={fase.label} color={fase.color} bg={`${fase.color}18`}/>}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>{cl.ciudad&&`📍 ${cl.ciudad} · `}Cliente desde {cl.creado||"—"}</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Btn size="sm" variant="outline" onClick={()=>setModal({type:"editCliente",data:cl})}>✏️ Editar</Btn>
          <Btn size="sm" onClick={()=>setModal({type:"addOferta",data:{clienteId,catalogo}})}>+ Oferta</Btn>
          <Btn size="sm" variant="outline" onClick={()=>setModal({type:"addTarea",data:{clienteId}})}>+ Tarea</Btn>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:18}}>
        <div style={{background:C.surface,borderRadius:12,padding:"14px 16px",border:`1px solid ${C.border}`,gridColumn:"span 2"}}>
          <div style={{fontSize:10,color:C.muted,fontFamily:"monospace",marginBottom:8}}>FASE DEL PIPELINE</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {FASES.map(f=><button key={f.id} onClick={()=>moverFase(clienteId,f.id)} style={{padding:"5px 11px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${cl.fase===f.id?f.color:C.border}`,background:cl.fase===f.id?`${f.color}18`:"transparent",color:cl.fase===f.id?f.color:C.muted}}>{f.label}</button>)}
          </div>
        </div>
        <StatCard label="Facturado cobrado" value={fmtE2(clFacturas.filter(f=>f.cobrada).reduce((a,f)=>a+fmtN(f.total),0))} color={C.ok} icon="💰"/>
        <StatCard label={`Comisión (${config.comisionPct}%)`} value={fmtE2(comisionTotal)} color={C.ok} icon="🏆"/>
      </div>

      <div style={{display:"flex",gap:3,marginBottom:18,borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
        {SUBTABS.map(([k,lbl])=>(
          <button key={k} onClick={()=>setSubTab(k)} style={{padding:"9px 14px",border:"none",background:"transparent",borderBottom:`2px solid ${subTab===k?C.brand:"transparent"}`,color:subTab===k?C.title:C.muted,fontWeight:subTab===k?700:400,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>{lbl}</button>
        ))}
      </div>

      {subTab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Card><SectionTitle>Datos de la empresa</SectionTitle>
            {[["Empresa",cl.empresa],["Sector",sec?`${sec.icon} ${sec.nombre}`:"—"],["Ciudad",cl.ciudad||"—"],["Teléfono",cl.telefono||"—"],["Email",cl.email||"—"],["Web",cl.web||"—"],["NIF/CIF",cl.nif||"—"],["Notas",cl.notas||"—"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:12,color:C.muted,minWidth:80}}>{l}</span>
                <span style={{fontSize:12,color:C.title,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </Card>
          <Card><SectionTitle>Resumen comercial</SectionTitle>
            {[["Ofertas enviadas",clOfertas.length],["Pedidos",clPedidos.length],["Facturas",clFacturas.length],["Facturas cobradas",clFacturas.filter(f=>f.cobrada).length],["Pendiente de cobro",fmtE2(clFacturas.filter(f=>!f.cobrada).reduce((a,f)=>a+fmtN(f.total),0))],["Interacciones",clInter.length],["Tareas pendientes",clTareas.filter(t=>!t.completada).length]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:12,color:C.muted}}>{l}</span>
                <span style={{fontSize:12,color:C.title,fontWeight:700}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {subTab==="contactos"&&(
        <Card>
          <SectionTitle action={<Btn size="sm" onClick={()=>setModal({type:"addContacto",data:{clienteId}})}>+ Contacto</Btn>}>Contactos</SectionTitle>
          {clContactos.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sin contactos. Añade el primer contacto.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
            {clContactos.map(c=>(
              <div key={c.id} style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{fontWeight:700,fontSize:14,color:C.title,marginBottom:4}}>{c.nombre}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:2}}>{c.cargo||""}</div>
                {c.telefono&&<div style={{fontSize:12,color:C.body}}>📞 {c.telefono}</div>}
                {c.email&&<div style={{fontSize:12,color:C.body}}>📧 {c.email}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {subTab==="actividad"&&(
        <Card>
          <SectionTitle>Historial de actividad</SectionTitle>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            <select value={notiForm.tipo} onChange={e=>setNotiForm(f=>({...f,tipo:e.target.value}))} style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,color:C.body,background:C.surface,outline:"none"}}>
              {TIPOS_INTERACCION.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input value={notiForm.nota} onChange={e=>setNotiForm(f=>({...f,nota:e.target.value}))} placeholder="Añadir nota de actividad…"
              style={{flex:1,padding:"7px 11px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,color:C.title,outline:"none"}}
              onKeyDown={e=>{if(e.key==="Enter"&&notiForm.nota.trim()){addInteraccion({clienteId,tipo:notiForm.tipo,nota:notiForm.nota.trim()});setNotiForm(f=>({...f,nota:""}));}}}/>
            <Btn onClick={()=>{ if(notiForm.nota.trim()){addInteraccion({clienteId,tipo:notiForm.tipo,nota:notiForm.nota.trim()});setNotiForm(f=>({...f,nota:""}));} }}>Añadir</Btn>
          </div>
          {clInter.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sin actividad registrada todavía.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {clInter.map(i=>{
              const tipo=TIPOS_INTERACCION.find(t=>t.id===i.tipo)||TIPOS_INTERACCION[0];
              return(<div key={i.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`,alignItems:"flex-start"}}>
                <span style={{fontSize:13,color:tipo.color,fontWeight:700,minWidth:80}}>{tipo.label}</span>
                <span style={{fontSize:13,color:C.body,flex:1,lineHeight:1.5}}>{i.nota}</span>
                <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{i.fecha}</span>
                <button onClick={()=>delInteraccion(i.id)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>✕</button>
              </div>);
            })}
          </div>
        </Card>
      )}

      {subTab==="tareas"&&(
        <Card>
          <SectionTitle action={<Btn size="sm" onClick={()=>setModal({type:"addTarea",data:{clienteId}})}>+ Tarea</Btn>}>Tareas y recordatorios</SectionTitle>
          {clTareas.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sin tareas.</div>}
          {clTareas.map(t=>{
            const venc=!t.completada&&t.vencimiento&&t.vencimiento<today(); const hoy=t.vencimiento===today();
            const prio=PRIORIDADES.find(p=>p.id===t.prioridad)||PRIORIDADES[1];
            return(<div key={t.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
              <input type="checkbox" checked={t.completada} onChange={()=>toggleTarea(t.id)} style={{width:16,height:16,cursor:"pointer"}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:t.completada?C.muted:C.title,fontWeight:t.completada?400:600,textDecoration:t.completada?"line-through":"none"}}>{t.titulo}</div>
                {t.notas&&<div style={{fontSize:11,color:C.muted}}>{t.notas}</div>}
              </div>
              <Badge label={prio.label} color={prio.color} bg={`${prio.color}15`}/>
              <span style={{fontSize:11,fontWeight:700,color:venc?C.crit:hoy?C.warn:C.muted}}>{t.vencimiento||"—"}</span>
              <button onClick={()=>delTarea(t.id)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>🗑️</button>
            </div>);
          })}
        </Card>
      )}

      {subTab==="ofertas"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <Btn onClick={()=>setModal({type:"addOferta",data:{clienteId,catalogo}})}>+ Nueva oferta</Btn>
          </div>
          {clOfertas.length===0&&<Card style={{textAlign:"center",padding:28}}><div style={{fontSize:13,color:C.muted}}>Sin ofertas para este cliente.</div></Card>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {clOfertas.map(o=>{
              const tot=totalOferta(o); const conv=pedidos.some(p=>p.ofertaId===o.id);
              return(<Card key={o.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.title}}>{o.titulo}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>{o.fecha} · {o.lineas?.length||0} línea{(o.lineas?.length||0)!==1?"s":""} · <strong style={{color:o.estado==="aceptada"?C.ok:o.estado==="rechazada"?C.crit:C.muted}}>{o.estado}</strong></div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:20}}>
                    <div style={{fontSize:19,fontWeight:900,color:C.ok}}>{fmtE2(tot)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                  {!conv&&o.estado!=="rechazada"&&<Btn size="sm" variant="ok" onClick={()=>crearPedido(o.id,clienteId,tot)}>✓ Convertir en pedido</Btn>}
                  {conv&&<span style={{fontSize:11,color:C.ok,fontWeight:700,alignSelf:"center"}}>✓ Convertida en pedido</span>}
                  {!conv&&o.estado!=="rechazada"&&<Btn size="sm" variant="ghost" onClick={()=>cambiarEstadoOferta(o.id,"rechazada")}>Rechazada</Btn>}
                  <Btn size="sm" variant="danger" style={{marginLeft:"auto"}} onClick={()=>setConfirm({msg:"¿Eliminar oferta?",onOk:()=>delOferta(o.id)})}>🗑️</Btn>
                </div>
              </Card>);
            })}
          </div>
        </div>
      )}

      {subTab==="pedidos"&&(
        <div>
          {clPedidos.length===0&&<Card style={{textAlign:"center",padding:28}}><div style={{fontSize:13,color:C.muted}}>Sin pedidos.</div></Card>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {clPedidos.map(p=>{
              const of=ofertas.find(o=>o.id===p.ofertaId); const yaf=facturas.some(f=>f.pedidoId===p.id);
              return(<Card key={p.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div><div style={{fontWeight:800,fontSize:14,color:C.title}}>{of?.titulo||"Pedido"}</div><div style={{fontSize:11,color:C.muted}}>Fecha: {p.fecha}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:19,fontWeight:900,color:C.ok}}>{fmtE2(p.importeBase)}</div></div>
                </div>
                <div style={{marginTop:10}}>
                  {!yaf?(facturaShowFor===p.id
                    ?<NuevaFacturaForm pedido={p} ofertaTitulo={of?.titulo} crearFactura={crearFactura} onDone={()=>setFacturaShowFor(null)}/>
                    :<Btn size="sm" onClick={()=>setFacturaShowFor(p.id)}>🧾 Generar factura</Btn>
                  ):<span style={{fontSize:11,color:C.ok,fontWeight:700}}>✓ Ya facturado</span>}
                </div>
              </Card>);
            })}
          </div>
        </div>
      )}

      {subTab==="facturas"&&(
        <div>
          {clFacturas.length===0&&<Card style={{textAlign:"center",padding:28}}><div style={{fontSize:13,color:C.muted}}>Sin facturas.</div></Card>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {clFacturas.map(f=>{
              const venc=!f.cobrada&&f.fechaVencimiento&&new Date(f.fechaVencimiento)<new Date(); const com=comisionDe(f);
              return(<Card key={f.id} style={{background:f.cobrada?C.okBg:venc?C.critBg:C.surface,border:`1px solid ${f.cobrada?C.ok+"44":venc?C.crit+"44":C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:C.title}}>Factura</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                      Emitida: {f.fechaEmision} · Vence: <strong style={{color:venc?C.crit:C.body}}>{f.fechaVencimiento||"—"}</strong>
                      {f.cobrada&&<span style={{color:C.ok}}> · ✅ Cobrada {f.fechaCobro}</span>}
                      {!f.cobrada&&venc&&<span style={{color:C.crit}}> · ⚠️ VENCIDA</span>}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:19,fontWeight:900,color:C.title}}>{fmtE2(f.total)}</div>
                    <div style={{fontSize:11,color:C.muted}}>Base {fmtE2(f.baseImponible)} + IVA {f.iva}%</div>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                  <div><span style={{fontSize:13,color:C.muted}}>Comisión ({config.comisionPct}%): </span><span style={{fontSize:15,fontWeight:800,color:f.cobrada?C.ok:C.warn}}>{fmtE2(com)}</span></div>
                  <div style={{display:"flex",gap:8}}>
                    {!f.cobrada&&<Btn size="sm" variant="ok" onClick={()=>marcarCobrada(f.id)}>✓ Cobrada</Btn>}
                    <Btn size="sm" variant="danger" onClick={()=>setConfirm({msg:"¿Eliminar factura?",onOk:()=>delFactura(f.id)})}>🗑️</Btn>
                  </div>
                </div>
              </Card>);
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── OFERTAS / PEDIDOS / FACTURAS globales ────────────────────────── */
function OfertasView({ofertas,clientes,pedidos,catalogo,crearPedido,cambiarEstadoOferta,delOferta,setModal,config}){
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h1 style={{fontSize:22,fontWeight:800,color:T.title,margin:0}}>Ofertas ({ofertas.length})</h1>
        <Btn onClick={()=>setModal({type:"addOferta",data:{clienteId:null,catalogo}})}>+ Nueva oferta</Btn>
      </div>
      {ofertas.length===0?(<Card style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:38,marginBottom:12}}>📑</div>
        <div style={{fontSize:15,fontWeight:700,color:C.title,marginBottom:8}}>Sin ofertas todavía</div>
        <Btn onClick={()=>setModal({type:"addOferta",data:{clienteId:null,catalogo}})}>+ Crear primera oferta</Btn>
      </Card>):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...ofertas].sort((a,b)=>b.fecha?.localeCompare(a.fecha||"")||0).map(o=>{
            const cl=clientes.find(c=>c.id===o.clienteId); const tot=totalOferta(o); const conv=pedidos.some(p=>p.ofertaId===o.id);
            return(<Card key={o.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:C.title}}>{o.titulo}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{o.fecha}{cl&&<> · <strong style={{color:C.brand}}>{cl.empresa}</strong></>} · <strong style={{color:o.estado==="aceptada"?C.ok:o.estado==="rechazada"?C.crit:C.muted}}>{o.estado}</strong></div>
                </div>
                <div style={{textAlign:"right",marginLeft:20}}>
                  <div style={{fontSize:19,fontWeight:900,color:C.ok}}>{fmtE2(tot)}</div>
                  <div style={{fontSize:11,color:C.muted}}>com.: {fmtE2(tot*config.comisionPct/100)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                {!conv&&o.estado!=="rechazada"&&<Btn size="sm" variant="ok" onClick={()=>crearPedido(o.id,o.clienteId,tot)}>✓ Convertir en pedido</Btn>}
                {conv&&<span style={{fontSize:11,color:C.ok,fontWeight:700,alignSelf:"center"}}>✓ En pedido</span>}
                {!conv&&o.estado!=="rechazada"&&<Btn size="sm" variant="ghost" onClick={()=>cambiarEstadoOferta(o.id,"rechazada")}>Rechazada</Btn>}
                <Btn size="sm" variant="danger" style={{marginLeft:"auto"}} onClick={()=>delOferta(o.id)}>🗑️</Btn>
              </div>
            </Card>);
          })}
        </div>
      )}
    </div>
  );
}
function PedidosView({pedidos,clientes,ofertas,facturas,crearFactura,delPedido,config}){
  const [factFor,setFactFor]=useState(null);
  return(
    <div>
      <h1 style={{fontSize:22,fontWeight:800,color:T.title,margin:"0 0 18px"}}>Pedidos ({pedidos.length})</h1>
      {pedidos.length===0?(<Card style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:38,marginBottom:12}}>📦</div>
        <div style={{fontSize:15,fontWeight:700,color:C.title,marginBottom:8}}>Sin pedidos todavía</div>
        <div style={{fontSize:12.5,color:C.muted}}>Los pedidos se crean al convertir una oferta aceptada.</div>
      </Card>):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...pedidos].sort((a,b)=>b.fecha?.localeCompare(a.fecha||"")||0).map(p=>{
            const cl=clientes.find(c=>c.id===p.clienteId); const of=ofertas.find(o=>o.id===p.ofertaId); const yaf=facturas.some(f=>f.pedidoId===p.id);
            return(<Card key={p.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:C.title}}>{of?.titulo||"Pedido"}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>Fecha: {p.fecha}{cl&&<> · <strong style={{color:C.brand}}>{cl.empresa}</strong></>}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:19,fontWeight:900,color:C.ok}}>{fmtE2(p.importeBase)}</div>
                  <div style={{fontSize:11,color:C.muted}}>com.: {fmtE2(p.importeBase*config.comisionPct/100)}</div>
                </div>
              </div>
              <div style={{marginTop:10}}>
                {!yaf?(factFor===p.id
                  ?<NuevaFacturaForm pedido={p} ofertaTitulo={of?.titulo} crearFactura={crearFactura} onDone={()=>setFactFor(null)}/>
                  :<Btn size="sm" onClick={()=>setFactFor(p.id)}>🧾 Generar factura</Btn>
                ):<span style={{fontSize:11,color:C.ok,fontWeight:700}}>✓ Facturado</span>}
              </div>
            </Card>);
          })}
        </div>
      )}
    </div>
  );
}
function FacturasView({facturas,clientes,pedidos,ofertas,marcarCobrada,delFactura,config}){
  const comisionDe = f => +(fmtN(f.baseImponible)*(config.comisionPct/100)).toFixed(2);
  const cobradas=facturas.filter(f=>f.cobrada); const pendientes=facturas.filter(f=>!f.cobrada);
  const vencidas=pendientes.filter(f=>f.fechaVencimiento&&new Date(f.fechaVencimiento)<new Date());
  return(
    <div>
      <h1 style={{fontSize:22,fontWeight:800,color:T.title,margin:"0 0 18px"}}>Facturas ({facturas.length})</h1>
      {facturas.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
          {[["🧾 Total",facturas.length,C.brand],["✅ Cobradas",cobradas.length,C.ok],["⏳ Pendientes",pendientes.length,C.warn],["⚠️ Vencidas",vencidas.length,vencidas.length>0?C.crit:C.ok]].map(([l,v,c])=>(
            <StatCard key={l} label={l} value={v} color={c}/>
          ))}
        </div>
      )}
      {facturas.length===0?(<Card style={{textAlign:"center",padding:40}}>
        <div style={{fontSize:38,marginBottom:12}}>🧾</div>
        <div style={{fontSize:15,fontWeight:700,color:C.title,marginBottom:8}}>Sin facturas todavía</div>
        <div style={{fontSize:12.5,color:C.muted}}>Las facturas se generan desde un pedido.</div>
      </Card>):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...facturas].sort((a,b)=>b.fechaEmision?.localeCompare(a.fechaEmision||"")||0).map(f=>{
            const cl=clientes.find(c=>c.id===f.clienteId);
            const venc=!f.cobrada&&f.fechaVencimiento&&new Date(f.fechaVencimiento)<new Date(); const com=comisionDe(f);
            return(<Card key={f.id} style={{background:f.cobrada?C.okBg:venc?C.critBg:C.surface,border:`1px solid ${f.cobrada?C.ok+"44":venc?C.crit+"44":C.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:C.title}}>Factura{cl&&<span style={{fontWeight:400,color:C.muted}}> · {cl.empresa}</span>}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                    Emitida: {f.fechaEmision} · Vence: <strong style={{color:venc?C.crit:C.body}}>{f.fechaVencimiento||"—"}</strong>
                    {f.cobrada&&<span style={{color:C.ok}}> · ✅ Cobrada {f.fechaCobro}</span>}
                    {!f.cobrada&&venc&&<span style={{color:C.crit}}> · ⚠️ VENCIDA</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",marginLeft:20}}>
                  <div style={{fontSize:19,fontWeight:900,color:C.title}}>{fmtE2(f.total)}</div>
                  <div style={{fontSize:11,color:C.muted}}>Base {fmtE2(f.baseImponible)} + IVA {f.iva}%</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                <div><span style={{fontSize:13,color:C.muted}}>Comisión ({config.comisionPct}%): </span><span style={{fontSize:15,fontWeight:800,color:f.cobrada?C.ok:C.warn}}>{fmtE2(com)}</span></div>
                <div style={{display:"flex",gap:8}}>
                  {!f.cobrada&&<Btn size="sm" variant="ok" onClick={()=>marcarCobrada(f.id)}>✓ Cobrada</Btn>}
                  <Btn size="sm" variant="danger" onClick={()=>delFactura(f.id)}>🗑️</Btn>
                </div>
              </div>
            </Card>);
          })}
        </div>
      )}
    </div>
  );
}

/* ─── ESCÁNER DE TARJETAS DE VISITA (foto → IA → cliente+contacto) ──── */
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function ModalScanCard({ onClose, addCliente, addContacto, showToast }){
  const [step, setStep] = useState("capture"); // capture | loading | review
  const [imgPreview, setImgPreview] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [f, setF] = useState({ empresa:"", nombre:"", cargo:"", telefono:"", email:"", web:"", ciudad:"" });
  const [error, setError] = useState("");

  const onFile = async (file) => {
    if(!file) return;
    setImgPreview(URL.createObjectURL(file));
    setMediaType(file.type||"image/jpeg");
    const b64 = await fileToBase64(file);
    setImgB64(b64);
    setStep("loading"); setError("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:500,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:file.type||"image/jpeg", data:b64 } },
            { type:"text", text:'Extrae los datos de esta tarjeta de visita. Devuelve SOLO un objeto JSON (sin markdown, sin backticks, sin texto adicional) con estas claves exactas: {"empresa":"","nombre":"","cargo":"","telefono":"","email":"","web":"","ciudad":""}. Si un dato no aparece en la tarjeta, deja el valor como cadena vacía. No inventes datos.' },
          ]}],
        }),
      });
      const d = await res.json();
      const text = d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"{}";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setF({ empresa:parsed.empresa||"", nombre:parsed.nombre||"", cargo:parsed.cargo||"", telefono:parsed.telefono||"", email:parsed.email||"", web:parsed.web||"", ciudad:parsed.ciudad||"" });
      setStep("review");
    } catch {
      setError("No se pudieron extraer los datos automáticamente. Rellena el formulario a mano.");
      setStep("review");
    }
  };

  const set = (k,v) => setF(x=>({...x,[k]:v}));

  const guardar = async () => {
    if(!f.empresa.trim() && !f.nombre.trim()) return;
    const empresaFinal = f.empresa.trim() || f.nombre.trim();
    const clienteId = await addCliente({ empresa:empresaFinal, sector:"ali", ciudad:f.ciudad, telefono:f.telefono, email:f.email, web:f.web, contactoPrincipal:f.nombre });
    if(f.nombre.trim()){
      await addContacto({ nombre:f.nombre, cargo:f.cargo, telefono:f.telefono, email:f.email, clienteId });
    }
    showToast?.(`Cliente "${empresaFinal}" creado desde tarjeta`);
    onClose();
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.title}}>📇 Escanear tarjeta de visita</h2>
        <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>✕</button>
      </div>

      {step==="capture" && (
        <div>
          <div style={{ fontSize:12.5, color:C.muted, marginBottom:16, lineHeight:1.6 }}>
            Haz una foto o sube una imagen de la tarjeta. La IA extraerá empresa, nombre, cargo, teléfono, email y ciudad automáticamente — podrás revisarlos antes de guardar.
          </div>
          <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, border:`2px dashed ${C.border}`, borderRadius:14, padding:"40px 20px", cursor:"pointer", background:C.bg }}>
            <span style={{ fontSize:32 }}>📷</span>
            <span style={{ fontSize:13, fontWeight:700, color:C.brand }}>Tomar foto o subir imagen</span>
            <input type="file" accept="image/*" capture="environment" onChange={e=>onFile(e.target.files?.[0])} style={{ display:"none" }}/>
          </label>
        </div>
      )}

      {step==="loading" && (
        <div style={{ textAlign:"center", padding:40 }}>
          {imgPreview && <img src={imgPreview} alt="tarjeta" style={{ maxWidth:200, borderRadius:10, marginBottom:16, boxShadow:"0 4px 16px rgba(0,0,0,.15)" }}/>}
          <div style={{ color:C.brand, fontWeight:700, fontSize:13 }}>🤖 Extrayendo datos con IA…</div>
        </div>
      )}

      {step==="review" && (
        <div>
          {imgPreview && <img src={imgPreview} alt="tarjeta" style={{ maxWidth:160, borderRadius:8, marginBottom:14, display:"block" }}/>}
          {error && <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8, padding:"8px 12px", fontSize:11.5, color:C.warn, marginBottom:12 }}>{error}</div>}
          <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Revisa y corrige antes de guardar:</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div style={{gridColumn:"span 2"}}><Label>Empresa</Label><Input value={f.empresa} onChange={v=>set("empresa",v)} placeholder="Nombre de la empresa"/></div>
            <div><Label>Nombre del contacto</Label><Input value={f.nombre} onChange={v=>set("nombre",v)} placeholder="María García"/></div>
            <div><Label>Cargo</Label><Input value={f.cargo} onChange={v=>set("cargo",v)} placeholder="Director de compras"/></div>
            <div><Label>Teléfono</Label><Input value={f.telefono} onChange={v=>set("telefono",v)} placeholder="6XX XXX XXX"/></div>
            <div><Label>Email</Label><Input value={f.email} onChange={v=>set("email",v)} type="email"/></div>
            <div><Label>Web</Label><Input value={f.web} onChange={v=>set("web",v)} placeholder="www.empresa.com"/></div>
            <div><Label>Ciudad</Label><Input value={f.ciudad} onChange={v=>set("ciudad",v)} placeholder="Murcia"/></div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="ghost" onClick={()=>{ setStep("capture"); setImgPreview(null); }}>← Repetir foto</Btn>
            <Btn onClick={guardar}>💾 Crear cliente</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MODALES ───────────────────────────────────────────────────────── */
function ModalRouter({modal,setModal,clientes,catalogo,addCliente,editCliente,addContacto,addTarea,addOferta,showToast}){
  const close=()=>setModal(null);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surface,borderRadius:16,padding:28,width:"100%",maxWidth:modal.type==="addOferta"?720:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
        {modal.type==="addCliente"&&<ModalCliente onClose={close} onSave={async d=>{await addCliente(d);close();}}/>}
        {modal.type==="editCliente"&&<ModalCliente onClose={close} onSave={async d=>{await editCliente(modal.data.id,d);close();}} initial={modal.data} isEdit/>}
        {modal.type==="addContacto"&&<ModalContacto onClose={close} onSave={async d=>{await addContacto({...d,clienteId:modal.data.clienteId});close();}}/>}
        {modal.type==="addTarea"&&<ModalTarea onClose={close} onSave={async d=>{await addTarea({...d,clienteId:modal.data.clienteId});close();}} clientes={clientes} defaultClienteId={modal.data.clienteId}/>}
        {modal.type==="addOferta"&&<ModalOferta onClose={close} onSave={async d=>{await addOferta({...d,clienteId:modal.data.clienteId});close();}} clientes={clientes} catalogo={catalogo} defaultClienteId={modal.data.clienteId}/>}
        {modal.type==="scanCard"&&<ModalScanCard onClose={close} addCliente={addCliente} addContacto={addContacto} showToast={showToast}/>}
      </div>
    </div>
  );
}
function ModalCliente({onClose,onSave,initial={},isEdit}){
  const [f,setF]=useState({empresa:"",sector:"ali",ciudad:"",telefono:"",email:"",web:"",nif:"",contactoPrincipal:"",notas:"",...initial});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.title}}>{isEdit?"✏️ Editar cliente":"+ Nuevo cliente"}</h2>
      <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
      <div style={{gridColumn:"span 2"}}><Label>Empresa *</Label><Input value={f.empresa} onChange={v=>set("empresa",v)} placeholder="Nombre de la empresa"/></div>
      <div><Label>Sector</Label><Select value={f.sector} onChange={v=>set("sector",v)} options={CRM_SECTORES.map(s=>[s.id,`${s.icon} ${s.nombre}`])}/></div>
      <div><Label>Ciudad</Label><Input value={f.ciudad} onChange={v=>set("ciudad",v)} placeholder="Murcia"/></div>
      <div><Label>Teléfono</Label><Input value={f.telefono} onChange={v=>set("telefono",v)} placeholder="6XX XXX XXX"/></div>
      <div><Label>Email</Label><Input value={f.email} onChange={v=>set("email",v)} placeholder="compras@empresa.com" type="email"/></div>
      <div><Label>Web</Label><Input value={f.web} onChange={v=>set("web",v)} placeholder="www.empresa.com"/></div>
      <div><Label>NIF/CIF</Label><Input value={f.nif} onChange={v=>set("nif",v)} placeholder="B12345678"/></div>
      <div style={{gridColumn:"span 2"}}><Label>Contacto principal</Label><Input value={f.contactoPrincipal} onChange={v=>set("contactoPrincipal",v)} placeholder="Nombre del responsable de compras"/></div>
      <div style={{gridColumn:"span 2"}}><Label>Notas</Label><textarea value={f.notas} onChange={e=>set("notas",e.target.value)} placeholder="Información relevante…" style={{width:"100%",padding:"8px 11px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,color:C.title,background:C.surface,outline:"none",minHeight:70,resize:"vertical",boxSizing:"border-box"}}/></div>
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
      <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      <Btn onClick={()=>{ if(!f.empresa.trim())return; onSave(f); }}>{isEdit?"Guardar cambios":"Crear cliente"}</Btn>
    </div>
  </div>);
}
function ModalContacto({onClose,onSave}){
  const [f,setF]=useState({nombre:"",cargo:"",telefono:"",email:""});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.title}}>+ Añadir contacto</h2>
      <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
      <div style={{gridColumn:"span 2"}}><Label>Nombre *</Label><Input value={f.nombre} onChange={v=>set("nombre",v)} placeholder="María García"/></div>
      <div><Label>Cargo</Label><Input value={f.cargo} onChange={v=>set("cargo",v)} placeholder="Responsable de compras"/></div>
      <div><Label>Teléfono</Label><Input value={f.telefono} onChange={v=>set("telefono",v)} placeholder="6XX XXX XXX"/></div>
      <div style={{gridColumn:"span 2"}}><Label>Email</Label><Input value={f.email} onChange={v=>set("email",v)} placeholder="m.garcia@empresa.com" type="email"/></div>
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
      <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      <Btn onClick={()=>{ if(!f.nombre.trim())return; onSave(f); }}>Añadir contacto</Btn>
    </div>
  </div>);
}
function ModalTarea({onClose,onSave,clientes,defaultClienteId}){
  const [f,setF]=useState({titulo:"",notas:"",vencimiento:"",prioridad:"media",clienteId:defaultClienteId||""});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.title}}>+ Nueva tarea</h2>
      <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
      <div style={{gridColumn:"span 2"}}><Label>Título *</Label><Input value={f.titulo} onChange={v=>set("titulo",v)} placeholder="Llamar para seguimiento de oferta…"/></div>
      <div><Label>Vencimiento</Label><Input value={f.vencimiento} onChange={v=>set("vencimiento",v)} type="date"/></div>
      <div><Label>Prioridad</Label><Select value={f.prioridad} onChange={v=>set("prioridad",v)} options={PRIORIDADES.map(p=>[p.id,p.label])}/></div>
      <div style={{gridColumn:"span 2"}}><Label>Cliente (opcional)</Label><Select value={f.clienteId||""} onChange={v=>set("clienteId",v||null)} options={[["","Sin cliente"],...clientes.map(c=>[c.id,c.empresa])]}/></div>
      <div style={{gridColumn:"span 2"}}><Label>Notas</Label><Input value={f.notas} onChange={v=>set("notas",v)} placeholder="Detalles adicionales…"/></div>
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
      <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      <Btn onClick={()=>{ if(!f.titulo.trim())return; onSave(f); }}>Crear tarea</Btn>
    </div>
  </div>);
}
function ModalOferta({onClose,onSave,clientes,catalogo,defaultClienteId}){
  const [titulo,setTitulo]=useState("");
  const [clienteId,setClienteId]=useState(defaultClienteId||"");
  const [lineas,setLineas]=useState([{id:uid(),ref:"",cantidad:"",precioUnit:"",tramos:[]}]);

  const updL=(idx,fld,val)=>setLineas(ls=>{const a=[...ls];a[idx]={...a[idx],[fld]:val};return a;});
  const addL=()=>setLineas(ls=>[...ls,{id:uid(),ref:"",cantidad:"",precioUnit:"",tramos:[]}]);
  const remL=(idx)=>setLineas(ls=>ls.filter((_,i)=>i!==idx));
  const addT=(idx)=>setLineas(ls=>{const a=[...ls];a[idx]={...a[idx],tramos:[...(a[idx].tramos||[]),{desde:"",precio:""}]};return a;});
  const updT=(idx,ti,fld,val)=>setLineas(ls=>{const a=[...ls];const ts=[...(a[idx].tramos||[])];ts[ti]={...ts[ti],[fld]:val};a[idx]={...a[idx],tramos:ts};return a;});
  const remT=(idx,ti)=>setLineas(ls=>{const a=[...ls];a[idx]={...a[idx],tramos:(a[idx].tramos||[]).filter((_,i)=>i!==ti)};return a;});

  const total=lineas.reduce((a,l)=>a+totalLinea(l),0);

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:800,color:C.title}}>+ Nueva oferta</h2>
      <button onClick={onClose} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>✕</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:16}}>
      <div><Label>Título de la oferta *</Label><Input value={titulo} onChange={setTitulo} placeholder="Ej. Cajas exportación Q3 2026"/></div>
      <div><Label>Cliente (opcional)</Label><Select value={clienteId||""} onChange={v=>setClienteId(v||null)} options={[["","Sin asignar"],...clientes.map(c=>[c.id,c.empresa])]}/></div>
    </div>

    <div style={{fontSize:12,fontWeight:700,color:C.muted,fontFamily:"monospace",marginBottom:10,letterSpacing:.5}}>LÍNEAS DE PRODUCTO</div>
    {lineas.map((ln,idx)=>(
      <div key={ln.id} style={{background:C.bg,borderRadius:10,padding:14,marginBottom:10,border:`1px solid ${C.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:8}}>
          <div>
            <Label>Referencia / Producto</Label>
            <div style={{display:"flex",gap:6}}>
              <Input value={ln.ref} onChange={v=>updL(idx,"ref",v)} placeholder="Ej. CAJ-40x30x20" style={{flex:1}}/>
              {catalogo?.length>0&&<select onChange={e=>{ if(e.target.value){const p=catalogo.find(x=>x.id===e.target.value); if(p){setLineas(ls=>{const a=[...ls];a[idx]={...a[idx],ref:p.ref,precioUnit:p.precioBase};return a;});} e.target.value=""; }}} style={{padding:"0 6px",borderRadius:7,border:`1px solid ${C.border}`,fontSize:11,background:C.surface,color:C.brand,cursor:"pointer",outline:"none"}}>
                <option value="">📦 Cat.</option>
                {catalogo.map(p=><option key={p.id} value={p.id}>{p.ref}</option>)}
              </select>}
            </div>
          </div>
          <div><Label>Cantidad</Label><Input value={ln.cantidad} onChange={v=>updL(idx,"cantidad",v)} type="number" placeholder="0"/></div>
          <div><Label>€/ud base</Label><Input value={ln.precioUnit} onChange={v=>updL(idx,"precioUnit",v)} type="number" placeholder="0.00"/></div>
          <button onClick={()=>remL(idx)} style={{alignSelf:"flex-end",background:"#FEF2F2",border:`1px solid ${C.crit}33`,color:C.crit,borderRadius:7,padding:"0 10px",cursor:"pointer",fontSize:13,height:36}}>✕</button>
        </div>
        <div style={{background:C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:10,color:C.brand,fontWeight:700,fontFamily:"monospace",marginBottom:6}}>📊 TRAMOS DE PRECIO POR VOLUMEN</div>
          {(ln.tramos||[]).map((t,ti)=>(
            <div key={ti} style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted}}>A partir de</span>
              <input value={t.desde} onChange={e=>updT(idx,ti,"desde",e.target.value)} type="number" placeholder="uds" style={{width:68,padding:"5px 7px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,color:C.title,background:C.bg,outline:"none"}}/>
              <span style={{fontSize:11,color:C.muted}}>uds →</span>
              <input value={t.precio} onChange={e=>updT(idx,ti,"precio",e.target.value)} type="number" placeholder="€/ud" style={{width:76,padding:"5px 7px",borderRadius:6,border:`1px solid ${C.border}`,fontSize:11,color:C.title,background:C.bg,outline:"none"}}/>
              <span style={{fontSize:11,color:C.muted}}>€/ud</span>
              <button onClick={()=>remT(idx,ti)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          ))}
          <button onClick={()=>addT(idx)} style={{background:"transparent",border:`1px dashed ${C.brand}66`,color:C.brand,borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Añadir tramo</button>
          {ln.cantidad&&ln.precioUnit&&(
            <div style={{marginTop:8,fontSize:12,color:C.ok,fontWeight:700}}>→ {precioPorTramo(ln)}€/ud aplicado · Subtotal: {fmtE2(totalLinea(ln))}</div>
          )}
        </div>
      </div>
    ))}
    <button onClick={addL} style={{background:"transparent",border:`1px dashed ${C.border}`,color:C.brand,borderRadius:8,padding:"8px 16px",fontSize:12,cursor:"pointer",width:"100%",marginBottom:16}}>+ Añadir línea de producto</button>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:16}}>
      <div style={{fontSize:16,fontWeight:900,color:C.title}}>Total: {fmtE2(total)}</div>
      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={()=>{ if(!titulo.trim())return; onSave({titulo,clienteId:clienteId||null,lineas}); }}>💾 Guardar oferta</Btn>
      </div>
    </div>
  </div>);
}

/* ─── configuración ─────────────────────────────────────────────────── */
function ConfigView({ home, setHome, config, setConfig, gmailClientId, setGmailClientId, showToast }){
  const [dir, setDir] = useState(home.direccion);
  const [com, setCom] = useState(String(config.comisionPct));
  const [gcid, setGcid] = useState(gmailClientId);
  const [saved, setSaved] = useState(false);
  const [importando, setImportando] = useState(false);
  const [confirmImport, setConfirmImport] = useState(null); // archivo pendiente de confirmar
  const [exportando, setExportando] = useState(false);

  const guardar = () => {
    const geo = geocodeCiudad(dir, HOME_DEFAULT) || HOME_DEFAULT;
    setHome({ lat:geo.lat, lon:geo.lon, direccion:dir.trim()||HOME_DEFAULT.direccion });
    setConfig({ ...config, comisionPct: parseFloat(com)||0 });
    setGmailClientId(gcid.trim());
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  const descargar = async () => {
    setExportando(true);
    try{ await exportarCopiaCompleta(); showToast?.("Copia de seguridad descargada"); }
    catch{ showToast?.("No se pudo generar la copia","warn"); }
    setExportando(false);
  };

  const confirmarRestaurar = async () => {
    if(!confirmImport) return;
    setImportando(true);
    try{
      const n = await importarCopiaCompleta(confirmImport);
      showToast?.(`Copia restaurada (${n} secciones) — recargando…`);
      setTimeout(()=>window.location.reload(), 1200);
    }catch(e){
      showToast?.("Archivo no válido: "+(e?.message||"error desconocido"),"warn");
      setImportando(false);
    }
    setConfirmImport(null);
  };

  return (
    <div style={{ maxWidth:560 }}>
      <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:"0 0 18px" }}>Configuración</h1>

      {confirmImport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.45)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:T.surface, borderRadius:14, padding:28, maxWidth:380, width:"90%" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.title, marginBottom:10 }}>¿Restaurar esta copia?</div>
            <div style={{ fontSize:12.5, color:T.body, lineHeight:1.6, marginBottom:18 }}>
              Esto <strong>sobrescribirá</strong> todos tus datos actuales (clientes, ofertas, pedidos, facturas, usuarios, noticias…) con el contenido de "{confirmImport.name}". No se puede deshacer. La app se recargará al terminar.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setConfirmImport(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={confirmarRestaurar} disabled={importando}>{importando?"Restaurando…":"Sí, restaurar"}</Btn>
            </div>
          </div>
        </div>
      )}

      <Card style={{ marginBottom:16 }}>
        <SectionTitle>💾 Copia de seguridad</SectionTitle>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
          Descarga una copia completa de todo lo que tienes en PackBoard (clientes, ofertas, pedidos, facturas, agenda, plan semanal, noticias, usuarios…) en un solo archivo. Guárdalo en un sitio seguro — incluye datos de tus clientes y las contraseñas de tus usuarios cifradas, así que no lo compartas a la ligera.
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <Btn onClick={descargar} disabled={exportando}>{exportando?"Generando…":"⬇️ Descargar copia completa"}</Btn>
          <label style={{ display:"inline-flex" }}>
            <input type="file" accept="application/json" style={{ display:"none" }}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) setConfirmImport(f); e.target.value=""; }}/>
            <span style={{ display:"inline-flex", alignItems:"center", padding:"7px 16px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, color:C.body, fontSize:12, fontWeight:700, cursor:"pointer" }}>⬆️ Restaurar copia</span>
          </label>
        </div>
      </Card>

      <Card style={{ marginBottom:16 }}>
        <SectionTitle>🏠 Dirección base para rutas</SectionTitle>
        <div style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.6 }}>
          Todas las rutas calculadas en "Rutas" saldrán y volverán a esta dirección. No podemos leerla automáticamente de tu Gmail por seguridad (Google no permite acceso a datos personales sin verificación adicional), así que confírmala aquí una vez.
        </div>
        <Label>Dirección o ciudad</Label>
        <Input value={dir} onChange={setDir} placeholder="Ej. Molina de Segura, Murcia"/>
      </Card>

      <Card style={{ marginBottom:16 }}>
        <SectionTitle>💰 Comisión</SectionTitle>
        <Label>Porcentaje sobre base imponible cobrada</Label>
        <Input value={com} onChange={setCom} type="number" style={{ maxWidth:120 }}/>
      </Card>

      <Card style={{ marginBottom:16 }}>
        <SectionTitle>📧 Conexión con Gmail</SectionTitle>
        <div style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.7 }}>
          Para conectar Gmail, Google exige que la app tenga su propio <strong>Client ID de OAuth</strong> — es gratis y tarda unos 5 minutos, se hace una sola vez:
          <ol style={{ margin:"8px 0 0", paddingLeft:18 }}>
            <li>Entra en <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{color:C.brand}}>console.cloud.google.com/apis/credentials</a> con tu cuenta de Gmail.</li>
            <li>Crea un proyecto nuevo (arriba a la izquierda → "Nuevo proyecto").</li>
            <li>En "Biblioteca", busca y activa <strong>Gmail API</strong>.</li>
            <li>En "Pantalla de consentimiento OAuth": tipo "Externo", rellena el nombre de la app, y en "Usuarios de prueba" añade tu propio email. Así no necesitas verificación de Google porque solo tú la vas a usar.</li>
            <li>En "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth" → tipo "Aplicación web".</li>
            <li>En "Orígenes autorizados de JavaScript" añade la URL exacta desde la que abres esta app (ej. <code>http://localhost:5173</code> o tu dominio).</li>
            <li>Copia el "Client ID" (termina en <code>.apps.googleusercontent.com</code>) y pégalo abajo.</li>
          </ol>
        </div>
        <Label>Client ID de Google</Label>
        <Input value={gcid} onChange={setGcid} placeholder="xxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"/>
      </Card>

      <Btn onClick={guardar}>{saved?"✓ Guardado":"Guardar cambios"}</Btn>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AUTENTICACIÓN — configuración inicial, login y gestión de usuarios
   ════════════════════════════════════════════════════════════════════ */
const AUTH_STYLE = {
  wrap: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:T.bg, padding:20 },
  card: { background:T.surface, borderRadius:18, padding:32, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(15,23,42,.12)", border:`1px solid ${T.border}` },
};

function SetupMasterView({ onCreated }){
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const crear = async () => {
    setError("");
    if(!nombre.trim() || !username.trim() || !password){ setError("Rellena todos los campos."); return; }
    if(password.length<4){ setError("La contraseña debe tener al menos 4 caracteres."); return; }
    if(password!==password2){ setError("Las contraseñas no coinciden."); return; }
    setSaving(true);
    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    const master = { id:uid(), nombre:nombre.trim(), username:username.trim().toLowerCase(), salt, passwordHash, rol:"master", activo:true, modulos:ALL_MODULE_IDS, creado:today() };
    await save(USERS_KEY, [master]);
    await save(SESSION_KEY, { userId:master.id });
    setSaving(false);
    onCreated(master);
  };

  return (
    <div style={AUTH_STYLE.wrap}>
      <div style={AUTH_STYLE.card}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:`linear-gradient(135deg,${T.blue},${T.violet})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, margin:"0 auto 12px" }}>📦</div>
          <div style={{ fontSize:18, fontWeight:800, color:T.title }}>Crea tu usuario maestro</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Es la primera vez que abres PackBoard — este usuario tendrá acceso total y podrá crear subusuarios más adelante.</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
          <div><Label>Tu nombre</Label><Input value={nombre} onChange={setNombre} placeholder="Pedro"/></div>
          <div><Label>Usuario</Label><Input value={username} onChange={setUsername} placeholder="pedro"/></div>
          <div><Label>Contraseña</Label><Input value={password} onChange={setPassword} type="password" placeholder="••••••••"/></div>
          <div><Label>Repite la contraseña</Label><Input value={password2} onChange={setPassword2} type="password" placeholder="••••••••"/></div>
        </div>
        {error && <div style={{ color:T.red, fontSize:12, marginBottom:12 }}>{error}</div>}
        <Btn onClick={crear} disabled={saving} style={{ width:"100%" }}>{saving?"Creando…":"Crear usuario maestro"}</Btn>
        <div style={{ fontSize:10, color:T.muted, marginTop:14, lineHeight:1.6, textAlign:"center" }}>
          La contraseña se guarda cifrada (SHA-256 con sal), no en texto plano. Ten en cuenta que, al ser una app sin servidor propio, este login organiza el acceso de tu equipo pero no sustituye una autenticación de nivel bancario.
        </div>
      </div>
    </div>
  );
}

function LoginView({ usuarios, onLogin }){
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const entrar = async () => {
    setError("");
    const user = usuarios.find(u=>u.username===username.trim().toLowerCase());
    if(!user || !user.activo){ setError("Usuario no encontrado o desactivado."); return; }
    setChecking(true);
    const hash = await hashPassword(password, user.salt);
    setChecking(false);
    if(hash!==user.passwordHash){ setError("Contraseña incorrecta."); return; }
    await save(SESSION_KEY, { userId:user.id });
    onLogin(user);
  };

  return (
    <div style={AUTH_STYLE.wrap}>
      <div style={AUTH_STYLE.card}>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:`linear-gradient(135deg,${T.blue},${T.violet})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, margin:"0 auto 12px" }}>📦</div>
          <div style={{ fontSize:18, fontWeight:800, color:T.title }}>PackBoard</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:4 }}>Inicia sesión para continuar</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
          <div><Label>Usuario</Label><Input value={username} onChange={setUsername} placeholder="pedro"/></div>
          <div><Label>Contraseña</Label><Input value={password} onChange={setPassword} type="password" placeholder="••••••••"/></div>
        </div>
        {error && <div style={{ color:T.red, fontSize:12, marginBottom:12 }}>{error}</div>}
        <Btn onClick={entrar} disabled={checking} style={{ width:"100%" }}>{checking?"Comprobando…":"Entrar"}</Btn>
      </div>
    </div>
  );
}

function ModalUsuario({ onClose, onSave, initial=null }){
  const [nombre, setNombre] = useState(initial?.nombre||"");
  const [username, setUsername] = useState(initial?.username||"");
  const [password, setPassword] = useState("");
  const [modulos, setModulos] = useState(new Set(initial?.modulos||["dashboard"]));
  const [error, setError] = useState("");
  const isEdit = !!initial;

  const toggleModulo = (id) => setModulos(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  const guardar = async () => {
    setError("");
    if(!nombre.trim() || !username.trim()){ setError("Nombre y usuario son obligatorios."); return; }
    if(!isEdit && password.length<4){ setError("La contraseña debe tener al menos 4 caracteres."); return; }
    if(modulos.size===0){ setError("Marca al menos un módulo."); return; }
    await onSave({ nombre:nombre.trim(), username:username.trim().toLowerCase(), password, modulos:[...modulos] });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:T.surface, borderRadius:16, padding:28, width:"100%", maxWidth:440, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:T.title }}>{isEdit?"✏️ Editar subusuario":"+ Nuevo subusuario"}</h2>
          <button onClick={onClose} style={{ background:"transparent", border:"none", fontSize:20, cursor:"pointer", color:T.muted }}>✕</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
          <div><Label>Nombre</Label><Input value={nombre} onChange={setNombre} placeholder="Nombre del subusuario"/></div>
          <div><Label>Usuario</Label><Input value={username} onChange={setUsername} placeholder="usuario" style={isEdit?{opacity:.6}:{}}/></div>
          <div><Label>{isEdit?"Nueva contraseña (deja en blanco para no cambiarla)":"Contraseña"}</Label><Input value={password} onChange={setPassword} type="password" placeholder="••••••••"/></div>
        </div>
        <Label>Módulos a los que tiene acceso</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16, marginTop:4 }}>
          {NAV.map(n=>(
            <label key={n.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 9px", borderRadius:8, border:`1px solid ${T.border}`, cursor:"pointer", background:modulos.has(n.id)?"#EFF6FF":"transparent", fontSize:12 }}>
              <input type="checkbox" checked={modulos.has(n.id)} onChange={()=>toggleModulo(n.id)} style={{ width:14, height:14, cursor:"pointer" }}/>
              <span>{n.icon} {n.label}</span>
            </label>
          ))}
        </div>
        {error && <div style={{ color:T.red, fontSize:12, marginBottom:12 }}>{error}</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={guardar}>{isEdit?"Guardar cambios":"Crear subusuario"}</Btn>
        </div>
      </div>
    </div>
  );
}

function UsuariosView({ usuarios, setUsuarios, showToast }){
  const [modal, setModal] = useState(null); // null | {edit:user} | {edit:null}
  const [confirm, setConfirm] = useState(null);

  const crearSubusuario = async ({ nombre, username, password, modulos }) => {
    if(usuarios.some(u=>u.username===username)){ showToast?.("Ese nombre de usuario ya existe","warn"); return; }
    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    const nuevo = { id:uid(), nombre, username, salt, passwordHash, rol:"usuario", activo:true, modulos, creado:today() };
    const updated = [...usuarios, nuevo];
    setUsuarios(updated); await save(USERS_KEY, updated);
    showToast?.(`Subusuario "${nombre}" creado`);
    setModal(null);
  };

  const editarSubusuario = async (id, { nombre, username, password, modulos }) => {
    let updated = await Promise.all(usuarios.map(async u=>{
      if(u.id!==id) return u;
      const patch = { ...u, nombre, username, modulos };
      if(password && password.length>=4){ const salt=randomSalt(); patch.salt=salt; patch.passwordHash = await hashPassword(password, salt); }
      return patch;
    }));
    setUsuarios(updated); await save(USERS_KEY, updated);
    showToast?.("Subusuario actualizado");
    setModal(null);
  };

  const toggleActivo = async (id) => {
    const updated = usuarios.map(u=>u.id===id?{...u,activo:!u.activo}:u);
    setUsuarios(updated); await save(USERS_KEY, updated);
  };

  const eliminar = async (id) => {
    const updated = usuarios.filter(u=>u.id!==id);
    setUsuarios(updated); await save(USERS_KEY, updated);
    showToast?.("Subusuario eliminado","warn");
  };

  const subusuarios = usuarios.filter(u=>u.rol!=="master");
  const master = usuarios.find(u=>u.rol==="master");

  return (
    <div>
      {modal && <ModalUsuario initial={modal.edit} onClose={()=>setModal(null)} onSave={d=> modal.edit ? editarSubusuario(modal.edit.id, d) : crearSubusuario(d)}/>}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.45)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:T.surface, borderRadius:14, padding:28, maxWidth:360, width:"90%" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.title, marginBottom:16 }}>{confirm.msg}</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setConfirm(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={()=>{confirm.onOk();setConfirm(null);}}>Confirmar</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:T.title, margin:0 }}>Usuarios</h1>
          <p style={{ fontSize:12.5, color:T.muted, margin:"3px 0 0" }}>Gestiona quién accede a PackBoard y a qué módulos</p>
        </div>
        <Btn onClick={()=>setModal({edit:null})}>+ Nuevo subusuario</Btn>
      </div>

      {master && (
        <Card style={{ marginBottom:16, borderLeft:`3px solid ${T.blue}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${T.blue},${T.violet})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800 }}>{master.nombre[0]?.toUpperCase()}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.title }}>{master.nombre} <Badge label="maestro" color={T.blue} bg="#EFF6FF"/></div>
              <div style={{ fontSize:11.5, color:T.muted }}>@{master.username} · acceso total a todos los módulos</div>
            </div>
          </div>
        </Card>
      )}

      {subusuarios.length===0 ? (
        <Card style={{ textAlign:"center", padding:36 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
          <div style={{ fontSize:14, fontWeight:700, color:T.title, marginBottom:6 }}>Aún no tienes subusuarios</div>
          <div style={{ fontSize:12, color:T.muted, marginBottom:16 }}>Crea uno para dar acceso a alguien de tu equipo, solo a los módulos que necesite.</div>
          <Btn onClick={()=>setModal({edit:null})}>+ Crear el primero</Btn>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {subusuarios.map(u=>(
            <Card key={u.id} style={{ opacity:u.activo?1:.55 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", color:T.body, fontWeight:800, border:`1px solid ${T.border}` }}>{u.nombre[0]?.toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.title }}>{u.nombre} {!u.activo && <Badge label="desactivado" color={T.muted} bg={T.bg}/>}</div>
                  <div style={{ fontSize:11.5, color:T.muted }}>@{u.username}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>
                    {u.modulos.map(mid=>{ const n=NAV.find(x=>x.id===mid); return n ? <span key={mid} style={{ fontSize:9.5, color:T.body, background:T.bg, borderRadius:5, padding:"2px 6px" }}>{n.icon} {n.label}</span> : null; })}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <Btn size="sm" variant="outline" onClick={()=>setModal({edit:u})}>✏️</Btn>
                  <Btn size="sm" variant="outline" onClick={()=>toggleActivo(u.id)}>{u.activo?"⏸️":"▶️"}</Btn>
                  <Btn size="sm" variant="danger" onClick={()=>setConfirm({msg:`¿Eliminar a ${u.nombre}?`,onOk:()=>eliminar(u.id)})}>🗑️</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── placeholder ─────────────────────────────────────────────────── */
function Placeholder({ label }){
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"80px 20px", color:T.muted }}>
      <div style={{ fontSize:36, marginBottom:10 }}>🚧</div>
      <div style={{ fontWeight:700, color:T.title, fontSize:15, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:12.5 }}>Próximamente en este panel.</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   APP
   ════════════════════════════════════════════════════════════════════ */
export default function Dashboard(){
  const [usuarios, setUsuarios] = useState([]);
  const [usersReady, setUsersReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(()=>{
    (async()=>{
      const us = await load(USERS_KEY);
      const list = us||[];
      setUsuarios(list);
      if(list.length>0){
        const sess = await load(SESSION_KEY);
        if(sess?.userId){
          const u = list.find(x=>x.id===sess.userId && x.activo);
          if(u) setCurrentUser(u);
        }
      }
      setUsersReady(true);
    })();
  },[]);

  const cerrarSesion = async () => { await save(SESSION_KEY, null); setCurrentUser(null); };

  const [isFullscreen, toggleFullscreen] = useFullscreen();
  const standalone = isStandalonePWA();
  const [immersive, setImmersive] = useState(false);
  const focusMode = isFullscreen || immersive;
  const [tab, setTab] = useState("dashboard");
  const [periodo, setPeriodo] = useState("Anual");
  const [data, setData] = useState(genDashboardData());

  const refresh = useCallback(()=>{ setData(genDashboardData()); }, []);
  useEffect(()=>{ const iv = setInterval(refresh, 25000); return ()=>clearInterval(iv); },[refresh]);

  /* ── CRM state (persistido en window.storage) ── */
  const [clientes, setClientes] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [interacciones, setInteracciones] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [ofertas, setOfertas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [config, setConfig] = useState({ comisionPct:5 });
  const [crmReady, setCrmReady] = useState(false);
  const [selectedKpis, setSelectedKpisState] = useState(DEFAULT_KPIS);
  const [home, setHomeState] = useState(HOME_DEFAULT);
  const [gmailClientId, setGmailClientIdState] = useState("");
  const [noticias, setNoticiasState] = useState({});
  const [descubiertas, setDescubiertasState] = useState([]);
  const [noticiasReady, setNoticiasReady] = useState(false);

  const [clienteId, setClienteId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterFase, setFilterFase] = useState("todas");
  const [filterSector, setFilterSector] = useState("todos");

  useEffect(()=>{
    (async()=>{
      const [cl,co,in_,ta,cat,of,pe,fa,cfg] = await Promise.all([
        load(KEYS.clientes),load(KEYS.contactos),load(KEYS.interacciones),
        load(KEYS.tareas),load(KEYS.catalogo),load(KEYS.ofertas),
        load(KEYS.pedidos),load(KEYS.facturas),load(KEYS.config),
      ]);
      if(cl) setClientes(cl); if(co) setContactos(co); if(in_) setInteracciones(in_);
      if(ta) setTareas(ta); if(cat) setCatalogo(cat); if(of) setOfertas(of);
      if(pe) setPedidos(pe); if(fa) setFacturas(fa); if(cfg) setConfig(cfg);
      setCrmReady(true);
    })();
    (async()=>{ const ks = await load("packboard-kpis-selected"); if(ks && ks.length) setSelectedKpisState(ks); })();
    (async()=>{ const h = await load("packboard-config-home"); if(h) setHomeState(h); })();
  },[]);

  const setSelectedKpis = async (ids) => { setSelectedKpisState(ids); await save("packboard-kpis-selected", ids); };
  const setHome = async (h) => { setHomeState(h); await save("packboard-config-home", h); };
  useEffect(()=>{ (async()=>{ const g = await load("packboard-config-gmail-clientid"); if(g) setGmailClientIdState(g); })(); },[]);
  const setGmailClientId = async (v) => { setGmailClientIdState(v); await save("packboard-config-gmail-clientid", v); };
  useEffect(()=>{ (async()=>{
    const n = await load(NOTICIAS_KEY); if(n) setNoticiasState(n);
    const d = await load(DESCUBIERTAS_KEY); if(d) setDescubiertasState(d);
    setNoticiasReady(true);
  })(); },[]);
  const setNoticias = (updater) => { setNoticiasState(prev=>{ const next = typeof updater==="function"?updater(prev):updater; save(NOTICIAS_KEY, next); return next; }); };
  const setDescubiertas = (updater) => { setDescubiertasState(prev=>{ const next = typeof updater==="function"?updater(prev):updater; save(DESCUBIERTAS_KEY, next); return next; }); };

  const upClientes      = async v=>{ setClientes(v);      await save(KEYS.clientes,v); };
  const upContactos     = async v=>{ setContactos(v);     await save(KEYS.contactos,v); };
  const upInteracciones = async v=>{ setInteracciones(v); await save(KEYS.interacciones,v); };
  const upTareas        = async v=>{ setTareas(v);        await save(KEYS.tareas,v); };
  const upOfertas       = async v=>{ setOfertas(v);       await save(KEYS.ofertas,v); };
  const upPedidos       = async v=>{ setPedidos(v);       await save(KEYS.pedidos,v); };
  const upFacturas      = async v=>{ setFacturas(v);      await save(KEYS.facturas,v); };

  const showToast = (msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const moverFase = async(id,fase)=>{ await upClientes(clientes.map(c=>c.id===id?{...c,fase}:c)); };
  const addCliente = async(d)=>{ const nuevo={id:uid(),...d,fase:"prospecto",creado:today()}; await upClientes([...clientes,nuevo]); showToast(`Cliente "${d.empresa}" creado`); return nuevo.id; };
  const editCliente = async(id,d)=>{ await upClientes(clientes.map(c=>c.id===id?{...c,...d}:c)); showToast("Cliente actualizado"); };
  const delCliente = async(id)=>{ setConfirm({msg:"¿Eliminar este cliente y todos sus datos?",onOk:async()=>{
      await upClientes(clientes.filter(c=>c.id!==id));
      await upContactos(contactos.filter(c=>c.clienteId!==id));
      await upInteracciones(interacciones.filter(i=>i.clienteId!==id));
      await upTareas(tareas.filter(t=>t.clienteId!==id));
      showToast("Cliente eliminado","warn");
    }}); };
  const addContacto = async(d)=>{ await upContactos([...contactos,{id:uid(),...d,creado:today()}]); showToast("Contacto añadido"); };
  const addInteraccion = async(d)=>{ await upInteracciones([...interacciones,{id:uid(),...d,fecha:today()}]); };
  const delInteraccion = async(id)=>{ await upInteracciones(interacciones.filter(i=>i.id!==id)); };
  const addTarea = async(d)=>{ await upTareas([...tareas,{id:uid(),...d,completada:false,creada:today()}]); showToast("Tarea añadida"); };
  const toggleTarea = async(id)=>{ await upTareas(tareas.map(t=>t.id===id?{...t,completada:!t.completada}:t)); };
  const delTarea = async(id)=>{ await upTareas(tareas.filter(t=>t.id!==id)); };
  const addOferta = async(d)=>{ const nueva={id:uid(),...d,estado:"enviada",fecha:today()}; await upOfertas([...ofertas,nueva]); showToast("Oferta creada"); return nueva.id; };
  const cambiarEstadoOferta = async(id,estado)=>{ await upOfertas(ofertas.map(o=>o.id===id?{...o,estado}:o)); };
  const delOferta = async(id)=>{ await upOfertas(ofertas.filter(o=>o.id!==id)); };
  const crearPedido = async(ofertaId,clienteId_,importeBase)=>{ const nuevo={id:uid(),ofertaId,clienteId:clienteId_,importeBase,fecha:today()}; await upPedidos([...pedidos,nuevo]); await cambiarEstadoOferta(ofertaId,"aceptada"); showToast("Pedido creado"); return nuevo.id; };
  const delPedido = async(id)=>{ await upPedidos(pedidos.filter(p=>p.id!==id)); };
  const crearFactura = async(pedidoId,clienteId_,baseImponible,fechaVencimiento,ivaPct=21)=>{
    const nueva={id:uid(),pedidoId,clienteId:clienteId_,baseImponible,iva:ivaPct,total:+(baseImponible*(1+ivaPct/100)).toFixed(2),fechaEmision:today(),fechaVencimiento,cobrada:false,fechaCobro:null};
    await upFacturas([...facturas,nueva]); showToast("Factura emitida"); return nueva.id;
  };
  const marcarCobrada = async(id)=>{ await upFacturas(facturas.map(f=>f.id===id?{...f,cobrada:true,fechaCobro:today()}:f)); showToast("Factura marcada como cobrada ✓","ok"); };
  const delFactura = async(id)=>{ await upFacturas(facturas.filter(f=>f.id!==id)); };

  const goTab = (t) => { setTab(t); setClienteId(null); };

  if(!usersReady) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:T.bg, color:T.muted, fontSize:13 }}>Cargando…</div>
  );
  if(usuarios.length===0) return (
    <SetupMasterView onCreated={(u)=>{ setUsuarios([u]); setCurrentUser(u); }}/>
  );
  if(!currentUser) return (
    <LoginView usuarios={usuarios} onLogin={setCurrentUser}/>
  );

  const esMaster = currentUser.rol==="master";
  const navVisible = esMaster ? NAV : NAV.filter(n=>currentUser.modulos?.includes(n.id));
  if(!esMaster && tab!=="dashboard" && !currentUser.modulos?.includes(tab) && tab!=="usuarios"){
    // si el subusuario no tiene acceso a la pestaña activa, lo mandamos a la primera que sí tenga
    setTimeout(()=>{ const first = navVisible[0]?.id||"dashboard"; setTab(first); }, 0);
  }

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"'Inter','Segoe UI',sans-serif", background:T.bg, paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)", boxSizing:"border-box" }}>

      {toast && (
        <div style={{ position:"fixed", top:16, right:20, zIndex:9999, background:toast.type==="warn"?T.orange:T.green, color:"#fff", padding:"10px 18px", borderRadius:9, fontSize:13, fontWeight:700, boxShadow:"0 4px 16px rgba(0,0,0,.2)" }}>{toast.msg}</div>
      )}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.45)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:T.surface, borderRadius:14, padding:28, maxWidth:360, width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.title, marginBottom:16 }}>{confirm.msg}</div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={()=>setConfirm(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={()=>{confirm.onOk();setConfirm(null);}}>Confirmar</Btn>
            </div>
          </div>
        </div>
      )}
      {modal && <ModalRouter modal={modal} setModal={setModal} clientes={clientes} catalogo={catalogo} addCliente={addCliente} editCliente={editCliente} addContacto={addContacto} addTarea={addTarea} addOferta={addOferta} showToast={showToast}/>}

      {/* SIDEBAR */}
      <div style={{ width:focusMode?0:250, background:T.side, flexShrink:0, display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", transition:"width .2s ease" }}>
        <div style={{ padding:"20px 20px 16px", display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:`linear-gradient(135deg,${T.blue},${T.violet})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📦</div>
          <span style={{ color:"#fff", fontWeight:800, fontSize:16, letterSpacing:-0.3 }}>PackBoard</span>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"6px 12px" }}>
          {navVisible.map(n=>(
            <div key={n.id} onClick={()=>goTab(n.id)} style={{
              display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:10,
              cursor:"pointer", marginBottom:2,
              background: tab===n.id ? T.sideActive : "transparent",
            }}>
              <span style={{ fontSize:15, width:18, textAlign:"center" }}>{n.icon}</span>
              <span style={{ fontSize:13, fontWeight: tab===n.id?700:500, color: tab===n.id?T.sideTextAct:T.sideText, flex:1 }}>{n.label}</span>
              {n.id==="clientes"&&clientes.length>0&&<span style={{ fontSize:9, fontWeight:800, color:T.sideText, background:T.sideBord, borderRadius:99, padding:"1px 6px" }}>{clientes.length}</span>}
              {n.id==="facturas"&&facturas.filter(f=>!f.cobrada).length>0&&<span style={{ fontSize:9, fontWeight:800, color:"#fff", background:T.orange, borderRadius:99, padding:"1px 6px" }}>{facturas.filter(f=>!f.cobrada).length}</span>}
            </div>
          ))}
          {esMaster && (
            <div onClick={()=>goTab("usuarios")} style={{
              display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:10,
              cursor:"pointer", marginTop:8, borderTop:`1px solid ${T.sideBord}`, paddingTop:16,
              background: tab==="usuarios" ? T.sideActive : "transparent",
            }}>
              <span style={{ fontSize:15, width:18, textAlign:"center" }}>👤</span>
              <span style={{ fontSize:13, fontWeight: tab==="usuarios"?700:500, color: tab==="usuarios"?T.sideTextAct:T.sideText, flex:1 }}>Usuarios</span>
              {usuarios.filter(u=>u.rol!=="master").length>0&&<span style={{ fontSize:9, fontWeight:800, color:T.sideText, background:T.sideBord, borderRadius:99, padding:"1px 6px" }}>{usuarios.filter(u=>u.rol!=="master").length}</span>}
            </div>
          )}
        </div>

        <div style={{ padding:12, borderTop:`1px solid ${T.sideBord}` }}>
          <div style={{ background:T.sideBord, borderRadius:11, padding:"9px 12px", display:"flex", alignItems:"center", gap:9, marginBottom:8 }}>
            <span style={{ fontSize:15 }}>🏢</span>
            <span style={{ color:"#fff", fontSize:12, fontWeight:700, flex:1 }}>PackAndTrack SL</span>
            <span style={{ color:T.muted, fontSize:10 }}>▾</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"6px 6px" }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${T.blue},${T.violet})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:12, fontWeight:800 }}>{currentUser.nombre[0]?.toUpperCase()}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:"#fff", fontSize:12, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentUser.nombre}</div>
              <div style={{ color:T.muted, fontSize:10.5 }}>{esMaster?"Usuario maestro":"Subusuario"}</div>
            </div>
            <button onClick={cerrarSesion} title="Cerrar sesión" style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:14 }}>⏻</button>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ height:64, background:T.surface, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:16, padding:"0 24px", flexShrink:0 }}>
          <div style={{ flex:1, maxWidth:380, position:"relative" }}>
            <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:T.muted, fontSize:13 }}>🔍</span>
            <input placeholder="Buscar en PackBoard…" style={{ width:"100%", padding:"9px 14px 9px 36px", borderRadius:10, border:`1px solid ${T.border}`, background:T.bg, fontSize:12.5, outline:"none", boxSizing:"border-box" }}/>
          </div>
          <div style={{ flex:1 }}/>
          {!standalone && (
            <button onClick={async()=>{
                if(focusMode){ const ok=await toggleFullscreen(); setImmersive(false); if(!ok) showToast("Has salido del modo inmersivo","ok"); }
                else {
                  const ok = await toggleFullscreen();
                  if(ok) showToast("Pantalla completa activada","ok");
                  else { setImmersive(true); showToast("Tu navegador bloquea la pantalla completa aquí — activado modo inmersivo (sin menú lateral). Para pantalla completa real en el móvil, instala la app con 'Añadir a pantalla de inicio'.","warn"); }
                }
              }} title={focusMode?"Salir de pantalla completa":"Ver a pantalla completa"} style={{ width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:15, flexShrink:0 }}>
              {focusMode?"⤢":"⛶"}
            </button>
          )}
          <div style={{ position:"relative", cursor:"pointer" }}>
            <NotificationBell crm={crmReady?{clientes,facturas,tareas,ofertas}:null} noticias={noticias} descubiertas={descubiertas} setTab={setTab}/>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, color:T.muted, fontFamily:"monospace" }}>
            <span style={{ width:6,height:6,borderRadius:"50%",background:T.green }}/>
            en vivo
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"22px 26px" }}>
          {tab==="dashboard" && <DashboardView data={data} periodo={periodo} setPeriodo={setPeriodo} crm={crmReady?{clientes,ofertas,pedidos,facturas}:null} selectedKpis={selectedKpis} setSelectedKpis={setSelectedKpis}/>}
          {tab==="agenda"    && <AgendaView/>}
          {tab==="whatsapp"  && (crmReady
            ? <WhatsAppView clientes={clientes} addTarea={addTarea} addInteraccion={addInteraccion} showToast={showToast}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando…</div>)}
          {tab==="gmail" && (crmReady
            ? <GmailModule clientId={gmailClientId} clientes={clientes} addTarea={addTarea} addInteraccion={addInteraccion} showToast={showToast}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando…</div>)}
          {tab==="noticias" && (crmReady
            ? <NewsModule clientes={clientes} noticias={noticias} setNoticias={setNoticias} descubiertas={descubiertas} setDescubiertas={setDescubiertas} addTarea={addTarea} addCliente={addCliente} addInteraccion={addInteraccion} showToast={showToast}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando…</div>)}
          {tab==="ia"        && <IAExecutivoView data={data} crm={crmReady?{clientes,ofertas,pedidos,facturas}:null}/>}

          {tab==="rutas" && (crmReady
            ? <RutasView clientes={clientes} home={home} setHome={setHome} addCliente={addCliente} showToast={showToast}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando rutas…</div>)}

          {tab==="crm" && (crmReady
            ? <CRMKanban clientes={clientes} ofertas={ofertas} facturas={facturas} dragId={dragId} setDragId={setDragId} moverFase={moverFase} setClienteId={setClienteId} setModal={setModal} setTab={setTab}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando CRM…</div>)}

          {tab==="clientes" && (crmReady
            ? <ClientesView clienteId={clienteId} setClienteId={setClienteId} clientes={clientes} contactos={contactos} interacciones={interacciones} tareas={tareas} ofertas={ofertas} pedidos={pedidos} facturas={facturas} catalogo={catalogo} config={config} search={search} setSearch={setSearch} filterFase={filterFase} setFilterFase={setFilterFase} filterSector={filterSector} setFilterSector={setFilterSector} setModal={setModal} delCliente={delCliente} setConfirm={setConfirm} editCliente={editCliente} addInteraccion={addInteraccion} delInteraccion={delInteraccion} toggleTarea={toggleTarea} delTarea={delTarea} moverFase={moverFase} crearPedido={crearPedido} crearFactura={crearFactura} marcarCobrada={marcarCobrada} delOferta={delOferta} delPedido={delPedido} delFactura={delFactura} cambiarEstadoOferta={cambiarEstadoOferta}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando clientes…</div>)}

          {tab==="ofertas" && (crmReady
            ? <OfertasView ofertas={ofertas} clientes={clientes} pedidos={pedidos} catalogo={catalogo} crearPedido={crearPedido} cambiarEstadoOferta={cambiarEstadoOferta} delOferta={(id)=>setConfirm({msg:"¿Eliminar esta oferta?",onOk:()=>delOferta(id)})} setModal={setModal} config={config}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando ofertas…</div>)}

          {tab==="pedidos" && (crmReady
            ? <PedidosView pedidos={pedidos} clientes={clientes} ofertas={ofertas} facturas={facturas} crearFactura={crearFactura} delPedido={(id)=>setConfirm({msg:"¿Eliminar este pedido?",onOk:()=>delPedido(id)})} config={config}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando pedidos…</div>)}

          {tab==="facturas" && (crmReady
            ? <FacturasView facturas={facturas} clientes={clientes} pedidos={pedidos} ofertas={ofertas} marcarCobrada={marcarCobrada} delFactura={(id)=>setConfirm({msg:"¿Eliminar esta factura?",onOk:()=>delFactura(id)})} config={config}/>
            : <div style={{color:T.muted,fontSize:13}}>Cargando facturas…</div>)}

          {tab==="reportes"  && <Placeholder label="Reportes"/>}
          {tab==="config"    && <ConfigView home={home} setHome={setHome} config={config} setConfig={async v=>{ setConfig(v); await save(KEYS.config,v); }} gmailClientId={gmailClientId} setGmailClientId={setGmailClientId} showToast={showToast}/>}
          {tab==="usuarios"  && esMaster && <UsuariosView usuarios={usuarios} setUsuarios={setUsuarios} showToast={showToast}/>}
        </div>
      </div>
    </div>
  );
}
