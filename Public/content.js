import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ✅ Your Firebase config (same project you already use)
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

// -------------------- UI helpers --------------------
const $ = (id) => document.getElementById(id);
const statusMsg = $("statusMsg");
const quickList = $("quickList");

function say(msg) {
  statusMsg.textContent = msg;
  setTimeout(() => { statusMsg.textContent = ""; }, 4000);
}

function boolVal(selectEl) {
  return selectEl.value === "true";
}

function cleanIdOrOrder(idValue, orderValue) {
  const id = (idValue || "").trim();
  if (id) return id;
  const ord = String(orderValue ?? "").trim();
  return ord || "";
}

function requireBasics() {
  const moduleId = cleanIdOrOrder($("moduleId").value, $("moduleOrder").value);
  const classId = cleanIdOrOrder($("classId").value, $("classOrder").value);

  if (!moduleId) throw new Error("Falta Module ID (o Order).");
  if (!classId) throw new Error("Falta Class ID (o Order).");

  return { moduleId, classId };
}

// -------------------- Auth --------------------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    $("authStatus").textContent = "⚠️ No has iniciado sesión. Abre /login.html primero.";
    // If you prefer to force redirect:
    // window.location.href = "./login.html";
    return;
  }
  $("authStatus").textContent = `✅ Sesión: ${user.email}`;
});

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "./login.html";
});

// -------------------- Save Module --------------------
$("saveModuleBtn").addEventListener("click", async () => {
  try {
    const moduleId = cleanIdOrOrder($("moduleId").value, $("moduleOrder").value);
    if (!moduleId) throw new Error("Falta Module ID (o Order).");

    const payload = {
      title: $("moduleTitle").value.trim() || `Módulo ${moduleId}`,
      order: Number($("moduleOrder").value || 0),
      price: Number($("modulePrice").value || 0),
      active: boolVal($("moduleActive")),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "modules", moduleId), payload, { merge: true });
    say(`✅ Módulo ${moduleId} guardado.`);
    await refreshQuickList();
  } catch (e) {
    alert(e.message || String(e));
  }
});

// -------------------- Save / Load Class --------------------
$("saveClassBtn").addEventListener("click", async () => {
  try {
    const { moduleId, classId } = requireBasics();

    const payload = {
      title: $("classTitle").value.trim() || `Clase ${classId}`,
      order: Number($("classOrder").value || 0),
      videoUrl: $("classVideoUrl").value.trim() || "",
      passScore: Number($("classPassScore").value || 80),
      active: boolVal($("classActive")),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "modules", moduleId, "classes", classId), payload, { merge: true });
    say(`✅ Clase ${moduleId}/${classId} guardada.`);
    await refreshQuickList();
  } catch (e) {
    alert(e.message || String(e));
  }
});

$("loadClassBtn").addEventListener("click", async () => {
  try {
    const { moduleId, classId } = requireBasics();
    const snap = await getDoc(doc(db, "modules", moduleId, "classes", classId));
    if (!snap.exists()) {
      alert("No existe esa clase todavía.");
      return;
    }
    const d = snap.data();
    $("classTitle").value = d.title ?? "";
    $("classOrder").value = d.order ?? "";
    $("classVideoUrl").value = d.videoUrl ?? "";
    $("classPassScore").value = d.passScore ?? 80;
    $("classActive").value = String(!!d.active);
    say("✅ Clase cargada.");
  } catch (e) {
    alert(e.message || String(e));
  }
});

// -------------------- Save / Load Question --------------------
$("saveQuestionBtn").addEventListener("click", async () => {
  try {
    const { moduleId, classId } = requireBasics();
    const questionId = cleanIdOrOrder($("questionId").value, $("questionOrder").value);
    if (!questionId) throw new Error("Falta Question ID (o Order).");

    const payload = {
      text: $("questionText").value.trim() || "",
      order: Number($("questionOrder").value || 0),
      correctIndex: Number($("correctIndex").value || 0),
      active: boolVal($("questionActive")),
      updatedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "modules", moduleId, "classes", classId, "questions", questionId),
      payload,
      { merge: true }
    );

    say(`✅ Pregunta ${questionId} guardada.`);
    await refreshQuickList();
  } catch (e) {
    alert(e.message || String(e));
  }
});

$("loadQuestionBtn").addEventListener("click", async () => {
  try {
    const { moduleId, classId } = requireBasics();
    const questionId = cleanIdOrOrder($("questionId").value, $("questionOrder").value);
    if (!questionId) throw new Error("Falta Question ID (o Order).");

    const snap = await getDoc(doc(db, "modules", moduleId, "classes", classId, "questions", questionId));
    if (!snap.exists()) {
      alert("No existe esa pregunta todavía.");
      return;
    }
    const d = snap.data();
    $("questionText").value = d.text ?? "";
    $("questionOrder").value = d.order ?? "";
    $("correctIndex").value = d.correctIndex ?? 0;
    $("questionActive").value = String(!!d.active);
    say("✅ Pregunta cargada.");

    // Load answers 0..3 if exist
    for (let i = 0; i < 4; i++) {
      const aSnap = await getDoc(doc(db, "modules", moduleId, "classes", classId, "questions", questionId, "answers", String(i)));
      $(`a${i}`).value = aSnap.exists() ? (aSnap.data().text ?? "") : "";
    }
  } catch (e) {
    alert(e.message || String(e));
  }
});

// -------------------- Save Answers (0..3) --------------------
$("saveAnswersBtn").addEventListener("click", async () => {
  try {
    const { moduleId, classId } = requireBasics();
    const questionId = cleanIdOrOrder($("questionId").value, $("questionOrder").value);
    if (!questionId) throw new Error("Falta Question ID (o Order).");

    // save 4 answers with ids "0","1","2","3"
    for (let i = 0; i < 4; i++) {
      const text = $(`a${i}`).value.trim();
      await setDoc(
        doc(db, "modules", moduleId, "classes", classId, "questions", questionId, "answers", String(i)),
        {
          text,
          order: i,
          active: true,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }

    say("✅ Respuestas guardadas (0–3).");
    await refreshQuickList();
  } catch (e) {
    alert(e.message || String(e));
  }
});

// -------------------- Quick list --------------------
$("refreshListBtn").addEventListener("click", refreshQuickList);

async function refreshQuickList() {
  quickList.innerHTML = "";

  const moduleId = cleanIdOrOrder($("moduleId").value, $("moduleOrder").value);
  if (!moduleId) {
    quickList.innerHTML = `<div class="small">Pon un Module ID y presiona “Refrescar lista”.</div>`;
    return;
  }

  // list classes under module
  const classesSnap = await getDocs(collection(db, "modules", moduleId, "classes"));
  if (classesSnap.empty) {
    quickList.innerHTML = `<div class="small">No hay clases en el módulo ${moduleId} todavía.</div>`;
    return;
  }

  for (const c of classesSnap.docs) {
    const cd = c.data();
    const classId = c.id;

    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="row">
        <div class="item-title">Clase ${classId}: ${cd.title ?? ""}</div>
        <span class="pill">order: ${cd.order ?? ""}</span>
        <span class="pill">passScore: ${cd.passScore ?? ""}</span>
        <span class="pill">active: ${String(!!cd.active)}</span>
        <button class="btn btn-ghost right" data-load-class="${classId}">Cargar clase</button>
      </div>
      <div class="small" style="margin-top:6px;">Video: ${cd.videoUrl ?? ""}</div>
      <div class="small" style="margin-top:6px;" id="q-${classId}">Cargando preguntas…</div>
    `;
    quickList.appendChild(div);

    // load questions summary
    const qSnap = await getDocs(collection(db, "modules", moduleId, "classes", classId, "questions"));
    const qLine = div.querySelector(`#q-${classId}`);

    if (qSnap.empty) {
      qLine.textContent = "Preguntas: (ninguna)";
    } else {
      const arr = qSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (a.order ?? 0) - (b.order ?? 0))
        .map(q => `#${q.id} (order ${q.order ?? ""}, correct ${q.correctIndex ?? ""})`)
        .join(" | ");
      qLine.textContent = `Preguntas: ${arr}`;
    }
  }

  // button actions
  quickList.querySelectorAll("[data-load-class]").forEach(btn => {
    btn.addEventListener("click", () => {
      const classId = btn.getAttribute("data-load-class");
      $("classId").value = classId;
      $("loadClassBtn").click();
    });
  });
}
