import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// 🔥 escuela-ees
const firebaseConfig = {
  apiKey: "AIzaSyCJVZmCuM8bekhbG1AFMAcT3O8pncvoFcQ",
  authDomain: "escuela-ees.firebaseapp.com",
  projectId: "escuela-ees",
  storageBucket: "escuela-ees.firebasestorage.app",
  messagingSenderId: "514513764908",
  appId: "1:514513764908:web:56f9ca64edbe79f1f14789"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ✅ Only these emails can use admin
const ADMIN_EMAILS = ["iattv7@gmail.com"];

// ---------- helpers ----------
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
function flash(el, text, ok = true) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "#a7f3d0" : "#fecaca";
  setTimeout(() => (el.textContent = ""), 4000);
}
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}
async function doLogout() {
  await signOut(auth);
  window.location.href = "./admin-login.html";
}


// =====================================================================
//  PAGE: admin-dashboard.html
// =====================================================================
async function initDashboardPage() {
  const authStatus = document.getElementById("authStatus");
  const usersTableBody = document.getElementById("usersTableBody");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");

  let renderedRows = [];

  function safeLower(x){ return String(x || "").toLowerCase(); }
  function listTrueKeys(obj){
    if (!obj || typeof obj !== "object") return "-";
    const keys = Object.keys(obj).filter(k => obj[k] === true);
    return keys.length ? keys.join(", ") : "-";
  }
  function firstKey(obj){
    if (!obj || typeof obj !== "object") return null;
    const keys = Object.keys(obj);
    return keys.length ? keys[0] : null;
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

    usersTableBody.innerHTML = "";

    const uids = Object.keys(usersMap);
    if (uids.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="6">No hay usuarios todavía.</td></tr>`;
      return;
    }

    for (const uid of uids) {
      const user = usersMap[uid] || {};
      const prog = progressMap[uid] || {};

      const paid = listTrueKeys(prog.paidModules);
      const tests = listTrueKeys(prog.passedTests);

      const tr = document.createElement("tr");
      tr.dataset.uid = uid;
      tr.dataset.email = safeLower(user.email);
      tr.dataset.nombre = safeLower(user.nombre);

      tr.innerHTML = `
        <td>${user.email || "-"}</td>
        <td>${user.nombre || "-"}</td>
        <td>${(user.whatsapp || "-")} ${user.pais ? "/ " + user.pais : ""}</td>
        <td>${paid}</td>
        <td>${tests}</td>
        <td class="action-cell">-</td>
      `;

      const pendModule = firstKey(prog.paymentPending);
      if (pendModule) {
        const cell = tr.querySelector(".action-cell");
        cell.textContent = "";

        const box = document.createElement("div");
        box.className = "pending-box";
        box.innerHTML = `<strong>Mód. ${pendModule}</strong> <span class="small">Pago directo</span>`;

        const btnA = document.createElement("button");
        btnA.className = "btn-sm btn-approve";
        btnA.textContent = "Aprobar";
        btnA.onclick = async () => {
          const ref = doc(db, "userProgress", uid);
          const snap = await getDoc(ref);
          const data = snap.exists() ? (snap.data() || {}) : {};
          if (!data.paidModules) data.paidModules = {};
          if (!data.paymentPending) data.paymentPending = {};
          data.paidModules[String(pendModule)] = true;
          delete data.paymentPending[String(pendModule)];
          await setDoc(ref, data, { merge: true });
          await loadData();
        };

        const btnR = document.createElement("button");
        btnR.className = "btn-sm btn-reject";
        btnR.textContent = "Rechazar";
        btnR.onclick = async () => {
          const ref = doc(db, "userProgress", uid);
          const snap = await getDoc(ref);
          const data = snap.exists() ? (snap.data() || {}) : {};
          if (!data.paymentPending) data.paymentPending = {};
          delete data.paymentPending[String(pendModule)];
          await setDoc(ref, data, { merge: true });
          await loadData();
        };

        box.appendChild(btnA);
        box.appendChild(btnR);
        cell.appendChild(box);
      }

      usersTableBody.appendChild(tr);
      renderedRows.push(tr);
    }
  }

  searchInput?.addEventListener("input", () => {
    const s = safeLower(searchInput.value);
    renderedRows.forEach(row => {
      const email = row.dataset.email || "";
      const nombre = row.dataset.nombre || "";
      row.style.display = (email.includes(s) || nombre.includes(s)) ? "" : "none";
    });
  });

  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "./admin-login.html";
  });

  // show session + load
  if (authStatus && auth?.currentUser) authStatus.textContent = `Sesión: ${auth.currentUser.email}`;
  await loadData();
}



// ---------- auth gate ----------
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

// ---------- page detection ----------
const isDashboardPage = !!document.getElementById("usersTableBody");     // admin-dashboard.html
const isModulesPage   = !!document.getElementById("modulesTableBody");   // admin-module.html
const isClassesPage   = !!document.getElementById("classesTableBody");   // admin-class.html
const isQuestionsPage = !!document.getElementById("saveQuestionAllBtn"); // admin-questions.html ✅
const isEditorPage    = !!document.getElementById("questionText");       // admin.html




// ---------- shared top UI ----------
const authStatus = $("authStatus");
const logoutBtn = $("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

// =====================================================================
//  PAGE: admin-module.html  (list + add/edit module)
// =====================================================================
async function initModulesPage() {
  console.log("✅ initModulesPage() RUNNING");

  const statusMsg = $("statusMsg");

  const moduleIdEl = $("moduleId");
  const moduleTitleEl = $("moduleTitle");
  const moduleOrderEl = $("moduleOrder");
  const modulePriceEl = $("modulePrice");
  const moduleActiveEl = $("moduleActive");
  const saveModuleBtn = $("saveModuleBtn");

  const tableBody = $("modulesTableBody");
  const goEditorBtn = $("goEditorBtn");
  if (goEditorBtn) goEditorBtn.addEventListener("click", () => {
    window.location.href = "./admin-dashboard.html";
  });

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
        flash(statusMsg, "✅ Módulo cargado para editar.");
      });
    });

    tableBody.querySelectorAll("[data-open-classes]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mId = btn.getAttribute("data-open-classes");
        window.location.href = `./admin-class.html?moduleId=${encodeURIComponent(mId)}`;
      });
    });
  }

  saveModuleBtn.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    if (!moduleId) return flash(statusMsg, "Falta ID u Orden del módulo.", false);

    const data = {
      title: val(moduleTitleEl),
      order: num(moduleOrderEl, 1),
      price: num(modulePriceEl, 0),
      active: val(moduleActiveEl) === "true",
      updatedAt: Date.now()
    };

    await setDoc(doc(db, "modules", moduleId), data, { merge: true });
    moduleIdEl.value = moduleId;
    flash(statusMsg, "✅ Módulo guardado.");
    await refreshModulesList();
  });

  await refreshModulesList();
}

// =====================================================================
//  PAGE: admin-class.html  (list + add/edit class for a module)
// =====================================================================




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

  const backBtn = $("backModulesBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    window.location.href = "./admin-module.html";
  });

  // show module info
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
        const ref = doc(db, "modules", moduleId, "classes", cId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const c = snap.data() || {};
        classIdEl.value = cId;
        classTitleEl.value = c.title ?? "";
        classOrderEl.value = c.order ?? "";
        classVideoUrlEl.value = c.videoUrl ?? "";
        classPassScoreEl.value = c.passScore ?? 80;
        classActiveEl.value = String(!!c.active);
        flash(statusMsg, "✅ Clase cargada para editar.");
      });
    });

    classesBody.querySelectorAll("[data-edit-questions]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cId = btn.getAttribute("data-edit-questions");
        window.location.href = `./admin-questions.html?moduleId=${encodeURIComponent(moduleId)}&classId=${encodeURIComponent(cId)}`;

      });
    });
  }

  saveClassBtn.addEventListener("click", async () => {
    const classId = resolveId(classIdEl, classOrderEl);
    if (!classId) return flash(statusMsg, "Falta ID u Orden de la clase.", false);

    const data = {
      title: val(classTitleEl),
      order: num(classOrderEl, 1),
      videoUrl: val(classVideoUrlEl),
      passScore: num(classPassScoreEl, 80),
      active: val(classActiveEl) === "true",
      updatedAt: Date.now()
    };

    await setDoc(doc(db, "modules", moduleId, "classes", classId), data, { merge: true });
    classIdEl.value = classId;
    flash(statusMsg, "✅ Clase guardada.");
    await refreshClassesList();
  });

  loadClassBtn.addEventListener("click", async () => {
    const classId = resolveId(classIdEl, classOrderEl);
    if (!classId) return flash(statusMsg, "Pon ID u Orden de la clase para cargar.", false);

    const ref = doc(db, "modules", moduleId, "classes", classId);
    const snap = await getDoc(ref);
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

// =====================================================================
//  PAGE: admin-questions.html  (questions for a specific class)
// =====================================================================
async function initQuestionsPage() {
  console.log("✅ initQuestionsPage() RUNNING");

  const statusMsg = $("statusMsg");
  const classInfo = document.getElementById("classInfo");

  const moduleId = getParam("moduleId");
  const classId  = getParam("classId");

  if (!moduleId || !classId) {
    if (classInfo) classInfo.textContent = "❌ Falta moduleId / classId en la URL.";
    alert("Faltan parámetros en la URL: moduleId y classId.");
    return;
  }

  // Buttons (your HTML ids)
  const backBtn = document.getElementById("backClassesBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = `./admin-class.html?moduleId=${encodeURIComponent(moduleId)}`;
    });
  }

  // Form fields (your HTML ids)
  const saveBtn          = document.getElementById("saveQuestionAllBtn");
  const questionIdEl     = document.getElementById("questionId");
  const questionOrderEl  = document.getElementById("questionOrder");
  const correctIndexEl   = document.getElementById("correctIndex");
  const questionActiveEl = document.getElementById("questionActive");
  const questionTextEl   = document.getElementById("questionText");

  const a0 = document.getElementById("a0");
  const a1 = document.getElementById("a1");
  const a2 = document.getElementById("a2");
  const a3 = document.getElementById("a3");

  const tableBody = document.getElementById("questionsTableBody");

  // Show which class we’re editing
  try {
    const cSnap = await getDoc(doc(db, "modules", moduleId, "classes", classId));
    const c = cSnap.exists() ? (cSnap.data() || {}) : {};
    if (classInfo) classInfo.textContent = `Módulo ${moduleId} → Clase ${classId}: ${c.title || ""}`;
  } catch (e) {
    console.warn("No pude cargar classInfo:", e);
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

  // Sync correctIndex input when radio changes
  document.querySelectorAll('input[name="correctPick"]').forEach(r => {
    r.addEventListener("change", () => {
      const idx = pickedCorrectIndex();
      if (idx !== null && correctIndexEl) correctIndexEl.value = String(idx);
    });
  });

  async function renderList() {
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="3" class="small">Cargando…</td></tr>`;

    const qCol = collection(db, "modules", moduleId, "classes", classId, "questions");
    const snap = await getDocs(query(qCol, orderBy("order", "asc")));

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
          <td><button type="button" class="btn btn-ghost" data-edit-q="${d.id}">Editar</button></td>
        </tr>
      `);
    });

    tableBody.innerHTML = rows.join("");

    tableBody.querySelectorAll("[data-edit-q]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const qId = btn.getAttribute("data-edit-q");

        const qRef = doc(db, "modules", moduleId, "classes", classId, "questions", qId);
        const qSnap = await getDoc(qRef);
        if (!qSnap.exists()) return;

        const q = qSnap.data() || {};
        questionIdEl.value = qId;
        questionOrderEl.value = q.order ?? "";
        questionActiveEl.value = String(!!q.active);
        questionTextEl.value = q.text ?? "";

        const idx = (typeof q.correctIndex === "number") ? q.correctIndex : 0;
        correctIndexEl.value = String(idx);
        setRadio(idx);

        const ansCol = collection(db, "modules", moduleId, "classes", classId, "questions", qId, "answers");
        const ansSnap = await getDocs(ansCol);

        const map = {};
        ansSnap.forEach(x => (map[x.id] = x.data()));

        a0.value = map["0"]?.text ?? "";
        a1.value = map["1"]?.text ?? "";
        a2.value = map["2"]?.text ?? "";
        a3.value = map["3"]?.text ?? "";

        flash(statusMsg, "✅ Pregunta cargada.");
      });
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        const qId = resolveId(questionIdEl, questionOrderEl) || String(Date.now());
        const order = num(questionOrderEl, 1);

        let idx = pickedCorrectIndex();
        if (idx === null) {
          const ci = parseInt((correctIndexEl?.value || "0"), 10);
          idx = [0, 1, 2, 3].includes(ci) ? ci : null;
        }
        if (idx === null) return alert("Selecciona la respuesta correcta (A–D).");

        const qText = val(questionTextEl);
        const answers = [val(a0), val(a1), val(a2), val(a3)];

        if (!qText) return alert("Falta texto de la pregunta.");
        if (answers.some(x => !x)) return alert("Faltan respuestas (A–D).");

        const active = (val(questionActiveEl) === "true");

        await setDoc(
          doc(db, "modules", moduleId, "classes", classId, "questions", qId),
          { text: qText, order, correctIndex: idx, active, updatedAt: Date.now() },
          { merge: true }
        );

        for (let i = 0; i < 4; i++) {
          await setDoc(
            doc(db, "modules", moduleId, "classes", classId, "questions", qId, "answers", String(i)),
            { text: answers[i], order: i, active: true, updatedAt: Date.now() },
            { merge: true }
          );
        }

        questionIdEl.value = qId;
        flash(statusMsg, "✅ Guardado.");
        await renderList();
      } catch (err) {
        console.error("❌ Error guardando pregunta:", err);
        flash(statusMsg, "❌ No se pudo guardar. Mira Console (F12).", false);
      }
    });
  }

  await renderList();
}



// =====================================================================
//  PAGE: admin.html  (your existing editor: module/class/question/answers)
//  NOTE: we only add: read URL params moduleId/classId and prefill.
// =====================================================================
async function initEditorPage() {
  // your existing IDs (from admin.html)
  const statusMsg = $("statusMsg");

  const moduleIdEl = $("moduleId");
  const moduleTitleEl = $("moduleTitle");
  const moduleOrderEl = $("moduleOrder");
  const modulePriceEl = $("modulePrice");
  const moduleActiveEl = $("moduleActive");
  const saveModuleBtn = $("saveModuleBtn");

  const classIdEl = $("classId");
  const classTitleEl = $("classTitle");
  const classOrderEl = $("classOrder");
  const classVideoUrlEl = $("classVideoUrl");
  const classPassScoreEl = $("classPassScore");
  const classActiveEl = $("classActive");
  const saveClassBtn = $("saveClassBtn");
  const loadClassBtn = $("loadClassBtn");

  const questionIdEl = $("questionId");
  const questionOrderEl = $("questionOrder");
  const correctIndexEl = $("correctIndex");
  const questionActiveEl = $("questionActive");
  const saveQuestionBtn = $("saveQuestionBtn");
  const loadQuestionBtn = $("loadQuestionBtn");
  const questionTextEl = $("questionText");

  const a0 = $("a0");
  const a1 = $("a1");
  const a2 = $("a2");
  const a3 = $("a3");
  const saveAnswersBtn = $("saveAnswersBtn");

  const refreshListBtn = $("refreshListBtn");
  const quickList = $("quickList");

  // --- Radio -> correctIndex ---
  function syncCorrectIndexFromRadio() {
    const picked = document.querySelector('input[name="correctPick"]:checked');
    if (!picked) return null;
    const idx = parseInt(picked.value, 10);
    if (![0, 1, 2, 3].includes(idx)) return null;
    if (correctIndexEl) correctIndexEl.value = String(idx);
    return idx;
  }
  function setRadioFromCorrectIndex(idx) {
    const radios = document.querySelectorAll('input[name="correctPick"]');
    radios.forEach(r => (r.checked = (parseInt(r.value, 10) === idx)));
    if (correctIndexEl) correctIndexEl.value = String(idx);
  }
  document.addEventListener("change", (e) => {
    if (e.target && e.target.name === "correctPick") syncCorrectIndexFromRadio();
  });

  // --- SAVE MODULE ---
  saveModuleBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    if (!moduleId) return flash(statusMsg, "Falta ID u Orden del módulo.", false);

    const data = {
      title: val(moduleTitleEl),
      order: num(moduleOrderEl, 1),
      price: num(modulePriceEl, 0),
      active: val(moduleActiveEl) === "true",
      updatedAt: Date.now()
    };
    await setDoc(doc(db, "modules", moduleId), data, { merge: true });
    moduleIdEl.value = moduleId;
    flash(statusMsg, "✅ Módulo guardado.");
  });

  // --- SAVE CLASS ---
  saveClassBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    if (!moduleId) return flash(statusMsg, "Falta ID u Orden del módulo.", false);

    const classId = resolveId(classIdEl, classOrderEl);
    if (!classId) return flash(statusMsg, "Falta ID u Orden de la clase.", false);

    const data = {
      title: val(classTitleEl),
      order: num(classOrderEl, 1),
      videoUrl: val(classVideoUrlEl),
      passScore: num(classPassScoreEl, 80),
      active: val(classActiveEl) === "true",
      updatedAt: Date.now()
    };

    await setDoc(doc(db, "modules", moduleId, "classes", classId), data, { merge: true });
    moduleIdEl.value = moduleId;
    classIdEl.value = classId;
    flash(statusMsg, "✅ Clase guardada.");
    await refreshQuickList();
  });

  // --- LOAD CLASS ---
  loadClassBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    const classId = resolveId(classIdEl, classOrderEl);
    if (!moduleId || !classId) return flash(statusMsg, "Pon Módulo y Clase (ID u Orden) para cargar.", false);

    const ref = doc(db, "modules", moduleId, "classes", classId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return flash(statusMsg, "No existe esa clase.", false);

    const d = snap.data();
    classTitleEl.value = d.title ?? "";
    classOrderEl.value = d.order ?? "";
    classVideoUrlEl.value = d.videoUrl ?? "";
    classPassScoreEl.value = d.passScore ?? 80;
    classActiveEl.value = String(!!d.active);
    flash(statusMsg, "✅ Clase cargada.");
  });

  // --- SAVE QUESTION ---
  saveQuestionBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    const classId = resolveId(classIdEl, classOrderEl);
    if (!moduleId || !classId) return flash(statusMsg, "Falta Módulo/Clase.", false);

    const questionId = resolveId(questionIdEl, questionOrderEl);
    if (!questionId) return flash(statusMsg, "Falta ID u Orden de la pregunta.", false);

    const pickedIdx = syncCorrectIndexFromRadio();
    if (pickedIdx === null) {
      alert("Debes seleccionar la respuesta correcta.");
      return;
    }

    const qText = val(questionTextEl);
    if (!qText) return flash(statusMsg, "Falta texto de la pregunta.", false);

    const data = {
      text: qText,
      order: num(questionOrderEl, 1),
      correctIndex: pickedIdx,
      active: val(questionActiveEl) === "true",
      updatedAt: Date.now()
    };

    await setDoc(
      doc(db, "modules", moduleId, "classes", classId, "questions", questionId),
      data,
      { merge: true }
    );

    questionIdEl.value = questionId;
    flash(statusMsg, "✅ Pregunta guardada.");
    await refreshQuickList();
  });

  // --- SAVE ANSWERS ---
  saveAnswersBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    const classId = resolveId(classIdEl, classOrderEl);
    const questionId = resolveId(questionIdEl, questionOrderEl);
    if (!moduleId || !classId || !questionId) return flash(statusMsg, "Falta Módulo/Clase/Pregunta.", false);

    const answers = [val(a0), val(a1), val(a2), val(a3)];
    if (answers.some(x => !x)) return flash(statusMsg, "Faltan respuestas (A–D).", false);

    for (let i = 0; i < 4; i++) {
      await setDoc(
        doc(db, "modules", moduleId, "classes", classId, "questions", questionId, "answers", String(i)),
        { text: answers[i], order: i, active: true, updatedAt: Date.now() },
        { merge: true }
      );
    }

    flash(statusMsg, "✅ Respuestas guardadas.");
    await refreshQuickList();
  });

  // --- LOAD QUESTION + ANSWERS ---
  loadQuestionBtn?.addEventListener("click", async () => {
    const moduleId = resolveId(moduleIdEl, moduleOrderEl);
    const classId = resolveId(classIdEl, classOrderEl);
    const questionId = resolveId(questionIdEl, questionOrderEl);
    if (!moduleId || !classId || !questionId) return flash(statusMsg, "Pon Módulo/Clase/Pregunta para cargar.", false);

    const qRef = doc(db, "modules", moduleId, "classes", classId, "questions", questionId);
    const qSnap = await getDoc(qRef);
    if (!qSnap.exists()) return flash(statusMsg, "No existe esa pregunta.", false);

    const q = qSnap.data();
    questionTextEl.value = q.text ?? "";
    questionOrderEl.value = q.order ?? "";
    questionActiveEl.value = String(!!q.active);
    setRadioFromCorrectIndex(typeof q.correctIndex === "number" ? q.correctIndex : 0);

    const ansCol = collection(db, "modules", moduleId, "classes", classId, "questions", questionId, "answers");
    const ansSnap = await getDocs(ansCol);

    const map = {};
    ansSnap.forEach(d => (map[d.id] = d.data()));

    a0.value = map["0"]?.text ?? "";
    a1.value = map["1"]?.text ?? "";
    a2.value = map["2"]?.text ?? "";
    a3.value = map["3"]?.text ?? "";

    flash(statusMsg, "✅ Pregunta + respuestas cargadas.");
  });

  // --- QUICK LIST ---
  refreshListBtn?.addEventListener("click", refreshQuickList);

  async function refreshQuickList() {
    if (!quickList) return;
    quickList.innerHTML = "<div class='small'>Cargando…</div>";

    const modulesSnap = await getDocs(query(collection(db, "modules"), orderBy("order")));
    const out = [];

    for (const m of modulesSnap.docs) {
      const mId = m.id;
      const mData = m.data() || {};
      out.push(`<div class="item"><div class="item-title">Módulo ${mId}: ${mData.title ?? ""} <span class="pill">order ${mData.order ?? "-"}</span></div>`);

      const classesSnap = await getDocs(query(collection(db, "modules", mId, "classes"), orderBy("order")));
      if (classesSnap.empty) {
        out.push(`<div class="small" style="margin-top:6px;">(sin clases)</div></div>`);
        continue;
      }

      for (const c of classesSnap.docs) {
        const cId = c.id;
        const cData = c.data() || {};
        const qSnap = await getDocs(collection(db, "modules", mId, "classes", cId, "questions"));
        out.push(
          `<div class="small" style="margin-top:8px;">
            └ Clase ${cId}: ${cData.title ?? ""} (preguntas: ${qSnap.size})
          </div>`
        );
      }

      out.push(`</div>`);
    }

    quickList.innerHTML = out.join("") || "<div class='small'>(sin módulos)</div>";
  }

  // ✅ NEW: if we came from admin-class.html, auto-fill moduleId/classId from URL
  const urlModuleId = getParam("moduleId");
  const urlClassId = getParam("classId");
  if (urlModuleId) moduleIdEl.value = urlModuleId;
  if (urlClassId) classIdEl.value = urlClassId;

  if (urlModuleId && urlClassId) {
    // try load class fields automatically (optional but helpful)
    try { await loadClassBtn.click(); } catch (e) {}
  }

  // initial list
  try { await refreshListBtn.click(); } catch (e) {}
}

onAuthStateChanged(auth, async (user) => {
  const ok = await requireAdmin(user);
  if (!ok) return;

  const authStatus = document.getElementById("authStatus");
  if (authStatus) authStatus.textContent = `Sesión: ${user.email}`;

  if (isDashboardPage) await initDashboardPage();
  if (isModulesPage)   await initModulesPage();
  if (isClassesPage)   await initClassesPage();
  if (isQuestionsPage) await initQuestionsPage();  // ✅ THIS MUST RUN
  if (isEditorPage)    await initEditorPage();
});


