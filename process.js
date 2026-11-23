(() => {
  const root = document.getElementById('process');
  if (!root) return;
  const el = id => document.getElementById(id);
  const canvas = el('processMap');
  let grid, terrain, ignition, states = [], events = [], timer = null, cellWidth, cellHeight;
  let mapMode = 'inspect', selectedCell = null;
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
      slope: true,
      vegetation: true,
      canopy: true,
    };
  }

  function runSimulation(s, origin) {
    const [wx, wy] = windVectors[s.direction];
    const length = Math.hypot(wx,wy);
    const windX = wx/length, windY = wy/length;
    let state = new Uint8Array(grid.cols*grid.rows);
    state[origin] = 1;
    const history = [state], trace = [new Map()];
    const offsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (let t=1; t<=steps; t++) {
      const next = new Uint8Array(state.length), transitions = new Map();
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
          const base=.24 + .10*s.dryness;
          const windEffect=.14*s.wind*alignment;
          const slopeEffect=s.slope ? .17*uphill : 0;
          const vegetationEffect=s.vegetation ? .12*(terrain[j].cover-.5) : 0;
          const canopyEffect=s.canopy ? .08*(terrain[j].canopy-.5) : 0;
          let p=base+windEffect+slopeEffect+vegetationEffect+canopyEffect;
          const diagonal=distance>1.35;
          if (diagonal) p *= .68;
          p=clamp(p,.005,.92);
          const draw=hash(i,j,t);
          if (draw < p) {
            next[j]=1;
            if (!transitions.has(j)) transitions.set(j, { from:i, step:t, probability:p, draw, alignment, uphill, elevationDifference:terrain[j].height-terrain[i].height, base, windEffect, slopeEffect, vegetationEffect, canopyEffect, diagonal, settings:{...s} });
          }
        }
      }
      state=next;
      history.push(state);
      trace.push(transitions);
    }
    return { states:history, events:trace, settings:{...s}, origin };
  }

  function lakePath(target) {
    const [west,south,east,north]=grid.bounds;
    const pen=target.getContext('2d');
    pen.beginPath();
    for (const ring of grid.shoreline) {
      ring.forEach(([lon,lat],i) => {
        const x=(lon-west)/(east-west)*target.width;
        const y=(north-lat)/(north-south)*target.height;
        if (i===0) pen.moveTo(x,y); else pen.lineTo(x,y);
      });
      pen.closePath();
    }
  }

  function drawMap(target, state, layer, origin, scenario, highlight=null) {
    const pen=target.getContext('2d');
    const w=target.width/grid.cols, h=target.height/grid.rows;
    const heights=grid.elevation_m;
    const min=Math.min(...heights), max=Math.max(...heights);
    pen.clearRect(0,0,target.width,target.height);
    for (let i=0; i<state.length; i++) {
      const r=Math.floor(i/grid.cols), c=i%grid.cols;
      const x=c*w,y=r*h;
      const z=(terrain[i].height-min)/(max-min || 1);
      const green=Math.round(145 - z*40 + terrain[i].cover*26);
      if (layer==='elevation') pen.fillStyle=`hsl(${95-z*60} 33% ${83-z*38}%)`;
      else if (layer==='slope') {const v=clamp(Math.hypot(terrain[i].east,terrain[i].south)/.45,0,1);pen.fillStyle=`hsl(${103-v*94} 58% ${86-v*32}%)`;}
      else if (layer==='vegetation') pen.fillStyle=`hsl(113 39% ${89-terrain[i].cover*55}%)`;
      else if (layer==='canopy') pen.fillStyle=`hsl(153 34% ${89-terrain[i].canopy*52}%)`;
      else if (layer==='wind') pen.fillStyle='#dfeae3';
      else pen.fillStyle=`rgb(${Math.round(121-z*26)},${green},${Math.round(91-z*16)})`;
      if (grid.lake[i]) pen.fillStyle='#87bacc';
      pen.fillRect(x,y,w+1,h+1);
      if (state[i]===2) {
        pen.fillStyle=layer==='fire'?'rgba(80,82,85,.88)':'rgba(54,53,56,.58)';
        pen.fillRect(x,y,w+1,h+1);
      }
      if (state[i]===1) {
        pen.fillStyle=layer==='fire'?'#e96a26':'rgba(233,82,30,.88)';
        pen.fillRect(x,y,w+1,h+1);
        pen.fillStyle='rgba(255,217,95,.85)';
        pen.fillRect(x+w*.18,y+h*.18,w*.64,h*.64);
      }
      pen.strokeStyle='rgba(255,255,255,.19)';pen.lineWidth=1;pen.strokeRect(x+.5,y+.5,w,h);
    }
    lakePath(target);pen.fillStyle='rgba(79,159,190,.39)';pen.fill('evenodd');pen.strokeStyle='#2a7c9b';pen.lineWidth=target===canvas?1.3:.8;pen.stroke();
    if (layer==='wind') {
      const [vx,vy]=windVectors[scenario.direction], size=Math.min(w,h)*1.25, norm=Math.hypot(vx,vy);
      if (scenario.wind>0) for(let r=1;r<grid.rows;r+=3) for(let c=1;c<grid.cols;c+=3) {
        const i=r*grid.cols+c;if(grid.lake[i])continue;
        const x=(c+.5)*w,y=(r+.5)*h,ex=x+vx/norm*size,ey=y+vy/norm*size;
        pen.strokeStyle='#b74d27';pen.fillStyle='#b74d27';pen.lineWidth=1.5+scenario.wind*.5;
        pen.beginPath();pen.moveTo(x-vx/norm*size*.55,y-vy/norm*size*.55);pen.lineTo(ex,ey);pen.stroke();
        const angle=Math.atan2(vy,vx);pen.beginPath();pen.moveTo(ex,ey);pen.lineTo(ex-7*Math.cos(angle-.55),ey-7*Math.sin(angle-.55));pen.lineTo(ex-7*Math.cos(angle+.55),ey-7*Math.sin(angle+.55));pen.closePath();pen.fill();
      }
    }
    const ix=(origin%grid.cols+.5)*w,iy=(Math.floor(origin/grid.cols)+.5)*h;
    pen.beginPath();pen.arc(ix,iy,target===canvas?6:4,0,Math.PI*2);pen.fillStyle='#fff';pen.fill();pen.lineWidth=2;pen.strokeStyle='#a62f10';pen.stroke();
    if (highlight!==null) {const x=(highlight%grid.cols)*w,y=Math.floor(highlight/grid.cols)*h;pen.strokeStyle='#f5f6e9';pen.lineWidth=4;pen.strokeRect(x+2,y+2,w-4,h-4);pen.strokeStyle='#143a3b';pen.lineWidth=2;pen.strokeRect(x+3,y+3,w-6,h-6);}
  }

  function renderLegend(layer) {
    const legends={
      fire:'<span><i class="pm-water"></i>Reservoir</span><span><i class="pm-forest"></i>Unburned</span><span><i class="pm-active"></i>Burning</span><span><i class="pm-burned"></i>Burned</span><span><i class="pm-ignition"></i>Ignition</span>',
      elevation:'Lower elevation → higher elevation · metres · CDEM samples',
      slope:'Gentle → steep · estimated slope from coarse DEM grid',
      vegetation:'Sparse → dense cover · illustrative proxy, not measured vegetation',
      canopy:'Low → high canopy · illustrative proxy, not measured height in metres',
      wind:'Arrows show the scenario direction wind blows toward; the field is uniform.'
    };
    const spread='<span><i class="pm-active"></i>Burning</span><span><i class="pm-burned"></i>Burned</span>';
    el('processLayerLegend').innerHTML=layer==='fire'?legends.fire:`<span>${legends[layer]}</span>${spread}`;
  }

  function render() {
    if (!grid) return;
    const step=Number(el('fireStep').value), state=states[step], layer=el('processMapLayer').value;
    drawMap(canvas,state,layer,ignition,settings(),selectedCell);
    renderLegend(layer);
    const burned=[...state].filter(v=>v===2).length, active=[...state].filter(v=>v===1).length;
    el('processTime').textContent=step===0?'Step 0 · ignition':`Step ${step} · ${active} burning cells`;
    el('fireStepValue').textContent=`${step} / ${steps}`;
    el('processReadout').innerHTML=`<b>${burned+active}</b> land cells reached · <b>${active}</b> currently burning<br><small>Each step is an illustrative interval, not a calibrated number of hours.</small>`;
    canvas.setAttribute('aria-label',`Sooke Lake ${layer} map at step ${step}: ${burned+active} land cells reached, ${active} burning. Wind blows ${settings().direction}.`);
    renderCellDetail();
  }

  function directionFromSource(source, target) {
    const dc=source%grid.cols-target%grid.cols;
    const dr=Math.floor(source/grid.cols)-Math.floor(target/grid.cols);
    const vertical=dr<0?'northern':dr>0?'southern':'';
    const horizontal=dc<0?'western':dc>0?'eastern':'';
    return [vertical,horizontal].filter(Boolean).join(' ')+' neighboring cell';
  }

  function renderCellDetail() {
    if (selectedCell===null || !grid) return;
    const i=selectedCell, step=Number(el('fireStep').value), row=Math.floor(i/grid.cols), col=i%grid.cols;
    const height=terrain[i].height, grade=Math.round(Math.hypot(terrain[i].east,terrain[i].south)*100);
    let relative='';
    const originRow=Math.floor(ignition/grid.cols), originCol=ignition%grid.cols;
    if (Math.max(Math.abs(row-originRow),Math.abs(col-originCol))===1) {
      const difference=Math.round(height-terrain[ignition].height);
      relative=`<p><b>From the ignition cell:</b> ${difference>0?'+':''}${difference} m · ${difference>0?'uphill':difference<0?'downhill':'level'}.</p>`;
    }
    const common=`<div class="process-cell-facts"><span>Elevation <b>${Math.round(height)} m</b></span><span>Slope <b>~${grade}%</b></span><span>Vegetation proxy <b>${Math.round(terrain[i].cover*100)}%</b></span><span>Canopy proxy <b>${Math.round(terrain[i].canopy*100)}%</b></span></div>`;
    let story='';
    if (grid.lake[i]) story='<p><b>Reservoir:</b> this cell cannot ignite in the model because water is a spread barrier.</p>';
    else if (i===ignition) story=`<p><b>Hypothetical lightning ignition:</b> this is the starting cell at step 0. At step ${step} it is ${step===0?'burning':'burned'}.</p>`;
    else {
      let first=null;
      for(let t=1;t<=step;t++) if(events[t].has(i)){first=events[t].get(i);break;}
      if (first) {
        const wind=first.windEffect>.02?'favored':first.windEffect<-.02?'opposed':'had little effect on';
        const direction=first.elevationDifference>2?'uphill':first.elevationDifference< -2?'downhill':'nearly level';
        const fuel=terrain[i].cover>=.65?'high':terrain[i].cover>=.35?'moderate':'low';
        story=`<p><b>First ignited at step ${first.step}:</b> unburned at step ${first.step-1} → burning at step ${first.step}. Heat came from the ${directionFromSource(first.from,i)}.</p><div class="process-cell-facts"><span>Wind alignment <b>${wind} spread</b></span><span>Move from neighbor <b>${first.elevationDifference>0?'+':''}${Math.round(first.elevationDifference)} m · ${direction}</b></span><span>Fuel availability <b>${fuel}</b></span><span>Dryness <b>${dryNames[first.settings.dryness]}</b></span></div><p>For this step the teaching rule gave a <b>${Math.round(first.probability*100)}%</b> ignition chance; the seeded draw was <b>${Math.round(first.draw*100)}%</b>, so the cell ignited. ${first.settings.slope?'Slope contributed to this calculation.':'Slope was switched off.'} ${first.settings.vegetation?'Vegetation contributed.':'Vegetation was switched off.'} These are model scores, not measured probabilities.</p>`;
      } else story=`<p><b>Unburned at step ${step}.</b> No successful neighbor-to-cell ignition has occurred by this step. Inspect a burning edge cell or advance time to follow the transition.</p>`;
    }
    el('processCellDetail').innerHTML=`<b>Cell ${row+1}, ${col+1} · ${grid.lake[i]?'water':states[step][i]===1?'burning':states[step][i]===2?'burned':'unburned'}</b>${common}${relative}${story}`;
  }

  function update() {
    el('fireWindSpeedValue').textContent=windNames[Number(el('fireWindSpeed').value)];
    el('fireDrynessValue').textContent=dryNames[Number(el('fireDryness').value)];
    const result=runSimulation(settings(),ignition);
    states=result.states;events=result.events;render();
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
  el('processMapLayer').addEventListener('change',render);
  for (const button of root.querySelectorAll('[data-map-mode]')) button.addEventListener('click',()=>{
    mapMode=button.dataset.mapMode;
    for(const item of root.querySelectorAll('[data-map-mode]')) {const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));}
    el('processMapHelp').textContent=mapMode==='inspect'?'Click a cell to inspect its input values and ignition history. Switch to Move ignition to relocate the start. This study window is not an official watershed boundary.':'Click a land cell to relocate the hypothetical ignition. ';
  });
  for (const id of ['fireWindDirection','fireWindSpeed','fireDryness']) el(id).addEventListener('input',update);
  canvas.addEventListener('click', event => {
    if (!grid) return;
    const rect=canvas.getBoundingClientRect();
    const c=clamp(Math.floor((event.clientX-rect.left)/rect.width*grid.cols),0,grid.cols-1);
    const r=clamp(Math.floor((event.clientY-rect.top)/rect.height*grid.rows),0,grid.rows-1);
    const i=r*grid.cols+c;
    if (mapMode==='inspect') {selectedCell=i;render();return;}
    if (grid.lake[i]) return;
    ignition=i;selectedCell=null;el('processCellDetail').textContent='Choose a cell on the map to investigate why it did or did not burn.';stop();el('fireStep').value=0;update();
  });
  el('processShowInputs').addEventListener('click',()=>{const panel=el('processInputs');panel.hidden=!panel.hidden;el('processShowInputs').textContent=panel.hidden?'Reveal model inputs':'Hide model inputs';});

  fetch('data/sooke-fire-grid.json').then(response=>{if(!response.ok)throw Error('Data unavailable');return response.json();}).then(data=>{
    grid=data;deriveTerrain();
    // West of the reservoir: a hypothetical lightning strike on dry land.
    ignition=9*grid.cols+7;
    if(grid.lake[ignition]) ignition=grid.lake.findIndex((water,i)=>!water && i>grid.cols*7);
    update();
  }).catch(()=>{el('processReadout').textContent='The geographic data could not be loaded. Please reload the page.';});
})();

