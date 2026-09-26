"use strict";
/* ===== 問答挑戰 ===== */
async function generateQuestion(type, avoid){
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(WORKER_URL + "/generate-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, avoid }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const q = String(data.q || "").trim();
    return q ? { type, q, ai: true } : null;
  } catch(_) { return null; }
}
function pickFromPool(byType, t){
  const avoid = S.lastAnswerQ && S.lastAnswerQ[t];
  const pool = byType[t];
  const candidates = avoid && pool.length > 1 ? pool.filter(item => item.q !== avoid) : pool;
  return { ...shuffle(candidates)[0], ai: false };
}
async function pickAnswerRound(){
  const byType = { warmup: [], opinion: [], situational: [] };
  QUESTIONS.forEach(item => byType[item.type].push(item));
  const types = ["warmup", "opinion", "situational"];
  S.answerHistory = S.answerHistory || { warmup: [], opinion: [], situational: [] };
  const picked = await Promise.all(types.map(async t => {
    if (Math.random() < 0.5){
      const gen = await generateQuestion(t, S.answerHistory[t].slice(-5));
      if (gen) return gen;
    }
    return pickFromPool(byType, t);
  }));
  S.lastAnswerQ = {};
  types.forEach((t, k) => {
    S.lastAnswerQ[t] = picked[k].q;
    S.answerHistory[t] = S.answerHistory[t].concat(picked[k].q).slice(-5);
  });
  return picked;
}
function avgScoreSoFar(){
  const done = S.results.filter(Boolean);
  return done.length ? Math.round(done.reduce((a, r) => a + r.score, 0) / done.length) : "-";
}
async function startAnswerChallenge(){
  S.mode = "answer";
  const btn = document.activeElement && document.activeElement.tagName === "BUTTON" ? document.activeElement : null;
  if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = "出題中…"; }
  const round = await pickAnswerRound();
  Object.assign(S, { round, i: 0, results: [], score: 0, combo: 0 });
  renderAnswerQuestion();
}
function renderAnswerQuestion(){
  const item = S.round[S.i];
  const segs = S.round.map((_, k) => `<i class="${k < S.i ? "done" : k === S.i ? "now" : ""}"></i>`).join("");
  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="quit">結束</button>
      <div class="segs" style="grid-template-columns:repeat(${S.round.length},1fr)" aria-label="第 ${S.i + 1} 題，共 ${S.round.length} 題">${segs}</div>
      <div class="pts">平均 <b>${avgScoreSoFar()}</b></div>
    </header>
    <section class="stage">
      <div class="arena">
        <div class="mon-ring" id="monRing"><span>🧑‍🏫</span></div>
        <div class="mon-name">${esc(TYPE_LABEL[item.type])}${item.ai ? ' <span class="badge boss-badge" style="background:var(--cobalt);color:#fff">AI 出題</span>' : ""}</div>
      </div>
      <h2 id="status" aria-live="polite"></h2>
      <p id="hint" class="muted"></p>
      <button class="ring" id="ring" aria-label="錄音狀態"></button>
      <div id="live" class="en muted"></div>
      <div id="resultBox" style="width:100%"></div>
    </section>`;
  $("#quit").onclick = () => { stopAll(); S.viaPath != null ? renderPathMap() : renderMap(); };
  $("#ring").onclick = () => { if ($("#ring").dataset.state === "say" && activeRec) { try { activeRec.stop(); } catch(_){} } };
  runAnswerQuestion();
}
async function runAnswerQuestion(){
  const tk = ++S.token, item = S.round[S.i];
  $("#resultBox").innerHTML = "";
  setState("hear", "請仔細聽題目", "題目會播放兩次");
  await speak(item.q, TEACHER_RATE); if (tk !== S.token) return;
  await sleep(1400);        if (tk !== S.token) return;
  await speak(item.q, TEACHER_RATE); if (tk !== S.token) return;
  await sleep(700);         if (tk !== S.token) return;
  setState("busy", "準備回答…", "");
  await sleep(300);         if (tk !== S.token) return;
  const r = await listen(20000, true); if (tk !== S.token) return;
  evaluateAnswer(item, r);
}
async function evaluateAnswer(item, r){
  const tk = S.token;
  const hardFail = r.error && HARD_ERR.includes(r.error);
  if (hardFail){
    setState("idle", "無法錄音", "");
    $("#resultBox").innerHTML = `<div class="result">${ERR[r.error] ? `<p class="msg">${ERR[r.error]}</p>` : ""}
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runAnswerQuestion();
    return;
  }
  if (!r.text){
    setState("idle", "沒聽到回答", "");
    $("#resultBox").innerHTML = `<div class="result"><p class="msg">沒有辨識到內容，請靠近麥克風再試一次。</p>
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runAnswerQuestion();
    return;
  }
  setState("busy", "評分中…", "老師正在看你的回答");
  $("#resultBox").innerHTML = "";
  let data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(WORKER_URL + "/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: item.q, answer: r.text, fluency: r.fluency }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error("bad status");
    data = await res.json();
    if (typeof data.score !== "number") throw new Error("bad body");
  } catch(_){
    setState("idle", "評分失敗", "");
    $("#resultBox").innerHTML = `<div class="result">
      <p class="msg">連不上評分伺服器，請確認網路連線後再試一次。</p>
      <p class="heard en">你說的：${esc(r.text)}</p>
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runAnswerQuestion();
    return;
  }

  const first = !S.results[S.i];
  const pass = data.score >= PASS_LINE;
  if (first){
    S.combo = pass ? S.combo + 1 : 0;
    S.results[S.i] = { q: item.q, type: item.type, answer: r.text, score: data.score, feedback: data.feedback || "" };
  }
  if (first && pass){
    await playHeroAttack("magic");
    if (tk !== S.token) return;
  }
  setState("idle", data.score >= PASS_LINE ? "回答得很好" : "可以再更完整一點", "");
  const last = S.i === S.round.length - 1;
  const rec = S.results[S.i];
  $("#resultBox").innerHTML = `
    <div class="result">
      <div class="score"><b>${rec.score}</b><span class="tag ${rec.score >= PASS_LINE ? "pass" : "try"}">${rec.score >= PASS_LINE ? "過關" : "再加油"}</span></div>
      <p class="heard en"><b>${esc(rec.q)}</b></p>
      <p class="heard en">你說的：${esc(rec.answer)}</p>
      ${rec.feedback ? `<p class="heard">${esc(rec.feedback)}</p>` : ""}
      <div class="actions">
        <button class="btn line" id="replay">再聽一次題目</button>
        <button class="btn line" id="retry">再試一次</button>
        <button class="btn primary" id="next">${last ? "看結果" : "下一題"}</button>
      </div>
    </div>`;
  $("#replay").onclick = async () => { $("#replay").disabled = true; await speak(item.q, TEACHER_RATE); const b = $("#replay"); if (b) b.disabled = false; };
  $("#retry").onclick = () => runAnswerQuestion();
  $("#next").onclick = () => { if (last) renderAnswerSummary(); else { S.i++; renderAnswerQuestion(); } };
}
function renderAnswerSummary(){
  stopAll();
  const done = S.results.filter(Boolean);
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.score, 0) / done.length) : 0;
  const passed = done.filter(r => r.score >= PASS_LINE).length;
  const pathMode = S.viaPath != null;
  let starsLine = "";
  if (pathMode){
    const progress = loadPathProgress();
    const ni = S.viaPath;
    const stars = starsFromPassed(passed, S.round.length);
    if (stars > progress[ni]) progress[ni] = stars;
    savePathProgress(progress);
    starsLine = `<div class="stars-big">${starsStr(stars)}</div>`;
  }
  app.innerHTML = `
    <section class="sum">
      <p class="muted">問答挑戰結果</p>
      ${starsLine}
      <div class="big">${avg}</div>
      <p style="margin-top:8px">${passed} / ${S.round.length} 題達到 ${PASS_LINE} 分。</p>
      <ul class="list">
        ${done.map(r => `<li><span>${esc(TYPE_LABEL[r.type])}</span><b>${r.score}</b></li>`).join("")}
      </ul>
      ${done.map(r => `<p class="heard"><b class="en">${esc(r.q)}</b><br>你：${esc(r.answer)}${r.feedback ? `<br>💬 ${esc(r.feedback)}` : ""}</p>`).join("")}
      <div class="actions" style="margin-top:24px">
        <button class="btn primary" id="retryNode" style="margin-left:0">再玩一次</button>
        <button class="btn line" id="toMap">${pathMode ? "回地圖" : "回長廊"}</button>
      </div>
    </section>`;
  $("#toMap").onclick = pathMode ? renderPathMap : renderMap;
  $("#retryNode").onclick = () => pathMode ? startPathNode(S.viaPath) : startAnswerChallenge();
}
