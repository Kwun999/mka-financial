import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

// ── Storage ──────────────────────────────────────────────────────────────────
const SK = "mka_fp_v3"; const SCENARIOS_KEY = "mka_scenarios_v3";
const loadAll = () => { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : {}; } catch { return {}; } };
const saveAll = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };
const loadScenarios = () => { try { const r = localStorage.getItem(SCENARIOS_KEY); return r ? JSON.parse(r) : []; } catch { return []; } };
const saveScenarios = (l) => { try { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(l)); } catch {} };

// ── Tax Engine ───────────────────────────────────────────────────────────────
const FED_BRACKETS = [{min:0,max:55867,rate:.15},{min:55867,max:111733,rate:.205},{min:111733,max:154906,rate:.26},{min:154906,max:220000,rate:.29},{min:220000,max:Infinity,rate:.33}];
const FED_BASIC = 15705;
const PROV = {
  "Alberta":              {b:[{m:0,x:148269,r:.10},{m:148269,x:177922,r:.12},{m:177922,x:237230,r:.13},{m:237230,x:355845,r:.14},{m:355845,x:Infinity,r:.15}],p:21003},
  "British Columbia":     {b:[{m:0,x:45654,r:.0506},{m:45654,x:91310,r:.077},{m:91310,x:104835,r:.105},{m:104835,x:127299,r:.1229},{m:127299,x:172602,r:.147},{m:172602,x:240716,r:.168},{m:240716,x:Infinity,r:.205}],p:11981},
  "Manitoba":             {b:[{m:0,x:36842,r:.108},{m:36842,x:79625,r:.1275},{m:79625,x:Infinity,r:.174}],p:15780},
  "New Brunswick":        {b:[{m:0,x:47715,r:.094},{m:47715,x:95431,r:.1482},{m:95431,x:176756,r:.1652},{m:176756,x:Infinity,r:.195}],p:12458},
  "Newfoundland":         {b:[{m:0,x:43198,r:.087},{m:43198,x:86395,r:.145},{m:86395,x:154244,r:.158},{m:154244,x:215943,r:.178},{m:215943,x:Infinity,r:.198}],p:10818},
  "Nova Scotia":          {b:[{m:0,x:29590,r:.0879},{m:29590,x:59180,r:.1495},{m:59180,x:93000,r:.1667},{m:93000,x:150000,r:.175},{m:150000,x:Infinity,r:.21}],p:8481},
  "Ontario":              {b:[{m:0,x:51446,r:.0505},{m:51446,x:102894,r:.0915},{m:102894,x:150000,r:.1116},{m:150000,x:220000,r:.1216},{m:220000,x:Infinity,r:.1316}],p:11865,surtax:true},
  "Prince Edward Island": {b:[{m:0,x:32656,r:.0965},{m:32656,x:64313,r:.1363},{m:64313,x:105000,r:.1665},{m:105000,x:140000,r:.18},{m:140000,x:Infinity,r:.1875}],p:12000},
  "Quebec":               {b:[{m:0,x:51780,r:.14},{m:51780,x:103545,r:.19},{m:103545,x:126000,r:.24},{m:126000,x:Infinity,r:.2575}],p:17183},
  "Saskatchewan":         {b:[{m:0,x:49720,r:.105},{m:49720,x:142058,r:.125},{m:142058,x:Infinity,r:.145}],p:17661},
};
function bracketTax(income, brackets, personal) {
  const ti = Math.max(0, income - personal); let tax = 0;
  for (const b of brackets) {
    const lo = b.min||b.m||0, hi = b.max||b.x||Infinity, rate = b.rate||b.r||0;
    if (ti <= lo) break; tax += (Math.min(ti, hi) - lo) * rate;
  }
  return tax;
}
function calcTax(income, provName) {
  if (income <= 0) return {fedTax:0,provTax:0,total:0,effective:0,marginal:0,netIncome:0};
  const prov = PROV[provName] || PROV["Ontario"];
  const fedTax = bracketTax(income, FED_BRACKETS, FED_BASIC);
  let provTax = bracketTax(income, prov.b, prov.p);
  if (prov.surtax && provTax > 5315) provTax += (provTax - 5315) * 0.20;
  if (prov.surtax && provTax > 6802)  provTax += (provTax - 6802)  * 0.36;
  const total = Math.max(0, fedTax + provTax), effective = total / income;
  const ti = income - FED_BASIC;
  const mFed = FED_BRACKETS.find(b => ti >= b.min && ti < b.max)?.rate || 0.15;
  const tiP = income - prov.p;
  const mProv = prov.b.find(b => tiP >= (b.m||b.min||0) && tiP < (b.x||b.max||Infinity))?.r || 0;
  return {fedTax, provTax, total, effective, marginal: mFed + mProv, netIncome: income - total};
}
const OAS_CLAWBACK_START = 90997;
function oasAfterClawback(totalIncome, oasAnnual) {
  if (totalIncome <= OAS_CLAWBACK_START) return oasAnnual;
  return Math.max(0, oasAnnual - (totalIncome - OAS_CLAWBACK_START) * 0.15);
}
const RRIF_MIN_RATES = {65:.040,66:.041,67:.042,68:.044,69:.045,70:.050,71:.0528,72:.054,73:.0556,74:.0571,75:.0582,76:.0596,77:.0611,78:.0629,79:.0647,80:.0682,81:.0697,82:.0713,83:.0735,84:.0758,85:.0851,86:.0876,87:.0902,88:.0930,89:.0963,90:.1000,91:.1111,92:.1250,93:.1428,94:.1666,95:.2000};
function getRRIFRate(age) { const keys = Object.keys(RRIF_MIN_RATES).map(Number).sort((a,b)=>a-b); let r=.04; for(const k of keys){if(age>=k)r=RRIF_MIN_RATES[k]} return r; }

// ── Monte Carlo ───────────────────────────────────────────────────────────────
function gaussRandom(){let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function runMonteCarlo({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation,targetAmount,runs=1200}){
  const results=[]; const realReturn=blendedReturn-inflation;
  for(let i=0;i<runs;i++){let pv=currentValue;for(let y=0;y<timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution}results.push(pv)}
  results.sort((a,b)=>a-b); const pct=(p)=>results[Math.floor((p/100)*results.length)];
  return{successRate:(results.filter(v=>v>=targetAmount).length/runs)*100,p10:pct(10),p25:pct(25),p50:pct(50),p75:pct(75),p90:pct(90),worst:results[0],best:results[results.length-1]}
}
function buildProjectionData({currentValue,annualContribution,timeHorizon,blendedReturn,stdDev,inflation}){
  const realReturn=blendedReturn-inflation; const RUNS=800;
  const yv=Array.from({length:timeHorizon+1},()=>[]);
  for(let i=0;i<RUNS;i++){let pv=currentValue;yv[0].push(pv);for(let y=1;y<=timeHorizon;y++){pv=pv*(1+realReturn+stdDev*gaussRandom())+annualContribution;yv[y].push(pv)}}
  return yv.map((vals,yr)=>{const s=vals.slice().sort((a,b)=>a-b);const p=(pc)=>Math.max(0,s[Math.floor((pc/100)*s.length)]||0);return{year:yr,p10:p(10),p25:p(25),p50:p(50),p75:p(75),p90:p(90)}})
}

// ── Withdrawal Engine ─────────────────────────────────────────────────────────
function buildWithdrawalPlan(r){
  let rrif=r.rrifBalance,tfsa=r.tfsaBalance,nonReg=r.nonRegBalance;
  const acbRatio=r.nonRegBalance>0?Math.min(1,r.nonRegACB/r.nonRegBalance):1;
  const retRate=r.portfolioReturn/100,cpp=r.cppMonthly*12,oasGross=r.oasMonthly*12,desired=r.desiredMonthlyIncome*12;
  const years=[];
  for(let age=r.retirementAge;age<=r.lifeExpectancy;age++){
    rrif*=(1+retRate);tfsa*=(1+retRate);nonReg*=(1+retRate);
    const rrifMin=rrif*getRRIFRate(age),custom=r.customWithdrawals?.[age];
    const guaranteed=cpp+oasAfterClawback(cpp+oasGross+rrifMin,oasGross);
    const gap=Math.max(0,desired-guaranteed);
    let rrifW=0,tfsaW=0,nonRegW=0;
    if(custom&&(custom.rrif||custom.tfsa||custom.nonReg)){
      rrifW=Math.min(custom.rrif||0,rrif);tfsaW=Math.min(custom.tfsa||0,tfsa);nonRegW=Math.min(custom.nonReg||0,nonReg);
    } else {
      rrifW=Math.min(Math.max(rrifMin,gap*.5),rrif);const rem=Math.max(0,gap-rrifW);
      if(r.withdrawOrder==="optimal"){nonRegW=Math.min(rem*.6,nonReg);tfsaW=Math.min(Math.max(0,gap-rrifW-nonRegW),tfsa);}
      else if(r.withdrawOrder==="tfsa-first"){tfsaW=Math.min(rem,tfsa);nonRegW=Math.min(Math.max(0,gap-rrifW-tfsaW),nonReg);}
      else if(r.withdrawOrder==="nonreg-first"){nonRegW=Math.min(rem,nonReg);tfsaW=Math.min(Math.max(0,gap-rrifW-nonRegW),tfsa);}
      else{rrifW=Math.min(Math.max(rrifMin,gap),rrif);nonRegW=Math.min(Math.max(0,gap-rrifW),nonReg);}
    }
    const nonRegTaxableGain=nonRegW*(1-acbRatio)*.5;
    const oasNet=oasAfterClawback(cpp+oasGross+rrifW,oasGross);
    const taxableIncome=cpp+oasNet+rrifW+nonRegTaxableGain;
    const tax=calcTax(taxableIncome,r.province);
    rrif=Math.max(0,rrif-rrifW);tfsa=Math.max(0,tfsa-tfsaW);nonReg=Math.max(0,nonReg-nonRegW);
    const totalIncome=(cpp+oasNet)+rrifW+tfsaW+nonRegW;
    years.push({age,rrifBal:rrif,tfsaBal:tfsa,nonRegBal:nonReg,totalBal:rrif+tfsa+nonReg,cpp,oasNet,rrifW,tfsaW,nonRegW,totalIncome,taxableIncome,tax:tax.total,effectiveRate:tax.effective,netIncome:totalIncome-tax.total,marginal:tax.marginal});
  }
  return years;
}
function calcEstate(r){
  const prov=r.province,rrifTaxObj=calcTax(r.rrifBalance,prov);
  const nonRegGain=Math.max(0,r.nonRegBalance-r.nonRegACB);
  const nonRegTaxable=r.nonRegACB+nonRegGain*.5;
  const nonRegTaxOnGain=Math.max(0,calcTax(nonRegTaxable,prov).total-calcTax(r.nonRegACB,prov).total);
  return{rrifGross:r.rrifBalance,rrifTax:rrifTaxObj.total,rrifNet:r.rrifBalance-rrifTaxObj.total,rrifRate:rrifTaxObj.effective,
    tfsaGross:r.tfsaBalance,tfsaTax:0,tfsaNet:r.tfsaBalance,
    nonRegGross:r.nonRegBalance,nonRegGain,nonRegTax:nonRegTaxOnGain,nonRegNet:r.nonRegBalance-nonRegTaxOnGain,
    totalGross:r.rrifBalance+r.tfsaBalance+r.nonRegBalance,
    totalTax:rrifTaxObj.total+nonRegTaxOnGain,
    totalNet:(r.rrifBalance-rrifTaxObj.total)+r.tfsaBalance+(r.nonRegBalance-nonRegTaxOnGain)};
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt=(v)=>v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(0)}K`:`$${Math.round(Math.abs(v))}`;
const fmtPct=(v)=>`${(v*100).toFixed(1)}%`;
const successColor=(r)=>r>=80?"#22c55e":r>=60?"#f59e0b":"#ef4444";

// ── Tooltip Descriptions ──────────────────────────────────────────────────────
const TIPS = {
  successRate:    {title:"Probability of Success",     rel:"Primary goal metric — drives everything else",      body:"The % of 1,200 Monte Carlo simulations where the final portfolio met or exceeded your Target Amount. Above 80% is strong. 60–80% is acceptable with flexibility. Below 60% means the goal needs adjustment. This is your primary planning health indicator — all other metrics explain why it is what it is."},
  p50:            {title:"Median Outcome (P50)",        rel:"Relates to: Success Rate & Surplus/Shortfall",      body:"The middle result across 1,200 simulations — half ended above this, half below. Expressed in TODAY'S purchasing power (inflation-adjusted). Compare directly to your Target Amount to determine surplus or shortfall. If P50 exceeds your target, Probability of Success will be above 50%."},
  p90:            {title:"Optimistic Outcome (P90)",    rel:"Relates to: P50 Median & Volatility Setting",       body:"Only 10% of simulations ended above this — a fortunate scenario where markets cooperated more than average. The gap between P90 and P50 shows your upside potential and widens with higher volatility. Never use P90 as your planning target — always use P50 as the baseline."},
  p10:            {title:"Pessimistic Outcome (P10)",   rel:"Relates to: P50 Median & Volatility Setting",       body:"Only 10% of simulations ended below this — a poor but realistic scenario. If P10 still exceeds your Target Amount, the plan is robust even in bad markets. Higher volatility widens the gap between P10 and P50, increasing uncertainty in both directions."},
  surplus:        {title:"Projected Surplus",           rel:"Relates to: P50 Median vs. Target Amount",          body:"How far your median (P50) outcome sits above your Target Amount, in today's purchasing power. A surplus generally correlates with a higher Probability of Success. To grow it: increase monthly contributions, raise equity allocation, or lower the target."},
  shortfall:      {title:"Projected Shortfall",         rel:"Relates to: P50 Median vs. Target Amount",          body:"How far your median (P50) falls below your Target Amount. A shortfall does not always mean failure — Probability of Success can still exceed 50% if outcomes are skewed. To close it: raise contributions, extend the time horizon, increase equity allocation, or reduce the target."},
  monthlyIncome:  {title:"Estimated Monthly Income",    rel:"Derives from: P50 Median × 4% Rule",                body:"Applies the 4% safe withdrawal rate (Bengen 1994) to your median portfolio: P50 × 4% ÷ 12. Estimates sustainable monthly income for a 30-year retirement without depleting capital. Compare to your Desired Monthly Income in the Income tab to check if your accumulation goal aligns with your spending needs."},
  annualIncome:   {title:"Estimated Annual Income",     rel:"Derives from: P50 Median × 4% Rule",                body:"Your median portfolio (P50) × 4% — the annual sustainable withdrawal estimate from investments alone. Add CPP and OAS (Income tab) to get the total retirement income picture. If this plus government benefits exceeds your desired income, your accumulation goal is well-sized."},
  totalContrib:   {title:"Total Contributions (Nominal)",rel:"Relates to: Current Portfolio & Monthly Contribution",body:"Your starting portfolio plus all future monthly contributions — in nominal dollars actually deposited, not adjusted for inflation. The difference between this and your P50 outcome represents pure compounding growth. A large gap here shows compounding working strongly in your favour."},
  blendedReturn:  {title:"Blended Return",              rel:"Drives: Real Return & all Monte Carlo projections",  body:"Weighted average of your three asset class returns based on allocation percentages. This is nominal — the Real Return below it subtracts inflation and is the actual rate used in every simulation. Raising equity allocation increases blended return, boosting P50 and success rate, but also raises volatility, widening the P10–P90 range."},
  inflationImpact:{title:"Inflation Impact on Purchasing Power",rel:"Relates to: Real Return & Time Horizon",     body:"The percentage of purchasing power silently eroded by inflation over your time horizon: 1 − 1/(1+Inflation)^Years. All P10/P50/P90 results are already adjusted for this — they are in today's purchasing power. This metric shows what nominal growth inflation consumed. A longer horizon amplifies this effect significantly."},
  requiredReturn: {title:"Required Return (No Contributions)",rel:"Compare directly to your Blended Return",      body:"The annual return your current portfolio alone would need to reach your Target with zero additional contributions. Formula: (Target ÷ Portfolio)^(1÷Years) − 1. If Blended Return exceeds this number, contributions can bridge the gap. If not, you need higher contributions, a lower target, or a higher-return allocation."},
  bestScenario:   {title:"Best Scenario (P99)",         rel:"Upper extreme beyond P90",                           body:"The single best outcome across all 1,200 simulations — the 99th percentile. Represents exceptional sustained market performance. Useful as an upper boundary reference, but should never be used as a planning target. The realistic planning range is between P10 (pessimistic) and P90 (optimistic)."},
  worstScenario:  {title:"Worst Scenario (P1)",         rel:"Lower extreme beyond P10",                           body:"The single worst outcome across all 1,200 simulations — the 1st percentile. Represents sustained poor markets combined with bad timing. If even this worst case still leaves you above zero, the plan has a very robust floor. Compare to your minimum acceptable retirement lifestyle to stress-test the plan."},
  cppAnnual:      {title:"CPP Annual Income",           rel:"Part of: Guaranteed Income floor alongside OAS",     body:"Total annual CPP benefit (monthly × 12). CPP is 100% taxable as income but not subject to OAS clawback rules. CPP and OAS together form your guaranteed income floor — money you receive regardless of investment performance. The higher this number, the smaller the gap your portfolio must fill each year in retirement."},
  oasNet:         {title:"OAS Annual (Net of Clawback)", rel:"Driven by: RRIF Minimum & Total Taxable Income",    body:"Your OAS benefit after the Recovery Tax. OAS is clawed back at 15¢ per dollar of net income above $90,997 (2024). The primary driver of clawback is your RRIF minimum withdrawal — a larger RRIF means more mandatory income, pushing you above the threshold. Strategies: RRSP meltdown before 71, or deferring OAS to age 70 (adds 7.2%/yr)."},
  rrifMin:        {title:"RRIF Minimum Withdrawal",     rel:"Key driver of: Taxable Income & OAS Clawback",       body:"The mandatory minimum CRA requires you to withdraw from your RRIF each year based on age. Rates rise annually: 4% at 65, 5.28% at 71, 6.82% at 80, 10% at 90. This withdrawal is 100% taxable as income and is the primary factor setting your effective tax rate, potential OAS clawback, and net retirement income. A large RRIF amplifies all these effects."},
  effectiveTax:   {title:"Effective Tax Rate",          rel:"The blended result of all income sources across all brackets",body:"Total tax divided by total taxable income — always lower than your marginal rate. Summarizes what fraction of retirement income goes to CRA. Use the province comparison grid below to find the most tax-efficient province for your income level. Rate is driven primarily by how much RRIF income you have each year."},
  annualTax:      {title:"Annual Tax Payable",          rel:"Directly reduces: Net Annual Income",                 body:"Combined federal and provincial income tax. This dollar amount directly reduces your spendable income. Reducing taxable income — by drawing from TFSA (tax-free) or managing RRIF withdrawals — is how you lower this. The Withdraw tab shows exactly how different strategies affect annual tax across your entire retirement."},
  netAnnual:      {title:"Net Annual Income",           rel:"The bottom line: income after all taxes",             body:"Total retirement income minus all tax — your actual spendable amount per year. Compare this ×12 to your Desired Monthly Income to see if your plan works. If it falls short, you need a larger portfolio, different withdrawal sequencing, or a lower spending target."},
  gapToFill:      {title:"Income Gap to Fill",          rel:"CPP + OAS versus your Desired Retirement Income",     body:"Annual income your investment accounts (RRIF, TFSA, Non-Reg) must provide beyond CPP and OAS. Formula: Desired Annual − (CPP + OAS Net). The larger this gap, the more dependent you are on portfolio performance. Go to the Withdraw tab to see how your three accounts fill this gap year by year under different strategies."},
  retYears:       {title:"Retirement Duration",         rel:"Drives: total lifetime tax & remaining estate balance",body:"Number of years your retirement income plan runs from Retirement Age to Life Expectancy. Longer duration means more years of tax-free TFSA growth but also more total RRIF withdrawals and tax paid. Directly affects the Remaining Estate balance — longer durations generally deplete more RRIF while TFSA compounds longer."},
  avgEffRate:     {title:"Average Effective Tax Rate",  rel:"Weighted average of all yearly effective rates",       body:"Average effective tax rate across all retirement years. Shows overall tax efficiency of your chosen withdrawal strategy. The Optimal strategy minimizes this figure by drawing accounts in the most tax-efficient order. Comparing Optimal vs RRIF-First shows the lifetime tax savings — which translates directly into more estate for your heirs."},
  totalTaxRet:    {title:"Total Tax Paid in Retirement",rel:"Sum of the annual Tax column in the withdrawal table", body:"Total income tax paid across all retirement years. The lifetime cost of RRIF and other taxable withdrawals. This is the key metric for evaluating withdrawal strategy efficiency. Switching to Optimal from RRIF-First can reduce this significantly by using TFSA (tax-free) and non-reg capital gains (50% inclusion) instead of fully taxable RRIF income."},
  remainEstate:   {title:"Remaining Estate at Life Expectancy",rel:"Total of all three account balances at final plan year",body:"Combined value of RRIF + TFSA + Non-Reg at your Life Expectancy age — in nominal future dollars, not inflation-adjusted. This is before estate tax at death. Go to the Estate tab to see how much tax this balance triggers and what heirs actually receive. A large RRIF here is the most tax-inefficient estate asset."},
  estateGross:    {title:"Total Gross Estate",          rel:"Sum of RRIF + TFSA + Non-Reg balances",               body:"Combined fair market value of all three accounts before tax at death. Each account has a very different tax fate: RRIF is fully taxed as income, TFSA passes completely tax-free, and Non-Reg is taxed only on 50% of the accrued gain. Account location — which assets sit where — dramatically affects how much your heirs actually receive."},
  estateTax:      {title:"Total Tax at Death",          rel:"Driven almost entirely by your RRIF balance",          body:"Estimated combined tax triggered on all accounts at death. Most comes from the RRIF — its entire balance is deemed received as income at the marginal rate on the terminal return. Non-Reg contributes less because only 50% of the gain is taxable. TFSA contributes $0. This is what RRSP meltdown strategies and estate insurance are designed to reduce."},
  estateNet:      {title:"Net Estate to Heirs",         rel:"Gross Estate minus Total Tax at Death",                body:"What heirs actually receive after CRA collects its share. Maximize this by: (1) maximizing TFSA during life, (2) strategic RRIF meltdown before death, (3) gradually realizing non-reg capital gains in low-income years, (4) using life insurance to fund the tax liability. The optimization tips below show specific strategies for your numbers."},
  taxEfficiency:  {title:"Tax Efficiency of Estate",    rel:"Net Estate divided by Gross Estate",                  body:"The percentage of your gross estate that successfully transfers to heirs after all taxes. Formula: Net Estate ÷ Gross Estate × 100%. A TFSA-heavy estate can approach 90–100% efficiency. A heavily RRIF-weighted estate may achieve only 55–65%. Use this as a single benchmark when comparing estate scenarios or evaluating account location strategies."},
};

// ── HoverTip Component — shows after 1.5s, hides on mouse leave ───────────────
function HoverTip({ tipKey, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);
  const tip = TIPS[tipKey];
  if (!tip) return children;

  const handleEnter = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      let left = rect.left;
      let top  = rect.bottom + 10;
      if (left + 320 > window.innerWidth) left = window.innerWidth - 328;
      if (left < 6) left = 6;
      if (top + 180 > window.innerHeight) top = rect.top - 190;
      setPos({ top, left });
    }
    timerRef.current = setTimeout(() => setVisible(true), 1500);
  };
  const handleLeave = () => { clearTimeout(timerRef.current); setVisible(false); };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div ref={wrapRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}
      style={{ position: "relative", cursor: "help" }}>
      {children}
      {/* ? badge */}
      <div style={{ position:"absolute", top:5, right:5, width:13, height:13,
        borderRadius:"50%", background:"rgba(212,175,55,0.15)", border:"1px solid rgba(212,175,55,0.4)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:8, color:"#D4AF37", fontWeight:700, pointerEvents:"none" }}>?</div>
      {/* Tooltip bubble — fixed positioned so it escapes overflow:hidden containers */}
      {visible && (
        <div style={{ position:"fixed", top:pos.top, left:pos.left, zIndex:9999,
          width:310, pointerEvents:"none", animation:"tipFade 0.18s ease" }}>
          <div style={{ background:"#0b1422", border:"1px solid rgba(212,175,55,0.5)",
            borderRadius:10, padding:"13px 15px", boxShadow:"0 16px 48px rgba(0,0,0,0.75)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#D4AF37", marginBottom:4, lineHeight:1.3 }}>{tip.title}</div>
            <div style={{ fontSize:9.5, color:"#34d399", marginBottom:8, fontStyle:"italic" }}>{tip.rel}</div>
            <div style={{ fontSize:9.5, color:"#cbd5e1", lineHeight:1.75 }}>{tip.body}</div>
          </div>
          {/* Arrow */}
          <div style={{ position:"absolute", top:-6, left:20, width:0, height:0,
            borderLeft:"6px solid transparent", borderRight:"6px solid transparent",
            borderBottom:"6px solid rgba(212,175,55,0.5)" }}/>
        </div>
      )}
    </div>
  );
}

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const FAQ_SECTIONS = [
  { category:"Getting Started", color:"#D4AF37", items:[
    {q:"What is MKA Financial and who is it for?", a:"MKA Financial is a browser-based Canadian financial planning tool for financial planners and their clients. It combines a Monte Carlo simulation engine with a comprehensive Canadian tax model covering all 10 provinces, RRSP/RRIF rules, TFSA rules, CPP, OAS clawback, and estate planning. No account or login is required — all data is saved locally in your browser."},
    {q:"How do I navigate the application?", a:"Seven tabs appear at the top: Plan, Results, Income, Withdraw, Estate, Saved, and FAQ. Work left to right for a complete financial plan. All inputs are automatically saved as you type — close and reopen the tab without losing your work."},
    {q:"Do I need to click Save after adjusting sliders?", a:"No. All sliders update calculations in real time. The only exception is the Monte Carlo simulation, which requires clicking Run because it performs 1,200 independent simulations and takes a moment to compute."},
    {q:"What are the ? badges on the metric cards?", a:"Every metric card has a small gold ? badge in the top-right corner. Hover your mouse over any card for 1.5 seconds to see a detailed tooltip explaining what that metric means, how it is calculated, and how it relates to other metrics in the plan. Move your mouse away to dismiss it."},
  ]},
  { category:"Plan Tab", color:"#4a90d9", items:[
    {q:"What are the Goal Presets?", a:"Six preset buttons — Retirement, Education Fund, Home Purchase, Emergency Fund, Business Launch, and Wealth Legacy — automatically fill in a sensible target amount, time horizon, and asset allocation. Fine-tune any value with the sliders afterward. They are starting points, not locked templates."},
    {q:"Is the Target Amount in today's dollars or future dollars?", a:"Today's dollars (real, inflation-adjusted). The Monte Carlo engine subtracts your inflation rate from your blended return before projecting, so a target of $2,500,000 means $2.5M in TODAY'S purchasing power. All Results tab outcomes are also in today's dollars for direct comparison."},
    {q:"How is the Blended Return calculated?", a:"It is the weighted average of your three asset class returns based on their allocation percentages. Formula: (Equity% × Return + Bond% × Return + Cash% × Return) ÷ Total%. The Real Return below it subtracts your inflation assumption and is the actual rate used inside every simulation."},
    {q:"What does the Standard Deviation (volatility) setting do?", a:"It controls how much annual returns vary around the average in each simulation. Higher volatility = wider fan chart = more uncertainty in outcomes. Conservative portfolios: 6–8%. Balanced: 10–14%. Aggressive: 15–20%. Increasing volatility widens the gap between P10 and P90 without changing P50 much."},
  ]},
  { category:"Results & Monte Carlo", color:"#34d399", items:[
    {q:"What is a Monte Carlo simulation?", a:"Instead of projecting a single straight line, the app runs 1,200 independent simulations. In each run, every year gets a randomly generated return drawn from a normal distribution centred on your real return with your chosen standard deviation. This produces 1,200 different final portfolio values, sorted into percentile bands (P10 through P90)."},
    {q:"Are the Results tab values inflation-adjusted?", a:"Yes — all dollar values in the Results tab are in today's purchasing power (real, inflation-adjusted). The simulation subtracts your inflation rate from the blended return before running. A P50 result of $1,500,000 means that amount in today's purchasing power — not in future nominal dollars."},
    {q:"What Probability of Success should I aim for?", a:"Above 80% is generally considered strong. 60–80% is acceptable for clients with spending flexibility. Below 60% means the goal needs adjustment — lower target, higher contributions, longer time horizon, or more equity. The gauge colour reflects this: green = strong, amber = moderate, red = needs attention."},
    {q:"What is the 4% Rule and why is it used?", a:"The 4% Rule (Bengen, 1994) suggests that withdrawing 4% of your portfolio in retirement year one historically has not depleted a balanced portfolio over 30 years. The Monthly and Annual Income metrics apply this to your P50 median to estimate sustainable income. Compare to your Desired Monthly Income in the Income tab."},
    {q:"What is the difference between P10, P50, and P90?", a:"Percentile rankings of 1,200 simulation outcomes. P10: 10% of simulations ended below this value (pessimistic but realistic). P50: the median — half ended above, half below. P90: 90% ended below this value (optimistic scenario). Use P50 as your planning baseline and P10 as a stress test."},
  ]},
  { category:"Income Tab & Canadian Benefits", color:"#f59e0b", items:[
    {q:"Are the Income tab values inflation-adjusted?", a:"No — the Income tab shows NOMINAL values representing actual dollar amounts you will receive at retirement. Do not directly compare these to your inflation-adjusted Monte Carlo target. At 2.5% inflation over 20 years, $72,000 nominal retirement income equals approximately $43,600 in today's purchasing power."},
    {q:"What is the OAS Clawback and when does it trigger?", a:"The OAS Recovery Tax reduces your OAS benefit by 15 cents for every dollar of net income above $90,997 (2024). The key driver is your RRIF minimum withdrawal — a larger RRIF creates more mandatory income, pushing you above the threshold. Strategies: RRSP meltdown before 71, or deferring OAS to age 70 (adds 7.2% per year deferred)."},
    {q:"What is the RRIF Minimum Withdrawal?", a:"When you convert your RRSP to a RRIF (mandatory by age 71), CRA requires a minimum annual withdrawal based on your age. Rates rise each year: 4% at 65, 5.28% at 71, 6.82% at 80, 10% at 90. This withdrawal is 100% taxable as income and is the primary driver of taxable income in retirement."},
    {q:"How does the province comparison grid work?", a:"The grid shows the effective tax rate and total tax for your desired retirement income in every Canadian province using 2024 rates. Click any province to instantly switch all tax calculations across Income, Withdraw, and Estate tabs. Ideal for planning with clients considering relocation in retirement."},
  ]},
  { category:"Withdraw Tab & Strategy", color:"#4a90d9", items:[
    {q:"What does the Optimal withdrawal strategy do?", a:"Draws the RRIF minimum plus 50% of the income gap, then fills the remainder with Non-Registered withdrawals (benefiting from the 50% capital gains inclusion rate), then TFSA for the balance. This preserves TFSA as long as possible — it grows tax-free and passes to heirs tax-free — minimizing lifetime taxes paid."},
    {q:"What is ACB (Adjusted Cost Base)?", a:"What you originally paid for your non-registered investments. Subtract ACB from market value to get the capital gain. Only 50% of the capital gain is included in taxable income (50% inclusion rate). A higher ACB means a smaller taxable gain and less tax on withdrawals and at death."},
    {q:"When should I use RRIF-First strategy instead of Optimal?", a:"Most beneficial when you have a very large RRIF and no surviving spouse (who could receive a tax-free rollover). Drawing down the RRIF aggressively reduces the estate tax liability at death. However, it increases taxable income during retirement — potentially triggering OAS clawback. Compare Total Tax in Retirement across strategies to see the trade-off."},
    {q:"How do Custom Annual Overrides work?", a:"Override the automated strategy for specific ages (at retirement, +5, +10, +15 years). Enter specific dollar amounts for RRIF, TFSA, and Non-Reg at those ages. When entered, strategy logic is bypassed for that year. Useful for modelling large purchases, gifting strategies, travel years, or RRSP meltdown withdrawals before age 71."},
  ]},
  { category:"Estate Tab & Tax at Death", color:"#ef4444", items:[
    {q:"How is the RRIF taxed at death?", a:"The entire RRIF balance is deemed received as income on the final tax return — fully taxed at the highest marginal rate. There is no capital gains treatment. Exception: if left to a surviving spouse, it rolls over to their RRSP/RRIF completely tax-free, deferring the tax until they withdraw."},
    {q:"Why is the TFSA tax-free at death?", a:"The TFSA is designed to be tax-free at all stages. If a successor holder (spouse) is named, the TFSA absorbs into their account without affecting their contribution room. Always name a successor holder rather than just a beneficiary for maximum estate efficiency."},
    {q:"How is Non-Registered estate tax calculated?", a:"At death, all non-registered assets are deemed disposed at fair market value. Only the capital gain (market value minus ACB) is taxable — and only 50% of the gain is included in income. Formula: Tax = calcTax(ACB + Gain × 50%) − calcTax(ACB). This makes non-registered accounts significantly more tax-efficient than RRIFs at death."},
    {q:"What is an RRSP Meltdown strategy?", a:"Deliberately withdrawing from RRSP/RRIF in years when your marginal rate is lower than it will be at death — filling lower tax brackets strategically. For example, withdrawing $30,000/year at 30% rather than having $800,000 taxed at 50%+ on the terminal return. Proceeds reinvested in TFSA or non-registered accounts."},
  ]},
  { category:"Saving, Exporting & Sharing", color:"#34d399", items:[
    {q:"How do I save a plan?", a:"Go to the Saved tab, type a descriptive name (e.g. Conservative Ontario Age 65), and click Save Current Plan. Your complete plan — all Plan, Income, Withdraw, and Estate inputs — is saved to your browser. Up to 20 named plans can be stored and persist across browser sessions."},
    {q:"How do I export to Excel?", a:"Click the Excel button in the top-right header. A CSV file downloads that can be opened in Microsoft Excel, Google Sheets, or Numbers. It includes all sections: accumulation plan, Monte Carlo results, year-by-year projections, retirement income summary, full withdrawal table, and estate analysis."},
    {q:"How do I create a PDF report for a client?", a:"Click the Print/PDF button in the top-right header. In your browser print dialog, set Destination to Save as PDF, paper to Letter, and enable Background Graphics so the dark header prints correctly. The app hides all navigation in print mode so only data and charts appear."},
    {q:"Can I share a plan with a colleague?", a:"Plans are stored locally in your browser and cannot be shared via link. Best ways to share: export to CSV (for data collaboration) or print to PDF (for a client-ready report). Both are available via the buttons in the top-right header on any tab."},
  ]},
];

// ── FAQ Accordion ─────────────────────────────────────────────────────────────
function FAQAccordion() {
  const [openSection, setOpenSection] = useState(0);
  const [openItem, setOpenItem] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = search.trim().length > 1
    ? FAQ_SECTIONS.map(sec => ({...sec, items: sec.items.filter(it =>
        it.q.toLowerCase().includes(search.toLowerCase()) || it.a.toLowerCase().includes(search.toLowerCase())
      )})).filter(sec => sec.items.length > 0)
    : FAQ_SECTIONS;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Search */}
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#4a5568" }}>🔍</span>
        <input type="text" value={search} onChange={e=>{setSearch(e.target.value);setOpenItem(null)}}
          placeholder="Search questions…"
          style={{ paddingLeft:34, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(212,175,55,0.2)",
            borderRadius:10, color:"#e2e8f0", padding:"10px 14px 10px 34px", width:"100%",
            fontSize:13, outline:"none", fontFamily:"inherit" }}/>
      </div>

      {filtered.map((sec, si) => (
        <div key={si} style={{ border:"1px solid rgba(212,175,55,0.12)", borderRadius:14, overflow:"hidden" }}>
          {/* Section header */}
          <button onClick={() => { setOpenSection(si === openSection ? -1 : si); setOpenItem(null); }}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"13px 18px", background: openSection===si ? "rgba(212,175,55,0.06)" : "rgba(255,255,255,0.02)",
              border:"none", cursor:"pointer",
              borderBottom: openSection===si ? "1px solid rgba(212,175,55,0.12)" : "none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:9, height:9, borderRadius:"50%", background:sec.color }}/>
              <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:14, color:"#e2e8f0" }}>{sec.category}</span>
              <span style={{ fontSize:10, color:"#4a5568", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"2px 8px" }}>{sec.items.length} questions</span>
            </div>
            <span style={{ color:sec.color, fontSize:16, display:"inline-block",
              transition:"transform 0.2s", transform: openSection===si ? "rotate(90deg)" : "rotate(0)" }}>›</span>
          </button>
          {/* Items */}
          {openSection===si && sec.items.map((item, ii) => (
            <div key={ii} style={{ borderBottom: ii < sec.items.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <button onClick={() => setOpenItem(openItem===`${si}-${ii}` ? null : `${si}-${ii}`)}
                style={{ width:"100%", display:"flex", alignItems:"flex-start", justifyContent:"space-between",
                  padding:"11px 18px 11px 22px", background:"transparent", border:"none", cursor:"pointer",
                  textAlign:"left", gap:12 }}>
                <span style={{ fontSize:12, color: openItem===`${si}-${ii}` ? sec.color : "#cbd5e1",
                  lineHeight:1.5, fontWeight: openItem===`${si}-${ii}` ? 600 : 400, flex:1 }}>{item.q}</span>
                <span style={{ color: openItem===`${si}-${ii}` ? sec.color : "#4a5568", fontSize:16, flexShrink:0,
                  display:"inline-block", transition:"transform 0.2s",
                  transform: openItem===`${si}-${ii}` ? "rotate(45deg)" : "rotate(0)" }}>+</span>
              </button>
              {openItem===`${si}-${ii}` && (
                <div style={{ padding:"0 22px 13px 22px" }}>
                  <div style={{ background:"rgba(255,255,255,0.02)", borderLeft:`2px solid ${sec.color}`,
                    borderRadius:"0 8px 8px 0", padding:"10px 14px", fontSize:12, color:"#94a3b8", lineHeight:1.8 }}>
                    {item.a}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {filtered.length===0 && (
        <div style={{ textAlign:"center", padding:"40px 0", color:"#4a5568" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔍</div>
          <div>No results for &ldquo;{search}&rdquo;</div>
        </div>
      )}
    </div>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_PLAN = { goalName:"Retirement", currentAge:45, targetAge:65, currentValue:500000, monthlyContribution:2000, targetAmount:2500000, allocation:{equity:60,bonds:30,cash:10}, assetReturns:{equity:7.5,bonds:3.5,cash:1.5}, stdDev:12, inflation:2.5 };
const DEFAULT_RET  = { province:"Ontario", retirementAge:65, lifeExpectancy:90, cppMonthly:758, oasMonthly:713, rrifBalance:800000, tfsaBalance:200000, nonRegBalance:150000, nonRegACB:90000, desiredMonthlyIncome:6000, portfolioReturn:5.0, withdrawOrder:"optimal", customWithdrawals:{} };
const GOAL_PRESETS = [
  {label:"Retirement",    target:2500000, horizon:20, equity:60, bonds:30, cash:10},
  {label:"Education Fund",target:200000,  horizon:12, equity:50, bonds:40, cash:10},
  {label:"Home Purchase", target:150000,  horizon:5,  equity:30, bonds:50, cash:20},
  {label:"Emergency Fund",target:50000,   horizon:3,  equity:0,  bonds:20, cash:80},
  {label:"Business Launch",target:300000, horizon:7,  equity:40, bonds:40, cash:20},
  {label:"Wealth Legacy", target:5000000, horizon:25, equity:70, bonds:25, cash:5},
];

// ── UI Components ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color, big, tipKey }) {
  const card = (
    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(212,175,55,0.15)",
      borderRadius:12, padding:big?"18px 22px":"13px 16px", display:"flex", flexDirection:"column",
      gap:3, position:"relative" }}>
      <span style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:"#8899aa" }}>{label}</span>
      <span style={{ fontSize:big?26:18, fontFamily:"'DM Serif Display',serif", color:color||"#D4AF37", fontWeight:400, lineHeight:1.2 }}>{value}</span>
      {sub && <span style={{ fontSize:10, color:"#667788" }}>{sub}</span>}
    </div>
  );
  return tipKey ? <HoverTip tipKey={tipKey}>{card}</HoverTip> : card;
}

function SliderRow({ label, value, min, max, step, onChange, format, hint }) {
  return (
    <div style={{ marginBottom:15 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <label style={{ fontSize:11, color:"#8899aa" }}>{label}</label>
        <span style={{ fontSize:12, color:"#D4AF37", fontFamily:"'DM Serif Display',serif" }}>{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))} style={{ width:"100%", accentColor:"#D4AF37", cursor:"pointer" }}/>
      {hint && <div style={{ fontSize:10, color:"#4a5568", marginTop:2 }}>{hint}</div>}
    </div>
  );
}

function AllocationBar({ alloc }) {
  const t = alloc.equity + alloc.bonds + alloc.cash;
  return (
    <div style={{ display:"flex", height:7, borderRadius:4, overflow:"hidden", marginBottom:8 }}>
      <div style={{ width:`${(alloc.equity/t)*100}%`, background:"#D4AF37" }}/>
      <div style={{ width:`${(alloc.bonds/t)*100}%`,  background:"#4a90d9" }}/>
      <div style={{ width:`${(alloc.cash/t)*100}%`,   background:"#34d399" }}/>
    </div>
  );
}

function SuccessGauge({ rate }) {
  const color = successColor(rate);
  const angle = -135 + (rate / 100) * 270;
  return (
    <HoverTip tipKey="successRate">
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, position:"relative" }}>
        <svg width={150} height={92} viewBox="0 0 160 100">
          <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round"/>
          <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(rate/100)*188} 188`}/>
          <g transform={`rotate(${angle}, 80, 90)`}>
            <line x1={80} y1={90} x2={80} y2={38} stroke="white" strokeWidth={2} strokeLinecap="round"/>
            <circle cx={80} cy={90} r={5} fill={color}/>
          </g>
          <text x={80} y={82} textAnchor="middle" fill={color} fontSize={22} fontFamily="'DM Serif Display',serif">{rate.toFixed(0)}%</text>
        </svg>
        <span style={{ fontSize:10, color:"#8899aa", letterSpacing:"0.1em" }}>PROBABILITY OF SUCCESS</span>
        <div style={{ position:"absolute", top:2, right:2, width:13, height:13, borderRadius:"50%",
          background:"rgba(212,175,55,0.15)", border:"1px solid rgba(212,175,55,0.4)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:8, color:"#D4AF37", fontWeight:700 }}>?</div>
      </div>
    </HoverTip>
  );
}

const CT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0f172a", border:"1px solid #D4AF37", borderRadius:8, padding:"9px 13px", fontSize:11 }}>
      <div style={{ color:"#D4AF37", marginBottom:5, fontWeight:600 }}>Year {label}</div>
      {payload.map((p, i) => <div key={i} style={{ color:p.color, marginBottom:2 }}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  );
};
const RT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0f172a", border:"1px solid rgba(212,175,55,0.4)", borderRadius:8, padding:"9px 13px", fontSize:11 }}>
      <div style={{ color:"#D4AF37", marginBottom:5 }}>Age {label}</div>
      {payload.map((p, i) => <div key={i} style={{ color:p.color||"#cbd5e1", marginBottom:2 }}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  );
};
const SH = ({ title, sub }) => (
  <div style={{ marginBottom:18 }}>
    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#e2e8f0" }}>{title}</div>
    {sub && <div style={{ fontSize:11, color:"#4a5568", marginTop:3 }}>{sub}</div>}
  </div>
);

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const saved = loadAll();
  const [s, setS]   = useState(saved.plan || DEFAULT_PLAN);
  const [r, setR]   = useState(saved.ret  || DEFAULT_RET);
  const [results, setResults]     = useState(null);
  const [projData, setProjData]   = useState([]);
  const [tab, setTab]             = useState("plan");
  const [scenarios, setScenarios] = useState(loadScenarios());
  const [saveName, setSaveName]   = useState("");
  const [running, setRunning]     = useState(false);
  const [activeScenario, setActiveScenario] = useState(null);

  useEffect(() => { saveAll({ plan:s, ret:r }); }, [s, r]);

  const blendedReturn = (s.allocation.equity*s.assetReturns.equity + s.allocation.bonds*s.assetReturns.bonds + s.allocation.cash*s.assetReturns.cash) / (s.allocation.equity+s.allocation.bonds+s.allocation.cash) / 100;
  const timeHorizon        = Math.max(1, s.targetAge - s.currentAge);
  const annualContribution = s.monthlyContribution * 12;
  const wPlan  = useMemo(() => buildWithdrawalPlan(r), [r]);
  const estate = useMemo(() => calcEstate(r), [r]);
  const retTaxSummary = useMemo(() => {
    const cppA=r.cppMonthly*12, oasA=r.oasMonthly*12;
    const rrifMinA=r.rrifBalance*getRRIFRate(r.retirementAge);
    const oasNet=oasAfterClawback(cppA+oasA+rrifMinA, oasA);
    const oasClawback=oasA-oasNet, taxable=cppA+oasNet+rrifMinA;
    const tax=calcTax(taxable, r.province), desired=r.desiredMonthlyIncome*12;
    return { cppA, oasA, oasNet, oasClawback, rrifMinA, taxable, tax, desired, gap:Math.max(0,desired-(cppA+oasNet)) };
  }, [r]);

  const runSimulation = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runMonteCarlo({ currentValue:s.currentValue, annualContribution, timeHorizon, blendedReturn, stdDev:s.stdDev/100, inflation:s.inflation/100, targetAmount:s.targetAmount });
      setResults(res);
      setProjData(buildProjectionData({ currentValue:s.currentValue, annualContribution, timeHorizon, blendedReturn, stdDev:s.stdDev/100, inflation:s.inflation/100 }));
      setRunning(false); setTab("results");
    }, 80);
  }, [s, blendedReturn, timeHorizon, annualContribution]);

  const upd       = k => v => setS(p => ({...p, [k]:v}));
  const updAlloc  = k => v => setS(p => ({...p, allocation:{...p.allocation,[k]:v}}));
  const updReturn = k => v => setS(p => ({...p, assetReturns:{...p.assetReturns,[k]:v}}));
  const updR      = k => v => setR(p => ({...p, [k]:v}));
  const applyPreset = preset => { setS(p=>({...p,goalName:preset.label,targetAmount:preset.target,targetAge:p.currentAge+preset.horizon,allocation:{equity:preset.equity,bonds:preset.bonds,cash:preset.cash}})); setResults(null); };
  const handleSave = () => {
    if (!saveName.trim()) return;
    const sc = { id:Date.now(), name:saveName.trim(), date:new Date().toLocaleDateString("en-CA"), plan:{...s}, ret:{...r}, results:results?{successRate:results.successRate,p50:results.p50,p10:results.p10,p90:results.p90}:null };
    const updated = [sc,...scenarios].slice(0,20); setScenarios(updated); saveScenarios(updated); setSaveName("");
  };
  const deleteScenario = id => { const u=scenarios.filter(sc=>sc.id!==id); setScenarios(u); saveScenarios(u); };
  const loadScenario = sc => { setS(sc.plan); setR(sc.ret||DEFAULT_RET); setResults(null); setProjData([]); setActiveScenario(sc.id); setTab("plan"); };
  const exportCSV = () => {
    const rows=[["MKA Financial — Complete Retirement Plan"],["Generated",new Date().toLocaleDateString("en-CA")],["Province",r.province],[],
      ["=== ACCUMULATION PLAN ==="],["Goal",s.goalName],["Target Amount",s.targetAmount],["Time Horizon (years)",timeHorizon],
      ["Current Portfolio",s.currentValue],["Monthly Contribution",s.monthlyContribution],
      ["Blended Return",`${(blendedReturn*100).toFixed(2)}%`],["Inflation",`${s.inflation}%`],
      ...(results?[[],["=== MONTE CARLO RESULTS ==="],["Probability of Success",`${results.successRate.toFixed(1)}%`],
        ["Median (P50)",results.p50.toFixed(0)],["Pessimistic (P10)",results.p10.toFixed(0)],["Optimistic (P90)",results.p90.toFixed(0)],
        [],["Year","P10","P25","P50","P75","P90"],...projData.map(d=>[d.year,d.p10.toFixed(0),d.p25.toFixed(0),d.p50.toFixed(0),d.p75.toFixed(0),d.p90.toFixed(0)])]:
        []),
      [],["=== RETIREMENT INCOME ==="],["CPP Annual",(r.cppMonthly*12).toFixed(0)],["OAS (Gross)",(r.oasMonthly*12).toFixed(0)],
      ["OAS Clawback",retTaxSummary.oasClawback.toFixed(0)],["OAS Net",retTaxSummary.oasNet.toFixed(0)],
      ["RRIF Minimum",retTaxSummary.rrifMinA.toFixed(0)],["Effective Tax Rate",fmtPct(retTaxSummary.tax.effective)],["Net Annual Income",retTaxSummary.tax.netIncome.toFixed(0)],
      [],["=== WITHDRAWAL PLAN ==="],["Age","RRIF Bal","TFSA Bal","Non-Reg Bal","Total Bal","CPP","OAS Net","RRIF W/D","TFSA W/D","NR W/D","Taxable","Tax","Eff %","Net Income"],
      ...wPlan.map(y=>[y.age,y.rrifBal.toFixed(0),y.tfsaBal.toFixed(0),y.nonRegBal.toFixed(0),y.totalBal.toFixed(0),y.cpp.toFixed(0),y.oasNet.toFixed(0),y.rrifW.toFixed(0),y.tfsaW.toFixed(0),y.nonRegW.toFixed(0),y.taxableIncome.toFixed(0),y.tax.toFixed(0),(y.effectiveRate*100).toFixed(1),y.netIncome.toFixed(0)]),
      [],["=== ESTATE — "+r.province+" ==="],["Account","Gross","Tax","Net to Heirs"],
      ["RRIF",estate.rrifGross.toFixed(0),estate.rrifTax.toFixed(0),estate.rrifNet.toFixed(0)],
      ["TFSA",estate.tfsaGross.toFixed(0),0,estate.tfsaNet.toFixed(0)],
      ["Non-Reg",estate.nonRegGross.toFixed(0),estate.nonRegTax.toFixed(0),estate.nonRegNet.toFixed(0)],
      ["TOTAL",estate.totalGross.toFixed(0),estate.totalTax.toFixed(0),estate.totalNet.toFixed(0)]];
    const blob=new Blob([rows.map(rw=>rw.join(",")).join("\n")],{type:"text/csv"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`MKA_Plan_${r.province}_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const surplus   = results ? Math.max(0, results.p50-s.targetAmount) : null;
  const shortfall = results ? Math.max(0, s.targetAmount-results.p50) : null;
  const swr       = results ? (results.p50*.04)/12 : null;
  const panel = { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(212,175,55,0.12)", borderRadius:16, padding:"20px" };
  const TABS = [
    {id:"plan",label:"⚙ Plan"},{id:"results",label:"📈 Results"},{id:"income",label:"💰 Income"},
    {id:"withdraw",label:"📤 Withdraw"},{id:"estate",label:"🏛 Estate"},
    {id:"scenarios",label:`📁 Saved (${scenarios.length})`},{id:"faq",label:"❓ FAQ"},
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", fontFamily:"'Figtree',sans-serif", color:"#cbd5e1" }}>
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
        .tipbox{padding:10px 13px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:8px;font-size:11px;color:#34d399;line-height:1.6}
        @keyframes tipFade{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
        @media print{.no-print{display:none!important}}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ borderBottom:"1px solid rgba(212,175,55,0.12)", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }} className="no-print">
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <svg width={28} height={28} viewBox="0 0 32 32">
            <polygon points="16,2 28,8 28,24 16,30 4,24 4,8" fill="none" stroke="#D4AF37" strokeWidth={1.5}/>
            <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="rgba(212,175,55,0.12)" stroke="#D4AF37" strokeWidth={0.8}/>
            <line x1={16} y1={7} x2={16} y2={25} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
            <line x1={9} y1={11} x2={23} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
            <line x1={23} y1={11} x2={9} y2={21} stroke="#D4AF37" strokeWidth={0.8} strokeOpacity={0.4}/>
          </svg>
          <div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:"#D4AF37" }}>MKA Financial</div>
            <div style={{ fontSize:8, letterSpacing:"0.15em", color:"#4a5568", textTransform:"uppercase" }}>Financial Planning Suite</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {TABS.map(t => <button key={t.id} className={`tab-btn ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}
        </div>
        <div style={{ display:"flex", gap:7 }} className="no-print">
          <button className="btn-ghost" onClick={exportCSV}>⬇ Excel</button>
          <button className="btn-ghost" onClick={()=>window.print()}>🖨 PDF</button>
        </div>
      </div>

      <div style={{ padding:"20px 24px", maxWidth:1440, margin:"0 auto" }}>

        {/* ══════════════════ PLAN TAB ══════════════════ */}
        {tab==="plan" && (
          <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:20 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={panel}>
                <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#8899aa", textTransform:"uppercase", marginBottom:11 }}>Goal Presets</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>{GOAL_PRESETS.map(p=><button key={p.label} className="preset-chip" onClick={()=>applyPreset(p)}>{p.label}</button>)}</div>
                <label style={{ fontSize:10, color:"#8899aa", display:"block", marginBottom:5 }}>Custom Goal Name</label>
                <input type="text" value={s.goalName} onChange={e=>setS(p=>({...p,goalName:e.target.value}))} placeholder="e.g. Early Retirement"/>
              </div>
              <div style={panel}>
                <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#8899aa", textTransform:"uppercase", marginBottom:13 }}>Client Profile</div>
                <SliderRow label="Current Age"          value={s.currentAge}          min={18}  max={80}       step={1}     onChange={upd("currentAge")}          format={v=>`${v} yrs`}/>
                <SliderRow label="Target Age"           value={s.targetAge}           min={s.currentAge+1} max={100} step={1} onChange={upd("targetAge")}   format={v=>`${v} yrs`} hint={`Time Horizon: ${timeHorizon} yrs`}/>
                <SliderRow label="Current Portfolio"    value={s.currentValue}        min={0}   max={5000000}  step={5000}  onChange={upd("currentValue")}        format={v=>fmt(v)}/>
                <SliderRow label="Monthly Contribution" value={s.monthlyContribution} min={0}   max={20000}    step={100}   onChange={upd("monthlyContribution")} format={v=>fmt(v)}/>
                <SliderRow label="Target Amount"        value={s.targetAmount}        min={50000} max={10000000} step={25000} onChange={upd("targetAmount")}      format={v=>fmt(v)}/>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={panel}>
                <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#8899aa", textTransform:"uppercase", marginBottom:13 }}>Asset Allocation &amp; Assumed Returns</div>
                <AllocationBar alloc={s.allocation}/>
                <div style={{ display:"flex", gap:12, fontSize:10, color:"#4a5568", marginBottom:16 }}>
                  <span style={{color:"#D4AF37"}}>● Equity {s.allocation.equity}%</span>
                  <span style={{color:"#4a90d9"}}>● Bonds {s.allocation.bonds}%</span>
                  <span style={{color:"#34d399"}}>● Cash {s.allocation.cash}%</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
                  {[{key:"equity",label:"Equity",color:"#D4AF37"},{key:"bonds",label:"Fixed Income",color:"#4a90d9"},{key:"cash",label:"Cash/Equiv.",color:"#34d399"}].map(({key,label,color})=>(
                    <div key={key}>
                      <div style={{fontSize:11,color,marginBottom:8,fontWeight:500}}>{label}</div>
                      <SliderRow label="Allocation %"    value={s.allocation[key]}   min={0} max={100} step={5}    onChange={updAlloc(key)}  format={v=>`${v}%`}/>
                      <SliderRow label="Expected Return" value={s.assetReturns[key]} min={0} max={20}  step={0.25} onChange={updReturn(key)} format={v=>`${v.toFixed(2)}%`}/>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:6, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                  <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Blended Return (Nominal)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#D4AF37"}}>{(blendedReturn*100).toFixed(2)}%</div></div>
                  <div><div style={{fontSize:10,color:"#8899aa",marginBottom:3}}>Real Return (Inflation-Adj.)</div><div style={{fontSize:20,fontFamily:"'DM Serif Display',serif",color:"#34d399"}}>{((blendedReturn-s.inflation/100)*100).toFixed(2)}%</div></div>
                </div>
              </div>
              <div style={panel}>
                <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#8899aa", textTransform:"uppercase", marginBottom:13 }}>Risk &amp; Macro Parameters</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                  <SliderRow label="Portfolio Volatility (Std Dev)" value={s.stdDev}    min={2} max={30} step={0.5}  onChange={upd("stdDev")}    format={v=>`${v.toFixed(1)}%`} hint="Annual standard deviation"/>
                  <SliderRow label="Inflation Rate"                  value={s.inflation} min={0} max={10} step={0.25} onChange={upd("inflation")} format={v=>`${v.toFixed(2)}%`} hint="Long-term CPI assumption"/>
                </div>
              </div>
              <button className="btn-gold" style={{alignSelf:"flex-end",minWidth:220}} onClick={runSimulation} disabled={running}>
                {running ? "Running 1,200 Simulations…" : "▶  Run Monte Carlo Simulation"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ RESULTS TAB ══════════════════ */}
        {tab==="results" && (
          <div>
            {!results ? (
              <div style={{textAlign:"center",padding:"80px 0",color:"#4a5568"}}>
                <div style={{fontSize:44,marginBottom:14}}>📊</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"#8899aa"}}>No simulation run yet</div>
                <div style={{fontSize:12,color:"#4a5568",marginTop:8}}>Go to the Plan tab and click Run Monte Carlo Simulation</div>
                <button className="btn-gold" style={{marginTop:22}} onClick={()=>setTab("plan")}>Go to Plan →</button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:18}}>
                <div style={{fontSize:11,color:"#4a5568",padding:"7px 12px",background:"rgba(212,175,55,0.04)",borderRadius:8,border:"1px solid rgba(212,175,55,0.1)"}}>
                  💡 Hover over any metric card for <strong style={{color:"#D4AF37"}}>1.5 seconds</strong> to see a detailed explanation and how it relates to other metrics in the plan.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr 1fr 1fr",gap:12,alignItems:"stretch"}}>
                  <div style={{...panel,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><SuccessGauge rate={results.successRate}/></div>
                  <MetricCard tipKey="p50"       label="Median (P50)"      value={fmt(results.p50)}    sub={`Target: ${fmt(s.targetAmount)}`} color={results.p50>=s.targetAmount?"#22c55e":"#ef4444"} big/>
                  <MetricCard tipKey="p90"       label="Optimistic (P90)"  value={fmt(results.p90)}    sub="Top 10% of outcomes"              color="#D4AF37" big/>
                  <MetricCard tipKey="p10"       label="Pessimistic (P10)" value={fmt(results.p10)}    sub="Bottom 10% of outcomes"           color="#ef4444" big/>
                  <MetricCard tipKey={surplus>0?"surplus":"shortfall"} label={surplus>0?"Surplus":"Shortfall"} value={fmt(surplus>0?surplus:shortfall)} sub={surplus>0?"Above target (median)":"Below target (median)"} color={surplus>0?"#22c55e":"#ef4444"} big/>
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"#e2e8f0",marginBottom:14}}>{s.goalName} — Portfolio Projection · Inflation-Adjusted (Real Dollars)</div>
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
                      <Area type="monotone" dataKey="p90" name="P90 (Optimistic)"  stroke="#D4AF37" fill="url(#g90)" strokeWidth={1.5} dot={false}/>
                      <Area type="monotone" dataKey="p50" name="P50 (Median)"      stroke="#4a90d9" fill="url(#g50)" strokeWidth={2}   dot={false}/>
                      <Area type="monotone" dataKey="p25" name="P25"               stroke="#94a3b8" fill="none"      strokeWidth={1}   strokeDasharray="4 4" dot={false}/>
                      <Area type="monotone" dataKey="p10" name="P10 (Pessimistic)" stroke="#ef4444" fill="none"      strokeWidth={1.5} dot={false}/>
                      <ReferenceLine y={s.targetAmount} stroke="#22c55e" strokeDasharray="6 4" label={{value:`Target ${fmt(s.targetAmount)}`,position:"right",fill:"#22c55e",fontSize:10}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  <MetricCard tipKey="monthlyIncome"   label="Monthly Income (4% Rule)"  value={swr?fmt(swr):"—"}                                     sub="Safe withdrawal estimate"/>
                  <MetricCard tipKey="annualIncome"    label="Annual Income (4%)"         value={results.p50?fmt(results.p50*.04):"—"}                 sub="Sustainable withdrawal"/>
                  <MetricCard tipKey="totalContrib"    label="Total Contributions"        value={fmt(s.currentValue+annualContribution*timeHorizon)}    sub={`$${(annualContribution/1000).toFixed(0)}K/yr × ${timeHorizon} yrs`} color="#cbd5e1"/>
                  <MetricCard tipKey="blendedReturn"   label="Blended Return"             value={`${(blendedReturn*100).toFixed(2)}%`}                  sub={`Real: ${((blendedReturn-s.inflation/100)*100).toFixed(2)}%`}/>
                  <MetricCard tipKey="inflationImpact" label="Inflation Impact"           value={`${((1-Math.pow(1/(1+s.inflation/100),timeHorizon))*100).toFixed(0)}%`} sub="Purchasing power eroded" color="#f59e0b"/>
                  <MetricCard tipKey="requiredReturn"  label="Required Return"            value={`${((Math.pow(s.targetAmount/Math.max(1,s.currentValue),1/timeHorizon)-1)*100).toFixed(2)}%`} sub="To reach target (no contributions)" color="#94a3b8"/>
                  <MetricCard tipKey="bestScenario"    label="Best (P99)"                 value={fmt(results.best)}  sub="1% most optimistic"  color="#34d399"/>
                  <MetricCard tipKey="worstScenario"   label="Worst (P1)"                 value={fmt(results.worst)} sub="1% most pessimistic" color="#ef4444"/>
                </div>
                <div style={{...panel,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}} className="no-print">
                  <span style={{fontSize:12,color:"#8899aa",whiteSpace:"nowrap"}}>Save scenario:</span>
                  <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="e.g. Base Case 2025" style={{flex:1,minWidth:160}}/>
                  <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ INCOME TAB ══════════════════ */}
        {tab==="income" && (
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title="Retirement Income Calculator" sub="Model income sources, government benefits, taxes, and net cash flow · Values are NOMINAL (not inflation-adjusted)"/>
            <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Province &amp; Profile</div>
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:10,color:"#8899aa",display:"block",marginBottom:5}}>Province of Residence</label>
                    <select value={r.province} onChange={e=>updR("province")(e.target.value)}>{Object.keys(PROV).map(p=><option key={p}>{p}</option>)}</select>
                  </div>
                  <SliderRow label="Retirement Age"  value={r.retirementAge}  min={55} max={75}  step={1} onChange={updR("retirementAge")}  format={v=>`${v} yrs`}/>
                  <SliderRow label="Life Expectancy" value={r.lifeExpectancy} min={70} max={100} step={1} onChange={updR("lifeExpectancy")} format={v=>`${v} yrs`}/>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Government Benefits</div>
                  <SliderRow label="CPP Monthly (at 65)" value={r.cppMonthly} min={0} max={1365} step={10} onChange={updR("cppMonthly")} format={v=>fmt(v)} hint="Max: $1,365 · Average: $758/mo"/>
                  <SliderRow label="OAS Monthly (at 65)" value={r.oasMonthly} min={0} max={800}  step={5}  onChange={updR("oasMonthly")} format={v=>fmt(v)} hint="2024: $713/mo · Clawback > $90,997"/>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Income Target</div>
                  <SliderRow label="Desired Monthly Income"        value={r.desiredMonthlyIncome} min={1000} max={20000} step={100}  onChange={updR("desiredMonthlyIncome")} format={v=>fmt(v)}/>
                  <SliderRow label="Portfolio Return in Retirement" value={r.portfolioReturn}      min={0}    max={12}    step={0.25} onChange={updR("portfolioReturn")}      format={v=>`${v.toFixed(2)}%`}/>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  <MetricCard tipKey="cppAnnual"    label="CPP Annual"          value={fmt(retTaxSummary.cppA)}          sub={fmt(r.cppMonthly)+"/month"}                                                             color="#D4AF37"/>
                  <MetricCard tipKey="oasNet"       label="OAS Annual (Net)"    value={fmt(retTaxSummary.oasNet)}        sub={retTaxSummary.oasClawback>0?`⚠ Clawback: ${fmt(retTaxSummary.oasClawback)}`:"No clawback"} color={retTaxSummary.oasClawback>0?"#f59e0b":"#34d399"}/>
                  <MetricCard tipKey="rrifMin"      label="RRIF Minimum"        value={fmt(retTaxSummary.rrifMinA)}      sub={`Age ${r.retirementAge} · ${(getRRIFRate(r.retirementAge)*100).toFixed(2)}% rate`}      color="#4a90d9"/>
                  <MetricCard tipKey="effectiveTax" label="Effective Tax Rate"  value={fmtPct(retTaxSummary.tax.effective)} sub={`Marginal: ${fmtPct(retTaxSummary.tax.marginal)}`}                                   color="#f59e0b"/>
                  <MetricCard tipKey="annualTax"    label="Annual Tax Payable"  value={fmt(retTaxSummary.tax.total)}     sub={`Fed: ${fmt(retTaxSummary.tax.fedTax)} · Prov: ${fmt(retTaxSummary.tax.provTax)}`}      color="#ef4444"/>
                  <MetricCard tipKey="netAnnual"    label="Net Annual Income"   value={fmt(retTaxSummary.tax.netIncome)} sub={fmt(retTaxSummary.tax.netIncome/12)+"/month after tax"}                                  color="#22c55e"/>
                </div>
                <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.25)"}}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Income Gap Analysis at Age {r.retirementAge}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    <MetricCard label="Desired Income"        value={fmt(retTaxSummary.desired)}                         sub={fmt(r.desiredMonthlyIncome)+"/mo"} color="#e2e8f0"/>
                    <MetricCard label="Guaranteed (CPP+OAS)"  value={fmt(retTaxSummary.cppA+retTaxSummary.oasNet)}       sub="Before tax" color="#34d399"/>
                    <MetricCard tipKey="gapToFill" label="Gap to Fill" value={fmt(retTaxSummary.gap)}                    sub="From investment accounts" color={retTaxSummary.gap>0?"#f59e0b":"#22c55e"}/>
                  </div>
                  {retTaxSummary.oasClawback>0 && <div className="warn">⚠ OAS Clawback: Estimated income of {fmt(retTaxSummary.taxable)} exceeds $90,997. You will lose {fmt(retTaxSummary.oasClawback)}/yr of OAS. Consider RRSP meltdown before age 71 or deferring OAS to age 70.</div>}
                  {retTaxSummary.oasClawback===0 && <div className="tipbox">✓ No OAS clawback. Your estimated taxable income of {fmt(retTaxSummary.taxable)} is below the $90,997 threshold.</div>}
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Province Comparison at {fmt(retTaxSummary.desired)} Annual Income</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
                    {Object.keys(PROV).map(pName => {
                      const t=calcTax(retTaxSummary.desired,pName), isSel=pName===r.province;
                      return (<div key={pName} onClick={()=>updR("province")(pName)} style={{padding:"10px 7px",borderRadius:9,border:`1px solid ${isSel?"#D4AF37":"rgba(212,175,55,0.12)"}`,background:isSel?"rgba(212,175,55,0.08)":"transparent",cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{pName.split(" ")[0]}</div>
                        <div style={{fontSize:13,fontFamily:"'DM Serif Display',serif",color:isSel?"#D4AF37":"#94a3b8"}}>{fmtPct(t.effective)}</div>
                        <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{fmt(t.total)} tax</div>
                      </div>);
                    })}
                  </div>
                  <div style={{fontSize:10,color:"#4a5568",marginTop:10}}>Click a province to switch · 2024 combined federal + provincial rates</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ WITHDRAW TAB ══════════════════ */}
        {tab==="withdraw" && (
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title="Withdrawal Strategy Optimizer" sub="Tax-efficient decumulation factoring CPP, OAS clawback, RRIF minimums, and account location · Values are NOMINAL"/>
            <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:18}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:12}}>Account Balances at Retirement</div>
                  <SliderRow label="RRSP / RRIF Balance"      value={r.rrifBalance}    min={0} max={5000000}  step={10000} onChange={updR("rrifBalance")}  format={v=>fmt(v)}/>
                  <SliderRow label="TFSA Balance"              value={r.tfsaBalance}    min={0} max={2000000}  step={5000}  onChange={updR("tfsaBalance")}  format={v=>fmt(v)}/>
                  <SliderRow label="Non-Reg Balance"           value={r.nonRegBalance}  min={0} max={3000000}  step={5000}  onChange={updR("nonRegBalance")} format={v=>fmt(v)}/>
                  <SliderRow label="Non-Reg Cost Base (ACB)"  value={r.nonRegACB}      min={0} max={Math.max(r.nonRegBalance,r.nonRegACB)} step={5000} onChange={updR("nonRegACB")} format={v=>fmt(v)} hint={`Accrued gain: ${fmt(Math.max(0,r.nonRegBalance-r.nonRegACB))}`}/>
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
                    {r.withdrawOrder==="optimal"    && "Draws RRIF minimum + partial top-up, then Non-Reg (capital gains advantage), then TFSA. Preserves TFSA as long-term tax shelter."}
                    {r.withdrawOrder==="rrif-first"  && "Maximizes RRIF first to reduce future estate tax. Best for large RRIF balances with no spouse rollover."}
                    {r.withdrawOrder==="tfsa-first"  && "Draws TFSA before other accounts. Generally not tax-optimal but useful in specific estate planning contexts."}
                    {r.withdrawOrder==="nonreg-first"&& "Draws Non-Reg first to realize capital gains early at lower rates. Effective when non-reg gains are large."}
                  </div>
                </div>
                <div style={panel}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:"#8899aa",textTransform:"uppercase",marginBottom:10}}>Custom Annual Overrides</div>
                  <div style={{fontSize:10,color:"#4a5568",marginBottom:10}}>Override strategy for specific ages (in dollars)</div>
                  {[r.retirementAge, r.retirementAge+5, r.retirementAge+10, r.retirementAge+15].filter(a=>a<=r.lifeExpectancy).map(age => {
                    const cust = r.customWithdrawals?.[age] || {};
                    return (
                      <div key={age} style={{marginBottom:11,paddingBottom:11,borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                        <div style={{fontSize:11,color:"#D4AF37",marginBottom:6,fontWeight:500}}>Age {age}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                          {[["rrif","RRIF"],["tfsa","TFSA"],["nonReg","Non-Reg"]].map(([k,lbl])=>(
                            <div key={k}>
                              <div style={{fontSize:9,color:"#8899aa",marginBottom:3}}>{lbl}</div>
                              <input type="number" placeholder="0" value={cust[k]||""} onChange={e=>{const v=Number(e.target.value)||0;setR(p=>({...p,customWithdrawals:{...p.customWithdrawals,[age]:{...cust,[k]:v}}}))}} style={{padding:"4px 7px",fontSize:10}}/>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <MetricCard tipKey="retYears"     label="Retirement Duration"      value={`${r.lifeExpectancy-r.retirementAge} yrs`}                                    sub={`Age ${r.retirementAge}–${r.lifeExpectancy}`}/>
                  <MetricCard tipKey="avgEffRate"   label="Avg Effective Tax Rate"   value={fmtPct(wPlan.reduce((s,y)=>s+y.effectiveRate,0)/Math.max(1,wPlan.length))}    sub="Over retirement" color="#f59e0b"/>
                  <MetricCard tipKey="totalTaxRet"  label="Total Tax in Retirement"  value={fmt(wPlan.reduce((s,y)=>s+y.tax,0))}                                           sub="Lifetime tax payable" color="#ef4444"/>
                  <MetricCard tipKey="remainEstate" label="Remaining Estate"         value={fmt(wPlan[wPlan.length-1]?.totalBal||0)}                                       sub={`At age ${r.lifeExpectancy}`} color="#22c55e"/>
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
                      <Area type="monotone" dataKey="rrifBal"   name="RRIF/RRSP" stroke="#D4AF37" fill="url(#gRR)" strokeWidth={1.5} dot={false}/>
                      <Area type="monotone" dataKey="tfsaBal"   name="TFSA"      stroke="#34d399" fill="url(#gTF)" strokeWidth={1.5} dot={false}/>
                      <Area type="monotone" dataKey="nonRegBal" name="Non-Reg"   stroke="#4a90d9" fill="url(#gNR)" strokeWidth={1.5} dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={panel}>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:"#e2e8f0",marginBottom:12}}>Year-by-Year Withdrawal Plan</div>
                  <div style={{overflowX:"auto",maxHeight:300,overflowY:"auto"}}>
                    <table className="tbl">
                      <thead><tr><th>Age</th><th>RRIF Bal</th><th>TFSA Bal</th><th>Non-Reg</th><th>CPP</th><th>OAS</th><th>RRIF W/D</th><th>TFSA W/D</th><th>NR W/D</th><th>Taxable</th><th>Tax</th><th>Eff%</th><th>Net Income</th></tr></thead>
                      <tbody>{wPlan.map(y=>(
                        <tr key={y.age}>
                          <td style={{color:"#D4AF37",fontWeight:500}}>{y.age}</td>
                          <td>{fmt(y.rrifBal)}</td><td style={{color:"#34d399"}}>{fmt(y.tfsaBal)}</td><td style={{color:"#4a90d9"}}>{fmt(y.nonRegBal)}</td>
                          <td>{fmt(y.cpp)}</td><td>{fmt(y.oasNet)}</td>
                          <td>{fmt(y.rrifW)}</td><td style={{color:"#34d399"}}>{fmt(y.tfsaW)}</td><td style={{color:"#4a90d9"}}>{fmt(y.nonRegW)}</td>
                          <td>{fmt(y.taxableIncome)}</td><td style={{color:"#ef4444"}}>{fmt(y.tax)}</td>
                          <td style={{color:y.effectiveRate>.35?"#ef4444":y.effectiveRate>.25?"#f59e0b":"#22c55e"}}>{fmtPct(y.effectiveRate)}</td>
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

        {/* ══════════════════ ESTATE TAB ══════════════════ */}
        {tab==="estate" && (
          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <SH title={`Tax at Death & Estate Analysis — ${r.province}`} sub="Estimated tax on each account type based on deemed disposition rules · Values are NOMINAL"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
              {[
                {key:"RRSP / RRIF", color:"rgba(212,175,55,0.35)", tc:"#D4AF37",  gross:estate.rrifGross, tax:estate.rrifTax,    net:estate.rrifNet,   rate:estate.rrifRate, desc:"Entire balance deemed received as income at death — fully taxable at the highest marginal rate. Rolls tax-free to a surviving spouse's RRSP/RRIF.", extra:null},
                {key:"TFSA",        color:"rgba(52,211,153,0.35)",  tc:"#34d399",  gross:estate.tfsaGross, tax:0,                 net:estate.tfsaNet,   rate:0,               desc:"Passes to successor holder (spouse) or beneficiary entirely tax-free. No deemed disposition. The most estate-efficient account in Canada.", extra:null},
                {key:"Non-Registered",color:"rgba(74,144,217,0.35)",tc:"#4a90d9", gross:estate.nonRegGross,tax:estate.nonRegTax, net:estate.nonRegNet, rate:estate.nonRegGross>0?estate.nonRegTax/estate.nonRegGross:0, desc:"Deemed disposed at FMV. Only the accrued gain above ACB is taxable at 50% inclusion rate — more tax-efficient than RRIF at death.", extra:fmt(estate.nonRegGain)},
              ].map(acct => (
                <div key={acct.key} style={{...panel,borderColor:acct.color}}>
                  <div style={{fontSize:10,letterSpacing:"0.1em",color:acct.tc,textTransform:"uppercase",marginBottom:10}}>{acct.key}</div>
                  <div style={{fontSize:11,color:"#4a5568",lineHeight:1.7,marginBottom:14}}>{acct.desc}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Gross Value</span><span style={{color:"#e2e8f0",fontFamily:"'DM Serif Display',serif"}}>{fmt(acct.gross)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Eff. Tax Rate</span><span style={{color:"#f59e0b"}}>{fmtPct(acct.rate)}</span></div>
                    {acct.extra && <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Accrued Gain</span><span style={{color:acct.tc}}>{acct.extra}</span></div>}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#8899aa"}}>Tax Payable</span><span style={{color:"#ef4444",fontFamily:"'DM Serif Display',serif"}}>-{fmt(acct.tax)}</span></div>
                    <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"4px 0"}}/>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#8899aa"}}>Net to Heirs</span><span style={{fontSize:20,color:acct.tc,fontFamily:"'DM Serif Display',serif"}}>{fmt(acct.net)}</span></div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.3)"}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"#e2e8f0",marginBottom:14}}>Total Estate Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
                <MetricCard tipKey="estateGross"   label="Total Gross Estate"  value={fmt(estate.totalGross)}  sub="All accounts before tax" color="#e2e8f0" big/>
                <MetricCard tipKey="estateTax"     label="Total Tax at Death"  value={fmt(estate.totalTax)}    sub={`${estate.totalGross>0?fmtPct(estate.totalTax/estate.totalGross):"—"} of gross estate`} color="#ef4444" big/>
                <MetricCard tipKey="estateNet"     label="Net Estate to Heirs" value={fmt(estate.totalNet)}    sub="After all taxes" color="#22c55e" big/>
                <MetricCard tipKey="taxEfficiency" label="Tax Efficiency"      value={estate.totalGross>0?fmtPct(estate.totalNet/estate.totalGross):"—"} sub="% of estate preserved" color="#D4AF37" big/>
              </div>
              {estate.totalGross>0 && <>
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
                {estate.rrifGross>200000 && <div style={{padding:"8px 12px",background:"rgba(212,175,55,0.05)",borderRadius:7,borderLeft:"2px solid #D4AF37"}}>• <strong style={{color:"#D4AF37"}}>RRSP Meltdown:</strong> Your RRIF balance of {fmt(estate.rrifGross)} will face a {fmtPct(estate.rrifRate)} effective tax rate at death. Consider strategic drawdowns before age 71 to fill lower tax brackets.</div>}
                {estate.tfsaGross<estate.totalGross*.15 && <div style={{padding:"8px 12px",background:"rgba(52,211,153,0.05)",borderRadius:7,borderLeft:"2px solid #34d399"}}>• <strong style={{color:"#34d399"}}>Maximize TFSA:</strong> Your TFSA is only {fmtPct(estate.tfsaGross/Math.max(estate.totalGross,1))} of your total estate. TFSA ($7,000/yr in 2024) is the most estate-efficient savings vehicle.</div>}
                {estate.nonRegGain>50000 && <div style={{padding:"8px 12px",background:"rgba(74,144,217,0.05)",borderRadius:7,borderLeft:"2px solid #4a90d9"}}>• <strong style={{color:"#4a90d9"}}>Realize Gains Gradually:</strong> You have {fmt(estate.nonRegGain)} in accrued non-reg gains. Consider realizing in low-income years to spread the tax burden.</div>}
                <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:7,borderLeft:"2px solid #475569"}}>• <strong style={{color:"#94a3b8"}}>Successor Holder:</strong> Name your spouse as successor holder on TFSA and successor annuitant on RRIF to enable tax-free rollovers on death.</div>
                {estate.totalTax>100000 && <div style={{padding:"8px 12px",background:"rgba(239,68,68,0.05)",borderRadius:7,borderLeft:"2px solid #ef4444"}}>• <strong style={{color:"#ef4444"}}>Estate Insurance:</strong> Estimated estate tax of {fmt(estate.totalTax)}. Life insurance can fund this liability efficiently — premiums are often far less than the tax covered.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ SCENARIOS TAB ══════════════════ */}
        {tab==="scenarios" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
              <SH title="Saved Plans" sub="Up to 20 complete plans saved in your browser"/>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input type="text" value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Name this plan…" style={{width:220}}/>
                <button className="btn-gold" onClick={handleSave} disabled={!saveName.trim()}>💾 Save Current Plan</button>
              </div>
            </div>
            {scenarios.length===0 ? (
              <div style={{...panel,textAlign:"center",padding:"60px 0",color:"#4a5568"}}>
                <div style={{fontSize:40,marginBottom:12}}>📁</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:"#667788"}}>No plans saved yet</div>
                <div style={{fontSize:12,marginTop:8}}>Configure your plan and use the Save button above</div>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14}}>
                {scenarios.map(sc => {
                  const c = sc.results ? successColor(sc.results.successRate) : "#94a3b8";
                  return (
                    <div key={sc.id} style={{...panel,borderColor:activeScenario===sc.id?"rgba(212,175,55,0.5)":"rgba(212,175,55,0.12)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:"#e2e8f0"}}>{sc.name}</div>
                          <div style={{fontSize:9,color:"#4a5568",marginTop:2}}>{sc.plan?.goalName||"Plan"} · {sc.ret?.province||""} · {sc.date}</div>
                        </div>
                        {sc.results && <div style={{fontSize:15,fontFamily:"'DM Serif Display',serif",color:c}}>{sc.results.successRate.toFixed(0)}%</div>}
                      </div>
                      {sc.results && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>Median</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.results.p50)}</div></div>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>Pessimistic</div><div style={{fontSize:12,color:"#ef4444"}}>{fmt(sc.results.p10)}</div></div>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>Optimistic</div><div style={{fontSize:12,color:"#22c55e"}}>{fmt(sc.results.p90)}</div></div>
                      </div>}
                      {sc.ret && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10,paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>RRIF</div><div style={{fontSize:12,color:"#D4AF37"}}>{fmt(sc.ret.rrifBalance)}</div></div>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>TFSA</div><div style={{fontSize:12,color:"#34d399"}}>{fmt(sc.ret.tfsaBalance)}</div></div>
                        <div><div style={{fontSize:9,color:"#4a5568"}}>Non-Reg</div><div style={{fontSize:12,color:"#4a90d9"}}>{fmt(sc.ret.nonRegBalance)}</div></div>
                      </div>}
                      <div style={{display:"flex",gap:7}}>
                        <button className="btn-ghost" style={{flex:1}} onClick={()=>loadScenario(sc)}>↩ Load Plan</button>
                        <button className="btn-ghost" onClick={()=>deleteScenario(sc.id)} style={{color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ FAQ TAB ══════════════════ */}
        {tab==="faq" && (
          <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:900,margin:"0 auto",width:"100%"}}>
            <div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"#e2e8f0",marginBottom:6}}>Frequently Asked Questions</div>
              <div style={{fontSize:12,color:"#4a5568",lineHeight:1.7}}>
                Complete reference guide covering every feature, metric, formula, and concept in MKA Financial.
                Search for any topic or browse by category. You can also hover over any metric card anywhere in the app
                (hold for 1.5s) for an instant inline explanation.
              </div>
            </div>
            {/* Category quick links */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {FAQ_SECTIONS.map((sec,i) => (
                <div key={i} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${sec.color}40`,background:`${sec.color}12`,fontSize:11,color:sec.color,cursor:"default"}}>
                  {sec.category} ({sec.items.length})
                </div>
              ))}
            </div>
            <FAQAccordion/>
            <div style={{...panel,background:"rgba(212,175,55,0.04)",borderColor:"rgba(212,175,55,0.2)",textAlign:"center",padding:"18px"}}>
              <div style={{fontSize:12,color:"#8899aa",lineHeight:1.8}}>
                💡 <strong style={{color:"#D4AF37"}}>Pro tip:</strong> Hover over any metric card in the Results, Income, Withdraw, or Estate tabs for <strong style={{color:"#D4AF37"}}>1.5 seconds</strong> to see an inline explanation of what that metric means and how it connects to other metrics in the plan.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
