"use strict";
/* ===== 介面 ===== */
const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_WAIT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

function setState(state, headline, hint){
  const ring = $("#ring"); if (!ring) return;
  ring.dataset.state = state;
  ring.innerHTML = (state === "hear" ? ICON_SPEAKER : ICON_WAIT) + '<div class="bars"><span></span><span></span><span></span><span></span><span></span></div>';
  $("#status").textContent = headline;
  $("#hint").textContent = hint || "";
  if (state !== "say") { const l = $("#live"); if (l) l.textContent = ""; }
}

function renderStart(){
  const unsupported = !RECORDING_SUPPORTED || !("speechSynthesis" in window);
  app.innerHTML = `
    <section class="start">
      <h1>英檢初級口說：怪獸挑戰</h1>
      <p>先聽句子（播放兩次），然後跟著說一遍。每答對一題就會打中怪獸一下，打光血條才能擊敗牠；首領戰血更厚、題目更難，題目不分主題、隨機出現。</p>
      <label class="opt"><input type="checkbox" id="easy" ${S.easy ? "checked" : ""}> 簡單模式：作答前先顯示句子</label>
      ${unsupported
        ? '<p class="msg" style="margin-top:16px">這個瀏覽器不支援語音辨識。請改用 Android 版 Chrome 開啟。</p>'
        : '<button class="btn primary" id="startBtn">開始</button>'}
      <p class="note">需要網路連線與麥克風權限。第一次開始時，瀏覽器會詢問是否允許使用麥克風。</p>
    </section>`;
  const b = $("#startBtn");
  if (b) b.onclick = onStart;
}

async function onStart(){
  const btn = $("#startBtn");
  btn.disabled = true; btn.textContent = "準備中…";
  S.easy = $("#easy").checked;
  if (!navigator.onLine){ alert("目前沒有網路。語音辨識需要連線後才能使用。"); btn.disabled = false; btn.textContent = "開始"; return; }
  try {   // 在按鈕點擊當下先要麥克風權限，之後辨識就不會再跳詢問
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
  } catch(_) {
    alert("無法使用麥克風。請點網址列左側的圖示，允許麥克風後重新整理頁面。");
    btn.disabled = false; btn.textContent = "開始"; return;
  }
  const voices = await loadVoices();
  voice = voices.find(v => /^en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch(_) {}
  renderModeSelect();
}

/* ===== 選玩法 ===== */
function renderModeSelect(){
  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="toStart">設定</button>
      <h1 style="flex:1;font-size:20px;margin:0;text-align:center">選擇玩法</h1>
      <div class="pts"></div>
    </header>
    <section class="map">
      <div class="review-card" style="animation-delay:0s">
        <div class="review-head"><span class="review-emoji">🏯</span><div><div class="review-title">怪獸長廊</div><div class="review-sub">清單式選關，複誦戰＋問答挑戰＋複習站</div></div></div>
        <button class="btn primary" id="goCorridor">進入長廊</button>
      </div>
      <div class="review-card" style="animation-delay:.05s">
        <div class="review-head"><span class="review-emoji">🗺️</span><div><div class="review-title">闖關地圖</div><div class="review-sub">沿路小徑往上闖，複誦／朗讀／問答混合，最後挑戰大魔王</div></div></div>
        <button class="btn primary" id="goPath">進入地圖</button>
      </div>
    </section>`;
  $("#toStart").onclick = renderStart;
  $("#goCorridor").onclick = renderMap;
  $("#goPath").onclick = renderPathMap;
}

renderStart();
