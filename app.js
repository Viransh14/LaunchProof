// ============================================================
// LAUNCHPROOF — Application Logic
// ============================================================

// ---------- Global State ----------
let STATE = {
  user: null,           // { name, email, id }
  currentIdea: null,    // working idea being filled in the form
  currentReport: null,  // generated report for currentIdea
  formStep: 1,
  moduleCache: {},       // cache generated module content per report id
};

const INDUSTRIES = [
  "SaaS / B2B Tools","Consumer Mobile App","E-commerce / D2C","Fintech","HealthTech",
  "EdTech","Marketplace","AI / Developer Tools","Climate / Sustainability","Creator Economy",
  "Food & Beverage","Real Estate / PropTech","Gaming","Web3 / Crypto","Logistics / Supply Chain"
];

const AUDIENCES = [
  "Students","Indie Hackers / Solo Founders","Small Business Owners","Enterprise Teams",
  "Working Professionals","Parents","Gen Z Consumers","Freelancers / Creators",
  "Developers / Engineers","Healthcare Providers","Retail Shoppers"
];

const REVENUE_MODELS = [
  "Subscription (SaaS)","Freemium","Marketplace Commission","One-time Purchase",
  "Usage-Based / Metered","Advertising","Transaction Fees","Licensing / B2B Enterprise"
];

const STAGES = ["Just an idea","Sketching the plan","Building an MVP","Already have early users"];

// Industry baseline data — used by the deterministic scoring engine.
// Each industry has: competitionLevel (1-10, higher=more saturated), avgCAC, marketGrowth (%), barrierToEntry (1-10), avgTimeToMVP (weeks)
const INDUSTRY_BASELINES = {
  "SaaS / B2B Tools": { competition: 8, growth: 11, barrier: 5, mvpWeeks: 10, cac: "$400–900", margin: "75–85%" },
  "Consumer Mobile App": { competition: 9, growth: 6, barrier: 3, mvpWeeks: 8, cac: "$2–8 per install", margin: "40–60%" },
  "E-commerce / D2C": { competition: 9, growth: 8, barrier: 2, mvpWeeks: 6, cac: "$25–60", margin: "30–45%" },
  "Fintech": { competition: 7, growth: 14, barrier: 8, mvpWeeks: 16, cac: "$80–200", margin: "55–70%" },
  "HealthTech": { competition: 6, growth: 16, barrier: 9, mvpWeeks: 20, cac: "$150–350", margin: "50–65%" },
  "EdTech": { competition: 6, growth: 9, barrier: 4, mvpWeeks: 9, cac: "$30–90", margin: "60–75%" },
  "Marketplace": { competition: 7, growth: 10, barrier: 6, mvpWeeks: 12, cac: "$40–120", margin: "15–25% take rate" },
  "AI / Developer Tools": { competition: 8, growth: 22, barrier: 6, mvpWeeks: 8, cac: "$150–400", margin: "70–85%" },
  "Climate / Sustainability": { competition: 4, growth: 13, barrier: 7, mvpWeeks: 14, cac: "$60–180", margin: "35–55%" },
  "Creator Economy": { competition: 7, growth: 12, barrier: 3, mvpWeeks: 7, cac: "$15–50", margin: "65–80%" },
  "Food & Beverage": { competition: 8, growth: 5, barrier: 4, mvpWeeks: 10, cac: "$20–45", margin: "20–35%" },
  "Real Estate / PropTech": { competition: 5, growth: 8, barrier: 7, mvpWeeks: 14, cac: "$200–500", margin: "40–60%" },
  "Gaming": { competition: 9, growth: 7, barrier: 4, mvpWeeks: 12, cac: "$3–12 per install", margin: "55–75%" },
  "Web3 / Crypto": { competition: 6, growth: 9, barrier: 6, mvpWeeks: 11, cac: "$50–150", margin: "varies widely" },
  "Logistics / Supply Chain": { competition: 5, growth: 9, barrier: 8, mvpWeeks: 18, cac: "$300–700", margin: "20–35%" }
};

// ---------- Storage helpers (window.storage wrapper, namespaced per-user) ----------
async function storageSet(key, value){
  try{ await window.storage.set(key, JSON.stringify(value)); return true; }
  catch(e){ console.error('storage set failed', e); return false; }
}
async function storageGet(key){
  try{
    const res = await window.storage.get(key);
    return res ? JSON.parse(res.value) : null;
  }catch(e){ return null; }
}
async function storageList(prefix){
  try{
    const res = await window.storage.list(prefix);
    return res ? res.keys : [];
  }catch(e){ return []; }
}
async function storageDelete(key){
  try{ await window.storage.delete(key); }catch(e){}
}

function userKey(suffix){
  const uid = STATE.user ? STATE.user.id : 'anon';
  return `user:${uid}:${suffix}`;
}

// ---------- Navigation ----------
function goTo(screen){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById('screen-'+screen);
  if(el) el.classList.add('active');
  window.scrollTo({top:0,behavior:'instant'});
  updateNavForScreen(screen);
  if(screen==='history') renderHistory();
  if(screen==='form') initForm();
}

function updateNavForScreen(screen){
  const publicLinks = document.getElementById('navLinksPublic');
  const publicActions = document.getElementById('navActionsPublic');
  const appActions = document.getElementById('navActionsApp');
  const loggedIn = !!STATE.user;
  if(loggedIn){
    publicLinks.style.display='none';
    publicActions.classList.add('hidden');
    appActions.classList.remove('hidden');
    document.getElementById('navUserName').textContent = STATE.user.name.split(' ')[0];
    document.getElementById('navAvatar').textContent = STATE.user.name.slice(0,2).toUpperCase();
  } else {
    publicLinks.style.display='flex';
    publicActions.classList.remove('hidden');
    appActions.classList.add('hidden');
  }
}

function scrollToSection(id){
  goTo('landing');
  setTimeout(()=>{
    const el = document.getElementById(id);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 50);
}

// ---------- Toast ----------
function showToast(msg){
  const t = document.getElementById('toast');
  t.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8L6 12L14 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${msg}</span>`;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2600);
}

// ---------- Auth ----------
function setAuthTab(tab){
  const isLogin = tab==='login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
  document.getElementById('fieldName').classList.toggle('hidden', isLogin);
  document.getElementById('authHeadline').textContent = isLogin ? 'Welcome back' : 'Create your account';
  document.getElementById('authSub').textContent = isLogin ? 'Log in to access your validation dashboard.' : 'Start validating startup ideas in minutes.';
  document.getElementById('authSubmitBtn').textContent = isLogin ? 'Log in' : 'Create account';
  document.getElementById('authFootText').innerHTML = isLogin
    ? `Don't have an account? <button onclick="setAuthTab('signup')">Sign up</button>`
    : `Already have an account? <button onclick="setAuthTab('login')">Log in</button>`;
  document.getElementById('authName').required = !isLogin;
}

async function handleAuth(e, isGoogle){
  if(e) e.preventDefault();
  const isLogin = document.getElementById('tabLogin').classList.contains('active');
  let name, email;
  if(isGoogle){
    name = "Demo Founder";
    email = "demo.founder@gmail.com";
  } else {
    email = document.getElementById('authEmail').value.trim();
    name = isLogin ? (email.split('@')[0]) : document.getElementById('authName').value.trim();
    if(!name) name = email.split('@')[0];
  }
  if(!email){ showToast('Enter an email to continue'); return; }

  const id = btoa(email).replace(/[^a-zA-Z0-9]/g,'').slice(0,24);
  STATE.user = { name: capitalizeWords(name), email, id };

  await storageSet(`account:${id}`, STATE.user);
  showToast(isLogin ? `Welcome back, ${STATE.user.name.split(' ')[0]}` : `Account created — let's validate something`);

  // check for existing history to decide where to land
  const keys = await storageList(userKey('report:'));
  if(keys.length>0){
    goTo('history');
  } else {
    goTo('form');
  }
}

function logout(){
  STATE.user = null;
  STATE.currentIdea = null;
  STATE.currentReport = null;
  goTo('landing');
  showToast('Logged out');
}

function capitalizeWords(s){
  return s.replace(/[\._-]+/g,' ').split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}

// ---------- Form ----------
function initForm(){
  STATE.formStep = 1;
  STATE.currentIdea = { name:'', description:'', industry:null, audience:null, revenue:null, stage:null, concern:'' };
  document.getElementById('f_name').value='';
  document.getElementById('f_desc').value='';
  document.getElementById('f_concern').value='';
  updateCharCount();
  renderChips('industryChips', INDUSTRIES, 'industry');
  renderChips('audienceChips', AUDIENCES, 'audience');
  renderChips('revenueChips', REVENUE_MODELS, 'revenue');
  renderChips('stageChips', STAGES, 'stage');
  renderFormProgress();
  showFormStep(1);
}

function renderChips(containerId, options, field){
  const c = document.getElementById(containerId);
  c.innerHTML = options.map(opt=>`<button type="button" class="chip" data-field="${field}" data-value="${escapeHtml(opt)}" onclick="selectChip(this,'${field}')">${escapeHtml(opt)}</button>`).join('');
}

function selectChip(btn, field){
  const container = btn.parentElement;
  container.querySelectorAll('.chip').forEach(c=>c.classList.remove('selected'));
  btn.classList.add('selected');
  STATE.currentIdea[field] = btn.dataset.value;
}

function updateCharCount(){
  const v = document.getElementById('f_desc').value;
  document.getElementById('charCount').textContent = v.length;
}

function renderFormProgress(){
  const wrap = document.getElementById('formProgress');
  wrap.innerHTML = '';
  for(let i=1;i<=5;i++){
    const d = document.createElement('div');
    d.className = 'progress-dot' + (i<=STATE.formStep?' done':'');
    wrap.appendChild(d);
  }
}

function showFormStep(n){
  document.querySelectorAll('.form-step').forEach(s=>s.classList.remove('active'));
  document.querySelector(`.form-step[data-step="${n}"]`).classList.add('active');
  document.getElementById('formBackBtn').style.visibility = n===1 ? 'hidden' : 'visible';
  document.getElementById('formNextBtn').textContent = n===5 ? 'Run validation' : 'Continue';
  renderFormProgress();
}

function validateStep(n){
  if(n===1){
    STATE.currentIdea.name = document.getElementById('f_name').value.trim();
    STATE.currentIdea.description = document.getElementById('f_desc').value.trim();
    if(!STATE.currentIdea.name){ showToast('Give your startup a name'); return false; }
    if(STATE.currentIdea.description.length < 20){ showToast('Describe your idea in a bit more detail'); return false; }
  }
  if(n===2 && !STATE.currentIdea.industry){ showToast('Pick an industry to continue'); return false; }
  if(n===3 && !STATE.currentIdea.audience){ showToast('Pick a target audience'); return false; }
  if(n===4 && !STATE.currentIdea.revenue){ showToast('Pick a revenue model'); return false; }
  if(n===5){
    STATE.currentIdea.concern = document.getElementById('f_concern').value.trim();
    if(!STATE.currentIdea.stage){ showToast('Pick your current stage'); return false; }
  }
  return true;
}

function formNext(){
  if(!validateStep(STATE.formStep)) return;
  if(STATE.formStep < 5){
    STATE.formStep++;
    showFormStep(STATE.formStep);
  } else {
    runValidation();
  }
}

function formBack(){
  if(STATE.formStep > 1){
    STATE.formStep--;
    showFormStep(STATE.formStep);
  }
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ============================================================
// SCORING ENGINE — deterministic, seeded by idea content
// ============================================================

// Simple deterministic string hash -> integer (for stable "randomness" per idea)
function hashStr(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seededRand(seed){
  // mulberry32
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function makeRng(seedStr){
  let seed = hashStr(seedStr);
  let calls = 0;
  return function(){
    calls++;
    return seededRand(seed + calls*1000);
  };
}

const POSITIVE_SIGNAL_WORDS = ['automate','save time','ai','platform','marketplace','subscription','community','workflow','integrate','personalize','collaborate','analytics','data','remote','simplify','niche','underserved','recurring'];
const RISK_SIGNAL_WORDS = ['everyone','everybody','social network','app for','uber for','social media platform','dating app','crypto coin','nft'];

function analyzeDescriptionSignals(desc){
  const lower = desc.toLowerCase();
  let pos = 0, risk = 0;
  POSITIVE_SIGNAL_WORDS.forEach(w=>{ if(lower.includes(w)) pos++; });
  RISK_SIGNAL_WORDS.forEach(w=>{ if(lower.includes(w)) risk++; });
  const specificity = Math.min(10, Math.floor(desc.length / 60)); // longer, more specific descriptions score higher
  return { pos, risk, specificity };
}

function computeScore(idea){
  const baseline = INDUSTRY_BASELINES[idea.industry] || INDUSTRY_BASELINES["SaaS / B2B Tools"];
  const rng = makeRng(idea.name + idea.description + idea.industry + idea.audience);
  const signals = analyzeDescriptionSignals(idea.description);

  // Market demand: inverse of competition, plus growth, plus positive signals
  let marketDemand = 50 + (baseline.growth * 1.8) - (baseline.competition * 1.5) + (signals.pos * 2.2) - (signals.risk * 4) + (signals.specificity * 1.1);
  marketDemand += (rng()*10 - 5);

  // Competition intensity (lower = better for founder, but we report as "competition level")
  let competitionLevel = baseline.competition * 10 + (rng()*8 - 4);

  // Differentiation: penalize risk words (generic ideas), reward specificity & positive signals
  let differentiation = 55 + (signals.pos*3) - (signals.risk*8) + (signals.specificity*1.4) + (rng()*10-5);

  // Execution feasibility: inverse of barrier to entry and MVP time
  let feasibility = 90 - (baseline.barrier*5) - (baseline.mvpWeeks*0.8) + (rng()*8-4);

  // Monetization clarity: depends on revenue model chosen
  const revenueClarityMap = {
    "Subscription (SaaS)":85, "Freemium":72, "Marketplace Commission":68, "One-time Purchase":60,
    "Usage-Based / Metered":78, "Advertising":50, "Transaction Fees":74, "Licensing / B2B Enterprise":80
  };
  let monetization = (revenueClarityMap[idea.revenue]||65) + (rng()*8-4);

  // Stage bonus: further along = slightly higher confidence in execution score
  const stageBonusMap = {"Just an idea":0,"Sketching the plan":2,"Building an MVP":6,"Already have early users":12};
  feasibility += stageBonusMap[idea.stage]||0;

  // Investor readiness: blend of monetization, market demand, differentiation, stage
  let investorReadiness = (monetization*0.3 + marketDemand*0.3 + differentiation*0.25 + (stageBonusMap[idea.stage]||0)*1.5 + 20);

  // Viral potential: audience + industry dependent
  const viralAudienceMap = {"Gen Z Consumers":85,"Creator Economy":80,"Students":70,"Retail Shoppers":60,"Parents":55,
    "Freelancers / Creators":75,"Indie Hackers / Solo Founders":65,"Developers / Engineers":58,"Working Professionals":50,
    "Small Business Owners":45,"Enterprise Teams":35,"Healthcare Providers":38};
  let viralPotential = (viralAudienceMap[idea.audience]||50) + (signals.pos*1.5) + (rng()*10-5);

  // clamp helper
  const clamp = v => Math.max(8, Math.min(96, Math.round(v)));

  marketDemand = clamp(marketDemand);
  competitionLevel = clamp(competitionLevel);
  differentiation = clamp(differentiation);
  feasibility = clamp(feasibility);
  monetization = clamp(monetization);
  investorReadiness = clamp(investorReadiness);
  viralPotential = clamp(viralPotential);

  // Overall viability score: weighted composite
  const overall = Math.round(
    marketDemand*0.22 +
    (100-competitionLevel)*0.13 +
    differentiation*0.18 +
    feasibility*0.17 +
    monetization*0.15 +
    viralPotential*0.15
  );

  let verdict, verdictClass;
  if(overall >= 70){ verdict = "Strong potential"; verdictClass="verdict-strong"; }
  else if(overall >= 45){ verdict = "Moderate potential"; verdictClass="verdict-moderate"; }
  else { verdict = "High risk"; verdictClass="verdict-weak"; }

  return {
    overall: clamp(overall),
    marketDemand, competitionLevel, differentiation, feasibility, monetization, investorReadiness, viralPotential,
    verdict, verdictClass,
    baseline, signals
  };
}

// ============================================================
// PROCESSING SCREEN
// ============================================================
const PROCESSING_STEPS = [
  "Parsing your idea and category",
  "Benchmarking against market data",
  "Mapping the competitive landscape",
  "Modeling your target audience",
  "Scoring monetization & feasibility",
  "Calculating investor readiness",
  "Compiling your validation report"
];

async function runValidation(){
  if(!validateStep(5)) return;
  goTo('processing');

  const stepsEl = document.getElementById('procSteps');
  stepsEl.innerHTML = PROCESSING_STEPS.map((s,i)=>`
    <div class="proc-step" id="procStep${i}">
      <div class="proc-step-icon">
        <div class="proc-spinner"></div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L4.5 8.5L10 3" stroke="#06120A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="proc-step-text">${s}</div>
    </div>
  `).join('');

  const ringEl = document.getElementById('procGaugeRing');
  const numEl = document.getElementById('procGaugeNum');
  const circumference = 477;

  // compute the score now (fast, deterministic) while we animate the reveal
  const score = computeScore(STATE.currentIdea);

  let progress = 0;
  const totalDuration = 5200; // ms
  const stepDuration = totalDuration / PROCESSING_STEPS.length;

  for(let i=0;i<PROCESSING_STEPS.length;i++){
    const stepEl = document.getElementById('procStep'+i);
    stepEl.classList.add('active');
    await sleep(stepDuration*0.65);
    stepEl.classList.remove('active');
    stepEl.classList.add('done');
    progress = Math.round(((i+1)/PROCESSING_STEPS.length)*score.overall);
    animateGaugeTick(ringEl, numEl, circumference, progress, score.overall, i===PROCESSING_STEPS.length-1);
    await sleep(stepDuration*0.35);
  }

  // Build the full report (deterministic modules + kick off async narrative fetch)
  const report = buildReport(STATE.currentIdea, score);
  STATE.currentReport = report;

  // Persist
  const reportId = report.id;
  await storageSet(userKey(`report:${reportId}`), report);

  await sleep(400);
  renderDashboard(report);
  goTo('dashboard');
}

function animateGaugeTick(ringEl, numEl, circumference, displayVal, finalVal, isLast){
  const targetVal = isLast ? finalVal : displayVal;
  const offset = circumference - (circumference * targetVal/100);
  ringEl.style.strokeDashoffset = offset;
  numEl.textContent = targetVal;
  // color shifts based on score band
  let color = '#39FF6A';
  if(finalVal < 45) color = '#FF4D4D';
  else if(finalVal < 70) color = '#FFB23E';
  if(isLast){ ringEl.setAttribute('stroke', color); }
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ============================================================
// REPORT BUILDER — generates deterministic content for all modules
// ============================================================
function buildReport(idea, score){
  const id = 'r_' + Date.now() + '_' + hashStr(idea.name).toString(36).slice(0,6);
  return {
    id,
    idea: {...idea},
    score,
    createdAt: new Date().toISOString(),
  };
}

function pickN(arr, n, rng){
  const copy = [...arr];
  const out = [];
  for(let i=0;i<n && copy.length>0;i++){
    const idx = Math.floor(rng()*copy.length);
    out.push(copy.splice(idx,1)[0]);
  }
  return out;
}

// ---------- MODULE: Market Validation ----------
function genMarketValidation(report){
  const {idea, score} = report;
  const b = score.baseline;
  const rng = makeRng(idea.name+'-market');
  const sizeBase = [0.8,1.2,2.5,4,6,9,14,22,35][Math.min(8,Math.floor(rng()*9))];
  const tam = (sizeBase * (1+rng())).toFixed(1);
  const sam = (tam * 0.18).toFixed(1);
  const som = (sam * 0.09).toFixed(2);
  const trendDirection = b.growth > 10 ? 'accelerating' : (b.growth > 6 ? 'steady' : 'slowing');
  return {
    tam, sam, som,
    growth: b.growth,
    trendDirection,
    demandScore: score.marketDemand,
    narrative: `The ${idea.industry} category is growing at roughly ${b.growth}% annually, which we'd classify as ${trendDirection}. Based on the audience you selected (${idea.audience}) and your product description, demand signals score ${score.marketDemand}/100 — driven primarily by ${score.signals.pos>=3?'multiple positive market signals in your description (automation, recurring use, clear workflow fit)':'a relatively generic framing that could be sharpened with more specific use-case language'}.`,
    factors: [
      {label:'Category growth rate', val: b.growth+'% YoY', tone: b.growth>10?'good':(b.growth>6?'warn':'risk')},
      {label:'Market saturation', val: b.competition>=8?'High':(b.competition>=5?'Moderate':'Low'), tone: b.competition>=8?'risk':(b.competition>=5?'warn':'good')},
      {label:'Avg. customer acquisition cost', val: b.cac, tone:'warn'},
      {label:'Typical gross margin', val: b.margin, tone:'good'},
    ]
  };
}

// ---------- MODULE: Competitor Analysis ----------
const COMPETITOR_NAME_PARTS_A = ['Flow','Stack','Base','Loop','Grid','Pulse','Forge','Nest','Spark','Atlas','Vault','Hive','Orbit','Drift','Crate'];
const COMPETITOR_NAME_PARTS_B = ['ly','io','ify','Labs','HQ','App','Co','OS','Kit','Works'];
function genCompetitors(report){
  const {idea, score} = report;
  const rng = makeRng(idea.name+'-comp');
  const count = score.baseline.competition >= 7 ? 5 : (score.baseline.competition >=4 ? 4 : 3);
  const names = new Set();
  while(names.size < count){
    names.add(COMPETITOR_NAME_PARTS_A[Math.floor(rng()*COMPETITOR_NAME_PARTS_A.length)] + COMPETITOR_NAME_PARTS_B[Math.floor(rng()*COMPETITOR_NAME_PARTS_B.length)]);
  }
  const strengthLabels = ['Market leader','Well-funded','Strong brand','Niche leader','Fast-growing','Enterprise-focused','Early mover'];
  const list = Array.from(names).map(n=>({
    name: n,
    strength: strengthLabels[Math.floor(rng()*strengthLabels.length)],
    overlap: Math.floor(40 + rng()*50)
  })).sort((a,b)=>b.overlap-a.overlap);

  const saturation = score.baseline.competition;
  return {
    competitors: list,
    saturationLevel: saturation,
    narrative: `We identified ${list.length} comparable players in or adjacent to ${idea.industry}. Direct overlap with your stated idea ranges from ${Math.min(...list.map(c=>c.overlap))}% to ${Math.max(...list.map(c=>c.overlap))}%. ${saturation>=7?'This is a crowded category — differentiation in onboarding, pricing, or a specific underserved segment will matter more than feature parity.':'This category still has room — being early gives you flexibility on positioning, but expect competition to intensify as the niche proves out.'}`,
    whiteSpace: score.differentiation >= 60
      ? `Your description suggests a specific angle (driven by audience: ${idea.audience}) that isn't fully covered by the players above — that's your wedge.`
      : `Your current description overlaps closely with existing players. Consider narrowing to a specific workflow, audience segment, or pricing model competitors haven't claimed.`
  };
}

// ---------- MODULE: Audience Personas ----------
function genAudiencePersonas(report){
  const {idea} = report;
  const rng = makeRng(idea.name+'-aud');
  const namePool = ['Maya','Arjun','Priya','Daniel','Sofia','Kabir','Elena','Wei','Noor','Liam','Zara','Theo'];
  const personaTemplates = {
    "Students": [{role:'Undergrad juggling coursework + side projects', goal:'Save time on repetitive tasks', pain:'No budget for premium tools'}],
    "Indie Hackers / Solo Founders": [{role:'Solo founder building in public', goal:'Ship fast without a team', pain:'Context-switching between too many tools'}],
    "Small Business Owners": [{role:'Owner-operator, wears every hat', goal:'Reduce manual admin work', pain:'Skeptical of tools that overpromise'}],
    "Enterprise Teams": [{role:'Mid-level manager driving a tool evaluation', goal:'Standardize process across the team', pain:'Procurement and security review friction'}],
    "Working Professionals": [{role:'Busy professional, time-poor', goal:'One less thing to manage manually', pain:'Tool fatigue — already pays for 5+ subscriptions'}],
    "Parents": [{role:'Parent managing family logistics', goal:'Simplify a recurring household task', pain:'Needs it to just work, no learning curve'}],
    "Gen Z Consumers": [{role:'Digital native, discovers via social', goal:'Wants it to feel native to how they already browse', pain:'Will churn instantly if onboarding is clunky'}],
    "Freelancers / Creators": [{role:'Independent creator managing their own business', goal:'Look professional without hiring help', pain:'Inconsistent income makes recurring costs scary'}],
    "Developers / Engineers": [{role:'Engineer evaluating a new tool for their stack', goal:'Wants control and clean APIs', pain:'Distrusts marketing claims, wants to see docs first'}],
    "Healthcare Providers": [{role:'Clinician or admin staff', goal:'Reduce administrative burden', pain:'Compliance and data privacy are non-negotiable'}],
    "Retail Shoppers": [{role:'Everyday consumer shopping online or in-store', goal:'Get a better deal or experience', pain:'Low trust in new/unknown brands'}]
  };
  const base = personaTemplates[idea.audience] || personaTemplates["Working Professionals"];
  const personas = [0,1].map(i=>{
    const name = namePool[Math.floor(rng()*namePool.length)];
    const t = base[0];
    const age = 20 + Math.floor(rng()*30);
    return {
      name, age,
      role: t.role,
      goal: t.goal,
      pain: t.pain,
      quote: `"I'd try ${idea.name} if it actually solved ${t.pain.toLowerCase()} without adding more overhead."`
    };
  });
  return { personas, primaryAudience: idea.audience };
}

// ---------- MODULE: Revenue Model ----------
function genRevenueModel(report){
  const {idea, score} = report;
  const rng = makeRng(idea.name+'-rev');
  const pricingByModel = {
    "Subscription (SaaS)": [{tier:'Starter', price:'$0–9/mo'},{tier:'Pro', price:'$19–49/mo'},{tier:'Team', price:'$99+/mo'}],
    "Freemium": [{tier:'Free', price:'$0'},{tier:'Premium', price:'$8–15/mo'}],
    "Marketplace Commission": [{tier:'Take rate', price: score.baseline.margin}],
    "One-time Purchase": [{tier:'Single purchase', price:'$29–149'}],
    "Usage-Based / Metered": [{tier:'Pay-as-you-go', price:'$0.01–0.10 per unit'}],
    "Advertising": [{tier:'Ad-supported', price:'CPM-based'}],
    "Transaction Fees": [{tier:'Per-transaction', price:'2–5% per transaction'}],
    "Licensing / B2B Enterprise": [{tier:'Annual license', price:'$5K–50K/yr'}]
  };
  const tiers = pricingByModel[idea.revenue] || pricingByModel["Subscription (SaaS)"];
  const breakEvenUsers = Math.round(800 + rng()*4000);
  return {
    model: idea.revenue,
    tiers,
    clarity: score.monetization,
    breakEvenUsers,
    narrative: `Given a ${idea.revenue} model in ${idea.industry}, monetization clarity scores ${score.monetization}/100. ${score.monetization>=70?'The model maps cleanly to how your audience already pays for similar tools.':'This model is workable but unproven for this exact audience — validate willingness to pay with 10-15 real conversations before building billing infrastructure.'} A rough back-of-envelope break-even sits around ${breakEvenUsers.toLocaleString()} paying users at typical category margins (${score.baseline.margin}).`
  };
}

// ---------- MODULE: SWOT ----------
function genSWOT(report){
  const {idea, score} = report;
  const rng = makeRng(idea.name+'-swot');
  const strengths = [
    score.signals.pos>=2 ? 'Clear, specific product description signals founder clarity' : 'Idea is simple enough to explain in one sentence',
    score.feasibility>=60 ? `Relatively fast path to MVP (~${score.baseline.mvpWeeks} weeks typical for this category)` : 'Defensible category once built',
    `Targets a defined audience (${idea.audience}) rather than "everyone"`
  ];
  const weaknesses = [
    score.differentiation<55 ? 'Differentiation from existing players is not yet obvious' : 'Will need to defend positioning as competitors notice traction',
    score.baseline.barrier>=7 ? 'High barrier-to-entry category (compliance, trust, or capital intensity)' : 'Low barrier to entry means competitors can copy quickly',
    idea.stage==='Just an idea' ? 'No validation yet beyond this report — still pre-build' : 'Limited resources relative to funded competitors'
  ];
  const opportunities = [
    `Category growing ${score.baseline.growth}% annually — timing is workable`,
    score.viralPotential>=60 ? 'Audience has strong word-of-mouth/sharing potential' : 'Opportunity to build a referral loop deliberately since it won\'t happen organically',
    'Whitespace exists for a sharper niche position (see Competitor Analysis)'
  ];
  const threats = [
    score.baseline.competition>=7 ? 'Crowded category — a funded competitor could out-market you' : 'A larger player could enter and out-resource you once the niche proves out',
    'Customer acquisition cost could erode margins faster than projected',
    score.baseline.barrier>=7 ? 'Regulatory or trust barriers could slow growth more than expected' : 'Low switching costs mean low retention risk protection'
  ];
  return { strengths, weaknesses, opportunities, threats };
}

// ---------- MODULE: MVP Roadmap ----------
function genMVPRoadmap(report){
  const {idea, score} = report;
  const weeks = score.baseline.mvpWeeks;
  const phases = [
    { phase:'Phase 1 · Weeks 1-2', title:'Validate the riskiest assumption', desc:`Talk to 15-20 people in ${idea.audience} before writing code. Confirm they actually feel the pain ${idea.name} solves.` },
    { phase:`Phase 2 · Weeks 3-${Math.max(4,Math.round(weeks*0.4))}`, title:'Build the thinnest usable version', desc:`Ship the single core workflow only — no settings, no edge cases. Goal is a working demo you can put in front of 5 users.` },
    { phase:`Phase 3 · Weeks ${Math.round(weeks*0.4)+1}-${Math.round(weeks*0.7)}`, title:'Get to first paying or committed users', desc:`Layer in your ${idea.revenue.toLowerCase()} model with the smallest viable billing setup. Prioritize manual onboarding over automation.` },
    { phase:`Phase 4 · Weeks ${Math.round(weeks*0.7)+1}-${weeks}`, title:'Find your retention loop', desc:`Instrument usage, find the moment users get value, and double down on what makes them come back — this matters more than new features right now.` },
  ];
  return { phases, totalWeeks: weeks };
}

// ---------- MODULE: Landing Page Copy ----------
function genLandingCopy(report){
  const {idea, score} = report;
  const rng = makeRng(idea.name+'-lp');
  const headlines = [
    `${idea.name}: built for ${idea.audience.toLowerCase()}, not everyone.`,
    `Stop doing this manually. ${idea.name} does it for you.`,
    `The fastest way for ${idea.audience.toLowerCase()} to get this done.`
  ];
  const headline = headlines[Math.floor(rng()*headlines.length)];
  return {
    badge: `Now in early access`,
    headline,
    sub: idea.description.length > 140 ? idea.description.slice(0,140)+'…' : idea.description,
    cta: idea.revenue==='Freemium' ? 'Start free' : 'Get early access'
  };
}

// ---------- MODULE: Pitch Deck ----------
function genPitchDeck(report){
  const {idea, score} = report;
  const market = genMarketValidation(report);
  return [
    { title:'Problem', body:`${idea.audience} currently struggle with this without a dedicated solution — they rely on workarounds, spreadsheets, or generic tools not built for the job.` },
    { title:'Solution', body: idea.description },
    { title:'Market size', body:`TAM of ~$${market.tam}B, narrowing to a serviceable obtainable market of ~$${market.som}B in the near term within ${idea.industry}.` },
    { title:'Business model', body:`${idea.revenue}, with category-typical margins of ${score.baseline.margin}.` },
    { title:'Traction / Stage', body: idea.stage },
    { title:'Why now', body:`${idea.industry} is growing ${score.baseline.growth}% annually, and ${score.baseline.competition>=7?'incumbents have left specific niches underserved':'the category is still early enough to define the default player'}.` },
    { title:'The ask', body:`Raising a pre-seed/seed round to fund the first ${score.baseline.mvpWeeks}-week build-and-validate cycle and reach initial paying users.` },
  ];
}

// ---------- MODULE: Investor Readiness ----------
function genInvestorReadiness(report){
  const {idea, score} = report;
  const checklist = [
    { item:'Clear problem statement', done: score.signals.specificity>=4 },
    { item:'Defined target audience (not "everyone")', done: true },
    { item:'Articulated revenue model', done: true },
    { item:'Evidence of market demand', done: score.marketDemand>=55 },
    { item:'Differentiation from competitors', done: score.differentiation>=55 },
    { item:'Early users or waitlist', done: idea.stage==='Already have early users' },
    { item:'Working MVP', done: idea.stage==='Building an MVP' || idea.stage==='Already have early users' },
  ];
  const passed = checklist.filter(c=>c.done).length;
  return { checklist, passed, total: checklist.length, score: score.investorReadiness };
}

// ---------- MODULE: Viral Potential ----------
function genViralPotential(report){
  const {idea, score} = report;
  const loops = [
    { mechanism:'Referral incentive', fit: score.viralPotential>=60?'Strong fit':'Possible, needs design', desc:`Reward both sides for inviting another ${idea.audience.toLowerCase()} — works best when the product is used repeatedly.` },
    { mechanism:'Shareable output', fit: idea.industry==='Creator Economy'||idea.industry==='Consumer Mobile App'?'Strong fit':'Moderate fit', desc:`If ${idea.name} produces something visual or shareable (a result, a design, a score), let users post it natively.` },
    { mechanism:'Collaborative use', fit: idea.audience==='Enterprise Teams'||idea.audience==='Small Business Owners'?'Strong fit':'Moderate fit', desc:`Products used by teams spread faster than single-player tools — consider a multiplayer mode early.` },
  ];
  return { score: score.viralPotential, loops };
}

// ---------- MODULE: Founder Matcher ----------
const SKILL_POOL = ['Full-stack engineering','Growth marketing','Sales & partnerships','Product design','Data/ML','Operations','Fundraising network','Content & community'];
function genFounderMatch(report){
  const {idea} = report;
  const rng = makeRng(idea.name+'-cof');
  // assume the user is the "idea" person — recommend complementary skills
  const needed = pickN(SKILL_POOL, 3, rng);
  const archetypes = [
    {name:'The Builder', desc:'Strong technical co-founder who can own the entire product build solo.'},
    {name:'The Operator', desc:'Go-to-market focused — sales, partnerships, and early revenue.'},
    {name:'The Storyteller', desc:'Brand, content, and community — turns users into advocates.'}
  ];
  return { neededSkills: needed, suggestedArchetype: archetypes[Math.floor(rng()*archetypes.length)] };
}

// ============================================================
// DASHBOARD RENDERING
// ============================================================
function renderDashboard(report){
  const {idea, score} = report;
  document.getElementById('dashIdeaName').textContent = idea.name;
  document.getElementById('dashIdeaMeta').textContent = `${idea.industry} · ${idea.audience}`;

  // gauge
  const ringEl = document.getElementById('dashGaugeRing');
  const numEl = document.getElementById('dashGaugeNum');
  const circumference = 427;
  let color = '#39FF6A';
  if(score.overall < 45) color = '#FF4D4D';
  else if(score.overall < 70) color = '#FFB23E';
  ringEl.setAttribute('stroke', color);
  // animate from 0
  ringEl.style.strokeDashoffset = circumference;
  numEl.textContent = '0';
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      ringEl.style.strokeDashoffset = circumference - (circumference*score.overall/100);
      animateCountUp(numEl, 0, score.overall, 1200);
    }, 80);
  });

  const verdictEl = document.getElementById('scoreVerdict');
  verdictEl.textContent = score.verdict;
  verdictEl.className = 'score-verdict ' + score.verdictClass;

  // metrics grid
  const metrics = [
    {label:'Market Demand', val: score.marketDemand, icon:'trend'},
    {label:'Differentiation', val: score.differentiation, icon:'spark'},
    {label:'Feasibility', val: score.feasibility, icon:'check'},
    {label:'Investor Readiness', val: score.investorReadiness, icon:'briefcase'},
  ];
  document.getElementById('metricsGrid').innerHTML = metrics.map(m=>{
    let barColor = '#39FF6A';
    if(m.val<45) barColor='#FF4D4D'; else if(m.val<70) barColor='#FFB23E';
    return `
    <div class="metric-card">
      <div class="metric-top">
        <span class="metric-label">${m.label}</span>
        <span class="metric-icon">${moduleIconSvg(m.icon)}</span>
      </div>
      <div class="metric-val">${m.val}</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:${m.val}%;background:${barColor};"></div></div>
    </div>`;
  }).join('');

  renderModuleGrid();
}

function animateCountUp(el, from, to, duration){
  const start = performance.now();
  function tick(now){
    const p = Math.min(1, (now-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(from + (to-from)*eased);
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const MODULES = [
  {key:'market', title:'Market Validation', desc:'TAM/SAM/SOM sizing and demand signals for your category.', icon:'trend', tag:'core'},
  {key:'competitors', title:'Competitor Analysis', desc:'Mapped competitors, overlap %, and your whitespace.', icon:'grid', tag:'core'},
  {key:'audience', title:'Audience Personas', desc:'Who you\'re building for, in detail.', icon:'user', tag:'core'},
  {key:'revenue', title:'Revenue Model', desc:'Pricing structure and monetization clarity.', icon:'dollar', tag:'core'},
  {key:'swot', title:'SWOT Analysis', desc:'Strengths, weaknesses, opportunities, threats.', icon:'shield', tag:'strategy'},
  {key:'roadmap', title:'MVP Roadmap', desc:'A phased build plan scoped to your category.', icon:'map', tag:'strategy'},
  {key:'landing', title:'Landing Page Generator', desc:'Headline and copy ready to ship.', icon:'layout', tag:'build'},
  {key:'pitch', title:'Pitch Deck Generator', desc:'A 7-slide investor-ready outline.', icon:'briefcase', tag:'fundraise'},
  {key:'investor', title:'Investor Readiness', desc:'Checklist against what investors actually ask.', icon:'check', tag:'fundraise'},
  {key:'viral', title:'Viral Potential', desc:'Growth loops most likely to work for this idea.', icon:'spark', tag:'growth'},
  {key:'cofounder', title:'Founder Matcher', desc:'Skills you should look for in a co-founder.', icon:'users', tag:'team'},
];

function renderModuleGrid(){
  document.getElementById('moduleGrid').innerHTML = MODULES.map(m=>`
    <div class="module-card" onclick="openModule('${m.key}')">
      <div class="module-top">
        <div class="module-icon">${moduleIconSvg(m.icon)}</div>
        <svg class="module-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 11L11 5M11 5H6M11 5V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div>
        <h4>${m.title}</h4>
        <p>${m.desc}</p>
      </div>
      <span class="module-tag">${m.tag}</span>
    </div>
  `).join('');
}

function moduleIconSvg(key){
  const icons = {
    trend: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 13L7 8L10.5 11.5L16 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5H16V9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    grid: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
    user: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M3 16C3 12.5 5.5 11 9 11C12.5 11 15 12.5 15 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    dollar: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2V16M12 5.5C12 4.1 10.8 3 9 3C7.2 3 6 4.1 6 5.5C6 7 7.2 7.7 9 8C10.8 8.3 12 9 12 10.5C12 11.9 10.8 13 9 13C7.2 13 6 11.9 6 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L15 4.5V9C15 12.5 12.5 15 9 16.5C5.5 15 3 12.5 3 9V4.5L9 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    map: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4L6.5 2.5L11.5 4L16 2.5V14L11.5 15.5L6.5 14L2 15.5V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 2.5V14M11.5 4V15.5" stroke="currentColor" stroke-width="1.5"/></svg>',
    layout: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5H16" stroke="currentColor" stroke-width="1.5"/></svg>',
    briefcase: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="6" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 6V4.5C6.5 3.7 7.2 3 8 3H10C10.8 3 11.5 3.7 11.5 4.5V6" stroke="currentColor" stroke-width="1.5"/></svg>',
    spark: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L10.5 7.5L16 9L10.5 10.5L9 16L7.5 10.5L2 9L7.5 7.5L9 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    users: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6.5" cy="6" r="2.5" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 16C2 13 4 11.5 6.5 11.5C9 11.5 11 13 11 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11.5 12C13.5 12 15.5 13 15.5 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 9L7.8 11.3L12.5 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  return icons[key] || icons.check;
}

// Feature grid for landing page (reuses module list with marketing-style copy)
const LANDING_FEATURES = [
  {icon:'trend', title:'Market Validation', desc:'Real TAM/SAM/SOM sizing and demand signals, not guesswork.'},
  {icon:'grid', title:'Competitor Mapping', desc:'See exactly who you\'re up against and where the whitespace is.'},
  {icon:'user', title:'Audience Personas', desc:'Detailed personas built from your actual target audience.'},
  {icon:'dollar', title:'Revenue Modeling', desc:'Pricing benchmarks and monetization clarity scoring.'},
  {icon:'shield', title:'SWOT Analysis', desc:'Strengths, weaknesses, opportunities, and threats — laid out plainly.'},
  {icon:'map', title:'MVP Roadmap', desc:'A phased build plan scoped to your specific category.'},
  {icon:'layout', title:'Landing Page Copy', desc:'Headline, subhead, and CTA generated and ready to ship.'},
  {icon:'briefcase', title:'Pitch Deck Outline', desc:'A 7-slide investor-ready structure built from your idea.'},
  {icon:'check', title:'Investor Readiness', desc:'A checklist against what investors actually look for.'},
];
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('featGrid').innerHTML = LANDING_FEATURES.map(f=>`
    <div class="feat-card">
      <div class="feat-icon">${moduleIconSvg(f.icon)}</div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
    </div>
  `).join('');
});

// ============================================================
// MODAL SYSTEM — module detail views
// ============================================================
function openModal(){ document.getElementById('modalOverlay').classList.add('active'); document.body.style.overflow='hidden'; }
function closeModal(){ document.getElementById('modalOverlay').classList.remove('active'); document.body.style.overflow=''; }

async function openModule(key){
  if(!STATE.currentReport){ showToast('No report loaded'); return; }
  const m = MODULES.find(x=>x.key===key);
  document.getElementById('modalIcon').innerHTML = moduleIconSvg(m.icon);
  document.getElementById('modalTitle').textContent = m.title;
  document.getElementById('modalSubtitle').textContent = STATE.currentReport.idea.name;
  openModal();

  const cacheKey = STATE.currentReport.id + ':' + key;
  if(STATE.moduleCache[cacheKey]){
    document.getElementById('modalBody').innerHTML = STATE.moduleCache[cacheKey];
    return;
  }

  document.getElementById('modalBody').innerHTML = `<div class="modal-loading"><div class="modal-spinner"></div><p>Generating ${m.title.toLowerCase()}...</p></div>`;

  let html = '';
  try{
    html = await renderModuleContent(key, STATE.currentReport);
  }catch(e){
    console.error(e);
    html = `<div class="mc-block"><p class="mc-text">Something went wrong generating this report. Please try again.</p></div>`;
  }
  STATE.moduleCache[cacheKey] = html;
  document.getElementById('modalBody').innerHTML = html;
}

// ---------- Claude API narrative helper ----------
async function getAINarrative(prompt, fallback){
  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
    return text || fallback;
  }catch(e){
    console.error('AI narrative failed', e);
    return fallback;
  }
}

function pillForTone(tone){
  if(tone==='good') return 'pill-green';
  if(tone==='risk') return 'pill-coral';
  return 'pill-amber';
}

async function renderModuleContent(key, report){
  const {idea, score} = report;
  switch(key){

    case 'market': {
      const d = genMarketValidation(report);
      const aiText = await getAINarrative(
        `You are a startup analyst. In 2-3 sentences, give a sharp, specific assessment of market timing and demand for this startup idea: "${idea.name}" — ${idea.description}. Industry: ${idea.industry}. Target audience: ${idea.audience}. Category growth rate: ${score.baseline.growth}% annually. Be direct and specific, not generic. No preamble, just the assessment.`,
        d.narrative
      );
      return `
        <div class="mc-block">
          <h4>Market size</h4>
          <table class="mc-table">
            <tr><th>TAM</th><th>SAM</th><th>SOM</th></tr>
            <tr><td>$${d.tam}B</td><td>$${d.sam}B</td><td>$${d.som}B</td></tr>
          </table>
        </div>
        <div class="mc-block">
          <h4>Category signals</h4>
          <table class="mc-table">
            ${d.factors.map(f=>`<tr><td>${f.label}</td><td style="text-align:right;"><span class="pill ${pillForTone(f.tone)}">${f.val}</span></td></tr>`).join('')}
          </table>
        </div>
        <div class="mc-block">
          <h4>Analyst take</h4>
          <p class="mc-text">${escapeHtml(aiText)}</p>
        </div>`;
    }

    case 'competitors': {
      const d = genCompetitors(report);
      const aiText = await getAINarrative(
        `You are a startup analyst. In 2 sentences, explain the most important strategic implication of competing in the "${idea.industry}" space for a new startup called "${idea.name}" described as: ${idea.description}. Be direct, specific, and tactical — no preamble.`,
        d.whiteSpace
      );
      return `
        <div class="mc-block">
          <h4>Mapped competitors</h4>
          ${d.competitors.map(c=>`
            <div class="competitor-row">
              <div class="comp-logo">${c.name.slice(0,2).toUpperCase()}</div>
              <div class="comp-info"><h5>${c.name}</h5><p>${c.strength}</p></div>
              <div class="comp-strength">${c.overlap}% overlap</div>
            </div>
          `).join('')}
        </div>
        <div class="mc-block">
          <h4>Strategic read</h4>
          <p class="mc-text">${escapeHtml(aiText)}</p>
        </div>`;
    }

    case 'audience': {
      const d = genAudiencePersonas(report);
      return `
        <div class="mc-block">
          <h4>Primary audience: ${escapeHtml(d.primaryAudience)}</h4>
          ${d.personas.map(p=>`
            <div class="persona-card">
              <div class="persona-top">
                <div class="persona-avatar">${p.name.slice(0,2)}</div>
                <div><h5>${p.name}, ${p.age}</h5><span>${escapeHtml(p.role)}</span></div>
              </div>
              <div class="mc-list">
                <li><span class="b">Goal —</span> ${escapeHtml(p.goal)}</li>
                <li><span class="b">Pain —</span> ${escapeHtml(p.pain)}</li>
              </div>
              <p class="mc-text" style="margin-top:10px;font-style:italic;color:var(--text-faint);">${escapeHtml(p.quote)}</p>
            </div>
          `).join('')}
        </div>`;
    }

    case 'revenue': {
      const d = genRevenueModel(report);
      const aiText = await getAINarrative(
        `You are a startup analyst. In 2 sentences, give a sharp opinion on whether the "${d.model}" revenue model fits this idea: "${idea.description}" for audience "${idea.audience}". Be specific and direct, no preamble.`,
        d.narrative
      );
      return `
        <div class="mc-block">
          <h4>Pricing structure</h4>
          <table class="mc-table">
            <tr><th>Tier</th><th>Price</th></tr>
            ${d.tiers.map(t=>`<tr><td>${escapeHtml(t.tier)}</td><td>${escapeHtml(t.price)}</td></tr>`).join('')}
          </table>
        </div>
        <div class="mc-block">
          <h4>Monetization clarity</h4>
          <div class="metric-bar" style="margin-bottom:8px;"><div class="metric-bar-fill" style="width:${d.clarity}%;background:${d.clarity>=70?'#39FF6A':d.clarity>=45?'#FFB23E':'#FF4D4D'};"></div></div>
          <p class="mc-text">${d.clarity}/100 — break-even around ${d.breakEvenUsers.toLocaleString()} paying users.</p>
        </div>
        <div class="mc-block">
          <h4>Analyst take</h4>
          <p class="mc-text">${escapeHtml(aiText)}</p>
        </div>`;
    }

    case 'swot': {
      const d = genSWOT(report);
      const block = (title,cls,items)=>`
        <div class="swot-box ${cls}">
          <h5>${title}</h5>
          <ul class="mc-list">${items.map(i=>`<li><span class="b">—</span> ${escapeHtml(i)}</li>`).join('')}</ul>
        </div>`;
      return `<div class="swot-grid">
        ${block('Strengths','swot-s',d.strengths)}
        ${block('Weaknesses','swot-w',d.weaknesses)}
        ${block('Opportunities','swot-o',d.opportunities)}
        ${block('Threats','swot-t',d.threats)}
      </div>`;
    }

    case 'roadmap': {
      const d = genMVPRoadmap(report);
      return `
        <div class="mc-block">
          <h4>Estimated build time: ${d.totalWeeks} weeks</h4>
          <div class="timeline">
            ${d.phases.map((p,i)=>`
              <div class="tl-item">
                <div class="tl-marker"></div>
                ${i<d.phases.length-1?'<div class="tl-line"></div>':''}
                <div class="tl-content">
                  <div class="tl-phase">${p.phase}</div>
                  <h5>${escapeHtml(p.title)}</h5>
                  <p>${escapeHtml(p.desc)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    case 'landing': {
      const d = genLandingCopy(report);
      return `
        <div class="mc-block">
          <div class="landing-preview">
            <span class="lp-badge">${escapeHtml(d.badge)}</span>
            <h3>${escapeHtml(d.headline)}</h3>
            <p>${escapeHtml(d.sub)}</p>
            <button class="btn btn-primary btn-sm" disabled style="opacity:1;">${escapeHtml(d.cta)}</button>
          </div>
        </div>
        <div class="mc-block">
          <h4>Copy elements</h4>
          <table class="mc-table">
            <tr><td>Headline</td><td>${escapeHtml(d.headline)}</td></tr>
            <tr><td>Subhead</td><td>${escapeHtml(d.sub)}</td></tr>
            <tr><td>CTA</td><td>${escapeHtml(d.cta)}</td></tr>
          </table>
        </div>`;
    }

    case 'pitch': {
      const d = genPitchDeck(report);
      return `<div class="mc-block">
        ${d.map((s,i)=>`
          <div class="pitch-slide">
            <div class="pitch-slide-num">SLIDE ${String(i+1).padStart(2,'0')}</div>
            <h5>${escapeHtml(s.title)}</h5>
            <p>${escapeHtml(s.body)}</p>
          </div>
        `).join('')}
      </div>`;
    }

    case 'investor': {
      const d = genInvestorReadiness(report);
      return `
        <div class="mc-block">
          <h4>Readiness score: ${d.score}/100 — ${d.passed}/${d.total} checks passed</h4>
          <div class="mc-list">
            ${d.checklist.map(c=>`
              <li>
                <span class="b" style="color:${c.done?'var(--green)':'var(--coral)'};">${c.done?'✓':'✕'}</span>
                ${escapeHtml(c.item)}
              </li>
            `).join('')}
          </div>
        </div>`;
    }

    case 'viral': {
      const d = genViralPotential(report);
      return `
        <div class="mc-block">
          <h4>Viral potential score: ${d.score}/100</h4>
        </div>
        <div class="mc-block">
          <h4>Growth loops to consider</h4>
          ${d.loops.map(l=>`
            <div class="persona-card">
              <div class="persona-top">
                <span class="pill ${l.fit==='Strong fit'?'pill-green':'pill-amber'}">${l.fit}</span>
                <h5 style="margin-left:4px;">${escapeHtml(l.mechanism)}</h5>
              </div>
              <p class="mc-text">${escapeHtml(l.desc)}</p>
            </div>
          `).join('')}
        </div>`;
    }

    case 'cofounder': {
      const d = genFounderMatch(report);
      return `
        <div class="mc-block">
          <h4>Suggested co-founder archetype</h4>
          <div class="persona-card">
            <h5 style="margin-bottom:6px;">${escapeHtml(d.suggestedArchetype.name)}</h5>
            <p class="mc-text">${escapeHtml(d.suggestedArchetype.desc)}</p>
          </div>
        </div>
        <div class="mc-block">
          <h4>Skills to look for</h4>
          <div class="chip-grid">
            ${d.neededSkills.map(s=>`<span class="chip" style="cursor:default;">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`;
    }

    default: return '<p class="mc-text">Module not found.</p>';
  }
}

// ============================================================
// HISTORY
// ============================================================
async function renderHistory(){
  const listEl = document.getElementById('historyList');
  listEl.innerHTML = `<div class="skel" style="height:76px;"></div><div class="skel" style="height:76px;"></div>`;

  const keys = await storageList(userKey('report:'));
  if(!keys || keys.length===0){
    listEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="1.6"/><path d="M24 14V24L31 28" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <h3>No validations yet</h3>
        <p>Run your first validation to see it appear here.</p>
        <button class="btn btn-primary" onclick="goTo('form')">Validate an idea</button>
      </div>`;
    return;
  }

  const fullReports = [];
  for(const k of keys){
    const r = await storageGet(k);
    if(r) fullReports.push(r);
  }
  fullReports.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

  listEl.innerHTML = fullReports.map(r=>{
    const s = r.score;
    let color = '#39FF6A';
    if(s.overall<45) color='#FF4D4D'; else if(s.overall<70) color='#FFB23E';
    const date = new Date(r.createdAt);
    const dateStr = date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return `
      <div class="history-item" onclick="loadReportFromHistory('${r.id}')">
        <div class="history-left">
          <div class="history-score" style="border-color:${color};color:${color};">${s.overall}</div>
          <div class="history-info">
            <h4>${escapeHtml(r.idea.name)}</h4>
            <p>${escapeHtml(r.idea.industry)} · ${dateStr}</p>
          </div>
        </div>
        <div class="history-meta">
          <span class="score-verdict ${s.verdictClass}" style="margin-top:0;">${s.verdict}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>`;
  }).join('');
}

async function loadReportFromHistory(reportId){
  const r = await storageGet(userKey(`report:${reportId}`));
  if(!r){ showToast('Could not load that report'); return; }
  STATE.currentReport = r;
  renderDashboard(r);
  goTo('dashboard');
}

// ============================================================
// EXPORT
// ============================================================
function exportReport(){
  if(!STATE.currentReport){ showToast('Nothing to export'); return; }
  const r = STATE.currentReport;
  const lines = [];
  lines.push(`LAUNCHPROOF VALIDATION REPORT`);
  lines.push(`================================`);
  lines.push(`Idea: ${r.idea.name}`);
  lines.push(`Industry: ${r.idea.industry}`);
  lines.push(`Audience: ${r.idea.audience}`);
  lines.push(`Revenue model: ${r.idea.revenue}`);
  lines.push(`Stage: ${r.idea.stage}`);
  lines.push(``);
  lines.push(`Description:`);
  lines.push(r.idea.description);
  lines.push(``);
  lines.push(`VIABILITY SCORE: ${r.score.overall}/100 — ${r.score.verdict}`);
  lines.push(`--------------------------------`);
  lines.push(`Market Demand:        ${r.score.marketDemand}/100`);
  lines.push(`Differentiation:      ${r.score.differentiation}/100`);
  lines.push(`Feasibility:          ${r.score.feasibility}/100`);
  lines.push(`Monetization Clarity: ${r.score.monetization}/100`);
  lines.push(`Investor Readiness:   ${r.score.investorReadiness}/100`);
  lines.push(`Viral Potential:      ${r.score.viralPotential}/100`);
  lines.push(``);
  lines.push(`Generated by LaunchProof — ${new Date(r.createdAt).toLocaleString()}`);

  const blob = new Blob([lines.join('\n')], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.idea.name.replace(/[^a-z0-9]/gi,'_')}_validation_report.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report exported');
}

// ============================================================
// BACKGROUND CANVAS — particle network, mouse-reactive
// ============================================================
(function initCanvas(){
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let w,h, particles=[];
  let mouse = {x:-9999,y:-9999};

  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = Math.max(window.innerHeight, document.body.scrollHeight);
    const count = Math.min(70, Math.floor((w*h)/28000));
    particles = Array.from({length:count}, ()=>({
      x: Math.random()*w, y: Math.random()*Math.min(h, window.innerHeight*1.4),
      vx: (Math.random()-0.5)*0.25, vy: (Math.random()-0.5)*0.25, r: Math.random()*1.6+0.6
    }));
  }
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY + window.scrollY; });
  window.addEventListener('mouseleave', ()=>{ mouse.x=-9999; mouse.y=-9999; });
  resize();

  function tick(){
    ctx.clearRect(0,0,w,h);
    const viewTop = window.scrollY - 200;
    const viewBottom = window.scrollY + window.innerHeight + 200;

    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
      const dx = mouse.x-p.x, dy = mouse.y-p.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if(dist<140){
        p.x -= dx*0.004; p.y -= dy*0.004;
      }
    });

    for(let i=0;i<particles.length;i++){
      const p = particles[i];
      if(p.y<viewTop || p.y>viewBottom) continue;
      for(let j=i+1;j<particles.length;j++){
        const q = particles[j];
        const dx=p.x-q.x, dy=p.y-q.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist<110){
          ctx.strokeStyle = `rgba(57,255,106,${0.08*(1-dist/110)})`;
          ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(57,255,106,0.35)';
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
  setTimeout(resize, 500); // recalc after content lays out
})();

// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', ()=>{
  updateNavForScreen('landing');
});
