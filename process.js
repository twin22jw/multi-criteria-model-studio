(() => {
  const root = document.getElementById('process');
  if (!root) return;
  const el = id => document.getElementById(id);
  const canvas = el('processMap');
  const ctx = canvas.getContext('2d');
  let grid, terrain, ignition, states = [], timer = null, cellWidth, cellHeight;
  const steps = 12;
  const windVectors = { N: [0,-1], NE: [1,-1], E: [1,0], SE: [1,1], S: [0,1], SW: [-1,1], W: [-1,0], NW: [-1,-1] };
  const windNames = ['Calm', 'Light', 'Moderate', 'Strong'];
  const dryNames = ['Moist', 'Somewhat moist', 'Dry', 'Very dry'];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const hash = (a, b, c) => {
    let x = (a * 73856093 ^ b * 19349663 ^ c * 83492791) >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const at = (r, c) => grid.elevation_m[clamp(r, 0, grid.rows-1) * grid.cols + clamp(c, 0, grid.cols-1)];

  function deriveTerrain() {
    const dx = 111320 * Math.cos(48.555 * Math.PI / 180) * (grid.bounds[2]-grid.bounds[0]) / (grid.cols-1);
    const dy = 111320 * (grid.bounds[3]-grid.bounds[1]) / (grid.rows-1);
    cellWidth=dx;cellHeight=dy;
    terrain = grid.elevation_m.map((height, i) => {
      const r = Math.floor(i/grid.cols), c = i % grid.cols;
      const east = (at(r,c+1)-at(r,c-1)) / ((c===0 || c===grid.cols-1) ? dx : 2*dx);
      const south = (at(r+1,c)-at(r-1,c)) / ((r===0 || r===grid.rows-1) ? dy : 2*dy);
      // Synthetic fuel classes follow broad terrain patterns. They are not mapped vegetation.
      const cover = clamp(.38 + .22*Math.sin(c*.74 + r*.31) + .18*Math.cos(r*.57-c*.26) + (height < 450 ? .13 : -.06), .06, .96);
      const canopy = clamp(.26 + .62*cover + .13*Math.sin(c*.39-r*.64), .05, .98);
      return { height, east, south, cover, canopy };
    });
  }

  function settings() {
    return {
      direction: el('fireWindDirection').value,
      wind: Number(el('fireWindSpeed').value),
      dryness: Number(el('fireDryness').value),
      slope: el('fireSlope').checked,
      vegetation: el('fireVegetation').checked,
      canopy: el('fireCanopy').checked,
    };
  }

  function simulate() {
    const s = settings();
    const [wx, wy] = windVectors[s.direction];
    const length = Math.hypot(wx,wy);
    const windX = wx/length, windY = wy/length;
    let state = new Uint8Array(grid.cols*grid.rows);
    state[ignition] = 1;
    states = [state];
    const offsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (let t=1; t<=steps; t++) {
      const next = new Uint8Array(state.length);
      for (let i=0; i<state.length; i++) if (state[i]) next[i] = 2;
      for (let i=0; i<state.length; i++) {
        if (state[i] !== 1) continue;
        const r = Math.floor(i/grid.cols), c = i%grid.cols;
        for (const [dr,dc] of offsets) {
          const rr=r+dr, cc=c+dc;
          if (rr<0 || cc<0 || rr>=grid.rows || cc>=grid.cols) continue;
          const j=rr*grid.cols+cc;
          if (state[j] || grid.lake[j]) continue;
          const metres=Math.hypot(dc*cellWidth,dr*cellHeight);
          const distance=metres/Math.min(cellWidth,cellHeight);
          const alignment=(dc*cellWidth*windX+dr*cellHeight*windY)/metres;
          const uphill=clamp((terrain[j].height-terrain[i].height)/metres/.2, -1, 1);
          let p=.24 + .10*s.dryness;
          p += .14*s.wind*alignment;
          if (s.slope) p += .17*uphill;
          if (s.vegetation) p += .12*(terrain[j].cover-.5);
          if (s.canopy) p += .08*(terrain[j].canopy-.5);
          if (distance>1.35) p *= .68;
          p=clamp(p,.005,.92);
          if (hash(i,j,t) < p) next[j]=1;
        }
      }
      state=next;
      states.push(state);
    }
  }

  function lakePath() {
    const [west,south,east,north]=grid.bounds;
    ctx.beginPath();
    for (const ring of grid.shoreline) {
      ring.forEach(([lon,lat],i) => {
        const x=(lon-west)/(east-west)*canvas.width;
        const y=(north-lat)/(north-south)*canvas.height;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
    }
  }

  function render() {
    if (!grid) return;
    const step=Number(el('fireStep').value), state=states[step];
    const w=canvas.width/grid.cols, h=canvas.height/grid.rows;
    const heights=grid.elevation_m;
    const min=Math.min(...heights), max=Math.max(...heights);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i=0; i<state.length; i++) {
      const r=Math.floor(i/grid.cols), c=i%grid.cols;
      const x=c*w,y=r*h;
      const z=(terrain[i].height-min)/(max-min || 1);
      const green=Math.round(145 - z*40 + terrain[i].cover*26);
      ctx.fillStyle=grid.lake[i] ? '#87bacc' : `rgb(${Math.round(121-z*26)},${green},${Math.round(91-z*16)})`;
      ctx.fillRect(x,y,w+1,h+1);
      if (state[i]===2) {ctx.fillStyle='rgba(80,82,85,.88)';ctx.fillRect(x,y,w+1,h+1);}
      if (state[i]===1) {ctx.fillStyle='#e96a26';ctx.fillRect(x,y,w+1,h+1);ctx.fillStyle='rgba(255,217,95,.78)';ctx.fillRect(x+4,y+4,w-8,h-8);}
      ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w,h);
    }
    lakePath();ctx.fillStyle='rgba(79,159,190,.38)';ctx.fill('evenodd');ctx.strokeStyle='#2a7c9b';ctx.lineWidth=1.3;ctx.stroke();
    const ix=(ignition%grid.cols+.5)*w,iy=(Math.floor(ignition/grid.cols)+.5)*h;
    ctx.beginPath();ctx.arc(ix,iy,6,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#a62f10';ctx.stroke();
    const burned=[...state].filter(v=>v===2).length, active=[...state].filter(v=>v===1).length;
    el('processTime').textContent=step===0?'Step 0 · ignition':`Step ${step} · ${active} burning cells`;
    el('fireStepValue').textContent=`${step} / ${steps}`;
    el('processReadout').innerHTML=`<b>${burned+active}</b> land cells reached · <b>${active}</b> currently burning<br><small>Each step is an illustrative interval, not a calibrated number of hours.</small>`;
    canvas.setAttribute('aria-label',`Sooke Lake hypothetical wildfire at step ${step}: ${burned+active} land cells reached, ${active} burning. Wind blows ${settings().direction}.`);
  }

  function update() {
    el('fireWindSpeedValue').textContent=windNames[Number(el('fireWindSpeed').value)];
    el('fireDrynessValue').textContent=dryNames[Number(el('fireDryness').value)];
    simulate();render();
  }
  function stop() {if (timer) clearInterval(timer);timer=null;el('firePlay').textContent='▶ Play';}
  el('firePlay').addEventListener('click', () => {
    if (timer) {stop();return;}
    if (Number(el('fireStep').value)===steps) el('fireStep').value=0;
    el('firePlay').textContent='❚❚ Pause';
    timer=setInterval(() => {const n=Number(el('fireStep').value)+1;if(n>steps){stop();return;}el('fireStep').value=n;render();if(n===steps)stop();},550);
  });
  el('fireReset').addEventListener('click',()=>{stop();el('fireStep').value=0;render();});
  el('fireStep').addEventListener('input',()=>{stop();render();});
  for (const id of ['fireWindDirection','fireWindSpeed','fireDryness','fireSlope','fireVegetation','fireCanopy']) el(id).addEventListener('input',update);
  canvas.addEventListener('click', event => {
    if (!grid) return;
    const rect=canvas.getBoundingClientRect();
    const c=clamp(Math.floor((event.clientX-rect.left)/rect.width*grid.cols),0,grid.cols-1);
    const r=clamp(Math.floor((event.clientY-rect.top)/rect.height*grid.rows),0,grid.rows-1);
    const i=r*grid.cols+c;
    if (grid.lake[i]) return;
    ignition=i;stop();el('fireStep').value=0;update();
  });
  el('processShowInputs').addEventListener('click',()=>{const panel=el('processInputs');panel.hidden=!panel.hidden;el('processShowInputs').textContent=panel.hidden?'Reveal model inputs':'Hide model inputs';});

  const answerIds=['fireAnswerProcess','fireAnswerFactors','fireAnswerData'];
  const savedKey='geog328-sooke-fire-notes-v1';
  try {const saved=JSON.parse(localStorage.getItem(savedKey)||'{}');for(const id of answerIds)el(id).value=saved[id]||'';}catch{}
  for(const id of answerIds) el(id).addEventListener('input',()=>{try{localStorage.setItem(savedKey,JSON.stringify(Object.fromEntries(answerIds.map(key=>[key,el(key).value]))));el('fireSaved').textContent='Saved on this device.';}catch{el('fireSaved').textContent='Browser storage unavailable. Copy your responses.';}});
  el('fireCopy').addEventListener('click',async()=>{const text=['Sooke Lake wildfire process activity','1. Process: '+el(answerIds[0]).value,'2. Factors: '+el(answerIds[1]).value,'3. Data needed: '+el(answerIds[2]).value].join('\n\n');try{await navigator.clipboard.writeText(text);el('fireSaved').textContent='Responses copied.';}catch{el('fireSaved').textContent='Copy is unavailable in this browser.';}});

  fetch('data/sooke-fire-grid.json').then(response=>{if(!response.ok)throw Error('Data unavailable');return response.json();}).then(data=>{
    grid=data;deriveTerrain();
    // West of the reservoir: a hypothetical lightning strike on dry land.
    ignition=9*grid.cols+7;
    if(grid.lake[ignition]) ignition=grid.lake.findIndex((water,i)=>!water && i>grid.cols*7);
    update();
  }).catch(()=>{el('processReadout').textContent='The geographic data could not be loaded. Please reload the page.';});
})();

