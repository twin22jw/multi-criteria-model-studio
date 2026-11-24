(() => {
  const fireTab=document.getElementById('processFireTab'),urbanTab=document.getElementById('processUrbanTab'),digitalTab=document.getElementById('processDigitalTab');
  if (!fireTab || !urbanTab || !digitalTab) return;
  const $=id=>document.getElementById(id);
  const API='https://geog328-regression-classroom.skwldnjs57.chatgpt.site';
  const key='geog328-urban-group-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svgNS='http://www.w3.org/2000/svg', map=$('urbanMap');
  let geo=null,auth=null,snapshot=null,selected=null,timer=null,saveTimers={};
  let roadMap=null,roadPins=null,landCover=null;
  const ownGroup=()=>snapshot?.groups.find(group=>group.id===snapshot.ownGroupId)||snapshot?.groups[0];
  const visibleGroups=()=>[...(snapshot?.groups||[]),...(snapshot?.sharedGroups||[])];
  const timingLabel=value=>({short:'Short-term (0–10 years)',medium:'Medium-term (10–20 years)',long:'Long-term (20–30 years)'})[value]||'Timing not selected';
  function activate(name) {
    const urban=name==='urban',digital=name==='digital',fire=!urban&&!digital;
    $('processFirePanel').hidden=!fire;$('processUrbanPanel').hidden=!urban;$('processDigitalPanel').hidden=!digital;
    fireTab.classList.toggle('active',fire);urbanTab.classList.toggle('active',urban);digitalTab.classList.toggle('active',digital);
    fireTab.setAttribute('aria-selected',String(fire));urbanTab.setAttribute('aria-selected',String(urban));digitalTab.setAttribute('aria-selected',String(digital));
    if(urban){ensureRoadMap();renderMap();if(roadMap)requestAnimationFrame(()=>roadMap.invalidateSize());}
  }
  fireTab.addEventListener('click',()=>activate('fire'));
  urbanTab.addEventListener('click',()=>activate('urban'));
  digitalTab.addEventListener('click',()=>activate('digital'));
  const initialActivity=new URL(location.href).searchParams.get('activity');
  if(initialActivity==='urban'||initialActivity==='digital'){
    document.querySelector('[data-tab="process"]')?.click();activate(initialActivity);
  }
  const status=(message,error=false)=>{$('urbanStatus').textContent=message;$('urbanStatus').classList.toggle('error',error);};
  const saveStatus=message=>{$('urbanSaveStatus').textContent=message;};
  async function request(path,method='GET',body,code=auth?.code){
    const response=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(code?{Authorization:'Bearer '+code}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;try{data=await response.json();}catch{throw Error('Classroom service did not respond. Try again.');}
    if(!response.ok)throw Error(data.error||'Classroom request failed');
    return data;
  }
  function show(role){$('urbanGroupEntry').hidden=!!role;$('urbanStudentWorkspace').hidden=role!=='student';$('urbanInstructorWorkspace').hidden=role!=='instructor';$('urbanSharedSection').hidden=role!=='student'||!snapshot?.reveal;$('urbanOtherKey').hidden=role!=='instructor'&&!snapshot?.reveal;$('urbanOwnKey').hidden=!visibleGroups().some(group=>group.urban.predictions.length);$('urbanMapMessage').textContent=role==='student'?'Click within a municipality to add up to three forecast pins.':role==='instructor'?'All group pins appear here as students save them.':'Open a group workspace to add predictions.';}
  function clearSession(){auth=null;snapshot=null;selected=null;sessionStorage.removeItem(key);if(timer)clearInterval(timer);timer=null;show(null);status('');renderMap();}
  function startPolling(){if(timer)clearInterval(timer);timer=setInterval(refresh,3000);}
  const newId=prefix=>prefix+Math.random().toString(36).slice(2,11);
  function rowProcess(item={}){const id=item.id||newId('p');return `<div class="urban-process-row" data-id="${esc(id)}"><textarea aria-label="Growth process" maxlength="350" placeholder="e.g. changing population or housing demand">${esc(item.text||'')}</textarea><button type="button" class="urban-remove" aria-label="Remove process">×</button></div>`;}
  function rowFactor(item={}){const id=item.id||newId('f'),category=item.category||'environmental';return `<div class="urban-factor-row" data-id="${esc(id)}"><input aria-label="Factor name" maxlength="100" placeholder="e.g. flood exposure" value="${esc(item.name||'')}"><select aria-label="Factor type"><option value="environmental"${category==='environmental'?' selected':''}>Environmental</option><option value="socioeconomic"${category==='socioeconomic'?' selected':''}>Socioeconomic</option></select><input aria-label="Potential influence" maxlength="200" placeholder="e.g. limits expansion" value="${esc(item.influence||'')}"><textarea aria-label="Possible real data source" maxlength="500" placeholder="e.g. floodplain map or census table">${esc(item.source||'')}</textarea><button type="button" class="urban-remove" aria-label="Remove factor">×</button></div>`;}
  function rowPrediction(item,index){return `<div class="urban-prediction-row" data-id="${esc(item.id)}"><div><b>Pin ${index+1} · ${esc(item.municipality||'Selected area')}</b><button type="button" class="urban-remove" aria-label="Remove forecast pin">×</button></div><label>Expected timing of urban growth<select aria-label="Expected timing of urban growth"><option value=""${!item.timing?' selected':''}>Choose a time period</option><option value="short"${item.timing==='short'?' selected':''}>Short-term (0–10 years)</option><option value="medium"${item.timing==='medium'?' selected':''}>Medium-term (10–20 years)</option><option value="long"${item.timing==='long'?' selected':''}>Long-term (20–30 years)</option></select></label><textarea aria-label="Why might urban development intensify or expand here?" maxlength="700" placeholder="Explain this location using growth processes, interactions, and evidence.">${esc(item.why||'')}</textarea></div>`;}
  function groupCard(group,i){const doc=group.urban,p=doc.processes||[],f=doc.factors||[],places=doc.predictions||[];const colour=`hsl(${(i*137+18)%360} 61% 42%)`;return `<article class="urban-instructor-card"><h3><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${colour};margin-right:.4rem"></span>${esc(group.label)}</h3><b>Growth processes</b>${p.length?`<ul>${p.map(item=>`<li>${esc(item.text)}</li>`).join('')}</ul>`:'<p>No processes yet.</p>'}<b>Factors and evidence</b>${f.length?`<table><thead><tr><th>Factor</th><th>Type</th><th>Influence</th><th>Data source</th></tr></thead><tbody>${f.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(item.category)}</td><td>${esc(item.influence||'Not specified')}</td><td>${esc(item.source||'Not specified')}</td></tr>`).join('')}</tbody></table>`:'<p>No factors yet.</p>'}<b>Interactions between factors</b><p class="urban-interactions-answer">${esc(doc.interactions||'No interaction yet.')}</p><b>Forecast locations</b>${places.length?`<ul>${places.map((item,j)=>`<li>Pin ${j+1} · ${esc(item.municipality||'Map location')} · ${esc(timingLabel(item.timing))}: ${esc(item.why||'No reason yet.')}</li>`).join('')}</ul>`:'<p>No pins yet.</p>'}</article>`;}
  function renderStudent(data){
    snapshot=data;const group=ownGroup();if(!group)return;
    $('urbanGroupTitle').textContent=group.label;$('urbanGroupCode').textContent=auth.code;
    const editing=$('urbanStudentWorkspace').contains(document.activeElement)&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(!editing){$('urbanProcessRows').innerHTML=group.urban.processes.map(rowProcess).join('');$('urbanFactorRows').innerHTML=group.urban.factors.map(rowFactor).join('');$('urbanPredictionRows').innerHTML=group.urban.predictions.map(rowPrediction).join('');$('urbanInteractions').value=group.urban.interactions||'';}
    $('urbanSharedGroups').innerHTML=data.reveal?(data.sharedGroups.length?data.sharedGroups.map(groupCard).join(''):'<p>No other groups yet.</p>'):'';
    show('student');renderMap();
  }
  function renderInstructor(data){
    snapshot=data;$('urbanInstructorCount').textContent=String(data.groups.length);$('urbanReveal').checked=!!data.reveal;
    $('urbanInstructorGroups').innerHTML=data.groups.length?data.groups.map(groupCard).join(''):'<p class="process-empty">Waiting for groups to create urban growth workspaces…</p>';
    show('instructor');renderMap();
  }
  async function refresh(){if(!auth)return;try{const data=auth.role==='instructor'?await request('/urban/instructor','POST',{groupName:'GEOG328_instructor'},''):await request('/urban/group');if(auth.role==='instructor')renderInstructor(data);else renderStudent(data);status('Connected · group work updates automatically.');}catch(error){status(error.message,true);}}
  $('urbanGroupForm').addEventListener('submit',async event=>{
    event.preventDefault();const fields=new FormData(event.currentTarget),name=String(fields.get('name')||'').trim(),code=String(fields.get('code')||'').trim();
    try{
      status('Opening workspace…');
      if(name==='GEOG328_instructor'){const data=await request('/urban/instructor','POST',{groupName:name},'');auth={role:'instructor',name};sessionStorage.setItem(key,JSON.stringify(auth));renderInstructor(data);}
      else{const data=code?await request('/urban/join','POST',{name,code},''):await request('/urban/groups','POST',{name},'');auth={role:'student',name,code:code||data.groupCode};sessionStorage.setItem(key,JSON.stringify(auth));renderStudent(data);}
      startPolling();status('Connected · group work updates automatically.');
    }catch(error){status(error.message,true);}
  });
  $('urbanLeaveGroup').addEventListener('click',clearSession);$('urbanLeaveInstructor').addEventListener('click',clearSession);
  $('urbanReveal').addEventListener('change',async event=>{
    const input=event.currentTarget;input.disabled=true;$('urbanRevealStatus').textContent='Updating class visibility…';
    try{renderInstructor(await request('/urban/reveal','POST',{groupName:'GEOG328_instructor',reveal:input.checked},''));$('urbanRevealStatus').textContent=input.checked?'Group work is visible to students.':'Group work is private to each group.';}
    catch(error){input.checked=!input.checked;$('urbanRevealStatus').textContent='Could not update: '+error.message;}
    finally{input.disabled=false;}
  });
  $('urbanLandCover').addEventListener('change',()=>{const on=$('urbanLandCover').checked;$('urbanLandLegend').hidden=!on;if(!roadMap)return;if(on)landCover.addTo(roadMap);else roadMap.removeLayer(landCover);});
  function svgElement(tag,attributes={}){const node=document.createElementNS(svgNS,tag);Object.entries(attributes).forEach(([name,value])=>node.setAttribute(name,String(value)));return node;}
  function projected(lon,lat){const [west,south,east,north]=geo.bounds,midLon=(west+east)/2,midLat=(south+north)/2,scale=Math.min(650/((east-west)*.66),530/(north-south));return [380+(lon-midLon)*.66*scale,300-(lat-midLat)*scale];}
  function unproject(x,y){const [west,south,east,north]=geo.bounds,midLon=(west+east)/2,midLat=(south+north)/2,scale=Math.min(650/((east-west)*.66),530/(north-south));return [midLon+(x-380)/(.66*scale),midLat-(y-300)/scale];}
  function ensureRoadMap(){
    if(roadMap||!geo||!window.L||$('processUrbanPanel').hidden)return;
    const [west,south,east,north]=geo.bounds;
    $('urbanRoadMap').hidden=false;map.setAttribute('hidden','');
    roadMap=L.map('urbanRoadMap',{scrollWheelZoom:true,minZoom:9,maxZoom:18,zoomSnap:.25});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(roadMap);
    landCover=L.tileLayer.wms('https://titiler.terrascope.be/wms',{
      layers:'esa-worldcover-map-10m-2021-v2_map',format:'image/png',transparent:true,version:'1.3.0',time:'2021-01-01',opacity:.7,
      attribution:'© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium'
    });
    for(const area of geo.areas){
      const rings=area.rings.map(ring=>ring.map(([lon,lat])=>[lat,lon]));
      const boundary=L.polygon(rings,{color:'#23725d',weight:1.6,opacity:.75,fillColor:'#9bc8a8',fillOpacity:.03,bubblingMouseEvents:false}).addTo(roadMap);
      boundary.bindTooltip(area.name,{sticky:true});
      boundary.on('click',event=>savePin(event.latlng.lng,event.latlng.lat,area));
    }
    roadPins=L.layerGroup().addTo(roadMap);
    roadMap.fitBounds([[south,west],[north,east]],{padding:[12,12]});
    roadMap.on('click',()=>status(auth?.role==='student'?'Choose a location within a municipality outline.':'Open a student group to place a forecast pin.'));
  }
  function renderRoadPins(){
    if(!roadPins)return;roadPins.clearLayers();
    if(!snapshot)return;
    for(const [i,group] of visibleGroups().entries())for(const [j,pin] of group.urban.predictions.entries()){
      const isOwn=group.id===snapshot.ownGroupId,colour=isOwn?'#d9743b':`hsl(${(i*137+18)%360} 61% 42%)`;
      const chosen=selected?.groupId===group.id&&selected?.id===pin.id;
      const icon=L.divIcon({className:'urban-leaflet-pin'+(chosen?' selected':''),html:`<span style="background:${colour}">${j+1}</span><b class="urban-marker-name">${esc(group.label)}</b>`,iconSize:[28,28],iconAnchor:[14,14]});
      const marker=L.marker([pin.lat,pin.lon],{icon,title:`${group.label} · pin ${j+1} · ${pin.municipality||'map location'}`,keyboard:true}).addTo(roadPins);
      marker.on('click',()=>{selected={groupId:group.id,id:pin.id};renderMap();if(auth?.role==='student')$('urbanPredictionRows').querySelector(`[data-id="${pin.id}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});});
    }
  }
  function selectedText(){
    if(!snapshot||!selected)return '';
    const group=visibleGroups().find(g=>g.id===selected.groupId),pin=group?.urban.predictions.find(p=>p.id===selected.id);
    if(!pin)return '';
    return `${esc(group.label)} · ${esc(pin.municipality||'Map location')} · ${esc(timingLabel(pin.timing))}${pin.why?` — ${esc(pin.why)}`:' · Add a reason in the forecast list.'}`;
  }
  function renderMap(){
    if(!geo)return;
    if(roadMap){renderRoadPins();$('urbanMapSelection').innerHTML=selectedText();return;}
    map.replaceChildren();
    for(const area of geo.areas){
      const d=area.rings.map(ring=>ring.map(([lon,lat],i)=>{const [x,y]=projected(lon,lat);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join('')+'Z').join('');
      const path=svgElement('path',{d,class:'urban-area','data-area':area.name,tabindex:'0',role:'button','aria-label':`${area.name}: add a forecast pin`});
      path.addEventListener('click',event=>placePin(event,area));
      path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();placePin(event,area,true);}});
      map.append(path);
    }
    const offsets={'North Saanich':[-21,-9],Sidney:[22,9],'View Royal':[0,-9],Langford:[-10,-4],Colwood:[-2,9],Victoria:[10,5]};
    for(const area of geo.areas.filter(a=>['Sooke','Langford','Colwood','Victoria','Saanich','Central Saanich','North Saanich','Sidney','Metchosin','View Royal'].includes(a.name))){const [x,y]=projected(...area.center),[dx,dy]=offsets[area.name]||[0,0];const label=svgElement('text',{x:x+dx,y:y+dy,class:'urban-place-label','text-anchor':'middle'});label.textContent=area.name;map.append(label);}
    if(snapshot)for(const [i,group] of visibleGroups().entries())for(const [j,pin] of group.urban.predictions.entries()){
      const [x,y]=projected(pin.lon,pin.lat),colour=group.id===snapshot.ownGroupId?'#d9743b':`hsl(${(i*137+18)%360} 61% 42%)`;
      const g=svgElement('g',{class:'urban-pin'+(selected?.groupId===group.id&&selected?.id===pin.id?' selected':''),tabindex:'0',role:'button','aria-label':`${group.label}, pin ${j+1}, ${pin.municipality||'map location'}`});
      g.append(svgElement('circle',{cx:x,cy:y,r:13,fill:colour}));const text=svgElement('text',{x,y:y+1});text.textContent=String(j+1);g.append(text);
      g.addEventListener('click',event=>{event.stopPropagation();selected={groupId:group.id,id:pin.id};renderMap();if(auth?.role==='student')$('urbanPredictionRows').querySelector(`[data-id="${pin.id}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});});
      g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();g.dispatchEvent(new Event('click'));}});
      map.append(g);
    }
    $('urbanMapSelection').innerHTML=selectedText();
  }
  async function placePin(event,area,keyboard=false){
    let lon,lat;
    if(keyboard)[lon,lat]=area.center;
    else{const point=map.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(map.getScreenCTM().inverse());[lon,lat]=unproject(local.x,local.y);}
    await savePin(lon,lat,area);
  }
  async function savePin(lon,lat,area){
    if(auth?.role!=='student'){status(auth?.role==='instructor'?'Instructor view shows all saved pins.':'Open a student group first to place a pin.');return;}
    const group=ownGroup();if(!group)return;
    if(group.urban.predictions.length>=3){saveStatus('Maximum three forecast pins per group.');return;}
    const id=newId('l');
    try{const data=await request('/urban/predictions/'+id,'PUT',{lon,lat,municipality:area.name,timing:'',why:''});selected={groupId:data.ownGroupId,id};renderStudent(data);saveStatus('Pin saved. Choose a time period and add a reason.');}
    catch(error){saveStatus('Could not place pin: '+error.message);}
  }
  function schedule(kind,row,read){const id=row.dataset.id;saveStatus('Saving…');clearTimeout(saveTimers[id]);saveTimers[id]=setTimeout(async()=>{
    const value=read(row);if(!value)return;
    try{const data=await request('/urban/'+kind+'/'+id,'PUT',value);snapshot=data;saveStatus('Saved · your group and instructor can see this response.');renderMap();}
    catch(error){saveStatus('Could not save: '+error.message);}
  },650);}
  $('urbanAddProcess').addEventListener('click',()=>{const rows=$('urbanProcessRows');if(rows.children.length>=8){saveStatus('Maximum eight processes.');return;}rows.insertAdjacentHTML('beforeend',rowProcess());rows.lastElementChild.querySelector('textarea').focus();});
  $('urbanAddFactor').addEventListener('click',()=>{const rows=$('urbanFactorRows');if(rows.children.length>=12){saveStatus('Maximum twelve factors.');return;}rows.insertAdjacentHTML('beforeend',rowFactor());rows.lastElementChild.querySelector('input').focus();});
  $('urbanProcessRows').addEventListener('input',event=>{const row=event.target.closest('.urban-process-row');if(row)schedule('processes',row,node=>{const text=node.querySelector('textarea').value.trim();return text?{text}:null;});});
  const readFactor=node=>{const name=node.querySelector('input').value.trim();return name?{name,category:node.querySelector('select').value,influence:node.querySelector('input[aria-label="Potential influence"]').value,source:node.querySelector('textarea').value}:null;};
  $('urbanFactorRows').addEventListener('input',event=>{const row=event.target.closest('.urban-factor-row');if(row)schedule('factors',row,readFactor);});
  $('urbanFactorRows').addEventListener('change',event=>{const row=event.target.closest('.urban-factor-row');if(row)schedule('factors',row,readFactor);});
  let interactionTimer; $('urbanInteractions').addEventListener('input',()=>{saveStatus('Saving…');clearTimeout(interactionTimer);interactionTimer=setTimeout(async()=>{try{snapshot=await request('/urban/interactions','PUT',{text:$('urbanInteractions').value});saveStatus('Interactions saved.');renderMap();}catch(error){saveStatus('Could not save: '+error.message);}},650);});
  const updatePrediction=event=>{const row=event.target.closest('.urban-prediction-row');if(!row)return;const pin=ownGroup()?.urban.predictions.find(p=>p.id===row.dataset.id);if(!pin)return;schedule('predictions',row,node=>({lon:pin.lon,lat:pin.lat,municipality:pin.municipality,timing:node.querySelector('select').value,why:node.querySelector('textarea').value}));};
  $('urbanPredictionRows').addEventListener('input',updatePrediction);$('urbanPredictionRows').addEventListener('change',updatePrediction);
  for(const [container,kind] of [['urbanProcessRows','processes'],['urbanFactorRows','factors'],['urbanPredictionRows','predictions']])$(container).addEventListener('click',async event=>{
    const button=event.target.closest('.urban-remove');if(!button)return;const row=button.parentElement.closest('[data-id]'),id=row?.dataset.id;if(!id)return;clearTimeout(saveTimers[id]);
    try{const data=await request('/urban/'+kind+'/'+id,'DELETE');row.remove();snapshot=data;if(selected?.id===id)selected=null;renderMap();saveStatus('Removed.');}
    catch(error){saveStatus('Could not remove: '+error.message);}
  });
  fetch('data/regression-geography.json').then(r=>{if(!r.ok)throw Error('Map data unavailable');return r.json();}).then(data=>{geo=data.victoria;ensureRoadMap();renderMap();}).catch(error=>{status('Greater Victoria map could not load. Refresh the page.',true);console.error(error);});
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.name){auth=saved;refresh().then(()=>{if(auth)startPolling();});}}catch{}
})();


