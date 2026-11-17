(() => {
  'use strict';
  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const bound = (x, a, b) => Math.max(a, Math.min(b, x));
  const signed = (x,places=Number.isInteger(x)?0:1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(places);
  const cash = x => '$' + (x / 1000).toFixed(3) + ' million CAD';
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svgNS = 'http://www.w3.org/2000/svg';
  let geo, houses, heat;
  const hState = {view:'predicted', selected:0};
  const uState = {view:'prediction', model:'ols', selected:1};
  const features = ['canopy','impervious','density'];
  const featureNames = {canopy:'Tree canopy cover',impervious:'Impervious surface',density:'Building density'};
  const units = {canopy:'°C per 10 percentage points',impervious:'°C per 10 percentage points',density:'°C per building / ha'};

  function project(point, bounds, city) {
    const [west,south,east,north] = bounds;
    const aspect = city === 'victoria' ? 1.18 : 1.25;
    const width = (east-west)*aspect, height = north-south;
    const scale = Math.min(590/width, 350/height);
    return [325+(point[0]-(west+east)/2)*aspect*scale, 200- (point[1]-(south+north)/2)*scale];
  }
  function pathFor(area, city) {
    const bounds=geo[city].bounds;
    return area.rings.map(ring=>ring.map((p,i)=>{
      const [x,y]=project(p,bounds,city);
      return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join('')+'Z').join('');
  }
  function svgEl(tag,attrs={}) {
    const el=document.createElementNS(svgNS,tag);
    for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  }
  function blueOrange(value,min,max) {
    const t=bound((value-min)/(max-min),0,1);
    const stops=[[41,111,137],[180,214,177],[240,193,111],[184,80,53]];
    const s=bound(Math.floor(t*3),0,2),f=t*3-s;
    const rgb=stops[s].map((v,i)=>Math.round(v+(stops[s+1][i]-v)*f));
    return `rgb(${rgb.join(',')})`;
  }
  function legend(el,left,right,note) {
    el.innerHTML=`<span>${escape(left)}</span><span class="reg-gradient"></span><span>${escape(right)}</span><small>${escape(note)}</small>`;
  }
  function seed(n) {let x=Math.sin(n*127.1+37.7)*43758.5453; return x-Math.floor(x);}
  function haversine(a,b) {
    const dLat=(a[1]-b[1])*111.2, dLon=(a[0]-b[0])*74.2;
    return Math.hypot(dLat,dLon);
  }
  function inRing(point,ring) {
    let inside=false;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }

  function makeHouses() {
    const downtown=[-123.3656,48.4284];
    return geo.victoria.areas.flatMap((area,j)=>[0,1].map((_,k)=>{
      const n=j*2+k, candidate=[area.center[0]+(seed(n+9)-.5)*.003,area.center[1]+(seed(n+49)-.5)*.0025];
      const point=area.rings.some(r=>inRing(candidate,r))?candidate:area.center;
      const distance=Math.max(.2,haversine(point,downtown));
      const floor=Math.round(140+seed(n+20)*120+distance*3.2), age=Math.round(5+seed(n+61)*75);
      const neighbourhoodPremium= area.name==='Oak Bay'?85:area.name==='Sooke'?-50:area.name==='Victoria'?55:0;
      const observed= Math.round(325+4.6*floor-31*distance-3.1*age+neighbourhoodPremium+(seed(n+75)-.5)*95);
      return {point,area:area.name,floor,age,distance,observed};
    }));
  }
  function housingBetas() {return {floor:+q('#hArea').value,distance:+q('#hDistance').value,age:+q('#hAge').value};}
  function predictHouse(h,b) {return 300+b.floor*h.floor+b.distance*h.distance+b.age*h.age;}
  function renderHousing() {
    const b=housingBetas();
    q('#hBetaArea').textContent=signed(b.floor);q('#hBetaDistance').textContent=signed(b.distance);q('#hBetaAge').textContent=signed(b.age);
    q('#hEquation').innerHTML=`<b>Price ($1,000)</b> = 300 ${b.floor<0?'−':'+'} ${Math.abs(b.floor)} × area ${b.distance<0?'−':'+'} ${Math.abs(b.distance)} × distance ${b.age<0?'−':'+'} ${Math.abs(b.age)} × age`;
    const example={floor:Number(q('#hTestArea').value)||0,distance:Number(q('#hTestDistance').value)||0,age:Number(q('#hTestAge').value)||0};
    q('#hTestPrice').textContent=cash(predictHouse(example,b));
    qa('[data-h-view]').forEach(x=>x.classList.toggle('active',x.dataset.hView===hState.view));
    const svg=q('#hMap');svg.replaceChildren();
    geo.victoria.areas.forEach(area=>svg.append(svgEl('path',{d:pathFor(area,'victoria'),class:'reg-boundary'})));
    geo.victoria.areas.filter(area=>['Sooke','Metchosin','Langford','Saanich','Victoria','Sidney'].includes(area.name)).forEach(area=>{
      const [x,y]=project(area.center,geo.victoria.bounds,'victoria');
      const label=svgEl('text',{x:x.toFixed(1),y:y.toFixed(1),class:'reg-place-label'});
      label.textContent=area.name;
      svg.append(label);
    });
    const values=houses.map(h=>hState.view==='predicted'?predictHouse(h,b):hState.view==='observed'?h.observed:h.observed-predictHouse(h,b));
    const low=hState.view==='residual'?-400:0,high=hState.view==='residual'?400:1800;
    houses.forEach((h,i)=>{
      const [cx,cy]=project(h.point,geo.victoria.bounds,'victoria');
      const circle=svgEl('circle',{cx:cx.toFixed(1),cy:cy.toFixed(1),r:i===hState.selected?8:6,fill:blueOrange(values[i],low,high),class:'reg-house'+(i===hState.selected?' chosen':''),tabindex:'0','aria-label':`${h.area} house ${i+1}; ${hState.view} ${Math.round(values[i])} thousand dollars`});
      circle.addEventListener('click',()=>{hState.selected=i;renderHousing()});
      circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hState.selected=i;renderHousing()}});
      svg.append(circle);
    });
    legend(q('#hLegend'),hState.view==='residual'?'−$400k':'$0',hState.view==='residual'?'+$400k':'$1.8m',hState.view==='residual'?'Residual = reference − prediction':'Map points = synthetic houses');
    const h=houses[hState.selected],pred=predictHouse(h,b),res=h.observed-pred;
    q('#hDetail').innerHTML=`<b>${escape(h.area)} · house ${hState.selected+1}</b><span>${h.floor} m² · ${h.distance.toFixed(1)} km from Downtown · ${h.age} years old</span><span>Prediction <b>${cash(pred)}</b> · illustrative reference <b>${cash(h.observed)}</b></span><span>Residual (reference − prediction): <b>${signed(Math.round(res))} thousand CAD</b></span>`;
  }

  function makeHeat() {
    return geo.vancouver.areas.map((area,i)=>{
      const x=(area.center[0]+123.225)/.202,y=(area.center[1]-49.199)/.097;
      const downtown=area.name==='Downtown';
      const canopy=bound(16+34*(1-x)+11*(1-y)+(seed(i+101)-.5)*22-(downtown?13:0),8,75);
      const impervious=bound(77-28*(1-x)+15*y+(seed(i+202)-.5)*24+(downtown?12:0),20,92);
      const density=bound(3.5+4*x+3*y+(seed(i+303)-.5)*3+(downtown?8:0),1,19);
      const localCanopy=-.28-1.04*x-.42*y;
      const temperature=27.5+localCanopy*(canopy-35)/10+.65*(impervious-55)/10+.19*(density-6)+.7*y+(seed(i+404)-.5)*1.5;
      return {name:area.name,point:area.center,canopy,impervious,density,temperature};
    });
  }
  function row(d,selected) {return [1,...selected.map(f=>f==='canopy'?(d.canopy-35)/10:f==='impervious'?(d.impervious-55)/10:d.density-6)];}
  function solve(matrix,vector) {
    const n=vector.length,a=matrix.map((r,i)=>[...r,vector[i]]);
    for(let i=0;i<n;i++){
      let best=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[best][i]))best=j;
      [a[i],a[best]]=[a[best],a[i]];
      if(Math.abs(a[i][i])<1e-10)return Array(n).fill(0);
      const v=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=v;
      for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=f*a[i][k]}
    }
    return a.map(r=>r[n]);
  }
  function fit(selected,weights,omit=-1) {
    const n=selected.length+1,m=Array.from({length:n},()=>Array(n).fill(0)),v=Array(n).fill(0);
    heat.forEach((d,i)=>{if(i===omit)return;const w=weights[i],x=row(d,selected);for(let j=0;j<n;j++){v[j]+=w*x[j]*d.temperature;for(let k=0;k<n;k++)m[j][k]+=w*x[j]*x[k]}});
    for(let j=1;j<n;j++)m[j][j]+=.08;
    return solve(m,v);
  }
  function dot(a,b){return a.reduce((s,v,i)=>s+v*b[i],0)}
  function localWeights(center,k,omit=-1){
    const distances=heat.map((d,i)=>i===omit?Infinity:haversine(center,d.point));
    const bandwidth=distances.filter(Number.isFinite).sort((a,b)=>a-b)[Math.min(k-1,heat.length-1-(omit>=0?1:0))]||1;
    return distances.map(d=>Number.isFinite(d)?Math.exp(-.5*(d/bandwidth)**2):0);
  }
  function selectedFeatures(){return features.filter(f=>q(`[data-u-predictor="${f}"]`).checked)}
  function computeHeat(model=uState.model){
    const selected=selectedFeatures(),k=+q('#uBandwidth').value;
    const global=fit(selected,heat.map(()=>1));
    const local=heat.map(d=>fit(selected,localWeights(d.point,k)));
    const coefficients=model==='ols'?heat.map(()=>global):local;
    const prediction=heat.map((d,i)=>dot(row(d,selected),coefficients[i]));
    const residual=heat.map((d,i)=>d.temperature-prediction[i]);
    const mean=heat.reduce((s,d)=>s+d.temperature,0)/heat.length;
    const sst=heat.reduce((s,d)=>s+(d.temperature-mean)**2,0);
    const r2=1-residual.reduce((s,v)=>s+v*v,0)/sst;
    const heldout=heat.map((d,i)=>{
      const w=model==='ols'?heat.map(()=>1):localWeights(d.point,k,i);
      const beta=fit(selected,w,i);
      return Math.abs(d.temperature-dot(row(d,selected),beta));
    });
    const mae=heldout.reduce((s,x)=>s+x,0)/heldout.length;
    return {selected,k,global,local,coefficients,prediction,residual,r2,mae};
  }
  function renderHeat(){
    const c=computeHeat(),other=computeHeat(uState.model==='ols'?'gwr':'ols'),svg=q('#uMap');svg.replaceChildren();
    q('#uBandwidthValue').textContent=c.k;
    q('#uBandwidth').disabled=uState.model==='ols';
    q('#uVariable').disabled=!c.selected.length;
    if(!c.selected.includes(q('#uVariable').value)&&c.selected.length)q('#uVariable').value=c.selected[0];
    qa('[data-u-model]').forEach(x=>x.classList.toggle('active',x.dataset.uModel===uState.model));
    qa('[data-u-view]').forEach(x=>x.classList.toggle('active',x.dataset.uView===uState.view));
    const variable=q('#uVariable').value,idx=c.selected.indexOf(variable);
    const values=heat.map((d,i)=>uState.view==='prediction'?c.prediction[i]:uState.view==='residual'?c.residual[i]:idx<0?0:c.coefficients[i][idx+1]);
    const finite=values.filter(Number.isFinite),abs=Math.max(.2,...finite.map(Math.abs));
    const [min,max]=uState.view==='prediction'?[22,36]:uState.view==='residual'?[-4,4]:[-abs,abs];
    geo.vancouver.areas.forEach((area,i)=>{
      const path=svgEl('path',{d:pathFor(area,'vancouver'),fill:blueOrange(values[i],min,max),class:'reg-area'+(uState.selected===i?' chosen':''),tabindex:'0','aria-label':`${area.name}: ${values[i].toFixed(2)} ${uState.view==='coefficient'?'coefficient':'degrees Celsius'}`});
      path.addEventListener('click',()=>{uState.selected=i;renderHeat()});
      path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();uState.selected=i;renderHeat()}});
      svg.append(path);
    });
    const area=heat[uState.selected],localBeta=idx<0?NaN:c.local[uState.selected][idx+1],globalBeta=idx<0?NaN:c.global[idx+1];
    q('#uDetail').innerHTML=`<b>${escape(area.name)}</b><span>Canopy ${area.canopy.toFixed(0)}% · impervious ${area.impervious.toFixed(0)}% · density ${area.density.toFixed(1)} buildings/ha</span><span>Illustrative temperature <b>${area.temperature.toFixed(1)}°C</b> · ${uState.model.toUpperCase()} prediction <b>${c.prediction[uState.selected].toFixed(1)}°C</b> · residual <b>${signed(+c.residual[uState.selected].toFixed(1))}°C</b></span><span>${escape(featureNames[variable])} coefficient: OLS <b>${Number.isFinite(globalBeta)?signed(globalBeta,2):'excluded'}</b> · local GWR <b>${Number.isFinite(localBeta)?signed(localBeta,2):'excluded'}</b> ${escape(units[variable])}</span>`;
    const ols=uState.model==='ols'?c:other,gwr=uState.model==='gwr'?c:other;
    q('#uMetrics').innerHTML=`<div class="reg-metric-header"><span>Model</span><span>Fitted R²</span><span>Held-out MAE</span></div><div class="reg-metric-row ${uState.model==='ols'?'active':''}"><b>OLS</b><b>${ols.r2.toFixed(2)}</b><b>${ols.mae.toFixed(2)}°C</b></div><div class="reg-metric-row ${uState.model==='gwr'?'active':''}"><b>GWR</b><b>${gwr.r2.toFixed(2)}</b><b>${gwr.mae.toFixed(2)}°C</b></div><small>Held-out MAE predicts each area after excluding it from the fit; lower is better. Higher fitted R² does not guarantee better held-out prediction.${c.k<=6?' The narrow bandwidth may make local coefficients unstable.':''}</small>`;
    legend(q('#uLegend'),uState.view==='prediction'?'22°C':uState.view==='residual'?'−4°C':signed(+min.toFixed(1)),uState.view==='prediction'?'36°C':uState.view==='residual'?'+4°C':signed(+max.toFixed(1)),uState.view==='coefficient'?`${featureNames[variable]} · ${units[variable]}`:uState.view==='residual'?'Residual = illustrative temperature − prediction':'Conceptual temperature prediction');
  }
  function bind(){
    qa('#housingLab input').forEach(x=>x.addEventListener('input',renderHousing));
    q('#hReset').addEventListener('click',()=>{q('#hArea').value=5;q('#hDistance').value=-35;q('#hAge').value=-4;q('#hTestArea').value=120;q('#hTestDistance').value=5;q('#hTestAge').value=20;renderHousing()});
    qa('[data-h-view]').forEach(x=>x.addEventListener('click',()=>{hState.view=x.dataset.hView;renderHousing()}));
    qa('[data-u-model]').forEach(x=>x.addEventListener('click',()=>{uState.model=x.dataset.uModel;renderHeat()}));
    qa('[data-u-view]').forEach(x=>x.addEventListener('click',()=>{uState.view=x.dataset.uView;renderHeat()}));
    qa('[data-u-predictor]').forEach(x=>x.addEventListener('change',renderHeat));
    q('#uVariable').addEventListener('change',renderHeat);q('#uBandwidth').addEventListener('input',renderHeat);
    qa('[data-u-place]').forEach(x=>x.addEventListener('click',()=>{uState.selected=heat.findIndex(d=>d.name===x.dataset.uPlace);renderHeat()}));
  }
  fetch('data/regression-geography.json').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(data=>{
    geo=data;houses=makeHouses();heat=makeHeat();bind();renderHousing();renderHeat();
  }).catch(error=>{q('#hMap').insertAdjacentHTML('afterend','<p class="feedback">The map data could not load. Refresh the page to try again.</p>');console.error('Regression map load failed',error)});
})();
