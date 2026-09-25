"use strict";
/* ===== 複誦戰／朗讀關／複習站共用的出題畫面 ===== */
function renderQuestion(){
  const segs = S.round.map((_, k) => `<i class="${k < S.i ? "done" : k === S.i ? "now" : ""}"></i>`).join("");
  const passedCount = S.results.filter(r => r && r.pct >= PASS_LINE).length;
  const remaining = Math.max(0, S.hp - passedCount);
  const hpPct = Math.round(remaining / S.hp * 100);
  const mon = S.monster;
  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="quit">結束</button>
      <div class="segs" style="grid-template-columns:repeat(${S.round.length},1fr)" aria-label="第 ${S.i + 1} 題，共 ${S.round.length} 題">${segs}</div>
      <div class="pts">積分 <b>${S.score}</b>${S.combo > 1 ? `<br>連擊 ×${S.combo}` : ""}</div>
    </header>
    <section class="stage">
      <div class="arena">
        <div class="mon-ring ${mon.boss ? "boss" : ""} ${mon.final ? "final" : ""}" id="monRing"><span id="monEmoji">${mon.emoji}</span></div>
        <div class="mon-name">${esc(mon.name)}${mon.boss ? ' <span class="badge boss-badge">BOSS</span>' : ""}</div>
        <div class="hp-wrap"><div class="hp-bar-bg"><div class="hp-bar-fill ${hpPct <= 30 ? "low" : ""}" id="hpFill" style="width:${hpPct}%"></div></div></div>
      </div>
      <h2 id="status" aria-live="polite"></h2>
      <p id="hint" class="muted"></p>
      <div id="peek" class="en"></div>
      <button class="ring" id="ring" aria-label="錄音狀態"></button>
      <div id="live" class="en muted"></div>
      <div id="resultBox" style="width:100%"></div>
    </section>`;
  $("#quit").onclick = () => { stopAll(); S.viaPath != null ? renderPathMap() : renderMap(); };
  $("#ring").onclick = () => { if ($("#ring").dataset.state === "say" && activeRec) { try { activeRec.stop(); } catch(_){} } };
  runQuestion();
}

function stopAll(){
  S.token++;
  try { speechSynthesis.cancel(); } catch(_){}
  try { activeRec && activeRec.state !== "inactive" && activeRec.stop(); } catch(_){}
  activeRec = null;
}

async function runQuestion(){
  const tk = ++S.token, q = S.round[S.i];
  $("#resultBox").innerHTML = "";
  if (S.easy) $("#peek").textContent = q;
  setState("hear", "請仔細聽", "題目會播放兩次");
  await speak(q);           if (tk !== S.token) return;
  await sleep(1400);        if (tk !== S.token) return;
  await speak(q);           if (tk !== S.token) return;
  await sleep(700);         if (tk !== S.token) return;
  setState("busy", "準備錄音…", "");
  const r = await listen(); if (tk !== S.token) return;
  evaluate(q, r);
}

function evaluate(q, r){
  const tw = q.split(/\s+/);
  const tokens = [];
  tw.forEach((w, wi) => tokenize(w).forEach(t => tokens.push({ t, wi })));
  const h = tokenize(r.text || "");
  const { ops, extra, dist } = align(tokens.map(x => x.t), h);
  const pct = r.text ? Math.round(Math.max(0, 1 - dist / tokens.length) * 100) : 0;
  const wordOk = tw.map(() => true);
  tokens.forEach((x, k) => { if (ops[k] !== "ok") wordOk[x.wi] = false; });

  const hardFail = r.error && HARD_ERR.includes(r.error);
  const first = !S.results[S.i] && !hardFail;
  const pass = pct >= PASS_LINE;
  if (first){
    S.combo = pass ? S.combo + 1 : 0;
    S.score += pct + (pass ? S.combo * 10 : 0);
    S.results[S.i] = { q, pct, wordOk, tw };
    bumpMissed(tw.filter((_, k) => !wordOk[k]).map(w => tokenize(w).join(" ")).filter(Boolean));
    if (pass) clearMissedSentence(q); else bumpMissedSentence(q);

    const passedCount = S.results.filter(x => x && x.pct >= PASS_LINE).length;
    const remaining = Math.max(0, S.hp - passedCount);
    const hpFill = $("#hpFill");
    if (hpFill){ hpFill.style.width = (remaining / S.hp * 100) + "%"; hpFill.classList.toggle("low", remaining / S.hp <= .3); }
    const ring = $("#monRing");
    if (ring){
      ring.classList.remove("hit", "counter", "down");
      void ring.offsetWidth;
      if (pass){
        const defeated = remaining <= 0;
        ring.classList.add(defeated ? "down" : "hit");
        vibrate(defeated ? [40, 60, 40, 60, 120] : 45);
      } else {
        ring.classList.add("counter");
        vibrate([30, 40, 30]);
      }
    }
  }

  setState("idle", pct >= PASS_LINE ? "說得很好" : (hardFail ? "無法錄音" : "再接再厲"), "");
  const msg = r.error && ERR[r.error] ? `<p class="msg">${ERR[r.error]}</p>` : "";
  const chips = hardFail ? "" : tw.map((w, k) => `<span class="w en ${wordOk[k] ? "ok" : "bad"}">${esc(w)}</span>`).join("");
  const last = S.i === S.round.length - 1;
  $("#resultBox").innerHTML = `
    <div class="result">
      ${hardFail ? "" : `<div class="score"><b>${pct}</b><span class="tag ${pct >= PASS_LINE ? "pass" : "try"}">${pct >= PASS_LINE ? "命中" : "再練一次"}</span></div>`}
      ${msg}${chips}
      ${!hardFail && r.text ? `<p class="heard en">辨識到：${esc(r.text)}</p>` : ""}
      ${!hardFail && extra.length ? `<p class="heard">多說的字：<span class="en">${esc(extra.join(" "))}</span></p>` : ""}
      <div class="actions">
        <button class="btn line" id="replay">聽標準發音</button>
        <button class="btn line" id="retry">再試一次</button>
        ${hardFail ? "" : `<button class="btn primary" id="next">${last ? "看結果" : "下一題"}</button>`}
      </div>
      ${!first && !hardFail ? '<p class="heard">重試不會改變這題的積分。</p>' : ""}
    </div>`;
  $("#replay").onclick = async () => { $("#replay").disabled = true; await speak(q); const b = $("#replay"); if (b) b.disabled = false; };
  $("#retry").onclick = () => runQuestion();
  const nx = $("#next");
  if (nx) nx.onclick = () => { if (last) renderSummary(); else { S.i++; renderQuestion(); } };
}

function renderSummary(){
  stopAll();
  const done = S.results.filter(Boolean);
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.pct, 0) / done.length) : 0;
  const passed = done.filter(r => r.pct >= PASS_LINE).length;
  const missed = topMissed();
  const mon = S.monster;

  const pathMode = S.viaPath != null;
  let extraMsg = "", starsLine = "";
  if (pathMode){
    const progress = loadPathProgress();
    const ni = S.viaPath;
    const stars = starsFromPassed(passed, S.hp);
    if (stars > progress[ni]) progress[ni] = stars;
    savePathProgress(progress);
    starsLine = `<div class="stars-big">${starsStr(stars)}</div>`;
    const isBoss = ni === PATH_NODES.length - 1;
    if (isBoss && stars > 0) extraMsg = `<p class="msg" style="color:var(--ok)">🏆 恭喜！你擊敗了 ${esc(mon.name)}，成功闖關！</p>`;
    else if (stars === 3) extraMsg = `<p class="msg" style="color:var(--ok)">🎉 擊敗了 ${esc(mon.name)}！</p>`;
    else if (stars > 0) extraMsg = `<p class="msg" style="color:var(--ok)">${esc(mon.name)} 受傷逃跑了，再挑戰一次可以徹底擊敗！</p>`;
    else extraMsg = `<p class="msg">${esc(mon.name)} 完全沒有受傷，再試一次！</p>`;
  } else if (S.mode === "battle"){
    const progress = loadProgress();
    const mi = S.monsterIndex;
    const stars = starsFromPassed(passed, S.hp);
    if (stars > progress[mi]) progress[mi] = stars;
    saveProgress(progress);
    starsLine = `<div class="stars-big">${starsStr(stars)}</div>`;
    if (stars === 3) extraMsg = `<p class="msg" style="color:var(--ok)">🎉 擊敗了 ${esc(mon.name)}！</p>`;
    else if (stars > 0) extraMsg = `<p class="msg" style="color:var(--ok)">${esc(mon.name)} 受傷逃跑了，再挑戰一次可以徹底擊敗！</p>`;
    else extraMsg = `<p class="msg">${esc(mon.name)} 完全沒有受傷，再試一次！</p>`;
  } else {
    extraMsg = `<p class="muted">複習池剩餘 ${reviewPoolList().length} 句</p>`;
  }

  app.innerHTML = `
    <section class="sum">
      <p class="muted">${esc(mon.name)} 戰鬥結果</p>
      ${starsLine}
      <div class="big">${avg}</div>
      <p style="margin-top:8px">${passed} / ${S.round.length} 題達到 ${PASS_LINE} 分，總積分 ${S.score}。</p>
      ${extraMsg}
      <ul class="list">
        ${done.map(r => `<li><span>${esc(r.q)}</span><b>${r.pct}</b></li>`).join("")}
      </ul>
      ${missed.length ? `<p class="muted">你最常說錯的字</p><div class="chips">${missed.map(([w, c]) => `<span>${esc(w)} ×${c}</span>`).join("")}</div>` : ""}
      <div class="actions" style="margin-top:24px">
        <button class="btn primary" id="retryNode" style="margin-left:0">再玩一次</button>
        <button class="btn line" id="toMap">${pathMode ? "回地圖" : "回長廊"}</button>
      </div>
    </section>`;
  $("#toMap").onclick = pathMode ? renderPathMap : renderMap;
  $("#retryNode").onclick = () => {
    if (pathMode) return startPathNode(S.viaPath);
    S.mode === "review" ? startReview() : startMonster(S.monsterIndex);
  };
}
