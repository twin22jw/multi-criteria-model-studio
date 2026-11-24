(() => {
  const $=id=>document.getElementById(id);
  if(!$('digitalGroupForm'))return;
  const API='https://geog328-regression-classroom.skwldnjs57.chatgpt.site';
  const sessionKey='geog328-digital-group-v1';
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fields={question:'digitalQuestion',processes:'digitalProcesses',data:'digitalData',collection:'digitalCollection'};
  const typeLabels={current:'What is happening?',future:'What will happen?',whatif:'What if…?'};
  let auth=null,snapshot=null,pollTimer=null,saveTimers={};
  function message(text,error=false){$('digitalStatus').textContent=text;$('digitalStatus').classList.toggle('error',error);}
  function saveMessage(text,error=false){$('digitalSaveStatus').textContent=text;$('digitalSaveStatus').classList.toggle('error',error);}
  async function request(path,method='GET',body,code=auth?.code){
    const response=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(code?{Authorization:'Bearer '+code}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;try{data=await response.json();}catch{throw Error('Classroom service did not respond. Try again.');}
    if(!response.ok)throw Error(data.error||'Classroom request failed');
    return data;
  }
  function show(role){$('digitalEntry').hidden=!!role;$('digitalStudent').hidden=role!=='student';$('digitalInstructor').hidden=role!=='instructor';}
  function renderStudent(data){
    snapshot=data;const group=data.groups[0];if(!group)return;
    show('student');$('digitalGroupTitle').textContent=group.label;$('digitalGroupCode').textContent=auth.code;
    for(const [field,id] of Object.entries(fields)){const element=$(id);if(document.activeElement!==element&&element.value!==group.digital[field])element.value=group.digital[field]||'';}
    const selected=group.digital.questionType;
    for(const input of document.querySelectorAll('input[name="digitalQuestionType"]'))input.checked=input.value===selected;
  }
  function renderInstructor(data){
    snapshot=data;show('instructor');$('digitalInstructorCount').textContent=String(data.groups.length);
    $('digitalInstructorGroups').innerHTML=data.groups.length?data.groups.map(group=>{
      const doc=group.digital;
      return `<article class="digital-instructor-card"><h3>${escapeHTML(group.label)}</h3><div><b>Question ${doc.questionType?`· ${escapeHTML(typeLabels[doc.questionType])}`:''}</b><p>${escapeHTML(doc.question||'No question yet.')}</p></div><div><b>Processes and interactions</b><p>${escapeHTML(doc.processes||'No response yet.')}</p></div><div><b>Required data</b><p>${escapeHTML(doc.data||'No response yet.')}</p></div><div><b>Data collection and sensors</b><p>${escapeHTML(doc.collection||'No response yet.')}</p></div></article>`;
    }).join(''):'<p class="process-empty">Waiting for groups to open Digital Forest workspaces…</p>';
  }
  async function refresh(){
    if(!auth)return;
    try{const data=auth.role==='instructor'?await request('/digital/instructor','POST',{groupName:'GEOG328_instructor'},''):await request('/digital/group');
      if(auth.role==='instructor')renderInstructor(data);else renderStudent(data);
      message('Connected · group work updates automatically.');
    }catch(error){message(error.message,true);}
  }
  function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(refresh,3000);}
  function leave(){auth=null;snapshot=null;clearInterval(pollTimer);pollTimer=null;for(const timer of Object.values(saveTimers))clearTimeout(timer);saveTimers={};sessionStorage.removeItem(sessionKey);show(null);message('');}
  $('digitalGroupForm').addEventListener('submit',async event=>{
    event.preventDefault();const values=new FormData(event.currentTarget),name=String(values.get('name')||'').trim(),code=String(values.get('code')||'').trim();
    try{message('Opening workspace…');
      if(name==='GEOG328_instructor'){const data=await request('/digital/instructor','POST',{groupName:name},'');auth={role:'instructor',name};renderInstructor(data);}
      else{const data=code?await request('/digital/join','POST',{name,code},''):await request('/digital/groups','POST',{name},'');auth={role:'student',name,code:code||data.groupCode};renderStudent(data);}
      sessionStorage.setItem(sessionKey,JSON.stringify(auth));startPolling();message('Connected · group work updates automatically.');
    }catch(error){message(error.message,true);}
  });
  $('digitalLeaveStudent').addEventListener('click',leave);$('digitalLeaveInstructor').addEventListener('click',leave);
  async function save(field,value){
    try{snapshot=await request('/digital/answers/'+field,'PUT',{text:value});saveMessage('Saved · your group and instructor can see this answer.');}
    catch(error){saveMessage('Could not save: '+error.message,true);}
  }
  for(const [field,id] of Object.entries(fields))$(id).addEventListener('input',event=>{
    saveMessage('Saving…');clearTimeout(saveTimers[field]);const value=event.target.value;
    saveTimers[field]=setTimeout(()=>save(field,value),650);
  });
  for(const input of document.querySelectorAll('input[name="digitalQuestionType"]'))input.addEventListener('change',event=>{if(event.target.checked)save('questionType',event.target.value);});
  try{const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(saved?.name){auth=saved;refresh().then(()=>{if(auth)startPolling();});}}catch{}
})();

