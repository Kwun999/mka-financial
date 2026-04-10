import { useState, useEffect, useCallback } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
const STORAGE_KEY="mka_fp_scenarios";
function loadScenarios(){try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):[]}catch{return[]}}
function saveScenarios(list){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(list))}catch{}}
function gaussRandom(){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function runMonteCarlo({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation,targetAmount,runs=1200}){const results=[];const realReturn=blendedReturn-inflation;for(let i=0;i<runs;i++){let pv=currentValue;for(let y=0;y<timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution}results.push(pv)}results.sort((a,b)=>a-b);const pct=(p)=>results[Math.floor((p/100)*results.length)];return{successRate:(results.filter(v=>v>=targetAmount).length/runs)*100,p10:pct(10),p25:pct(25),p50:pct(50),p75:pct(75),p90:pct(90),worst:results[0],best:results[results.length-1]}}
function buildProjectionData({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation}){const realReturn=blendedReturn-inflation;const RUNS=800;const yearlyValues=Array.from({length:timeHorizon+1},()=>[]);for(let i=0;i<RUNS;i++){let pv=currentValue;yearlyValues[0].push(pv);for(let y=1;y<=timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution;yearlyValues[y].push(pv)}}return yearlyValues.map((vals,yr)=>{const sorted=vals.slice().sort((a,b)=>a-b);const p=(pc)=>Math.max(0,sorted[Math.floor((pc/100)*sorted.length)]||0);return{year:yr,p10:p(10),p25:p(25),p50:p(50),p75:p(75),p90:p(90)}})}
const fmt=(v)=>v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${v.toFixed(0)}`;
function successColor(r){return r>=80?"#22c55e":r>=60?"#f59e0b":"#ef4444"}
const DEFAULT={goalName:"Retirement",currentAge:45,targetAge:65,currentValue:500000,monthlyContribution:2000,targetAmount:2500000,allocation:{equity:60,bonds:30,cash:10},assetReturns:{equity:7.5,bonds:3.5,cash:1.5},stdDev:12,inflation:2.5};
const GOAL_PRESETS=[{label:"Retirement",target:2500000,horizon:20,equity:60,bonds:30,cash:10},{label:"Education Fund",target:200000,horizon:12,equity:50,bonds:40,cash:10},{label:"Home Purchase",target:150000,horizon:5,equity:30,bonds:50,cash:20},{label:"Emergency Fund",target:50000,horizon:3,equity:0,bonds:20,cash:80},{label:"Business Launch",target:300000,horizon:7,equity:40,bonds:40,cash:20},{label:"Wealth Legacy",target:5000000,horizon:25,equity:70,bonds:25,cash:5}];
function MetricCard({label,value,sub,color,big}){return(<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.15)",borderRadius:12,padding:big?"20px 24px":"16px 20px",display:"flex",flexDirection:"column",gap:4}}><span style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8899aa"}}>{label}</span><span style={{fontSize:big?32:22,fontFamily:"'DM Serif Display',serif",color:color||"#D4AF37",fontWeight:400}}>{value}</span>{sub&&<span style={{fontSize:11,color:"#667788"}}>{sub}</span>}</div>)}
function SliderRow({label,value,min,max,step,onChange,format,hint}){return(<div style={{marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><label style={{fontSize:12,color:"#8899aa",letterSpacing:"0.05em"}}>{label}</label><span style={{fontSize:13,color:"#D4AF37",fontFamily:"'DM Serif Display',serif"}}>{format?format(value):value}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",accentColor:"#D4AF37",cursor:"pointer"}}/>{hint&&<div style={{fontSize:10,color:"#4a5568",marginTop:3}}>{hint}</div>}</div>)}
function AllocationBar({alloc}){const total=alloc.equity+alloc.bonds+alloc.cash;return(<div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{width:`${(alloc.equity/total)*100}%`,background:"#D4AF37"}}/><div style={{width:`${(alloc.bonds/total)*100}%`,background:"#4a90d9"}}/><div style={{width:`${(alloc.cash/total)*100}%`,background:"#34d399"}}/></div>)}
function SuccessGauge({rate}){const color=successColor(rate);const angle=-135+(rate/100)*270;return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><svg width={160} height={100} viewBox="0 0 160 100"><path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round"/><path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(rate/100)*188} 188`}/><g transform={`rotate(${angle}, 80, 90)`}><line x1={80} y1={90} x2={80} y2={38} stroke="white" strokeWidth={2} strokeLinecap="round"/><circle cx={80} cy={90} r={5} fill={color}/></g><text x={80} y={82} textAnchor="middle" fill={color} fontSize={22} fontFamily="'DM Serif Display',serif">{rate.toFixed(0)}%</text></svg><span style={{fontSize:11,color:"#8899aa",letterSpacing:"0.1em"}}>PROBABILITY OF SUCCESS</span></div>)}
const CustomTooltip=({active,payload,label})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#0f172a",border:"1px solid #D4AF37",borderRadius:8,padding:"10px 14px",fontSize:12}}><div style={{color:"#D4AF37",marginBottom:6,fontWeight:600}}>Year {label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}</div>)};
export default function App(){
const [s,setS]=useState(DEFAULT);
const [results,setResults]=useState(null);
const [projData,setProjData]=useState([]);
const [tab,setTab]=useState("plan");
const [scenarios,setScenarios]=useState([]);
const [saveName,setSaveName]=useState("");
const [running,setRunning]=useState(false);
const [activeScenario,setActiveScenario]=useState(null);
useEffect(()=>{setScenarios(loadScenarios())},[]);
const blendedReturn=(s.allocation.equity*s.assetReturns.equity+s.allocation.bonds*s.assetReturns.bonds+s.allocation.cash*s.assetReturns.cash)/(s.allocation.equity+s.allocation.bonds+s.allocation.cash)/100;
const timeHorizon=Math.max(1,s.targetAge-s.currentAge);
const annualContribution=s.monthlyContribution*12;
const runSimulation=useCallback(()=>{setRunning(true);setTimeout(()=>{const res=runMonteCarlo({currentValue:s.currentValue,annualContribution,timeHorizon,blendedReturn,stdDev:s.stdDev/100,inflation:s.inflation/100,targetAmount:s.targetAmount});setResults(res);setProjData(buildProjectionData({currentValue:s.currentValue,annualContribution,timeHorizon,blendedReturn,stdDev:s.stdDev/100,inflation:s.inflation/100}));setRunning(false);setTab("results")},80)},[s,blendedReturn,timeHorizon,annualContribution]);
const upd=(key)=>(val)=>setS(p=>({...p,[key]:val}));
const updAlloc=(key)=>(val)=>setS(p=>({...p,allocation:{...p.allocation,[key]:val}}));
const updReturn=(key)=>(val)=>setS(p=>({...p,assetReturns:{...p.assetReturns,[key]:val}}));
const applyPreset=(preset)=>{setS(p=>({...p,goalName:preset.label,targetAmount:preset.target,targetAge:p.currentAge+preset.horizon,allocation:{equity:preset.equity,bonds:preset.bonds,cash:preset.cash}}));setResults(null)};
const handleSave=()=>{if(!results||!saveName.trim())return;const scenario={id:Date.now(),name:saveName.trim(),date:new Date().toLocaleDateString("en-CA"),settings:{...s},results:{successRate:results.successRate,p50:results.p50,p10:results.p10,p90:results.p90}};const updated=[scenario,...scenarios].slice(0,20);setScenarios(updated);saveScenarios(updated);setSaveName("")};
const deleteScenario=(id)=>{const updated=scenarios.filter(sc=>sc.id!==id);setScenarios(updated);saveScenarios(updated)};
const loadScenario=(sc)=>{setS(sc.settings);setResults(null);setProjData([]);setActiveScenario(sc.id);setTab("plan")};
const exportCSV=()=>{if(!results||!projData.length)return;const rows=[["Year","P10","P25","P50","P75","P90"],...projData.map(d=>[d.year,d.p10.toFixed(0),d.p25.toFixed(0),d.p50.toFixed(0),d.p75.toFixed(0),d.p90.toFixed(0)]),[], ["Metric","Value"],["Goal",s.goalName],["Target",s.targetAmount],["Success Rate",`${results.successRate.toFixed(1)}%`],["Median",results.p50.toFixed(0)]];const blob=new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`${s.goalName.replace(/\s+/g,"_")}_projection.csv`;a.click()};
const swr=results?(results.p50*0.04)/12:null;
const surplus=results?Math.max(0,results.p50-s.targetAmount):null;
const shortfall=results?Math.max(0,s.targetAmount-results.p50):null;
const panel={background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.12)",borderRadius:16,padding:"24px"};
return(<div style={{minHeight:"100vh",background:"#060d1a",fontFamily:"'Figtree',sans-serif",color:"#cbd5e1"}}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Figtree:wght@300;400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}input[type=range]{-webkit-appearance:none;height:4px;background:#1e293b;border-radius:2px;outline:none}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#D4AF37;cursor:pointer;box-shadow:0 0 8px rgba(212,175,55,0.5)}input[type=text],input[type=number]{background:rgba(255,255,255,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:8px;color:#e2e8f0;padding:8px 12px;width:100%;font-size:14px;outline:none;font-family:inherit}input[type=text]:focus,input[type=number]:focus{border-color:rgba(212,175,55,0.6)}button{cursor:pointer;font-family:inherit}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#D4AF37;border-radius:2px}.tab-btn{padding:8px 20px;border:none;border-radius:8px;font-size:13px;font-weight:500;letter-spacing:0.04em;transition:all 0.2s}.tab-btn.active{background:#D4AF37;color:#060d1a}.tab-btn:not(.active){background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2)}.tab-btn:not(.active):hover{border-color:#D4AF37;color:#D4AF37}.btn-gold{background:linear-gradient(135deg,#D4AF37,#f0d060);color:#060d1a;border:none;border-radius:10px;padding:12px 28px;font-size:14px;font-weight:600;letter-spacing:0.05em;transition:all 0.2s}.btn-gold:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(212,175,55,0.35)}.btn-ghost{background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:8px 16px;font-size:12px;transition:all 0.2s}.btn-ghost:hover{border-color:#D4AF37;color:#D4AF37}.preset-chip{padding:6px 14px;border:1px solid rgba(212,175,55,0.2);border-radius:20px;background:transparent;color:#8899aa;font-size:12px;transition:all 0.2s}.preset-chip:hover{border-color:#D4AF37;color:#D4AF37;background:rgba(212,175,55,0.05)}@media print{.no-print{display:none!important}}`}</style>
<div style={{borderBottom:"1px solid rgba(212,175,55,0.12)",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}} className="no-print">
<div style={{display:"flex",alignItems:"center",gap:12}}>
<svg width={32} height={32} viewBox="0 0 32 32"><polygon points="16,2 28,8 28,24 16,30 4,24 4,8" fill="none" stroke="#D4AF37" strokeWidth={1.5}/><polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="rgba(212,175,55,0.12)" stroke="#D4AF37" strokeWidth={0.8}/><line x1={16} y1={7} x2={16} y2={25} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/><line x1={9} y1={11} x2={23} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/><line x1={23} y1={11} x2={9} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/></svg>
<div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#D4AF37",letterSpacing:"0.02em"}}>MKA Financial</div><div style={{fontSize:10,letterSpacing:"0.15em",color:"#4a5568",textTransform:"uppercase"}}>Financial Planning Suite</div></div>
</div>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
{["plan","results","scenarios"].map(t=>(<button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t==="plan"?"⚙ Plan":t==="results"?"📈 Results":`📁 Scenarios (${scenarios.length})`}</button>))}
</div>
</div>
<div style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>
{tab==="plan"&&(<div style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:24}}>
<div style={{display:"flex",flexDirection:"column",gap:20}}>
<div style={panel}><div style={{fontSize:11,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:14}}>Goal Presets</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{GOAL_PRESETS.map(p=><button key={p.label} className="preset-chip" onClick={()=>applyPreset(p)}>{p.label}</button>)}</div><div style={{marginTop:14}}><label style={{fontSize:11,color:"#8899aa",display:"block",marginBottom:6}}>Custom Goal Name</label><input type="text" value={s.goalName} onChange={e=>setS(p=>({...p,goalName:e.target.value}))} placeholder="e.g. Early Retirement"/></div></div>
<div style={panel}><div style={{fontSize:11,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:16}}>Client Profile</div>
<SliderRow label="Current Age" value={s.currentAge} min={18} max={80} step={1} onChange={upd("currentAge")} format={v=>`${v} yrs`}/>
<SliderRow label="Target Age" value={s.targetAge} min={s.currentAge+1} max={100} step={1} onChange={upd("targetAge")} format={v=>`${v} yrs`} hint={`Time Horizon: ${timeHorizon} years`}/>
<SliderRow label="Current Portfolio Value" value={s.currentValue} min={0} max={5000000} step={5000} onChange={upd("currentValue")} format={v=>fmt(v)}/>
<SliderRow label="Monthly Contribution" value={s.monthlyContribution} min={0} max={20000} step={100} onChange={upd("monthlyContribution")} format={v=>fmt(v)}/>
<SliderRow label="Target Amount" value={s.targetAmount} min={50000} max={10000000} step={25000} onChange={upd("targetAmount")} format={v=>fmt(v)}/>
</div></div>
<div style={{display:"flex",flexDirection:"column",gap:20}}>
<div style={panel}><div style={{fontSize:11,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:16}}>Asset Allocation & Assumed Returns</div>
<AllocationBar alloc={s.allocation}/>
<div style={{display:"flex",gap:16,fontSize:11,color:"#4a5568",marginBottom:20}}><span style={{color:"#D4AF37"}}>● Equity {s.allocation.equity}%</span><span style={{color:"#4a90d9"}}>● Bonds {s.allocation.bonds}%</span><span style={{color:"#34d399"}}>● Cash {s.allocation.cash}%</span></div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
{[{key:"equity",label:"Equity",color:"#D4AF37"},{key:"bonds",label:"Fixed Income",color:"#4a90d9"},{key:"cash",label:"Cash/Equiv.",color:"#34d399"}].map(({key,label,color})=>(<div key={key}><div style={{fontSize:12,color,marginBottom:10,fontWeight:500}}>{label}</div><SliderRow label="Allocation %" value={s.allocation[key]} min={0} max={100} step={5} onChange={updAlloc(key)} format={v=>`${v}%`}/><SliderRow label="Expected Return" value={s.assetReturns[key]} min={0} max={20} step={0.25} onChange={updReturn(key)} format={v=>`${v.toFixed(2)}%`}/></div>))}
</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:8,paddingTop:20,borderTop:"1px solid rgba(255,255,255,0.06)"}}><div><div style={{fontSize:11,color:"#8899aa",marginBottom:4}}>Blended Return (Nominal)</div><div style={{fontSize:24,fontFamily:"'DM Serif Display',serif",color:"#D4AF37"}}>{(blendedReturn*100).toFixed(2)}%</div></div><div><div style={{fontSize:11,color:"#8899aa",marginBottom:4}}>Real Return (After Inflation)</div><div style={{fontSize:24,fontFamily:"'DM Serif Display',serif",color:"#34d399"}}>{((blendedReturn-s.inflation/100)*100).toFixed(2)}%</div></div></div>
</div>
<div style={panel}><div style={{fontSize:11,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:16}}>Risk & Macro Parameters</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}><SliderRow label="Portfolio Volatility (Std Dev)" value={s.stdDev} min={2} max={30} step={0.5} onChange={upd("stdDev")} format={v=>`${v.toFixed(1)}%`} hint="Annual standard deviation"/><SliderRow label="Inflation Rate" value={s.inflation} min={0} max={10} step={0.25} onChange={upd("inflation")} format={v=>`${v.toFixed(2)}%`} hint="Long-term CPI assumption"/></div></div>
<button className="btn-gold" style={{alignSelf:"flex-end",minWidth:220}} onClick={runSimulation} disabled={running}>{running?"Running 1,200 Simulations…":"▶  Run Monte Carlo Simulation"}</button>
</div></div>)}
{tab==="results"&&(<div>{!results?(<div style={{textAlign:"center",padding:"80px 0",color:"#4a5568"}}><div style={{fontSize:48,marginBottom:16}}>📊</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:"#8899aa"}}>No simulation run yet</div><button className="btn-gold" style={{marginTop:24}} onClick={()=>setTab("plan")}>Go to Plan →</button></div>):(<div style={{display:"flex",flexDirection:"column",gap:24}}>
<div style={{display:"grid",gridTemplateColumns:"200px 1fr 1fr 1fr 1fr",gap:16,alignItems:"stretch"}}>
<div style={{...panel,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><SuccessGauge rate={results.successRate}/></div>
<MetricCard label="Median Outcome (P50)" value={fmt(results.p50)} sub={`Target: ${fmt(s.targetAmount)}`} color={results.p50>=s.targetAmount?"#22c55e":"#ef4444"} big/>
<MetricCard label="Optimistic (P90)" value={fmt(results.p90)} sub="Top 10% of outcomes" color="#D4AF37" big/>
<MetricCard label="Pessimistic (P10)" value={fmt(results.p10)} sub="Bottom 10% of outcomes" color="#ef4444" big/>
<MetricCard label={surplus>0?"Projected Surplus":"Projected Shortfall"} value={fmt(surplus>0?surplus:shortfall)} sub={surplus>0?"Above target (median)":"Below target (median)"} color={surplus>0?"#22c55e":"#ef4444"} big/>
</div>
<div style={panel}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
<div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#e2e8f0"}}>{s.goalName} — Portfolio Projection</div><div style={{fontSize:12,color:"#4a5568",marginTop:4}}>Real (inflation-adjusted) · {timeHorizon}-year horizon</div></div>
<div style={{display:"flex",gap:8}} className="no-print"><button className="btn-ghost" onClick={exportCSV}>⬇ Export CSV</button><button className="btn-ghost" onClick={()=>window.print()}>🖨 Print / PDF</button></div>
</div>
<ResponsiveContainer width="100%" height={360}><AreaChart data={projData} margin={{top:10,right:20,left:10,bottom:0}}>
<defs><linearGradient id="g90" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.15}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0.01}/></linearGradient><linearGradient id="g50" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a90d9" stopOpacity={0.2}/><stop offset="100%" stopColor="#4a90d9" stopOpacity={0.01}/></linearGradient></defs>
<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
<XAxis dataKey="year" stroke="#334155" tick={{fill:"#4a5568",fontSize:11}}/>
<YAxis stroke="#334155" tick={{fill:"#4a5568",fontSize:11}} tickFormatter={v=>fmt(v)} width={75}/>
<Tooltip content={<CustomTooltip/>}/>
<Area type="monotone" dataKey="p90" name="P90 (Optimistic)" stroke="#D4AF37" fill="url(#g90)" strokeWidth={1.5} dot={false}/>
<Area type="monotone" dataKey="p50" name="P50 (Median)" stroke="#4a90d9" fill="url(#g50)" strokeWidth={2} dot={false}/>
<Area type="monotone" dataKey="p25" name="P25" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="4 4" dot={false}/>
<Area type="monotone" dataKey="p10" name="P10 (Pessimistic)" stroke="#ef4444" fill="none" strokeWidth={1.5} dot={false}/>
<ReferenceLine y={s.targetAmount} stroke="#22c55e" strokeDasharray="6 4" label={{value:`Target ${fmt(s.targetAmount)}`,position:"right",fill:"#22c55e",fontSize:11}}/>
</AreaChart></ResponsiveContainer>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
<MetricCard label="Est. Monthly Income (P50)" value={swr?fmt(swr):"—"} sub="4% safe withdrawal rule"/>
<MetricCard label="Annual Income (P50)" value={results.p50?fmt(results.p50*0.04):"—"} sub="Sustainable withdrawal"/>
<MetricCard label="Total Contributions" value={fmt(s.currentValue+annualContribution*timeHorizon)} sub={`$${(annualContribution/1000).toFixed(0)}K/yr over ${timeHorizon} yrs`} color="#cbd5e1"/>
<MetricCard label="Inflation Impact" value={`${((1-Math.pow(1/(1+s.inflation/100),timeHorizon))*100).toFixed(0)}%`} sub={`Purchasing power lost in ${timeHorizon} yrs`} color="#f59e0b"/>
<MetricCard label="Required Return" value={`${((Math.pow(s.targetAmount/Math.max(1,s.currentValue),1/timeHorizon)-1)*100).toFixed(2)}%`} sub="To reach target (no contributions)" color="#94a3b8"/>
<MetricCard label="Best Scenario (P99)" value={fmt(results.best)} sub="1% most optimistic" color="#34d399"/>
<MetricCard label="Worst Scenario (P1)" value={fmt(results.worst)} sub="1% most pessimistic" color="#ef4444"/>
<MetricCard label="Blended Return" value={`${(blendedReturn*100).toFixed(2)}%`} sub={`Real: ${((blendedReturn-s.inflation/100)*100).toFixed(2)}%`}/>
</div>
<div style={{...panel,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}} className="no-print">
<span style={{fontSize:13,color:"#8899aa",whiteSpace:"nowrap"}}>Save this scenario:</span>
<input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="e.g. Conservative Base Case 2025" style={{flex:1,minWidth:200}}/>
<button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save</button>
</div>
</div>)}</div>)}
{tab==="scenarios"&&(<div style={{display:"flex",flexDirection:"column",gap:16}}>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"#e2e8f0"}}>Saved Scenarios</div>
{scenarios.length===0?(<div style={{...panel,textAlign:"center",padding:"60px 0",color:"#4a5568"}}><div style={{fontSize:40,marginBottom:12}}>📁</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#667788"}}>No scenarios saved yet</div></div>):(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>{scenarios.map(sc=>{const color=successColor(sc.results.successRate);return(<div key={sc.id} style={{...panel,borderColor:activeScenario===sc.id?"rgba(212,175,55,0.5)":"rgba(212,175,55,0.12)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}><div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0"}}>{sc.name}</div><div style={{fontSize:11,color:"#4a5568",marginTop:2}}>{sc.settings.goalName} · Saved {sc.date}</div></div><div style={{fontSize:18,fontFamily:"'DM Serif Display',serif",color}}>{sc.results.successRate.toFixed(0)}%</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}><div><div style={{fontSize:10,color:"#4a5568"}}>Median</div><div style={{fontSize:13,color:"#D4AF37"}}>{fmt(sc.results.p50)}</div></div><div><div style={{fontSize:10,color:"#4a5568"}}>Pessimistic</div><div style={{fontSize:13,color:"#ef4444"}}>{fmt(sc.results.p10)}</div></div><div><div style={{fontSize:10,color:"#4a5568"}}>Optimistic</div><div style={{fontSize:13,color:"#22c55e"}}>{fmt(sc.results.p90)}</div></div></div><div style={{display:"flex",gap:8}}><button className="btn-ghost" style={{flex:1}} onClick={()=>loadScenario(sc)}>↩ Load</button><button className="btn-ghost" onClick={()=>deleteScenario(sc.id)} style={{color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}}>✕</button></div></div>)})}</div>)}
</div>)}
</div>
</div>)
}
