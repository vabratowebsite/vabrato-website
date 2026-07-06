import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, ListChecks, CalendarDays, Receipt, Users, FilePlus2,
  Check, Plus, RotateCcw, Phone, Mail, Star, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, CircleDollarSign, KeyRound, Download,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  THEME                                                              */
/* ------------------------------------------------------------------ */
const T = {
  ink: "#1C1A17", ink2: "#26231E", canvas: "#F4F1EA", surface: "#FFFFFF",
  gold: "#C6A15B", goldDeep: "#9F7B37", line: "#E7E1D3", lineSoft: "#EFEADE",
  text: "#211E1A", muted: "#726A5C", faint: "#9A9184",
  green: "#4F7A52", amber: "#BE8A2C", red: "#B44A3D",
};
const OWNER_COLORS = {
  VA: "#8A6FB0", "Lead Agent": "#3E7CA8", Mark: "#B44A3D", Viv: "#C08A2E",
  TC: "#4F7A52", "Local Help": "#7A756A", "Rachee/Ced": "#B06E8F",
  LA: "#5C8A7B", Seller: "#9F7B37",
};

/* ------------------------------------------------------------------ */
/*  STORAGE (persistent artifact storage, in-memory fallback)         */
/* ------------------------------------------------------------------ */
const mem = {};
async function loadKey(key, fallback) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(key);
      return r && r.value ? JSON.parse(r.value) : fallback;
    }
  } catch (_) { /* not found or unavailable */ }
  return mem[key] !== undefined ? mem[key] : fallback;
}
async function saveKey(key, value) {
  mem[key] = value;
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(key, JSON.stringify(value));
    }
  } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  DATE ENGINE                                                        */
/* ------------------------------------------------------------------ */
const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
]);
const pad2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parse = (s) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function businessRoll(d) {
  let x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6 || HOLIDAYS_2026.has(iso(x))) x = addDays(x, 1);
  return x;
}
const fmtLong = (s) => parse(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtShort = (s) => parse(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/* Task templates: offset = calendar days from ratification */
const TEMPLATES = [
  // Phase 1 — After Ratification
  ["Verify COE isn't a holiday or weekend", "VA", 1, 0],
  ["Verify sellers are available to sign closing docs", "VA", 1, 1],
  ["Add 'Sale Pending' rider to sign post", "Local Help", 1, 1],
  ["Change property website to 'Under Contract'", "Rachee/Ced", 1, 1],
  ["Change MLS status to Pending", "Lead Agent", 1, 1],
  ["Fill Info tab; input buyer & buyer's-agent details", "VA", 1, 1],
  ["Send escrow the seller info & signed contract", "VA", 1, 1],
  ["Complete & deliver the Escrow Guide to the seller", "VA", 1, 2],
  ["Verify earnest-money deposit (EMD) is in escrow", "Lead Agent", 1, 3],
  ["Verify smoke/CO detectors + water heater strapped", "Local Help", 1, 4],
  ["Order home warranty", "VA", 1, 5],
  ["Ask escrow for the estimated closing statement", "VA", 1, 5],
  ["Create commission demand", "VA", 1, 6],
  ["Create reimbursement demand for Mark to review", "VA", 1, 6],
  ["Insurance contingency removal", "TC", 1, 7],
  ["Financing contingency removal", "TC", 1, 7],
  ["Appraisal contingency removal", "TC", 1, 8],
  ["Property-condition contingency removal", "TC", 1, 8],
  ["Schedule de-staging (after contingencies + appraisal)", "VA", 1, 9],
  // Phase 2 — Closing Week
  ["Confirm escrow has coordinated seller signing", "VA", 2, 10],
  ["Send commission demand to escrow", "Lead Agent", 2, 10],
  ["Notify utility companies to cancel effective COE", "VA", 2, 11],
  ["Remind seller: wire vs check, don't unplug left-behind fridge, forward mail", "VA", 2, 11],
  ["Seller signs closing documents (window opens)", "Seller", 2, 11],
  ["Buyers' final walk-through", "VA", 2, 12],
  ["Remove signs/lockbox; retrieve keys & remotes", "Local Help", 2, 14],
  ["Close of Escrow (COE)", "Mark", 2, 15],
  ["Give keys to buyer's agent", "Local Help", 2, 15],
  ["Change MLS status to Sold", "Lead Agent", 2, 15],
  ["Remind seller to cancel home insurance", "VA", 2, 15],
  // Phase 3 — After COE
  ["Send seller thank-you note & gift", "LA", 3, 16],
  ["Send buyer's agent thank-you note & gift", "Local Help", 3, 16],
  ["Add client to referral base", "LA", 3, 16],
  ["Update sale info on Vabrato website", "Rachee/Ced", 3, 16],
  ["Verify TC got paid", "Mark", 3, 16],
  ["Verify we got paid", "Mark", 3, 16],
  ["Obtain final closing statement", "TC", 3, 17],
  ["Dump transaction emails into cloud folder", "Viv", 3, 18],
];
const TRUST_TEMPLATES = [
  ["Confirm estate/trust bank account for proceeds", "VA", 1, 3],
  ["Provide escrow Letters Testamentary / trust certificate", "VA", 1, 3],
  ["Address supplemental taxes (probate / successor trustee)", "Mark", 1, 8],
];

function generateTasks(ratISO, daysToClose, sellerType) {
  const rat = parse(ratISO);
  let list = [...TEMPLATES];
  if (sellerType === "Trust" || sellerType === "Successor Trustee" || sellerType === "Probate") {
    list = list.concat(TRUST_TEMPLATES);
  }
  const coeOffset = Number(daysToClose) || 15;
  return list.map((t, i) => {
    const [title, owner, phase, offset] = t;
    // COE task always lands on the computed close date
    const raw = title.startsWith("Close of Escrow") ? addDays(rat, coeOffset) : addDays(rat, offset);
    return { id: `t${i}`, title, owner, phase, offset, due: iso(businessRoll(raw)), done: false };
  }).sort((a, b) => a.due.localeCompare(b.due) || a.offset - b.offset);
}
const computeCOE = (ratISO, daysToClose) => iso(businessRoll(addDays(parse(ratISO), Number(daysToClose) || 15)));

/* ------------------------------------------------------------------ */
/*  SEED DATA (fictional)                                             */
/* ------------------------------------------------------------------ */
const SEED_DEAL = {
  address: "501 W Fox Ct, Redwood City", escrowNumber: "FSMO-10825000849",
  seller: "Dana Whitfield", sellerType: "Normal",
  ratification: "2026-02-24", daysToClose: 15, salePrice: 1175000,
};
const SEED_VENDORS = [
  { id: "v1", name: "We Need Signs", role: "Signs & Riders", phone: "(650) 555-0111", email: "orders@weneedsigns.co", preferred: true, confirmed: false },
  { id: "v2", name: "Roberto", role: "Paint & Handyman", phone: "(650) 555-0121", email: "roberto@example.com", preferred: true, confirmed: true },
  { id: "v3", name: "Refinishing Rabbit", role: "Tub Refinishing", phone: "(650) 555-0132", email: "hello@refinishingrabbit.com", preferred: false, confirmed: false },
  { id: "v4", name: "Tristan", role: "Carpet", phone: "(650) 555-0143", email: "tristan@example.com", preferred: false, confirmed: false },
  { id: "v5", name: "Duct Pros", role: "Fireplace Inspection", phone: "(650) 555-0154", email: "book@ductpros.com", preferred: true, confirmed: true },
  { id: "v6", name: "Valency", role: "Pest Inspection", phone: "(650) 555-0165", email: "valency@example.com", preferred: true, confirmed: true },
  { id: "v7", name: "John", role: "Home Inspection", phone: "(650) 555-0176", email: "john@example.com", preferred: true, confirmed: true },
  { id: "v8", name: "Silicon Valley Window", role: "Window Cleaning", phone: "(650) 555-0187", email: "svwindow@example.com", preferred: false, confirmed: false },
  { id: "v9", name: "Nadia", role: "House Cleaning", phone: "(650) 555-0198", email: "nadia@example.com", preferred: true, confirmed: false },
  { id: "v10", name: "Antonio", role: "Yard Cleanup", phone: "(650) 555-0210", email: "antonio@example.com", preferred: false, confirmed: false },
  { id: "v11", name: "Encore", role: "Staging", phone: "(650) 555-0221", email: "studio@encorestaging.com", preferred: true, confirmed: true },
  { id: "v12", name: "IHS", role: "Photography", phone: "(650) 555-0232", email: "shoot@ihs.photo", preferred: true, confirmed: true },
  { id: "v13", name: "Fidelity Title — San Carlos", role: "Escrow / Title", phone: "(650) 631-6139", email: "escrow@fidelity.example", preferred: true, confirmed: true },
  { id: "v14", name: "Laura Hooks", role: "Transaction Coordinator", phone: "(760) 204-0264", email: "tc@example.com", preferred: true, confirmed: true },
];
const SEED_RECEIPTS = [
  { id: "r1", vendor: "Encore", date: "2026-02-10", amount: 2400, category: "Staging", source: "Drive" },
  { id: "r2", vendor: "IHS", date: "2026-02-12", amount: 675, category: "Photography", source: "Drive" },
  { id: "r3", vendor: "John", date: "2026-02-06", amount: 550, category: "Inspection", source: "Dropbox" },
  { id: "r4", vendor: "Valency", date: "2026-02-06", amount: 385, category: "Inspection", source: "Manual" },
];
const IMPORTABLE = [
  { vendor: "Nadia", amount: 320, category: "Cleaning", source: "Drive" },
  { vendor: "Antonio", amount: 240, category: "Yard", source: "Drive" },
  { vendor: "Refinishing Rabbit", amount: 495, category: "Repairs", source: "Drive" },
  { vendor: "We Need Signs", amount: 180, category: "Marketing", source: "Dropbox" },
];

/* ------------------------------------------------------------------ */
/*  SMALL UI HELPERS                                                   */
/* ------------------------------------------------------------------ */
const money = (n) => "$" + Number(n).toLocaleString("en-US");
function OwnerChip({ owner }) {
  const c = OWNER_COLORS[owner] || T.muted;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: c + "1F", color: c }}>{owner}</span>
  );
}
function dueState(due, done) {
  if (done) return { c: T.green, label: "Done" };
  const today = iso(new Date());
  if (due < today) return { c: T.red, label: "Overdue" };
  const soon = iso(addDays(new Date(), 3));
  if (due <= soon) return { c: T.amber, label: "Due soon" };
  return { c: T.faint, label: "Scheduled" };
}

/* ------------------------------------------------------------------ */
/*  MAIN                                                               */
/* ------------------------------------------------------------------ */
export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("dashboard");
  const [deal, setDeal] = useState(SEED_DEAL);
  const [tasks, setTasks] = useState([]);
  const [vendors, setVendors] = useState(SEED_VENDORS);
  const [receipts, setReceipts] = useState(SEED_RECEIPTS);

  // load
  useEffect(() => {
    (async () => {
      const d = await loadKey("va:deal", null);
      const t = await loadKey("va:tasks", null);
      const v = await loadKey("va:vendors", null);
      const r = await loadKey("va:receipts", null);
      const dealVal = d || SEED_DEAL;
      setDeal(dealVal);
      setTasks(t || generateTasks(dealVal.ratification, dealVal.daysToClose, dealVal.sellerType));
      setVendors(v || SEED_VENDORS);
      setReceipts(r || SEED_RECEIPTS);
      setReady(true);
    })();
  }, []);
  // persist
  useEffect(() => { if (ready) saveKey("va:deal", deal); }, [deal, ready]);
  useEffect(() => { if (ready) saveKey("va:tasks", tasks); }, [tasks, ready]);
  useEffect(() => { if (ready) saveKey("va:vendors", vendors); }, [vendors, ready]);
  useEffect(() => { if (ready) saveKey("va:receipts", receipts); }, [receipts, ready]);

  const coe = useMemo(() => computeCOE(deal.ratification, deal.daysToClose), [deal]);
  const daysToCOE = Math.max(0, Math.round((parse(coe) - new Date()) / 86400000));
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const reimburse = receipts.reduce((s, r) => s + Number(r.amount), 0);

  const resetDemo = async () => {
    setDeal(SEED_DEAL);
    setTasks(generateTasks(SEED_DEAL.ratification, SEED_DEAL.daysToClose, SEED_DEAL.sellerType));
    setVendors(SEED_VENDORS); setReceipts(SEED_RECEIPTS);
  };
  const regenerate = (next) => {
    setDeal(next);
    setTasks(generateTasks(next.ratification, next.daysToClose, next.sellerType));
  };

  const NAV = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["tasks", "Tasks", ListChecks],
    ["calendar", "Calendar", CalendarDays],
    ["receipts", "Receipts", Receipt],
    ["vendors", "Vendors", Users],
    ["intake", "New transaction", FilePlus2],
  ];

  if (!ready) {
    return <div style={{ background: T.canvas, color: T.muted }} className="min-h-screen flex items-center justify-center text-sm">Loading your desk…</div>;
  }

  return (
    <div style={{ background: T.canvas, color: T.text, fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}
      className="min-h-screen w-full flex">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        *{box-sizing:border-box} ::-webkit-scrollbar{width:9px;height:9px} ::-webkit-scrollbar-thumb{background:#d9d2c2;border-radius:9px}
        .serif{font-family:'Fraunces',Georgia,serif} .mono{font-family:'IBM Plex Mono',monospace}
        .navbtn:hover{background:#ffffff12} .card{transition:box-shadow .15s ease,transform .15s ease}
        input:focus,select:focus{outline:none;border-color:${T.gold}!important;box-shadow:0 0 0 3px ${T.gold}33}`}</style>

      {/* SIDEBAR */}
      <aside style={{ background: T.ink, borderRight: `1px solid ${T.ink2}` }} className="w-60 shrink-0 hidden md:flex flex-col justify-between py-6">
        <div>
          <div className="px-6 pb-6">
            <div className="serif text-xl" style={{ color: T.gold, letterSpacing: "0.5px" }}>VABRATO</div>
            <div className="text-[11px] tracking-widest mt-1" style={{ color: "#8f887b" }}>TRANSACTION DESK</div>
          </div>
          <nav className="px-3 space-y-1">
            {NAV.map(([id, label, Icon]) => {
              const active = view === id;
              return (
                <button key={id} onClick={() => setView(id)}
                  className="navbtn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: active ? T.gold + "22" : "transparent", color: active ? T.gold : "#cfc7b7" }}>
                  <Icon size={17} /> <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="px-3">
          <button onClick={resetDemo} className="navbtn w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ color: "#8f887b" }}>
            <RotateCcw size={13} /> Reset demo data
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0">
        {/* deal header */}
        <header style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }} className="px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3 justify-between">
          <div>
            <div className="serif text-lg leading-tight">{deal.address}</div>
            <div className="text-xs mt-0.5" style={{ color: T.muted }}>
              Escrow #{deal.escrowNumber} · Seller {deal.seller}
              {deal.sellerType !== "Normal" && <span className="ml-1" style={{ color: T.goldDeep }}>· {deal.sellerType}</span>}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <HeaderStat label="Ratified" value={fmtShort(deal.ratification)} />
            <HeaderStat label="Close of escrow" value={fmtLong(coe)} accent />
            <HeaderStat label="Days to COE" value={daysToCOE} mono />
            <div className="w-36">
              <div className="flex justify-between text-xs mb-1" style={{ color: T.muted }}><span>Progress</span><span className="mono">{pct}%</span></div>
              <div style={{ background: T.lineSoft }} className="h-2 rounded-full overflow-hidden">
                <div style={{ width: pct + "%", background: T.gold }} className="h-full rounded-full" />
              </div>
            </div>
          </div>
        </header>

        {/* mobile nav */}
        <div className="md:hidden flex gap-1 overflow-x-auto px-3 py-2" style={{ background: T.ink }}>
          {NAV.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setView(id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap"
              style={{ background: view === id ? T.gold + "22" : "transparent", color: view === id ? T.gold : "#cfc7b7" }}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        <div className="p-6 max-w-6xl mx-auto">
          {view === "dashboard" && <Dashboard tasks={tasks} pct={pct} doneCount={doneCount} daysToCOE={daysToCOE} reimburse={reimburse} setView={setView} coe={coe} />}
          {view === "tasks" && <Tasks tasks={tasks} setTasks={setTasks} />}
          {view === "calendar" && <Calendar tasks={tasks} ratification={deal.ratification} />}
          {view === "receipts" && <Receipts receipts={receipts} setReceipts={setReceipts} reimburse={reimburse} />}
          {view === "vendors" && <Vendors vendors={vendors} setVendors={setVendors} />}
          {view === "intake" && <Intake deal={deal} regenerate={regenerate} coe={coe} />}
        </div>
      </main>
    </div>
  );
}

function HeaderStat({ label, value, accent, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
      <div className={"text-sm font-medium " + (mono ? "mono" : "")} style={{ color: accent ? T.goldDeep : T.text }}>{value}</div>
    </div>
  );
}
function Panel({ title, children, right }) {
  return (
    <section style={{ background: T.surface, border: `1px solid ${T.line}` }} className="rounded-2xl p-5 card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="serif text-base">{title}</h3>{right}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------- DASHBOARD --------------------------- */
function Dashboard({ tasks, pct, doneCount, daysToCOE, reimburse, setView, coe }) {
  const phases = [
    { k: 1, label: "After Ratification" }, { k: 2, label: "Closing Week" }, { k: 3, label: "After COE" },
  ].map((p) => {
    const set = tasks.filter((t) => t.phase === p.k);
    return { ...p, done: set.filter((t) => t.done).length, total: set.length };
  });
  const barData = phases.map((p) => ({ name: p.label, Done: p.done, Remaining: p.total - p.done }));
  const donut = [{ name: "Done", value: doneCount }, { name: "Open", value: tasks.length - doneCount }];
  const overdue = tasks.filter((t) => !t.done && t.due < iso(new Date())).length;
  const upcoming = tasks.filter((t) => !t.done).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Clock} label="Days to close" value={daysToCOE} sub={fmtLong(coe)} />
        <Stat icon={Check} label="Tasks complete" value={`${doneCount}/${tasks.length}`} sub={`${pct}% done`} />
        <Stat icon={AlertTriangle} label="Overdue" value={overdue} sub={overdue ? "needs attention" : "all clear"} danger={overdue > 0} />
        <Stat icon={CircleDollarSign} label="Reimbursement" value={money(reimburse)} sub={`${IMPORTABLE.length ? "auto-logged" : ""} receipts`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Progress by phase">
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.faint }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: T.lineSoft }} contentStyle={{ borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 12 }} />
                  <Bar dataKey="Done" stackId="a" fill={T.gold} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Remaining" stackId="a" fill={T.lineSoft} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <Panel title="Completion">
          <div style={{ height: 200 }} className="relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={58} outerRadius={80} startAngle={90} endAngle={-270} stroke="none">
                  <Cell fill={T.gold} /><Cell fill={T.lineSoft} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="serif text-3xl">{pct}%</div>
              <div className="text-xs" style={{ color: T.muted }}>complete</div>
            </div>
          </div>
        </Panel>
      </div>
      <Panel title="Up next" right={<button onClick={() => setView("tasks")} className="text-xs font-medium" style={{ color: T.goldDeep }}>View all →</button>}>
        <ul className="divide-y" style={{ borderColor: T.lineSoft }}>
          {upcoming.map((t) => {
            const st = dueState(t.due, t.done);
            return (
              <li key={t.id} className="py-2.5 flex items-center gap-3">
                <span style={{ background: st.c }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                <span className="text-sm flex-1 min-w-0 truncate">{t.title}</span>
                <OwnerChip owner={t.owner} />
                <span className="text-xs mono w-24 text-right" style={{ color: T.muted }}>{fmtShort(t.due)}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
function Stat({ icon: Icon, label, value, sub, danger }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}` }} className="rounded-2xl p-4 card">
      <div className="flex items-center gap-2 text-xs mb-2" style={{ color: T.muted }}><Icon size={14} />{label}</div>
      <div className="serif text-2xl" style={{ color: danger ? T.red : T.text }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: T.faint }}>{sub}</div>
    </div>
  );
}

/* ------------------------------ TASKS ----------------------------- */
function Tasks({ tasks, setTasks }) {
  const [owner, setOwner] = useState("All");
  const owners = ["All", ...Array.from(new Set(tasks.map((t) => t.owner)))];
  const toggle = (id) => setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const phases = [[1, "After Ratification"], [2, "Closing Week"], [3, "After COE"]];
  const shown = (p) => tasks.filter((t) => t.phase === p && (owner === "All" || t.owner === owner));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: T.muted }}>Owner</span>
        {owners.map((o) => (
          <button key={o} onClick={() => setOwner(o)} className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: owner === o ? T.ink : T.surface, color: owner === o ? T.gold : T.muted, border: `1px solid ${owner === o ? T.ink : T.line}` }}>{o}</button>
        ))}
      </div>
      {phases.map(([p, label]) => {
        const set = shown(p);
        if (!set.length) return null;
        return (
          <Panel key={p} title={label} right={<span className="text-xs mono" style={{ color: T.faint }}>{set.filter((t) => t.done).length}/{set.length}</span>}>
            <ul className="space-y-1.5">
              {set.map((t) => {
                const st = dueState(t.due, t.done);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <button onClick={() => toggle(t.id)} className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center"
                      style={{ background: t.done ? T.green : "transparent", border: `1.5px solid ${t.done ? T.green : T.line}` }}>
                      {t.done && <Check size={13} color="#fff" />}
                    </button>
                    <span className="text-sm flex-1 min-w-0" style={{ color: t.done ? T.faint : T.text, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                    <OwnerChip owner={t.owner} />
                    <span className="text-[11px] font-medium w-16 text-right" style={{ color: st.c }}>{st.label}</span>
                    <span className="text-xs mono w-24 text-right hidden sm:block" style={{ color: T.muted }}>{fmtShort(t.due)}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

/* ---------------------------- CALENDAR ---------------------------- */
function Calendar({ tasks, ratification }) {
  const [cursor, setCursor] = useState(() => { const d = parse(ratification); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(ratification);
  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const byDay = {};
  tasks.forEach((t) => { (byDay[t.due] = byDay[t.due] || []).push(t); });
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(iso(new Date(cursor.y, cursor.m, d)));
  const selTasks = byDay[selected] || [];
  const shift = (n) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Panel title={monthLabel} right={
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="p-1.5 rounded-lg" style={{ border: `1px solid ${T.line}` }}><ChevronLeft size={15} /></button>
            <button onClick={() => shift(1)} className="p-1.5 rounded-lg" style={{ border: `1px solid ${T.line}` }}><ChevronRight size={15} /></button>
          </div>}>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider mb-1" style={{ color: T.faint }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const items = byDay[day] || [];
              const isSel = day === selected;
              const num = Number(day.slice(-2));
              return (
                <button key={i} onClick={() => setSelected(day)}
                  className="rounded-lg p-1.5 text-left min-h-[64px] flex flex-col"
                  style={{ background: isSel ? T.gold + "22" : items.length ? T.canvas : T.surface, border: `1px solid ${isSel ? T.gold : T.lineSoft}` }}>
                  <span className="text-xs mono" style={{ color: T.muted }}>{num}</span>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 2).map((t) => (
                      <div key={t.id} className="text-[9px] leading-tight truncate rounded px-1 py-0.5"
                        style={{ background: (OWNER_COLORS[t.owner] || T.muted) + "22", color: OWNER_COLORS[t.owner] || T.muted }}>{t.title}</div>
                    ))}
                    {items.length > 2 && <div className="text-[9px]" style={{ color: T.faint }}>+{items.length - 2} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
          <button className="mt-4 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg" style={{ background: T.ink, color: T.gold }}
            onClick={() => alert("Simulated: pushed " + tasks.length + " events to Google Calendar '501 W Fox Ct — Escrow'. In production this syncs via the Calendar API.")}>
            <CalendarDays size={14} /> Sync to Google Calendar
          </button>
        </Panel>
      </div>
      <Panel title={fmtLong(selected)}>
        {selTasks.length === 0 ? (
          <p className="text-sm" style={{ color: T.faint }}>Nothing scheduled. Pick a highlighted day to see its tasks.</p>
        ) : (
          <ul className="space-y-2">
            {selTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span style={{ background: OWNER_COLORS[t.owner] || T.muted }} className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm">{t.title}</div>
                  <OwnerChip owner={t.owner} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------- RECEIPTS ---------------------------- */
function Receipts({ receipts, setReceipts, reimburse }) {
  const [importIdx, setImportIdx] = useState(0);
  const [form, setForm] = useState({ vendor: "", amount: "", category: "", source: "Manual" });
  const doImport = () => {
    const next = IMPORTABLE[importIdx % IMPORTABLE.length];
    setReceipts([{ id: "r" + Date.now(), date: iso(new Date()), ...next }, ...receipts]);
    setImportIdx(importIdx + 1);
  };
  const addManual = () => {
    if (!form.vendor || !form.amount) return;
    setReceipts([{ id: "r" + Date.now(), date: iso(new Date()), vendor: form.vendor, amount: Number(form.amount), category: form.category || "Other", source: "Manual" }, ...receipts]);
    setForm({ vendor: "", amount: "", category: "", source: "Manual" });
  };
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1" style={{ background: T.ink, color: "#fff" }}>
          <div style={{ background: T.ink }} className="rounded-2xl p-5 h-full flex flex-col justify-between">
            <div className="text-xs" style={{ color: "#8f887b" }}>Total reimbursement demand</div>
            <div className="serif text-3xl mt-2" style={{ color: T.gold }}>{money(reimburse)}</div>
            <div className="text-xs mt-1" style={{ color: "#8f887b" }}>{receipts.length} receipts logged</div>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Panel title="Auto-import from Drive / Dropbox">
            <p className="text-sm mb-3" style={{ color: T.muted }}>In production, dropping a receipt into the deal's Receipts folder logs it here automatically. Simulate one:</p>
            <button onClick={doImport} className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg" style={{ background: T.gold, color: T.ink }}>
              <Download size={15} /> Import next receipt
            </button>
          </Panel>
        </div>
      </div>
      <Panel title="Add a receipt manually">
        <div className="grid sm:grid-cols-4 gap-2">
          <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor"
            className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, background: T.surface }} />
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" type="number"
            className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, background: T.surface }} />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category"
            className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${T.line}`, background: T.surface }} />
          <button onClick={addManual} className="flex items-center justify-center gap-2 text-sm font-medium rounded-lg" style={{ background: T.ink, color: T.gold }}>
            <Plus size={15} /> Add
          </button>
        </div>
      </Panel>
      <Panel title="Logged receipts">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: T.faint }}>
                <th className="pb-2 font-medium">Vendor</th><th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Category</th><th className="pb-2 font-medium">Source</th><th className="pb-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: T.lineSoft }}>
                  <td className="py-2.5">{r.vendor}</td>
                  <td className="py-2.5 mono text-xs" style={{ color: T.muted }}>{fmtShort(r.date)}</td>
                  <td className="py-2.5">{r.category}</td>
                  <td className="py-2.5"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: T.lineSoft, color: T.muted }}>{r.source}</span></td>
                  <td className="py-2.5 text-right mono">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ----------------------------- VENDORS ---------------------------- */
function Vendors({ vendors, setVendors }) {
  const [role, setRole] = useState("All");
  const roles = ["All", ...Array.from(new Set(vendors.map((v) => v.role)))];
  const shown = vendors.filter((v) => role === "All" || v.role === role);
  const toggleConfirm = (id) => setVendors(vendors.map((v) => (v.id === id ? { ...v, confirmed: !v.confirmed } : v)));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: T.muted }}>Role</span>
        {roles.map((r) => (
          <button key={r} onClick={() => setRole(r)} className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: role === r ? T.ink : T.surface, color: role === r ? T.gold : T.muted, border: `1px solid ${role === r ? T.ink : T.line}` }}>{r}</button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((v) => (
          <div key={v.id} style={{ background: T.surface, border: `1px solid ${T.line}` }} className="rounded-2xl p-4 card">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-1.5">{v.name}{v.preferred && <Star size={13} fill={T.gold} color={T.gold} />}</div>
                <div className="text-xs mt-0.5" style={{ color: T.muted }}>{v.role}</div>
              </div>
              <button onClick={() => toggleConfirm(v.id)} className="text-[11px] font-medium px-2 py-1 rounded-full shrink-0"
                style={{ background: v.confirmed ? T.green + "22" : T.lineSoft, color: v.confirmed ? T.green : T.muted }}>
                {v.confirmed ? "Confirmed" : "Confirm?"}
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-xs" style={{ color: T.muted }}>
              <a href={`tel:${v.phone}`} className="flex items-center gap-2"><Phone size={13} />{v.phone}</a>
              <a href={`mailto:${v.email}`} className="flex items-center gap-2 truncate"><Mail size={13} /><span className="truncate">{v.email}</span></a>
            </div>
            <button className="mt-3 w-full text-xs font-medium py-1.5 rounded-lg flex items-center justify-center gap-1.5"
              style={{ background: T.canvas, color: T.goldDeep, border: `1px solid ${T.line}` }}
              onClick={() => alert(`Added ${v.name} to this deal's prep schedule (simulated).`)}>
              <Plus size={13} /> Add to this deal
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- INTAKE ----------------------------- */
function Field({ label, children }) {
  return (
    <label className="block"><span className="text-xs" style={{ color: T.muted }}>{label}</span><div className="mt-1">{children}</div></label>
  );
}
function Intake({ deal, regenerate, coe }) {
  const [f, setF] = useState(deal);
  const [saved, setSaved] = useState(false);
  useEffect(() => setF(deal), [deal]);
  const set = (k, v) => { setF({ ...f, [k]: v }); setSaved(false); };
  const previewCOE = computeCOE(f.ratification, f.daysToClose);
  const submit = () => { regenerate(f); setSaved(true); };
  const inputStyle = { border: `1px solid ${T.line}`, background: T.surface };
  return (
    <div className="max-w-2xl">
      <Panel title="New transaction" right={<KeyRound size={16} color={T.gold} />}>
        <p className="text-sm mb-4" style={{ color: T.muted }}>
          Enter the ratification date and the desk builds the full task list, dated and owner-assigned — weekends and holidays rolled forward automatically. Trust/Probate adds estate tasks.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Property address"><input value={f.address} onChange={(e) => set("address", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg" style={inputStyle} /></Field>
          <Field label="Escrow #"><input value={f.escrowNumber} onChange={(e) => set("escrowNumber", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg" style={inputStyle} /></Field>
          <Field label="Seller name"><input value={f.seller} onChange={(e) => set("seller", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg" style={inputStyle} /></Field>
          <Field label="Seller type">
            <select value={f.sellerType} onChange={(e) => set("sellerType", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg" style={inputStyle}>
              {["Normal", "Trust", "Successor Trustee", "Probate"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Ratification date"><input type="date" value={f.ratification} onChange={(e) => set("ratification", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg mono" style={inputStyle} /></Field>
          <Field label="Days to close escrow"><input type="number" value={f.daysToClose} onChange={(e) => set("daysToClose", e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg mono" style={inputStyle} /></Field>
          <Field label="Sale price"><input type="number" value={f.salePrice} onChange={(e) => set("salePrice", Number(e.target.value))} className="w-full text-sm px-3 py-2 rounded-lg mono" style={inputStyle} /></Field>
          <div className="flex items-end">
            <div className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: T.canvas, border: `1px dashed ${T.gold}` }}>
              <span style={{ color: T.muted }}>Computed COE: </span><span className="mono font-medium" style={{ color: T.goldDeep }}>{fmtLong(previewCOE)}</span>
            </div>
          </div>
        </div>
        <button onClick={submit} className="mt-5 flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg" style={{ background: T.ink, color: T.gold }}>
          <ListChecks size={15} /> Generate transaction & rebuild tasks
        </button>
        {saved && <div className="mt-3 text-sm flex items-center gap-2" style={{ color: T.green }}><Check size={15} /> Tasks regenerated. Open the Tasks or Calendar tab.</div>}
        {(f.sellerType !== "Normal") && (
          <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: T.gold + "18", color: T.goldDeep }}>
            {f.sellerType} selected → estate/trust bank account, Letters Testamentary / trust certificate, and supplemental-tax tasks will be added.
          </div>
        )}
      </Panel>
    </div>
  );
}
