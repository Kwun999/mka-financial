import { useState, useEffect, useCallback, useMemo } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

const SK = "mka_fp_v3";
const SCENARIOS_KEY = "mka_scenarios_v3";
const loadAll = () => { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : {}; } catch { return {}; } };
const saveAll = (data) => { try { localStorage.setItem(SK, JSON.stringify(data)); } catch {} };
const loadScenarios = () => { try { const r = localStorage.getItem(SCENARIOS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } };
const saveScenarios = (list) => { try { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(list)); } catch {} };

const FED_BRACKETS = [
  { min: 0,      max: 55867,   rate: 0.15  },
  { min: 55867,  max: 111733,  rate: 0.205 },
  { min: 111733, max: 154906,  rate: 0.26  },
  { min: 154906, max: 220000,  rate: 0.29  },
  { min: 220000, max: Infinity,rate: 0.33  },
];
const FED_BASIC = 15705;

const PROV = {
  "Alberta":              { b:[{m:0,x:148269,r:.10},{m:148269,x:177922,r:.12},{m:177922,x:237230,r:.13},{m:237230,x:355845,r:.14},{m:355845,x:Infinity,r:.15}], p:21003 },
  "British Columbia":     { b:[{m:0,x:45654,r:.0506},{m:45654,x:91310,r:.077},{m:91310,x:104835,r:.105},{m:104835,x:127299,r:.1229},{m:127299,x:172602,r:.147},{m:172602,x:240716,r:.168},{m:240716,x:Infinity,r:.205}], p:11981 },
  "Manitoba":             { b:[{m:0,x:36842,r:.108},{m:36842,x:79625,r:.1275},{m:79625,x:Infinity,r:.174}], p:15780 },
  "New Brunswick":        { b:[{m:0,x:47715,r:.094},{m:47715,x:95431,r:.1482},{m:95431,x:176756,r:.1652},{m:176756,x:Infinity,r:.195}], p:12458 },
  "Newfoundland":         { b:[{m:0,x:43198,r:.087},{m:43198,x:86395,r:.145},{m:86395,x:154244,r:.158},{m:154244,x:215943,r:.178},{m:215943,x:Infinity,r:.198}], p:10818 },
  "Nova Scotia":          { b:[{m:0,x:29590,r:.0879},{m:29590,x:59180,r:.1495},{m:59180,x:93000,r:.1667},{m:93000,x:150000,r:.175},{m:150000,x:Infinity,r:.21}], p:8481 },
  "Ontario":              { b:[{m:0,x:51446,r:.0505},{m:51446,x:102894,r:.0915},{m:102894,x:150000,r:.1116},{m:150000,x:220000,r:.1216},{m:220000,x:Infinity,r:.1316}], p:11865, surtax:true },
  "Prince Edward Island": { b:[{m:0,x:32656,r:.0965},{m:32656,x:64313,r:.1363},{m:64313,x:105000,r:.1665},{m:105000,x:140000,r:.18},{m:140000,x:Infinity,r:.1875}], p:12000 },
  "Quebec":               { b:[{m:0,x:51780,r:.14},{m:51780,x:103545,r:.19},{m:103545,x:126000,r:.24},{m:126000,x:Infinity,r:.2575}], p:17183 },
  "Saskatchewan":         { b:[{m:0,x:49720,r:.105},{m:49720,x:142058,r:.125},{m:142058,x:Infinity,r:.145}], p:17661 },
};

function bracketTax(income, brackets, personal) {
  const ti = Math.max(0, income - personal);
  let tax = 0;
  for (const b of brackets) {
    const lo = b.min || b.m || 0;
    const hi = b.max || b.x || Infinity;
    const rate = b.rate || b.r || 0;
    if (ti <= lo) break;
    tax += (Math.min(ti, hi) - lo) * rate;
  }
  return tax;
}

function calcTax(income, provName) {
  if (income <= 0) return { fedTax:0, provTax:0, total:0, effective:0, marginal:0, netIncome:0 };
  const prov = PROV[provName] || PROV["Ontario"];
  const fedTax = bracketTax(income, FED_BRACKETS, FED_BASIC);
  let provTax = bracketTax(income, prov.b, prov.p);
  if (prov.surtax && provTax > 5315) { provTax += (provTax - 5315) * 0.20; }
  if (prov.surtax && provTax > 6802)  { provTax += (provTax - 6802)  * 0.36; }
  const total = Math.max(0, fedTax + provTax);
  const effective = total / income;
  const ti = income - FED_BASIC;
  const mFed = FED_BRACKETS.find(b => ti >= b.min && ti < b.max)?.rate || 0.15;
  const tiP = income - prov.p;
  const mProv = prov.b.find(b => tiP >= (b.m||b.min||0) && tiP < (b.x||b.max||Infinity))?.r || 0;
  return { fedTax, provTax, total, effective, marginal: mFed + mProv, netIncome: income - total };
}

const OAS_CLAWBACK_START = 90997;

function oasAfterClawback(totalIncome, oasAnnual) {
  if (totalIncome <= OAS_CLAWBACK_START) return oasAnnual;
  return Math.max(0, oasAnnual - (totalIncome - OAS_CLAWBACK_START) * 0.15);
}

const RRIF_MIN_RATES = {65:.040,66:.041,67:.042,68:.044,69:.045,70:.050,71:.0528,72:.054,73:.0556,74:.0571,75:.0582,76:.0596,77:.0611,78:.0629,79:.0647,80:.0682,81:.0697,82:.0713,83:.0735,84:.0758,85:.0851,86:.0876,87:.0902,88:.0930,89:.0963,90:.1000,91:.1111,92:.1250,93:.1428,94:.1666,95:.2000};

function getRRIFRate(age) {
  const keys = Object.keys(RRIF_MIN_RATES).map(Number).sort((a,b)=>a-b);
  let rate = 0.04;
  for (const k of keys) { if (age >= k) rate = RRIF_MIN_RATES[k]; }
  return rate;
}

function gaussRandom(){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

function runMonteCarlo({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation,targetAmount,runs=1200}){
  const results=[];const realReturn=blendedReturn-inflation;
  for(let i=0;i<runs;i++){let pv=currentValue;for(let y=0;y<timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution}results.push(pv)}
  results.sort((a,b)=>a-b);const pct=(p)=>results[Math.floor((p/100)*results.length)];
  return{successRate:(results.filter(v=>v>=targetAmount).length/runs)*100,p10:pct(10),p25:pct(25),p50:pct(50),p75:pct(75),p90:pct(90),worst:results[0],best:results[results.length-1]}
}

function buildProjectionData({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation}){
  const realReturn=blendedReturn-inflation;const RUNS=800;
  const yv=Array.from({length:timeHorizon+1},()=>[]);
  for(let i=0;i<RUNS;i++){let pv=currentValue;yv[0].push(pv);for(let y=1;y<=timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution;yv[y].push(pv)}}
  return yv.map((vals,yr)=>{const s=vals.slice().sort((a,b)=>a-b);const p=(pc)=>Math.max(0,s[Math.floor((pc/100)*s.length)]||0);return{year:yr,p10:p(10),p25:p(25),p50:p(50),p75:p(75),p90:p(90)}})
}

function buildWithdrawalPlan(r) {
  let rrif = r.rrifBalance, tfsa = r.tfsaBalance, nonReg = r.nonRegBalance;
  const acbRatio = r.nonRegBalance > 0 ? Math.min(1, r.nonRegACB / r.nonRegBalance) : 1;
  const retRate = r.portfolioReturn / 100;
  const cpp = r.cppMonthly * 12;
  const oasGross = r.oasMonthly * 12;
  const desired = r.desiredMonthlyIncome * 12;
  const years = [];
  for (let age = r.retirementAge; age <= r.lifeExpectancy; age++) {
    rrif *= (1 + retRate); tfsa *= (1 + retRate); nonReg *= (1 + retRate);
    const rrifMinRate = getRRIFRate(age);
    const rrifMin = rrif * rrifMinRate;
    const custom = r.customWithdrawals?.[age];
    const preOAS = oasAfterClawback(cpp + oasGross + rrifMin, oasGross);
    const guaranteed = cpp + preOAS;
    const gap = Math.max(0, desired - guaranteed);
    let rrifW = 0, tfsaW = 0, nonRegW = 0;
    if (custom && (custom.rrif || custom.tfsa || custom.nonReg)) {
      rrifW = Math.min(custom.rrif || 0, rrif);
      tfsaW = Math.min(custom.tfsa || 0, tfsa);
      nonRegW = Math.min(custom.nonReg || 0, nonReg);
    } else {
      rrifW = Math.min(Math.max(rrifMin, gap * 0.5), rrif);
      const rem = Math.max(0, gap - rrifW);
      if (r.withdrawOrder === "optimal") {
        nonRegW = Math.min(rem * 0.6, nonReg);
        tfsaW = Math.min(Math.max(0, gap - rrifW - nonRegW), tfsa);
      } else if (r.withdrawOrder === "tfsa-first") {
        tfsaW = Math.min(rem, tfsa); nonRegW = Math.min(Math.max(0, gap - rrifW - tfsaW), nonReg);
      } else if (r.withdrawOrder === "nonreg-first") {
        nonRegW = Math.min(rem, nonReg); tfsaW = Math.min(Math.max(0, gap - rrifW - nonRegW), tfsa);
      } else {
        rrifW = Math.min(Math.max(rrifMin, gap), rrif); nonRegW = Math.min(Math.max(0, gap - rrifW), nonReg);
      }
    }
    const gainRatio = 1 - acbRatio;
    const nonRegTaxableGain = nonRegW * gainRatio * 0.5;
    const oasNet = oasAfterClawback(cpp + oasGross + rrifW, oasGross);
    const taxableIncome = cpp + oasNet + rrifW + nonRegTaxableGain;
    const tax = calcTax(taxableIncome, r.province);
    rrif = Math.max(0, rrif - rrifW); tfsa = Math.max(0, tfsa - tfsaW); nonReg = Math.max(0, nonReg - nonRegW);
    const totalIncome = guaranteed + rrifW + tfsaW + nonRegW;
    years.push({ age, rrifBal:rrif, tfsaBal:tfsa, nonRegBal:nonReg, totalBal:rrif+tfsa+nonReg, cpp, oasNet, rrifW, tfsaW, nonRegW, totalIncome, taxableIncome, tax:tax.total, effectiveRate:tax.effective, netIncome:totalIncome-tax.total, rrifMin, marginal:tax.marginal });
  }
  return years;
}

function calcEstate(r) {
  const prov = r.province;
  const rrifTaxObj = calcTax(r.rrifBalance, prov);
  const nonRegGain = Math.max(0, r.nonRegBalance - r.nonRegACB);
  const nonRegTaxable = r.nonRegACB + nonRegGain * 0.5;
  const nonRegTaxFull = calcTax(nonRegTaxable, prov).total;
  const nonRegTaxBase = calcTax(r.nonRegACB, prov).total;
  const nonRegTaxOnGain = Math.max(0, nonRegTaxFull - nonRegTaxBase);
  return {
    rrifGross:r.rrifBalance, rrifTax:rrifTaxObj.total, rrifNet:r.rrifBalance-rrifTaxObj.total, rrifRate:rrifTaxObj.effective,
    tfsaGross:r.tfsaBalance, tfsaTax:0, tfsaNet:r.tfsaBalance,
    nonRegGross:r.nonRegBalance, nonRegGain, nonRegTax:nonRegTaxOnGain, nonRegNet:r.nonRegBalance-nonRegTaxOnGain,
    totalGross:r.rrifBalance+r.tfsaBalance+r.nonRegBalance,
    totalTax:rrifTaxObj.total+nonRegTaxOnGain,
    totalNet:(r.rrifBalance-rrifTaxObj.total)+r.tfsaBalance+(r.nonRegBalance-nonRegTaxOnGain),
  };
}

const fmt = (v) => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${Math.round(Math.abs(v))}`;
const fmtPct = (v) => `${(v*100).toFixed(1)}%`;
const successColor = (r) => r >= 80 ? "#22c55e" : r >= 60 ? "#f59e0b" : "#ef4444";

const DEFAULT_PLAN = {
  goalName:"Retirement", currentAge:45, targetAge:65, currentValue:500000,
  monthlyContribution:2000, targetAmount:2500000,
  allocation:{equity:60,bonds:30,cash:10},
  assetReturns:{equity:7.5,bonds:3.5,cash:1.5},
  stdDev:12, inflation:2.5,
};

const DEFAULT_RET = {
  province:"Ontario", retirementAge:65, lifeExpectancy:90,
  cppMonthly:758, oasMonthly:713,
  rrifBalance:800000, tfsaBalance:200000, nonRegBalance:150000, nonRegACB:90000,
  desiredMonthlyIncome:6000, portfolioReturn:5.0,
  withdrawOrder:"optimal", customWithdrawals:{},
};

const GOAL_PRESETS=[
  {label:"Retirement",target:2500000,horizon:20,equity:60,bonds:30,cash:10},
  {label:"Education Fund",target:200000,horizon:12,equity:50,bonds:40,cash:10},
  {label:"Home Purchase",target:150000,horizon:5,equity:30,bonds:50,cash:20},
  {label:"Emergency Fund",target:50000,horizon:3,equity:0,bonds:20,cash:80},
  {label:"Business Launch",target:300000,horizon:7,equity:40,bonds:40,cash:20},
  {label:"Wealth Legacy",target:5000000,horizon:25,equity:70,bonds:25,cash:5},
];

function MetricCard({label,value,sub,color,big}){
  return(<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.15)",borderRadius:12,padding:big?"18px 22px":"13px 16px",display:"flex",flexDirection:"column",gap:3}}>
    <span style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8899aa"}}>{label}</span>
    <span style={{fontSize:big?26:18,fontFamily:"'DM Serif Display',serif",color:color||"#D4AF37",fontWeight:400,lineHeight:1.2}}>{value}</span>
    {sub&&<span style={{fontSize:10,color:"#667788"}}>{sub}</span>}
  </div>)
}

function SliderRow({label,value,min,max,step,onChange,format,hint}){
  return(<div style={{marginBottom:15}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
      <label style={{fontSize:11,color:"#8899aa"}}>{label}</label>
      <span style={{fontSize:12,color:"#D4AF37",fontFamily:"'DM Serif Display',serif"}}>{format?format(value):value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",accentColor:"#D4AF37",cursor:"pointer"}}/>
    {hint&&<div style={{fontSize:10,color:"#4a5568",marginTop:2}}>{hint}</div>}
  </div>)
}

function AllocationBar({alloc}){
  const t=alloc.equity+alloc.bonds+alloc.cash;
  return(<div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",marginBottom:8}}>
    <div style={{width:`${(alloc.equity/t)*100}%`,background:"#D4AF37"}}/>
    <div style={{width:`${(alloc.bonds/t)*100}%`,background:"#4a90d9"}}/>
    <div style={{width:`${(alloc.cash/t)*100}%`,background:"#34d399"}}/>
  </div>)
}

function SuccessGauge({rate}){
  const color=successColor(rate);const angle=-135+(rate/100)*270;
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
    <svg width={150} height={92} viewBox="0 0 160 100">
      <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round"/>
      <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(rate/100)*188} 188`}/>
      <g transform={`rotate(${angle}, 80, 90)`}><line x1={80} y1={90} x2={80} y2={38} stroke="white" strokeWidth={2} strokeLinecap="round"/><circle cx={80} cy={90} r={5} fill={color}/></g>
      <text x={80} y={82} textAnchor="middle" fill={color} fontSize={22} fontFamily="'DM Serif Display',serif">{rate.toFixed(0)}%</text>
    </svg>
    <span style={{fontSize:10,color:"#8899aa",letterSpacing:"0.1em"}}>PROBABILITY OF SUCCESS</span>
  </div>)
}

const CT = ({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(<div style={{background:"#0f172a",border:"1px solid #D4AF37",borderRadius:8,padding:"9px 13px",fontSize:11}}>
    <div style={{color:"#D4AF37",marginBottom:5,fontWeight:600}}>Year {label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}
  </div>)
};

const RT = ({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(<div style={{background:"#0f172a",border:"1px solid rgba(212,175,55,0.4)",borderRadius:8,padding:"9px 13px",fontSize:11}}>
    <div style={{color:"#D4AF37",marginBottom:5}}>Age {label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||"#cbd5e1",marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}
  </div>)
};

const SH = ({title,sub})=>(
  <div style={{marginBottom:18}}>
    <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#e2e8f0"}}>{title}</div>
    {sub&&<div style={{fontSize:11,color:"#4a5568",marginTop:3}}>{sub}</div>}
  </div>
);

export default function App() {
  const saved = loadAll();
  const [s, setS] = useState(saved.plan || DEFAULT_PLAN);
  const [r, setR] = useState(saved.ret  || DEFAULT_RET);
  const [results, setResults] = useState(null);
  const [projData, setProjData] = useState([]);
  const [tab, setTab] = useState("plan");
  const [scenarios, setScenarios] = useState(loadScenarios());
  const [saveName, setSaveName] = useState("");
  const [running, setRunning] = useState(false);
  const [activeScenario, setActiveScenario] = useState(null);

  useEffect(() => { saveAll({ plan:s, ret:r }); }, [s, r]);

  const blendedReturn = (s.allocation.equity*s.assetReturns.equity + s.allocation.bonds*s.assetReturns.bonds + s.allocation.cash*s.assetReturns.cash) / (s.allocation.equity+s.allocation.bonds+s.allocation.cash) / 100;
  const timeHorizon = Math.max(1, s.targetAge - s.currentAge);
  const annualContribution = s.monthlyContribution * 12;

  const wPlan  = useMemo(() => buildWithdrawalPlan(r), [r]);
  const estate = useMemo(() => calcEstate(r), [r]);

  const retTaxSummary = useMemo(() => {
    const cppA = r.cppMonthly * 12;
    const oasA = r.oasMonthly * 12;
    const rrifMinA = r.rrifBalance * getRRIFRate(r.retirementAge);
    const oasNet = oasAfterClawback(cppA + oasA + rrifMinA, oasA);
    const oasClawback = oasA - oasNet;
    const taxable = cppA + oasNet + rrifMinA;
    const tax = calcTax(taxable, r.province);
    const desired = r.desiredMonthlyIncome * 12;
    return { cppA, oasA, oasNet, oasClawback, rrifMinA, taxable, tax, desired, gap: Math.max(0, desired - (cppA + oasNet)) };
  }, [r]);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runMonteCarlo({currentValue:s.currentValue,annualContribution,timeHorizon,blendedReturn,stdDev:s.stdDev/100,inflation:s.inflation/100,targetAmount:s.targetAmount});
      setResults(res);
      setProjData(buildProjectionData({currentValue:s.currentValue,annualContribution,timeHorizon,blendedReturn,stdDev:s.stdDev/100,inflation:s.inflation/100}));
      setRunning(false);
      setTab("results");
    }, 80);
  }, [s, blendedReturn, timeHorizon, annualContribution]);

  const upd       = k => v => setS(p=>({...p,[k]:v}));
  const updAlloc  = k => v => setS(p=>({...p,allocation:{...p.allocation,[k]:v}}));
  const updReturn = k => v => setS(p=>({...p,assetReturns:{...p.assetReturns,[k]:v}}));
  const updR      = k => v => setR(p=>({...p,[k]:v}));

  const applyPreset = (preset) => { setS(p=>({...p,goalName:preset.label,targetAmount:preset.target,targetAge:p.currentAge+preset.horizon,allocation:{equity:preset.equity,bonds:preset.bonds,cash:preset.cash}})); setResults(null); };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const sc = { id:Date.now(), name:saveName.trim(), date:new Date().toLocaleDateString("en-CA"), plan:{...s}, ret:{...r}, results: results?{successRate:results.successRate,p50:results.p50,p10:results.p10,p90:results.p90}:null };
    const updated = [sc, ...scenarios].slice(0, 20);
    setScenarios(updated); saveScenarios(updated); setSaveName("");
  };

  const deleteScenario = id => { const u=scenarios.filter(sc=>sc.id!==id); setScenarios(u); saveScenarios(u); };
  const loadScenario = sc => { setS(sc.plan); setR(sc.ret||DEFAULT_RET); setResults(null); setProjData([]); setActiveScenario(sc.id); setTab("plan"); };

  const exportCSV = () => {
    const rows = [
      ["MKA Financial — Complete Retirement Plan"],
      ["Generated", new Date().toLocaleDateString("en-CA")],
      ["Province", r.province],
      [],
      ["=== ACCUMULATION PLAN ==="],
      ["Goal", s.goalName],["Target Amount", s.targetAmount],["Time Horizon (years)", timeHorizon],
      ["Current Portfolio", s.currentValue],["Monthly Contribution", s.monthlyContribution],
      ["Blended Return (nominal)", `${(blendedReturn*100).toFixed(2)}%`],
      ["Inflation Assumption", `${s.inflation}%`],
      ...(results ? [
        [],["=== MONTE CARLO RESULTS ==="],
        ["Probability of Success", `${results.successRate.toFixed(1)}%`],
        ["Median Outcome (P50)", results.p50.toFixed(0)],
        ["Pessimistic (P10)", results.p10.toFixed(0)],
        ["Optimistic (P90)", results.p90.toFixed(0)],
        [],["=== PROJECTION DATA ==="],
        ["Year","P10","P25","P50","P75","P90"],
        ...projData.map(d=>[d.year,d.p10.toFixed(0),d.p25.toFixed(0),d.p50.toFixed(0),d.p75.toFixed(0),d.p90.toFixed(0)]),
      ] : []),
      [],
      ["=== RETIREMENT INCOME ==="],
      ["CPP Annual", (r.cppMonthly*12).toFixed(0)],
      ["OAS Annual (Gross)", (r.oasMonthly*12).toFixed(0)],
      ["OAS Clawback", retTaxSummary.oasClawback.toFixed(0)],
      ["OAS Net", retTaxSummary.oasNet.toFixed(0)],
      ["RRIF Minimum", retTaxSummary.rrifMinA.toFixed(0)],
      ["Effective Tax Rate", fmtPct(retTaxSummary.tax.effective)],
      ["Net Annual Income", retTaxSummary.tax.netIncome.toFixed(0)],
      [],
      ["=== WITHDRAWAL PLAN ==="],
      ["Age","RRIF Bal","TFSA Bal","Non-Reg Bal","Total Bal","CPP","OAS Net","RRIF W/D","TFSA W/D","Non-Reg W/D","Taxable Inc","Tax","Eff Rate %","Net Income"],
      ...wPlan.map(y=>[y.age,y.rrifBal.toFixed(0),y.tfsaBal.toFixed(0),y.nonRegBal.toFixed(0),y.totalBal.toFixed(0),y.cpp.toFixed(0),y.oasNet.toFixed(0),y.rrifW.toFixed(0),y.tfsaW.toFixed(0),y.nonRegW.toFixed(0),y.taxableIncome.toFixed(0),y.tax.toFixed(0),(y.effectiveRate*100).toFixed(1),y.netIncome.toFixed(0)]),
      [],
      ["=== TAX AT DEATH — "+r.province+" ==="],
      ["Account","Gross Value","Tax Payable","Net to Heirs"],
      ["RRSP/RRIF",estate.rrifGross.toFixed(0),estate.rrifTax.toFixed(0),estate.rrifNet.toFixed(0)],
      ["TFSA",estate.tfsaGross.toFixed(0),0,estate.tfsaNet.toFixed(0)],
      ["Non-Registered",estate.nonRegGross.toFixed(0),estate.nonRegTax.toFixed(0),estate.nonRegNet.toFixed(0)],
      ["TOTAL ESTATE",estate.totalGross.toFixed(0),estate.totalTax.toFixed(0),estate.totalNet.toFixed(0)],
    ];
    const blob = new Blob([rows.map(rw=>rw.join(",")).join("\n")],{type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`MKA_Plan_${r.province}_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const surplus   = results ? Math.max(0,results.p50-s.targetAmount) : null;
  const shortfall = results ? Math.max(0,s.targetAmount-results.p50) : null;
  const swr = results ? (results.p50*0.04)/12 : null;

  const panel = {background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.12)",borderRadius:16,padding:"20px"};

  const TABS = [
    {id:"plan",    label:"⚙ Plan"},
    {id:"results", label:"📈 Results"},
    {id:"income",  label:"💰 Income"},
    {id:"withdraw",label:"📤 Withdraw"},
    {id:"estate",  label:"🏛 Estate"},
    {id:"scenarios",label:`📁 Saved (${scenarios.length})`},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#060d1a",fontFamily:"'Figtree',sans-serif",color:"#cbd5e1"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Figtree:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input[type=range]{-webkit-appearance:none;height:4px;background:#1e293b;border-radius:2px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#D4AF37;cursor:pointer;box-shadow:0 0 8px rgba(212,175,55,0.4)}
        input[type=text],input[type=number],select{background:rgba(255,255,255,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:8px;color:#e2e8f0;padding:7px 11px;width:100%;font-size:12px;outline:none;font-family:inherit}
        input[type=text]:focus,input[type=number]:focus,select:focus{border-color:rgba(212,175,55,0.6)}
        select option{background:#0f172a;color:#e2e8f0}
        button{cursor:pointer;font-family:inherit}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#D4AF37;border-radius:2px}
        .tab-btn{padding:6px 14px;border:none;border-radius:8px;font-size:11px;font-weight:500;letter-spacing:0.03em;transition:all 0.2s;white-space:nowrap}
        .tab-btn.active{background:#D4AF37;color:#060d1a}
        .tab-btn:not(.active){background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2)}
        .tab-btn:not(.active):hover{border-color:#D4AF37;color:#D4AF37}
        .btn-gold{background:linear-gradient(135deg,#D4AF37,#f0d060);color:#060d1a;border:none;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:600;letter-spacing:0.04em;transition:all 0.2s;white-space:nowrap}
        .btn-gold:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(212,175,55,0.35)}
        .btn-ghost{background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:7px 14px;font-size:11px;transition:all 0.2s;white-space:nowrap}
        .btn-ghost:hover{border-color:#D4AF37;color:#D4AF37}
        .preset-chip{padding:5px 11px;border:1px solid rgba(212,175,55,0.2);border-radius:20px;background:transparent;color:#8899aa;font-size:11px;transition:all 0.2s}
        .preset-chip:hover{border-color:#D4AF37;color:#D4AF37;background:rgba(212,175,55,0.05)}
        .tbl{width:100%;border-collapse:collapse;font-size:11px}
        .tbl th{text-align:left;padding:7px 9px;color:#8899aa;letter-spacing:0.07em;text-transform:uppercase;font-weight:500;border-bottom:1px solid rgba(212,175,55,0.15);font-size:9px;white-space:nowrap}
        .tbl td{padding:6px 9px;border-bottom:1px solid rgba(255,255,255,0.04);color:#cbd5e1;white-space:nowrap}
        .tbl tr:hover td{background:rgba(212,175,55,0.03)}
        .warn{padding:10px 13px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:11px;color:#f59e0b;line-height:1.6}
        .tip{padding:10px 13px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:8px;font-size:11px;color:#34d399;line-height:1.6}
        @media print{.no-print{display:none!important}}
      `}</style>

      <div style={{borderBottom:"1px solid rgba(212,175,55,0.12)",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}} className="no-print">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <svg width={28} height={28} viewBox="0 0 32 32">
            <polygon points="16,2 28,8 28,24 16,30 4,24 4,8" fill="none" stroke="#D4AF37" strokeWidth={1.5}/>
            <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="rgba(212,175,55,0.12)" stroke="#D4AF37" strokeWidth={0.8}/>
            <line x1={16} y1={7} x2={16} y2={25} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
            <line x1={9} y1={11} x2={23} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
            <line x1={23} y1={11} x2={9} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
          </svg>
          <div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"#D4AF37"}}>MKA Financial</div>
            <div style={{fontSize:8,letterSpacing:"0.15em",color:"#4a5568",textTransform:"uppercase"}}>Financial Planning Suite</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {TABS.map(t=><button key={t.id} className={`tab-btn ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        </div>
        <div style={{display:"flex",gap:7}} className="no-print">
          <button className="btn-ghost" onClick={exportCSV}>⬇ Excel</button>
          <button className="btn-ghost" onClick={()=>window.print()}>🖨 PDF</button>
        </div>
      </div>

      <div style={{padding:"20px 24px",maxWidth:1440,margin:"0 auto"}}>

        {tab==="plan"&&(
          <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={panel}>
                <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:11}}>Goal Presets</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{GOAL_PRESETS.map(p=><button key={p.label} className="preset-chip" onClick={()=>applyPreset(p)}>{p.label}</button>)}</div>
                <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Custom Goal Name</label>
                <input type="text" value={s.goalName} onChange={e=>setS(p=>({...p,goalName:e.target.value}))} placeholder="e.g. Early Retirement"/>
              </div>
              <div style={panel}>
                <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Client Profile</div>
                <SliderRow label="Current Age" value={s.currentAge} min={18} max={80} step={1} onChange={upd("currentAge")} format={v=>`${v} yrs`}/>
                <SliderRow label="Target Age" value={s.targetAge} min={s.currentAge+1} max={100} step={1} onChange={upd("targetAge")} format={v=>`${v} yrs`} hint={`Time Horizon: ${timeHorizon} yrs`}/>
                <SliderRow label="Current Portfolio" value={s.currentValue} min={0} max={5000000} step={5000} onChange={upd("currentValue")} format={v=>fmt(v)}/>
                <SliderRow label="Monthly Contribution" value={s.monthlyContribution} min={0} max={20000} step={100} onChange={upd("monthlyContribution")} format={v=>fmt(v)}/>
                <SliderRow label="Target Amount" value={s.targetAmount} min={50000} max={10000000} step={25000} onChange={upd("targetAmount")} format={v=>fmt(v)}/>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={panel}>
                <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Asset Allocation & Assumed Returns</div>
                <AllocationBar alloc={s.allocation}/>
                <div style={{display:"flex",gap:12,fontSize:10,color:"#4a5568",marginBottom:16}}>
                  <span style={{color:"#D4AF37"}}>● Equity {s.allocation.equity}%</span>
                  <span style={{color:"#4a90d9"}}>● Bonds {s.allocation.bonds}%</span>
                  <span style={{color:"#34d399"}}>● Cash {s.allocation.cash}%</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                  {[{key:"equity",label:"Equity",color:"#D4AF37"},{key:"bonds",label:"Fixed Income",color:"#4a90d9"},{key:"cash",label:"Cash/Equiv.",color:"#34d399"}].map(({key,label,color})=>(
                    <div key={key}>
                      <div style={{fontSize:11,color,marginBottom:8,fontWeight:500}}>{label}</div>
                      <SliderRow label="Allocation %" value={s.allocation[key]} min={0} max={100} step={5} onChange={updAlloc(key)} format={v=>`${v}%`}/>
                      <SliderRow label="Expected Return" value={s.assetReturns[key]} min={0} max={20} step={0.25} onChange={updReturn(key)} format={v=>`${v.toFixed(2)}%`}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:6,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Blended Return (Nominal)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#D4AF37"}}>{(blendedReturn*100).toFixed(2)}%</div></div>
                  <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Real Return (Inflation-Adj.)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#34d399"}}>{((blendedReturn-s.inflation/100)*100).toFixed(2)}%</div></div>
                </div>
              </div>
              <div style={panel}>
                <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Risk & Macro Parameters</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  <SliderRow label="Portfolio Volatility (Std Dev)" value={s.stdDev} min={2} max={30} step={0.5} onChange={upd("stdDev")} format={v=>`${v.toFixed(1)}%`} hint="Annual standard deviation"/>
                  <SliderRow label="Inflation Rate" value={s.inflation} min={0} max={10} step={0.25} onChange={upd("inflation")} format={v=>`${v.toFixed(2)}%`} hint="Long-term CPI assumption"/>
                </div>
              </div>
              <button className="btn-gold" style={{alignSelf:"flex-end",minWidth:220}} onClick={runSimulation} disabled={running}>{running?"Running 1,200 Simulations…":"▶  Run Monte Carlo Simulation"}</button>
            </div>
          </div>
        )}

        {tab==="results"&&(
          <div>{!results?(
            <div style={{textAlign:"center",padding:"80px 0",color:"#4a5568"}}>
              <div style={{fontSize:44,marginBottom:14}}>📊</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"#8899aa"}}>No simulation run yet</div>
              <button className="btn-gold" style={{marginTop:22}} onClick={()=>setTab("plan")}>Go to Plan →</button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:18}}>
              <div style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr 1fr 1fr",gap:12,alignItems:"stretch"}}>
                <div style={{...panel,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><SuccessGauge rate={results.successRate}/></div>
                <MetricCard label="Median (P50)" value={fmt(results.p50)} sub={`Target: ${fmt(s.targetAmount)}`} color={results.p50>=s.targetAmount?"#22c55e":"#ef4444"} big/>
                <MetricCard label="Optimistic (P90)" value={fmt(results.p90)} sub="Top 10% of outcomes" color="#D4AF37" big/>
                <MetricCard label="Pessimistic (P10)" value={fmt(results.p10)} sub="Bottom 10% of outcomes" color="#ef4444" big/>
                <MetricCard label={surplus>0?"Surplus":"Shortfall"} value={fmt(surplus>0?surplus:shortfall)} sub={surplus>0?"Above target (median)":"Below target (median)"} color={surplus>0?"#22c55e":"#ef4444"} big/>
              </div>
              <div style={panel}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"#e2e8f0",marginBottom:14}}>{s.goalName} — Portfolio Projection · Inflation-Adjusted</div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={projData} margin={{top:8,right:18,left:8,bottom:0}}>
                    <defs>
                      <linearGradient id="g90" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.15}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0.01}/></linearGradient>
                      <linearGradient id="g50" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a90d9" stopOpacity={0.2}/><stop offset="100%" stopColor="#4a90d9" stopOpacity={0.01}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                    <XAxis dataKey="year" stroke="#334155" tick={{fill:"#4a5568",fontSize:10}}/>
                    <YAxis stroke="#334155" tick={{fill:"#4a5568",fontSize:10}} tickFormatter={v=>fmt(v)} width={65}/>
                    <Tooltip content={<CT/>}/>
                    <Area type="monotone" dataKey="p90" name="P90 (Optimistic)" stroke="#D4AF37" fill="url(#g90)" strokeWidth={1.5} dot={false}/>
                    <Area type="monotone" dataKey="p50" name="P50 (Median)" stroke="#4a90d9" fill="url(#g50)" strokeWidth={2} dot={false}/>
                    <Area type="monotone" dataKey="p25" name="P25" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="4 4" dot={false}/>
                    <Area type="monotone" dataKey="p10" name="P10 (Pessimistic)" stroke="#ef4444" fill="none" strokeWidth={1.5} dot={false}/>
                    <ReferenceLine y={s.targetAmount} stroke="#22c55e" strokeDasharray="6 4" label={{value:`Target ${fmt(s.targetAmount)}`,position:"right",fill:"#22c55e",fontSize:10}}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                <MetricCard label="Monthly Income (4% Rule)" value={swr?fmt(swr):"—"} sub="Safe withdrawal estimate"/>
                <MetricCard label="Annual Income (4%)" value={results.p50?fmt(results.p50*0.04):"—"} sub="Sustainable withdrawal"/>
                <MetricCard label="Total Contributions" value={fmt(s.currentValue+annualContribution*timeHorizon)} sub={`$${(annualContribution/1000).toFixed(0)}K/yr × ${timeHorizon} yrs`} color="#cbd5e1"/>
                <MetricCard label="Blended Return" value={`${(blendedReturn*100).toFixed(2)}%`} sub={`Real: ${((blendedReturn-s.inflation/100)*100).toFixed(2)}%`}/>
                <MetricCard label="Inflation Impact" value={`${((1-Math.pow(1/(1+s.inflation/100),timeHorizon))*100).toFixed(0)}%`} sub="Purchasing power eroded" color="#f59e0b"/>
                <MetricCard label="Required Return" value={`${((Math.pow(s.targetAmount/Math.max(1,s.currentValue),1/timeHorizon)-1)*100).toFixed(2)}%`} sub="To reach target (no contributions)" color="#94a3b8"/>
                <MetricCard label="Best (P99)" value={fmt(results.best)} sub="1% most optimistic" color="#34d399"/>
                <MetricCard label="Worst (P1)" value={fmt(results.worst)} sub="1% most pessimistic" color="#ef4444"/>
              </div>
              <div style={{...panel,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}} className="no-print">
                <span style={{fontSize:12,color:"#8899aa",whiteSpace:"nowrap"}}>Save scenario:</span>
                <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="e.g. Base Case 2025" style={{flex:1,minWidth:160}}/>
                <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save</button>
              </div>
            </div>
          )}</div>
        )}

        {tab==="income"&&(
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title="Retirement Income Calculator" sub="Model income sources, government benefits, taxes, and net cash flow at retirement"/>
            <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Province & Profile</div>
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Province of Residence</label>
                    <select value={r.province} onChange={e=>updR("province")(e.target.value)}>
                      {Object.keys(PROV).map(p=><option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <SliderRow label="Retirement Age" value={r.retirementAge} min={55} max={75} step={1} onChange={updR("retirementAge")} format={v=>`${v} yrs`}/>
                  <SliderRow label="Life Expectancy" value={r.lifeExpectancy} min={70} max={100} step={1} onChange={updR("lifeExpectancy")} format={v=>`${v} yrs`}/>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Government Benefits</div>
                  <SliderRow label="CPP Monthly (at 65)" value={r.cppMonthly} min={0} max={1365} step={10} onChange={updR("cppMonthly")} format={v=>fmt(v)} hint="Max: $1,365 · Average: $758/mo"/>
                  <SliderRow label="OAS Monthly (at 65)" value={r.oasMonthly} min={0} max={800} step={5} onChange={updR("oasMonthly")} format={v=>fmt(v)} hint="2024: $713/mo · Clawback > $90,997"/>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Income Target</div>
                  <SliderRow label="Desired Monthly Income" value={r.desiredMonthlyIncome} min={1000} max={20000} step={100} onChange={updR("desiredMonthlyIncome")} format={v=>fmt(v)}/>
                  <SliderRow label="Portfolio Return in Retirement" value={r.portfolioReturn} min={0} max={12} step={0.25} onChange={updR("portfolioReturn")} format={v=>`${v.toFixed(2)}%`}/>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  <MetricCard label="CPP Annual" value={fmt(retTaxSummary.cppA)} sub={fmt(r.cppMonthly)+"/month"} color="#D4AF37"/>
                  <MetricCard label="OAS Annual (Net)" value={fmt(retTaxSummary.oasNet)} sub={retTaxSummary.oasClawback>0?`⚠ Clawback: ${fmt(retTaxSummary.oasClawback)}`:"No clawback"} color={retTaxSummary.oasClawback>0?"#f59e0b":"#34d399"}/>
                  <MetricCard label="RRIF Minimum" value={fmt(retTaxSummary.rrifMinA)} sub={`Age ${r.retirementAge} · ${(getRRIFRate(r.retirementAge)*100).toFixed(2)}% rate`} color="#4a90d9"/>
                  <MetricCard label="Effective Tax Rate" value={fmtPct(retTaxSummary.tax.effective)} sub={`Marginal: ${fmtPct(retTaxSummary.tax.marginal)}`} color="#f59e0b"/>
                  <MetricCard label="Annual Tax Payable" value={fmt(retTaxSummary.tax.total)} sub={`Fed: ${fmt(retTaxSummary.tax.fedTax)} · Prov: ${fmt(retTaxSummary.tax.provTax)}`} color="#ef4444"/>
                  <MetricCard label="Net Annual Income" value={fmt(retTaxSummary.tax.netIncome)} sub={fmt(retTaxSummary.tax.netIncome/12)+"/month after tax"} color="#22c55e"/>
                </div>
                <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.25)"}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Income Gap Analysis at Age {r.retirementAge}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    <MetricCard label="Desired Income" value={fmt(retTaxSummary.desired)} sub={fmt(r.desiredMonthlyIncome)+"/mo"} color="#e2e8f0"/>
                    <MetricCard label="Guaranteed (CPP+OAS)" value={fmt(retTaxSummary.cppA+retTaxSummary.oasNet)} sub="Before tax" color="#34d399"/>
                    <MetricCard label="Gap to Fill" value={fmt(retTaxSummary.gap)} sub="From investment accounts" color={retTaxSummary.gap>0?"#f59e0b":"#22c55e"}/>
                  </div>
                  {retTaxSummary.oasClawback>0&&<div className="warn">⚠ OAS Clawback: Estimated income of {fmt(retTaxSummary.taxable)} exceeds the $90,997 threshold. You will lose {fmt(retTaxSummary.oasClawback)}/yr of OAS. Consider RRSP meltdown strategies before age 71 or deferring OAS to age 70.</div>}
                  {retTaxSummary.oasClawback===0&&<div className="tip">✓ No OAS clawback at this income level. Your estimated taxable income of {fmt(retTaxSummary.taxable)} is below the $90,997 threshold.</div>}
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Province Comparison at {fmt(retTaxSummary.desired)} Annual Income</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
                    {Object.keys(PROV).map(pName=>{
                      const t=calcTax(retTaxSummary.desired,pName);
                      const isSel=pName===r.province;
                      return(<div key={pName} onClick={()=>updR("province")(pName)} style={{padding:"10px 7px",borderRadius:9,border:`1px solid ${isSel?"#D4AF37":"rgba(212,175,55,0.12)"}`,background:isSel?"rgba(212,175,55,0.08)":"transparent",cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{pName.split(" ")[0]}</div>
                        <div style={{fontSize:13,fontFamily:"'DM Serif Display',serif",color:isSel?"#D4AF37":"#94a3b8"}}>{fmtPct(t.effective)}</div>
                        <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{fmt(t.total)} tax</div>
                      </div>)
                    })}
                  </div>
                  <div style={{fontSize:10,color:"#4a5568",marginTop:10}}>Click a province to switch · Rates are 2024 combined federal + provincial</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="withdraw"&&(
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title="Withdrawal Strategy Optimizer" sub="Tax-efficient decumulation plan factoring CPP, OAS clawback, RRIF minimums, and account location"/>
            <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Account Balances at Retirement</div>
                  <SliderRow label="RRSP / RRIF Balance" value={r.rrifBalance} min={0} max={5000000} step={10000} onChange={updR("rrifBalance")} format={v=>fmt(v)}/>
                  <SliderRow label="TFSA Balance" value={r.tfsaBalance} min={0} max={2000000} step={5000} onChange={updR("tfsaBalance")} format={v=>fmt(v)}/>
                  <SliderRow label="Non-Reg Balance" value={r.nonRegBalance} min={0} max={3000000} step={5000} onChange={updR("nonRegBalance")} format={v=>fmt(v)}/>
                  <SliderRow label="Non-Reg Cost Base (ACB)" value={r.nonRegACB} min={0} max={Math.max(r.nonRegBalance,r.nonRegACB)} step={5000} onChange={updR("nonRegACB")} format={v=>fmt(v)} hint={`Accrued gain: ${fmt(Math.max(0,r.nonRegBalance-r.nonRegACB))}`}/>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Withdrawal Strategy</div>
                  <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Withdrawal Order</label>
                  <select value={r.withdrawOrder} onChange={e=>updR("withdrawOrder")(e.target.value)} style={{marginBottom:12}}>
                    <option value="optimal">Optimal (Tax-Minimizing)</option>
                    <option value="rrif-first">RRIF/RRSP First</option>
                    <option value="tfsa-first">TFSA First</option>
                    <option value="nonreg-first">Non-Registered First</option>
                  </select>
                  <div style={{fontSize:10,color:"#8899aa",lineHeight:1.7,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:7}}>
                    {r.withdrawOrder==="optimal"&&"Draws RRIF minimum + partial top-up, then Non-Reg (capital gains advantage), then TFSA. Preserves TFSA as long-term tax shelter."}
                    {r.withdrawOrder==="rrif-first"&&"Maximizes RRIF first to reduce future estate tax on registered accounts. Best for large RRIF balances with no spouse rollover."}
                    {r.withdrawOrder==="tfsa-first"&&"Draws TFSA before other accounts. Generally not tax-optimal but useful in specific estate planning contexts."}
                    {r.withdrawOrder==="nonreg-first"&&"Draws Non-Reg first to realize capital gains early at lower rates. Effective when non-reg gains are large."}
                  </div>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:10}}>Custom Annual Overrides</div>
                  <div style={{fontSize:10,color:"#4a5568",marginBottom:10}}>Set specific withdrawal amounts by age (overrides strategy)</div>
                  {[r.retirementAge, r.retirementAge+5, r.retirementAge+10, r.retirementAge+15].filter(a=>a<=r.lifeExpectancy).map(age=>{
                    const cust=r.customWithdrawals?.[age]||{};
                    return(<div key={age} style={{marginBottom:11,paddingBottom:11,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <div style={{fontSize:11,color:"#D4AF37",marginBottom:6,fontWeight:500}}>Age {age}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                        {[["rrif","RRIF"],["tfsa","TFSA"],["nonReg","Non-Reg"]].map(([k,lbl])=>(
                          <div key={k}>
                            <div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{lbl}</div>
                            <input type="number" placeholder="0" value={cust[k]||""} onChange={e=>{const v=Number(e.target.value)||0;setR(p=>({...p,customWithdrawals:{...p.customWithdrawals,[age]:{...cust,[k]:v}}}))}} style={{padding:"4px 7px",fontSize:10}}/>
                          </div>
                        ))}
                      </div>
                    </div>)
                  })}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <MetricCard label="Retirement Years" value={`${r.lifeExpectancy-r.retirementAge} yrs`} sub={`Age ${r.retirementAge}–${r.lifeExpectancy}`}/>
                  <MetricCard label="Avg Effective Tax Rate" value={fmtPct(wPlan.reduce((s,y)=>s+y.effectiveRate,0)/Math.max(1,wPlan.length))} sub="Over retirement" color="#f59e0b"/>
                  <MetricCard label="Total Tax in Retirement" value={fmt(wPlan.reduce((s,y)=>s+y.tax,0))} sub="Lifetime tax payable" color="#ef4444"/>
                  <MetricCard label="Remaining Estate" value={fmt(wPlan[wPlan.length-1]?.totalBal||0)} sub={`At age ${r.lifeExpectancy}`} color="#22c55e"/>
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Portfolio Balance by Account Type</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={wPlan} margin={{top:5,right:15,left:5,bottom:0}}>
                      <defs>
                        <linearGradient id="gRR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.3}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0}/></linearGradient>
                        <linearGradient id="gTF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.3}/><stop offset="100%" stopColor="#34d399" stopOpacity={0}/></linearGradient>
                        <linearGradient id="gNR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a90d9" stopOpacity={0.3}/><stop offset="100%" stopColor="#4a90d9" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                      <XAxis dataKey="age" stroke="#334155" tick={{fill:"#4a5568",fontSize:10}}/>
                      <YAxis stroke="#334155" tick={{fill:"#4a5568",fontSize:10}} tickFormatter={v=>fmt(v)} width={60}/>
                      <Tooltip content={<RT/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#8899aa"}}/>
                      <Area type="monotone" dataKey="rrifBal" name="RRIF/RRSP" stroke="#D4AF37" fill="url(#gRR)" strokeWidth={1.5} dot={false}/>
                      <Area type="monotone" dataKey="tfsaBal" name="TFSA" stroke="#34d399" fill="url(#gTF)" strokeWidth={1.5} dot={false}/>
                      <Area type="monotone" dataKey="nonRegBal" name="Non-Reg" stroke="#4a90d9" fill="url(#gNR)" strokeWidth={1.5} dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Year-by-Year Withdrawal Plan</div>
                  <div style={{overflowX:"auto",maxHeight:300,overflowY:"auto"}}>
                    <table className="tbl">
                      <thead><tr>
                        <th>Age</th><th>RRIF Bal</th><th>TFSA Bal</th><th>Non-Reg</th><th>CPP</th><th>OAS</th>
                        <th>RRIF W/D</th><th>TFSA W/D</th><th>NR W/D</th><th>Taxable</th><th>Tax</th><th>Eff%</th><th>Net Income</th>
                      </tr></thead>
                      <tbody>{wPlan.map(y=>(
                        <tr key={y.age}>
                          <td style={{color:"#D4AF37",fontWeight:500}}>{y.age}</td>
                          <td>{fmt(y.rrifBal)}</td>
                          <td style={{color:"#34d399"}}>{fmt(y.tfsaBal)}</td>
                          <td style={{color:"#4a90d9"}}>{fmt(y.nonRegBal)}</td>
                          <td>{fmt(y.cpp)}</td>
                          <td>{fmt(y.oasNet)}</td>
                          <td>{fmt(y.rrifW)}</td>
                          <td style={{color:"#34d399"}}>{fmt(y.tfsaW)}</td>
                          <td style={{color:"#4a90d9"}}>{fmt(y.nonRegW)}</td>
                          <td>{fmt(y.taxableIncome)}</td>
                          <td style={{color:"#ef4444"}}>{fmt(y.tax)}</td>
                          <td style={{color:y.effectiveRate>0.35?"#ef4444":y.effectiveRate>0.25?"#f59e0b":"#22c55e"}}>{fmtPct(y.effectiveRate)}</td>
                          <td style={{color:"#22c55e",fontWeight:500}}>{fmt(y.netIncome)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="estate"&&(
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title={`Tax at Death & Estate Analysis — ${r.province}`} sub="Estimated tax liability on each account type based on deemed disposition rules"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
              <div style={{...panel,borderColor:"rgba(212,175,55,0.35)"}}>
                <div style={{fontSize:10,letterSpacing:"0.1em",color:"#D4AF37",textTransform:"uppercase",marginBottom:10}}>RRSP / RRIF</div>
                <div style={{fontSize:11,color:"#4a5568",lineHeight:1.7,marginBottom:14}}>Entire balance is deemed received as income in the year of death — fully taxable at the highest marginal rate. Rolls tax-free to a surviving spouse's RRSP/RRIF.</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Gross Value</span><span style={{color:"#e2e8f0",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.rrifGross)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Effective Tax Rate</span><span style={{color:"#f59e0b"}}>{fmtPct(estate.rrifRate)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax Payable</span><span style={{color:"#ef4444",fontFamily:"'DM Serif Display',serif"}}>-{fmt(estate.rrifTax)}</span></div>
                  <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"4px 0"}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#8899aa"}}>Net to Heirs</span><span style={{fontSize:20,color:"#D4AF37",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.rrifNet)}</span></div>
                </div>
              </div>
              <div style={{...panel,borderColor:"rgba(52,211,153,0.35)"}}>
                <div style={{fontSize:10,letterSpacing:"0.1em",color:"#34d399",textTransform:"uppercase",marginBottom:10}}>TFSA</div>
                <div style={{fontSize:11,color:"#4a5568",lineHeight:1.7,marginBottom:14}}>Passes to a successor holder (spouse) or designated beneficiary entirely tax-free. No deemed disposition. The most estate-efficient account in Canada.</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Gross Value</span><span style={{color:"#e2e8f0",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.tfsaGross)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax Rate</span><span style={{color:"#34d399"}}>0%</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax Payable</span><span style={{color:"#34d399"}}>$0</span></div>
                  <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"4px 0"}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#8899aa"}}>Net to Heirs</span><span style={{fontSize:20,color:"#34d399",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.tfsaNet)}</span></div>
                </div>
              </div>
              <div style={{...panel,borderColor:"rgba(74,144,217,0.35)"}}>
                <div style={{fontSize:10,letterSpacing:"0.1em",color:"#4a90d9",textTransform:"uppercase",marginBottom:10}}>Non-Registered</div>
                <div style={{fontSize:11,color:"#4a5568",lineHeight:1.7,marginBottom:14}}>Deemed disposition at fair market value. Only the accrued gain above ACB is taxable — at 50% inclusion rate. More tax-efficient than RRIF at death.</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Gross Value</span><span style={{color:"#e2e8f0",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.nonRegGross)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Accrued Gain</span><span style={{color:"#4a90d9"}}>{fmt(estate.nonRegGain)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax on Gain (50% incl.)</span><span style={{color:"#ef4444"}}>-{fmt(estate.nonRegTax)}</span></div>
                  <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"4px 0"}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#8899aa"}}>Net to Heirs</span><span style={{fontSize:20,color:"#4a90d9",fontFamily:"'DM Serif Display',serif"}}>{fmt(estate.nonRegNet)}</span></div>
                </div>
              </div>
            </div>
            <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.3)"}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"#e2e8f0",marginBottom:14}}>Total Estate Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
                <MetricCard label="Total Gross Estate" value={fmt(estate.totalGross)} sub="All accounts before tax" color="#e2e8f0" big/>
                <MetricCard label="Total Tax at Death" value={fmt(estate.totalTax)} sub={`${estate.totalGross>0?fmtPct(estate.totalTax/estate.totalGross):"—"} of gross estate`} color="#ef4444" big/>
                <MetricCard label="Net Estate to Heirs" value={fmt(estate.totalNet)} sub="After all taxes" color="#22c55e" big/>
                <MetricCard label="Tax Efficiency" value={estate.totalGross>0?fmtPct(estate.totalNet/estate.totalGross):"—"} sub="% of estate preserved" color="#D4AF37" big/>
              </div>
              {estate.totalGross>0&&<>
                <div style={{fontSize:10,color:"#8899aa",marginBottom:6}}>Estate composition</div>
                <div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",marginBottom:8}}>
                  <div style={{width:`${(estate.rrifNet/estate.totalGross)*100}%`,background:"#D4AF37"}}/>
                  <div style={{width:`${(estate.rrifTax/estate.totalGross)*100}%`,background:"rgba(239,68,68,0.7)"}}/>
                  <div style={{width:`${(estate.tfsaNet/estate.totalGross)*100}%`,background:"#34d399"}}/>
                  <div style={{width:`${(estate.nonRegNet/estate.totalGross)*100}%`,background:"#4a90d9"}}/>
                  <div style={{width:`${(estate.nonRegTax/estate.totalGross)*100}%`,background:"rgba(239,68,68,0.4)"}}/>
                </div>
                <div style={{display:"flex",gap:14,fontSize:10,color:"#4a5568",flexWrap:"wrap"}}>
                  <span style={{color:"#D4AF37"}}>■ RRIF Net</span><span style={{color:"rgba(239,68,68,0.8)"}}>■ RRIF Tax</span>
                  <span style={{color:"#34d399"}}>■ TFSA</span><span style={{color:"#4a90d9"}}>■ Non-Reg Net</span><span style={{color:"rgba(239,68,68,0.5)"}}>■ Non-Reg Tax</span>
                </div>
              </>}
            </div>
            <div style={panel}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>💡 Estate Optimization Strategies</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:11,color:"#94a3b8",lineHeight:1.7}}>
                {estate.rrifGross>200000&&<div style={{padding:"8px 12px",background:"rgba(212,175,55,0.05)",borderRadius:7,borderLeft:"2px solid #D4AF37"}}>• <strong style={{color:"#D4AF37"}}>RRSP Meltdown:</strong> Your RRIF balance of {fmt(estate.rrifGross)} will face a {fmtPct(estate.rrifRate)} effective tax rate at death. Consider strategic drawdowns before age 71 to fill lower tax brackets.</div>}
                {estate.tfsaGross<estate.totalGross*0.15&&<div style={{padding:"8px 12px",background:"rgba(52,211,153,0.05)",borderRadius:7,borderLeft:"2px solid #34d399"}}>• <strong style={{color:"#34d399"}}>Maximize TFSA:</strong> Your TFSA represents only {fmtPct(estate.tfsaGross/Math.max(estate.totalGross,1))} of your total estate. TFSA contributions ($7,000/yr in 2024) are the most estate-efficient dollars you can save.</div>}
                {estate.nonRegGain>50000&&<div style={{padding:"8px 12px",background:"rgba(74,144,217,0.05)",borderRadius:7,borderLeft:"2px solid #4a90d9"}}>• <strong style={{color:"#4a90d9"}}>Realize Gains Gradually:</strong> You have {fmt(estate.nonRegGain)} in accrued non-registered gains. Consider realizing gains systematically in low-income years.</div>}
                <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:7,borderLeft:"2px solid #475569"}}>• <strong style={{color:"#94a3b8"}}>Successor Holder:</strong> Name a successor holder (spouse) on your TFSA and RRIF to enable a tax-free rollover on death.</div>
                {estate.totalTax>100000&&<div style={{padding:"8px 12px",background:"rgba(239,68,68,0.05)",borderRadius:7,borderLeft:"2px solid #ef4444"}}>• <strong style={{color:"#ef4444"}}>Estate Insurance:</strong> Your estimated tax liability at death is {fmt(estate.totalTax)}. A life insurance policy is often the most cost-effective way to fund this liability.</div>}
              </div>
            </div>
          </div>
        )}

        {tab==="scenarios"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
              <SH title="Saved Plans" sub="Up to 20 complete plans saved in your browser"/>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Name this plan…" style={{width:220}}/>
                <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save Current Plan</button>
              </div>
            </div>
            {scenarios.length===0?(
              <div style={{...panel,textAlign:"center",padding:"60px 0",color:"#4a5568"}}>
                <div style={{fontSize:40,marginBottom:12}}>📁</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#667788"}}>No plans saved yet</div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14}}>
                {scenarios.map(sc=>{
                  const c=sc.results?successColor(sc.results.successRate):"#94a3b8";
                  return(<div key={sc.id} style={{...panel,borderColor:activeScenario===sc.id?"rgba(212,175,55,0.5)":"rgba(212,175,55,0.12)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div>
                        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:"#e2e8f0"}}>{sc.name}</div>
                        <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{sc.plan?.goalName||"Plan"} · {sc.ret?.province||""} · {sc.date}</div>
                      </div>
                      {sc.results&&<div style={{fontSize:15,fontFamily:"'DM Serif Display',serif",color:c}}>{sc.results.successRate.toFixed(0)}%</div>}
                    </div>
                    {sc.results&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>Median</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.results.p50)}</div></div>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>Pessimistic</div><div style={{fontSize:12,color:"#ef4444"}}>{fmt(sc.results.p10)}</div></div>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>Optimistic</div><div style={{fontSize:12,color:"#22c55e"}}>{fmt(sc.results.p90)}</div></div>
                    </div>}
                    {sc.ret&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>RRIF</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.ret.rrifBalance)}</div></div>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>TFSA</div><div style={{fontSize:12,color:"#34d399"}}>{fmt(sc.ret.tfsaBalance)}</div></div>
                      <div><div style={{fontSize:9,color:"#4a5568"}}>Non-Reg</div><div style={{fontSize:12,color:"#4a90d9"}}>{fmt(sc.ret.nonRegBalance)}</div></div>
                    </div>}
                    <div style={{display:"flex",gap:7}}>
                      <button className="btn-ghost" style={{flex:1}} onClick={()=>loadScenario(sc)}>↩ Load Plan</button>
                      <button className="btn-ghost" onClick={()=>deleteScenario(sc.id)} style={{color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}}>✕</button>
                    </div>
                  </div>)
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
