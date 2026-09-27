// Public/admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { FIREBASE_CONFIG, ADMIN_EMAILS } from "./js/firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = FIREBASE_CONFIG;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function $(id) { return document.getElementById(id); }
function val(el) { return (el?.value ?? "").toString().trim(); }
function num(el, fallback = 0) {
  const v = parseInt(val(el), 10);
  return Number.isFinite(v) ? v : fallback;
}
function resolveId(idEl, orderEl) {
  const id = val(idEl);
  if (id) return id;
  const o = val(orderEl);
  return o ? o.toString() : "";
}
function focusEditCard() {
  const card = document.getElementById("editCard");
  if (!card) return;
  card.classList.add("editing");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}
function flash(el, text, ok = true) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "#15803d" : "#b91c1c";
  el.style.fontWeight = "800";
  el.style.fontSize = "15px";
  const card = document.getElementById("editCard");
  if (card) {
    card.classList.remove("editing", "saved");
    card.classList.add(ok ? "saved" : "editing");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (ok) return;
  setTimeout(() => {
    if (el.textContent === text) el.textContent = "";
  }, 6000);
}
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}
async function doLogout() {
  await signOut(auth);
  window.location.href = "./admin-login.html";
}

async function requireAdmin(user) {
  if (!user) {
    alert("Debes iniciar sesión como administrador.");
    window.location.href = "./admin-login.html";
    return false;
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    alert("No tienes permiso para acceder.");
    await signOut(auth);
    window.location.href = "./admin-login.html";
    return false;
  }
  return true;
}

const isDashboardPage = !!document.getElementById("usersTableBody");
const isModulesPage   = !!document.getElementById("modulesTableBody");
const isClassesPage   = !!document.getElementById("classesTableBody");
const isQuestionsPage = !!document.getElementById("questionsTableBody");
const isEditorPage    = !!document.getElementById("saveQuestionBtn");

const authStatus = $("authStatus");
const logoutBtn = $("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

async function initDashboardPage() {
  const authStatus = document.getElementById("authStatus");
  const usersTableBody = document.getElementById("usersTableBody");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");
  const pendingOnly = document.getElementById("pendingOnly");
  const pendingSummary = document.getElementById("pendingSummary");

  let renderedRows = [];

  function safeLower(x) { return String(x || "").toLowerCase(); }
  function listTrueKeys(obj) {
    if (!obj || typeof obj !== "object") return "-";
    const keys = Object.keys(obj).filter(k => obj[k] === true);
    return keys.length ? keys.join(", ") : "-";
  }
  function firstPendingModule(obj) {
    if (!obj || typeof obj !== "object") return null;
    const pending = Object.keys(obj)
      .filter(k => obj[k] === true)
      .map(k => parseInt(k, 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    return pending.length ? String(pending[0]) : null;
  }
  function waLink(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length < 8) return "";
    return `https://wa.me/${digits}`;
  }

  async function saveProgress(uid, mutator) {
    const ref = doc(db, "userProgress", uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};
    data.paidModules ??= {};
    data.paymentPending ??= {};
    data.passedTests ??= {};
    data.videoWatched ??= {};
    mutator(data);
    await setDoc(ref, data, { merge: true });
    await loadData();
  }

  function applyFilters() {
    const s = String(searchInput?.value || "").toLowerCase();
    const onlyPending = !!pendingOnly?.checked;
    renderedRows.forEach(row => {
      const email = row.dataset.email || "";
      const nombre = row.dataset.nombre || "";
      const wa = row.dataset.whatsapp || "";
      const match = !s || email.includes(s) || nombre.includes(s) || wa.includes(s);
      const pendingOk = !onlyPending || row.dataset.pending === "1";
      row.style.display = (match && pendingOk) ? "" : "none";
    });
  }

  async function loadData() {
    usersTableBody.innerHTML = `<tr><td colspan="6">Cargando…</td></tr>`;
    renderedRows = [];

    const usersSnap = await getDocs(collection(db, "users"));
    const progressSnap = await getDocs(collection(db, "userProgress"));

    const usersMap = {};
    usersSnap.forEach(d => (usersMap[d.id] = d.data() || {}));
    const progressMap = {};
    progressSnap.forEach(d => (progressMap[d.id] = d.data() || {}));

    const uids = Object.keys(usersMap);
    if (uids.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="6">No hay usuarios todavía.</td></tr>`;
      if (pendingSummary) pendingSummary.textContent = "Pagos pendientes: 0";
      return;
    }

    uids.sort((a, b) => {
      const pa = firstPendingModule((progressMap[a] || {}).paymentPending) ? 0 : 1;
      const pb = firstPendingModule((progressMap[b] || {}).paymentPending) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return safeLower((usersMap[a] || {}).email).localeCompare(safeLower((usersMap[b] || {}).email));
    });

    usersTableBody.innerHTML = "";
    let pendingCount = 0;

    for (const uid of uids) {
      const user = usersMap[uid] || {};
      const prog = progressMap[uid] || {};
      const pendModule = firstPendingModule(prog.paymentPending);
      if (pendModule) pendingCount += 1;

      const paid = listTrueKeys(prog.paidModules);
      const tests = listTrueKeys(prog.passedTests);
      const wa = waLink(user.whatsapp);
      const waHtml = user.whatsapp
        ? (wa ? `<a href="${wa}" target="_blank" rel="noopener" class="wa">${user.whatsapp}</a>` : user.whatsapp)
        : "-";

      const tr = document.createElement("tr");
      tr.dataset.uid = uid;
      tr.dataset.email = safeLower(user.email);
      tr.dataset.nombre = safeLower(user.nombre);
      tr.dataset.whatsapp = String(user.whatsapp || "").replace(/\D/g, "");
      tr.dataset.pending = pendModule ? "1" : "0";
      tr.innerHTML = `
        <td>${user.email || "-"}</td>
        <td>${user.nombre || "-"}</td>
        <td>${waHtml}${user.pais ? " / " + user.pais : ""}</td>
        <td>${paid}</td>
        <td>${tests}</td>
        <td class="action-cell"></td>
      `;

      const cell = tr.querySelector(".action-cell");
      const box = document.createElement("div");
      box.className = "pending-box";

      if (pendModule) {
        const label = document.createElement("span");
        label.innerHTML = `<strong>Mód. ${pendModule}</strong> <span class="small">Pago directo</span>`;
        box.appendChild(label);

        const btnA = document.createElement("button");
        btnA.className = "btn-sm btn-approve";
        btnA.type = "button";
        btnA.textContent = "Aprobar";
        btnA.onclick = () => saveProgress(uid, (data) => {
          let pend = firstPendingModule(data.paymentPending);
          if (!pend && data.paymentPending["0"] === true) pend = "1";
          if (!pend) {
            alert("Este usuario no tiene pago pendiente válido.");
            return;
          }
          data.paidModules[String(pend)] = true;
          delete data.paymentPending[String(pend)];
          delete data.paymentPending["0"];
        });

        const btnR = document.createElement("button");
        btnR.className = "btn-sm btn-reject";
        btnR.type = "button";
        btnR.textContent = "Rechazar";
        btnR.onclick = () => saveProgress(uid, (data) => {
          let pend = firstPendingModule(data.paymentPending);
          if (!pend && data.paymentPending["0"] === true) pend = "1";
          if (pend) delete data.paymentPending[String(pend)];
          delete data.paymentPending["0"];
        });

        box.appendChild(btnA);
        box.appendChild(btnR);
      }

      const grantWrap = document.createElement("span");
      grantWrap.style.display = "inline-flex";
      grantWrap.style.gap = "6px";
      grantWrap.style.alignItems = "center";
      grantWrap.innerHTML = `
        <select class="grant-mod">
          <option value="1">Mód. 1</option>
          <option value="2">Mód. 2</option>
          <option value="3">Mód. 3</option>
          <option value="4">Mód. 4</option>
        </select>
      `;
      const grantBtn = document.createElement("button");
      grantBtn.className = "btn-sm btn-approve";
      grantBtn.type = "button";
      grantBtn.textContent = "Dar acceso";
      grantBtn.onclick = () => {
        const sel = grantWrap.querySelector(".grant-mod");
        const mid = sel?.value || "1";
        if (!confirm(`¿Dar acceso al módulo ${mid} a ${user.email || "este usuario"}?`)) return;
        return saveProgress(uid, (data) => {
          data.paidModules[String(mid)] = true;
          delete data.paymentPending[String(mid)];
          delete data.paymentPending["0"];
        });
      };
      grantWrap.appendChild(grantBtn);
      box.appendChild(grantWrap);

      cell.appendChild(box);
      usersTableBody.appendChild(tr);
      renderedRows.push(tr);
    }

    if (pendingSummary) pendingSummary.textContent = `Pagos pendientes: ${pendingCount}`;
    applyFilters();
  }

  searchInput?.addEventListener("input", applyFilters);
  pendingOnly?.addEventListener("change", applyFilters);
  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./admin-login.html";
  });

  if (authStatus && auth?.currentUser) authStatus.textContent = `Sesión: ${auth.currentUser.email}`;
  await loadData();
}

async function initModulesPage() {
  const statusMsg = $("statusMsg");
  const moduleIdEl = $("moduleId");
  const moduleTitleEl = $("moduleTitle");
  const moduleOrderEl = $("moduleOrder");
  const modulePriceEl = $("modulePrice");
  const moduleActiveEl = $("moduleActive");
  const saveModuleBtn = $("saveModuleBtn");
  const tableBody = $("modulesTableBody");

  async function refreshModulesList() {
    tableBody.innerHTML = `<tr><td colspan="3" class="small">Cargando…</td></tr>`;
    const snap = await getDocs(query(collection(db, "modules"), orderBy("order")));
    if (snap.empty) {
      tableBody.innerHTML = `<tr><td colspan="3" class="small">(sin módulos)</td></tr>`;
      return;
    }

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};
      const mId = d.id;
      rows.push(`
        <tr>
          <td>
            <div style="font-weight:700;">Módulo ${mId}</div>
            <div class="small">${m.title ?? ""}</div>
          </td>
          <td class="small">
            Orden: ${m.order ?? "-"} <span class="pill">activo: ${String(!!m.active)}</span><br/>
            Precio: ${m.price ?? 0}
          </td>
          <td>
            <button class="btn btn-ghost" data-edit-module="${mId}">Editar</button>
            <button class="btn btn-primary" data-open-classes="${mId}">Ver clases</button>
          </td>
        </tr>
      `);
    });

    tableBody.innerHTML = rows.join("");

    tableBody.querySelectorAll("[data-edit-module]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const mId = btn.getAttribute("data-edit-module");
        const ref = doc(db, "modules", mId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const m = snap.data() || {};
        moduleIdEl.value = mId;
        moduleTitleEl.value = m.title ?? "";
        moduleOrderEl.value = m.order ?? "";
        modulePriceEl.value = m.price ?? 0;
        moduleActiveEl.value = String(!!m.active);
        const card = document.getElementById("editCard");
        const formTitle = document.getElementById("formTitle");
        if (formTitle) formTitle.textContent = "Editando este módulo (arriba)";
        if (card) {
          card.classList.add("editing");
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        flash(statusMsg, "✅ Cargado arriba. Cambia el título o el precio y pulsa Guardar módulo.");
      });
    });

    tableBody.querySelectorAll("[data-open-classes]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mId = btn.getAttribute("data-open-classes");
        window.location.href = `./admin-class.html?moduleId=${encodeURIComponent(mId)}`;
      });
    });
  }

  saveModuleBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    if (!moduleId) return flash(statusMsg, "Falta ID u Orden del módulo.", false);
    await setDoc(doc(db, "modules", moduleId), {
      title: val(moduleTitleEl),
      order: num(moduleOrderEl, 1),
      price: num(modulePriceEl, 0),
      active: val(moduleActiveEl) === "true",
      updatedAt: Date.now()
    }, { merge: true });
    moduleIdEl.value = moduleId;
    flash(statusMsg, "✅ Módulo guardado.");
    await refreshModulesList();
  });

  await refreshModulesList();
}

async function initClassesPage() {
  const statusMsg = $("statusMsg");
  const moduleId = getParam("moduleId");
  if (!moduleId) {
    alert("Falta moduleId en la URL.");
    window.location.href = "./admin-module.html";
    return;
  }

  const moduleInfo = $("moduleInfo");
  const classesBody = $("classesTableBody");
  const classIdEl = $("classId");
  const classTitleEl = $("classTitle");
  const classOrderEl = $("classOrder");
  const classVideoUrlEl = $("classVideoUrl");
  const classPassScoreEl = $("classPassScore");
  const classActiveEl = $("classActive");
  const saveClassBtn = $("saveClassBtn");
  const loadClassBtn = $("loadClassBtn");

  $("backModulesBtn")?.addEventListener("click", () => {
    window.location.href = "./admin-module.html";
  });

  const mSnap = await getDoc(doc(db, "modules", moduleId));
  if (!mSnap.exists()) {
    alert("Ese módulo no existe.");
    window.location.href = "./admin-module.html";
    return;
  }
  const m = mSnap.data() || {};
  moduleInfo.textContent = `Módulo ${moduleId}: ${m.title ?? ""} (order: ${m.order ?? "-"})`;

  async function refreshClassesList() {
    classesBody.innerHTML = `<tr><td colspan="3" class="small">Cargando…</td></tr>`;
    const snap = await getDocs(query(collection(db, "modules", moduleId, "classes"), orderBy("order")));
    if (snap.empty) {
      classesBody.innerHTML = `<tr><td colspan="3" class="small">(sin clases)</td></tr>`;
      return;
    }

    const rows = [];
    snap.forEach(d => {
      const c = d.data() || {};
      const cId = d.id;
      rows.push(`
        <tr>
          <td>
            <div style="font-weight:700;">Clase ${cId}</div>
            <div class="small">${c.title ?? ""}</div>
          </td>
          <td class="small">
            Orden: ${c.order ?? "-"} <span class="pill">activo: ${String(!!c.active)}</span><br/>
            PassScore: ${c.passScore ?? 80}<br/>
            Video: ${(c.videoUrl ?? "").slice(0, 60)}${(c.videoUrl ?? "").length > 60 ? "…" : ""}
          </td>
          <td>
            <button class="btn btn-ghost" data-edit-class="${cId}">Editar</button>
            <button class="btn btn-primary" data-edit-questions="${cId}">Editar preguntas</button>
          </td>
        </tr>
      `);
    });
    classesBody.innerHTML = rows.join("");

    classesBody.querySelectorAll("[data-edit-class]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const cId = btn.getAttribute("data-edit-class");
        const snap = await getDoc(doc(db, "modules", moduleId, "classes", cId));
        if (!snap.exists()) return;
        const c = snap.data() || {};
        classIdEl.value = cId;
        classTitleEl.value = c.title ?? "";
        classOrderEl.value = c.order ?? "";
        classVideoUrlEl.value = c.videoUrl ?? "";
        classPassScoreEl.value = c.passScore ?? 80;
        classActiveEl.value = String(!!c.active);
        focusEditCard();
        flash(statusMsg, "✅ Clase cargada arriba. Cambia el video o el título y pulsa Guardar clase.");
      });
    });

    classesBody.querySelectorAll("[data-edit-questions]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cId = btn.getAttribute("data-edit-questions");
        window.location.href =
          `./admin-questions.html?moduleId=${encodeURIComponent(moduleId)}&classId=${encodeURIComponent(cId)}`;
      });
    });
  }

  const goQuestionsBtn = $("goQuestionsBtn");

  async function nextClassOrder() {
    const snap = await getDocs(collection(db, "modules", moduleId, "classes"));
    let max = 0;
    snap.forEach(d => {
      const o = Number((d.data() || {}).order) || Number(d.id) || 0;
      if (o > max) max = o;
    });
    return max + 1;
  }

  saveClassBtn?.addEventListener("click", async () => {
    if (!val(classTitleEl)) return flash(statusMsg, "Pon el título de la clase.", false);
    if (!val(classVideoUrlEl)) return flash(statusMsg, "Pon el enlace de YouTube.", false);
    if (!val(classOrderEl)) classOrderEl.value = String(await nextClassOrder());
    const classId = resolveId(classIdEl, classOrderEl);
    if (!classId) return flash(statusMsg, "No se pudo crear el número de clase.", false);

    await setDoc(doc(db, "modules", moduleId, "classes", classId), {
      title: val(classTitleEl),
      order: num(classOrderEl, 1),
      videoUrl: val(classVideoUrlEl),
      passScore: num(classPassScoreEl, 80),
      active: true,
      updatedAt: Date.now()
    }, { merge: true });

    classIdEl.value = classId;
    flash(statusMsg, "✅ Clase guardada. Ahora puedes agregar las preguntas.");
    if (goQuestionsBtn) {
      goQuestionsBtn.classList.remove("hidden");
      goQuestionsBtn.onclick = () => {
        window.location.href =
          `./admin-questions.html?moduleId=${encodeURIComponent(moduleId)}&classId=${encodeURIComponent(classId)}`;
      };
    }
    await refreshClassesList();
  });

  loadClassBtn?.addEventListener("click", async () => {
    const classId = resolveId(classIdEl, classOrderEl);
    if (!classId) return flash(statusMsg, "Pon ID u Orden de la clase para cargar.", false);
    const snap = await getDoc(doc(db, "modules", moduleId, "classes", classId));
    if (!snap.exists()) return flash(statusMsg, "No existe esa clase.", false);
    const d = snap.data();
    classTitleEl.value = d.title ?? "";
    classOrderEl.value = d.order ?? "";
    classVideoUrlEl.value = d.videoUrl ?? "";
    classPassScoreEl.value = d.passScore ?? 80;
    classActiveEl.value = String(!!d.active);
    classIdEl.value = classId;
    flash(statusMsg, "✅ Clase cargada.");
  });

  await refreshClassesList();
}

async function initQuestionsPage() {
  const statusMsg = $("statusMsg");
  const classInfo = document.getElementById("classInfo");
  const moduleId = getParam("moduleId");
  const classId = getParam("classId");

  if (!moduleId || !classId) {
    if (classInfo) classInfo.textContent = "❌ Falta moduleId / classId en la URL.";
    alert("Faltan parámetros en la URL: moduleId y classId.");
    return;
  }

  document.getElementById("backClassesBtn")?.addEventListener("click", () => {
    window.location.href = `./admin-class.html?moduleId=${encodeURIComponent(moduleId)}`;
  });

  const saveBtn = document.getElementById("saveQuestionAllBtn");
  const questionIdEl = document.getElementById("questionId");
  const questionOrderEl = document.getElementById("questionOrder");
  const correctIndexEl = document.getElementById("correctIndex");
  const questionActiveEl = document.getElementById("questionActive");
  const questionTextEl = document.getElementById("questionText");
  const a0 = document.getElementById("a0");
  const a1 = document.getElementById("a1");
  const a2 = document.getElementById("a2");
  const a3 = document.getElementById("a3");
  const tableBody = document.getElementById("questionsTableBody");

  function questionFormReady() {
    return !!(val(questionTextEl) && val(a0) && val(a1) && val(a2) && val(a3));
  }
  function updateSaveBtnState() {
    if (!saveBtn) return;
    const ready = questionFormReady();
    saveBtn.disabled = !ready;
    saveBtn.style.opacity = ready ? "1" : "0.45";
    saveBtn.style.cursor = ready ? "pointer" : "not-allowed";
    saveBtn.style.background = ready ? "" : "#94a3b8";
    saveBtn.style.color = ready ? "" : "#fff";
    if (ready && saveBtn.textContent !== "Guardada ✓") saveBtn.textContent = "Guardar pregunta";
  }
  [questionTextEl, a0, a1, a2, a3].forEach(el => el?.addEventListener("input", updateSaveBtnState));
  updateSaveBtnState();

  try {
    const cSnap = await getDoc(doc(db, "modules", moduleId, "classes", classId));
    const c = cSnap.exists() ? (cSnap.data() || {}) : {};
    if (classInfo) classInfo.textContent = `Módulo ${moduleId} → Clase ${classId}: ${c.title || ""}`;
  } catch (e) {
    if (classInfo) classInfo.textContent = `Módulo ${moduleId} → Clase ${classId}`;
  }

  function pickedCorrectIndex() {
    const picked = document.querySelector('input[name="correctPick"]:checked');
    if (!picked) return null;
    const idx = parseInt(picked.value, 10);
    return [0, 1, 2, 3].includes(idx) ? idx : null;
  }
  function setRadio(idx) {
    document.querySelectorAll('input[name="correctPick"]').forEach(r => {
      r.checked = (parseInt(r.value, 10) === idx);
    });
  }
  document.querySelectorAll('input[name="correctPick"]').forEach(r => {
    r.addEventListener("change", () => {
      const idx = pickedCorrectIndex();
      if (idx !== null && correctIndexEl) correctIndexEl.value = String(idx);
    });
  });

  async function renderList() {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="3" class="small">Cargando…</td></tr>`;
    const snap = await getDocs(query(
      collection(db, "modules", moduleId, "classes", classId, "questions"),
      orderBy("order", "asc")
    ));
    if (snap.empty) {
      tableBody.innerHTML = `<tr><td colspan="3" class="small">(sin preguntas)</td></tr>`;
      return;
    }
    const rows = [];
    snap.forEach(d => {
      const q = d.data() || {};
      rows.push(`
        <tr>
          <td>${q.order ?? "-"}</td>
          <td class="small">${(q.text ?? "").toString().slice(0, 90)}</td>
          <td>
            <button type="button" class="btn btn-ghost" data-edit-q="${d.id}">Editar</button>
            <button type="button" class="btn btn-danger" data-del-q="${d.id}">Eliminar</button>
          </td>
        </tr>
      `);
    });
    tableBody.innerHTML = rows.join("");

    tableBody.querySelectorAll("[data-edit-q]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const qId = btn.getAttribute("data-edit-q");
        const qSnap = await getDoc(doc(db, "modules", moduleId, "classes", classId, "questions", qId));
        if (!qSnap.exists()) return;
        const q = qSnap.data() || {};
        questionIdEl.value = qId;
        questionOrderEl.value = q.order ?? "";
        questionActiveEl.value = String(!!q.active);
        questionTextEl.value = q.text ?? "";
        const idx = (typeof q.correctIndex === "number") ? q.correctIndex : 0;
        correctIndexEl.value = String(idx);
        setRadio(idx);
        const ansSnap = await getDocs(collection(db, "modules", moduleId, "classes", classId, "questions", qId, "answers"));
        const map = {};
        ansSnap.forEach(x => (map[x.id] = x.data() || {}));
        a0.value = map["0"]?.text ?? "";
        a1.value = map["1"]?.text ?? "";
        a2.value = map["2"]?.text ?? "";
        a3.value = map["3"]?.text ?? "";
        focusEditCard();
        updateSaveBtnState();
        flash(statusMsg, "✅ Pregunta cargada arriba. Edítala y pulsa Guardar pregunta.");
      });
    });

    tableBody.querySelectorAll("[data-del-q]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const qId = btn.getAttribute("data-del-q");
        if (!confirm("¿Eliminar esta pregunta? Esto también borra sus respuestas y NO se puede deshacer.")) return;
        const qRef = doc(db, "modules", moduleId, "classes", classId, "questions", qId);
        const ansSnap = await getDocs(collection(db, "modules", moduleId, "classes", classId, "questions", qId, "answers"));
        const batch = writeBatch(db);
        ansSnap.forEach(a => batch.delete(a.ref));
        batch.delete(qRef);
        await batch.commit();
        if ((questionIdEl?.value || "") === qId) {
          questionIdEl.value = "";
          questionOrderEl.value = "";
          questionTextEl.value = "";
          a0.value = ""; a1.value = ""; a2.value = ""; a3.value = "";
          setRadio(-1);
          updateSaveBtnState();
        }
        flash(statusMsg, "🗑️ Pregunta eliminada.");
        await renderList();
      });
    });
  }

  saveBtn?.addEventListener("click", async () => {
    if (!val(questionTextEl) || !val(a0) || !val(a1) || !val(a2) || !val(a3) || pickedCorrectIndex() === null) {
      alert("Completa la pregunta, las 4 respuestas y marca la correcta.");
      return;
    }
    if (!val(questionOrderEl) || !val(questionIdEl)) {
      const snap = await getDocs(collection(db, "modules", moduleId, "classes", classId, "questions"));
      let max = 0;
      snap.forEach(d => {
        const o = Number((d.data() || {}).order) || Number(d.id) || 0;
        if (o > max) max = o;
      });
      const next = String(max + 1);
      if (!val(questionOrderEl)) questionOrderEl.value = next;
      if (!val(questionIdEl)) questionIdEl.value = next;
    }
    const qId = resolveId(questionIdEl, questionOrderEl);
    const idx = pickedCorrectIndex();
    await setDoc(doc(db, "modules", moduleId, "classes", classId, "questions", qId), {
      text: val(questionTextEl),
      order: num(questionOrderEl, 1),
      correctIndex: idx,
      active: true,
      updatedAt: Date.now()
    }, { merge: true });
    const answers = [val(a0), val(a1), val(a2), val(a3)];
    for (let i = 0; i < 4; i++) {
      await setDoc(
        doc(db, "modules", moduleId, "classes", classId, "questions", qId, "answers", String(i)),
        { text: answers[i], order: i, active: true, updatedAt: Date.now() },
        { merge: true }
      );
    }
    questionIdEl.value = "";
    questionOrderEl.value = "";
    questionTextEl.value = "";
    a0.value = ""; a1.value = ""; a2.value = ""; a3.value = "";
    setRadio(-1);
    if (correctIndexEl) correctIndexEl.value = "";
    updateSaveBtnState();
    flash(statusMsg, "✅ Pregunta guardada. El formulario quedó listo para otra.");
    saveBtn.textContent = "Guardada ✓";
    saveBtn.style.background = "#16a34a";
    saveBtn.style.color = "#fff";
    setTimeout(() => updateSaveBtnState(), 2500);
    await renderList();
  });

  document.getElementById("newQuestionBtn")?.addEventListener("click", () => {
    questionIdEl.value = "";
    questionOrderEl.value = "";
    questionTextEl.value = "";
    a0.value = ""; a1.value = ""; a2.value = ""; a3.value = "";
    setRadio(-1);
    if (correctIndexEl) correctIndexEl.value = "";
    updateSaveBtnState();
    flash(statusMsg, "Lista para una nueva pregunta.");
  });

  await renderList();
}

async function initEditorPage() {
  const statusMsg = $("statusMsg");
}

onAuthStateChanged(auth, async (user) => {
  const ok = await requireAdmin(user);
  if (!ok) return;
  const el = document.getElementById("authStatus");
  if (el) el.textContent = `Sesión: ${user.email}`;
  if (isDashboardPage) await initDashboardPage();
  if (isModulesPage) await initModulesPage();
  if (isClassesPage) await initClassesPage();
  if (isQuestionsPage) await initQuestionsPage();
  if (isEditorPage) await initEditorPage();
});