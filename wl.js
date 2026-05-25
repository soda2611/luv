/* ========================= 🎁 CONFIG ========================= */

const WL_URL = `${SUPABASE_URL}/rest/v1/wishlist`
const wlList = document.getElementById("wishlist-list")
const check_circle = `<i class="material-icons" style="font-size: 1.6rem">check_circle</i>`
const uncheck_circle = `<i class="material-icons-outlined" style="font-size: 1.6rem">circle</i>`
const delete_icon = `<i class="material-icons" style="color: rgb(255, 45, 45); font-size: 1.25rem">delete</i>`
const link_icon = `<i class="material-icons" style="font-size: 1.25rem">link</i>`
const tag_icon = `<i class="material-icons" style="font-size: 1.25rem">sell</i>`

let wishlistMap = {}

/* ========================= 🎨 PRIORITY ========================= */

function priorityEmoji(p) {
  if (p >= 5) return "😍"
  if (p === 4) return "🤩"
  if (p === 3) return "🌹"
  if (p === 2) return "🤔"
  return "💭"
}

function priorityColor(p) {
  if (p >= 5) return "rgb(255, 64, 64)"
  if (p === 4) return "rgb(255, 128, 51)"
  if (p === 3) return "rgb(255, 204, 51)"
  if (p === 2) return "rgb(77, 191, 89)"
  return "rgb(64, 153, 255)"
}


function updatePriorityLabel(val) {
  
  const emojiMap = {
    1: "💭",
    2: "🤔",
    3: "🌹",
    4: "🤩",
    5: "😍"
  };
  
  document.getElementById("priority-value").innerText = emojiMap[val] + " Mức ưu tiên: " + val;
}

/* ========================= 📦 LOAD ========================= */

async function loadWishlist() {
  if (!wlList) return console.error("Không tìm thấy #wishlist-list")

  wlList.innerHTML = "Đang tải..."

  try {
    const res = await fetch(
      `${WL_URL}?select=*&order=finished.asc&order=category.asc&order=priority.desc`,
      { headers }
    )

    const data = await res.json()

    wlList.innerHTML = ""
    wishlistMap = {}

    if (!data.length) {
      wlList.innerHTML = "<div class='sys'>Chưa có wishlist nào ;-;</div>"
      return
    }

    data.forEach(displayWishlistItem)

  } catch (err) {
    console.error(err)
    wlList.innerHTML = "<div class='sys'>Lỗi tải dữ liệu ;-;</div>"
  }
}

/* ========================= 🧩 RENDER ========================= */

function displayWishlistItem(row) {
  const { id, content, category, note, link, priority, finished } = row

  const card = document.createElement("div")
  card.className = "wl-item"

  card.innerHTML = `
    <div class="wl-head">
      <button class="toggle" style="color: ${priorityColor(priority)}">${finished ? check_circle : uncheck_circle}</button>
      <b style="display: flex; flex-grow: 1;">${content || "(Không có nội dung)"}</b>
      ${category ? `<div style="display: flex; align-items: center; border-radius: 2rem; padding: 0.5rem; padding-inline: 1rem; gap: 0.25rem; background-color: rgba(255, 242, 242, 1); color: ${priorityColor(priority)}">${tag_icon} ${category}</div>` : ""}
    </div>
      
    <div style="display: flex; flex-grow: 1">${note ? `📝 ${note}` : ""}</div>
    <hr>
    <div style="display: flex; align-items: center; gap: 1rem">
      <span style="color: ${priorityColor(priority)}; border-radius: 2rem; padding: 0.5rem; padding-inline: 0.75rem; gap: 0.25rem; background-color: rgba(255, 242, 242, 1)">${priorityEmoji(priority)} Mức ưu tiên: ${priority}</span>
      ${link ? `<a href="${link}" target="_blank" style="display: flex; align-items: center; border-radius: 10rem; background-color: ${priorityColor(priority)}; padding: 0.5rem; padding-inline: 1rem; gap: 0.25rem; color: white">${link_icon} Link</a>` : ""}
      <span style="display: flex; flex-grow: 1"></span>
      <button class="delete">${delete_icon}</button>
    </div>
  `

  /* toggle */
  card.querySelector(".toggle").onclick = () => {
    const btn = card.querySelector(".toggle")
    const isFinished = btn.innerHTML === check_circle
    toggleWishlistFinished(id, !isFinished)
  }

  /* delete */
  card.querySelector(".delete").onclick = () => {
    deleteWishlistItem(id)
  }

  wlList.appendChild(card)
  wishlistMap[id] = card
}

/* ========================= ➕ CREATE ========================= */

async function createWishlist(payload) {
  if (!payload.content.trim()) {
    alert("Nhập nội dung đi bây bê :33")
    return
  }

  try {
    await fetch(WL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    })

    clearForm()

  } catch (err) {
    console.error("CREATE FAIL", err)
  }
}

/* ========================= 🧹 CLEAR ========================= */

function clearForm() {
  document.getElementById("wl-content").value = ""
  document.getElementById("wl-category").value = ""
  document.getElementById("wl-note").value = ""
  document.getElementById("wl-link").value = ""
  document.getElementById("wl-priority").value = 3
}

/* ========================= 🔄 UPDATE ========================= */

async function toggleWishlistFinished(id, value) {
  try {
    await fetch(`${WL_URL}?id=eq.${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ finished: value })
    })

    const item = wishlistMap[id]
    const btn = item.querySelector(".toggle")
    btn.innerHTML = value ? check_circle : uncheck_circle

  } catch (err) {
    console.error("TOGGLE FAIL", err)
  }
}

/* ========================= ❌ DELETE ========================= */

async function deleteWishlistItem(id) {
  try {
    await fetch(`${WL_URL}?id=eq.${id}`, {
      method: "DELETE",
      headers
    })
  } catch (err) {
    console.error("DELETE FAIL", err)
  }
}

/* ========================= 🎯 FORM ========================= */

function handleCreateWL() {
  createWishlist({
    content: document.getElementById("wl-content").value,
    category: document.getElementById("wl-category").value,
    note: document.getElementById("wl-note").value,
    link: document.getElementById("wl-link").value,
    priority: Number(document.getElementById("wl-priority").value),
    finished: false
  })
}

/* ========================= ⚡ REALTIME ========================= */

function startRealtimeWishlist() {
  const ws = new WebSocket(
    `wss://${SUPABASE_URL.replace("https://", "")}/realtime/v1/websocket?apikey=${headers.apikey}`
  )

  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic: "realtime:public:wishlist",
      event: "phx_join",
      payload: {},
      ref: 1
    }))
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    const record = data.payload?.record || data.payload?.old_record
    if (!record) return

    /* DELETE */
    if (data.event === "DELETE") {
      const item = wishlistMap[record.id]

      if (item) {
        item.remove()
        delete wishlistMap[record.id]
      } else {
        loadWishlist()
      }
    }

    /* UPDATE */
    if (data.event === "UPDATE") {
      const item = wishlistMap[record.id]

      if (!item) return loadWishlist()

      const btn = item.querySelector(".toggle")
      btn.innerHTML = record.finished ? check_circle : uncheck_circle
    }

    /* INSERT */
    if (data.event === "INSERT") {
      if (!wishlistMap[record.id]) {
        displayWishlistItem(record)
      }
    }
  }
}

/* ========================= 🚀 START ========================= */
loadWishlist();
startRealtimeWishlist();