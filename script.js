
"use strict";

/*
 * OS Fiscal Bot — Campos e Filhos
 * Versão local para SPCK / GitHub Pages.
 * Os dados ficam no navegador deste aparelho.
 * WhatsApp: apenas prepara mensagens para envio manual.
 */

const STORAGE_KEY = "osFiscalBot_v2";
const MAX_FILE_SIZE = 1 * 1024 * 1024;
const MAX_TOTAL_FILES = 3 * 1024 * 1024;

const $ = (id) => document.getElementById(id);

const emptyData = () => ({
  employees: [],
  orders: [],
  attachments: [],
  activity: [],
  schedule: {}
});

let data = loadData();
let toastTimer;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();

    const saved = JSON.parse(raw);
    return {
      ...emptyData(),
      ...saved,
      employees: Array.isArray(saved.employees) ? saved.employees : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
      attachments: Array.isArray(saved.attachments) ? saved.attachments : [],
      activity: Array.isArray(saved.activity) ? saved.activity : [],
      schedule: saved.schedule || {}
    };
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    alert("Não foi possível ler os dados locais. Evite limpar o armazenamento do navegador.");
    return emptyData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
    showToast("Armazenamento insuficiente. Exclua anexos ou exporte um backup.");
    return false;
  }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function today() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function logActivity(message) {
  data.activity.unshift({
    id: makeId(),
    message,
    createdAt: new Date().toISOString()
  });

  data.activity = data.activity.slice(0, 200);
}

function persistAndRender(message) {
  if (!saveData()) return false;
  renderAll();
  if (message) showToast(message);
  return true;
}

function getEmployee(id) {
  return data.employees.find((item) => item.id === id);
}

function getOrder(id) {
  return data.orders.find((item) => item.id === id);
}

function getOrderAttachments(orderId) {
  return data.attachments.filter((item) => item.orderId === orderId);
}

function employeeName(id) {
  return getEmployee(id)?.name || "Funcionário arquivado ou não encontrado";
}

function orderIsComplete(order) {
  return Boolean(order.signed && order.before && order.after);
}

function orderStatus(order) {
  return orderIsComplete(order) ? "Completa" : "Pendente";
}

function statusPill(order) {
  return orderIsComplete(order)
    ? '<span class="pill success">Completa</span>'
    : '<span class="pill warning">Pendente</span>';
}

function emptyState(title, description) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(description)}</div>`;
}

function openTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateEmployeeSelects() {
  const activeEmployees = data.employees.filter((item) => item.active);

  const employeeOptions = activeEmployees.map((item) =>
    `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} — ${escapeHTML(item.role)}</option>`
  ).join("");

  const currentEmployee = $("orderEmployee").value;

  $("orderEmployee").innerHTML =
    '<option value="">Selecione um funcionário</option>' + employeeOptions;

  if (activeEmployees.some((item) => item.id === currentEmployee)) {
    $("orderEmployee").value = currentEmployee;
  }

  const currentAttachmentOrder = $("attachmentOrder").value;
  const orderOptions = [...data.orders]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((item) =>
      `<option value="${escapeHTML(item.id)}">${escapeHTML(formatDate(item.date))} — ${escapeHTML(employeeName(item.employeeId))}</option>`
    ).join("");

  $("attachmentOrder").innerHTML =
    '<option value="">Selecione uma OS</option>' + orderOptions;

  if (data.orders.some((item) => item.id === currentAttachmentOrder)) {
    $("attachmentOrder").value = currentAttachmentOrder;
  }
}

function renderDashboard() {
  const activeEmployees = data.employees.filter((item) => item.active).length;
  const todaysOrders = data.orders.filter((item) => item.date === today());
  const completeOrders = data.orders.filter(orderIsComplete).length;

  $("statEmployees").textContent = activeEmployees;
  $("statToday").textContent = todaysOrders.length;
  $("statPending").textContent = data.orders.length - completeOrders;
  $("statComplete").textContent = completeOrders;

  const recent = [...data.orders]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 5);

  $("recentOrders").innerHTML = recent.length
    ? `<table>
        <thead><tr><th>Data</th><th>Funcionário</th><th>Situação</th><th></th></tr></thead>
        <tbody>${recent.map((order) => `
          <tr>
            <td>${escapeHTML(formatDate(order.date))}</td>
            <td>${escapeHTML(employeeName(order.employeeId))}</td>
            <td>${statusPill(order)}</td>
            <td><button class="table-action" data-edit-order="${escapeHTML(order.id)}">Abrir</button></td>
          </tr>`).join("")}
        </tbody>
      </table>`
    : emptyState("Nenhuma OS cadastrada", "Crie uma ordem de serviço para começar.");
}

function renderEmployees() {
  const query = $("employeeSearch").value.trim().toLowerCase();
  const filter = $("employeeFilter").value;

  const employees = data.employees.filter((employee) => {
    const matchesQuery = [
      employee.name, employee.phone, employee.role,
      employee.location, employee.notes
    ].join(" ").toLowerCase().includes(query);

    const matchesFilter =
      filter === "all" ||
      (filter === "active" && employee.active) ||
      (filter === "archived" && !employee.active);

    return matchesQuery && matchesFilter;
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  $("employeeList").innerHTML = employees.length
    ? employees.map((employee) => {
      const orderCount = data.orders.filter((order) =>
        order.employeeId === employee.id
      ).length;

      return `
        <article class="employee-card">
          <div class="card-top">
            <div>
              <h3>${escapeHTML(employee.name)}</h3>
              <p class="card-subtitle">${escapeHTML(employee.role)}</p>
            </div>
            <span class="pill ${employee.active ? "success" : "muted"}">
              ${employee.active ? "Ativo" : "Arquivado"}
            </span>
          </div>
          <div class="card-meta">
            <span class="pill">${orderCount} OS</span>
            ${employee.phone ? `<span class="pill">${escapeHTML(employee.phone)}</span>` : ""}
          </div>
          ${employee.location ? `<p class="card-description">Local: ${escapeHTML(employee.location)}</p>` : ""}
          ${employee.notes ? `<p class="card-description">${escapeHTML(employee.notes)}</p>` : ""}
          <div class="card-actions">
            <button data-edit-employee="${escapeHTML(employee.id)}">Editar</button>
            ${employee.active ? `
              <button data-employee-message="${escapeHTML(employee.id)}">WhatsApp</button>
              <button data-new-order-employee="${escapeHTML(employee.id)}">Nova OS</button>
              <button class="danger" data-archive-employee="${escapeHTML(employee.id)}">Arquivar</button>
            ` : `
              <button data-restore-employee="${escapeHTML(employee.id)}">Reativar</button>
            `}
          </div>
        </article>`;
    }).join("")
    : emptyState("Nenhum funcionário encontrado", "Altere os filtros ou cadastre um funcionário.");
}

function renderOrders() {
  const query = $("orderSearch").value.trim().toLowerCase();
  const filter = $("orderStatusFilter").value;
  const dateFilter = $("orderDateFilter").value;

  const orders = [...data.orders].filter((order) => {
    const employee = getEmployee(order.employeeId);
    const searchText = [
      employee?.name, order.description, order.location, order.notes,
      order.date, order.id
    ].join(" ").toLowerCase();

    const complete = orderIsComplete(order);

    return searchText.includes(query) &&
      (filter === "all" ||
        (filter === "complete" && complete) ||
        (filter === "pending" && !complete)) &&
      (!dateFilter || order.date === dateFilter);
  }).sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare || (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  $("orderList").innerHTML = orders.length
    ? orders.map((order) => {
      const attachments = getOrderAttachments(order.id);

      return `
        <article class="order-card">
          <div class="card-top">
            <div>
              <h3>OS · ${escapeHTML(formatDate(order.date))}</h3>
              <p class="card-subtitle">${escapeHTML(employeeName(order.employeeId))}</p>
            </div>
            ${statusPill(order)}
          </div>
          <p class="card-description">${escapeHTML(order.description)}</p>
          ${order.location ? `<p class="card-subtitle">Local: ${escapeHTML(order.location)}</p>` : ""}
          <div class="card-meta">
            <span class="pill ${order.signed ? "success" : "warning"}">${order.signed ? "Assinada/conferida" : "Sem conferência"}</span>
            <span class="pill ${order.before ? "success" : "warning"}">${order.before ? "Antes ✓" : "Antes pendente"}</span>
            <span class="pill ${order.after ? "success" : "warning"}">${order.after ? "Depois ✓" : "Depois pendente"}</span>
            <span class="pill">${attachments.length} anexo(s)</span>
          </div>
          ${order.notes ? `<p class="card-description">Observações: ${escapeHTML(order.notes)}</p>` : ""}
          <div class="card-actions">
            <button data-edit-order="${escapeHTML(order.id)}">Editar OS</button>
            <button data-print-order="${escapeHTML(order.id)}">Imprimir OS + QR</button>
            <button data-attach-order="${escapeHTML(order.id)}">Adicionar anexo</button>
            <button data-order-message="${escapeHTML(order.id)}">WhatsApp</button>
            <button class="danger" data-delete-order="${escapeHTML(order.id)}">Excluir OS</button>
          </div>
        </article>`;
    }).join("")
    : emptyState("Nenhuma OS encontrada", "Cadastre uma OS ou ajuste os filtros.");
}

function renderAttachments() {
  const query = $("attachmentSearch").value.trim().toLowerCase();

  const attachments = [...data.attachments].filter((attachment) => {
    const order = getOrder(attachment.orderId);
    const searchable = [
      attachment.name, attachment.type, order?.description,
      order?.date, employeeName(order?.employeeId)
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const typeLabels = {
    before: "Foto do antes",
    after: "Foto do depois",
    document: "Documento / outro"
  };

  $("attachmentList").innerHTML = attachments.length
    ? attachments.map((attachment) => {
      const isImage = attachment.mime?.startsWith("image/");
      const isPdf = attachment.mime === "application/pdf";

      return `
        <article class="attachment-card">
          <div class="card-top">
            <div>
              <h3>${escapeHTML(attachment.name)}</h3>
              <p class="card-subtitle">${escapeHTML(typeLabels[attachment.type] || "Anexo")}</p>
            </div>
            <span class="pill">${(attachment.size / 1024).toFixed(0)} KB</span>
          </div>
          ${isImage
            ? `<img class="attachment-preview" src="${escapeHTML(attachment.dataUrl)}" alt="${escapeHTML(attachment.name)}" loading="lazy">`
            : `<div class="file-symbol">${isPdf ? "PDF" : "ARQ"}</div>`}
          <p class="card-description">OS de ${escapeHTML(employeeName(getOrder(attachment.orderId)?.employeeId))}</p>
          <p class="card-subtitle">Adicionado em ${escapeHTML(formatDateTime(attachment.createdAt))}</p>
          <div class="card-actions">
            <button data-open-attachment="${escapeHTML(attachment.id)}">Abrir arquivo</button>
            <button class="danger" data-delete-attachment="${escapeHTML(attachment.id)}">Excluir anexo</button>
          </div>
        </article>`;
    }).join("")
    : emptyState("Nenhum anexo encontrado", "Selecione uma OS e adicione uma foto ou documento.");
}

function renderActivity() {
  $("activityList").innerHTML = data.activity.length
    ? data.activity.map((item) => `
      <div class="activity-item">
        <strong>${escapeHTML(item.message)}</strong>
        <time>${escapeHTML(formatDateTime(item.createdAt))}</time>
      </div>
    `).join("")
    : emptyState("Sem atividades registradas", "As ações realizadas aparecerão aqui.");
}

function renderAll() {
  updateEmployeeSelects();
  renderDashboard();
  renderEmployees();
  renderOrders();
  renderAttachments();
  renderActivity();
}

/* Navegação entre abas */

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => openTab(tab.dataset.tab));
});

document.querySelectorAll("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => openTab(button.dataset.goto));
});

$("newOrderTop").addEventListener("click", () => openOrderForm());
$("newOrder").addEventListener("click", () => openOrderForm());
$("newEmployee").addEventListener("click", () => openEmployeeForm());

/* Cadastro e edição de funcionários */

function openEmployeeForm(employee = null) {
  $("employeeForm").classList.remove("hidden");
  $("employeeFormTitle").textContent = employee ? "Editar funcionário" : "Novo funcionário";
  $("employeeId").value = employee?.id || "";
  $("employeeName").value = employee?.name || "";
  $("employeePhone").value = employee?.phone || "";
  $("employeeRole").value = employee?.role || "";
  $("employeeLocation").value = employee?.location || "";
  $("employeeNotes").value = employee?.notes || "";

  openTab("employees");
  $("employeeName").focus();
  $("employeeForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEmployeeForm() {
  $("employeeForm").reset();
  $("employeeId").value = "";
  $("employeeForm").classList.add("hidden");
}

$("cancelEmployee").addEventListener("click", closeEmployeeForm);

$("employeeForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const id = $("employeeId").value;
  const existing = id ? getEmployee(id) : null;

  const employee = {
    id: existing?.id || makeId(),
    name: $("employeeName").value.trim(),
    phone: $("employeePhone").value.trim(),
    role: $("employeeRole").value,
    location: $("employeeLocation").value.trim(),
    notes: $("employeeNotes").value.trim(),
    active: existing ? existing.active : true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!employee.name || !employee.role) {
    showToast("Informe o nome e a função do funcionário.");
    return;
  }

  if (existing) {
    data.employees = data.employees.map((item) => item.id === id ? employee : item);
    logActivity(`Funcionário editado: ${employee.name}`);
  } else {
    data.employees.push(employee);
    logActivity(`Funcionário cadastrado: ${employee.name}`);
  }

  if (persistAndRender(existing ? "Funcionário atualizado." : "Funcionário cadastrado.")) {
    closeEmployeeForm();
    renderAll();
  }
});

$("employeeSearch").addEventListener("input", renderEmployees);
$("employeeFilter").addEventListener("change", renderEmployees);

/* Cadastro e edição de ordens de serviço */

function openOrderForm(order = null, employeeId = "") {
  $("orderForm").classList.remove("hidden");
  $("orderFormTitle").textContent = order ? "Editar ordem de serviço" : "Nova ordem de serviço";
  $("orderId").value = order?.id || "";
  $("orderDate").value = order?.date || today();
  $("orderDescription").value = order?.description || "";
  $("orderLocation").value = order?.location || "";
  $("orderNotes").value = order?.notes || "";
  $("orderSigned").checked = Boolean(order?.signed);
  $("orderBefore").checked = Boolean(order?.before);
  $("orderAfter").checked = Boolean(order?.after);

  updateEmployeeSelects();
  $("orderEmployee").value = order?.employeeId || employeeId || "";

  openTab("orders");
  $("orderForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeOrderForm() {
  $("orderForm").reset();
  $("orderId").value = "";
  $("orderDate").value = today();
  $("orderForm").classList.add("hidden");
}

$("cancelOrder").addEventListener("click", closeOrderForm);

$("orderForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const id = $("orderId").value;
  const existing = id ? getOrder(id) : null;
  const employee = getEmployee($("orderEmployee").value);

  if (!employee || !employee.active) {
    showToast("Selecione um funcionário ativo.");
    return;
  }

  const order = {
    id: existing?.id || makeId(),
    employeeId: employee.id,
    date: $("orderDate").value,
    description: $("orderDescription").value.trim(),
    location: $("orderLocation").value.trim(),
    notes: $("orderNotes").value.trim(),
    signed: $("orderSigned").checked,
    before: $("orderBefore").checked,
    after: $("orderAfter").checked,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!order.date || !order.description) {
    showToast("Preencha a data e a descrição do serviço.");
    return;
  }

  if (existing) {
    data.orders = data.orders.map((item) => item.id === id ? order : item);
    logActivity(`OS atualizada: ${employee.name} — ${formatDate(order.date)}`);
  } else {
    data.orders.push(order);
    logActivity(`OS cadastrada: ${employee.name} — ${formatDate(order.date)}`);
  }

  if (persistAndRender(existing ? "OS atualizada." : "OS cadastrada.")) {
    closeOrderForm();
    renderAll();
  }
});

$("orderSearch").addEventListener("input", renderOrders);
$("orderStatusFilter").addEventListener("change", renderOrders);
$("orderDateFilter").addEventListener("change", renderOrders);

/* Anexos locais */

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function totalAttachmentSize() {
  return data.attachments.reduce((sum, item) => sum + (item.size || 0), 0);
}

$("attachmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const orderId = $("attachmentOrder").value;
  const file = $("attachmentFile").files[0];
  const type = $("attachmentType").value;

  if (!getOrder(orderId)) {
    showToast("Selecione uma ordem de serviço válida.");
    return;
  }

  if (!file) {
    showToast("Selecione um arquivo.");
    return;
  }

  if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
    showToast("Formato não permitido. Use uma imagem ou um PDF.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showToast("O arquivo ultrapassa o limite de 1 MB.");
    return;
  }

  if (totalAttachmentSize() + file.size > MAX_TOTAL_FILES) {
    showToast("O limite total de anexos é 3 MB. Exclua arquivos antigos.");
    return;
  }

  const submitButton = $("attachmentForm").querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Salvando...";

  try {
    const dataUrl = await readFileAsDataURL(file);
    const order = getOrder(orderId);

    const attachment = {
      id: makeId(),
      orderId,
      type,
      name: file.name,
      mime: file.type,
      size: file.size,
      dataUrl,
      createdAt: new Date().toISOString()
    };

    data.attachments.push(attachment);

    // Atualiza os indicadores da OS com base nos anexos cadastrados.
    const related = getOrderAttachments(orderId);
    order.before = related.some((item) => item.type === "before");
    order.after = related.some((item) => item.type === "after");
    order.updatedAt = new Date().toISOString();

    logActivity(`Anexo adicionado à OS de ${employeeName(order.employeeId)}: ${file.name}`);

    if (persistAndRender("Anexo salvo no armazenamento local.")) {
      $("attachmentFile").value = "";
      $("attachmentForm").reset();
      updateEmployeeSelects();
    }
  } catch (error) {
    console.error(error);
    showToast("Não foi possível salvar o anexo.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Salvar anexo";
  }
});

$("attachmentSearch").addEventListener("input", renderAttachments);

/* Impressão completa da OS com QR Code de rastreamento. */
async function printOrderWithQr(orderId) {
  const order = getOrder(orderId);
  if (!order) return showToast("Não foi possível localizar esta OS.");
  if (!window.QRCode) return showToast("A biblioteca do QR Code não carregou. Verifique a conexão e tente novamente.");

  const qrText = window.OSFiscalTracking?.getQrUrl
    ? window.OSFiscalTracking.getQrUrl(order.id)
    : `OS:${order.id}`;
  const temp = document.createElement("div");
  temp.style.cssText = "position:fixed;left:-10000px;top:0;width:220px;height:220px;background:#fff";
  document.body.appendChild(temp);
  try {
    new QRCode(temp, { text: qrText, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    // Aguarda o QR ser desenhado para que ele não saia em branco na impressão.
    let qrSrc = "";
    for (let i = 0; i < 30 && !qrSrc; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const canvas = temp.querySelector("canvas");
      const img = temp.querySelector("img");
      if (canvas) qrSrc = canvas.toDataURL("image/png");
      else if (img?.complete && img.naturalWidth) qrSrc = img.src;
    }
    if (!qrSrc) return showToast("Não foi possível gerar o QR Code. Tente novamente.");

    const employee = getEmployee(order.employeeId);
    const attachments = getOrderAttachments(order.id);
    const safe = value => escapeHTML(value == null || value === "" ? "—" : String(value));
    const w = window.open("", "_blank");
    if (!w) return showToast("Permita a abertura da janela para imprimir a OS.");
    w.document.open();
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ordem de Serviço</title><style>
      *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;margin:0;padding:22px}header{border-bottom:2px solid #173d70;padding-bottom:10px;margin-bottom:16px}h1{font-size:20px;margin:0 0 4px;color:#173d70}h2{font-size:14px;margin:18px 0 8px}p{margin:5px 0;line-height:1.45}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field{border:1px solid #bbb;padding:8px;min-height:34px;overflow-wrap:anywhere}.label{font-size:10px;text-transform:uppercase;color:#555;display:block;margin-bottom:4px}.description{white-space:pre-wrap;min-height:70px}.qr-area{margin:22px auto 0;padding:12px;text-align:center;border:1px solid #aaa;page-break-inside:avoid;break-inside:avoid}.qr-area img{width:150px;height:150px;object-fit:contain;display:block;margin:8px auto}.qr-area p{font-size:10px;overflow-wrap:anywhere}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:38px}.sign{border-top:1px solid #333;text-align:center;padding-top:6px}.muted{color:#444;font-size:10px}@media print{body{padding:10mm}.qr-area,.field,.signatures{break-inside:avoid;page-break-inside:avoid}@page{margin:10mm}}</style></head><body>
      <header><h1>CAMPOS E FILHOS</h1><p>ORDEM DE SERVIÇO · ${safe(order.trackingCode || `OS-${String(order.id).slice(-5).toUpperCase()}`)}</p></header>
      <div class="meta"><div class="field"><span class="label">Data da OS</span>${safe(formatDate(order.date))}</div><div class="field"><span class="label">Funcionário responsável</span>${safe(employee?.name || employeeName(order.employeeId))}</div><div class="field"><span class="label">Local de execução</span>${safe(order.location)}</div><div class="field"><span class="label">Conferência</span>${order.signed ? "Assinada/conferida" : "Pendente de conferência"}</div></div>
      <h2>Descrição do serviço</h2><div class="field description">${safe(order.description)}</div>
      <h2>Observações</h2><div class="field description">${safe(order.notes)}</div>
      <p class="muted">Anexos registrados no sistema: ${attachments.length}. As fotos e documentos anexados não são impressos nesta folha.</p>
      <div class="qr-area"><strong>QR CODE DE RASTREAMENTO</strong><img src="${qrSrc}" alt="QR Code da Ordem de Serviço"><p>Escaneie para consultar esta OS e registrar movimentações.</p><p>${safe(qrText)}</p></div>
      <div class="signatures"><div class="sign">Responsável pela execução</div><div class="sign">Conferência / encarregado</div></div>
      <script>window.onload=()=>{const img=document.querySelector('.qr-area img');const go=()=>setTimeout(()=>{window.focus();window.print()},250);if(img.complete&&img.naturalWidth)go();else{img.onload=go;img.onerror=go}};<\/script></body></html>`);
    w.document.close();
  } catch (error) {
    console.error("Falha ao preparar impressão da OS:", error);
    showToast("Não foi possível preparar a impressão desta OS.");
  } finally {
    temp.remove();
  }
}

/* Ações nos cartões */

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.editEmployee) {
    openEmployeeForm(getEmployee(button.dataset.editEmployee));
  }

  if (button.dataset.archiveEmployee) {
    const employee = getEmployee(button.dataset.archiveEmployee);
    if (!employee) return;

    if (confirm(`Arquivar ${employee.name}? O histórico das OS será preservado.`)) {
      employee.active = false;
      employee.updatedAt = new Date().toISOString();
      logActivity(`Funcionário arquivado: ${employee.name}`);
      persistAndRender("Funcionário arquivado.");
    }
  }

  if (button.dataset.restoreEmployee) {
    const employee = getEmployee(button.dataset.restoreEmployee);
    if (!employee) return;

    employee.active = true;
    employee.updatedAt = new Date().toISOString();
    logActivity(`Funcionário reativado: ${employee.name}`);
    persistAndRender("Funcionário reativado.");
  }

  if (button.dataset.newOrderEmployee) {
    openOrderForm(null, button.dataset.newOrderEmployee);
  }

  if (button.dataset.editOrder) {
    const order = getOrder(button.dataset.editOrder);
    if (order) openOrderForm(order);
  }

  if (button.dataset.printOrder) {
    printOrderWithQr(button.dataset.printOrder);
  }

  if (button.dataset.attachOrder) {
    $("attachmentOrder").value = button.dataset.attachOrder;
    $("attachmentType").value = "document";
    openTab("files");
    $("attachmentForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.dataset.deleteOrder) {
    const order = getOrder(button.dataset.deleteOrder);
    
    
    if (!order) return;

    const attachments = getOrderAttachments(order.id);
    const message =
      `Excluir esta OS e seus ${attachments.length} anexo(s)? ` +
      "Esta ação não pode ser desfeita.";

    if (!confirm(message)) return;

    const config = window.OSF_CONFIG || {};
    const cloudClient = window.osfiscalSupabase;

    const cloudConfigured = Boolean(
      config.supabaseUrl &&
      config.supabaseAnonKey &&
      cloudClient
    );

    if (cloudConfigured) {
      if (window.osfiscalProfile?.role !== "manager") {
        showToast(
          "Entre com o perfil gerente para excluir uma OS sincronizada."
        );
        return;
      }

      button.disabled = true;

      try {
        const { data: deletedRows, error } = await cloudClient
          .from("osfiscal_orders")
          .delete()
          .eq("legacy_id", String(order.id))
          .select("legacy_id");

        if (error) {
          throw error;
        }

        if (!Array.isArray(deletedRows)) {
          throw new Error(
            "Não foi possível confirmar a exclusão na nuvem."
          );
        }

        if (deletedRows.length === 0) {
          const {
            data: existingOrder,
            error: readError
          } = await cloudClient
            .from("osfiscal_orders")
            .select("legacy_id")
            .eq("legacy_id", String(order.id))
            .maybeSingle();

          if (readError) {
            throw readError;
          }

          if (existingOrder) {
            throw new Error(
              "A OS continua na nuvem. Verifique as permissões."
            );
          }
        }
      } catch (error) {
        console.error(
          "Falha ao excluir OS na nuvem:",
          error
        );

        showToast(
          "Não foi possível confirmar a exclusão na nuvem. " +
          "A OS foi mantida no painel."
        );

        return;
      } finally {
        button.disabled = false;
      }
    }

    data.orders = data.orders.filter(
      (item) => String(item.id) !== String(order.id)
    );

    data.attachments = data.attachments.filter(
      (item) => String(item.orderId) !== String(order.id)
    );

    logActivity(
      `OS excluída: ${employeeName(order.employeeId)} — ` +
      `${formatDate(order.date)}`
    );

    persistAndRender(
      "OS e anexos relacionados excluídos."
    );
  }

  if (button.dataset.deleteAttachment) {
    const attachment = data.attachments.find((item) => item.id === button.dataset.deleteAttachment);
    if (!attachment) return;

    if (confirm(`Excluir o anexo "${attachment.name}"?`)) {
      const orderId = attachment.orderId;
      data.attachments = data.attachments.filter((item) => item.id !== attachment.id);

      const order = getOrder(orderId);
      if (order) {
        const related = getOrderAttachments(orderId);
        order.before = related.some((item) => item.type === "before");
        order.after = related.some((item) => item.type === "after");
        order.updatedAt = new Date().toISOString();
      }

      logActivity(`Anexo excluído: ${attachment.name}`);
      persistAndRender("Anexo excluído.");
    }
  }

  if (button.dataset.openAttachment) {
    const attachment = data.attachments.find((item) => item.id === button.dataset.openAttachment);
    if (attachment) openAttachment(attachment);
  }

  if (button.dataset.employeeMessage) {
    const employee = getEmployee(button.dataset.employeeMessage);
    if (employee) openWhatsApp(employee, `Olá, ${employee.name}! Tudo bem? Estou entrando em contato sobre as atividades da Campos e Filhos. Por favor, confirme o recebimento desta mensagem.`);
  }

  if (button.dataset.orderMessage) {
    const order = getOrder(button.dataset.orderMessage);
    const employee = order && getEmployee(order.employeeId);

    if (order && employee) {
      const message = `Olá, ${employee.name}! Atualização da sua ordem de serviço:\nData: ${formatDate(order.date)}\nServiço: ${order.description}\nSituação: ${orderStatus(order)}\nConferência: ${order.signed ? "assinada/conferida" : "pendente"}; foto antes: ${order.before ? "sim" : "pendente"}; foto depois: ${order.after ? "sim" : "pendente"}.`;
      openWhatsApp(employee, message);
    }
  }
});

/* Visualização segura de anexos */

function openAttachment(attachment) {
  const newWindow = window.open("", "_blank");

  if (!newWindow) {
    showToast("O navegador bloqueou a nova janela. Permita pop-ups para abrir anexos.");
    return;
  }

  const title = escapeHTML(attachment.name);
  const isImage = attachment.mime.startsWith("image/");
  const content = isImage
    ? `<img src="${escapeHTML(attachment.dataUrl)}" alt="${title}" style="max-width:100%;height:auto">`
    : `<p>Arquivo PDF ou documento.</p><a href="${escapeHTML(attachment.dataUrl)}" download="${title}">Abrir / baixar arquivo</a>`;

  newWindow.document.write(`<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        body{margin:0;padding:20px;background:#160b0c;color:#fff3f3;font:16px system-ui;text-align:center}
        img{margin-top:20px}a{color:#ff777d}
      </style>
    </head>
    <body><h2>${title}</h2>${content}</body></html>`);
  newWindow.document.close();
}

/* WhatsApp — mensagem preparada, envio manual */

function normalizeBrazilPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55")) digits = "55" + digits;

  // Brasil: DDD + número fixo (10 dígitos) ou celular (11 dígitos).
  if (!/^55\d{10,11}$/.test(digits)) return null;

  return digits;
}

function openWhatsApp(employee, message) {
  const phone = normalizeBrazilPhone(employee.phone);

  if (!phone) {
    showToast("Cadastre um telefone brasileiro válido para este funcionário.");
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");

  logActivity(`Mensagem de WhatsApp preparada para ${employee.name}`);
  saveData();
  renderActivity();

  showToast("Mensagem preparada. Confira e envie pelo WhatsApp.");
}

$("morningMessages").addEventListener("click", () => {
  const employee = data.employees.find((item) => item.active && normalizeBrazilPhone(item.phone));

  if (!employee) {
    showToast("Cadastre e informe o telefone de pelo menos um funcionário ativo.");
    openTab("employees");
    return;
  }

  const message = `Bom dia, ${employee.name}! Aqui é da Campos e Filhos. Por favor, confirme sua atividade e o local de trabalho de hoje.`;
  openWhatsApp(employee, message);
});

/* Notificações do navegador: não são um serviço em segundo plano */

$("enableNotifications").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("Este navegador não oferece suporte a notificações.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      new Notification("OS Fiscal Bot", {
        body: "Notificações ativadas enquanto o navegador oferecer suporte."
      });
      showToast("Permissão de notificação concedida.");
    } else {
      showToast("Permissão de notificação não concedida.");
    }
  } catch (error) {
    showToast("Não foi possível ativar notificações neste navegador.");
  }
});

function checkSchedule() {
  // Funciona somente enquanto esta página está aberta.
  const now = new Date();
  const date = today();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const time = `${hour}:${minute}`;

  if (!["08:00", "16:30"].includes(time)) return;

  const key = `${date}_${time}`;
  if (data.schedule[key]) return;

  data.schedule[key] = true;
  saveData();

  const text = time === "08:00"
    ? "Confira as equipes e as ordens de serviço de hoje."
    : "Confira as OS, assinaturas e fotos antes de encerrar o dia.";

  showToast(`Lembrete ${time}: ${text}`);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("OS Fiscal Bot — Lembrete", { body: text });
    } catch (error) {
      console.warn("Notificação indisponível:", error);
    }
  }
}

setInterval(checkSchedule, 15000);

/* Exportação de backup */

$("exportData").addEventListener("click", () => {
  try {
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `os-fiscal-bot-backup-${today()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    logActivity("Backup JSON exportado");
    saveData();
    renderActivity();
    showToast("Backup exportado. Guarde o arquivo em local seguro.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível exportar o backup.");
  }
});


/* Foto do encarregado — guardada neste navegador, sem alterar os dados das OS */
const PROFILE_PHOTO_KEY = "osFiscalBot_profilePhoto_v1";

function renderProfilePhoto() {
  const photo = $("brandPhoto");
  const initials = $("brandInitials");
  const removeButton = $("removeProfilePhoto");
  let savedPhoto = null;

  try { savedPhoto = localStorage.getItem(PROFILE_PHOTO_KEY); } catch (error) {}
  if (savedPhoto) {
    photo.hidden = false;
    photo.onerror = () => {
      photo.hidden = true;
      photo.removeAttribute("src");
      initials.hidden = false;
      removeButton.hidden = true;
      showToast("A foto salva não pôde ser carregada. Escolha a imagem novamente.");
    };
    photo.onload = () => { photo.onerror = null; };
    photo.src = savedPhoto;
    initials.hidden = true;
    removeButton.hidden = false;
    $("profilePhotoButton").setAttribute("aria-label", "Trocar foto do encarregado");
  } else {
    photo.onerror = null;
    photo.onload = null;
    photo.removeAttribute("src");
    photo.hidden = true;
    initials.hidden = false;
    removeButton.hidden = true;
    $("profilePhotoButton").setAttribute("aria-label", "Adicionar foto do encarregado");
  }
}

$("profilePhotoButton").addEventListener("click", () => $("profilePhotoInput").click());

$("profilePhotoInput").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Escolha um arquivo de imagem, como JPG ou PNG.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 360;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressedPhoto = canvas.toDataURL("image/jpeg", 0.82);

      try {
        localStorage.setItem(PROFILE_PHOTO_KEY, compressedPhoto);
        renderProfilePhoto();
        showToast("Foto do encarregado atualizada neste navegador.");
      } catch (error) {
        showToast("Não foi possível salvar a foto. O armazenamento do navegador pode estar cheio.");
      }
      event.target.value = "";
    };
    image.onerror = () => {
      showToast("Não foi possível abrir essa imagem. Tente outro arquivo.");
      event.target.value = "";
    };
    image.src = reader.result;
  };
  reader.onerror = () => showToast("Não foi possível ler o arquivo de imagem.");
  reader.readAsDataURL(file);
});

$("removeProfilePhoto").addEventListener("click", (event) => {
  event.stopPropagation();
  try {
    localStorage.removeItem(PROFILE_PHOTO_KEY);
    renderProfilePhoto();
    showToast("Foto removida. O símbolo CF foi restaurado.");
  } catch (error) {
    showToast("Não foi possível remover a foto neste navegador.");
  }
});



/* Scanner de OS: câmera traseira/frontal, PDF e compartilhamento */
(() => {
  const byId = (id) => document.getElementById(id);
  const facingSelect = byId("scannerCameraFacing");
  if (!facingSelect) return;
  const video = byId("scannerVideo");
  const cameraWrap = byId("scannerCameraWrap");
  const previewWrap = byId("scannerPreviewWrap");
  const preview = byId("scannerPreview");
  const canvas = byId("scannerCanvas");
  const status = byId("scannerStatus");
  const startBtn = byId("scannerStart");
  const captureBtn = byId("scannerCapture");
  const stopBtn = byId("scannerStop");
  const fileInput = byId("scannerFile");
  const makePdfBtn = byId("scannerMakePdf");
  const downloadBtn = byId("scannerDownload");
  const shareBtn = byId("scannerShare");
  const attachBtn = byId("scannerAttach");
  const whatsappBtn = byId("scannerWhatsApp");
  const orderSelect = byId("scannerOrderSelect");
  let cameraStream = null;
  let scannedDataUrl = null;
  let currentPdfBlob = null;
  let currentPdfName = "ordem-de-servico.pdf";

  function setScannerStatus(message) { status.textContent = message; }
  function setPdfActions(enabled) {
    downloadBtn.disabled = !enabled;
    shareBtn.disabled = !enabled;
    attachBtn.disabled = !enabled;
    whatsappBtn.disabled = !enabled;
  }
  function refreshScannerOrders() {
    if (!orderSelect || typeof data === "undefined") return;
    const previous = orderSelect.value;
    const options = data.orders.map((order) => {
      const name = employeeName(order.employeeId);
      const description = (order.description || "OS").slice(0, 65);
      return `<option value="${escapeHTML(order.id)}">${escapeHTML(formatDate(order.date))} · ${escapeHTML(name)} · ${escapeHTML(description)}</option>`;
    }).join("");
    orderSelect.innerHTML = '<option value="">Não vincular agora</option>' + options;
    if ([...orderSelect.options].some((option) => option.value === previous)) orderSelect.value = previous;
  }
  function stopScannerCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    video.srcObject = null;
    cameraWrap.classList.add("hidden");
    captureBtn.disabled = true;
    stopBtn.disabled = true;
    startBtn.disabled = false;
  }
  async function startScannerCamera() {
    stopScannerCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScannerStatus("A câmera não está disponível neste contexto. Abra o site por HTTPS ou escolha uma foto salva.");
      return;
    }
    startBtn.disabled = true;
    setScannerStatus("Solicitando acesso à câmera...");
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingSelect.value }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      video.srcObject = cameraStream;
      cameraWrap.classList.remove("hidden");
      await video.play();
      captureBtn.disabled = false;
      stopBtn.disabled = false;
      startBtn.disabled = true;
      setScannerStatus(`Câmera ${facingSelect.value === "user" ? "frontal" : "traseira"} ativada. Posicione a OS e fotografe.`);
    } catch (error) {
      stopScannerCamera();
      setScannerStatus("Não foi possível abrir essa câmera. Verifique a permissão do navegador ou tente escolher uma foto salva.");
    }
  }
  function acceptScannedImage(dataUrl) {
    scannedDataUrl = dataUrl;
    currentPdfBlob = null;
    preview.src = dataUrl;
    previewWrap.classList.remove("hidden");
    setPdfActions(false);
    makePdfBtn.disabled = false;
    setScannerStatus("Imagem carregada. Confira se a OS está inteira e legível e gere o PDF.");
  }
  function readScannerFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setScannerStatus("Escolha um arquivo de imagem válido, como JPG ou PNG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => acceptScannedImage(reader.result);
    reader.onerror = () => setScannerStatus("Não foi possível ler essa imagem. Tente outra foto.");
    reader.readAsDataURL(file);
  }
  async function buildScannerPdf() {
    if (!scannedDataUrl) {
      setScannerStatus("Primeiro abra a câmera e fotografe a OS, ou escolha uma imagem salva.");
      return null;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      setScannerStatus("A biblioteca de PDF não carregou. Verifique a conexão com a internet e tente novamente.");
      return null;
    }
    try {
      const image = new Image();
      image.src = scannedDataUrl;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: image.width > image.height ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const format = scannedDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(scannedDataUrl, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
      const selectedOrder = orderSelect.value ? getOrder(orderSelect.value) : null;
      const baseName = selectedOrder ? `OS-${selectedOrder.date || "documento"}` : "ordem-de-servico";
      currentPdfName = baseName.replace(/[^a-zA-Z0-9_-]/g, "-") + ".pdf";
      currentPdfBlob = doc.output("blob");
      setPdfActions(true);
      setScannerStatus("PDF criado. Você pode baixar, compartilhar, vincular à OS ou abrir o WhatsApp.");
      return currentPdfBlob;
    } catch (error) {
      console.error("Falha ao criar PDF da OS:", error);
      setScannerStatus("Não foi possível gerar o PDF. Tente fotografar a OS novamente.");
      return null;
    }
  }

  startBtn.addEventListener("click", startScannerCamera);
  facingSelect.addEventListener("change", () => {
    if (cameraStream) startScannerCamera();
    else setScannerStatus(`Câmera selecionada: ${facingSelect.value === "user" ? "frontal" : "traseira"}. Toque em “Abrir câmera”.`);
  });
  captureBtn.addEventListener("click", () => {
    if (!video.videoWidth) {
      setScannerStatus("Aguarde a câmera iniciar.");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    acceptScannedImage(canvas.toDataURL("image/jpeg", 0.92));
    stopScannerCamera();
  });
  stopBtn.addEventListener("click", () => {
    stopScannerCamera();
    setScannerStatus("Câmera fechada.");
  });
  fileInput.addEventListener("change", (event) => readScannerFile(event.target.files && event.target.files[0]));
  byId("scannerRetake").addEventListener("click", () => {
    scannedDataUrl = null;
    currentPdfBlob = null;
    previewWrap.classList.add("hidden");
    fileInput.value = "";
    setPdfActions(false);
    setScannerStatus("Escolha outra foto ou abra a câmera novamente.");
  });
  makePdfBtn.addEventListener("click", buildScannerPdf);
  downloadBtn.addEventListener("click", async () => {
    if (!currentPdfBlob && !(await buildScannerPdf())) return;
    const url = URL.createObjectURL(currentPdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = currentPdfName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setScannerStatus("Download do PDF iniciado. Procure o arquivo na pasta Downloads.");
  });
  shareBtn.addEventListener("click", async () => {
    if (!currentPdfBlob && !(await buildScannerPdf())) return;
    const file = new File([currentPdfBlob], currentPdfName, { type: "application/pdf" });
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Ordem de Serviço", text: "Ordem de Serviço digitalizada — Campos e Filhos", files: [file] });
      } else {
        setScannerStatus("O compartilhamento de arquivos não está disponível aqui. Baixe o PDF e anexe-o no aplicativo desejado.");
      }
    } catch (error) {
      if (error.name !== "AbortError") setScannerStatus("Não foi possível abrir o compartilhamento. Tente baixar o PDF.");
    }
  });
  attachBtn.addEventListener("click", async () => {
    if (!currentPdfBlob && !(await buildScannerPdf())) return;
    const orderId = orderSelect.value;
    const order = orderId ? getOrder(orderId) : null;
    if (!order) {
      setScannerStatus("Selecione uma OS válida no campo “Vincular à OS” antes de salvar como anexo.");
      return;
    }
    if (currentPdfBlob.size > MAX_FILE_SIZE) {
      setScannerStatus("Este PDF ultrapassa o limite de 1 MB dos anexos existentes. Baixe o PDF e compartilhe manualmente.");
      return;
    }
    if (totalAttachmentSize() + currentPdfBlob.size > MAX_TOTAL_FILES) {
      setScannerStatus("O limite total de anexos é 3 MB. Exclua anexos antigos ou baixe o PDF para compartilhar separadamente.");
      return;
    }
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
        reader.readAsDataURL(currentPdfBlob);
      });
      data.attachments.push({
        id: makeId(), orderId, type: "document", name: currentPdfName,
        mime: "application/pdf", size: currentPdfBlob.size, dataUrl,
        createdAt: new Date().toISOString()
      });
      order.updatedAt = new Date().toISOString();
      logActivity(`OS digitalizada anexada à ordem de ${employeeName(order.employeeId)}: ${currentPdfName}`);
      if (persistAndRender("PDF salvo como anexo da OS.")) {
        refreshScannerOrders();
        orderSelect.value = orderId;
        setScannerStatus("PDF salvo nos Anexos da OS selecionada neste navegador.");
      }
    } catch (error) {
      console.error(error);
      setScannerStatus("Não foi possível salvar o PDF como anexo. Tente baixá-lo e compartilhar manualmente.");
    }
  });
  whatsappBtn.addEventListener("click", async () => {
    if (!currentPdfBlob && !(await buildScannerPdf())) return;
    const order = orderSelect.value ? getOrder(orderSelect.value) : null;
    const employee = order ? getEmployee(order.employeeId) : null;
    if (employee && employee.phone) {
      const message = `Olá ${employee.name}! Estou encaminhando a Ordem de Serviço digitalizada${order.date ? ` (${formatDate(order.date)})` : ""}. Vou anexar o PDF nesta conversa.`;
      openWhatsApp(employee, message);
      setScannerStatus("WhatsApp aberto para o funcionário. Anexe o PDF nesta conversa e toque em enviar.");
    } else {
      setScannerStatus("Para abrir o WhatsApp do funcionário, vincule uma OS cujo cadastro tenha o telefone dele. Você também pode baixar o PDF e compartilhar manualmente.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(currentPdfBlob);
      link.download = currentPdfName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    }
  });
  document.querySelectorAll('.tab[data-tab="scanner"], [data-goto="scanner"]').forEach((button) => {
    button.addEventListener("click", refreshScannerOrders);
  });
  window.addEventListener("beforeunload", stopScannerCamera);
  refreshScannerOrders();
})();

/* Inicialização */

$("orderDate").value = today();
renderAll();
renderProfilePhoto();
checkSchedule();


/* ===== Entrada local por e-mail e senha =====
   Mantém as rotinas originais do OS Fiscal Bot.
   O cadastro é guardado neste navegador; não é autenticação de servidor. */
(() => {
  const ACCOUNT_KEY = "osFiscalBot_local_account_v1";
  const byId = (id) => document.getElementById(id);
  const loginForm = byId("loginForm");
  if (!loginForm) return;

  function readAccount() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null"); }
    catch { return null; }
  }

  function toHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function passwordHash(password, saltHex) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error("O navegador não disponibilizou criptografia segura. Abra o projeto pela prévia local segura do SPCK ou por HTTPS.");
    }
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map((part) => parseInt(part, 16)));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, material, 256);
    return toHex(new Uint8Array(bits));
  }

  function setError(message) {
    const node = byId("loginError");
    node.textContent = message || "";
    node.hidden = !message;
  }

  function updateMode() {
    const cloudConfigured = Boolean(window.OSF_CONFIG && window.OSF_CONFIG.supabaseUrl && window.OSF_CONFIG.supabaseAnonKey && !window.OSF_CONFIG.supabaseUrl.includes("COLE_"));
    const hasAccount = Boolean(readAccount());
    if (cloudConfigured) {
      byId("loginTitle").textContent = "Acessar o OS Fiscal Bot";
  byId("loginDescription").textContent = "Entre com seu e-mail e sua senha cadastrados.";
      byId("loginPassword").autocomplete = "current-password";
      byId("loginPassword").placeholder = "Pelo menos 8 caracteres";
      byId("loginSubmit").textContent = "Entrar";
      byId("loginScreen").querySelector(".login-disclaimer").textContent = "Acesso pela autenticação online. O administrador deve atribuir o perfil e vincular cada funcionário.";
      return;
    }
    byId("loginTitle").textContent = hasAccount ? "Acessar o OS Fiscal Bot" : "Criar acesso local";
    byId("loginDescription").textContent = hasAccount
      ? "Entre com o e-mail e a senha cadastrados neste navegador."
      : "No primeiro acesso, crie uma conta local para continuar.";
    byId("loginPassword").autocomplete = hasAccount ? "current-password" : "new-password";
    byId("loginPassword").placeholder = hasAccount ? "Digite sua senha" : "Pelo menos 8 caracteres";
    byId("loginSubmit").textContent = hasAccount ? "Entrar" : "Criar acesso e entrar";
  }

  function showLogin() {
    byId("appContent").hidden = true;
    byId("loginScreen").hidden = false;
    byId("loginPassword").value = "";
    setError("");
    updateMode();
  }

  function showApp() {
    byId("loginScreen").hidden = true;
    byId("appContent").hidden = false;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError("");
    const email = byId("loginEmail").value.trim().toLowerCase();
    const password = byId("loginPassword").value;
    const submit = byId("loginSubmit");

    if (!email || !byId("loginEmail").checkValidity()) {
      setError("Digite um endereço de e-mail válido.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    submit.disabled = true;
    try {
      const cloudConfigured = Boolean(window.OSF_CONFIG && window.OSF_CONFIG.supabaseUrl && window.OSF_CONFIG.supabaseAnonKey && !window.OSF_CONFIG.supabaseUrl.includes("COLE_"));
      if (cloudConfigured) {
        if (!window.supabase || !window.supabase.createClient) throw new Error("Biblioteca de conexão indisponível. Verifique a internet e recarregue a página.");
        const client = window.osfiscalSupabase || (window.osfiscalSupabase = window.supabase.createClient(window.OSF_CONFIG.supabaseUrl, window.OSF_CONFIG.supabaseAnonKey));
        let result = await client.auth.signInWithPassword({ email, password });
        
if (result.error) {
  throw new Error("E-mail ou senha incorretos. Verifique seus dados ou solicite o cadastro ao administrador.");
}
        
        window.osfiscalUser = (await client.auth.getUser()).data.user;
        showApp();
        if (window.OSFiscalTracking && window.OSFiscalTracking.onLogin) await window.OSFiscalTracking.onLogin();
        return;
      }
      const account = readAccount();
      if (!account) {
        const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
        const hash = await passwordHash(password, salt);
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ email, salt, passwordHash: hash }));
        showApp();
      } else {
        const hash = await passwordHash(password, account.salt);
        if (email !== account.email || hash !== account.passwordHash) {
          setError("E-mail ou senha incorretos.");
          return;
        }
        showApp();
      }
    } catch (error) {
      console.error(error);
      setError(error.message || "Não foi possível validar o acesso local.");
    } finally {
      submit.disabled = false;
      updateMode();
    }
  });

  byId("logoutButton").addEventListener("click", async () => {
    try { if (window.osfiscalSupabase) await window.osfiscalSupabase.auth.signOut(); } catch (error) { console.warn(error); }
    window.osfiscalUser = null;
    showLogin();
  });
  showLogin();
})();
