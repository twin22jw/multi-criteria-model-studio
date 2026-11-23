(() => {
  const root=document.getElementById('process');if(!root)return;
  const API='https://geog328-regression-classroom.skwldnjs57.chatgpt.site';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const savedKey='geog328-process-group-v1';
  let auth=null,pollTimer=null,saveTimers={},lastState=null;
  const status=(message,error=false)=>{$('processGroupStatus').textContent=message;$('processGroupStatus').classList.toggle('error',error);};
  const saveStatus=message=>{$('processSaveStatus').textContent=message;};
  async function request(path,method='GET',body,code=auth?.code){
    const response=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(code?{Authorization:'Bearer '+code}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;try{data=await response.json();}catch{throw Error('Classroom service did not respond. Try again.');}
    if(!response.ok)throw Error(data.error||'Classroom request failed');
    return data;
  }
  function show(role){$('processGroupEntry').hidden=!!role;$('processGroupWorkspace').hidden=role!=='student';$('processInstructorView').hidden=role!=='instructor';}
  function clearSession(){auth=null;lastState=null;sessionStorage.removeItem(savedKey);if(pollTimer)clearInterval(pollTimer);pollTimer=null;show(null);status('');}
  function startPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(refresh,3000);}
  function variableRow(item={}){
    const id=item.id||'v'+Math.random().toString(36).slice(2,11);
    return `<div class="process-variable-row" data-id="${esc(id)}"><input aria-label="Variable name" data-field="name" maxlength="100" placeholder="e.g. fine fuel moisture" value="${esc(item.name||'')}"><textarea aria-label="Possible real data source" data-field="realData" maxlength="500" placeholder="e.g. field samples or an agency dataset">${esc(item.realData||'')}</textarea><button type="button" class="process-variable-delete" aria-label="Remove variable">×</button></div>`;
  }
  function renderStudent(snapshot){
    const group=snapshot.groups[0];if(!group)return;
    lastState=snapshot;$('processGroupTitle').textContent=group.label;$('processGroupCode').textContent=auth.code;
    const editing=$('processGroupWorkspace').contains(document.activeElement)&&['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
    if(!editing){$('fireAnswerProcess').value=group.process.q1||'';$('fireAnswerFactors').value=group.process.q2||'';$('processVariableRows').innerHTML=(group.process.variables||[]).map(variableRow).join('');}
    show('student');
  }
  function renderInstructor(snapshot){
    $('processInstructorCount').textContent=String(snapshot.groups.length);
    $('processInstructorGroups').innerHTML=snapshot.groups.length?snapshot.groups.map(group=>{
      const doc=group.process||{},variables=doc.variables||[];
      return `<article class="process-instructor-card"><div class="process-instructor-head"><h4>${esc(group.label)}</h4><span>${variables.length} variables</span></div><div><b>Q1 · Process over time</b><p>${esc(doc.q1||'No response yet.')}</p></div><div><b>Q2 · Factors and interactions</b><p>${esc(doc.q2||'No response yet.')}</p></div><div><b>Q3 · Variables and real data</b>${variables.length?`<table><thead><tr><th>Variable</th><th>Possible real data</th></tr></thead><tbody>${variables.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(item.realData||'Not specified yet.')}</td></tr>`).join('')}</tbody></table>`:'<p>No variables yet.</p>'}</div><small>Last saved ${group.updatedAt?new Date(group.updatedAt).toLocaleTimeString():'—'}</small></article>`;
    }).join(''):'<p class="process-empty">Waiting for student groups to create their workspaces…</p>';
    show('instructor');
  }
  async function refresh(){if(!auth)return;try{const snapshot=auth.role==='instructor'?await request('/process/instructor','POST',{groupName:'GEOG328_instructor'},''):await request('/process/group');if(auth.role==='instructor')renderInstructor(snapshot);else renderStudent(snapshot);status('Connected · responses update automatically.');}catch(error){status(error.message,true);}}
  $('processGroupForm').addEventListener('submit',async event=>{
    event.preventDefault();const data=new FormData(event.currentTarget),name=String(data.get('name')||'').trim(),code=String(data.get('code')||'').trim();
    try{
      status('Opening workspace…');
      if(name==='GEOG328_instructor'){
        const snapshot=await request('/process/instructor','POST',{groupName:name},'');auth={role:'instructor',name};sessionStorage.setItem(savedKey,JSON.stringify(auth));renderInstructor(snapshot);
      }else{
        const snapshot=code?await request('/process/join','POST',{name,code},''):await request('/process/groups','POST',{name},'');
        auth={role:'student',name,code:code||snapshot.groupCode};sessionStorage.setItem(savedKey,JSON.stringify(auth));renderStudent(snapshot);
      }
      startPolling();status('Connected · responses update automatically.');
    }catch(error){status(error.message,true);}
  });
  $('processLeaveGroup').addEventListener('click',clearSession);
  $('processLeaveInstructor').addEventListener('click',clearSession);
  for(const [id,field] of [['fireAnswerProcess','q1'],['fireAnswerFactors','q2']])$(id).addEventListener('input',()=>{
    saveStatus('Saving…');clearTimeout(saveTimers[field]);saveTimers[field]=setTimeout(async()=>{
      try{await request('/process/answers/'+field,'PUT',{text:$(id).value});saveStatus('Saved · your group and instructor can see this response.');}
      catch(error){saveStatus('Could not save: '+error.message);}
    },550);
  });
  $('processAddVariable').addEventListener('click',()=>{const rows=$('processVariableRows');if(rows.children.length>=12){saveStatus('Maximum 12 variables per group.');return;}rows.insertAdjacentHTML('beforeend',variableRow());rows.lastElementChild.querySelector('[data-field="name"]').focus();});
  $('processVariableRows').addEventListener('input',event=>{
    const row=event.target.closest('.process-variable-row');if(!row)return;
    const id=row.dataset.id;saveStatus('Saving…');clearTimeout(saveTimers[id]);saveTimers[id]=setTimeout(async()=>{
      const name=row.querySelector('[data-field="name"]').value.trim();if(!name){saveStatus('Enter a variable name to save this row.');return;}
      try{await request('/process/variables/'+id,'PUT',{name,realData:row.querySelector('[data-field="realData"]').value});saveStatus('Saved · your group and instructor can see this variable.');}
      catch(error){saveStatus('Could not save: '+error.message);}
    },650);
  });
  $('processVariableRows').addEventListener('click',async event=>{
    const button=event.target.closest('.process-variable-delete');if(!button)return;const row=button.closest('.process-variable-row'),id=row.dataset.id;
    clearTimeout(saveTimers[id]);try{await request('/process/variables/'+id,'DELETE');row.remove();saveStatus('Variable removed.');}catch(error){saveStatus('Could not remove: '+error.message);}
  });
  try{const saved=JSON.parse(sessionStorage.getItem(savedKey)||'null');if(saved?.name){auth=saved;refresh().then(()=>{if(auth)startPolling();});}}catch{}
})();

