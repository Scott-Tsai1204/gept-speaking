"use strict";
/* ===== V6-D2 英檢口說練習（成人直接練習模式） =====
   不闖關、不打怪：沒有怪獸／HP／戰鬥動畫／地圖，也不讀寫任何進度（gept_progress_path_v1、gept_progress_v2、複習池都不動）。
   只有畫面和練習流程是新的，引擎全部重用遊戲現有的：
   - 播放／錄音辨識：speak、listen（voice.js）；錄音圈：setState（main.js）
   - 複誦／朗讀評分：scoreSpoken（battle.js，跟複誦戰同一套逐字比對）
   - 問答：pickAnswerRound（questions.js，AI 出題＋固定題庫）、requestAnswerScore（questions.js，Worker AI 評分）
   - 抽題：pickRepeatRound／pickReadRound（questionPicker.js，Shuffle Bag／最近記憶）
   抽題記憶 gept_question_history_v1 跟遊戲共用（不是進度），所以兩邊不會馬上又抽到同一題。 */

const PRACTICE_TYPES = {
  repeat: { icon: "🎧", title: "複誦", desc: "聽一句英文，再說一次", btn: "開始複誦" },
  read:   { icon: "📖", title: "朗讀", desc: "朗讀英文句子與短文", btn: "開始朗讀" },
  answer: { icon: "💬", title: "問答", desc: "聽問題，用英文回答", btn: "開始問答" }
};
// 問答三分類的說明：本遊戲的題庫分類，方便練習與管理，並非 GEPT 官方公布的正式分類
const ANSWER_CATEGORY_DESC = {
  warmup: "簡單的個人資料、日常生活或事實問題",
  preference: "個人喜好、選擇、意願，通常可用簡單理由回答",
  situational: "假設情境、詢問、請求或需要回應的問題"
};
const PRACTICE_LEVELS = [["all", "全部"], ["easy", "easy"], ["medium", "medium"], ["hard", "hard"]];
const READ_PREP_SECONDS = 45;

// 練習狀態只放在記憶體，離開就結束（不存檔）
const P = { type: null, item: null, count: 0, sum: 0, scored: false, level: "all", showText: false, answerQueue: [] };

/* ---------- 題型選擇 ---------- */
function renderPracticeHome(){
  stopAll();
  app.innerHTML = `
    <header class="top">
      <button class="back-btn" id="toModes">← 主選單</button>
      <h1 style="flex:1;font-size:20px;margin:0;text-align:center">英檢口說練習</h1>
      <div class="pts"></div>
    </header>
    <section class="map practice-home">
      <p class="muted" style="margin:0 0 4px">選擇你要練習的題型</p>
      ${Object.entries(PRACTICE_TYPES).map(([type, t], k) => `
      <div class="review-card" style="animation-delay:${k * 0.05}s">
        <div class="review-head"><span class="review-emoji">${t.icon}</span><div><div class="review-title">${t.title}</div><div class="review-sub">${t.desc}</div></div></div>
        <button class="btn primary" data-practice="${type}">${t.btn}</button>
      </div>`).join("")}
      <p class="note">自由練習：不闖關、不打怪，也不會影響怪獸長廊與闖關地圖的進度。</p>
      <button class="btn line" id="backMain" style="align-self:flex-start">← 返回主選單</button>
    </section>`;
  $("#toModes").onclick = renderModeSelect;
  $("#backMain").onclick = renderModeSelect;
  app.querySelectorAll("[data-practice]").forEach(b => { b.onclick = () => startPractice(b.dataset.practice); });
}

function startPractice(type){
  Object.assign(P, { type, item: null, count: 0, sum: 0, scored: false, showText: false, answerQueue: [] });
  nextPracticeItem();
}

/* ---------- 出題：一次一題，練到使用者自己離開 ---------- */
async function nextPracticeItem(){
  stopAll();
  const tk = S.token;
  P.scored = false;
  if (P.type === "repeat"){
    const pool = P.level === "easy" ? EASY : P.level === "medium" ? MEDIUM : P.level === "hard" ? HARD : EASY.concat(MEDIUM, HARD);
    const [text] = pickRepeatRound(pool, 1);
    const found = questionBank && questionBank.repeat.find(x => x.text === text);
    P.item = { text, difficulty: found ? found.difficulty : "" };
  } else if (P.type === "read"){
    const [text] = pickReadRound(1);
    P.item = { text };
  } else {
    // 問答沿用遊戲的一輪三題（基礎→喜好→情境，各 50% 先請 AI 出題），用完再出下一輪
    if (!P.answerQueue.length){
      renderPracticeLoading();
      const round = await pickAnswerRound();
      if (tk !== S.token) return;
      P.answerQueue = round;
    }
    P.item = P.answerQueue.shift();
  }
  renderPracticeItem();
}

function renderPracticeLoading(){
  app.innerHTML = `
    <header class="top">
      <button class="back-btn" id="quit">← 題型</button>
      <div class="practice-title">${PRACTICE_TYPES[P.type].title}練習</div>
    </header>
    <section class="stage"><p class="muted">出題中…</p></section>`;
  $("#quit").onclick = () => { stopAll(); renderPracticeHome(); };
}

function practiceStatsHtml(){
  return P.count ? `已練習 <b>${P.count}</b><br>平均 ${Math.round(P.sum / P.count)}` : "已練習 <b>0</b>";
}

function renderPracticeItem(){
  const it = P.item, type = P.type;
  let meta = "", body = "";
  if (type === "repeat"){
    meta = it.difficulty ? `<span class="ptag">${esc(it.difficulty)}</span>` : "";
    body = `<div id="ptext" class="en practice-text ${P.showText || S.easy ? "" : "hidden"}">${esc(it.text)}</div>`;
  } else if (type === "read"){
    body = `<div class="en passage-box practice-passage">${esc(it.text)}</div>`;
  } else {
    meta = `<span class="ptag">${esc(TYPE_LABEL[it.type])}</span>${it.ai ? '<span class="ptag ai">AI 出題</span>' : ""}<span class="pdesc">${esc(ANSWER_CATEGORY_DESC[it.type] || "")}</span>`;
    body = `<div id="ptext" class="en practice-text ${P.showText ? "" : "hidden"}">${esc(it.q)}</div>`;
  }
  const toggle = type === "read" ? "" : `<button class="practice-toggle" id="toggleText">${P.showText ? "隱藏文字" : "顯示文字"}</button>`;
  app.innerHTML = `
    <header class="top">
      <button class="back-btn" id="quit">← 題型</button>
      <div class="practice-title">${PRACTICE_TYPES[type].title}練習</div>
      <div class="pts" id="pstats">${practiceStatsHtml()}</div>
    </header>
    ${type === "repeat" ? `<div class="level-chips" role="group" aria-label="難度">${PRACTICE_LEVELS.map(([v, l]) => `<button data-level="${v}" class="${P.level === v ? "on" : ""}">${l}</button>`).join("")}</div>` : ""}
    <section class="stage practice-stage">
      <div class="practice-card">
        ${meta || toggle ? `<div class="practice-meta">${meta}${toggle}</div>` : ""}
        ${body}
      </div>
      <h2 id="status" aria-live="polite"></h2>
      <p id="hint" class="muted"></p>
      <button class="ring practice-ring" id="ring" aria-label="錄音狀態"></button>
      <div id="live" class="en muted"></div>
      <div id="resultBox" style="width:100%"></div>
    </section>`;
  $("#quit").onclick = () => { stopAll(); renderPracticeHome(); };
  $("#ring").onclick = () => { if ($("#ring").dataset.state === "say" && activeRec) { try { activeRec.stop(); } catch(_){} } };
  const tg = $("#toggleText");
  if (tg) tg.onclick = () => { P.showText = !P.showText; $("#ptext").classList.toggle("hidden", !P.showText); tg.textContent = P.showText ? "隱藏文字" : "顯示文字"; };
  app.querySelectorAll("[data-level]").forEach(b => { b.onclick = () => { if (P.level === b.dataset.level) return; P.level = b.dataset.level; nextPracticeItem(); }; });
  runPracticeItem();
}

/* ---------- 播放與錄音（跟遊戲同樣的節奏：題目播兩次，再錄音） ---------- */
async function runPracticeItem(){
  const tk = ++S.token, it = P.item;
  $("#resultBox").innerHTML = "";
  if (P.type === "read"){
    // 朗讀：跟朗讀關一樣先默讀（倒數），準備好可以直接開始
    let remain = READ_PREP_SECONDS;
    setState("idle", "先默讀短文，準備好再開始朗讀", `倒數 ${remain} 秒，或直接點下面按鈕開始`);
    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "開始朗讀";
    $("#resultBox").appendChild(startBtn);
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearInterval(timer); startBtn.remove(); resolve(); };
      startBtn.onclick = finish;
      const timer = setInterval(() => {
        if (tk !== S.token){ clearInterval(timer); return; }
        remain--;
        const h = $("#hint"); if (h) h.textContent = remain > 0 ? `倒數 ${remain} 秒，或直接點下面按鈕開始` : "";
        if (remain <= 0) finish();
      }, 1000);
    });
    if (tk !== S.token) return;
    setState("busy", "準備錄音…", "");
    const r = await listen(25000); if (tk !== S.token) return;
    return showSpokenResult(it.text, r);
  }
  const text = P.type === "answer" ? it.q : it.text, rate = P.type === "answer" ? TEACHER_RATE : undefined;
  setState("hear", P.type === "answer" ? "請仔細聽題目" : "請仔細聽", "會播放兩次");
  await speak(text, rate); if (tk !== S.token) return;
  await sleep(1400);       if (tk !== S.token) return;
  await speak(text, rate); if (tk !== S.token) return;
  await sleep(700);        if (tk !== S.token) return;
  setState("busy", P.type === "answer" ? "準備回答…" : "準備錄音…", "");
  if (P.type === "answer"){
    await sleep(300); if (tk !== S.token) return;
    const r = await listen(20000, true); if (tk !== S.token) return;
    return showAnswerResult(it, r);
  }
  const r = await listen(); if (tk !== S.token) return;
  showSpokenResult(it.text, r);
}

// 第一次作答才算進「已練習／平均」，再試一次只是練習
function recordPracticeScore(score){
  if (P.scored) return;
  P.scored = true; P.count++; P.sum += score;
  const s = $("#pstats"); if (s) s.innerHTML = practiceStatsHtml();
}

function practiceActions(replayLabel){
  return `<div class="actions">
      <button class="btn line" id="replay">${replayLabel}</button>
      <button class="btn line" id="retry">再試一次</button>
      <button class="btn primary" id="next">下一題</button>
    </div>`;
}
function bindPracticeActions(replay){
  const rp = $("#replay");
  if (rp) rp.onclick = async () => { rp.disabled = true; await replay(); const b = $("#replay"); if (b) b.disabled = false; };
  $("#retry").onclick = () => runPracticeItem();
  $("#next").onclick = () => nextPracticeItem();
}

/* ---------- 複誦／朗讀的結果（評分用 battle.js 的 scoreSpoken） ---------- */
function showSpokenResult(q, r){
  const hardFail = r.error && HARD_ERR.includes(r.error);
  const { tw, pct, wordOk, extra } = scoreSpoken(q, r.text);
  if (!hardFail) recordPracticeScore(pct);
  setState("idle", hardFail ? "無法錄音" : pct >= PASS_LINE ? "說得很好" : "再接再厲", "");
  const msg = r.error && ERR[r.error] ? `<p class="msg">${ERR[r.error]}</p>` : "";
  const chips = hardFail ? "" : tw.map((w, k) => `<span class="w en ${wordOk[k] ? "ok" : "bad"}">${esc(w)}</span>`).join("");
  $("#resultBox").innerHTML = `
    <div class="result">
      ${hardFail ? "" : `<div class="score"><b>${pct}</b><span class="tag ${pct >= PASS_LINE ? "pass" : "try"}">${pct >= PASS_LINE ? "通過" : "再練一次"}</span></div>`}
      ${msg}${chips}
      ${!hardFail && r.text ? `<p class="heard en">辨識到：${esc(r.text)}</p>` : ""}
      ${!hardFail && extra.length ? `<p class="heard">多說的字：<span class="en">${esc(extra.join(" "))}</span></p>` : ""}
      ${practiceActions("聽標準發音")}
    </div>`;
  bindPracticeActions(() => speak(q));
}

/* ---------- 問答的結果（AI 評分用 questions.js 的 requestAnswerScore） ---------- */
async function showAnswerResult(item, r){
  const tk = S.token;
  const hardFail = r.error && HARD_ERR.includes(r.error);
  const retryOnly = (msg, headline) => {
    setState("idle", headline, "");
    $("#resultBox").innerHTML = `<div class="result"><p class="msg">${msg}</p>${r.text ? `<p class="heard en">你說的：${esc(r.text)}</p>` : ""}
      <div class="actions"><button class="btn line" id="skip">換一題</button><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runPracticeItem();
    $("#skip").onclick = () => nextPracticeItem();
  };
  if (hardFail) return retryOnly(ERR[r.error] || "無法錄音。", "無法錄音");
  if (!r.text) return retryOnly("沒有辨識到內容，請靠近麥克風再試一次。", "沒聽到回答");
  setState("busy", "評分中…", "AI 正在看你的回答");
  let data;
  try { data = await requestAnswerScore(item.q, r.text, r.fluency); }
  catch(_){ if (tk === S.token) retryOnly("連不上評分伺服器，請確認網路連線後再試一次。", "評分失敗"); return; }
  if (tk !== S.token) return;
  recordPracticeScore(data.score);
  const t = $("#ptext"); if (t) t.classList.remove("hidden"); // 作答完顯示題目文字
  setState("idle", data.score >= PASS_LINE ? "回答得很好" : "可以再更完整一點", "");
  $("#resultBox").innerHTML = `
    <div class="result">
      <div class="score"><b>${data.score}</b><span class="tag ${data.score >= PASS_LINE ? "pass" : "try"}">${data.score >= PASS_LINE ? "通過" : "再加油"}</span></div>
      <p class="heard en"><b>${esc(item.q)}</b></p>
      <p class="heard en">你說的：${esc(r.text)}</p>
      ${data.feedback ? `<p class="heard">${esc(data.feedback)}</p>` : ""}
      ${practiceActions("再聽一次題目")}
    </div>`;
  bindPracticeActions(() => speak(item.q, TEACHER_RATE));
}
