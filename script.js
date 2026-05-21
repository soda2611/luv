/* ========================= 🧠 DATE FORMAT ========================= */

flatpickr("#datePicker", {
  dateFormat: "d/m/Y",   // dd/MM/yyyy
  altInput: true,
  altFormat: "d/m/Y",    // format hiển thị
});

function formatDateVN(input) {
  if (!input) return "";

  // yyyy-mm-dd
  if (typeof input === "string" && input.includes("-")) {
    const [y, m, d] = input.split("-");
    return `${d.padStart(2,"0")}/${m.padStart(2,"0")}/${y}`;
  }

  // dd/mm/yyyy
  if (typeof input === "string" && input.includes("/")) {
    const [d, m, y] = input.split("/");
    return `${d.padStart(2,"0")}/${m.padStart(2,"0")}/${y}`;
  }

  return input;
}

function getCurrentDate() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2,"0");
  const m = String(now.getMonth()+1).padStart(2,"0");
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

function getCurrentTime() {
  return new Date().toTimeString().slice(0, 5);
}

/* ========================= 👤 UID ========================= */

let userId = localStorage.getItem("uid");

if (!userId) {
  userId = "user_" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem("uid", userId);
}

updateUIDUI();

function updateUIDUI() {
  document.getElementById("id-tag").innerText = userId;
}

/* ========================= 📦 MODAL ========================= */

function openUIDModal() {
  closeNav();
  document.getElementById("uid-modal").style.display = "flex";
}

function saveUID() {
  const val = document.getElementById("uid-input").value.trim();
  if (!val) return;

  userId = val;
  localStorage.setItem("uid", val);

  updateUIDUI();
  closeModal();
}

function openDatePicker() {
  closeNav();
  document.getElementById("date-modal").style.display = "flex";
}

function confirmDate() {
  const val = document.getElementById("datePicker").value;
  if (!val) return;

  loadMessages(formatDateVN(val));
  closeModal();
}

function closeModal() {
  document.getElementById("date-modal").style.display = "none";
  document.getElementById("uid-modal").style.display = "none";
}

window.onclick = function(e) {
  document.querySelectorAll(".modal").forEach(m => {
    if (e.target === m) m.style.display = "none";
  });
};

/* ========================= 🌐 CONFIG ========================= */

const SUPABASE_URL = "https://fjhakjrxbdiowjkppgzy.supabase.co";

const headers = {
  apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGFranJ4YmRpb3dqa3BwZ3p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMDM3MDQsImV4cCI6MjA4NTU3OTcwNH0.4m-t-4jzXj1yVEajD1Gwukf5GxchdaLMl-0PaJr5BR0",
  Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGFranJ4YmRpb3dqa3BwZ3p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMDM3MDQsImV4cCI6MjA4NTU3OTcwNH0.4m-t-4jzXj1yVEajD1Gwukf5GxchdaLMl-0PaJr5BR0",
  "Content-Type": "application/json"
};

let msgIdMap = {};
let lastDate = null;
let lookupDate = getCurrentDate();

/* ========================= 🟡 UI ========================= */

const msgCtn = document.getElementById("msg-ctn");

function clearMessageUI() {
  msgCtn.innerHTML = "";
}

function renderDateHeader(date) {
  const div = document.createElement("div");
  div.className = "date";
  div.innerText = formatDateVN(date);
  msgCtn.appendChild(div);
}

function toTime(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m; // convert sang phút
}

function createMessageCard(sender, content, time) {
  const box = document.createElement("div");

  box.className = "msg";
  box.dataset.sender = sender;
  box.dataset.time = time;

  const current = toTime(time);

  const emoji = (current >= toTime("05:00") && current <= toTime("18:00"))
  ? "☀️"
  : "⭐";

  box.innerHTML = `
    <div class="meta"><b>${sender} • ${time}</b> ${emoji}</div>
    <div class="content">${content}</div>
  `;

  msgCtn.appendChild(box);
  return box;
}

function appendToLastMessage(content) {
  const last = msgCtn.lastElementChild;
  if (!last) return;

  const contentDiv = last.querySelector(".content");
  if (contentDiv) {
    contentDiv.innerHTML += `<br>${content}`;
  }
}

function getLastMessage() {
  const last = msgCtn.lastElementChild;

  if (!last || !last.classList.contains("msg")) return null;

  return {
    sender: last.dataset.sender,
    time: last.dataset.time,
  };
}

function scrollToBottom() {
  msgCtn.scrollTop = msgCtn.scrollHeight;
}

/* ========================= 🚀 LOGIC ========================= */

function timeDiff(t1, t2) {
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  return Math.abs((h2 * 60 + m2) - (h1 * 60 + m1));
}

async function sendMessage(userId, content) {
  if (!content.trim()) return;

  const data = {
    sender: userId,
    content,
    created_at: getCurrentTime(),
    date: getCurrentDate()
  };

  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(data)
  });
}

async function loadMessages(dateStr) {

  lookupDate = formatDateVN(dateStr);

  lastDate = null;
  clearMessageUI();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?select=*&date=eq.${lookupDate}&order=created_at.asc`,
    { headers }
  );

  const rows = await res.json();

  if (!rows.length) {
    msgCtn.innerHTML = "<div class='sys'>Không có tin nhắn nào ;-;</div>";
    return;
  }

  rows.forEach(displayMessage);
  scrollToBottom();
}

function displayMessage({ sender, content, created_at, date, id }) {

  date = formatDateVN(date);

  if (!lastDate || lastDate !== date) {
    renderDateHeader(date);
    lastDate = date;
  }

  const last = getLastMessage();
  let shouldMerge = false;

  if (last && last.sender === sender) {
    if (timeDiff(last.time, created_at) <= 1) {
      shouldMerge = true;
    }
  }

  if (shouldMerge) {
    appendToLastMessage(content);
  } else {
    createMessageCard(sender, content, created_at);
  }

  msgIdMap[id] = true;
}

/* ========================= ⚡ REALTIME ========================= */

function startRealtime() {
  const ws = new WebSocket(
    `wss://${SUPABASE_URL.replace("https://", "")}/realtime/v1/websocket?apikey=${headers.apikey}`
  );

  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic: "realtime:public:messages",
      event: "phx_join",
      payload: {},
      ref: 1
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const record = data.payload?.record;

    if (!record) return;

    if (data.event === "INSERT") {

      const msgDate = formatDateVN(record.date);
      const currentDate = getCurrentDate();

      // ✅ realtime luôn chạy
      if (msgDate === currentDate) {
        displayMessage(record);
        scrollToBottom();
      }
    }
  };
}

/* ========================= 🎯 INPUT ========================= */

const input = document.getElementById("inp");
const sendBtn = document.querySelector("#msg-inp i");

if (sendBtn && input) {
  sendBtn.onclick = () => {
    sendMessage(userId, input.value);
    input.value = "";
  };

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
}

/* ========================= 🚀 START ========================= */

loadMessages(getCurrentDate());
startRealtime();

/* ========================= ⚙️ NAV ========================= */

function openNav() {
  document.getElementById("sidenav").style.top = "0";
}

function closeNav() {
  document.getElementById("sidenav").style.top = "100%";
}