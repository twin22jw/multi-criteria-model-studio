(() => {
  'use strict';
  const API = 'https://geog328-regression-classroom.skwldnjs57.chatgpt.site';
  const root = document.querySelector('#regression');
  const $ = selector => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const roomFromUrl = params.get('room') || '';
  let auth = null, current = null, pending = 0, pollTimer = null;
  const saveTimers = new Map();

  root.innerHTML = `
    <div class="hero"><div><p class="eyebrow">GEOG 328 · SPATIAL REGRESSION MODEL</p><h1>Housing Price in Greater Victoria</h1><p class="lede">Work with your group to propose housing-price factors, predict their signs, and explain why a relationship might change across Greater Victoria.</p></div><div class="formula"><b>Discuss with your group</b><span>01 · Which factors matter?</span><span>02 · Positive or negative?</span><span>03 · Urban versus rural?</span></div></div>
    <div class="collab-prompts"><div><span>Q1</span><p>What factors might influence housing prices in Greater Victoria?</p></div><div><span>Q2</span><p>For each factor, would you expect a positive (+) or negative (−) relationship with price? Why?</p></div><div><span>Q3</span><p>Which relationship might differ between urban and rural areas?</p></div></div>
    <div id="collabStatus" class="collab-status" aria-live="polite"></div>
    <div id="collabContent"></div>`;

  function status(message, error = false) {
    const el = $('#collabStatus');
    el.textContent = message;
    el.classList.toggle('error', error);
  }
  async function api(path, method = 'GET', body, secret = auth?.secret) {
    const response = await fetch(API + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(secret ? { Authorization: 'Bearer ' + secret } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store'
    });
    let data;
    try { data = await response.json(); } catch { throw Error('The classroom service did not respond. Try again shortly.'); }
    if (!response.ok) throw Error(data.error || 'Request failed');
    return data;
  }
  function teacherStore(room) { return 'mcms_teacher_' + room; }
  function groupStore(room) { return 'mcms_group_' + room; }
  function joinLink(room, teacher = false) {
    const url = new URL(location.href);
    url.search = '?room=' + encodeURIComponent(room) + (teacher ? '&mode=teacher' : '');
    url.hash = '';
    return url.href;
  }
  function renderWelcome() {
    $('#collabContent').innerHTML = `<div class="collab-entry">
      <section class="collab-card"><p class="eyebrow">STUDENT MODE</p><h2>Create your group</h2><p>Use the Classroom ID from your instructor, choose your own group name, and open a shared workspace. Your group can see other groups only when the instructor opens comparison.</p>
      <form id="createGroup"><label>Classroom ID<input name="room" required value="${esc(roomFromUrl)}" autocomplete="off"></label><label>Your group name<input name="name" required minlength="2" maxlength="40" placeholder="e.g. Coastline Explorers" autocomplete="off"></label><button class="primary">Create group workspace</button></form>
      <form id="studentJoin"><h3>Join a group already created</h3><label>Classroom ID<input name="room" required value="${esc(roomFromUrl)}" autocomplete="off"></label><label>Group code from a teammate<input name="code" required autocomplete="off"></label><button class="secondary">Join existing group</button></form></section>
      <section class="collab-card"><p class="eyebrow">INSTRUCTOR MODE</p><h2>Set up your classroom</h2><p>Define the Classroom ID and Instructor secret here. Students create their own groups until the maximum you set is reached.</p>
      <form id="createClass"><label>Classroom ID<input name="room" required minlength="4" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,31}" placeholder="e.g. GEOG328-NOV17" autocomplete="off"></label><label>Instructor secret<input name="secret" required minlength="8" maxlength="100" type="password" placeholder="At least 8 characters" autocomplete="new-password"></label><label>Maximum number of groups (2–20)<input name="groups" type="number" min="2" max="20" value="20" required></label><button class="primary">Create classroom</button></form>
      <form id="teacherJoin"><h3>Open an existing classroom</h3><label>Classroom ID<input name="room" required value="${esc(roomFromUrl)}" autocomplete="off"></label><label>Instructor secret<input name="secret" required type="password" autocomplete="off"></label><button class="secondary">Open instructor dashboard</button></form></section></div>`;
    $('#createGroup').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const room = String(data.get('room')).trim(), name = String(data.get('name')).trim();
      try {
        status('Creating group…');
        const created = await api('/classrooms/' + encodeURIComponent(room) + '/groups', 'POST', { name }, '');
        auth = { room: created.classroomId, secret: created.groupCode, role: 'student' };
        sessionStorage.setItem(groupStore(auth.room), auth.secret);
        history.replaceState(null, '', joinLink(auth.room));
        current = created; renderDashboard(); startPolling(); status('Group created. Share your group code with your teammates.');
      } catch (error) { status(error.message, true); }
    });
    $('#studentJoin').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const room = String(data.get('room')).trim(), secret = String(data.get('code')).trim();
      try {
        status('Joining group…');
        const snapshot = await api('/join', 'POST', { classroomId: room, code: secret }, '');
        auth = { room: snapshot.classroomId, secret, role: 'student' };
        sessionStorage.setItem(groupStore(auth.room), secret);
        history.replaceState(null, '', joinLink(auth.room));
        current = snapshot; renderDashboard(); startPolling(); status('Connected · changes refresh about every 2 seconds.');
      } catch (error) { status(error.message, true); }
    });
    $('#teacherJoin').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const room = String(data.get('room')).trim(), secret = String(data.get('secret')).trim();
      try {
        status('Opening dashboard…');
        const snapshot = await api('/classrooms/' + encodeURIComponent(room), 'GET', undefined, secret);
        if (snapshot.role !== 'teacher') throw Error('Instructor secret is invalid');
        auth = { room: snapshot.classroomId, secret, role: 'teacher' };
        localStorage.setItem(teacherStore(auth.room), secret);
        history.replaceState(null, '', joinLink(auth.room, true));
        current = snapshot; renderDashboard(); startPolling(); status('Connected · all group responses are visible to you.');
      } catch (error) { status(error.message, true); }
    });
    $('#createClass').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const room = String(data.get('room')).trim();
      const secret = String(data.get('secret')).trim();
      const maxGroups = Number(data.get('groups'));
      try {
        status('Creating classroom…');
        const created = await api('/classrooms', 'POST', { classroomId: room, teacherSecret: secret, maxGroups }, '');
        auth = { room: created.classroomId, secret, role: 'teacher' };
        localStorage.setItem(teacherStore(auth.room), auth.secret);
        history.replaceState(null, '', joinLink(auth.room, true));
        current = await api('/classrooms/' + auth.room);
        renderDashboard(); startPolling(); status('Classroom created. Share the Classroom ID with your students; they will name their own groups.');
      } catch (error) { status(error.message, true); }
    });
  }
  function factorTable(group, editable) {
    const factors = group.document.factors;
    if (!factors.length && !editable) return '<p class="collab-empty">No factors added yet.</p>';
    return `<div class="collab-factor-list">${factors.map(f => editable ? `
      <div class="collab-factor collab-editor" data-factor="${esc(f.id)}">
        <div class="collab-factor-top"><label>Factor<input data-field="name" maxlength="80" value="${esc(f.name)}" aria-label="Factor name"></label>
          <label>Expected relationship<select data-field="direction" aria-label="Expected relationship">
            <option value="positive" ${f.direction === 'positive' ? 'selected' : ''}>Positive (+)</option>
            <option value="negative" ${f.direction === 'negative' ? 'selected' : ''}>Negative (−)</option>
            <option value="uncertain" ${f.direction === 'uncertain' ? 'selected' : ''}>Uncertain (?)</option>
          </select></label><button class="collab-delete" data-delete="${esc(f.id)}" title="Remove factor" aria-label="Remove factor">×</button></div>
        <label>Why that sign?<textarea data-field="reason" maxlength="400" rows="2">${esc(f.reason)}</textarea></label>
        <label>How might this relationship change across places?<textarea data-field="spatial" maxlength="400" rows="2">${esc(f.spatial)}</textarea></label>
      </div>` : `<div class="collab-read-factor"><b>${esc(f.name)}</b><strong class="${esc(f.direction)}">${f.direction === 'positive' ? '+ Positive' : f.direction === 'negative' ? '− Negative' : '? Uncertain'}</strong><p>${esc(f.reason) || 'No reason added yet.'}</p><small>${esc(f.spatial) || 'No spatial note yet.'}</small></div>`).join('')}</div>`;
  }
  function ownGroup(group) {
    return `<section class="collab-card collab-own" data-group="${esc(group.id)}"><div class="collab-card-head"><div><p class="eyebrow">YOUR GROUP WORKSPACE</p><h2>${esc(group.label)}</h2></div><span class="collab-count">${group.document.factors.length} factors</span></div>
      <p class="collab-help">Add possible predictors. A coefficient's sign describes association while other listed variables are held constant; it does not by itself establish causation.</p>
      ${factorTable(group, true)}<button class="secondary" id="addFactor" ${group.document.factors.length >= 10 ? 'disabled' : ''}>+ Add a factor</button>
      <div class="collab-note collab-editor"><label for="spatialNote">Q3 · Which factor may behave differently in urban versus rural areas? Explain.</label><textarea id="spatialNote" rows="4" maxlength="2000" placeholder="For example: Think about access, land area, density, or distance…">${esc(group.document.spatialNote)}</textarea></div>
      <p class="collab-save-hint">Edits save automatically. Share the group code above with teammates so they can contribute.</p></section>`;
  }
  function readGroup(group) {
    return `<section class="collab-card collab-read"><div class="collab-card-head"><h3>${esc(group.label)}</h3><span class="collab-count">${group.document.factors.length} factors</span></div>${factorTable(group, false)}
      <div class="collab-note"><b>Urban–rural discussion</b><p>${esc(group.document.spatialNote) || 'No response yet.'}</p></div>
      <small>Last saved: ${group.updatedAt ? new Date(group.updatedAt).toLocaleTimeString() : '—'}</small></section>`;
  }
  function renderDashboard() {
    if (!current || !auth) return;
    if (document.activeElement?.closest('.collab-editor')) return;
    const content = $('#collabContent');
    if (auth.role === 'teacher') {
      content.innerHTML = `<div class="collab-toolbar"><div><p class="eyebrow">INSTRUCTOR DASHBOARD</p><h2>Classroom ${esc(auth.room)}</h2><p>All groups are visible here. Students see only their own group until you open comparison.</p></div>
        <button id="toggleReveal" class="${current.reveal ? 'secondary' : 'primary'}">${current.reveal ? 'Hide other groups from students' : 'Reveal all groups to students'}</button></div>
        <div class="collab-teacher-info"><div><b>Student link</b><code>${esc(joinLink(auth.room))}</code></div><div><b>Instructor link</b><code>${esc(joinLink(auth.room, true))}</code></div><div><b>Instructor secret</b><details><summary>Show secret for backup</summary><code>${esc(auth.secret)}</code></details></div></div>
        <p class="collab-capacity"><b>${current.groups.length} / ${current.maxGroups} groups created</b> · Students choose group names. New groups appear here automatically.</p>
        <div class="collab-group-grid">${current.groups.length ? current.groups.map(readGroup).join('') : '<p class="collab-empty">Waiting for students to create their groups…</p>'}</div>`;
      $('#toggleReveal').addEventListener('click', async () => {
        try { status('Updating visibility…'); current = await api('/classrooms/' + auth.room + '/reveal', 'PATCH', { reveal: !current.reveal }); renderDashboard(); status(current.reveal ? 'Comparison is open to all groups.' : 'Group answers are private again.'); }
        catch (error) { status(error.message, true); }
      });
    } else {
      const own = current.groups.find(g => g.id === current.ownGroupId);
      if (!own) { status('Your group is unavailable. Rejoin with your code.', true); return; }
      const others = current.reveal ? current.groups.filter(g => g.id !== current.ownGroupId) : [];
      content.innerHTML = `<div class="collab-toolbar"><div><p class="eyebrow">STUDENT MODE</p><h2>Classroom ${esc(auth.room)}</h2></div><div class="collab-visibility">${current.reveal ? 'Comparison open · other groups are visible' : 'Private group work · other groups are hidden'}</div></div>
        <div class="collab-share-code"><span><b>Your group code:</b> <code>${esc(auth.secret)}</code></span><button class="secondary" id="copyGroupCode">Copy code</button><small>Send this code to your teammates. They can use “Join a group already created.”</small></div>
        ${ownGroup(own)}
        ${others.length ? `<div class="collab-comparison"><h2>Compare with other groups</h2><p>These responses update while your classmates work. They are read-only here.</p><div class="collab-group-grid">${others.map(readGroup).join('')}</div></div>` : ''}`;
      $('#copyGroupCode').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(auth.secret); status('Group code copied.'); }
        catch { status('Copy the group code shown above.'); }
      });
      $('#addFactor').addEventListener('click', async () => {
        const id = crypto.randomUUID();
        try { status('Adding factor…'); current = await api('/classrooms/' + auth.room + '/factors/' + id, 'PUT', { name: 'New factor', direction: 'uncertain', reason: '', spatial: '' }); renderDashboard(); $('[data-factor="' + id + '"] [data-field="name"]').select(); status('Factor added. Edit its name and sign.'); }
        catch (error) { status(error.message, true); }
      });
    }
  }
  function scheduleSave(target) {
    const key = target.closest('.collab-factor')?.dataset.factor || 'spatial-note';
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key, setTimeout(async () => {
      if (!auth || auth.role !== 'student') return;
      try {
        pending++;
        status('Saving…');
        if (target.closest('.collab-factor')) {
          const row = target.closest('.collab-factor'), id = row.dataset.factor;
          const payload = Object.fromEntries(['name', 'direction', 'reason', 'spatial'].map(key => [key, row.querySelector('[data-field="' + key + '"]').value]));
          if (!payload.name.trim()) { status('Add a factor name before saving.', true); return; }
          current = await api('/classrooms/' + auth.room + '/factors/' + id, 'PUT', payload);
        } else if (target.id === 'spatialNote') {
          current = await api('/classrooms/' + auth.room + '/spatial-note', 'PUT', { text: target.value });
        }
        status('Saved · group members and your instructor can see this update.');
      } catch (error) { status(error.message, true); }
      finally { pending--; saveTimers.delete(key); }
    }, 700));
  }
  root.addEventListener('input', event => { if (event.target.closest('.collab-editor')) scheduleSave(event.target); });
  root.addEventListener('change', event => { if (event.target.closest('.collab-editor')) scheduleSave(event.target); });
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete]');
    if (!button || !auth || auth.role !== 'student') return;
    clearTimeout(saveTimers.get(button.dataset.delete));
    saveTimers.delete(button.dataset.delete);
    try { status('Removing factor…'); current = await api('/classrooms/' + auth.room + '/factors/' + button.dataset.delete, 'DELETE'); renderDashboard(); status('Factor removed.'); }
    catch (error) { status(error.message, true); }
  });
  root.addEventListener('focusout', () => setTimeout(() => { if (!pending) renderDashboard(); }, 1100));
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!auth || pending) return;
      try { current = await api('/classrooms/' + auth.room); renderDashboard(); }
      catch (error) { status('Connection interrupted: ' + error.message, true); }
    }, 2200);
  }
  renderWelcome();
  if (roomFromUrl) {
    const teacher = localStorage.getItem(teacherStore(roomFromUrl));
    const group = sessionStorage.getItem(groupStore(roomFromUrl));
    const secret = params.get('mode') === 'teacher' ? teacher : group || teacher;
    if (secret) {
      api('/classrooms/' + roomFromUrl, 'GET', undefined, secret).then(snapshot => {
        auth = { room: roomFromUrl, secret, role: snapshot.role };
        current = snapshot; renderDashboard(); startPolling(); status('Connected · responses refresh about every 2 seconds.');
      }).catch(() => { status('Enter your code to reconnect.'); });
    }
  }
})();
