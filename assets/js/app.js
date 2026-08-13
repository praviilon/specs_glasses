/* ============================== STATE ============================== */
const state = { route:'selfies', selfies:[], glasses:[], results:[] };
let currentUser = null;
let CSRF_TOKEN = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

const X_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 5l14 14M19 5L5 19"/></svg>`;
const WARN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 16.5h.01"/><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/></svg>`;

/* ============================== API HELPER ============================== */
async function api(path, { method='GET', json=null, form=null } = {}){
  const headers = {};
  if(method !== 'GET') headers['X-CSRF-Token'] = CSRF_TOKEN;
  let body;
  if(json){ headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  else if(form){ body = form; }
  const res = await fetch(path, { method, headers, body, credentials:'same-origin' });
  let data = {};
  try{ data = await res.json(); }catch(e){ /* non-json response */ }
  if(data && data.csrfToken) CSRF_TOKEN = data.csrfToken;
  if(!res.ok){
    const msg = (data && data.error) ? data.error : ('Something went wrong (' + res.status + ')');
    throw new Error(msg);
  }
  return data;
}

function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

/* ============================== TOAST ============================== */
function toast(msg, ms=2600){
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),300); }, ms);
}

/* ============================== MODAL / SHEET ============================== */
function openSheet(innerHTML, {center=false}={}){
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay'+(center?' center':'');
  overlay.id = 'activeOverlay';
  overlay.innerHTML = `<div class="sheet">${center?'':'<div class="sheet-handle"></div>'}${innerHTML}</div>`;
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeSheet(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));
  return overlay;
}
function closeSheet(){
  const o = document.getElementById('activeOverlay');
  if(o){ o.classList.remove('show'); setTimeout(()=>o.remove(),200); }
}

/* ============================== IMAGE HELPERS ============================== */
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function loadImg(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function canvasToImage(canvas){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.src = canvas.toDataURL('image/png');
  });
}
function canvasToBlob(canvas, type='image/png', quality){
  return new Promise((resolve)=>canvas.toBlob(resolve, type, quality));
}
function drawScaled(img, maxDim, type, quality){
  let width = img.naturalWidth, height = img.naturalHeight;
  const scale = Math.min(1, maxDim/Math.max(width,height));
  width = Math.max(1, Math.round(width*scale));
  height = Math.max(1, Math.round(height*scale));
  const c = document.createElement('canvas'); c.width=width; c.height=height;
  const ctx = c.getContext('2d');
  if(type==='image/jpeg'){ ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,height); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img,0,0,width,height);
  return c;
}
/**
 * Produces a full-size and thumbnail Blob pair from either a dataURL/URL string or a live canvas.
 */
async function variantsFromSource(source, {fullMax=1100, thumbMax=360, type='image/jpeg', quality=.9}={}){
  const img = (source instanceof HTMLCanvasElement) ? await canvasToImage(source) : await loadImg(source);
  const fullCanvas = drawScaled(img, fullMax, type, quality);
  const thumbCanvas = drawScaled(img, thumbMax, type, quality);
  const [fullBlob, thumbBlob] = await Promise.all([
    canvasToBlob(fullCanvas, type, quality),
    canvasToBlob(thumbCanvas, type, quality),
  ]);
  return { fullBlob, thumbBlob };
}

/* ============================== CAMERA CAPTURE ============================== */
async function openCamera(onCapture, onCancel){
  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top">
      <button id="camClose" aria-label="Close">${X_ICON}</button>
      <span class="title">Camera</span>
      <span style="width:34px"></span>
    </div>
    <div class="editor-stage" id="camStage">
      <div class="center-msg"><div class="spinner"></div><div>Requesting camera access…</div></div>
    </div>
    <div class="editor-bottom">
      <button class="btn btn-primary btn-block" id="camShoot" style="display:none">Capture photo</button>
      <button class="btn btn-secondary btn-block" id="camUseFile">Use a photo from files instead</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#camClose').onclick = ()=>{ stopStream(); screen.remove(); onCancel && onCancel(); };
  screen.querySelector('#camUseFile').onclick = ()=>{ stopStream(); screen.remove(); pickFromFiles().then(d=>d&&onCapture(d)); };

  let stream;
  function stopStream(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); } }

  try{
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:1280} }, audio:false });
    const stage = screen.querySelector('#camStage');
    stage.innerHTML = `<video id="camVideo" autoplay playsinline muted style="max-width:100%;max-height:78vh;border-radius:8px;"></video>`;
    const video = stage.querySelector('#camVideo');
    video.srcObject = stream;
    screen.querySelector('#camShoot').style.display = 'block';
    screen.querySelector('#camShoot').onclick = ()=>{
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext('2d');
      ctx.translate(c.width,0); ctx.scale(-1,1); // un-mirror to natural orientation
      ctx.drawImage(video,0,0,c.width,c.height);
      const dataUrl = c.toDataURL('image/jpeg',.92);
      stopStream(); screen.remove();
      onCapture(dataUrl);
    };
  }catch(err){
    const stage = screen.querySelector('#camStage');
    stage.innerHTML = `<div class="center-msg">
      <div style="font-size:30px;">📷</div>
      <div><strong>Camera unavailable</strong><br>${err && err.name==='NotAllowedError' ? 'Camera permission was denied.' : 'Your browser blocked camera access.'}<br>Choose a photo from your files instead.</div>
    </div>`;
  }
}

function pickFromFiles(){
  return new Promise((resolve)=>{
    const input = document.createElement('input');
    input.type='file'; input.accept='image/*';
    input.onchange = async ()=>{
      const file = input.files[0];
      if(!file){ resolve(null); return; }
      const dataUrl = await fileToDataUrl(file);
      resolve(dataUrl);
    };
    input.click();
  });
}

/* ============================== SKIN / FACE HEURISTIC ============================== */
function isSkinPixel(r,g,b){
  return r>90 && g>40 && b>20 && (Math.max(r,g,b)-Math.min(r,g,b))>12 && Math.abs(r-g)>=8 && r>=g && r>=b*0.95;
}
function detectFaceRegion(img){
  const SW = 220;
  const scale = SW/img.naturalWidth;
  const SH = Math.max(1,Math.round(img.naturalHeight*scale));
  const c = document.createElement('canvas'); c.width=SW; c.height=SH;
  const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,SW,SH);
  const data = ctx.getImageData(0,0,SW,SH).data;
  const colSum = new Array(SW).fill(0), rowSum = new Array(SH).fill(0);
  let total = 0;
  for(let y=0;y<SH;y++){
    for(let x=0;x<SW;x++){
      const i = (y*SW+x)*4;
      if(isSkinPixel(data[i],data[i+1],data[i+2])){ colSum[x]++; rowSum[y]++; total++; }
    }
  }
  const frac = total/(SW*SH);
  if(frac < 0.025) return { ok:false, reason:'no-face' };
  function bounds(arr, sumTotal){
    const target = sumTotal*0.10;
    let acc=0, lo=0; for(;lo<arr.length;lo++){ acc+=arr[lo]; if(acc>=target) break; }
    acc=0; let hi=arr.length-1; for(;hi>=0;hi--){ acc+=arr[hi]; if(acc>=target) break; }
    if(hi<=lo){ lo=0; hi=arr.length-1; }
    return [lo,hi];
  }
  const [x0,x1] = bounds(colSum, total);
  const [y0,y1] = bounds(rowSum, total);
  let w = x1-x0, h = y1-y0;
  if(w<8 || h<8) return { ok:false, reason:'no-face' };
  const padX = w*0.28, padY = h*0.32;
  let nx0 = Math.max(0,x0-padX), nx1 = Math.min(SW,x1+padX);
  let ny0 = Math.max(0,y0-padY*1.4), ny1 = Math.min(SH,y1+padY*0.6);
  const ratio = (ny1-ny0)/(nx1-nx0);
  const offCenterX = Math.abs(((x0+x1)/2) - SW/2)/SW;
  let warn = null;
  if(ratio < 0.95 || ratio > 1.85) warn = 'angle';
  if(offCenterX > 0.22) warn = 'angle';
  return { ok:true, warn, x: nx0/scale, y: ny0/scale, w:(nx1-nx0)/scale, h:(ny1-ny0)/scale };
}

/* ============================== BACKGROUND REMOVAL ============================== *
 * v1 compared each pixel only to its immediate neighbor, which let the fill "drift" through
 * gradients deep into the glasses (the disappearing-glasses bug).
 * v2 fixed that by additionally requiring closeness to a fixed background reference color —
 * but ALSO still required a smooth step from the previous pixel to keep growing. That extra
 * requirement meant a single noisy pixel (JPEG artifact, faint shadow) could block the fill
 * from ever reaching real background just beyond it, leaving little islands that needed
 * manual tapping.
 * v3 (this version) drops the neighbor-chain dependency entirely: every pixel is classified
 * independently against the background reference color, so there's nothing for the fill to
 * "drift" along in the first place — that's what keeps it safe. A quick morphological closing
 * pass bridges tiny 1px noise gaps in that classification before flood-filling from the
 * border, so real background reachable through a slightly-off pixel no longer gets stranded.
 */
function colorDist(r1,g1,b1,r2,g2,b2){ return Math.sqrt((r1-r2)**2+(g1-g2)**2+(b1-b2)**2); }

function pxAt(d,w,x,y){ const i=(y*w+x)*4; return [d[i],d[i+1],d[i+2]]; }

function sampleBorderColor(d,w,h){
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(w,h)/50));
  for(let x=0;x<w;x+=step){ samples.push(pxAt(d,w,x,0)); samples.push(pxAt(d,w,x,h-1)); }
  for(let y=0;y<h;y+=step){ samples.push(pxAt(d,w,0,y)); samples.push(pxAt(d,w,w-1,y)); }
  function median(arr){ const s = arr.slice().sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
  return [median(samples.map(s=>s[0])), median(samples.map(s=>s[1])), median(samples.map(s=>s[2]))];
}

function neighbors4(idx, w, h){
  const x = idx % w, y = (idx/w)|0;
  const out = [];
  if(x>0) out.push(idx-1);
  if(x<w-1) out.push(idx+1);
  if(y>0) out.push(idx-w);
  if(y<h-1) out.push(idx+w);
  return out;
}

function removeBackground(canvas, opts={}){
  const globalTolerance = opts.globalTolerance != null ? opts.globalTolerance : 88;
  const ctx = canvas.getContext('2d');
  const {width:w, height:h} = canvas;
  const imgData = ctx.getImageData(0,0,w,h);
  const d = imgData.data;
  const bg = sampleBorderColor(d,w,h);
  const n = w*h;

  // Step 1 — classify every pixel independently against the fixed background reference.
  // No pixel's classification depends on any other pixel's color, so there's no chain to drift.
  let bgLike = new Uint8Array(n);
  for(let i=0;i<n;i++){
    const o = i*4;
    if(colorDist(bg[0],bg[1],bg[2], d[o],d[o+1],d[o+2]) <= globalTolerance) bgLike[i]=1;
  }

  // Step 2 — morphological closing (dilate then erode) to bridge tiny 1px gaps in that
  // classification caused by noise/compression artifacts, without moving the real boundary.
  function dilate(mask){
    const out = new Uint8Array(n);
    for(let i=0;i<n;i++){
      if(mask[i]){ out[i]=1; continue; }
      const nb = neighbors4(i,w,h);
      for(let k=0;k<nb.length;k++){ if(mask[nb[k]]){ out[i]=1; break; } }
    }
    return out;
  }
  function erode(mask){
    const out = new Uint8Array(n);
    for(let i=0;i<n;i++){
      if(!mask[i]) continue;
      const nb = neighbors4(i,w,h);
      let allSet = true;
      for(let k=0;k<nb.length;k++){ if(!mask[nb[k]]){ allSet=false; break; } }
      out[i] = allSet ? 1 : 0;
    }
    return out;
  }
  bgLike = erode(dilate(bgLike));

  // Step 3 — flood fill from the image border over the (closed) bgLike mask, so only the
  // background blob actually touching the edges gets removed. An interior region that happens
  // to share the background's color (a pale logo, say) is left alone since it's not connected
  // to the edge through other bgLike pixels.
  const remove = new Uint8Array(n);
  const visited = new Uint8Array(n);
  const queue = [];
  for(let x=0;x<w;x++){ queue.push(x); queue.push((h-1)*w+x); }
  for(let y=0;y<h;y++){ queue.push(y*w); queue.push(y*w+(w-1)); }
  let qi=0;
  while(qi<queue.length){
    const idx = queue[qi++];
    if(visited[idx]) continue;
    visited[idx]=1;
    if(!bgLike[idx]) continue;
    remove[idx]=1;
    const nb = neighbors4(idx,w,h);
    for(let k=0;k<nb.length;k++){ if(!visited[nb[k]]) queue.push(nb[k]); }
  }

  // Step 4 — soft erosion: pull back the alpha of opaque pixels that touch a removed pixel,
  // to kill the leftover color-fringe halo instead of leaving a hard, tinted edge.
  const erodeMask = new Uint8Array(n);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx = y*w+x;
      if(remove[idx]) continue;
      let touches = false;
      if(x>0 && remove[idx-1]) touches = true;
      if(x<w-1 && remove[idx+1]) touches = true;
      if(y>0 && remove[idx-w]) touches = true;
      if(y<h-1 && remove[idx+w]) touches = true;
      if(touches) erodeMask[idx] = 1;
    }
  }

  let kept = 0;
  for(let i=0;i<n;i++){
    const a4 = i*4+3;
    if(remove[i]){ d[a4] = 0; }
    else if(erodeMask[i]){
      d[a4] = Math.round(d[a4]*0.45);
      if(d[a4] < 40){ d[a4] = 0; } else { kept++; }
    } else { kept++; }
  }
  ctx.putImageData(imgData,0,0);
  return kept/n;
}

function opaqueBoundingBox(canvas){
  const ctx = canvas.getContext('2d');
  const {width:w,height:h} = canvas;
  const d = ctx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const a = d[(y*w+x)*4+3];
      if(a>20){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
    }
  }
  if(maxX<0) return null;
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}

function floodFillTransparent(canvas, sx, sy, tolerance){
  const ctx = canvas.getContext('2d');
  const {width:w,height:h} = canvas;
  if(sx<0||sy<0||sx>=w||sy>=h) return;
  const imgData = ctx.getImageData(0,0,w,h);
  const d = imgData.data;
  const startIdx = sy*w+sx;
  if(d[startIdx*4+3] < 10) return;
  const [r0,g0,b0] = [d[startIdx*4],d[startIdx*4+1],d[startIdx*4+2]];
  const visited = new Uint8Array(w*h);
  const stack = [startIdx];
  visited[startIdx]=1;
  while(stack.length){
    const idx = stack.pop();
    const i = idx*4;
    if(d[i+3] < 10) continue;
    if(colorDist(r0,g0,b0,d[i],d[i+1],d[i+2]) > tolerance) continue;
    d[i+3] = 0;
    const x = idx%w, y=(idx/w)|0;
    const neighbors=[];
    if(x>0) neighbors.push(idx-1);
    if(x<w-1) neighbors.push(idx+1);
    if(y>0) neighbors.push(idx-w);
    if(y<h-1) neighbors.push(idx+w);
    for(const n of neighbors){ if(!visited[n]){ visited[n]=1; stack.push(n); } }
  }
  ctx.putImageData(imgData,0,0);
}

/* ============================== AUTH ============================== */
async function boot(){
  try{
    const data = await api('api/me.php');
    if(data.authenticated){
      currentUser = data.user;
      await enterApp();
    }else{
      renderAuthGate('login');
    }
  }catch(e){
    renderAuthGate('login');
  }
  wireStaticHeaderButtons();
}

async function enterApp(){
  document.getElementById('headerActions').style.display = 'flex';
  document.querySelector('nav.bottombar').style.display = 'flex';
  try{
    await loadAllData();
  }catch(e){
    toast(e.message || 'Could not load your data');
  }
  setRoute('selfies');
}

async function loadAllData(){
  const [s,g,r] = await Promise.all([
    api('api/selfies.php'), api('api/glasses.php'), api('api/results.php')
  ]);
  state.selfies = s.selfies; state.glasses = g.glasses; state.results = r.results;
}

function renderAuthGate(mode){
  document.getElementById('headerActions').style.display = 'none';
  document.querySelector('nav.bottombar').style.display = 'none';
  const view = document.getElementById('view');
  const isLogin = mode === 'login';
  view.innerHTML = `
    <div class="authwrap">
      <div class="authcard">
        <h1>${isLogin ? 'Welcome back' : 'Create your account'}</h1>
        <p class="sub">${isLogin ? 'Log in to reach your saved selfies and glasses.' : 'Save your selfies and glasses, and pick up where you left off anywhere.'}</p>
        <div id="authError"></div>
        <form id="authForm">
          <div class="field">
            <label for="authEmail">Email</label>
            <input id="authEmail" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="authPassword">Password</label>
            <input id="authPassword" type="password" autocomplete="${isLogin?'current-password':'new-password'}" minlength="8" required />
          </div>
          ${isLogin ? '' : `
          <div class="field">
            <label for="authPassword2">Confirm password</label>
            <input id="authPassword2" type="password" autocomplete="new-password" minlength="8" required />
          </div>`}
          <button type="submit" class="btn btn-primary btn-block" id="authSubmit">${isLogin ? 'Log in' : 'Create account'}</button>
        </form>
        <div class="switch-line">
          ${isLogin ? `New here? <button id="switchMode">Create an account</button>` : `Already have an account? <button id="switchMode">Log in</button>`}
        </div>
      </div>
    </div>
  `;
  document.getElementById('switchMode').onclick = ()=>renderAuthGate(isLogin?'register':'login');
  document.getElementById('authForm').onsubmit = async (e)=>{
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errBox = document.getElementById('authError');
    errBox.innerHTML = '';
    if(!isLogin){
      const password2 = document.getElementById('authPassword2').value;
      if(password !== password2){
        errBox.innerHTML = `<div class="form-error">Passwords don't match.</div>`;
        return;
      }
    }
    const btn = document.getElementById('authSubmit');
    btn.disabled = true; btn.textContent = isLogin ? 'Logging in…' : 'Creating account…';
    try{
      const data = isLogin
        ? await api('api/login.php', { method:'POST', json:{email,password} })
        : await api('api/register.php', { method:'POST', json:{email,password} });
      currentUser = data.user;
      await enterApp();
    }catch(err){
      errBox.innerHTML = `<div class="form-error">${escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = isLogin ? 'Log in' : 'Create account';
    }
  };
}

async function handleLogout(){
  await api('api/logout.php', { method:'POST' });
  currentUser = null;
  state.selfies = []; state.glasses = []; state.results = [];
  renderAuthGate('login');
}

function wireStaticHeaderButtons(){
  document.getElementById('navSelfies').onclick = ()=>setRoute('selfies');
  document.getElementById('navGlasses').onclick = ()=>setRoute('glasses');
  document.getElementById('resultsBtn').onclick = ()=>showResultsSheet();
  document.getElementById('accountBtn').onclick = ()=>{
    openSheet(`
      <button class="sheet-close" id="closeX">${X_ICON}</button>
      <div class="sheet-title">Account</div>
      <div class="sheet-desc">${escapeHtml(currentUser ? currentUser.email : '')}</div>
      <button class="btn btn-danger btn-block" id="logoutBtn">Log out</button>
    `, {center:true});
    document.getElementById('closeX').onclick = closeSheet;
    document.getElementById('logoutBtn').onclick = async ()=>{
      closeSheet();
      try{ await handleLogout(); toast('Logged out'); }
      catch(e){ toast(e.message || 'Could not log out'); }
    };
  };
}

/* ============================== ROUTER ============================== */
function setRoute(route){
  state.route = route;
  document.getElementById('navSelfies').classList.toggle('active', route==='selfies');
  document.getElementById('navGlasses').classList.toggle('active', route==='glasses');
  render();
}

function render(){
  const view = document.getElementById('view');
  view.innerHTML = state.route==='selfies' ? renderSelfiesPage() : renderGlassesPage();
  wireSelfiesGlassesEvents();
}

/* ============================== SELFIES PAGE ============================== */
function renderSelfiesPage(){
  return `
    <h1 class="page-title">My selfies</h1>
    <p class="page-sub">Saved photos of your face, ready to try glasses on.</p>
    ${state.selfies.length===0 ? `
      <div class="empty-state">
        <div class="ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="11" r="7.2"/><circle cx="9.3" cy="10.2" r=".9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.2" r=".9" fill="currentColor" stroke="none"/><path d="M9 14.2c.8.8 1.9 1.2 3 1.2s2.2-.4 3-1.2"/></svg></div>
        <strong>No selfies yet</strong>
        <p>Add a clear, front-facing photo of your face to start trying on glasses.</p>
        <button class="btn btn-primary" id="addSelfieBtn">Add a selfie</button>
      </div>` : `
      <div class="section-head"><h2>${state.selfies.length} saved</h2></div>
      <div class="grid" style="margin-bottom:90px;" id="selfieGrid">
        ${state.selfies.slice().reverse().map(s=>`
          <div class="tile" data-id="${s.id}" data-kind="selfie">
            <img src="${s.thumbUrl}" loading="lazy" />
            <button class="tile-del" data-id="${s.id}" data-kind="selfie" aria-label="Delete">${X_ICON}</button>
          </div>`).join('')}
      </div>
      <div style="position:fixed; right:24px; bottom:96px; max-width:480px; margin:0 auto;">
        <button class="btn fab" id="addSelfieFab" aria-label="Add selfie" title="Add selfie">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    `}
  `;
}

/* ============================== GLASSES PAGE ============================== */
function renderGlassesPage(){
  return `
    <h1 class="page-title">My glasses</h1>
    <p class="page-sub">Photos of glasses, cut out and ready to try on.</p>
    ${state.glasses.length===0 ? `
      <div class="empty-state">
        <div class="ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6.3" cy="14" r="3.6"/><circle cx="17.7" cy="14" r="3.6"/><path d="M9.9 13.2h4.2M2.4 13 4 9.5c.4-.9 1.1-1.4 2-1.4M21.6 13 20 9.5c-.4-.9-1.1-1.4-2-1.4"/></svg></div>
        <strong>No glasses yet</strong>
        <p>Add a photo of a pair of glasses, front-on, to try them on.</p>
        <button class="btn btn-primary" id="addGlassesBtn">Add glasses</button>
      </div>` : `
      <div class="section-head"><h2>${state.glasses.length} saved</h2></div>
      <div class="grid" style="margin-bottom:90px;" id="glassesGrid">
        ${state.glasses.slice().reverse().map(g=>`
          <div class="tile checker" data-id="${g.id}" data-kind="glasses">
            <img src="${g.thumbUrl}" loading="lazy" style="object-fit:contain; padding:8px;"/>
            <button class="tile-del" data-id="${g.id}" data-kind="glasses" aria-label="Delete">${X_ICON}</button>
            <span class="tile-tag">${g.lensType==='clear'?'Clear':'Tinted'}</span>
          </div>`).join('')}
      </div>
      <div style="position:fixed; right:24px; bottom:96px; max-width:480px; margin:0 auto;">
        <button class="btn fab" id="addGlassesFab" aria-label="Add glasses" title="Add glasses">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    `}
  `;
}

function wireSelfiesGlassesEvents(){
  const addSelfieBtn = document.getElementById('addSelfieBtn');
  const addSelfieFab = document.getElementById('addSelfieFab');
  if(addSelfieBtn) addSelfieBtn.onclick = ()=>openSelfieActionSheet();
  if(addSelfieFab) addSelfieFab.onclick = ()=>openSelfieActionSheet();

  const addGlassesBtn = document.getElementById('addGlassesBtn');
  const addGlassesFab = document.getElementById('addGlassesFab');
  if(addGlassesBtn) addGlassesBtn.onclick = ()=>openGlassesActionSheet();
  if(addGlassesFab) addGlassesFab.onclick = ()=>openGlassesActionSheet();

  document.querySelectorAll('.tile-del').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); deleteItem(btn.dataset.kind, btn.dataset.id); };
  });
  document.querySelectorAll('.tile').forEach(tile=>{
    tile.onclick = ()=>{
      const kind = tile.dataset.kind, id = Number(tile.dataset.id);
      if(kind==='selfie') openSelfiePreview(id); else openGlassesPreview(id);
    };
  });
}

async function deleteItem(kind, rawId){
  const id = Number(rawId);
  const endpointMap = { selfie:'api/selfies.php', glasses:'api/glasses.php', result:'api/results.php' };
  try{
    await api(endpointMap[kind] + '?id=' + id, { method:'DELETE' });
    if(kind==='selfie') state.selfies = state.selfies.filter(s=>s.id!==id);
    else if(kind==='glasses') state.glasses = state.glasses.filter(g=>g.id!==id);
    else state.results = state.results.filter(r=>r.id!==id);
    render();
    toast('Deleted');
  }catch(err){
    toast(err.message || 'Could not delete');
  }
}

function openSelfiePreview(id){
  const s = state.selfies.find(x=>x.id===id); if(!s) return;
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <img src="${s.fullUrl}" style="width:100%; border-radius:14px; margin-bottom:16px;"/>
    <button class="btn btn-danger btn-block" id="delBtn">Delete this selfie</button>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('delBtn').onclick = ()=>{ closeSheet(); deleteItem('selfie',id); };
}

function openGlassesPreview(id){
  const g = state.glasses.find(x=>x.id===id); if(!g) return;
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="checker" style="border-radius:14px; padding:18px; margin-bottom:16px;">
      <img src="${g.fullUrl}" style="width:100%; display:block;"/>
    </div>
    <button class="btn btn-primary btn-block" id="tryBtn" style="margin-bottom:10px;">Try it on</button>
    <button class="btn btn-danger btn-block" id="delBtn">Delete these glasses</button>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('delBtn').onclick = ()=>{ closeSheet(); deleteItem('glasses',id); };
  document.getElementById('tryBtn').onclick = ()=>{ closeSheet(); startTryOn(g); };
}

/* ============================== ADD SELFIE FLOW ============================== */
function openSelfieActionSheet(){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Add a selfie</div>
    <div class="sheet-desc">A clear front-facing photo helps glasses line up naturally.</div>
    <button class="sheet-row ${state.selfies.length? '':'disabled'}" id="viewSaved">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
      <div class="row-text"><strong>View saved selfies</strong><span>${state.selfies.length} saved</span></div>
    </button>
    <button class="sheet-row" id="takeNew">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h2.2l1-2h9.6l1 2H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8Z"/><circle cx="12" cy="13.5" r="3.4"/></svg></div>
      <div class="row-text"><strong>Take a new selfie</strong><span>Use your camera</span></div>
    </button>
    <button class="sheet-row" id="chooseFile">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5-9 9"/></svg></div>
      <div class="row-text"><strong>Choose existing photo</strong><span>From your files</span></div>
    </button>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('viewSaved').onclick = ()=>{ if(!state.selfies.length) return; closeSheet(); showSavedSelfiesSheet(); };
  document.getElementById('takeNew').onclick = ()=>{ closeSheet(); showSelfieWarning('camera'); };
  document.getElementById('chooseFile').onclick = ()=>{ closeSheet(); showSelfieWarning('file'); };
}

function showSavedSelfiesSheet(){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Saved selfies</div>
    <div class="grid" style="margin-top:14px;">
      ${state.selfies.slice().reverse().map(s=>`<div class="tile" data-id="${s.id}"><img src="${s.thumbUrl}"/></div>`).join('')}
    </div>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.querySelectorAll('#activeOverlay .tile').forEach(t=>{
    t.onclick = ()=>{ closeSheet(); openSelfiePreview(Number(t.dataset.id)); };
  });
}

function showSelfieWarning(source){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Before you start</div>
    <div class="banner">${WARN_ICON}<div>Face the camera directly. Keep your eyes open, visible, and look straight into the lens.</div></div>
    <button class="btn btn-primary btn-block" id="goBtn">Got it, continue</button>
  `, {center:true});
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('goBtn').onclick = async ()=>{
    closeSheet();
    if(source==='camera'){
      openCamera((dataUrl)=>openCropEditor(dataUrl,'face'), ()=>{});
    }else{
      const d = await pickFromFiles();
      if(d) openCropEditor(d,'face');
    }
  };
}

/* ============================== ADD GLASSES FLOW ============================== */
function openGlassesActionSheet(){
  const noSelfies = state.selfies.length===0;
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Add glasses</div>
    <div class="sheet-desc">Photograph the glasses from the front, against a plain background if you can.</div>
    ${noSelfies ? `<div class="banner">${WARN_ICON}<div>Please add your selfie photo first — you'll need it to try glasses on.</div></div>` : ''}
    <button class="sheet-row ${state.glasses.length? '':'disabled'}" id="viewSaved">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
      <div class="row-text"><strong>View saved glasses</strong><span>${state.glasses.length} saved</span></div>
    </button>
    <button class="sheet-row ${noSelfies?'disabled':''}" id="takeNew">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h2.2l1-2h9.6l1 2H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8Z"/><circle cx="12" cy="13.5" r="3.4"/></svg></div>
      <div class="row-text"><strong>Take a new photo</strong><span>Use your camera</span></div>
    </button>
    <button class="sheet-row ${noSelfies?'disabled':''}" id="chooseFile">
      <div class="row-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5-9 9"/></svg></div>
      <div class="row-text"><strong>Choose existing photo</strong><span>From your files</span></div>
    </button>
    ${noSelfies ? `<button class="btn btn-secondary btn-block" id="goAddSelfie" style="margin-top:6px;">Add a selfie now</button>` : ''}
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('viewSaved').onclick = ()=>{ if(!state.glasses.length) return; closeSheet(); showSavedGlassesSheet(); };
  if(!noSelfies){
    document.getElementById('takeNew').onclick = ()=>{ closeSheet(); showGlassesWarning('camera'); };
    document.getElementById('chooseFile').onclick = ()=>{ closeSheet(); showGlassesWarning('file'); };
  }
  const goAdd = document.getElementById('goAddSelfie');
  if(goAdd) goAdd.onclick = ()=>{ closeSheet(); setRoute('selfies'); setTimeout(openSelfieActionSheet,250); };
}

function showSavedGlassesSheet(){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Saved glasses</div>
    <div class="grid" style="margin-top:14px;">
      ${state.glasses.slice().reverse().map(g=>`<div class="tile checker" data-id="${g.id}"><img src="${g.thumbUrl}" style="object-fit:contain;padding:6px;"/></div>`).join('')}
    </div>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.querySelectorAll('#activeOverlay .tile').forEach(t=>{
    t.onclick = ()=>{ closeSheet(); openGlassesPreview(Number(t.dataset.id)); };
  });
}

function showGlassesWarning(source){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Before you start</div>
    <div class="banner">${WARN_ICON}<div>Photograph the glasses straight-on (frontal projection), with both lenses fully visible and even lighting.</div></div>
    <button class="btn btn-primary btn-block" id="goBtn">Got it, continue</button>
  `, {center:true});
  document.getElementById('closeX').onclick = closeSheet;
  document.getElementById('goBtn').onclick = async ()=>{
    closeSheet();
    if(source==='camera'){
      openCamera((dataUrl)=>openCropEditor(dataUrl,'glasses'), ()=>{});
    }else{
      const d = await pickFromFiles();
      if(d) openCropEditor(d,'glasses');
    }
  };
}

/* ============================== CROP EDITOR ============================== */
async function openCropEditor(dataUrl, mode){
  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top">
      <button id="edClose">${X_ICON}</button>
      <span class="title">${mode==='face' ? 'Crop your selfie' : 'Crop your glasses'}</span>
      <span style="width:34px"></span>
    </div>
    <div class="editor-stage" id="edStage">
      <div class="center-msg"><div class="spinner"></div><div>Loading photo…</div></div>
    </div>
    <div class="editor-bottom">
      <div class="hint-pill" id="hintPill">Drag the corners to frame ${mode==='face'?'your face':'the glasses'}</div>
      <div class="row">
        <button class="btn btn-secondary" id="autoBtn">✨ Auto-detect</button>
        <button class="btn btn-primary" id="confirmBtn">Use this crop</button>
      </div>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();

  const img = await loadImg(dataUrl);
  const stage = screen.querySelector('#edStage');
  stage.innerHTML = `<div class="crop-img-wrap" id="cropWrap"><img id="cropImg" src="${dataUrl}"/>
    <div class="crop-box" id="cropBox">
      <div class="handle tl" data-h="tl"></div><div class="handle tr" data-h="tr"></div>
      <div class="handle bl" data-h="bl"></div><div class="handle br" data-h="br"></div>
    </div></div>`;

  const dispImg = document.getElementById('cropImg');
  const box = document.getElementById('cropBox');

  await new Promise(r=>{ if(dispImg.complete) r(); else dispImg.onload=r; });

  let rect = { x: dispImg.width*0.18, y: dispImg.height*0.12, w: dispImg.width*0.64, h: dispImg.height*0.76 };
  function applyRect(){
    box.style.left = rect.x+'px'; box.style.top = rect.y+'px';
    box.style.width = rect.w+'px'; box.style.height = rect.h+'px';
  }
  requestAnimationFrame(()=>{
    rect = { x: dispImg.offsetWidth*0.18, y: dispImg.offsetHeight*0.12, w: dispImg.offsetWidth*0.64, h: dispImg.offsetHeight*0.76 };
    applyRect();
  });

  function clamp(){
    rect.x = Math.max(0, Math.min(rect.x, dispImg.offsetWidth-30));
    rect.y = Math.max(0, Math.min(rect.y, dispImg.offsetHeight-30));
    rect.w = Math.max(30, Math.min(rect.w, dispImg.offsetWidth-rect.x));
    rect.h = Math.max(30, Math.min(rect.h, dispImg.offsetHeight-rect.y));
  }

  let dragMode=null, startPt=null, startRect=null;
  function ptFromEvent(e){ const t = e.touches ? e.touches[0] : e; return {x:t.clientX, y:t.clientY}; }
  box.addEventListener('pointerdown', (e)=>{
    if(e.target.classList.contains('handle')) return;
    dragMode='move'; startPt=ptFromEvent(e); startRect={...rect};
    box.setPointerCapture && box.setPointerCapture(e.pointerId);
  });
  box.querySelectorAll('.handle').forEach(h=>{
    h.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      dragMode = h.dataset.h; startPt = ptFromEvent(e); startRect = {...rect};
      h.setPointerCapture && h.setPointerCapture(e.pointerId);
    });
  });
  window.addEventListener('pointermove', (e)=>{
    if(!dragMode) return;
    const p = ptFromEvent(e);
    const dx = p.x-startPt.x, dy = p.y-startPt.y;
    if(dragMode==='move'){
      rect.x = startRect.x+dx; rect.y = startRect.y+dy;
    }else{
      if(dragMode.includes('l')){ rect.x = startRect.x+dx; rect.w = startRect.w-dx; }
      if(dragMode.includes('r')){ rect.w = startRect.w+dx; }
      if(dragMode.includes('t')){ rect.y = startRect.y+dy; rect.h = startRect.h-dy; }
      if(dragMode.includes('b')){ rect.h = startRect.h+dy; }
    }
    clamp(); applyRect();
  });
  window.addEventListener('pointerup', ()=>{ dragMode=null; });

  const hintPill = screen.querySelector('#hintPill');

  screen.querySelector('#autoBtn').onclick = ()=>{
    if(mode==='face'){
      const f = detectFaceRegion(img);
      if(!f.ok){
        hintPill.textContent = 'No face detected — try better lighting, or frame it manually';
        hintPill.style.background = 'rgba(214,69,69,.35)';
        return;
      }
      const sx = dispImg.offsetWidth/img.naturalWidth, sy = dispImg.offsetHeight/img.naturalHeight;
      rect = { x:f.x*sx, y:f.y*sy, w:f.w*sx, h:f.h*sy };
      clamp(); applyRect();
      if(f.warn==='angle'){
        hintPill.textContent = 'Face may not be centered or frontal — check eyes are level, then confirm or adjust';
        hintPill.style.background = 'rgba(214,69,69,.35)';
      }else{
        hintPill.textContent = 'Face detected — adjust if needed, then confirm';
        hintPill.style.background = 'rgba(255,90,31,.4)';
      }
    }else{
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img,0,0);
      const kept = removeBackground(c, { globalTolerance:88 });
      const bbox = opaqueBoundingBox(c);
      if(!bbox || kept < 0.015 || kept > 0.85){
        hintPill.textContent = 'No glasses detected — try a plainer background, or frame it manually';
        hintPill.style.background = 'rgba(214,69,69,.35)';
        return;
      }
      const sx = dispImg.offsetWidth/img.naturalWidth, sy = dispImg.offsetHeight/img.naturalHeight;
      const pad = Math.max(bbox.w,bbox.h)*0.08;
      rect = {
        x: Math.max(0,(bbox.x-pad))*sx, y: Math.max(0,(bbox.y-pad))*sy,
        w: (bbox.w+pad*2)*sx, h:(bbox.h+pad*2)*sy
      };
      clamp(); applyRect();
      hintPill.textContent = 'Glasses detected — adjust if needed, then confirm';
      hintPill.style.background = 'rgba(255,90,31,.4)';
    }
  };

  screen.querySelector('#confirmBtn').onclick = ()=>{
    const sx = img.naturalWidth/dispImg.offsetWidth, sy = img.naturalHeight/dispImg.offsetHeight;
    const sCanvas = document.createElement('canvas');
    sCanvas.width = Math.round(rect.w*sx); sCanvas.height = Math.round(rect.h*sy);
    sCanvas.getContext('2d').drawImage(img, rect.x*sx, rect.y*sy, rect.w*sx, rect.h*sy, 0,0, sCanvas.width, sCanvas.height);
    const croppedDataUrl = sCanvas.toDataURL('image/png');
    screen.remove();
    if(mode==='face') openFacePreview(croppedDataUrl);
    else openGlassesProcess(sCanvas);
  };
}

/* ============================== FACE PREVIEW & SAVE ============================== */
function openFacePreview(dataUrl){
  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top"><button id="edClose">${X_ICON}</button><span class="title">Preview</span><span style="width:34px"></span></div>
    <div class="editor-stage"><img src="${dataUrl}" style="max-width:88%; max-height:78vh; border-radius:14px;"/></div>
    <div class="editor-bottom">
      <button class="btn btn-primary btn-block" id="saveBtn">Save to My selfies</button>
      <button class="btn btn-ghost btn-block" id="retakeBtn" style="color:rgba(255,255,255,.7)">Crop again</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();
  screen.querySelector('#retakeBtn').onclick = ()=>{ screen.remove(); openCropEditor(dataUrl,'face'); };
  screen.querySelector('#saveBtn').onclick = async ()=>{
    const saveBtn = screen.querySelector('#saveBtn');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try{
      const { fullBlob, thumbBlob } = await variantsFromSource(dataUrl, { fullMax:1100, thumbMax:360, type:'image/jpeg', quality:.92 });
      const fd = new FormData();
      fd.append('image', fullBlob, 'selfie.jpg');
      fd.append('thumb', thumbBlob, 'selfie-thumb.jpg');
      const data = await api('api/selfies.php', { method:'POST', form: fd });
      state.selfies.push(data.selfie);
      screen.remove();
      toast('Selfie saved');
      setRoute('selfies');
    }catch(err){
      toast(err.message || 'Could not save selfie');
      saveBtn.disabled = false; saveBtn.textContent = 'Save to My selfies';
    }
  };
}

/* ============================== GLASSES PROCESS (bg removal + lens type) ============================== */
async function openGlassesProcess(rawCanvas){
  const pristine = document.createElement('canvas');
  pristine.width = rawCanvas.width; pristine.height = rawCanvas.height;
  pristine.getContext('2d').drawImage(rawCanvas,0,0);

  let tolerance = 88;
  function runRemoval(){
    const c = document.createElement('canvas'); c.width = pristine.width; c.height = pristine.height;
    c.getContext('2d').drawImage(pristine,0,0);
    const kept = removeBackground(c, { globalTolerance: tolerance });
    return { canvas: c, kept };
  }
  let removalResult = runRemoval();
  let workCanvas = removalResult.canvas;
  let kept = removalResult.kept;

  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top"><button id="edClose">${X_ICON}</button><span class="title">Lens type</span><span style="width:34px"></span></div>
    <div class="editor-stage checker" id="lensStage"></div>
    <div class="editor-bottom">
      <div class="banner" id="keptWarning" style="display:none;">${WARN_ICON}<div id="keptWarningText"></div></div>
      <div class="sensitivity-row">
        <button class="btn btn-secondary btn-sm" id="lessBtn">Keep more of photo</button>
        <button class="btn btn-secondary btn-sm" id="moreBtn">Remove more background</button>
      </div>
      <div class="toggle-row">
        <button id="tintBtn" class="active">Sunglasses (tinted)</button>
        <button id="clearBtn">Clear lenses</button>
      </div>
      <div class="hint-pill" id="lensHint" style="display:none;">Tap each lens once to make it see-through</div>
      <button class="btn btn-primary btn-block" id="continueBtn">Continue</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();

  const stage = screen.querySelector('#lensStage');
  const dispCanvas = document.createElement('canvas');
  dispCanvas.style.maxWidth = '80%'; dispCanvas.style.maxHeight='70vh'; dispCanvas.style.borderRadius='10px';
  stage.appendChild(dispCanvas);

  function redrawDisp(){
    dispCanvas.width = workCanvas.width; dispCanvas.height = workCanvas.height;
    const dctx = dispCanvas.getContext('2d');
    dctx.clearRect(0,0,dispCanvas.width,dispCanvas.height);
    dctx.drawImage(workCanvas,0,0);
  }
  redrawDisp();

  function updateWarning(){
    const warnBox = screen.querySelector('#keptWarning');
    const warnText = screen.querySelector('#keptWarningText');
    if(kept < 0.015){
      warnBox.style.display='flex';
      warnText.textContent = 'The glasses nearly disappeared — try "Keep more of photo" below, or crop again with a plainer background.';
    } else if(kept > 0.85){
      warnBox.style.display='flex';
      warnText.textContent = 'Barely any background was removed — try "Remove more background", or retake the photo against a plainer surface.';
    } else {
      warnBox.style.display='none';
    }
  }
  updateWarning();

  screen.querySelector('#lessBtn').onclick = ()=>{
    tolerance = Math.max(20, tolerance-18);
    const r = runRemoval(); workCanvas = r.canvas; kept = r.kept;
    redrawDisp(); updateWarning();
  };
  screen.querySelector('#moreBtn').onclick = ()=>{
    tolerance = Math.min(170, tolerance+18);
    const r = runRemoval(); workCanvas = r.canvas; kept = r.kept;
    redrawDisp(); updateWarning();
  };

  let lensType = 'tint';
  const tintBtn = screen.querySelector('#tintBtn'), clearBtn = screen.querySelector('#clearBtn');
  const lensHint = screen.querySelector('#lensHint');
  tintBtn.onclick = ()=>{ lensType='tint'; tintBtn.classList.add('active'); clearBtn.classList.remove('active'); lensHint.style.display='none'; };
  clearBtn.onclick = ()=>{ lensType='clear'; clearBtn.classList.add('active'); tintBtn.classList.remove('active'); lensHint.style.display='block'; };

  dispCanvas.addEventListener('pointerdown', (e)=>{
    if(lensType!=='clear') return;
    const r = dispCanvas.getBoundingClientRect();
    const x = Math.round((e.clientX-r.left)/r.width*dispCanvas.width);
    const y = Math.round((e.clientY-r.top)/r.height*dispCanvas.height);
    floodFillTransparent(workCanvas, x, y, 58);
    redrawDisp();
  });

  screen.querySelector('#continueBtn').onclick = ()=>{
    screen.remove();
    openGlassesPreview2(workCanvas, lensType);
  };
}

function openGlassesPreview2(canvas, lensType){
  const dataUrl = canvas.toDataURL('image/png');
  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top"><button id="edClose">${X_ICON}</button><span class="title">Preview</span><span style="width:34px"></span></div>
    <div class="editor-stage checker"><img src="${dataUrl}" style="max-width:80%; max-height:72vh;"/></div>
    <div class="editor-bottom">
      <button class="btn btn-primary btn-block" id="saveBtn">Save to My glasses</button>
      <button class="btn btn-ghost btn-block" id="backBtn" style="color:rgba(255,255,255,.7)">Back</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();
  screen.querySelector('#backBtn').onclick = ()=>screen.remove();
  screen.querySelector('#saveBtn').onclick = async ()=>{
    const saveBtn = screen.querySelector('#saveBtn');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try{
      const { fullBlob, thumbBlob } = await variantsFromSource(canvas, { fullMax:900, thumbMax:320, type:'image/png' });
      const fd = new FormData();
      fd.append('image', fullBlob, 'glasses.png');
      fd.append('thumb', thumbBlob, 'glasses-thumb.png');
      fd.append('lensType', lensType);
      const data = await api('api/glasses.php', { method:'POST', form: fd });
      state.glasses.push(data.glasses);
      screen.remove();
      toast('Glasses saved');
      setRoute('glasses');
      setTimeout(()=>{
        openSheet(`
          <button class="sheet-close" id="closeX">${X_ICON}</button>
          <div class="sheet-title">Saved! 🎉</div>
          <div class="sheet-desc">Want to see how they look on you?</div>
          <button class="btn btn-primary btn-block" id="tryNowBtn">Try it on</button>
        `, {center:true});
        document.getElementById('closeX').onclick = closeSheet;
        document.getElementById('tryNowBtn').onclick = ()=>{ closeSheet(); startTryOn(data.glasses); };
      }, 350);
    }catch(err){
      toast(err.message || 'Could not save glasses');
      saveBtn.disabled = false; saveBtn.textContent = 'Save to My glasses';
    }
  };
}

/* ============================== TRY-ON FLOW ============================== */
async function startTryOn(glassesItem){
  if(state.selfies.length===0){
    openSheet(`
      <button class="sheet-close" id="closeX">${X_ICON}</button>
      <div class="sheet-title">Add a selfie first</div>
      <div class="banner">${WARN_ICON}<div>You need at least one saved selfie to try glasses on.</div></div>
      <button class="btn btn-primary btn-block" id="goAdd">Add a selfie</button>
    `, {center:true});
    document.getElementById('closeX').onclick = closeSheet;
    document.getElementById('goAdd').onclick = ()=>{ closeSheet(); setRoute('selfies'); setTimeout(openSelfieActionSheet,250); };
    return;
  }
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">Choose a face</div>
    <div class="sheet-desc">Pick the selfie you'd like to try these glasses on.</div>
    <div class="grid" style="margin-top:6px;">
      ${state.selfies.slice().reverse().map(s=>`<div class="tile" data-id="${s.id}"><img src="${s.thumbUrl}"/></div>`).join('')}
    </div>
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.querySelectorAll('#activeOverlay .tile').forEach(t=>{
    t.onclick = ()=>{
      closeSheet();
      const selfie = state.selfies.find(s=>s.id === Number(t.dataset.id));
      if(!selfie){ toast('Could not find that selfie'); return; }
      openCompositor(selfie, glassesItem);
    };
  });
}

async function openCompositor(selfieItem, glassesItem){
  let faceImg, glassesImg;
  try{
    [faceImg, glassesImg] = await Promise.all([loadImg(selfieItem.fullUrl), loadImg(glassesItem.fullUrl)]);
  }catch(e){
    toast('Could not load those photos'); return;
  }

  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top"><button id="edClose">${X_ICON}</button><span class="title">Position the glasses</span><span style="width:34px"></span></div>
    <div class="editor-stage" id="compStage"></div>
    <div class="editor-bottom">
      <div class="hint-pill">Drag to move • pinch / scroll to resize • use rotate buttons to tilt</div>
      <div class="compositor-controls">
        <button class="iconbtn" id="rotL" title="Rotate left">⟲</button>
        <button class="iconbtn" id="zoomOut" title="Smaller">−</button>
        <button class="iconbtn" id="zoomIn" title="Bigger">+</button>
        <button class="iconbtn" id="rotR" title="Rotate right">⟳</button>
      </div>
      <button class="btn btn-primary btn-block" id="applyBtn">Looks good — save result</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();

  const stage = screen.querySelector('#compStage');
  const wrap = document.createElement('div');
  wrap.className = 'compositor-stage';
  wrap.style.maxWidth = '92%';
  const canvas = document.createElement('canvas');
  canvas.width = faceImg.naturalWidth; canvas.height = faceImg.naturalHeight;
  wrap.appendChild(canvas);
  stage.appendChild(wrap);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const gAspect = glassesImg.naturalWidth/glassesImg.naturalHeight;
  let gW = faceImg.naturalWidth*0.62;
  let gH = gW/gAspect;
  let tx = faceImg.naturalWidth/2;
  let ty = faceImg.naturalHeight*0.44;
  let rot = 0;

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(faceImg,0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(tx,ty);
    ctx.rotate(rot*Math.PI/180);
    ctx.drawImage(glassesImg, -gW/2, -gH/2, gW, gH);
    ctx.restore();
  }
  draw();

  function canvasPt(e){
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x:(t.clientX-r.left)/r.width*canvas.width, y:(t.clientY-r.top)/r.height*canvas.height };
  }

  let dragging=false, lastPt=null;
  canvas.addEventListener('pointerdown', (e)=>{ dragging=true; lastPt=canvasPt(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const p = canvasPt(e);
    tx += (p.x-lastPt.x); ty += (p.y-lastPt.y);
    lastPt = p; draw();
  });
  canvas.addEventListener('pointerup', ()=>{ dragging=false; });
  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.04 : 0.96;
    gW*=factor; gH*=factor; draw();
  }, {passive:false});

  let pinchStartDist=null, pinchStartW=null;
  canvas.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){
      pinchStartDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      pinchStartW = gW;
    }
  });
  canvas.addEventListener('touchmove', (e)=>{
    if(e.touches.length===2 && pinchStartDist){
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      const factor = d/pinchStartDist;
      gW = pinchStartW*factor; gH = gW/gAspect; draw();
    }
  });

  screen.querySelector('#zoomIn').onclick = ()=>{ gW*=1.08; gH=gW/gAspect; draw(); };
  screen.querySelector('#zoomOut').onclick = ()=>{ gW*=0.92; gH=gW/gAspect; draw(); };
  screen.querySelector('#rotL').onclick = ()=>{ rot-=4; draw(); };
  screen.querySelector('#rotR').onclick = ()=>{ rot+=4; draw(); };

  screen.querySelector('#applyBtn').onclick = async ()=>{
    const applyBtn = screen.querySelector('#applyBtn');
    applyBtn.disabled = true; applyBtn.textContent = 'Saving…';
    const finalDataUrl = canvas.toDataURL('image/jpeg', .92);
    try{
      const { fullBlob, thumbBlob } = await variantsFromSource(canvas, { fullMax:1200, thumbMax:380, type:'image/jpeg', quality:.92 });
      const fd = new FormData();
      fd.append('image', fullBlob, 'result.jpg');
      fd.append('thumb', thumbBlob, 'result-thumb.jpg');
      fd.append('selfieId', selfieItem.id);
      fd.append('glassesId', glassesItem.id);
      const data = await api('api/results.php', { method:'POST', form: fd });
      state.results.push(data.result);
      screen.remove();
      showResultScreen(finalDataUrl);
      toast('Saved to My try-ons');
    }catch(err){
      toast(err.message || 'Could not save result');
      applyBtn.disabled = false; applyBtn.textContent = 'Looks good — save result';
    }
  };
}

function showResultScreen(url){
  const screen = document.createElement('div');
  screen.className = 'editor-screen';
  screen.innerHTML = `
    <div class="editor-top"><button id="edClose">${X_ICON}</button><span class="title">Your try-on</span><span style="width:34px"></span></div>
    <div class="editor-stage"><img src="${url}" style="max-width:88%; max-height:78vh; border-radius:14px;"/></div>
    <div class="editor-bottom">
      <a class="btn btn-primary btn-block" id="saveGalleryBtn" download="specs-tryon.jpg" href="${url}">Save to gallery</a>
      <button class="btn btn-secondary btn-block" id="doneBtn">Done</button>
    </div>`;
  document.body.appendChild(screen);
  screen.querySelector('#edClose').onclick = ()=>screen.remove();
  screen.querySelector('#doneBtn').onclick = ()=>screen.remove();
}

/* ============================== RESULTS LIBRARY ============================== */
function showResultsSheet(){
  openSheet(`
    <button class="sheet-close" id="closeX">${X_ICON}</button>
    <div class="sheet-title">My try-ons</div>
    ${state.results.length===0 ? `<div class="sheet-desc">Nothing here yet — try on a pair of glasses to see results.</div>` : `
    <div class="grid" style="margin-top:14px;">
      ${state.results.slice().reverse().map(r=>`<div class="tile" data-id="${r.id}"><img src="${r.thumbUrl}"/><button class="tile-del" data-id="${r.id}" data-kind="result">${X_ICON}</button></div>`).join('')}
    </div>`}
  `);
  document.getElementById('closeX').onclick = closeSheet;
  document.querySelectorAll('#activeOverlay .tile').forEach(t=>{
    t.onclick = ()=>{
      const r = state.results.find(x=>x.id===Number(t.dataset.id));
      closeSheet();
      if(r) showResultScreen(r.fullUrl);
    };
  });
  document.querySelectorAll('#activeOverlay .tile-del').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      await deleteItem('result', btn.dataset.id);
      closeSheet(); showResultsSheet();
    };
  });
}

/* ============================== INIT ============================== */
boot();
