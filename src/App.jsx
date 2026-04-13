import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

const SK="mka_fp_v5";const SKS="mka_sc_v5";
const loadAll=()=>{try{const r=localStorage.getItem(SK);return r?JSON.parse(r):{}}catch{return{}}};
const saveAll=d=>{try{localStorage.setItem(SK,JSON.stringify(d))}catch{}};
const loadScenarios=()=>{try{const r=localStorage.getItem(SKS);return r?JSON.parse(r):[]}catch{return[]}};
const saveScenarios=l=>{try{localStorage.setItem(SKS,JSON.stringify(l))}catch{}};

const FED=[{min:0,max:55867,rate:.15},{min:55867,max:111733,rate:.205},{min:111733,max:154906,rate:.26},{min:154906,max:220000,rate:.29},{min:220000,max:Infinity,rate:.33}];
const FB=15705;
const PROV={
"Alberta":{b:[{m:0,x:148269,r:.10},{m:148269,x:177922,r:.12},{m:177922,x:237230,r:.13},{m:237230,x:355845,r:.14},{m:355845,x:Infinity,r:.15}],p:21003},
"British Columbia":{b:[{m:0,x:45654,r:.0506},{m:45654,x:91310,r:.077},{m:91310,x:104835,r:.105},{m:104835,x:127299,r:.1229},{m:127299,x:172602,r:.147},{m:172602,x:240716,r:.168},{m:240716,x:Infinity,r:.205}],p:11981},
"Manitoba":{b:[{m:0,x:36842,r:.108},{m:36842,x:79625,r:.1275},{m:79625,x:Infinity,r:.174}],p:15780},
"New Brunswick":{b:[{m:0,x:47715,r:.094},{m:47715,x:95431,r:.1482},{m:95431,x:176756,r:.1652},{m:176756,x:Infinity,r:.195}],p:12458},
"Newfoundland":{b:[{m:0,x:43198,r:.087},{m:43198,x:86395,r:.145},{m:86395,x:154244,r:.158},{m:154244,x:215943,r:.178},{m:215943,x:Infinity,r:.198}],p:10818},
"Nova Scotia":{b:[{m:0,x:29590,r:.0879},{m:29590,x:59180,r:.1495},{m:59180,x:93000,r:.1667},{m:93000,x:150000,r:.175},{m:150000,x:Infinity,r:.21}],p:8481},
"Ontario":{b:[{m:0,x:51446,r:.0505},{m:51446,x:102894,r:.0915},{m:102894,x:150000,r:.1116},{m:150000,x:220000,r:.1216},{m:220000,x:Infinity,r:.1316}],p:11865,surtax:true},
"Prince Edward Island":{b:[{m:0,x:32656,r:.0965},{m:32656,x:64313,r:.1363},{m:64313,x:105000,r:.1665},{m:105000,x:140000,r:.18},{m:140000,x:Infinity,r:.1875}],p:12000},
"Quebec":{b:[{m:0,x:51780,r:.14},{m:51780,x:103545,r:.19},{m:103545,x:126000,r:.24},{m:126000,x:Infinity,r:.2575}],p:17183},
"Saskatchewan":{b:[{m:0,x:49720,r:.105},{m:49720,x:142058,r:.125},{m:142058,x:Infinity,r:.145}],p:17661},
};
function bracketTax(income,brackets,personal){const ti=Math.max(0,income-personal);let tax=0;for(const b of brackets){const lo=b.min||b.m||0,hi=b.max||b.x||Infinity,rate=b.rate||b.r||0;if(ti<=lo)break;tax+=(Math.min(ti,hi)-lo)*rate}return tax}
function calcTax(income,provName){if(income<=0)return{fedTax:0,provTax:0,total:0,effective:0,marginal:0,netIncome:0};const prov=PROV[provName]||PROV["Ontario"];const fedTax=bracketTax(income,FED,FB);let provTax=bracketTax(income,prov.b,prov.p);if(prov.surtax&&provTax>5315)provTax+=(provTax-5315)*.20;if(prov.surtax&&provTax>6802)provTax+=(provTax-6802)*.36;const total=Math.max(0,fedTax+provTax),eff=total/income,ti=income-FB;const mFed=FED.find(b=>ti>=b.min&&ti<b.max)?.rate||.15,tiP=income-prov.p;const mProv=prov.b.find(b=>tiP>=(b.m||0)&&tiP<(b.x||Infinity))?.r||0;return{fedTax,provTax,total,effective:eff,marginal:mFed+mProv,netIncome:income-total}}
const OAS_THR=90997;
function oasNet(totalIncome,oasAnnual){if(totalIncome<=OAS_THR)return oasAnnual;return Math.max(0,oasAnnual-(totalIncome-OAS_THR)*.15)}
const RRIF_R={65:.040,66:.041,67:.042,68:.044,69:.045,70:.050,71:.0528,72:.054,73:.0556,74:.0571,75:.0582,76:.0596,77:.0611,78:.0629,79:.0647,80:.0682,81:.0697,82:.0713,83:.0735,84:.0758,85:.0851,86:.0876,87:.0902,88:.0930,89:.0963,90:.1000,91:.1111,92:.1250,93:.1428,94:.1666,95:.2000};
function getRRIFRate(age){const keys=Object.keys(RRIF_R).map(Number).sort((a,b)=>a-b);let r=.04;for(const k of keys){if(age>=k)r=RRIF_R[k]}return r}

function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function runMC({cv,ac,th,br,sd,inf,ta,runs=1200}){const res=[],rr=br-inf;for(let i=0;i<runs;i++){let pv=cv;for(let y=0;y<th;y++)pv=pv*(1+rr+sd*gauss())+ac;res.push(pv)}res.sort((a,b)=>a-b);const pct=p=>res[Math.floor(p/100*res.length)];return{successRate:res.filter(v=>v>=ta).length/runs*100,p10:pct(10),p25:pct(25),p50:pct(50),p75:pct(75),p90:pct(90),worst:res[0],best:res[res.length-1]}}
function buildPD({cv,ac,th,br,sd,inf}){const rr=br-inf,R=800,yv=Array.from({length:th+1},()=>[]);for(let i=0;i<R;i++){let pv=cv;yv[0].push(pv);for(let y=1;y<=th;y++){pv=pv*(1+rr+sd*gauss())+ac;yv[y].push(pv)}}return yv.map((vals,yr)=>{const s=vals.slice().sort((a,b)=>a-b),p=pc=>Math.max(0,s[Math.floor(pc/100*s.length)]||0);return{year:yr,p10:p(10),p25:p(25),p50:p(50),p75:p(75),p90:p(90)}})}

function buildWP(r){let rrif=r.rrifBalance,tfsa=r.tfsaBalance,nonReg=r.nonRegBalance;const acbR=r.nonRegBalance>0?Math.min(1,r.nonRegACB/r.nonRegBalance):1,retRate=r.portfolioReturn/100,cpp=r.cppMonthly*12,oasG=r.oasMonthly*12,desired=r.desiredMonthlyIncome*12,years=[];
for(let age=r.retirementAge;age<=r.lifeExpectancy;age++){rrif*=(1+retRate);tfsa*=(1+retRate);nonReg*=(1+retRate);const rrifMin=rrif*getRRIFRate(age),custom=r.customWithdrawals?.[age],guaranteed=cpp+oasNet(cpp+oasG+rrifMin,oasG),gap=Math.max(0,desired-guaranteed);let rrifW=0,tfsaW=0,nrW=0;
if(custom&&(custom.rrif||custom.tfsa||custom.nonReg)){rrifW=Math.min(custom.rrif||0,rrif);tfsaW=Math.min(custom.tfsa||0,tfsa);nrW=Math.min(custom.nonReg||0,nonReg)}
else{rrifW=Math.min(Math.max(rrifMin,gap*.5),rrif);const rem=Math.max(0,gap-rrifW);if(r.withdrawOrder==="optimal"){nrW=Math.min(rem*.6,nonReg);tfsaW=Math.min(Math.max(0,gap-rrifW-nrW),tfsa)}else if(r.withdrawOrder==="tfsa-first"){tfsaW=Math.min(rem,tfsa);nrW=Math.min(Math.max(0,gap-rrifW-tfsaW),nonReg)}else if(r.withdrawOrder==="nonreg-first"){nrW=Math.min(rem,nonReg);tfsaW=Math.min(Math.max(0,gap-rrifW-nrW),tfsa)}else{rrifW=Math.min(Math.max(rrifMin,gap),rrif);nrW=Math.min(Math.max(0,gap-rrifW),nonReg)}}
const nrTG=nrW*(1-acbR)*.5,oN=oasNet(cpp+oasG+rrifW,oasG),taxable=cpp+oN+rrifW+nrTG,tax=calcTax(taxable,r.province);
rrif=Math.max(0,rrif-rrifW);tfsa=Math.max(0,tfsa-tfsaW);nonReg=Math.max(0,nonReg-nrW);const totalIncome=(cpp+oN)+rrifW+tfsaW+nrW;
years.push({age,rrifBal:rrif,tfsaBal:tfsa,nonRegBal:nonReg,totalBal:rrif+tfsa+nonReg,cpp,oasNet:oN,rrifW,tfsaW,nrW,totalIncome,taxableIncome:taxable,tax:tax.total,effectiveRate:tax.effective,netIncome:totalIncome-tax.total,marginal:tax.marginal})}return years}

function calcEstate(r){const prov=r.province,rT=calcTax(r.rrifBalance,prov),nrGain=Math.max(0,r.nonRegBalance-r.nonRegACB),nrTax=Math.max(0,calcTax(r.nonRegACB+nrGain*.5,prov).total-calcTax(r.nonRegACB,prov).total);return{rrifGross:r.rrifBalance,rrifTax:rT.total,rrifNet:r.rrifBalance-rT.total,rrifRate:rT.effective,tfsaGross:r.tfsaBalance,tfsaTax:0,tfsaNet:r.tfsaBalance,nonRegGross:r.nonRegBalance,nonRegGain:nrGain,nonRegTax:nrTax,nonRegNet:r.nonRegBalance-nrTax,totalGross:r.rrifBalance+r.tfsaBalance+r.nonRegBalance,totalTax:rT.total+nrTax,totalNet:(r.rrifBalance-rT.total)+r.tfsaBalance+(r.nonRegBalance-nrTax)}}

const fmt=v=>v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${Math.round(Math.abs(v))}`;
const fmtP=v=>`${(v*100).toFixed(1)}%`;
const sColor=r=>r>=80?"#22c55e":r>=60?"#f59e0b":"#ef4444";

const RISK={
  conservative:{label:"Conservative",icon:"🛡️",color:"#34d399",stdDev:7,allocation:{equity:30,bonds:55,cash:15},assetReturns:{equity:6.0,bonds:3.5,cash:1.5},desc:"Capital preservation. Lower returns, much lower volatility. Suited for short time horizons or low risk tolerance."},
  balanced:{label:"Balanced",icon:"⚖️",color:"#4a90d9",stdDev:12,allocation:{equity:60,bonds:30,cash:10},assetReturns:{equity:7.5,bonds:3.5,cash:1.5},desc:"Classic 60/40. Moderate growth with moderate risk. Most common long-term planning assumption for Canadian investors."},
  growth:{label:"Growth",icon:"📈",color:"#D4AF37",stdDev:16,allocation:{equity:75,bonds:20,cash:5},assetReturns:{equity:8.0,bonds:3.5,cash:1.5},desc:"Equity-heavy. Higher expected returns and higher short-term swings. Best for time horizons of 10+ years."},
  aggressive:{label:"Aggressive",icon:"🚀",color:"#f59e0b",stdDev:20,allocation:{equity:90,bonds:8,cash:2},assetReturns:{equity:8.5,bonds:3.5,cash:1.5},desc:"Maximum equity. Highest potential returns and highest volatility. Only for 15+ year horizons and high risk tolerance."},
};

const TIPS={
  successRate:{title:"Probability of Success",rel:"Primary goal metric",body:"% of 1,200 simulations where the final portfolio met or exceeded your Target Amount. Above 80% is strong. 60–80% is acceptable with flexibility. Below 60% means the goal needs adjustment. This is your primary planning health indicator."},
  p50:{title:"Median Outcome (P50)",rel:"Relates to: Success Rate, Surplus/Shortfall & Withdraw tab balances",body:"The middle result across 1,200 simulations in TODAY'S purchasing power (real, inflation-adjusted). After the simulation, P50 × your Account Split % automatically pre-fills all three Withdraw tab account balances."},
  p90:{title:"Optimistic Outcome (P90)",rel:"Relates to: P50 Median & Risk Profile / Std Dev",body:"Only 10% of simulations ended above this. The gap between P90 and P50 shows upside potential and widens with higher volatility. Your Risk Profile preset sets the standard deviation that drives this spread. Never plan for P90 — use P50."},
  p10:{title:"Pessimistic Outcome (P10)",rel:"Relates to: P50 Median & Risk Profile / Std Dev",body:"Only 10% of simulations ended below this. If P10 still exceeds your Target, the plan is robust even in poor markets. Higher volatility (Aggressive profile) widens the gap between P10 and P50."},
  surplus:{title:"Projected Surplus",rel:"P50 above Target Amount (today's dollars)",body:"How far the median (P50) sits above your Target Amount in today's purchasing power. A surplus correlates with higher Probability of Success. The P50 value still drives the Withdraw tab account balances even when there's a surplus."},
  shortfall:{title:"Projected Shortfall",rel:"P50 below Target Amount (today's dollars)",body:"How far the median (P50) falls below your Target Amount. To close it: raise contributions, extend the time horizon, choose a higher Risk Profile, or reduce the target. The Withdraw tab still runs with current values."},
  monthlyIncome:{title:"Estimated Monthly Income (4% Rule)",rel:"Derives from: P50 Median × 4% vs. your Income Target",body:"Applies the 4% safe withdrawal rate to the median portfolio (P50 × 4% ÷ 12). Compare this to your Income Target set in the Plan tab — that target flows directly into the Income and Withdraw tabs. If these two numbers are close, your accumulation and spending goals are well-aligned."},
  annualIncome:{title:"Estimated Annual Income (4% Rule)",rel:"Derives from: P50 Median × 4% Rule",body:"Your median portfolio (P50) × 4%. Add CPP and OAS (Income tab) to get the full retirement income picture. Your Income Target from the Plan tab flows into the Income tab as Desired Monthly Income for the gap analysis."},
  totalContrib:{title:"Total Contributions (Nominal)",rel:"Relates to: Current Portfolio & Monthly Contribution",body:"Starting portfolio plus all future monthly contributions in nominal dollars. The difference between this and your P50 outcome is pure compounding growth."},
  blendedReturn:{title:"Blended Return",rel:"Set by Risk Profile (or manual override) · Drives all projections",body:"Weighted average of your three asset class returns. Set automatically by your Risk Profile preset. The Real Return below subtracts inflation and is the actual rate used in every simulation."},
  inflationImpact:{title:"Inflation Impact",rel:"Relates to: Real Return & Time Horizon",body:"% of purchasing power eroded by inflation over your time horizon: 1 − 1/(1+Inflation)^Years. All P10/P50/P90 results are already adjusted for this — they show today's purchasing power."},
  requiredReturn:{title:"Required Return (No Contributions)",rel:"Compare to: your Blended Return",body:"Annual return your current portfolio alone would need to reach the Target with zero contributions. If Blended Return exceeds this, contributions can bridge the gap."},
  bestScenario:{title:"Best Scenario (P99)",rel:"Upper extreme beyond P90",body:"The best outcome across all 1,200 simulations. Never use as a planning target. Your Risk Profile standard deviation controls how extreme this can be."},
  worstScenario:{title:"Worst Scenario (P1)",rel:"Lower extreme beyond P10",body:"The worst outcome across all 1,200 simulations. A Conservative risk profile shrinks the gap between Worst and P10."},
  cppAnnual:{title:"CPP Annual Income",rel:"Part of Guaranteed Income — reduces Gap to Fill",body:"Total annual CPP (monthly × 12). 100% taxable but not subject to OAS clawback. The higher this number, the smaller the gap your investments must fill — a gap that is set by your Income Target in the Plan tab."},
  oasNet:{title:"OAS Annual (Net of Clawback)",rel:"Driven by RRIF Minimum & Total Taxable Income",body:"OAS after the Recovery Tax (15¢/$ above $90,997 in 2024). The primary driver of clawback is your RRIF minimum — which flows from the RRIF balance, which is driven by Plan tab P50 × RRIF split %. A larger RRIF split means more mandatory income and potentially more clawback."},
  rrifMin:{title:"RRIF Minimum Withdrawal",rel:"Key driver of Taxable Income, OAS Clawback & Effective Tax Rate",body:"Mandatory minimum CRA requires from your RRIF each year. Rates: 4% at 65, 5.28% at 71, 6.82% at 80, 10% at 90. 100% taxable. This value flows from the RRIF balance in the Withdraw tab, which itself flows from Plan tab P50 × RRIF split %."},
  effectiveTax:{title:"Effective Tax Rate",rel:"Blended result of all income sources across all brackets",body:"Total tax ÷ total taxable income. Always lower than marginal rate. Driven primarily by RRIF minimum size. Use the province comparison grid to find the most tax-efficient province. The RRIF balance driving this rate flows from Plan tab P50 × RRIF split."},
  annualTax:{title:"Annual Tax Payable",rel:"Directly reduces Net Annual Income",body:"Combined federal + provincial income tax. Lower this by shifting your Plan tab account split toward more TFSA (tax-free) and less RRIF. The Withdraw tab shows how different strategies affect this across your entire retirement."},
  netAnnual:{title:"Net Annual Income",rel:"The bottom line: income after all taxes vs. Income Target",body:"Total retirement income minus all tax — your actual spendable amount per year. Compare ×12 to your Income Target set in the Plan tab to verify the plan works end-to-end."},
  gapToFill:{title:"Income Gap to Fill from Investments",rel:"Income Target (Plan tab) minus CPP + OAS",body:"Annual income your investment accounts must provide beyond CPP and OAS. This target flows from the Plan tab. The Withdraw tab shows how your three accounts (balances from Plan tab P50) fill this gap year by year."},
  retYears:{title:"Retirement Duration",rel:"Drives total lifetime tax & remaining estate",body:"Years from Retirement Age to Life Expectancy. Retirement Age flows directly from the Plan tab. Longer duration means more TFSA growth (tax-free) but also more total RRIF withdrawals and tax paid."},
  avgEffRate:{title:"Average Effective Tax Rate",rel:"Weighted average of all yearly effective rates",body:"Average effective rate across all retirement years. Shows overall tax efficiency of your chosen withdrawal strategy. Account balances here flow from Plan tab P50 × account split — changing the split changes this rate."},
  totalTaxRet:{title:"Total Tax Paid in Retirement",rel:"Sum of the annual Tax column in the withdrawal table",body:"Total income tax paid across all retirement years. Key metric for evaluating withdrawal strategy efficiency. The starting balances — driven from Plan tab P50 — have a large impact on this number."},
  remainEstate:{title:"Remaining Estate at Life Expectancy",rel:"Sum of all three account balances at the final plan year",body:"Combined value of RRIF + TFSA + Non-Reg at Life Expectancy — nominal future dollars. These balances started from Plan tab P50 × account split. Go to the Estate tab to see estate tax triggered at death."},
  estateGross:{title:"Total Gross Estate",rel:"Sum of RRIF + TFSA + Non-Reg balances",body:"Combined fair market value of all three accounts before estate tax. Balances flow from Plan tab P50 × account split. Changing your account split and re-running directly changes this figure and the estate tax composition."},
  estateTax:{title:"Total Tax at Death",rel:"Driven almost entirely by your RRIF balance",body:"Estimated combined tax at death. RRIF: 100% deemed income at marginal rate. Non-Reg: 50% inclusion rate. TFSA: $0. To reduce this, increase your TFSA split % in the Plan tab or use RRSP meltdown in the Withdraw tab."},
  estateNet:{title:"Net Estate to Heirs",rel:"Gross Estate minus Total Tax at Death",body:"What heirs actually receive after CRA's share. Maximize by increasing TFSA account split in the Plan tab, using RRSP meltdown in the Withdraw tab, gradually realizing non-reg gains, and using life insurance to fund the tax liability."},
  taxEfficiency:{title:"Tax Efficiency of Estate",rel:"Net Estate divided by Gross Estate",body:"% of gross estate transferred to heirs after all taxes. A TFSA-heavy account split approaches 90–100% efficiency. A heavily RRIF-weighted split may achieve only 55–65%. Use this as a benchmark when comparing different account split scenarios in the Plan tab."},
};

function HoverTip({tipKey,children}){const[visible,setVisible]=useState(false);const[pos,setPos]=useState({top:0,left:0});const timerRef=useRef(null);const wrapRef=useRef(null);const tip=TIPS[tipKey];if(!tip)return children;const handleEnter=()=>{const rect=wrapRef.current?.getBoundingClientRect();if(rect){let left=rect.left,top=rect.bottom+10;if(left+316>window.innerWidth)left=window.innerWidth-322;if(left<6)left=6;if(top+190>window.innerHeight)top=rect.top-195;setPos({top,left})}timerRef.current=setTimeout(()=>setVisible(true),1500)};const handleLeave=()=>{clearTimeout(timerRef.current);setVisible(false)};useEffect(()=>()=>clearTimeout(timerRef.current),[]);return(<div ref={wrapRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave} style={{position:"relative",cursor:"help"}}>{children}<div style={{position:"absolute",top:5,right:5,width:13,height:13,borderRadius:"50%",background:"rgba(212,175,55,0.15)",border:"1px solid rgba(212,175,55,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#D4AF37",fontWeight:700,pointerEvents:"none"}}>?</div>{visible&&(<div style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999,width:312,pointerEvents:"none",animation:"tipFade 0.18s ease"}}><div style={{background:"#0b1422",border:"1px solid rgba(212,175,55,0.5)",borderRadius:10,padding:"13px 15px",boxShadow:"0 16px 48px rgba(0,0,0,0.8)"}}><div style={{fontSize:11,fontWeight:700,color:"#D4AF37",marginBottom:4,lineHeight:1.3}}>{tip.title}</div><div style={{fontSize:9.5,color:"#34d399",marginBottom:7,fontStyle:"italic"}}>{tip.rel}</div><div style={{fontSize:9.5,color:"#cbd5e1",lineHeight:1.75}}>{tip.body}</div></div><div style={{position:"absolute",top:-6,left:20,width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderBottom:"6px solid rgba(212,175,55,0.5)"}}/></div>)}</div>);}

const FAQ_SECTIONS=[
{category:"Getting Started",color:"#D4AF37",items:[
{q:"How does the Plan tab connect to all other tabs?",a:"The Plan tab is the single source of truth. When you click Run Monte Carlo Simulation, the P50 (median) result is multiplied by your Account Split percentages to pre-fill the Withdraw tab balances. Your Retirement Age and Monthly Income Target also flow into the Income and Withdraw tabs. A green FROM PLAN badge marks driven values. You can override any value in those tabs freely."},
{q:"What are the Risk Profile presets?",a:"Four presets set both asset allocation AND standard deviation together: Conservative (30% equity, σ=7%), Balanced (60% equity, σ=12%), Growth (75% equity, σ=16%), and Aggressive (90% equity, σ=20%). Selecting a preset is a starting point — you can override any slider afterward. The label changes to Custom when you do."},
{q:"What is Standard Deviation and what is normal?",a:"Standard deviation measures how much annual returns vary from the average. Higher = wider swings in both directions. For reference: Conservative bond-heavy portfolio: 4–8%. Balanced 60/40: 10–13%. Growth equity portfolio: 15–18%. 100% equity / aggressive: 18–22%. The TSX has historically shown around 14–16% annually. A higher std dev widens the gap between your P10 (pessimistic) and P90 (optimistic) fan chart bands."},
{q:"What is the Account Split and how does it work?",a:"The Account Split tells the app how your retirement portfolio will be distributed across RRSP/RRIF, TFSA, and Non-Registered accounts. After the simulation, P50 × each percentage pre-fills the Withdraw tab. For example: P50 $2M with a 65/20/15 split → $1.3M RRIF, $400K TFSA, $300K Non-Reg. The split must total 100% to run the simulation."},
{q:"What are the ? badges on metric cards?",a:"Every metric card has a small gold ? badge in the top-right corner. Hover your mouse over any card for 1.5 seconds to see a detailed tooltip explaining what that metric means and how it relates to other metrics in the plan. Move your mouse away to dismiss."},
]},
{category:"Plan Tab",color:"#4a90d9",items:[
{q:"Why was Target Age renamed to Retirement Age?",a:"Retirement Age more accurately describes its purpose — it is the age at which you plan to retire and start drawing income. It defines both the accumulation time horizon (Retirement Age − Current Age = years to grow) and the starting age for the Withdraw tab income plan. It flows automatically into both Income and Withdraw tabs after the simulation."},
{q:"What is the Monthly Income Target?",a:"The monthly after-tax income you want to have in retirement, in today's dollars. This flows into the Income tab as your Desired Monthly Income and into the Withdraw tab gap calculation. Setting it here ensures all tabs work toward the same retirement spending goal. Compare your Income Target to the 4% Rule Monthly Income in the Results tab to check if your accumulation goal is sized correctly."},
{q:"Is the Target Portfolio Amount in today's dollars?",a:"Yes — in today's purchasing power (real, inflation-adjusted). The simulation subtracts your inflation rate from the blended return before projecting, so $2,500,000 target means $2.5M in TODAY'S money. All Results tab outcomes are also in today's dollars for direct comparison."},
{q:"How is the Blended Return calculated?",a:"Weighted average: (Equity% × Return + Bond% × Return + Cash% × Return) ÷ Total%. Your Risk Profile preset sets both the allocation AND standard deviation. The Real Return shown below subtracts your inflation assumption and is the actual rate used in every simulation."},
]},
{category:"Results & Monte Carlo",color:"#34d399",items:[
{q:"What is a Monte Carlo simulation?",a:"Instead of a single straight-line projection, the app runs 1,200 independent simulations. In each run, every year gets a randomly generated return drawn from a normal distribution centred on your real return with your chosen standard deviation. This produces 1,200 different final portfolio values sorted into percentile bands (P10 through P90). Your Risk Profile standard deviation controls how wide these bands spread."},
{q:"Are the Results tab values inflation-adjusted?",a:"Yes — all dollar values in the Results tab are in today's purchasing power (real, inflation-adjusted). The simulation subtracts your inflation rate from the blended return before running. A P50 result of $1,500,000 means that amount in today's purchasing power — not in future nominal dollars."},
{q:"What Probability of Success should I aim for?",a:"Above 80% is considered strong. 60–80% is acceptable for clients with spending flexibility. Below 60% means the goal needs adjustment — lower target, higher contributions, longer time horizon, or a higher Risk Profile. The gauge colour reflects this: green = strong, amber = moderate, red = needs attention."},
{q:"How does P50 drive the Withdraw tab?",a:"After the simulation, P50 is multiplied by your Account Split percentages to pre-fill the three account balances in the Withdraw tab. The Results tab shows a summary of this split. Your Retirement Age flows to the Withdraw tab starting age, and your Income Target flows as the Desired Monthly Income. All driven values show a FROM PLAN badge."},
]},
{category:"Income Tab",color:"#f59e0b",items:[
{q:"Are the Income tab values inflation-adjusted?",a:"No — the Income tab shows NOMINAL values representing actual dollar amounts you will receive at retirement. At 2.5% inflation over 20 years, $72,000 nominal income equals approximately $43,600 in today's purchasing power. Do not directly compare these figures to your inflation-adjusted Monte Carlo target."},
{q:"What is the OAS Clawback?",a:"The OAS Recovery Tax reduces your OAS benefit by 15 cents for every dollar of net income above $90,997 (2024). The key driver is your RRIF minimum withdrawal — which flows from the RRIF balance in the Withdraw tab, which itself flows from Plan tab P50 × RRIF split %. Strategies: RRSP meltdown before 71, deferring OAS to age 70 (adds 7.2% per year deferred), or reducing your RRIF split % in the Plan tab."},
{q:"Why does the clawback warning not change when I switch provinces?",a:"OAS clawback is a federal rule — the same $90,997 threshold applies in all provinces. Switching provinces changes your tax rate on income, not whether clawback triggers. The warning changes when you adjust your RRIF balance (Withdraw tab), CPP, OAS amounts, or Retirement Age — because these drive total taxable income."},
{q:"How does the province comparison grid work?",a:"The grid shows the effective tax rate and total tax for your desired retirement income in every Canadian province using 2024 rates. Click any province tile to instantly switch all tax calculations across Income, Withdraw, and Estate tabs. Ideal for clients considering relocation in retirement."},
]},
{category:"Withdraw Tab",color:"#4a90d9",items:[
{q:"Where do the Withdraw tab account balances come from?",a:"After the Monte Carlo simulation in the Plan tab, P50 is automatically distributed across RRIF, TFSA, and Non-Reg based on your Account Split percentages. For example, P50 $2M with a 65/20/15 split → $1.3M RRIF, $400K TFSA, $300K Non-Reg. A FROM PLAN badge marks all driven fields. You can adjust any slider freely to customise."},
{q:"What does the Optimal withdrawal strategy do?",a:"Draws the RRIF minimum plus 50% of the income gap, then Non-Registered withdrawals (benefiting from the 50% capital gains inclusion rate), then TFSA for the balance. This preserves TFSA as long as possible — it grows tax-free and passes to heirs tax-free — minimizing lifetime taxes paid."},
{q:"What is ACB (Adjusted Cost Base)?",a:"What you originally paid for non-registered investments. Only the capital gain above ACB is taxable — at 50% inclusion rate. The ACB is pre-filled at 65% of your Non-Reg balance after the simulation (implying a 35% unrealized gain), which you can adjust freely."},
{q:"How do Custom Annual Overrides work?",a:"Override the automated strategy for specific ages (+0, +5, +10, +15 years from retirement). Enter specific dollar amounts for RRIF, TFSA, and Non-Reg at those ages. The strategy logic is bypassed for that year. Useful for modelling large purchases, gifting, travel years, or RRSP meltdown withdrawals before age 71."},
]},
{category:"Estate Tab",color:"#ef4444",items:[
{q:"How do account balances reach the Estate tab?",a:"The Estate tab uses the RRIF, TFSA, and Non-Reg balances from the Withdraw tab. Those balances were initially pre-filled from your Plan tab simulation (P50 × account split). The full chain is: Plan tab → P50 result → Account Split → Withdraw tab balances → Estate tab. Changing your account split in the Plan tab and re-running updates the entire chain."},
{q:"How is the RRIF taxed at death?",a:"The entire RRIF balance is deemed received as income on the final tax return — fully taxed at the highest marginal rate. Exception: a surviving spouse can roll it over to their RRSP/RRIF completely tax-free. Reducing the RRIF component of your account split in the Plan tab reduces this liability."},
{q:"Why is the TFSA completely tax-free at death?",a:"The TFSA is designed to be tax-free at all stages. Name a successor holder (spouse) rather than a beneficiary so the TFSA absorbs into their account without affecting their contribution room. Increasing your TFSA split in the Plan tab directly improves estate tax efficiency."},
{q:"What is Tax Efficiency and how do I improve it?",a:"Tax Efficiency = Net Estate ÷ Gross Estate. A TFSA-heavy account split approaches 90–100% efficiency. A heavily RRIF-weighted split may achieve only 55–65%. Improve it by: increasing TFSA split % in the Plan tab, using RRSP meltdown in the Withdraw tab, gradually realizing non-reg gains, and using life insurance to fund the remaining tax liability."},
]},
{category:"Saving & Exporting",color:"#34d399",items:[
{q:"How do I save a plan?",a:"Go to the Saved tab, type a descriptive name (e.g. Balanced Ontario Retirement), and click Save Current Plan. Your complete plan — all Plan, Income, Withdraw, and Estate inputs plus simulation results — is saved to your browser. Up to 20 named plans can be stored."},
{q:"How do I export to Excel?",a:"Click the Excel button in the top-right header. A CSV file downloads that can be opened in Microsoft Excel, Google Sheets, or Numbers. It includes all sections: plan settings, risk profile, account split, Monte Carlo results, projections, income summary, full withdrawal table, and estate analysis."},
{q:"How do I create a PDF client report?",a:"Click the Print/PDF button in the top-right header. In your browser print dialog, set Destination to Save as PDF, paper to Letter, and enable Background Graphics so the dark header prints correctly. The app hides all navigation controls in print mode so only data and charts appear."},
]},
];

function FAQAccordion(){const[open,setOpen]=useState(0);const[openItem,setOpenItem]=useState(null);const[search,setSearch]=useState("");const filtered=search.trim().length>1?FAQ_SECTIONS.map(s=>({...s,items:s.items.filter(it=>it.q.toLowerCase().includes(search.toLowerCase())||it.a.toLowerCase().includes(search.toLowerCase()))})).filter(s=>s.items.length>0):FAQ_SECTIONS;return(<div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{position:"relative"}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#4a5568",fontSize:13}}>🔍</span><input type="text" value={search} onChange={e=>{setSearch(e.target.value);setOpenItem(null)}} placeholder="Search questions…" style={{paddingLeft:34,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:10,color:"#e2e8f0",padding:"10px 14px 10px 34px",width:"100%",fontSize:13,outline:"none",fontFamily:"inherit"}}/></div>{filtered.map((sec,si)=>(<div key={si} style={{border:"1px solid rgba(212,175,55,0.12)",borderRadius:14,overflow:"hidden"}}><button onClick={()=>{setOpen(si===open?-1:si);setOpenItem(null)}} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",background:open===si?"rgba(212,175,55,0.06)":"rgba(255,255,255,0.02)",border:"none",cursor:"pointer",borderBottom:open===si?"1px solid rgba(212,175,55,0.12)":"none"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:9,height:9,borderRadius:"50%",background:sec.color}}/><span style={{fontFamily:"'DM Serif Display',serif",fontSize:14,color:"#e2e8f0"}}>{sec.category}</span><span style={{fontSize:10,color:"#4a5568",background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"2px 8px"}}>{sec.items.length}q</span></div><span style={{color:sec.color,fontSize:16,display:"inline-block",transition:"transform 0.2s",transform:open===si?"rotate(90deg)":"rotate(0)"}}>›</span></button>{open===si&&sec.items.map((item,ii)=>(<div key={ii} style={{borderBottom:ii<sec.items.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}><button onClick={()=>setOpenItem(openItem===`${si}-${ii}`?null:`${si}-${ii}`)} style={{width:"100%",display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"10px 18px 10px 22px",background:"transparent",border:"none",cursor:"pointer",textAlign:"left",gap:12}}><span style={{fontSize:12,color:openItem===`${si}-${ii}`?sec.color:"#cbd5e1",lineHeight:1.5,fontWeight:openItem===`${si}-${ii}`?600:400,flex:1}}>{item.q}</span><span style={{color:openItem===`${si}-${ii}`?sec.color:"#4a5568",fontSize:16,flexShrink:0,display:"inline-block",transition:"transform 0.2s",transform:openItem===`${si}-${ii}`?"rotate(45deg)":"rotate(0)"}}>+</span></button>{openItem===`${si}-${ii}`&&<div style={{padding:"0 22px 12px 22px"}}><div style={{background:"rgba(255,255,255,0.02)",borderLeft:`2px solid ${sec.color}`,borderRadius:"0 8px 8px 0",padding:"10px 14px",fontSize:12,color:"#94a3b8",lineHeight:1.8}}>{item.a}</div></div>}</div>))}</div>))}{filtered.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#4a5568"}}><div style={{fontSize:32,marginBottom:10}}>🔍</div><div>No results for &ldquo;{search}&rdquo;</div></div>}</div>);}

const DP={goalName:"Retirement",riskProfile:"balanced",currentAge:45,retirementAge:65,lifeExpectancy:90,currentValue:500000,monthlyContribution:2000,targetAmount:2500000,desiredMonthlyIncome:6000,allocation:{equity:60,bonds:30,cash:10},assetReturns:{equity:7.5,bonds:3.5,cash:1.5},stdDev:12,inflation:2.5,accountSplit:{rrif:65,tfsa:20,nonReg:15}};
const DR={province:"Ontario",retirementAge:65,lifeExpectancy:90,cppMonthly:758,oasMonthly:713,rrifBalance:800000,tfsaBalance:200000,nonRegBalance:150000,nonRegACB:97500,desiredMonthlyIncome:6000,portfolioReturn:5.0,withdrawOrder:"optimal",customWithdrawals:{}};
const GOAL_P=[{label:"Retirement",target:2500000,horizon:20,equity:60,bonds:30,cash:10},{label:"Education Fund",target:200000,horizon:12,equity:50,bonds:40,cash:10},{label:"Home Purchase",target:150000,horizon:5,equity:30,bonds:50,cash:20},{label:"Emergency Fund",target:50000,horizon:3,equity:0,bonds:20,cash:80},{label:"Business Launch",target:300000,horizon:7,equity:40,bonds:40,cash:20},{label:"Wealth Legacy",target:5000000,horizon:25,equity:70,bonds:25,cash:5}];

function MC({label,value,sub,color,big,tipKey}){const card=(<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.15)",borderRadius:12,padding:big?"18px 22px":"13px 16px",display:"flex",flexDirection:"column",gap:3,position:"relative"}}><span style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"#8899aa"}}>{label}</span><span style={{fontSize:big?26:18,fontFamily:"'DM Serif Display',serif",color:color||"#D4AF37",fontWeight:400,lineHeight:1.2}}>{value}</span>{sub&&<span style={{fontSize:10,color:"#667788"}}>{sub}</span>}</div>);return tipKey?<HoverTip tipKey={tipKey}>{card}</HoverTip>:card;}
function SR({label,value,min,max,step,onChange,format,hint}){return(<div style={{marginBottom:15}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><label style={{fontSize:11,color:"#8899aa",display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>{label}</label><span style={{fontSize:12,color:"#D4AF37",fontFamily:"'DM Serif Display',serif"}}>{format?format(value):value}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",accentColor:"#D4AF37",cursor:"pointer"}}/>{hint&&<div style={{fontSize:10,color:"#4a5568",marginTop:2}}>{hint}</div>}</div>)}
function AB({alloc}){const t=alloc.equity+alloc.bonds+alloc.cash;return(<div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",marginBottom:8}}><div style={{width:`${(alloc.equity/t)*100}%`,background:"#D4AF37"}}/><div style={{width:`${(alloc.bonds/t)*100}%`,background:"#4a90d9"}}/><div style={{width:`${(alloc.cash/t)*100}%`,background:"#34d399"}}/></div>)}
function SG({rate}){const color=sColor(rate),angle=-135+(rate/100)*270;return(<HoverTip tipKey="successRate"><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"}}><svg width={150} height={92} viewBox="0 0 160 100"><path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round"/><path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(rate/100)*188} 188`}/><g transform={`rotate(${angle},80,90)`}><line x1={80} y1={90} x2={80} y2={38} stroke="white" strokeWidth={2} strokeLinecap="round"/><circle cx={80} cy={90} r={5} fill={color}/></g><text x={80} y={82} textAnchor="middle" fill={color} fontSize={22} fontFamily="'DM Serif Display',serif">{rate.toFixed(0)}%</text></svg><span style={{fontSize:10,color:"#8899aa",letterSpacing:"0.1em"}}>PROBABILITY OF SUCCESS</span><div style={{position:"absolute",top:2,right:2,width:13,height:13,borderRadius:"50%",background:"rgba(212,175,55,0.15)",border:"1px solid rgba(212,175,55,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#D4AF37",fontWeight:700}}>?</div></div></HoverTip>)}
const CT=({active,payload,label})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#0f172a",border:"1px solid #D4AF37",borderRadius:8,padding:"9px 13px",fontSize:11}}><div style={{color:"#D4AF37",marginBottom:5,fontWeight:600}}>Year {label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}</div>)};
const RT=({active,payload,label})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#0f172a",border:"1px solid rgba(212,175,55,0.4)",borderRadius:8,padding:"9px 13px",fontSize:11}}><div style={{color:"#D4AF37",marginBottom:5}}>Age {label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color||"#cbd5e1",marginBottom:2}}>{p.name}: {fmt(p.value)}</div>)}</div>)};
const SH=({title,sub})=>(<div style={{marginBottom:18}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#e2e8f0"}}>{title}</div>{sub&&<div style={{fontSize:11,color:"#4a5568",marginTop:3}}>{sub}</div>}</div>);
const SyncBadge=()=>(<span style={{fontSize:9,color:"#34d399",background:"rgba(52,211,153,0.1)",border:"1px solid rgba(52,211,153,0.25)",borderRadius:10,padding:"1px 7px",marginLeft:6,fontWeight:600}}>↑ FROM PLAN</span>);

export default function App(){
  const saved=loadAll();
  const[s,setS]=useState(saved.plan||DP);
  const[r,setR]=useState(saved.ret||DR);
  const[results,setResults]=useState(null);
  const[projData,setProjData]=useState([]);
  const[tab,setTab]=useState("plan");
  const[scenarios,setScenarios]=useState(loadScenarios());
  const[saveName,setSaveName]=useState("");
  const[running,setRunning]=useState(false);
  const[activeScenario,setActiveScenario]=useState(null);
  const[simDriven,setSimDriven]=useState(false);
  useEffect(()=>{saveAll({plan:s,ret:r})},[s,r]);

  const blended=(s.allocation.equity*s.assetReturns.equity+s.allocation.bonds*s.assetReturns.bonds+s.allocation.cash*s.assetReturns.cash)/(s.allocation.equity+s.allocation.bonds+s.allocation.cash)/100;
  const th=Math.max(1,s.retirementAge-s.currentAge);
  const ac=s.monthlyContribution*12;
  const splitTotal=s.accountSplit.rrif+s.accountSplit.tfsa+s.accountSplit.nonReg;
  const wPlan=useMemo(()=>buildWP(r),[r]);
  const estate=useMemo(()=>calcEstate(r),[r]);
  const retTax=useMemo(()=>{const cppA=r.cppMonthly*12,oasA=r.oasMonthly*12,rrifMinA=r.rrifBalance*getRRIFRate(r.retirementAge),oN=oasNet(cppA+oasA+rrifMinA,oasA),oasClawback=oasA-oN,taxable=cppA+oN+rrifMinA,tax=calcTax(taxable,r.province),desired=r.desiredMonthlyIncome*12;return{cppA,oasA,oN,oasClawback,rrifMinA,taxable,tax,desired,gap:Math.max(0,desired-(cppA+oN))}},[r]);

  const applyRisk=key=>{const p=RISK[key];setS(prev=>({...prev,riskProfile:key,stdDev:p.stdDev,allocation:{...p.allocation},assetReturns:{...p.assetReturns}}));setResults(null)};

  const runSimulation=useCallback(()=>{
    setRunning(true);
    setTimeout(()=>{
      const res=runMC({cv:s.currentValue,ac,th,br:blended,sd:s.stdDev/100,inf:s.inflation/100,ta:s.targetAmount});
      setResults(res);
      setProjData(buildPD({cv:s.currentValue,ac,th,br:blended,sd:s.stdDev/100,inf:s.inflation/100}));
      const p50=res.p50,rrifBal=Math.round(p50*s.accountSplit.rrif/100),tfsaBal=Math.round(p50*s.accountSplit.tfsa/100),nrBal=Math.round(p50*s.accountSplit.nonReg/100);
      setR(prev=>({...prev,retirementAge:s.retirementAge,lifeExpectancy:Math.max(s.retirementAge+20,prev.lifeExpectancy),desiredMonthlyIncome:s.desiredMonthlyIncome,rrifBalance:rrifBal,tfsaBalance:tfsaBal,nonRegBalance:nrBal,nonRegACB:Math.round(nrBal*.65),portfolioReturn:parseFloat(((blended-s.inflation/100)*100).toFixed(2))}));
      setSimDriven(true);setRunning(false);setTab("results");
    },80);
  },[s,blended,th,ac]);

  const upd=k=>v=>setS(p=>({...p,[k]:v}));
  const updAlloc=k=>v=>setS(p=>({...p,allocation:{...p.allocation,[k]:v},riskProfile:"custom"}));
  const updRet=k=>v=>setS(p=>({...p,assetReturns:{...p.assetReturns,[k]:v},riskProfile:"custom"}));
  const updSD=v=>setS(p=>({...p,stdDev:v,riskProfile:"custom"}));
  const updSplit=k=>v=>setS(p=>({...p,accountSplit:{...p.accountSplit,[k]:v}}));
  const updR=k=>v=>setR(p=>({...p,[k]:v}));
  const applyPreset=preset=>{setS(p=>({...p,goalName:preset.label,targetAmount:preset.target,retirementAge:p.currentAge+preset.horizon,allocation:{equity:preset.equity,bonds:preset.bonds,cash:preset.cash},riskProfile:"custom"}));setResults(null)};
  const handleSave=()=>{if(!saveName.trim())return;const sc={id:Date.now(),name:saveName.trim(),date:new Date().toLocaleDateString("en-CA"),plan:{...s},ret:{...r},results:results?{successRate:results.successRate,p50:results.p50,p10:results.p10,p90:results.p90}:null};const updated=[sc,...scenarios].slice(0,20);setScenarios(updated);saveScenarios(updated);setSaveName("")};
  const delSc=id=>{const u=scenarios.filter(sc=>sc.id!==id);setScenarios(u);saveScenarios(u)};
  const loadSc=sc=>{setS(sc.plan);setR(sc.ret||DR);setResults(null);setProjData([]);setActiveScenario(sc.id);setSimDriven(false);setTab("plan")};

  const exportCSV=()=>{
    const rows=[["MKA Financial — Complete Retirement Plan"],["Generated",new Date().toLocaleDateString("en-CA")],["Province",r.province],[],["=== PLAN ==="],["Goal",s.goalName],["Risk Profile",s.riskProfile],["Retirement Age",s.retirementAge],["Time Horizon",th],["Target Portfolio",s.targetAmount],["Income Target/mo",s.desiredMonthlyIncome],["Current Portfolio",s.currentValue],["Monthly Contribution",s.monthlyContribution],["Blended Return",`${(blended*100).toFixed(2)}%`],["Inflation",`${s.inflation}%`],["Std Dev",`${s.stdDev}%`],["Split RRIF",`${s.accountSplit.rrif}%`],["Split TFSA",`${s.accountSplit.tfsa}%`],["Split Non-Reg",`${s.accountSplit.nonReg}%`],
    ...(results?[[],["=== MONTE CARLO ==="],["Probability of Success",`${results.successRate.toFixed(1)}%`],["P50",results.p50.toFixed(0)],["P10",results.p10.toFixed(0)],["P90",results.p90.toFixed(0)],["RRIF pre-fill",r.rrifBalance],["TFSA pre-fill",r.tfsaBalance],["Non-Reg pre-fill",r.nonRegBalance],["Year","P10","P25","P50","P75","P90"],...projData.map(d=>[d.year,d.p10.toFixed(0),d.p25.toFixed(0),d.p50.toFixed(0),d.p75.toFixed(0),d.p90.toFixed(0)])]:[[]]),[],["=== INCOME ==="],["CPP Annual",(r.cppMonthly*12).toFixed(0)],["OAS Gross",(r.oasMonthly*12).toFixed(0)],["OAS Clawback",retTax.oasClawback.toFixed(0)],["OAS Net",retTax.oN.toFixed(0)],["RRIF Min",retTax.rrifMinA.toFixed(0)],["Eff Tax Rate",fmtP(retTax.tax.effective)],["Net Annual",retTax.tax.netIncome.toFixed(0)],[],["=== WITHDRAWAL PLAN ==="],["Age","RRIF","TFSA","NR","Total","CPP","OAS","RRIF W/D","TFSA W/D","NR W/D","Taxable","Tax","Eff%","Net"],...wPlan.map(y=>[y.age,y.rrifBal.toFixed(0),y.tfsaBal.toFixed(0),y.nonRegBal.toFixed(0),y.totalBal.toFixed(0),y.cpp.toFixed(0),y.oasNet.toFixed(0),y.rrifW.toFixed(0),y.tfsaW.toFixed(0),y.nrW.toFixed(0),y.taxableIncome.toFixed(0),y.tax.toFixed(0),(y.effectiveRate*100).toFixed(1),y.netIncome.toFixed(0)]),[],["=== ESTATE — "+r.province+" ==="],["Account","Gross","Tax","Net"],["RRIF",estate.rrifGross.toFixed(0),estate.rrifTax.toFixed(0),estate.rrifNet.toFixed(0)],["TFSA",estate.tfsaGross.toFixed(0),0,estate.tfsaNet.toFixed(0)],["Non-Reg",estate.nonRegGross.toFixed(0),estate.nonRegTax.toFixed(0),estate.nonRegNet.toFixed(0)],["TOTAL",estate.totalGross.toFixed(0),estate.totalTax.toFixed(0),estate.totalNet.toFixed(0)]];
    const blob=new Blob([rows.map(rw=>rw.join(",")).join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`MKA_${r.province}_${new Date().toISOString().split("T")[0]}.csv`;a.click();
  };

  const surplus=results?Math.max(0,results.p50-s.targetAmount):null;
  const shortfall=results?Math.max(0,s.targetAmount-results.p50):null;
  const swr=results?(results.p50*.04)/12:null;
  const panel={background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.12)",borderRadius:16,padding:"20px"};
  const TABS=[{id:"plan",label:"⚙ Plan"},{id:"results",label:"📈 Results"},{id:"income",label:"💰 Income"},{id:"withdraw",label:"📤 Withdraw"},{id:"estate",label:"🏛 Estate"},{id:"scenarios",label:`📁 Saved (${scenarios.length})`},{id:"faq",label:"❓ FAQ"}];

  return(<div style={{minHeight:"100vh",background:"#060d1a",fontFamily:"'Figtree',sans-serif",color:"#cbd5e1"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Figtree:wght@300;400;500;600&display=swap');*{box-sizing:border-box;margin:0;padding:0}input[type=range]{-webkit-appearance:none;height:4px;background:#1e293b;border-radius:2px;outline:none}input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:#D4AF37;cursor:pointer;box-shadow:0 0 8px rgba(212,175,55,0.4)}input[type=text],input[type=number],select{background:rgba(255,255,255,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:8px;color:#e2e8f0;padding:7px 11px;width:100%;font-size:12px;outline:none;font-family:inherit}input[type=text]:focus,input[type=number]:focus,select:focus{border-color:rgba(212,175,55,0.6)}select option{background:#0f172a;color:#e2e8f0}button{cursor:pointer;font-family:inherit}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#D4AF37;border-radius:2px}.tab-btn{padding:6px 14px;border:none;border-radius:8px;font-size:11px;font-weight:500;transition:all 0.2s;white-space:nowrap}.tab-btn.active{background:#D4AF37;color:#060d1a}.tab-btn:not(.active){background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2)}.tab-btn:not(.active):hover{border-color:#D4AF37;color:#D4AF37}.btn-gold{background:linear-gradient(135deg,#D4AF37,#f0d060);color:#060d1a;border:none;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:600;transition:all 0.2s;white-space:nowrap}.btn-gold:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(212,175,55,0.35)}.btn-ghost{background:transparent;color:#8899aa;border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:7px 14px;font-size:11px;transition:all 0.2s;white-space:nowrap}.btn-ghost:hover{border-color:#D4AF37;color:#D4AF37}.preset-chip{padding:5px 11px;border:1px solid rgba(212,175,55,0.2);border-radius:20px;background:transparent;color:#8899aa;font-size:11px;transition:all 0.2s}.preset-chip:hover{border-color:#D4AF37;color:#D4AF37;background:rgba(212,175,55,0.05)}.tbl{width:100%;border-collapse:collapse;font-size:11px}.tbl th{text-align:left;padding:7px 9px;color:#8899aa;text-transform:uppercase;font-weight:500;border-bottom:1px solid rgba(212,175,55,0.15);font-size:9px;white-space:nowrap}.tbl td{padding:6px 9px;border-bottom:1px solid rgba(255,255,255,0.04);color:#cbd5e1;white-space:nowrap}.tbl tr:hover td{background:rgba(212,175,55,0.03)}.warn{padding:10px 13px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:11px;color:#f59e0b;line-height:1.6}.tipbox{padding:10px 13px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:8px;font-size:11px;color:#34d399;line-height:1.6}.syncbar{padding:9px 14px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.18);border-radius:9px;font-size:11px;color:#34d399;display:flex;align-items:center;gap:8px}@keyframes tipFade{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}@media print{.no-print{display:none!important}}`}</style>

    {/* HEADER */}
    <div style={{borderBottom:"1px solid rgba(212,175,55,0.12)",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}} className="no-print">
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <svg width={28} height={28} viewBox="0 0 32 32"><polygon points="16,2 28,8 28,24 16,30 4,24 4,8" fill="none" stroke="#D4AF37" strokeWidth={1.5}/><polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="rgba(212,175,55,0.12)" stroke="#D4AF37" strokeWidth={0.8}/><line x1={16} y1={7} x2={16} y2={25} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/><line x1={9} y1={11} x2={23} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/><line x1={23} y1={11} x2={9} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/></svg>
        <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"#D4AF37"}}>MKA Financial</div><div style={{fontSize:8,letterSpacing:"0.15em",color:"#4a5568",textTransform:"uppercase"}}>Financial Planning Suite</div></div>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{TABS.map(t=><button key={t.id} className={`tab-btn ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
      <div style={{display:"flex",gap:7}} className="no-print"><button className="btn-ghost" onClick={exportCSV}>⬇ Excel</button><button className="btn-ghost" onClick={()=>window.print()}>🖨 PDF</button></div>
    </div>

    <div style={{padding:"20px 24px",maxWidth:1440,margin:"0 auto"}}>

    {/* ══ PLAN ══ */}
    {tab==="plan"&&(<div style={{display:"grid",gridTemplateColumns:"310px 1fr",gap:20}}>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={panel}>
          <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:11}}>Goal Presets</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{GOAL_P.map(p=><button key={p.label} className="preset-chip" onClick={()=>applyPreset(p)}>{p.label}</button>)}</div>
          <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Custom Goal Name</label>
          <input type="text" value={s.goalName} onChange={e=>setS(p=>({...p,goalName:e.target.value}))} placeholder="e.g. Early Retirement"/>
        </div>
        <div style={panel}>
          <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Client Profile</div>
          <SR label="Current Age" value={s.currentAge} min={18} max={80} step={1} onChange={upd("currentAge")} format={v=>`${v} yrs`}/>
          <SR label="Retirement Age" value={s.retirementAge} min={s.currentAge+1} max={80} step={1} onChange={upd("retirementAge")} format={v=>`${v} yrs`} hint={`${th} years to retirement · flows into Income & Withdraw tabs`}/>
          <SR label="Life Expectancy" value={s.lifeExpectancy} min={s.retirementAge+5} max={100} step={1} onChange={upd("lifeExpectancy")} format={v=>`${v} yrs`} hint="Used for withdrawal plan and estate analysis"/>
          <SR label="Current Portfolio" value={s.currentValue} min={0} max={5000000} step={5000} onChange={upd("currentValue")} format={v=>fmt(v)}/>
          <SR label="Monthly Contribution" value={s.monthlyContribution} min={0} max={20000} step={100} onChange={upd("monthlyContribution")} format={v=>fmt(v)}/>
          <div style={{paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:2}}>
            <div style={{fontSize:10,color:"#D4AF37",fontWeight:600,marginBottom:10}}>RETIREMENT GOALS → drives Income &amp; Withdraw tabs</div>
            <SR label="Target Portfolio Amount" value={s.targetAmount} min={50000} max={10000000} step={25000} onChange={upd("targetAmount")} format={v=>fmt(v)} hint="In today's purchasing power (real / inflation-adjusted dollars)"/>
            <SR label="Monthly Income Target" value={s.desiredMonthlyIncome} min={1000} max={20000} step={100} onChange={upd("desiredMonthlyIncome")} format={v=>fmt(v)} hint="Desired monthly income in retirement · flows into Income & Withdraw tabs"/>
          </div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={panel}>
          <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Risk Profile &amp; Asset Allocation</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {Object.entries(RISK).map(([key,p])=>{const isA=s.riskProfile===key;return(<button key={key} onClick={()=>applyRisk(key)} style={{padding:"11px 8px",borderRadius:10,border:`1px solid ${isA?p.color:"rgba(255,255,255,0.08)"}`,background:isA?`${p.color}18`:"rgba(255,255,255,0.02)",cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}><div style={{fontSize:17,marginBottom:4}}>{p.icon}</div><div style={{fontSize:10,fontWeight:600,color:isA?p.color:"#8899aa"}}>{p.label}</div><div style={{fontSize:9,color:"#4a5568",marginTop:3}}>σ = {p.stdDev}%</div></button>)})}
          </div>
          <div style={{fontSize:11,color:"#667788",background:"rgba(255,255,255,0.02)",borderRadius:7,padding:"8px 11px",marginBottom:14,lineHeight:1.6}}>
            {s.riskProfile&&s.riskProfile!=="custom"&&RISK[s.riskProfile]?RISK[s.riskProfile].desc:"Custom — you have manually overridden the allocation or volatility settings. Select a preset above to reset."}
          </div>
          <AB alloc={s.allocation}/>
          <div style={{display:"flex",gap:12,fontSize:10,color:"#4a5568",marginBottom:16}}><span style={{color:"#D4AF37"}}>● Equity {s.allocation.equity}%</span><span style={{color:"#4a90d9"}}>● Bonds {s.allocation.bonds}%</span><span style={{color:"#34d399"}}>● Cash {s.allocation.cash}%</span></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            {[{key:"equity",label:"Equity",color:"#D4AF37"},{key:"bonds",label:"Fixed Income",color:"#4a90d9"},{key:"cash",label:"Cash/Equiv.",color:"#34d399"}].map(({key,label,color})=>(<div key={key}><div style={{fontSize:11,color,marginBottom:8,fontWeight:500}}>{label}</div><SR label="Allocation %" value={s.allocation[key]} min={0} max={100} step={5} onChange={updAlloc(key)} format={v=>`${v}%`}/><SR label="Expected Return" value={s.assetReturns[key]} min={0} max={20} step={0.25} onChange={updRet(key)} format={v=>`${v.toFixed(2)}%`}/></div>))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:6,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Blended Return (Nominal)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#D4AF37"}}>{(blended*100).toFixed(2)}%</div></div>
            <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Real Return (After Inflation)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#34d399"}}>{((blended-s.inflation/100)*100).toFixed(2)}%</div></div>
          </div>
        </div>
        <div style={panel}>
          <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:13}}>Volatility &amp; Macro</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div>
              <SR label="Portfolio Volatility (Std Dev)" value={s.stdDev} min={2} max={30} step={0.5} onChange={updSD} format={v=>`${v.toFixed(1)}%`}/>
              <div style={{fontSize:10,color:"#4a5568",lineHeight:1.8,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:7,marginTop:-6}}>
                <strong style={{color:"#8899aa"}}>What is normal?</strong><br/>
                🛡️ Conservative (bonds-heavy): <span style={{color:"#34d399"}}>4–8%</span><br/>
                ⚖️ Balanced 60/40: <span style={{color:"#4a90d9"}}>10–13%</span><br/>
                📈 Growth (equity-heavy): <span style={{color:"#D4AF37"}}>15–18%</span><br/>
                🚀 Aggressive (100% equity): <span style={{color:"#f59e0b"}}>18–22%</span>
              </div>
            </div>
            <SR label="Inflation Rate (Long-term CPI)" value={s.inflation} min={0} max={10} step={0.25} onChange={upd("inflation")} format={v=>`${v.toFixed(2)}%`} hint="Bank of Canada target: 2%. Historical Canadian avg: 2–3%"/>
          </div>
        </div>
        <div style={panel}>
          <div style={{fontSize:10,letterSpacing:"0.12em",color:"#8899aa",textTransform:"uppercase",marginBottom:5}}>Account Split at Retirement → drives Withdraw &amp; Estate tabs</div>
          <div style={{fontSize:11,color:"#4a5568",marginBottom:14,lineHeight:1.65}}>How will your retirement portfolio be distributed across account types? After the simulation, <strong style={{color:"#D4AF37"}}>P50 × these %</strong> pre-fills the Withdraw tab account balances.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            {[{k:"rrif",label:"RRSP / RRIF",color:"#D4AF37",note:"100% taxable on withdrawal"},{k:"tfsa",label:"TFSA",color:"#34d399",note:"Completely tax-free"},{k:"nonReg",label:"Non-Registered",color:"#4a90d9",note:"Capital gains — 50% inclusion"}].map(({k,label,color,note})=>(<div key={k}><div style={{fontSize:10,color,fontWeight:600,marginBottom:6}}>{label}</div><SR label="" value={s.accountSplit[k]} min={0} max={100} step={5} onChange={updSplit(k)} format={v=>`${v}%`}/><div style={{fontSize:9,color:"#4a5568"}}>{note}</div></div>))}
          </div>
          <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",marginTop:10}}><div style={{width:`${(s.accountSplit.rrif/Math.max(splitTotal,1))*100}%`,background:"#D4AF37"}}/><div style={{width:`${(s.accountSplit.tfsa/Math.max(splitTotal,1))*100}%`,background:"#34d399"}}/><div style={{width:`${(s.accountSplit.nonReg/Math.max(splitTotal,1))*100}%`,background:"#4a90d9"}}/></div>
          {splitTotal!==100&&<div className="warn" style={{marginTop:10}}>⚠ Account split totals {splitTotal}% — must equal exactly 100% to run the simulation.</div>}
          {splitTotal===100&&results&&<div style={{fontSize:10,color:"#4a5568",marginTop:8}}>Last sim drove → RRIF: {fmt(r.rrifBalance)} · TFSA: {fmt(r.tfsaBalance)} · Non-Reg: {fmt(r.nonRegBalance)}</div>}
        </div>
        <button className="btn-gold" style={{alignSelf:"flex-end",minWidth:240}} onClick={runSimulation} disabled={running||splitTotal!==100}>{running?"Running 1,200 Simulations…":splitTotal!==100?`⚠ Split must total 100% (${splitTotal}% now)`:"▶  Run Monte Carlo Simulation"}</button>
      </div>
    </div>)}

    {/* ══ RESULTS ══ */}
    {tab==="results"&&(<div>{!results?(
      <div style={{textAlign:"center",padding:"80px 0",color:"#4a5568"}}><div style={{fontSize:44,marginBottom:14}}>📊</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"#8899aa"}}>No simulation run yet</div><div style={{fontSize:12,color:"#4a5568",marginTop:8}}>Go to the Plan tab and click Run Monte Carlo Simulation</div><button className="btn-gold" style={{marginTop:22}} onClick={()=>setTab("plan")}>Go to Plan →</button></div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        <div className="syncbar">✓ Simulation complete — Income, Withdraw, and Estate tabs have been updated from these results.<button className="btn-ghost" style={{marginLeft:"auto",fontSize:10}} onClick={()=>setTab("income")}>View Income →</button></div>
        <div style={{fontSize:11,color:"#4a5568",padding:"7px 12px",background:"rgba(212,175,55,0.04)",borderRadius:8,border:"1px solid rgba(212,175,55,0.1)"}}>💡 Hover any metric card for <strong style={{color:"#D4AF37"}}>1.5 seconds</strong> to see a full explanation and how it connects to the rest of the plan.</div>
        <div style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr 1fr 1fr",gap:12,alignItems:"stretch"}}>
          <div style={{...panel,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><SG rate={results.successRate}/></div>
          <MC tipKey="p50" label="Median (P50)" value={fmt(results.p50)} sub={`Target: ${fmt(s.targetAmount)}`} color={results.p50>=s.targetAmount?"#22c55e":"#ef4444"} big/>
          <MC tipKey="p90" label="Optimistic (P90)" value={fmt(results.p90)} sub="Top 10% of outcomes" color="#D4AF37" big/>
          <MC tipKey="p10" label="Pessimistic (P10)" value={fmt(results.p10)} sub="Bottom 10% of outcomes" color="#ef4444" big/>
          <MC tipKey={surplus>0?"surplus":"shortfall"} label={surplus>0?"Surplus":"Shortfall"} value={fmt(surplus>0?surplus:shortfall)} sub={surplus>0?"Above target (median)":"Below target (median)"} color={surplus>0?"#22c55e":"#ef4444"} big/>
        </div>
        <div style={panel}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"#e2e8f0",marginBottom:14}}>{s.goalName} — Portfolio Projection · Inflation-Adjusted (Real Dollars)</div>
          <ResponsiveContainer width="100%" height={300}><AreaChart data={projData} margin={{top:8,right:18,left:8,bottom:0}}><defs><linearGradient id="g90" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.15}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0.01}/></linearGradient><linearGradient id="g50" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a90d9" stopOpacity={0.2}/><stop offset="100%" stopColor="#4a90d9" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/><XAxis dataKey="year" stroke="#334155" tick={{fill:"#4a5568",fontSize:10}}/><YAxis stroke="#334155" tick={{fill:"#4a5568",fontSize:10}} tickFormatter={v=>fmt(v)} width={65}/><Tooltip content={<CT/>}/><Area type="monotone" dataKey="p90" name="P90 (Optimistic)" stroke="#D4AF37" fill="url(#g90)" strokeWidth={1.5} dot={false}/><Area type="monotone" dataKey="p50" name="P50 (Median)" stroke="#4a90d9" fill="url(#g50)" strokeWidth={2} dot={false}/><Area type="monotone" dataKey="p25" name="P25" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="4 4" dot={false}/><Area type="monotone" dataKey="p10" name="P10 (Pessimistic)" stroke="#ef4444" fill="none" strokeWidth={1.5} dot={false}/><ReferenceLine y={s.targetAmount} stroke="#22c55e" strokeDasharray="6 4" label={{value:`Target ${fmt(s.targetAmount)}`,position:"right",fill:"#22c55e",fontSize:10}}/></AreaChart></ResponsiveContainer>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          <MC tipKey="monthlyIncome" label="Monthly Income (4% Rule)" value={swr?fmt(swr):"—"} sub={`Income Target: ${fmt(s.desiredMonthlyIncome)}/mo`}/>
          <MC tipKey="annualIncome" label="Annual Income (4%)" value={results.p50?fmt(results.p50*.04):"—"} sub="Sustainable withdrawal"/>
          <MC tipKey="totalContrib" label="Total Contributions" value={fmt(s.currentValue+ac*th)} sub={`$${(ac/1000).toFixed(0)}K/yr × ${th} yrs`} color="#cbd5e1"/>
          <MC tipKey="blendedReturn" label="Blended Return" value={`${(blended*100).toFixed(2)}%`} sub={`Real: ${((blended-s.inflation/100)*100).toFixed(2)}%`}/>
          <MC tipKey="inflationImpact" label="Inflation Impact" value={`${((1-Math.pow(1/(1+s.inflation/100),th))*100).toFixed(0)}%`} sub="Purchasing power eroded" color="#f59e0b"/>
          <MC tipKey="requiredReturn" label="Required Return" value={`${((Math.pow(s.targetAmount/Math.max(1,s.currentValue),1/th)-1)*100).toFixed(2)}%`} sub="To reach target (no contributions)" color="#94a3b8"/>
          <MC tipKey="bestScenario" label="Best (P99)" value={fmt(results.best)} sub="1% most optimistic" color="#34d399"/>
          <MC tipKey="worstScenario" label="Worst (P1)" value={fmt(results.worst)} sub="1% most pessimistic" color="#ef4444"/>
        </div>
        <div style={{...panel,borderColor:"rgba(212,175,55,0.25)"}}>
          <div style={{fontSize:11,color:"#8899aa",marginBottom:10,fontWeight:600}}>P50 ({fmt(results.p50)}) × ACCOUNT SPLIT ({s.accountSplit.rrif}/{s.accountSplit.tfsa}/{s.accountSplit.nonReg}) → PRE-FILLED WITHDRAW TAB</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <MC label="RRIF/RRSP Balance" value={fmt(r.rrifBalance)} sub={`${s.accountSplit.rrif}% of P50 · 100% taxable`} color="#D4AF37"/>
            <MC label="TFSA Balance" value={fmt(r.tfsaBalance)} sub={`${s.accountSplit.tfsa}% of P50 · Tax-free`} color="#34d399"/>
            <MC label="Non-Reg Balance" value={fmt(r.nonRegBalance)} sub={`${s.accountSplit.nonReg}% of P50 · Capital gains`} color="#4a90d9"/>
          </div>
          <div style={{fontSize:10,color:"#4a5568",marginTop:10}}>These values are pre-filled in the Withdraw tab. Adjust sliders there to customise. ACB defaulted to 65% of Non-Reg balance.</div>
        </div>
        <div style={{...panel,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}} className="no-print">
          <span style={{fontSize:12,color:"#8899aa",whiteSpace:"nowrap"}}>Save scenario:</span>
          <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="e.g. Balanced Ontario Retirement 2025" style={{flex:1,minWidth:160}}/>
          <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save</button>
        </div>
      </div>
    )}</div>)}

    {/* ══ INCOME ══ */}
    {tab==="income"&&(<div style={{display:"flex",flexDirection:"column",gap:18}}>
      <SH title="Retirement Income Calculator" sub="Model income sources, government benefits, taxes, and net cash flow · Values are NOMINAL (not inflation-adjusted)"/>
      {simDriven&&<div className="syncbar">↑ Retirement Age and Income Target are driven from your Plan tab simulation. Adjust sliders below to customise without affecting the Plan.</div>}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Province &amp; Profile</div>
            <div style={{marginBottom:12}}><label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Province of Residence</label><select value={r.province} onChange={e=>updR("province")(e.target.value)}>{Object.keys(PROV).map(p=><option key={p}>{p}</option>)}</select></div>
            <SR label={<span>Retirement Age {simDriven&&<SyncBadge/>}</span>} value={r.retirementAge} min={55} max={75} step={1} onChange={updR("retirementAge")} format={v=>`${v} yrs`}/>
            <SR label="Life Expectancy" value={r.lifeExpectancy} min={70} max={100} step={1} onChange={updR("lifeExpectancy")} format={v=>`${v} yrs`}/>
          </div>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Government Benefits</div>
            <SR label="CPP Monthly (at 65)" value={r.cppMonthly} min={0} max={1365} step={10} onChange={updR("cppMonthly")} format={v=>fmt(v)} hint="Max: $1,365 · Average: $758/mo"/>
            <SR label="OAS Monthly (at 65)" value={r.oasMonthly} min={0} max={800} step={5} onChange={updR("oasMonthly")} format={v=>fmt(v)} hint="2024: $713/mo · Clawback > $90,997"/>
          </div>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Income Target</div>
            <SR label={<span>Desired Monthly Income {simDriven&&<SyncBadge/>}</span>} value={r.desiredMonthlyIncome} min={1000} max={20000} step={100} onChange={updR("desiredMonthlyIncome")} format={v=>fmt(v)}/>
            <SR label="Portfolio Return in Retirement" value={r.portfolioReturn} min={0} max={12} step={0.25} onChange={updR("portfolioReturn")} format={v=>`${v.toFixed(2)}%`}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            <MC tipKey="cppAnnual" label="CPP Annual" value={fmt(retTax.cppA)} sub={fmt(r.cppMonthly)+"/month"} color="#D4AF37"/>
            <MC tipKey="oasNet" label="OAS Annual (Net)" value={fmt(retTax.oN)} sub={retTax.oasClawback>0?`⚠ Clawback: ${fmt(retTax.oasClawback)}`:"No clawback"} color={retTax.oasClawback>0?"#f59e0b":"#34d399"}/>
            <MC tipKey="rrifMin" label="RRIF Minimum" value={fmt(retTax.rrifMinA)} sub={`Age ${r.retirementAge} · ${(getRRIFRate(r.retirementAge)*100).toFixed(2)}% rate`} color="#4a90d9"/>
            <MC tipKey="effectiveTax" label="Effective Tax Rate" value={fmtP(retTax.tax.effective)} sub={`Marginal: ${fmtP(retTax.tax.marginal)}`} color="#f59e0b"/>
            <MC tipKey="annualTax" label="Annual Tax Payable" value={fmt(retTax.tax.total)} sub={`Fed: ${fmt(retTax.tax.fedTax)} · Prov: ${fmt(retTax.tax.provTax)}`} color="#ef4444"/>
            <MC tipKey="netAnnual" label="Net Annual Income" value={fmt(retTax.tax.netIncome)} sub={fmt(retTax.tax.netIncome/12)+"/month after tax"} color="#22c55e"/>
          </div>
          <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.25)"}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Income Gap Analysis at Age {r.retirementAge}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <MC label="Income Target" value={fmt(retTax.desired)} sub={fmt(r.desiredMonthlyIncome)+"/mo"} color="#e2e8f0"/>
              <MC label="Guaranteed (CPP+OAS)" value={fmt(retTax.cppA+retTax.oN)} sub="Before tax" color="#34d399"/>
              <MC tipKey="gapToFill" label="Gap to Fill" value={fmt(retTax.gap)} sub="From investment accounts" color={retTax.gap>0?"#f59e0b":"#22c55e"}/>
            </div>
            {retTax.oasClawback>0&&<div className="warn">⚠ OAS Clawback: Estimated income of {fmt(retTax.taxable)} exceeds $90,997. You will lose {fmt(retTax.oasClawback)}/yr of OAS. Consider RRSP meltdown before age 71 or deferring OAS to age 70.</div>}
            {retTax.oasClawback===0&&<div className="tipbox">✓ No OAS clawback. Estimated taxable income of {fmt(retTax.taxable)} is below the $90,997 threshold.</div>}
          </div>
          <div style={panel}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Province Comparison at {fmt(retTax.desired)} Annual Income</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
              {Object.keys(PROV).map(pName=>{const t=calcTax(retTax.desired,pName),isSel=pName===r.province;return(<div key={pName} onClick={()=>updR("province")(pName)} style={{padding:"10px 7px",borderRadius:9,border:`1px solid ${isSel?"#D4AF37":"rgba(212,175,55,0.12)"}`,background:isSel?"rgba(212,175,55,0.08)":"transparent",cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}><div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{pName.split(" ")[0]}</div><div style={{fontSize:13,fontFamily:"'DM Serif Display',serif",color:isSel?"#D4AF37":"#94a3b8"}}>{fmtP(t.effective)}</div><div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{fmt(t.total)} tax</div></div>)})}
            </div>
            <div style={{fontSize:10,color:"#4a5568",marginTop:10}}>Click a province to switch · 2024 combined federal + provincial rates</div>
          </div>
        </div>
      </div>
    </div>)}

    {/* ══ WITHDRAW ══ */}
    {tab==="withdraw"&&(<div style={{display:"flex",flexDirection:"column",gap:18}}>
      <SH title="Withdrawal Strategy Optimizer" sub="Tax-efficient decumulation factoring CPP, OAS clawback, RRIF minimums, and account location · Values are NOMINAL"/>
      {simDriven&&<div className="syncbar">↑ Account balances, Retirement Age, and Income Target are pre-filled from your Plan simulation (P50 × account split). Adjust any slider to customise.</div>}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Account Balances at Retirement</div>
            <SR label={<span>RRSP / RRIF Balance {simDriven&&<SyncBadge/>}</span>} value={r.rrifBalance} min={0} max={5000000} step={10000} onChange={updR("rrifBalance")} format={v=>fmt(v)}/>
            <SR label={<span>TFSA Balance {simDriven&&<SyncBadge/>}</span>} value={r.tfsaBalance} min={0} max={2000000} step={5000} onChange={updR("tfsaBalance")} format={v=>fmt(v)}/>
            <SR label={<span>Non-Reg Balance {simDriven&&<SyncBadge/>}</span>} value={r.nonRegBalance} min={0} max={3000000} step={5000} onChange={updR("nonRegBalance")} format={v=>fmt(v)}/>
            <SR label="Non-Reg Cost Base (ACB)" value={r.nonRegACB} min={0} max={Math.max(r.nonRegBalance,r.nonRegACB)} step={5000} onChange={updR("nonRegACB")} format={v=>fmt(v)} hint={`Accrued gain: ${fmt(Math.max(0,r.nonRegBalance-r.nonRegACB))}`}/>
          </div>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Withdrawal Strategy</div>
            <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Withdrawal Order</label>
            <select value={r.withdrawOrder} onChange={e=>updR("withdrawOrder")(e.target.value)} style={{marginBottom:12}}><option value="optimal">Optimal (Tax-Minimizing)</option><option value="rrif-first">RRIF/RRSP First</option><option value="tfsa-first">TFSA First</option><option value="nonreg-first">Non-Registered First</option></select>
            <div style={{fontSize:10,color:"#8899aa",lineHeight:1.7,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:7}}>
              {r.withdrawOrder==="optimal"&&"Draws RRIF minimum + partial top-up, then Non-Reg (capital gains advantage), then TFSA. Preserves TFSA as long-term tax shelter."}
              {r.withdrawOrder==="rrif-first"&&"Maximizes RRIF first to reduce future estate tax. Best for large RRIF balances with no spouse rollover."}
              {r.withdrawOrder==="tfsa-first"&&"Draws TFSA before other accounts. Generally not tax-optimal but useful in specific estate planning contexts."}
              {r.withdrawOrder==="nonreg-first"&&"Draws Non-Reg first to realize capital gains early at lower rates. Effective when non-reg gains are large."}
            </div>
          </div>
          <div style={panel}>
            <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:10}}>Custom Annual Overrides</div>
            <div style={{fontSize:10,color:"#4a5568",marginBottom:10}}>Override strategy for specific ages (in dollars)</div>
            {[r.retirementAge,r.retirementAge+5,r.retirementAge+10,r.retirementAge+15].filter(a=>a<=r.lifeExpectancy).map(age=>{const cust=r.customWithdrawals?.[age]||{};return(<div key={age} style={{marginBottom:11,paddingBottom:11,borderBottom:"1px solid rgba(255,255,255,0.05)"}}><div style={{fontSize:11,color:"#D4AF37",marginBottom:6,fontWeight:500}}>Age {age}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>{[["rrif","RRIF"],["tfsa","TFSA"],["nonReg","Non-Reg"]].map(([k,lbl])=>(<div key={k}><div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{lbl}</div><input type="number" placeholder="0" value={cust[k]||""} onChange={e=>{const v=Number(e.target.value)||0;setR(p=>({...p,customWithdrawals:{...p.customWithdrawals,[age]:{...cust,[k]:v}}}))}} style={{padding:"4px 7px",fontSize:10}}/></div>))}</div></div>)})}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            <MC tipKey="retYears" label="Retirement Duration" value={`${r.lifeExpectancy-r.retirementAge} yrs`} sub={`Age ${r.retirementAge}–${r.lifeExpectancy}`}/>
            <MC tipKey="avgEffRate" label="Avg Effective Tax Rate" value={fmtP(wPlan.reduce((s,y)=>s+y.effectiveRate,0)/Math.max(1,wPlan.length))} sub="Over retirement" color="#f59e0b"/>
            <MC tipKey="totalTaxRet" label="Total Tax in Retirement" value={fmt(wPlan.reduce((s,y)=>s+y.tax,0))} sub="Lifetime tax payable" color="#ef4444"/>
            <MC tipKey="remainEstate" label="Remaining Estate" value={fmt(wPlan[wPlan.length-1]?.totalBal||0)} sub={`At age ${r.lifeExpectancy}`} color="#22c55e"/>
          </div>
          <div style={panel}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Portfolio Balance by Account Type</div>
            <ResponsiveContainer width="100%" height={220}><AreaChart data={wPlan} margin={{top:5,right:15,left:5,bottom:0}}><defs><linearGradient id="gRR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.3}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0}/></linearGradient><linearGradient id="gTF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.3}/><stop offset="100%" stopColor="#34d399" stopOpacity={0}/></linearGradient><linearGradient id="gNR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a90d9" stopOpacity={0.3}/><stop offset="100%" stopColor="#4a90d9" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/><XAxis dataKey="age" stroke="#334155" tick={{fill:"#4a5568",fontSize:10}}/><YAxis stroke="#334155" tick={{fill:"#4a5568",fontSize:10}} tickFormatter={v=>fmt(v)} width={60}/><Tooltip content={<RT/>}/><Legend wrapperStyle={{fontSize:10,color:"#8899aa"}}/><Area type="monotone" dataKey="rrifBal" name="RRIF/RRSP" stroke="#D4AF37" fill="url(#gRR)" strokeWidth={1.5} dot={false}/><Area type="monotone" dataKey="tfsaBal" name="TFSA" stroke="#34d399" fill="url(#gTF)" strokeWidth={1.5} dot={false}/><Area type="monotone" dataKey="nonRegBal" name="Non-Reg" stroke="#4a90d9" fill="url(#gNR)" strokeWidth={1.5} dot={false}/></AreaChart></ResponsiveContainer>
          </div>
          <div style={panel}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Year-by-Year Withdrawal Plan</div>
            <div style={{overflowX:"auto",maxHeight:300,overflowY:"auto"}}>
              <table className="tbl"><thead><tr><th>Age</th><th>RRIF Bal</th><th>TFSA Bal</th><th>Non-Reg</th><th>CPP</th><th>OAS</th><th>RRIF W/D</th><th>TFSA W/D</th><th>NR W/D</th><th>Taxable</th><th>Tax</th><th>Eff%</th><th>Net Income</th></tr></thead>
              <tbody>{wPlan.map(y=>(<tr key={y.age}><td style={{color:"#D4AF37",fontWeight:500}}>{y.age}</td><td>{fmt(y.rrifBal)}</td><td style={{color:"#34d399"}}>{fmt(y.tfsaBal)}</td><td style={{color:"#4a90d9"}}>{fmt(y.nonRegBal)}</td><td>{fmt(y.cpp)}</td><td>{fmt(y.oasNet)}</td><td>{fmt(y.rrifW)}</td><td style={{color:"#34d399"}}>{fmt(y.tfsaW)}</td><td style={{color:"#4a90d9"}}>{fmt(y.nrW)}</td><td>{fmt(y.taxableIncome)}</td><td style={{color:"#ef4444"}}>{fmt(y.tax)}</td><td style={{color:y.effectiveRate>.35?"#ef4444":y.effectiveRate>.25?"#f59e0b":"#22c55e"}}>{fmtP(y.effectiveRate)}</td><td style={{color:"#22c55e",fontWeight:500}}>{fmt(y.netIncome)}</td></tr>))}</tbody></table>
            </div>
          </div>
        </div>
      </div>
    </div>)}

    {/* ══ ESTATE ══ */}
    {tab==="estate"&&(<div style={{display:"flex",flexDirection:"column",gap:18}}>
      <SH title={`Tax at Death & Estate Analysis — ${r.province}`} sub="Estimated tax on each account type based on deemed disposition rules · Values are NOMINAL"/>
      {simDriven&&<div className="syncbar">↑ Account balances are driven from your Plan simulation (P50 × account split). Adjust in the Withdraw tab to update estate projections.</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        {[{key:"RRSP / RRIF",color:"rgba(212,175,55,0.35)",tc:"#D4AF37",gross:estate.rrifGross,tax:estate.rrifTax,net:estate.rrifNet,rate:estate.rrifRate,desc:"Entire balance deemed received as income at death — fully taxable at the highest marginal rate. Rolls tax-free to a surviving spouse's RRSP/RRIF.",extra:null},
          {key:"TFSA",color:"rgba(52,211,153,0.35)",tc:"#34d399",gross:estate.tfsaGross,tax:0,net:estate.tfsaNet,rate:0,desc:"Passes to successor holder (spouse) or beneficiary entirely tax-free. No deemed disposition. The most estate-efficient account in Canada.",extra:null},
          {key:"Non-Registered",color:"rgba(74,144,217,0.35)",tc:"#4a90d9",gross:estate.nonRegGross,tax:estate.nonRegTax,net:estate.nonRegNet,rate:estate.nonRegGross>0?estate.nonRegTax/estate.nonRegGross:0,desc:"Deemed disposed at FMV. Only the accrued gain above ACB is taxable at 50% inclusion rate — more tax-efficient than RRIF at death.",extra:fmt(estate.nonRegGain)}
        ].map(acct=>(<div key={acct.key} style={{...panel,borderColor:acct.color}}><div style={{fontSize:10,letterSpacing:"0.1em",color:acct.tc,textTransform:"uppercase",marginBottom:10}}>{acct.key}</div><div style={{fontSize:11,color:"#4a5568",lineHeight:1.7,marginBottom:14}}>{acct.desc}</div><div style={{display:"flex",flexDirection:"column",gap:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Gross Value</span><span style={{color:"#e2e8f0",fontFamily:"'DM Serif Display',serif"}}>{fmt(acct.gross)}</span></div><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Eff. Tax Rate</span><span style={{color:"#f59e0b"}}>{fmtP(acct.rate)}</span></div>{acct.extra&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Accrued Gain</span><span style={{color:acct.tc}}>{acct.extra}</span></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax Payable</span><span style={{color:"#ef4444",fontFamily:"'DM Serif Display',serif"}}>-{fmt(acct.tax)}</span></div><div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"4px 0"}}/><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#8899aa"}}>Net to Heirs</span><span style={{fontSize:20,color:acct.tc,fontFamily:"'DM Serif Display',serif"}}>{fmt(acct.net)}</span></div></div></div>))}
      </div>
      <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.3)"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"#e2e8f0",marginBottom:14}}>Total Estate Summary</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
          <MC tipKey="estateGross"   label="Total Gross Estate"  value={fmt(estate.totalGross)}  sub="All accounts before tax" color="#e2e8f0" big/>
          <MC tipKey="estateTax"     label="Total Tax at Death"  value={fmt(estate.totalTax)}    sub={`${estate.totalGross>0?fmtP(estate.totalTax/estate.totalGross):"—"} of gross estate`} color="#ef4444" big/>
          <MC tipKey="estateNet"     label="Net Estate to Heirs" value={fmt(estate.totalNet)}    sub="After all taxes" color="#22c55e" big/>
          <MC tipKey="taxEfficiency" label="Tax Efficiency"      value={estate.totalGross>0?fmtP(estate.totalNet/estate.totalGross):"—"} sub="% of estate preserved" color="#D4AF37" big/>
        </div>
        {estate.totalGross>0&&<><div style={{fontSize:10,color:"#8899aa",marginBottom:6}}>Estate composition</div><div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",marginBottom:8}}><div style={{width:`${(estate.rrifNet/estate.totalGross)*100}%`,background:"#D4AF37"}}/><div style={{width:`${(estate.rrifTax/estate.totalGross)*100}%`,background:"rgba(239,68,68,0.7)"}}/><div style={{width:`${(estate.tfsaNet/estate.totalGross)*100}%`,background:"#34d399"}}/><div style={{width:`${(estate.nonRegNet/estate.totalGross)*100}%`,background:"#4a90d9"}}/><div style={{width:`${(estate.nonRegTax/estate.totalGross)*100}%`,background:"rgba(239,68,68,0.4)"}}/></div><div style={{display:"flex",gap:14,fontSize:10,color:"#4a5568",flexWrap:"wrap"}}><span style={{color:"#D4AF37"}}>■ RRIF Net</span><span style={{color:"rgba(239,68,68,0.8)"}}>■ RRIF Tax</span><span style={{color:"#34d399"}}>■ TFSA</span><span style={{color:"#4a90d9"}}>■ Non-Reg Net</span><span style={{color:"rgba(239,68,68,0.5)"}}>■ Non-Reg Tax</span></div></>}
      </div>
      <div style={panel}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>💡 Estate Optimization Strategies</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:11,color:"#94a3b8",lineHeight:1.7}}>
          {estate.rrifGross>200000&&<div style={{padding:"8px 12px",background:"rgba(212,175,55,0.05)",borderRadius:7,borderLeft:"2px solid #D4AF37"}}>• <strong style={{color:"#D4AF37"}}>RRSP Meltdown:</strong> Your RRIF balance of {fmt(estate.rrifGross)} will face a {fmtP(estate.rrifRate)} effective tax rate at death. Consider strategic drawdowns before age 71 to fill lower tax brackets. Try reducing your RRIF split % in the Plan tab to model a lower RRIF proportion.</div>}
          {estate.tfsaGross<estate.totalGross*.15&&<div style={{padding:"8px 12px",background:"rgba(52,211,153,0.05)",borderRadius:7,borderLeft:"2px solid #34d399"}}>• <strong style={{color:"#34d399"}}>Maximize TFSA:</strong> Your TFSA is only {fmtP(estate.tfsaGross/Math.max(estate.totalGross,1))} of your total estate. Try increasing the TFSA % in your Plan tab account split to see the impact on estate efficiency.</div>}
          {estate.nonRegGain>50000&&<div style={{padding:"8px 12px",background:"rgba(74,144,217,0.05)",borderRadius:7,borderLeft:"2px solid #4a90d9"}}>• <strong style={{color:"#4a90d9"}}>Realize Gains Gradually:</strong> You have {fmt(estate.nonRegGain)} in accrued non-reg gains. Consider realizing in low-income retirement years to spread the tax burden.</div>}
          <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:7,borderLeft:"2px solid #475569"}}>• <strong style={{color:"#94a3b8"}}>Successor Holder:</strong> Name your spouse as successor holder on TFSA and successor annuitant on RRIF for tax-free rollovers on death.</div>
          {estate.totalTax>100000&&<div style={{padding:"8px 12px",background:"rgba(239,68,68,0.05)",borderRadius:7,borderLeft:"2px solid #ef4444"}}>• <strong style={{color:"#ef4444"}}>Estate Insurance:</strong> Estimated estate tax of {fmt(estate.totalTax)}. Life insurance can fund this liability efficiently — premiums are often far less than the tax covered.</div>}
        </div>
      </div>
    </div>)}

    {/* ══ SCENARIOS ══ */}
    {tab==="scenarios"&&(<div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <SH title="Saved Plans" sub="Up to 20 complete plans saved in your browser"/>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Name this plan…" style={{width:220}}/>
          <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save Current Plan</button>
        </div>
      </div>
      {scenarios.length===0?(<div style={{...panel,textAlign:"center",padding:"60px 0",color:"#4a5568"}}><div style={{fontSize:40,marginBottom:12}}>📁</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#667788"}}>No plans saved yet</div><div style={{fontSize:12,marginTop:8}}>Run a simulation and use the Save button above</div></div>):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14}}>
          {scenarios.map(sc=>{const c=sc.results?sColor(sc.results.successRate):"#94a3b8";return(<div key={sc.id} style={{...panel,borderColor:activeScenario===sc.id?"rgba(212,175,55,0.5)":"rgba(212,175,55,0.12)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:"#e2e8f0"}}>{sc.name}</div><div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{sc.plan?.goalName||"Plan"} · {sc.plan?.riskProfile||""} · {sc.ret?.province||""} · {sc.date}</div></div>
              {sc.results&&<div style={{fontSize:15,fontFamily:"'DM Serif Display',serif",color:c}}>{sc.results.successRate.toFixed(0)}%</div>}
            </div>
            {sc.results&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}><div><div style={{fontSize:9,color:"#4a5568"}}>Median</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.results.p50)}</div></div><div><div style={{fontSize:9,color:"#4a5568"}}>Pessimistic</div><div style={{fontSize:12,color:"#ef4444"}}>{fmt(sc.results.p10)}</div></div><div><div style={{fontSize:9,color:"#4a5568"}}>Optimistic</div><div style={{fontSize:12,color:"#22c55e"}}>{fmt(sc.results.p90)}</div></div></div>}
            {sc.ret&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}><div><div style={{fontSize:9,color:"#4a5568"}}>RRIF</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.ret.rrifBalance)}</div></div><div><div style={{fontSize:9,color:"#4a5568"}}>TFSA</div><div style={{fontSize:12,color:"#34d399"}}>{fmt(sc.ret.tfsaBalance)}</div></div><div><div style={{fontSize:9,color:"#4a5568"}}>Non-Reg</div><div style={{fontSize:12,color:"#4a90d9"}}>{fmt(sc.ret.nonRegBalance)}</div></div></div>}
            <div style={{display:"flex",gap:7}}><button className="btn-ghost" style={{flex:1}} onClick={()=>loadSc(sc)}>↩ Load Plan</button><button className="btn-ghost" onClick={()=>delSc(sc.id)} style={{color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}}>✕</button></div>
          </div>)})}
        </div>
      )}
    </div>)}

    {/* ══ FAQ ══ */}
    {tab==="faq"&&(<div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:900,margin:"0 auto",width:"100%"}}>
      <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"#e2e8f0",marginBottom:6}}>Frequently Asked Questions</div><div style={{fontSize:12,color:"#4a5568",lineHeight:1.7}}>Complete reference covering every feature, metric, and concept. Hover any metric card for 1.5s anywhere in the app for an instant inline explanation.</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{FAQ_SECTIONS.map((sec,i)=>(<div key={i} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${sec.color}40`,background:`${sec.color}12`,fontSize:11,color:sec.color}}>{sec.category} ({sec.items.length})</div>))}</div>
      <FAQAccordion/>
      <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.2)",textAlign:"center",padding:"16px"}}><div style={{fontSize:12,color:"#8899aa",lineHeight:1.8}}>💡 <strong style={{color:"#D4AF37"}}>Pro tip:</strong> Hover any metric card for <strong style={{color:"#D4AF37"}}>1.5 seconds</strong> to see how it connects to the rest of the plan.</div></div>
    </div>)}

    </div>
  </div>)
}
