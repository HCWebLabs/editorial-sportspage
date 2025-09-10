/* ===== helpers ===== */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

/* Mobile nav toggle (same behavior as main) */
(function wireNavToggle(){
  const header=document.querySelector('.site-header');
  const btn=header?.querySelector('.nav-toggle');
  if(!header||!btn) return;
  btn.addEventListener('click',()=>{
    const open=header.dataset.open==='true';
    header.dataset.open=String(!open);
    btn.setAttribute('aria-expanded',String(!open));
  });
})();

/* Header countdown */
function startHeaderCountdown(){
  const wrap = $('#countdown'); if(!wrap) return;
  const iso = wrap.dataset.kickoff; if(!iso) return;
  const dEl=$('#cd-days'),hEl=$('#cd-hrs'),mEl=$('#cd-min'),sEl=$('#cd-sec');
  const pad2=n=>String(n).padStart(2,'0');
  function tick(){
    const now=new Date(); const diff=new Date(iso)-now;
    if(diff<=0){ dEl.textContent=hEl.textContent=mEl.textContent=sEl.textContent='00'; return; }
    let secs=Math.floor(diff/1000);
    const days=Math.floor(secs/86400); secs%=86400;
    const hrs=Math.floor(secs/3600); secs%=3600;
    const mins=Math.floor(secs/60); secs%=60;
    dEl.textContent=pad2(days); hEl.textContent=pad2(hrs); mEl.textContent=pad2(mins); sEl.textContent=pad2(secs);
  }
  tick(); setInterval(tick,1000);
}
startHeaderCountdown();

/* Tabs */
function initTabs(root){
  if(!root) return;
  const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
  const panels = tabs.map(t => $('#'+t.getAttribute('aria-controls')));

  function activate(i, focus=true){
    tabs.forEach((t,idx)=>{
      const on = idx===i;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      panels[idx].setAttribute('aria-hidden', (!on).toString());
      panels[idx].hidden = !on;
    });
    root.dataset.active = String(i);
    if(focus) tabs[i].focus({preventScroll:true});
  }

  tabs.forEach((t,idx)=>{
    t.addEventListener('click', ()=>activate(idx,false));
    t.addEventListener('keydown', (e)=>{
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); activate((idx+1)%tabs.length); }
      if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); activate((idx-1+tabs.length)%tabs.length); }
      if(e.key==='Home'){ e.preventDefault(); activate(0); }
      if(e.key==='End'){ e.preventDefault(); activate(tabs.length-1); }
    });
  });

  activate(Number(root.dataset.active)||0, false);
}
initTabs(document.getElementById('howtoTabs'));

/* ===== Form + checklist logic ===== */
const form = $('#dealForm');
const submitBtn = $('#submitBtn');
const clearBtn = $('#clearBtn');

const preList = $('#preList');
const preFill = $('#preFill');
const prePct  = $('#prePct');

const SEL = {
  business:'#biz', title:'#title', desc:'#desc', days:'#days', contact:'#email',
  location:['#area','#addr'], auth:'#auth', consent:'#consent', privacy:'#privacy',
  time:'#time', dates:['[name="start_date"]','[name="end_date"]']
};
const one  = s   => typeof s==='string' ? $(s, form) : null;
const many = arr => Array.isArray(arr)?arr.map(s=>$(s,form)).filter(Boolean):[];
const hasText  = el => !!el && String(el.value||'').trim().length>1;
const hasEmail = el => !!el && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(el.value||'').trim());
const isChecked= el => !!el && !!el.checked;
const anyFilled= els => els.some(hasText);

const tests = {
  business:()=>hasText(one(SEL.business)),
  title:()=>hasText(one(SEL.title)),
  desc:()=>hasText(one(SEL.desc)),
  days:()=>hasText(one(SEL.days)),
  contact:()=>hasEmail(one(SEL.contact)),
  location:()=>anyFilled(many(SEL.location)),
  auth:()=>isChecked(one(SEL.auth)),
  consent:()=>isChecked(one(SEL.consent)),
  privacy:()=>isChecked(one(SEL.privacy)),
  time:()=>hasText(one(SEL.time)),
  dates:()=>false
};
const required=['business','title','desc','days','contact','location','auth','consent','privacy'];

function buildPreChecklistAsConsent(){
  if (!preList) return;
  [...preList.children].forEach(li=>{
    if (li.querySelector('input[type="checkbox"]')) return;
    const key = li.dataset.key; if (!key) return;
    const labelHTML = li.innerHTML;
    li.classList.add('consent-item');
    li.innerHTML =
      `<input id="pre_${key}" type="checkbox" data-static="true" tabindex="-1" aria-hidden="true" aria-disabled="true">
       <label for="pre_${key}">${labelHTML}</label>`;
  });
}

function renderChecklist(){
  let done=0;

  required.forEach(k=>{
    const ok = tests[k]();
    const li = preList.querySelector(`li[data-key="${k}"]`);
    li?.classList.toggle('done', ok);
    const cb = document.getElementById(`pre_${k}`);
    if (cb){ cb.checked = ok; cb.setAttribute('aria-checked', ok); }
    if (ok) done++;
  });

  ['time','dates'].forEach(k=>{
    const ok = tests[k]();
    const li = preList.querySelector(`li[data-key="${k}"]`);
    li?.classList.toggle('done', ok);
    const cb = document.getElementById(`pre_${k}`);
    if (cb){ cb.checked = ok; cb.setAttribute('aria-checked', ok); }
  });

  const pct=Math.round((done/required.length)*100);
  preFill.style.width=pct+'%';
  prePct.textContent=pct+'%';
  submitBtn.disabled = (done!==required.length);
}

preList.addEventListener('click', e=>{
  const li=e.target.closest('li[data-key]'); if(!li) return;
  const key=li.dataset.key;

  if(['auth','consent','privacy'].includes(key)){
    const cb=one(SEL[key]);
    if(cb){ cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true})); }
    return;
  }

  const sel=SEL[key]; const target=Array.isArray(sel)?many(sel)[0]:one(sel);
  if(target?.focus){
    target.focus();
    target.scrollIntoView({behavior:'smooth', block:'center'});
  }
});

form.addEventListener('input', renderChecklist, true);
form.addEventListener('change', renderChecklist, true);
form.addEventListener('submit', e=>{
  e.preventDefault(); if(submitBtn.disabled) return;
  submitBtn.textContent='Submitted ✓'; submitBtn.disabled=true;
  setTimeout(()=>{ submitBtn.textContent='Submit Deal'; renderChecklist(); }, 1800);
});
clearBtn.addEventListener('click', ()=>{ form.reset(); submitBtn.disabled=true; renderChecklist(); $('#biz').focus(); });

buildPreChecklistAsConsent();
renderChecklist();

/* Optional: Font Awesome availability flag */
(function(){
  const ok = () => document.documentElement.classList.add('fa-ready');
  const nope = () => document.documentElement.classList.add('no-fa');
  if (!('fonts' in document)) { ok(); return; }
  Promise.race([
    document.fonts.load('900 12px "Font Awesome 6 Free"'),
    new Promise(r => setTimeout(r, 2000))
  ]).then(() => {
    const has = [...document.fonts].some(f => /Font Awesome 6 Free/i.test(f.family));
    (has ? ok : nope)();
  }).catch(nope);
})();
