document.addEventListener('DOMContentLoaded', () => {
  const whiteboard = document.getElementById('whiteboard');
  const wbScroll = document.getElementById('wb-scroll');
  const toolbar = document.getElementById('wb-toolbar');

  // Create a large canvas inside the whiteboard for drawing
  const canvas = document.createElement('canvas');
  // Use a large (but reasonable) drawable area. You can increase this if needed.
  const CANVAS_SIZE = 10000;
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  canvas.style.width = CANVAS_SIZE + 'px';
  canvas.style.height = CANVAS_SIZE + 'px';
  canvas.style.background = 'white';
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.id = 'wb-canvas';
  canvas.style.touchAction = 'none'; // let pointer events handle touch
  whiteboard.appendChild(canvas);

  // Reference resolution used by Kivy main.py for normalization
  const REF_W = 1080;
  const REF_H = 1920;

  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Stroke storage
  const strokes = {}; // id -> { id, points: [[x,y],...], width, color }
  const drawOrder = []; // list of stroke ids in creation order for undo
  // Widget storage (normalized coords relative to display width/height)
  const widgets = {}; // id -> { id, x, y, w, h, text }

  // Tool: pen / eraser
  let tool = 'pen'; // 'pen' | 'eraser'
  const eraserRadiusDefault = 16;
  
  // helpers: convert hex color to normalized RGBA array
  function hexToRGBA(hex) {
    if (!hex) return [1, 0.42, 0.6, 1];
    const v = hex.replace('#', '');
    const r = parseInt(v.substring(0, 2), 16) / 255;
    const g = parseInt(v.substring(2, 4), 16) / 255;
    const b = parseInt(v.substring(4, 6), 16) / 255;
    return [r, g, b, 1];
  }

  // normalize point for DB: ny uses (canvas.height - y)/h to match Kivy client
  function toNorm(pt) {
    const [x, y] = pt;
    return [x / canvas.width, (canvas.height - y) / canvas.height];
  }

  function fromNorm(nx, ny) {
    // Kivy stores normalized points relative to its whiteboard width/height (REF_W/REF_H).
    // Convert normalized -> reference coords, then scale to this canvas buffer.
    const x_ref = nx * REF_W;
    const y_ref = REF_H - (ny * REF_H);
    const sx = canvas.width / REF_W;
    const sy = canvas.height / REF_H;
    return [x_ref * sx, y_ref * sy];
  }

  // display size helper for DOM positioning (in CSS/display pixels)
  function getDisplaySize() {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width || canvas.width, h: rect.height || canvas.height };
  }

  // simple UUID generator fallback
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // draw a stroke on canvas from absolute points
  function renderStrokeOnContext(s) {
    if (!s || !s.points || s.points.length === 0) return;
    ctx.save();
    ctx.beginPath();
    const p0 = s.points[0];
    ctx.moveTo(p0[0] * posScale, p0[1] * posScale);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * posScale, s.points[i][1] * posScale);
    // apply color with alpha when available
    if (s.color && Array.isArray(s.color)) {
      ctx.strokeStyle = colorStrFromArr(s.color);
      ctx.globalAlpha = (typeof s.color[3] === 'number') ? s.color[3] : 1.0;
    } else if (s.colorHex) {
      ctx.strokeStyle = s.colorHex;
      ctx.globalAlpha = 1.0;
    } else {
      ctx.strokeStyle = rgbFromArr(s.color);
      ctx.globalAlpha = 1.0;
    }
    ctx.lineWidth = (s.width || 4) * renderScale;
    ctx.stroke();
    ctx.restore();
  }

  

  function rgbFromArr(arr) {
    if (!arr) return '#ff6b9a';
    const r = Math.round((arr[0] || 0) * 255);
    const g = Math.round((arr[1] || 0) * 255);
    const b = Math.round((arr[2] || 0) * 255);
    return `rgb(${r},${g},${b})`;
  }

  function colorStrFromArr(arr) {
    if (!arr) return 'rgba(255,107,154,1)';
    const r = Math.round((arr[0] || 0) * 255);
    const g = Math.round((arr[1] || 0) * 255);
    const b = Math.round((arr[2] || 0) * 255);
    const a = (typeof arr[3] === 'number') ? arr[3] : 1.0;
    return `rgba(${r},${g},${b},${a})`;
  }

  // Clear and redraw all strokes (used after loading or deletion)
  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const id of drawOrder) {
      const s = strokes[id];
      if (s) renderStrokeOnContext(s);
    }
    // NOTE: widget visuals are rendered as DOM elements now; skip canvas widget rendering
    console.log('[wb] redrawAll: strokes=', drawOrder.length, 'widgets=', Object.keys(widgets).length);
  }

  // Hit-testing helpers ported from main.py
  function pointSegmentDist2(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) {
      const dx = px - x1, dy = py - y1;
      return dx * dx + dy * dy;
    }
    const t = (wx * vx + wy * vy) / len2;
    let dx, dy;
    if (t < 0) {
      dx = px - x1; dy = py - y1;
    } else if (t > 1) {
      dx = px - x2; dy = py - y2;
    } else {
      const projx = x1 + t * vx;
      const projy = y1 + t * vy;
      dx = px - projx; dy = py - projy;
    }
    return dx * dx + dy * dy;
  }

  function circleHitsPolyline(cx, cy, r, points, pen_w = 0.0) {
    return circleHitsPolylineScaled(cx, cy, r, points, pen_w, 1.0);
  }

  function circleHitsPolylineScaled(cx, cy, r, points, pen_w = 0.0, scale = 1.0) {
    if (!points || points.length === 0) return false;
    const cxs = cx * scale;
    const cys = cy * scale;
    const eff_r = (r * scale) + Math.max(1.0, pen_w * scale) / 2.0;
    const r2 = eff_r * eff_r;
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const d2 = pointSegmentDist2(cxs, cys, x1 * scale, y1 * scale, x2 * scale, y2 * scale);
      if (d2 <= r2) return true;
    }
    // check endpoints
    let dx = cxs - (points[0][0] * scale), dy = cys - (points[0][1] * scale);
    if (dx * dx + dy * dy <= r2) return true;
    dx = cxs - (points[points.length - 1][0] * scale); dy = cys - (points[points.length - 1][1] * scale);
    if (dx * dx + dy * dy <= r2) return true;
    return false;
  }

  // Server sync: create / patch / delete
  function postStrokeToServer(s) {
    try {
      const payload = {
        id: s.id,
        sender: localStorage.getItem('uid') || 'web',
        points: s.points.map(toNorm),
        width: s.width,
        color: s.color || hexToRGBA(s.colorHex),
        created_at: new Date().toTimeString().slice(0,5),
        date: getCurrentDate(),
        file: currentOpenBoard
      };
      fetch(`${SUPABASE_URL}/rest/v1/draw`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }).then(res => {
        if (!res.ok) console.warn('DRAW INSERT FAIL', res.statusText);
      }).catch(e => console.warn('DRAW INSERT ERR', e));
    } catch (e) { console.warn(e) }
  }

  function patchStrokePoints(s) {
    if (!s || !s.id) return;
    const payload = { points: s.points.map(toNorm) };
    fetch(`${SUPABASE_URL}/rest/v1/draw?id=eq.${s.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    }).then(res => { if (!res.ok) console.warn('STROKE PATCH FAIL', res.statusText); }).catch(e => console.warn(e));
  }

  function deleteStrokeOnServer(id) {
    fetch(`${SUPABASE_URL}/rest/v1/draw?id=eq.${id}`, { method: 'DELETE', headers }).then(res => {}).catch(e=>console.warn(e));
  }

  // debounced patch map per stroke
  const patchTimers = {};


  // Toolbar buttons (existing markup has 4 buttons)
  const tbButtons = toolbar.querySelectorAll('button');
  const btnDraw = tbButtons[0];
  const btnPan = tbButtons[1];
  const btnNote = tbButtons[2];
  const btnLock = tbButtons[3];

  // Add extra controls: color picker, size, clear, export
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ff6b9a';
  colorInput.title = 'Brush color';
  colorInput.style.marginRight = '8px';
  toolbar.appendChild(colorInput);

  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = 1;
  sizeInput.max = 80;
  sizeInput.value = 8;
  sizeInput.title = 'Brush size';
  sizeInput.style.width = '100px';
  toolbar.appendChild(sizeInput);

  // Render scale slider (temporary) to adjust visual scale/thickness for Kivy boards
  let renderScale = 1.5;
  // Font scale for widget text (UI-only multiplier)
  let fontScale = 1.0;
  let posScale = 8.0;
  // base ratio so posScale follows renderScale: posScale = renderScale * basePosScale
  let basePosScale = posScale / renderScale;
    // Scale control: replaced UI slider with pinch-to-zoom and Ctrl+wheel handlers.
    function setScale(newScale) {
      const clamped = Math.max(0.2, Math.min(6.0, newScale));
      renderScale = clamped;
      posScale = renderScale * basePosScale;
      try { posInput.value = posScale; posInput.title = `Position scale (bound: ${posScale.toFixed(2)})`; } catch (e) {}
      redrawAll();
    }

    // Pointer-based pinch-to-zoom
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = renderScale;
    function getDist(p1, p2) {
      const dx = p2.x - p1.x; const dy = p2.y - p1.y; return Math.hypot(dx, dy);
    }
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const it = pointers.values(); const a = it.next().value; const b = it.next().value;
        pinchStartDist = getDist(a, b);
        pinchStartScale = renderScale;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinchStartDist > 0) {
        const it = pointers.values(); const a = it.next().value; const b = it.next().value;
        const d = getDist(a, b);
        if (d > 0) setScale(pinchStartScale * (d / pinchStartDist));
      }
    });
    canvas.addEventListener('pointerup', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStartDist = 0; });
    canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinchStartDist = 0; });

    // Ctrl + wheel to zoom
    window.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.08; // invert so wheel up -> zoom in
      setScale(renderScale + delta);
    }, { passive: false });

  // Position scale (affects coordinates rendering and hit-tests)
  const posLabel = document.createElement('span');
  posLabel.textContent = 'Pos';
  posLabel.style.margin = '0 8px';
  const posInput = document.createElement('input');
  posInput.type = 'range';
  posInput.min = 0.5; posInput.max = 8.0; posInput.step = 0.1; posInput.value = posInput.max;
  posInput.title = 'Position scale';
  posInput.style.width = '120px';
  posInput.addEventListener('input', (e) => { posScale = Number(e.target.value); redrawAll(); });
  
  // set posScale to slider max by default
  posScale = Number(posInput.max);
  // disable manual pos edit — it's bound to master Scale
  posInput.disabled = true;
  posInput.title = `Position scale (bound: ${posScale.toFixed(2)})`;
  // recompute basePosScale now that posScale/renderScale may be set
  basePosScale = posScale / renderScale;

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.marginLeft = '8px';
  toolbar.appendChild(clearBtn);

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export';
  exportBtn.style.marginLeft = '6px';
  toolbar.appendChild(exportBtn);

  const eraserBtn = document.createElement('button');
  eraserBtn.textContent = 'Eraser';
  eraserBtn.style.marginLeft = '6px';
  toolbar.appendChild(eraserBtn);

  const undoBtn = document.createElement('button');
  undoBtn.textContent = 'Undo';
  undoBtn.style.marginLeft = '6px';
  toolbar.appendChild(undoBtn);

  // State
  let mode = 'draw'; // 'draw' or 'pan'
  let locked = true;
  let drawing = false;
  let last = { x: 0, y: 0 };
  let currentStrokeId = null;

  function setActiveButton() {
    btnDraw.style.background = mode === 'draw' ? 'rgba(0,0,0,0.08)' : 'transparent';
    btnPan.style.background = mode === 'pan' ? 'rgba(0,0,0,0.08)' : 'transparent';
    btnLock.style.background = locked ? 'rgba(0,0,0,0.12)' : 'transparent';
  }

  // initial styles
  setActiveButton();

  // brush settings
  let brushColor = colorInput.value;
  let brushSize = Number(sizeInput.value);

  colorInput.addEventListener('input', (e) => brushColor = e.target.value);
  sizeInput.addEventListener('input', (e) => brushSize = Number(e.target.value));

  btnDraw.addEventListener('click', () => { if (locked) return; mode = 'draw'; setActiveButton(); });
  btnPan.addEventListener('click', () => { if (locked) return; mode = 'pan'; setActiveButton(); });
  btnNote.addEventListener('click', () => { if (locked) return; createStickyAtCenter(); });
  btnLock.addEventListener('click', () => { locked = !locked; setActiveButton(); });
  clearBtn.addEventListener('click', () => { if (locked) return; 
    // delete all strokes locally and on server
    const ids = Object.keys(strokes);
    ids.forEach(id => { deleteStrokeOnServer(id); delete strokes[id]; });
    drawOrder.length = 0;
    ctx.clearRect(0,0,canvas.width,canvas.height);
  });
  exportBtn.addEventListener('click', () => {
    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = 'whiteboard.png';
    a.click();
  });

  eraserBtn.addEventListener('click', () => { if (locked) return; tool = 'eraser'; eraserBtn.style.background = 'rgba(0,0,0,0.08)'; });
  undoBtn.addEventListener('click', () => { if (locked) return; // remove last stroke
    const id = drawOrder.pop();
    if (!id) return;
    const st = strokes[id];
    if (st) {
      delete strokes[id];
      delete patchTimers[id];
      redrawAll();
      deleteStrokeOnServer(id);
    }
  });

  // Drawing helpers
  function clientToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // scale client/display coords into canvas buffer coords
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const xDisplay = clientX - rect.left + wbScroll.scrollLeft;
    const yDisplay = clientY - rect.top + wbScroll.scrollTop;
    return { x: xDisplay * scaleX, y: yDisplay * scaleY };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (locked) return;
    canvas.setPointerCapture(e.pointerId);

    if (mode === 'draw') {
      const p = clientToCanvas(e.clientX, e.clientY);
      if (tool === 'pen') {
        drawing = true;
        const id = uuid();
        currentStrokeId = id;
        const s = {
          id,
          points: [[p.x, p.y]],
          width: brushSize,
          color: hexToRGBA(brushColor),
          colorHex: brushColor
        };
        strokes[id] = s;
        drawOrder.push(id);

        // start path (styles applied per-segment during pointermove)
        ctx.beginPath();
        ctx.moveTo(p.x * posScale, p.y * posScale);

        // create record on server
        postStrokeToServer(s);
      } else if (tool === 'eraser') {
        // erase at point
        const r = eraserRadiusDefault;
        for (const sid of Object.keys(strokes)) {
          const st = strokes[sid];
          if (circleHitsPolylineScaled(p.x, p.y, r, st.points, st.width, posScale)) {
            removeStrokeLocally(sid);
            deleteStrokeOnServer(sid);
          }
        }
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (locked) return;
    if (mode === 'draw' && drawing) {
      const p = clientToCanvas(e.clientX, e.clientY);
      if (tool === 'pen' && currentStrokeId) {
        const s = strokes[currentStrokeId];
        s.points.push([p.x, p.y]);
        ctx.lineTo(p.x * posScale, p.y * posScale);
        ctx.save();
        if (s.color && Array.isArray(s.color)) {
          ctx.strokeStyle = colorStrFromArr(s.color);
          ctx.globalAlpha = (typeof s.color[3] === 'number') ? s.color[3] : 1.0;
        } else if (s.colorHex) {
          ctx.strokeStyle = s.colorHex;
          ctx.globalAlpha = 1.0;
        } else {
          ctx.strokeStyle = colorStrFromArr(hexToRGBA(brushColor));
          ctx.globalAlpha = 1.0;
        }
        ctx.lineWidth = Math.max(1, (s.width || brushSize) * renderScale);
        ctx.stroke();
        ctx.restore();
        last.x = p.x; last.y = p.y;

        // debounce patch
        if (patchTimers[currentStrokeId]) clearTimeout(patchTimers[currentStrokeId]);
        patchTimers[currentStrokeId] = setTimeout(() => {
          patchStrokePoints(s);
          delete patchTimers[currentStrokeId];
        }, 200);
      } else if (tool === 'eraser') {
        const r = eraserRadiusDefault;
        for (const sid of Object.keys(strokes)) {
          const st = strokes[sid];
            if (circleHitsPolylineScaled(p.x, p.y, r, st.points, st.width, posScale)) {
            removeStrokeLocally(sid);
            deleteStrokeOnServer(sid);
          }
        }
      }
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (locked) return;
    if (mode === 'draw' && drawing) {
      if (tool === 'pen' && currentStrokeId) {
        const s = strokes[currentStrokeId];
        // final patch
        patchStrokePoints(s);
        currentStrokeId = null;
      }
      drawing = false;
      ctx.closePath();
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  });

  function removeStrokeLocally(sid) {
    if (!strokes[sid]) return;
    delete strokes[sid];
    const idx = drawOrder.indexOf(sid);
    if (idx !== -1) drawOrder.splice(idx, 1);
    redrawAll();
  }

  // Pan handling on the scroll container (drag to pan)
  let panning = false;
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

  whiteboard.addEventListener('pointerdown', (e) => {
    if (locked) return;
    // If user clicked not on canvas (notes etc) and mode is pan
    if (mode === 'pan') {
      panning = true;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      panStart.scrollLeft = wbScroll.scrollLeft;
      panStart.scrollTop = wbScroll.scrollTop;
      whiteboard.setPointerCapture?.(e.pointerId);
    }
  });

  whiteboard.addEventListener('pointermove', (e) => {
    if (locked) return;
    if (panning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      wbScroll.scrollLeft = Math.max(0, panStart.scrollLeft - dx);
      wbScroll.scrollTop = Math.max(0, panStart.scrollTop - dy);
    }
  });

  whiteboard.addEventListener('pointerup', (e) => {
    if (panning) {
      panning = false;
      try { whiteboard.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  });

  // Create sticky note
  function createStickyAt(x, y, content = '') {
    const note = document.createElement('div');
    note.className = 'wl-item';
    note.style.position = 'absolute';
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.style.minWidth = '140px';
    note.style.zIndex = 10;
    note.contentEditable = true;
    note.innerText = content || 'Ghi chú...';

    // simple drag
    let dragging = false;
    let sx = 0, sy = 0;
    note.addEventListener('pointerdown', (e) => {
      if (locked) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      note.setPointerCapture?.(e.pointerId);
    });
    note.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      sx = e.clientX; sy = e.clientY;
      const curLeft = parseFloat(note.style.left || 0);
      const curTop = parseFloat(note.style.top || 0);
      note.style.left = (curLeft + dx) + 'px';
      note.style.top = (curTop + dy) + 'px';
    });
    note.addEventListener('pointerup', (e) => { dragging = false; try { note.releasePointerCapture(e.pointerId); } catch (err) {} });

    whiteboard.appendChild(note);
    // if a board is open, persist this widget
    if (currentOpenBoard) {
      const id = uuid();
      note.dataset.widgetId = id;
      // compute normalized positions
      const rect = note.getBoundingClientRect();
      const boardRect = whiteboard.getBoundingClientRect();
      const disp = getDisplaySize();
      const nx = (rect.left - boardRect.left + wbScroll.scrollLeft) / disp.w;
      const ny = (rect.top - boardRect.top + wbScroll.scrollTop) / disp.h;
      const nw = rect.width / disp.w;
      const nh = rect.height / disp.h;
      const rec = {
        id, x: nx, y: ny, w: nw, h: nh, text: note.innerText,
        angle: 0.0,
        bg_color: [250/255,212/255,212/255,1],
        line_color: [0,0,0,0],
        text_color: [0,0,0,1],
        text_size: 14,
        text_align: 'center'
      };
      // persist and also keep local widget record for canvas rendering
      widgets[id] = rec;
      createWidget(rec);
      redrawAll();
    }
    return note;
  }

  function createStickyAtCenter() {
    const rect = whiteboard.getBoundingClientRect();
    const x = wbScroll.scrollLeft + rect.width / 2 - 80;
    const y = wbScroll.scrollTop + rect.height / 2 - 40;
    createStickyAt(x, y);
  }

  // double-click to add sticky note where clicked
  whiteboard.addEventListener('dblclick', (e) => {
    if (locked) return;
    // use display coordinates for DOM widget placement
    const rect = canvas.getBoundingClientRect();
    const xDisplay = e.clientX - rect.left + wbScroll.scrollLeft;
    const yDisplay = e.clientY - rect.top + wbScroll.scrollTop;
    createStickyAt(xDisplay, yDisplay);
  });

  // Make sure the scroll container starts centered a bit
  setTimeout(() => {
    const disp = getDisplaySize();
    wbScroll.scrollLeft = 0;
    wbScroll.scrollTop = 0;
  }, 50);

  // Prevent selection while drawing/panning
  document.addEventListener('selectstart', (e) => {
    if (drawing || panning) e.preventDefault();
  });

  // Load strokes for a date (dd/mm/yyyy)
  async function loadStrokes(dateStr) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/draw?select=id,points,width,color,file,date&date=eq.${encodeURIComponent(dateStr)}&order=created_at.asc`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      const rows = await res.json();
      // clear existing
      Object.keys(strokes).forEach(k => delete strokes[k]);
      drawOrder.length = 0;
      for (const row of rows) {
        if (row.file) continue; // skip file-specific
        const id = row.id;
        const pts = [];
        for (const [nx, ny] of row.points || []) {
          const p = fromNorm(nx, ny);
          pts.push(p);
        }
        if (pts.length === 0) continue;
        const s = { id, points: pts, width: row.width || 4, color: row.color || hexToRGBA('#ff6b9a'), colorHex: null };
        strokes[id] = s;
        drawOrder.push(id);
      }
      redrawAll();
    } catch (e) {
      console.warn('LOAD STROKES FAIL', e);
    }
  }

  // Realtime websocket for Supabase
  function startRealtime() {
    const wsUrl = `wss://${SUPABASE_URL.replace('https://', '')}/realtime/v1/websocket?apikey=${headers.apikey}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // join draw and widgets topics
      ws.send(JSON.stringify({ topic: 'realtime:public:draw', event: 'phx_join', payload: {}, ref: 1 }));
      ws.send(JSON.stringify({ topic: 'realtime:public:widgets', event: 'phx_join', payload: {}, ref: 2 }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const topic = data.topic;
        const event = data.event;
        const record = data.payload?.record;
        if (!topic || !record) return;
        if (topic === 'realtime:public:draw') {
          const sid = record.id;
          if (event === 'INSERT') {
            if (strokes[sid]) return; // already have
            const pts = (record.points || []).map(([nx, ny]) => fromNorm(nx, ny));
            const s = { id: sid, points: pts, width: record.width || 4, color: record.color || hexToRGBA('#ff6b9a'), colorHex: null };
            strokes[sid] = s; drawOrder.push(sid); renderStrokeOnContext(s);
          } else if (event === 'UPDATE') {
            if (!strokes[sid]) return;
            const pts = (record.points || []).map(([nx, ny]) => fromNorm(nx, ny));
            strokes[sid].points = pts;
            redrawAll();
          } else if (event === 'DELETE') {
            if (strokes[sid]) { removeStrokeLocally(sid); }
          }
        }
        if (topic === 'realtime:public:widgets') {
          const sid = record.id;
          if (event === 'INSERT') {
            // add widget if current board matches
            if (record.file === currentOpenBoard) {
              const rec = { id: record.id, x: record.x, y: record.y, w: record.w, h: record.h, text: record.text };
              console.log('[wb][realtime] widget INSERT', sid, record);
              widgets[sid] = rec;
              createWidgetDOM(rec);
              redrawAll();
            }
          } else if (event === 'UPDATE') {
            console.log('[wb][realtime] widget UPDATE', sid, record);
            const rec = { id: sid, x: record.x, y: record.y, w: record.w, h: record.h, text: record.text };
            widgets[sid] = rec;
            const node = widgetLayer.querySelector(`[data-widget-id="${sid}"]`);
            if (node) node.innerText = record.text || node.innerText;
            redrawAll();
          } else if (event === 'DELETE') {
            console.log('[wb][realtime] widget DELETE', sid);
            const node = widgetLayer.querySelector(`[data-widget-id="${sid}"]`);
            if (node) node.remove();
            if (widgets[sid]) delete widgets[sid];
            redrawAll();
          }
        }
      } catch (e) {
        // ignore
      }
    };

    ws.onclose = () => setTimeout(startRealtime, 2000);
    ws.onerror = () => {};
  }

  // start: load today's strokes and subscribe
  loadStrokes(getCurrentDate());
  startRealtime();

  // Whiteboard list UI
  let currentOpenBoard = null;

  const wbListBtn = document.getElementById('wb-list-btn');
  const wbListPanel = document.getElementById('wb-list-panel');
  const wbListEl = document.getElementById('wb-list');
  const wbCreateBtn = document.getElementById('wb-create');
  const wbNewName = document.getElementById('wb-new-name');

  function showBoardList() {
    if (wbListPanel) wbListPanel.style.display = 'flex';
    if (wbScroll) wbScroll.style.display = 'none';
    if (wbListBtn) wbListBtn.style.display = 'none';
  }

  function showCanvas() {
    if (wbListPanel) wbListPanel.style.display = 'none';
    if (wbScroll) wbScroll.style.display = '';
    if (wbListBtn) wbListBtn.style.display = currentOpenBoard ? '' : 'none';
  }

  wbListBtn.addEventListener('click', () => { showBoardList(); loadWhiteboards(); });
  // Initial state: show whiteboard list instead of an empty board.
  try { if (wbListBtn) wbListBtn.style.display = 'none'; } catch (e) {}
  showBoardList();
  loadWhiteboards();
  wbCreateBtn.addEventListener('click', () => {
    const name = wbNewName.value.trim();
    if (!name) return;
    createWhiteboard(name);
    wbNewName.value = '';
  });

  // Close button for list panel: restore current canvas view
  const wbListCloseBtn = document.getElementById('wb-list-close');
  if (wbListCloseBtn) {
    wbListCloseBtn.addEventListener('click', () => {
      if (currentOpenBoard) {
        showCanvas();
      }
    });
  }

  async function loadWhiteboards() {
    wbListEl.innerHTML = '';
    try {
      const url = `${SUPABASE_URL}/rest/v1/todo?select=*&order=created_at.asc`;
      const res = await fetch(url, { headers });
      const rows = await res.json();
      if (!rows.length) wbListEl.innerHTML = '<div>Không có whiteboard nào</div>';
      rows.forEach(r => {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
        row.style.background = 'var(--ctn-color)'; row.style.padding = '6px'; row.style.borderRadius = '8px';
        const lbl = document.createElement('div'); lbl.textContent = `${r.whiteboard_name} • ${r.created_at}`;
        const actions = document.createElement('div');
        const openBtn = document.createElement('button'); openBtn.textContent = 'Open'; openBtn.style.marginRight='6px';
        openBtn.style.padding = "10px";
        openBtn.style.border = "none";
        openBtn.style.background = "var(--btn-color)";
        openBtn.style.color = "var(--bg-color)";
        openBtn.style.borderRadius = "10px";
        openBtn.style.cursor = "pointer";
        const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.style.background='red'; delBtn.style.color='white';
        openBtn.addEventListener('click', () => { openWhiteboard(r.whiteboard_name); });
        delBtn.addEventListener('click', () => { if(confirm('Xóa whiteboard này?')) deleteWhiteboard(r.id, r.whiteboard_name); });
        actions.appendChild(openBtn); //actions.appendChild(delBtn);
        row.appendChild(lbl); row.appendChild(actions);
        wbListEl.appendChild(row);
      });
    } catch (e) { console.warn('LOAD WBS FAIL', e); }
  }

  async function createWhiteboard(name) {
    try {
      const data = { whiteboard_name: name, created_at: getCurrentDate() };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/todo`, { method: 'POST', headers, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await res.text());
      loadWhiteboards();
    } catch (e) { console.warn('CREATE WB FAIL', e); }
  }

  async function deleteWhiteboard(id, name) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/todo?id=eq.${id}`, { method: 'DELETE', headers });
      await fetch(`${SUPABASE_URL}/rest/v1/draw?file=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers });
      loadWhiteboards();
      if (currentOpenBoard === name) {
        currentOpenBoard = null;
        loadStrokes(getCurrentDate());
        const label = document.getElementById('date-counter'); if (label) label.innerText = '☀️ <3 ⭐';
      }
    } catch (e) { console.warn('DELETE WB FAIL', e); }
  }

  async function openWhiteboard(name) {
    currentOpenBoard = name;
    // load strokes for file
    try {
      const url = `${SUPABASE_URL}/rest/v1/draw?select=id,points,width,color,file,date&file=eq.${encodeURIComponent(name)}&order=created_at.asc`;
      const res = await fetch(url, { headers });
      const rows = await res.json();
      Object.keys(strokes).forEach(k=>delete strokes[k]); drawOrder.length=0;
      for (const row of rows) {
        const id = row.id;
        const pts = (row.points||[]).map(([nx,ny])=>fromNorm(nx,ny));
        if (pts.length===0) continue;
        const s = { id, points: pts, width: row.width||4, color: row.color||hexToRGBA('#ff6b9a'), colorHex: null };
        strokes[id]=s; drawOrder.push(id);
      }
      redrawAll();
    } catch (e) { console.warn(e); }
    // make the list button available when a board is open
    showCanvas();
  }

  // Widget support: load, create, update, delete
  const widgetLayer = whiteboard; // attach widgets to same container

  function createWidgetDOM(rec) {
    if (!rec || !rec.id) return null;
    if (widgetLayer.querySelector(`[data-widget-id="${rec.id}"]`)) return null; // already exists
    const w = document.createElement('div');
    w.className = 'wl-item';
    w.style.position='absolute';
    const disp = getDisplaySize();
    w.style.left = (rec.x * disp.w) + 'px';
    w.style.top = (rec.y * disp.h) + 'px';
    w.style.width = (rec.w * disp.w) + 'px';
    w.style.height = (rec.h * disp.h) + 'px';
    // apply styling from record
    if (rec.bg_color && Array.isArray(rec.bg_color)) w.style.background = colorStrFromArr(rec.bg_color);
    if (rec.text_color && Array.isArray(rec.text_color)) w.style.color = colorStrFromArr(rec.text_color);
    if (rec.text_size) w.style.fontSize = Math.max(10, rec.text_size) + 'px';
    if (rec.text_align) w.style.textAlign = rec.text_align;
    w.dataset.widgetId = rec.id;
    w.contentEditable = true;
    w.innerText = rec.text || 'Widget';

    // drag
    let dragging=false, sx=0, sy=0;
    w.addEventListener('pointerdown', (e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; w.setPointerCapture?.(e.pointerId); });
    w.addEventListener('pointermove', (e)=>{ if(!dragging) return; const dx=e.clientX-sx, dy=e.clientY-sy; sx=e.clientX; sy=e.clientY; w.style.left=(parseFloat(w.style.left||0)+dx)+'px'; w.style.top=(parseFloat(w.style.top||0)+dy)+'px'; });
    w.addEventListener('pointerup', (e)=>{ dragging=false; try{w.releasePointerCapture(e.pointerId);}catch{}; scheduleWidgetPatch(rec.id, w); });

    // delete button
    const del = document.createElement('button'); del.textContent='×'; del.style.position='absolute'; del.style.right='6px'; del.style.top='6px'; del.style.background='transparent'; del.style.border='none'; del.style.fontSize='1.2rem'; del.addEventListener('click', ()=>{ deleteWidget(rec.id, w); });
    w.appendChild(del);

    widgetLayer.appendChild(w);
    // record widget for canvas rendering
    widgets[rec.id] = rec;
    redrawAll();
    return w;
  }

  async function loadWidgets(name) {
    // remove existing dom widgets
    const existing = widgetLayer.querySelectorAll('[data-widget-id]'); existing.forEach(n=>n.remove());
    Object.keys(widgets).forEach(k=>delete widgets[k]);
    if (!name) return;
    try {
      const url = `${SUPABASE_URL}/rest/v1/widgets?select=*&file=eq.${encodeURIComponent(name)}&order=created_at.asc`;
      const res = await fetch(url, { headers });
      const rows = await res.json();
      console.log('[wb] loadWidgets: found', rows.length, 'rows for', name);
      rows.forEach(r => {
        const rec = {
          id: r.id,
          x: r.x, y: r.y, w: r.w, h: r.h,
          angle: parseFloat(r.angle || 0.0),
          bg_color: r.bg_color || [250/255,212/255,212/255,1],
          line_color: r.line_color || [0,0,0,0],
          text_color: r.text_color || [0,0,0,1],
          text: r.text || '',
          text_size: parseFloat(r.text_size || 14),
          text_align: r.text_align || 'center'
        };
        createWidgetDOM(rec);
      });
      // redraw canvas including widgets
      redrawAll();
    } catch (e) { console.warn('LOAD WIDGETS FAIL', e); }
  }

  async function createWidget(rec) {
    try {
      const data = {
        id: rec.id,
        file: currentOpenBoard,
        x: rec.x, y: rec.y, w: rec.w, h: rec.h,
        angle: rec.angle || 0.0,
        bg_color: rec.bg_color || [250/255,212/255,212/255,1],
        line_color: rec.line_color || [0,0,0,0],
        text_color: rec.text_color || [0,0,0,1],
        text: rec.text || '',
        text_size: rec.text_size || 14,
        text_align: rec.text_align || 'center',
        created_at: getCurrentDate()
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/widgets`, { method: 'POST', headers, body: JSON.stringify(data) });
      if (!res.ok) console.warn('WIDGET CREATE FAIL', await res.text());
    } catch (e) { console.warn(e); }
  }

  async function patchWidget(rec) {
    try {
      const data = {
        x: rec.x, y: rec.y, w: rec.w, h: rec.h, text: rec.text,
        angle: rec.angle || 0.0,
        bg_color: rec.bg_color || [250/255,212/255,212/255,1],
        line_color: rec.line_color || [0,0,0,0],
        text_color: rec.text_color || [0,0,0,1],
        text_size: rec.text_size || 14,
        text_align: rec.text_align || 'center'
      };
      await fetch(`${SUPABASE_URL}/rest/v1/widgets?id=eq.${rec.id}`, { method: 'PATCH', headers, body: JSON.stringify(data) });
    } catch (e) { console.warn('WIDGET PATCH FAIL', e); }
  }

  async function deleteWidget(id, domNode) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/widgets?id=eq.${id}`, { method: 'DELETE', headers });
      domNode.remove();
      if (widgets[id]) delete widgets[id];
      redrawAll();
    } catch (e) { console.warn('WIDGET DELETE FAIL', e); }
  }

  const widgetPatchTimers = {};
  function scheduleWidgetPatch(id, domNode) {
    const rect = domNode.getBoundingClientRect();
    const boardRect = whiteboard.getBoundingClientRect();
    const disp = getDisplaySize();
    const x = (rect.left - boardRect.left + wbScroll.scrollLeft) / disp.w;
    const y = (rect.top - boardRect.top + wbScroll.scrollTop) / disp.h;
    const w = rect.width / disp.w; const h = rect.height / disp.h;
    const rec = { id, x, y, w, h, text: domNode.innerText };
    // try to preserve styling if DOM has it
    try {
      const bg = window.getComputedStyle(domNode).backgroundColor;
      const tc = window.getComputedStyle(domNode).color;
      const fs = parseFloat(window.getComputedStyle(domNode).fontSize) || 14;
      rec.bg_color = cssColorToArray(bg);
      rec.text_color = cssColorToArray(tc);
      rec.text_size = fs;
      rec.text_align = domNode.style.textAlign || 'center';
    } catch (e) {}
    // update local widget record for canvas render
    widgets[id] = rec;
    if (widgetPatchTimers[id]) clearTimeout(widgetPatchTimers[id]);
    widgetPatchTimers[id] = setTimeout(()=>{ patchWidget(rec); delete widgetPatchTimers[id]; }, 300);
  }

  // Convert CSS rgb(a) string to normalized array [r,g,b,a]
  function cssColorToArray(css) {
    if (!css) return null;
    // formats: rgb(r,g,b) or rgba(r,g,b,a)
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s=>s.trim());
    const r = Number(parts[0]) / 255.0;
    const g = Number(parts[1]) / 255.0;
    const b = Number(parts[2]) / 255.0;
    const a = parts[3] ? Number(parts[3]) : 1.0;
    return [r, g, b, a];
  }

  // when opening board, also load widgets
  const origOpenWhiteboard = openWhiteboard;
  openWhiteboard = async (name) => { await origOpenWhiteboard(name); await loadWidgets(name); };
});
