/* Módulo de rastreamento. Compatível com os registros legados do OS Fiscal Bot.
   Sem credenciais configuradas, opera apenas no navegador atual. */
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('panel-tracking')) return;
  const statusNames = { waiting: 'Aguardando recebimento', received: 'Recebida', progress: 'Em execução', done: 'Concluída' };
  const statusClasses = { waiting: 'waiting', received: 'received', progress: 'progress', done: 'done' };
  const cfg = () => window.OSF_CONFIG || {};
  const cloudConfigured = () => Boolean(cfg().supabaseUrl && cfg().supabaseAnonKey && !cfg().supabaseUrl.includes('COLE_') && window.osfiscalSupabase);
  const client = () => window.osfiscalSupabase;
  let currentRole = 'manager';
  let cloudSyncing = false;
  let currentQrOrder = null;

  function ensureTrackingData() {
    if (!Array.isArray(data.trackingEvents)) data.trackingEvents = [];
    data.orders.forEach(order => {
      if (!order.trackingStatus) order.trackingStatus = order.trackingDone ? 'done' : 'waiting';
      if (!order.trackingToken) order.trackingToken = makeId() + makeId();
    });
  }
  function statusOf(order) {
    if (order.trackingStatus === 'done') return 'done';
    if (order.trackingStatus === 'progress') return 'progress';
    if (order.trackingStatus === 'received') return 'received';
    return 'waiting';
  }
  function isLate(order) {
    return statusOf(order) !== 'done' && order.date && order.date < today();
  }
  function orderCode(order) { return order.trackingCode || `OS-${String(order.date || today()).replaceAll('-', '')}-${String(order.id).slice(-5).toUpperCase()}`; }
  function orderLink(order) {
    const base = cfg().appUrl && !cfg().appUrl.includes('COLE_') ? cfg().appUrl : (location.protocol === 'file:' ? '' : location.origin + location.pathname);
    return base ? `${base}?os=${encodeURIComponent(order.id)}` : `OS:${order.id}`;
  }
  function eventLog(order, action, detail = '') {
    ensureTrackingData();
    const evt = { id: makeId(), orderId: order.id, employeeId: order.employeeId, action, detail, at: new Date().toISOString(), actor: window.osfiscalUser?.email || 'Operador local' };
    data.trackingEvents.unshift(evt);
    if (data.trackingEvents.length > 5000) data.trackingEvents.length = 5000;
    if (typeof logActivity === 'function') logActivity(`Rastreamento ${orderCode(order)}: ${action}${detail ? ' — ' + detail : ''}`);
    originalSave();
    render();
    if (cloudConfigured() && currentRole !== 'employee') syncEvent(evt).catch(err => console.warn('Não foi possível sincronizar evento:', err));
    notifyLocal(order, action);
    sendWhatsAppAlert(order, action).catch(err => console.warn('Alerta WhatsApp:', err));
  }
  const originalSave = typeof saveData === 'function' ? saveData : () => true;
  // Intercepta salvamentos do código legado sem substituir sua lógica de armazenamento.
  if (!window.__osFiscalTrackingSaveWrapped) {
    window.__osFiscalTrackingSaveWrapped = true;
    window.saveData = function(...args) {
      ensureTrackingData();
      const result = originalSave.apply(this, args);
      if (cloudConfigured() && !cloudSyncing) syncLocalToCloud().catch(err => console.warn('Sincronização pendente:', err));
      return result;
    };
  }
  function notifyLocal(order, action) {
    const message = `${orderCode(order)} — ${action}. ${employeeName(order.employeeId)}.`;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('OS Fiscal Bot', { body: message }); } catch (_) {}
    }
  }
  async function sendWhatsAppAlert(order, action) {
    const phone = normalizeBrazilPhone(getEmployee(order.employeeId)?.phone || '');
    const message = `Campos e Filhos — ${orderCode(order)}\nFuncionário: ${employeeName(order.employeeId)}\nServiço: ${order.description}\nAtualização: ${action}\nStatus: ${statusNames[statusOf(order)]}.`;
    if (cfg().whatsappFunctionUrl && !cfg().whatsappFunctionUrl.includes('COLE_') && cloudConfigured()) {
      const { data: sessionData } = await client().auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        const response = await fetch(cfg().whatsappFunctionUrl, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body:JSON.stringify({ orderId:order.id, action, message }) });
        if (!response.ok) throw new Error(`WhatsApp HTTP ${response.status}`);
        return true;
      }
    }
    // Sem função configurada, use o botão WhatsApp para abrir uma mensagem manual.
    return false;
  }
  async function syncEvent(evt) {
    const { error } = await client().from('osfiscal_events').upsert({ id:evt.id, order_legacy_id:evt.orderId, employee_legacy_id:evt.employeeId, action:evt.action, detail:evt.detail, actor:evt.actor, created_at:evt.at });
    if (error) throw error;
  }
  async function syncLocalToCloud() {
    if (!cloudConfigured() || cloudSyncing) return;
    cloudSyncing = true;
    try {
      if (currentRole === 'employee') {
        const { data: cloudOrders, error: orderErr } = await client().from('osfiscal_orders').select('legacy_id,employee_legacy_id,status,tracking_token,legacy_payload,updated_at');
        if (orderErr) throw orderErr;
        const { data: cloudEmployees, error: empErr } = await client().from('osfiscal_employees').select('legacy_id,name,role_name,phone,active');
        if (empErr) throw empErr;
        for (const ce of (cloudEmployees || [])) {
          const idx = data.employees.findIndex(e => String(e.id) === String(ce.legacy_id));
          const mapped = { id:ce.legacy_id, name:ce.name, role:ce.role_name||'', phone:ce.phone||'', active:ce.active };
          if (idx >= 0) data.employees[idx] = {...data.employees[idx], ...mapped}; else data.employees.push(mapped);
        }
        for (const co of (cloudOrders || [])) {
          const mapped = co.legacy_payload && Object.keys(co.legacy_payload).length ? {...co.legacy_payload} : { id:co.legacy_id, employeeId:co.employee_legacy_id, date:today(), description:'OS sincronizada', createdAt:co.updated_at };
          mapped.id = co.legacy_id; mapped.employeeId = co.employee_legacy_id; mapped.trackingStatus = co.status; mapped.trackingToken = co.tracking_token; mapped.trackingUpdatedAt = co.updated_at;
          const idx = data.orders.findIndex(o => String(o.id) === String(co.legacy_id));
          if (idx >= 0) data.orders[idx] = {...data.orders[idx], ...mapped}; else data.orders.push(mapped);
        }
        const { data: cloudEvents, error: eventErr } = await client().from('osfiscal_events').select('id,order_legacy_id,employee_legacy_id,action,detail,actor,created_at').order('created_at',{ascending:false}).limit(500);
        if (eventErr) throw eventErr;
        data.trackingEvents = (cloudEvents||[]).map(e=>({id:e.id,orderId:e.order_legacy_id,employeeId:e.employee_legacy_id,action:e.action,detail:e.detail,actor:e.actor,at:e.created_at}));
        originalSave(); render();
        $('trackingConnectionNotice').textContent = 'Conectado à base compartilhada. Exibindo somente as OS atribuídas ao seu usuário.';
        return;
      }
      
      // 1. Buscar primeiro os registros já existentes na nuvem.
      const { data: cloudEmployees, error: empReadErr } = await client()
        .from('osfiscal_employees')
        .select('legacy_id,name,role_name,phone,active');

      if (empReadErr) throw empReadErr;

      const { data: cloudOrders, error: orderReadErr } = await client()
        .from('osfiscal_orders')
        .select('legacy_id,employee_legacy_id,code,service_date,description,location,notes,status,tracking_token,due_date,signed,before_photo,after_photo,legacy_payload,updated_at');

      if (orderReadErr) throw orderReadErr;

      // 2. Incorporar os funcionários da nuvem aos dados locais.
      for (const ce of (cloudEmployees || [])) {
        const idx = data.employees.findIndex(
          e => String(e.id) === String(ce.legacy_id)
        );

        const mapped = {
          id: ce.legacy_id,
          name: ce.name || 'Sem nome',
          role: ce.role_name || '',
          phone: ce.phone || '',
          active: ce.active
        };

        if (idx >= 0) {
          data.employees[idx] = { ...data.employees[idx], ...mapped };
        } else {
          data.employees.push(mapped);
        }
      }

      // 3. Incorporar as OS da nuvem, sem duplicar identificadores.
      for (const co of (cloudOrders || [])) {
        const payload =
          co.legacy_payload &&
          typeof co.legacy_payload === 'object'
            ? co.legacy_payload
            : {};

        const mapped = {
          ...payload,
          id: co.legacy_id,
          employeeId: co.employee_legacy_id,
          trackingCode: payload.trackingCode || co.code || '',
          date: payload.date || co.service_date || today(),
          description:
            payload.description || co.description || 'OS sincronizada',
          location: payload.location || co.location || '',
          notes: payload.notes || co.notes || '',
          trackingStatus: co.status || payload.trackingStatus || 'waiting',
          trackingToken:
            co.tracking_token ||
            payload.trackingToken ||
            (makeId() + makeId()),
          trackingUpdatedAt: co.updated_at || payload.trackingUpdatedAt || null,
          dueDate: co.due_date || payload.dueDate || co.service_date || null,
          signed: co.signed ?? Boolean(payload.signed),
          before: co.before_photo ?? Boolean(payload.before),
          after: co.after_photo ?? Boolean(payload.after)
        };

        const idx = data.orders.findIndex(
          o => String(o.id) === String(co.legacy_id)
        );

        if (idx >= 0) {
          data.orders[idx] = { ...data.orders[idx], ...mapped };
        } else {
          data.orders.push(mapped);
        }
      }

      // 4. Enviar funcionários locais e recuperados para a nuvem.
      const employees = data.employees.map(e => ({
        legacy_id: String(e.id),
        name: e.name || 'Sem nome',
        role_name: e.role || '',
        phone: e.phone || '',
        active: Boolean(e.active)
      }));

      if (employees.length) {
        const { error } = await client()
          .from('osfiscal_employees')
          .upsert(employees, { onConflict: 'legacy_id' });

        if (error) throw error;
      }

      // 5. Enviar as OS mescladas, sem duplicar IDs.
      const orders = data.orders.map(o => ({
        legacy_id: String(o.id),
        employee_legacy_id: String(o.employeeId),
        code: orderCode(o),
        service_date: o.date,
        description: o.description || '',
        location: o.location || '',
        notes: o.notes || '',
        status: statusOf(o),
        tracking_token: o.trackingToken,
        due_date: o.dueDate || o.date || null,
        signed: Boolean(o.signed),
        before_photo: Boolean(o.before),
        after_photo: Boolean(o.after),
        legacy_payload: o
      }));

      if (orders.length) {
        const { error } = await client()
          .from('osfiscal_orders')
          .upsert(orders, { onConflict: 'legacy_id' });

        if (error) throw error;
      }

      // 6. Atualizar o histórico de movimentações.
      const { data: evts, error: evErr } = await client()
        .from('osfiscal_events')
        .select('id,order_legacy_id,employee_legacy_id,action,detail,actor,created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (evErr) throw evErr;

      if (Array.isArray(evts)) {
        data.trackingEvents = evts.map(e => ({
          id: e.id,
          orderId: e.order_legacy_id,
          employeeId: e.employee_legacy_id,
          action: e.action,
          detail: e.detail,
          actor: e.actor,
          at: e.created_at
        }));
      }

      ensureTrackingData();
      originalSave();
      render();

      $('trackingConnectionNotice').textContent =
        `Conectado à base compartilhada. Sincronização concluída: ${(cloudOrders || []).length} OS recuperadas da nuvem; ${data.orders.length} OS disponíveis no painel.`;
           
  }
  function getQrUrl(order) { return orderLink(order); }
  function showQr(order) {
    currentQrOrder = order;
    const wrap = $('trackingQrResult'); wrap.classList.remove('hidden');
    wrap.innerHTML = `<div id="trackingQrCanvas" aria-label="QR Code da ordem"></div><div class="tracking-qr-copy"><h3>${escapeHTML(orderCode(order))}</h3><p>${escapeHTML(order.description || '')}</p><p>Responsável: ${escapeHTML(employeeName(order.employeeId))}</p><p class="notice">O QR Code abre esta OS no aplicativo. O funcionário precisa autenticar-se para registrar movimentações.</p><p><code>${escapeHTML(getQrUrl(order))}</code></p><div class="tracking-actions"><button type="button" id="copyTrackingLink">Copiar link</button><button type="button" id="shareTrackingLink">Compartilhar</button><button type="button" id="printTrackingQr">Imprimir QR para anexar à OS</button></div></div>`;
    if (window.QRCode) new QRCode($('trackingQrCanvas'), { text:getQrUrl(order), width:160, height:160, correctLevel:QRCode.CorrectLevel.M });
    else $('trackingQrCanvas').textContent = 'Biblioteca QR indisponível';
    $('copyTrackingLink').onclick = () => navigator.clipboard?.writeText(getQrUrl(order)).then(()=>showToast('Link copiado.'));
    $('shareTrackingLink').onclick = async () => { try { if (navigator.share) await navigator.share({title:orderCode(order),text:`Acompanhe ${orderCode(order)}`,url:getQrUrl(order)}); else { await navigator.clipboard.writeText(getQrUrl(order)); showToast('Link copiado.'); } } catch (_) {} };
    $('printTrackingQr').onclick = () => { const qrNode=$('trackingQrCanvas'); const qrImg=qrNode.querySelector('img'); const qrCanvas=qrNode.querySelector('canvas'); const qrSrc=qrImg?.src || (qrCanvas ? qrCanvas.toDataURL('image/png') : ''); const w = window.open('', '_blank'); if (!w) return showToast('Permita a abertura da janela para imprimir.'); w.document.write(`<html><head><title>${escapeHTML(orderCode(order))}</title><style>body{font-family:Arial;text-align:center;padding:25px}img{width:220px;height:220px}h2{margin:8px}</style></head><body><h2>${escapeHTML(orderCode(order))}</h2><p>${escapeHTML(order.description)}</p><div><img src="${qrSrc}" alt="QR Code"></div><p>Escaneie para confirmar e acompanhar a OS</p></body></html>`); w.document.close(); w.focus(); w.print(); };
    wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function render() {
    ensureTrackingData();
    const query = ($('trackingSearch').value || '').toLowerCase().trim();
    const filter = $('trackingStatusFilter').value;
    const orders = [...data.orders].filter(o => currentRole !== 'employee' || String(o.employeeId) === String(window.osfiscalProfile?.employee_legacy_id || '')).filter(o => `${orderCode(o)} ${employeeName(o.employeeId)} ${o.description} ${o.location||''}`.toLowerCase().includes(query)).filter(o => filter === 'all' || (filter === 'late' ? isLate(o) : statusOf(o) === filter)).sort((a,b)=>(isLate(b)?1:0)-(isLate(a)?1:0) || String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    $('trackWaiting').textContent = data.orders.filter(o=>statusOf(o)==='waiting').length;
    $('trackProgress').textContent = data.orders.filter(o=>['received','progress'].includes(statusOf(o))).length;
    $('trackDone').textContent = data.orders.filter(o=>statusOf(o)==='done').length;
    $('trackLate').textContent = data.orders.filter(isLate).length;
    $('trackingList').innerHTML = orders.length ? orders.map(o => {
      const st = statusOf(o); const late = isLate(o);
      const allowed = currentRole !== 'employee' || String(o.employeeId) === String(window.osfiscalProfile?.employee_legacy_id || '');
      return `<article class="order-card tracking-card"><div class="card-top"><div><h3>${escapeHTML(orderCode(o))}</h3><p class="card-subtitle">${escapeHTML(employeeName(o.employeeId))} · ${escapeHTML(formatDate(o.date))}</p></div><span class="tracking-status ${late?'late':statusClasses[st]}">${late?'Atrasada':statusNames[st]}</span></div><p class="card-description">${escapeHTML(o.description)}</p>${o.location?`<p class="card-subtitle">Local: ${escapeHTML(o.location)}</p>`:''}<p class="card-subtitle">Última atualização: ${escapeHTML(o.trackingUpdatedAt ? formatDateTime(o.trackingUpdatedAt) : 'Ainda sem movimentação')}</p><div class="tracking-actions"><button type="button" data-track-qr="${escapeHTML(o.id)}">Gerar QR / imprimir</button><button type="button" data-track-status="received" data-track-id="${escapeHTML(o.id)}" ${!allowed||st!=='waiting'?'disabled':''}>Confirmar recebimento</button><button type="button" data-track-status="progress" data-track-id="${escapeHTML(o.id)}" ${!allowed||!['received','progress'].includes(st)?'disabled':''}>Iniciar serviço</button><button class="primary" type="button" data-track-status="done" data-track-id="${escapeHTML(o.id)}" ${!allowed||!['received','progress'].includes(st)?'disabled':''}>Concluir OS</button><button type="button" data-track-whatsapp="${escapeHTML(o.id)}">WhatsApp</button></div></article>`;
    }).join('') : '<div class="empty-state"><strong>Nenhuma OS encontrada</strong>Cadastre uma ordem na seção Ordens de serviço.</div>';
    const evts = (data.trackingEvents || []).slice(0,40);
    $('trackingHistory').innerHTML = evts.length ? evts.map(e=>`<div class="tracking-event"><strong>${escapeHTML(e.action)} · ${escapeHTML(data.orders.find(o=>String(o.id)===String(e.orderId)) ? orderCode(data.orders.find(o=>String(o.id)===String(e.orderId))) : String(e.orderId||'OS'))}</strong><small>${escapeHTML(e.actor||'Operador')} · ${escapeHTML(formatDateTime(e.at))}${e.detail?' · '+escapeHTML(e.detail):''}</small></div>`).join('') : '<p class="muted">Ainda não há movimentações registradas.</p>';
  }
  async function changeStatus(order, next) {
    const before = statusOf(order);
    if (before === next) return;
    if (next === 'received' && before !== 'waiting') return;
    if (next === 'progress' && !['received','progress'].includes(before)) return;
    if (next === 'done' && !['received','progress'].includes(before)) return;
    if (currentRole === 'employee' && String(order.employeeId) !== String(window.osfiscalProfile?.employee_legacy_id || '')) return showToast('Esta OS não está vinculada ao seu usuário.');
    const action = ({received:'Recebimento confirmado',progress:'Serviço iniciado',done:'OS concluída'})[next];
    if (cloudConfigured() && currentRole === 'employee') {
      const { error } = await client().rpc('employee_update_order_status', { p_order_legacy_id:String(order.id), p_status:next });
      if (error) return showToast('Não foi possível atualizar no servidor: '+error.message);
    }
    order.trackingStatus = next; order.trackingUpdatedAt = new Date().toISOString();
    if (next === 'received') order.receivedAt = order.trackingUpdatedAt;
    if (next === 'progress') order.startedAt = order.trackingUpdatedAt;
    if (next === 'done') order.completedAt = order.trackingUpdatedAt;
    eventLog(order, action);
    if (cloudConfigured() && currentRole !== 'employee') {
      try { await client().from('osfiscal_orders').update({status:next, legacy_payload:order}).eq('legacy_id',String(order.id)); } catch (err) { console.warn(err); }
    }
    showToast(`${orderCode(order)}: ${action.toLowerCase()}.`);
  }
  $('trackingList').addEventListener('click', async e => {
    const qr = e.target.closest('[data-track-qr]'); if (qr) { const o=data.orders.find(x=>String(x.id)===qr.dataset.trackQr); if(o) showQr(o); return; }
    const status = e.target.closest('[data-track-status]'); if (status) { const o=data.orders.find(x=>String(x.id)===status.dataset.trackId); if(o) await changeStatus(o,status.dataset.trackStatus); return; }
    const wa = e.target.closest('[data-track-whatsapp]'); if (wa) { const o=data.orders.find(x=>String(x.id)===wa.dataset.trackWhatsapp); if(o){ try { const sent=await sendWhatsAppAlert(o,'Atualização solicitada'); if(sent){ showToast('Alerta enviado pelo provedor WhatsApp.'); return; } } catch(err) { console.warn(err); } const phone=normalizeBrazilPhone(getEmployee(o.employeeId)?.phone||''); if(phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Campos e Filhos — ${orderCode(o)}\n${o.description}\nStatus: ${statusNames[statusOf(o)]}`)}`,'_blank','noopener'); else showToast('Cadastre o telefone do funcionário para abrir o WhatsApp.'); } }
  });
  $('trackingSearch').addEventListener('input',render);
  $('trackingStatusFilter').addEventListener('change',render);
  $('refreshTracking').addEventListener('click',async()=>{try{if(cloudConfigured())await syncLocalToCloud();render();showToast('Rastreamento atualizado.')}catch(e){showToast('Falha ao atualizar: '+e.message)}});
  $('trackingLookupForm').addEventListener('submit', e => {
    e.preventDefault(); const raw=$('trackingLookup').value.trim(); let id=raw;
    try { const u=new URL(raw); id=u.searchParams.get('os')||raw; } catch(_) { id=raw.replace(/^OS:/i,''); }
    const order=data.orders.find(o=>String(o.id)===id || orderCode(o).toLowerCase()===id.toLowerCase() || String(o.trackingToken)===id);
    if(order) { showQr(order); const card=[...$('trackingList').querySelectorAll('[data-track-qr]')].find(b=>b.dataset.trackQr===String(order.id)); if(card) card.scrollIntoView({behavior:'smooth',block:'center'}); }
    else showToast('OS não encontrada neste aparelho. Se estiver usando outro celular, configure a base compartilhada e entre com sua conta.');
  });
  document.querySelectorAll('.tab[data-tab="tracking"], [data-goto="tracking"]').forEach(el=>el.addEventListener('click',render));
  window.OSFiscalTracking = {
    render,
    getQrUrl(orderId) {
      const order = data.orders.find(item => String(item.id) === String(orderId));
      return order ? getQrUrl(order) : `OS:${orderId}`;
    },
    async onLogin() {
      if (!cloudConfigured()) { currentRole='manager'; $('trackingConnectionNotice').textContent='Modo local: os dados continuam neste navegador. Configure config.js e o SQL do Supabase para compartilhar entre aparelhos.'; render(); return; }
      
const c = client();
const { data: authData, error: authError } = await c.auth.getUser();

if (authError || !authData?.user?.id) {
  $('trackingConnectionNotice').textContent =
    'Não foi possível identificar a sessão autenticada. Entre novamente.';
  render();
  return;
}

const { data: profile, error } = await c
  .from('osfiscal_profiles')
  .select('role,employee_legacy_id,display_name')
  .eq('id', authData.user.id)
  .single();
  
      if(error) { $('trackingConnectionNotice').textContent='Login online ativo, mas falta configurar seu perfil em osfiscal_profiles no Supabase.'; currentRole='employee'; render(); return; }
      window.osfiscalProfile=profile; currentRole=profile.role || 'employee';
      $('trackingConnectionNotice').textContent=`Conectado à base compartilhada · Perfil: ${currentRole}.`;
      try { await syncLocalToCloud(); } catch(err) { $('trackingConnectionNotice').textContent='Conectado, mas a sincronização encontrou um erro: '+err.message; }
      // Deep-link via QR: abrir a OS correspondente depois do login.
      const requested=new URLSearchParams(location.search).get('os');
      if(requested) { const o=data.orders.find(x=>String(x.id)===requested || String(x.trackingToken)===requested); if(o) showQr(o); }
      render();
    }
  };
  ensureTrackingData(); originalSave(); render();
  const qrId = new URLSearchParams(location.search).get('os');
  if (qrId) { const o=data.orders.find(x=>String(x.id)===qrId || String(x.trackingToken)===qrId); if(o) { document.querySelector('.tab[data-tab="tracking"]')?.click(); showQr(o); } }
})();
