"use strict";
/* =====================================================================
   FINAL BOSS：Zone 8 專屬的多回合英語戰。
   這支檔案完全獨立於複誦／朗讀／問答三套既有引擎（battle.js／questions.js
   都沒有被改動），只是重用它們背後真正的「判定邏輯」與共用特效函式：
     - 複誦／朗讀的逐字比對：tokenize()／align()／PASS_LINE（跟 evaluate() 同一套公式）
     - 問答的 AI 評分：呼叫同一個 Cloudflare Worker /evaluate 端點
     - 語音：speak()／listen()（跟三套引擎共用同一份 voice.js）
     - 主角攻擊特效：playHeroAttack()；Boss 自己的受擊／死亡動畫在這支檔案的 playBossHurt()／playBossDefeat()
   每回合隨機挑一種題型，答對一次 Boss HP -1，五格 HP 歸零即擊敗。
   ===================================================================== */
const BOSS_HP_MAX = 5;
const BOSS_ROUND_TYPES = ["repeat", "read", "answer"];
const BOSS_IDLE_SRC = "assets/characters/boss/boss_idle.png";
const BOSS_HURT_SRC = "assets/characters/boss/boss_hurt.png";
const BOSS_DEFEAT_SRC = "assets/characters/boss/boss_defeat.png";
const EFFECT_BOSS_DEFEAT_SRC = "assets/effects/effect_boss_defeat.png";
/* 素材條規格（單位是原圖像素）。這幾條素材的幀距不是嚴格等寬，所以每一幀用 frames＝[左界, 右界] 各自取景：
   height＝畫面上的顯示高度（px），讓角色看起來跟 208px 框裡的 idle 立繪一樣大；dy＝垂直位移（%）對齊 idle 的位置；
   startMs＝相對於動畫開始的延遲 */
const bossFramesAround = (centers, win) => centers.map(c => [c - win / 2, c + win / 2]);
const BOSS_HURT_SHEET = { src: BOSS_HURT_SRC, w: 1728, h: 350, frames: bossFramesAround([160, 415, 665, 935, 1195, 1440, 1665], 300), height: 150, dy: -58, frameMs: 110, startMs: 0 };
const BOSS_DEFEAT_SHEET = { src: BOSS_DEFEAT_SRC, w: 1728, h: 245, frames: [[-5, 255], [266, 492], [450, 710], [665, 925], [845, 1105], [1055, 1315], [1270, 1530], [1490, 1750]], height: 128, dy: -56, frameMs: 170, startMs: 0 };
// 消散特效是 12 塊獨立的煙霧→水晶碎片→閃光→光點，每塊精準裁切，接在 Boss 開始崩解（死亡第 4 幀）時播放；
// top＝裁掉素材條最上緣的殘留碎片
const BOSS_SMOKE_SHEET = { src: EFFECT_BOSS_DEFEAT_SRC, w: 1728, h: 109, top: 12,
  frames: [[14, 197], [210, 297], [308, 480], [493, 618], [628, 733], [743, 829], [835, 983], [989, 1088], [1115, 1293], [1307, 1382], [1398, 1543], [1566, 1727]],
  height: 118, dy: -46, frameMs: 90, startMs: 510 };

function bossHeartsStr(hp){
  return "❤️".repeat(Math.max(0, hp)) + "🤍".repeat(Math.max(0, BOSS_HP_MAX - hp));
}

function startBossBattle(ni){
  stopAll();
  const node = PATH_NODES[ni];
  S.viaPath = ni;
  S.mode = "boss";
  S.monster = node;
  S.bossHp = BOSS_HP_MAX;
  S.bossRoundResults = [];
  // 先預載受擊／死亡素材條，第一次答對時才不會閃一下空白
  [BOSS_HURT_SRC, BOSS_DEFEAT_SRC, EFFECT_BOSS_DEFEAT_SRC].forEach(src => { new Image().src = src; });
  runBossRound();
}

/* ===== Boss 受擊／死亡動畫：暫時把 idle 立繪藏起來，在 #monRing 上疊一層逐幀播放的素材條 ===== */
function bossSpriteFrame(el, sheet, i){
  const k = sheet.height / sheet.h;
  const [x0, x1] = sheet.frames[i];
  el.style.width = `${(x1 - x0) * k}px`;
  el.style.backgroundPosition = `${-x0 * k}px ${-(sheet.top || 0) * k}px`;
}
function playBossSprite(fxList, restoreIdle){
  return new Promise(resolve => {
    const ring = $("#monRing");
    const art = ring && ring.querySelector("img.boss-art");
    if (!ring || !art){ resolve(); return; }
    const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layers = fxList.map(([cls, sheet]) => {
      const k = sheet.height / sheet.h;
      const el = document.createElement("div");
      el.className = "boss-sprite " + cls;
      el.style.cssText = `height:${(sheet.h - (sheet.top || 0)) * k}px;transform:translate(-50%,${sheet.dy}%);` +
        `background-image:url('${sheet.src}');background-size:${sheet.w * k}px ${sheet.height}px`;
      if (sheet.startMs) el.style.visibility = "hidden";
      bossSpriteFrame(el, sheet, 0);
      ring.appendChild(el);
      return { el, sheet };
    });
    art.classList.add("anim-hidden");
    const total = Math.max(...layers.map(l => l.sheet.startMs + l.sheet.frames.length * l.sheet.frameMs));
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      if (t >= total){
        layers.forEach(l => l.el.remove());
        if (restoreIdle) art.classList.remove("anim-hidden");
        resolve();
        return;
      }
      layers.forEach(l => {
        const lt = t - l.sheet.startMs;
        const n = l.sheet.frames.length;
        // 每一層播完最後一幀就收掉；還沒輪到的層先藏著
        l.el.style.visibility = (lt < 0 || lt >= n * l.sheet.frameMs) ? "hidden" : "visible";
        if (lt >= 0 && !reduced) bossSpriteFrame(l.el, l.sheet, Math.min(n - 1, Math.floor(lt / l.sheet.frameMs)));
      });
      // 用 setTimeout 而不是 requestAnimationFrame：分頁被切到背景時 rAF 會暫停，動畫的 Promise 就會卡住
      setTimeout(tick, 30);
    };
    tick();
  });
}
function playBossHurt(){
  return playBossSprite([["boss-hurt-fx", BOSS_HURT_SHEET]], true);
}
function playBossDefeat(){
  // 死亡動畫與紫色煙霧消散特效同步播放，播完 Boss 保持隱藏
  return playBossSprite([["boss-defeat-fx", BOSS_DEFEAT_SHEET], ["boss-defeat-smoke", BOSS_SMOKE_SHEET]], false);
}

function renderBossStage(promptHtml){
  const node = S.monster;
  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="quit">結束</button>
      <div style="flex:1;text-align:center">
        <span class="badge boss-badge" style="background:var(--bad);color:#fff">BOSS</span>
        <div id="bossHearts" style="font-size:20px;letter-spacing:2px;margin-top:2px">${bossHeartsStr(S.bossHp)}</div>
      </div>
      <div class="pts">回合 <b>${S.bossRoundResults.length + 1}</b></div>
    </header>
    <section class="stage">
      <div class="arena">
        <div class="mon-ring boss final boss-portrait" id="monRing"><img class="boss-art" src="${BOSS_IDLE_SRC}" alt="${esc(node.name)}"></div>
        <div class="mon-name">${esc(node.name)} <span class="badge boss-badge">BOSS</span></div>
      </div>
      <h2 id="status" aria-live="polite"></h2>
      <p id="hint" class="muted"></p>
      ${promptHtml || ""}
      <button class="ring" id="ring" aria-label="錄音狀態"></button>
      <div id="live" class="en muted"></div>
      <div id="resultBox" style="width:100%"></div>
    </section>`;
  $("#quit").onclick = () => { stopAll(); renderPathMap(); };
  $("#ring").onclick = () => { if ($("#ring").dataset.state === "say" && activeRec) { try { activeRec.stop(); } catch(_){} } };
}

function runBossRound(){
  const type = BOSS_ROUND_TYPES[Math.floor(Math.random() * BOSS_ROUND_TYPES.length)];
  if (type === "repeat"){
    S.bossSentence = shuffle(HARD)[0];
    renderBossStage(`<div id="peek" class="en"></div>`);
    runBossRepeatRound();
  } else if (type === "read"){
    S.bossPassage = shuffle(READ_PASSAGES)[0];
    renderBossStage(`<div id="passageBox" class="en passage-box"></div>`);
    runBossReadRound();
  } else {
    S.bossQuestion = shuffle(QUESTIONS)[0];
    renderBossStage(`<div class="mon-sub" style="text-align:center;margin-top:4px">${esc(TYPE_LABEL[S.bossQuestion.type])}</div>`);
    runBossAnswerRound();
  }
}

/* ===== 這一段跟 evaluate()/renderQuestion() 的攻擊收尾邏輯是同一套規則，只是套在「五格愛心」而不是原本的血條上 ===== */
async function applyBossRoundOutcome(pass, roundRecord){
  const tk = S.token;
  S.bossRoundResults.push(roundRecord);
  if (pass){
    S.bossHp = Math.max(0, S.bossHp - 1);
    const defeated = S.bossHp <= 0;
    // 主角攻擊＋攻擊特效 → Boss 受擊動畫 → 愛心 -1 → 還有血就回 idle，沒血就播死亡＋消散
    await playHeroAttack(roundRecord.kind === "answer" ? "magic" : "normal");
    if (tk !== S.token) return null;
    vibrate(defeated ? [40, 60, 40, 60, 120] : 45);
    await playBossHurt();
    if (tk !== S.token) return null;
    const hearts = $("#bossHearts");
    if (hearts) hearts.textContent = bossHeartsStr(S.bossHp);
    if (defeated){
      await playBossDefeat();
      if (tk !== S.token) return null;
      const ring = $("#monRing");
      if (ring){ ring.classList.remove("hit", "counter"); ring.classList.add("down"); }
    }
    return { defeated };
  }
  const ring = $("#monRing");
  if (ring){ ring.classList.remove("hit", "counter", "down"); void ring.offsetWidth; ring.classList.add("counter"); }
  vibrate([30, 40, 30]);
  return { defeated: false };
}

/* ===== 複誦回合 ===== */
async function runBossRepeatRound(){
  const tk = ++S.token;
  const q = S.bossSentence;
  if (S.easy) $("#peek").textContent = q;
  setState("hear", "請仔細聽", "題目會播放兩次");
  await speak(q);    if (tk !== S.token) return;
  await sleep(1400); if (tk !== S.token) return;
  await speak(q);    if (tk !== S.token) return;
  await sleep(700);  if (tk !== S.token) return;
  setState("busy", "準備錄音…", "");
  const r = await listen(); if (tk !== S.token) return;
  resolveBossWordRound(q, r, "repeat");
}

/* ===== 朗讀回合 ===== */
async function runBossReadRound(){
  const tk = ++S.token;
  const q = S.bossPassage;
  $("#passageBox").textContent = q;
  let remain = 45;
  setState("idle", "先默讀短文，準備好再開始朗讀", `倒數 ${remain} 秒，或直接點下面按鈕開始`);
  const startBtn = document.createElement("button");
  startBtn.className = "btn primary";
  startBtn.style.marginTop = "8px";
  startBtn.textContent = "開始朗讀";
  $("#resultBox").innerHTML = "";
  $("#resultBox").appendChild(startBtn);
  await new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearInterval(timer); startBtn.remove(); resolve(); };
    startBtn.onclick = finish;
    const timer = setInterval(() => {
      if (tk !== S.token){ clearInterval(timer); return; }
      remain--;
      const hintEl = $("#hint");
      if (hintEl) hintEl.textContent = remain > 0 ? `倒數 ${remain} 秒，或直接點下面按鈕開始` : "";
      if (remain <= 0) finish();
    }, 1000);
  });
  if (tk !== S.token) return;
  setState("busy", "準備錄音…", "");
  const r = await listen(25000); if (tk !== S.token) return;
  resolveBossWordRound(q, r, "read");
}

/* ===== 複誦／朗讀共用的逐字比對收尾（跟 evaluate() 同一套 tokenize/align/PASS_LINE 判定） ===== */
async function resolveBossWordRound(q, r, kind){
  const hardFail = r.error && HARD_ERR.includes(r.error);
  if (hardFail){
    setState("idle", "無法錄音", "");
    $("#resultBox").innerHTML = `<div class="result">${ERR[r.error] ? `<p class="msg">${ERR[r.error]}</p>` : ""}
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => (kind === "read" ? runBossReadRound() : runBossRepeatRound());
    return;
  }
  const tw = q.split(/\s+/);
  const tokens = [];
  tw.forEach((w, wi) => tokenize(w).forEach(t => tokens.push({ t, wi })));
  const h = tokenize(r.text || "");
  const { ops, extra, dist } = align(tokens.map(x => x.t), h);
  const pct = r.text ? Math.round(Math.max(0, 1 - dist / tokens.length) * 100) : 0;
  const wordOk = tw.map(() => true);
  tokens.forEach((x, k) => { if (ops[k] !== "ok") wordOk[x.wi] = false; });
  const pass = pct >= PASS_LINE;

  const outcome = await applyBossRoundOutcome(pass, { kind, pass, detail: pct });
  if (!outcome) return;

  setState("idle", pass ? "說得很好" : "再接再厲", "");
  const chips = tw.map((w, k) => `<span class="w en ${wordOk[k] ? "ok" : "bad"}">${esc(w)}</span>`).join("");
  $("#resultBox").innerHTML = `
    <div class="result">
      <div class="score"><b>${pct}</b><span class="tag ${pass ? "pass" : "try"}">${pass ? "命中" : "再練一次"}</span></div>
      ${chips}
      ${r.text ? `<p class="heard en">辨識到：${esc(r.text)}</p>` : ""}
      ${extra.length ? `<p class="heard">多說的字：<span class="en">${esc(extra.join(" "))}</span></p>` : ""}
      <div class="actions">
        <button class="btn line" id="replay">聽標準發音</button>
        <button class="btn primary" id="next">${outcome.defeated ? "看結果" : "下一回合"}</button>
      </div>
    </div>`;
  $("#replay").onclick = async () => { $("#replay").disabled = true; await speak(q); const b = $("#replay"); if (b) b.disabled = false; };
  $("#next").onclick = () => { outcome.defeated ? renderBossVictory() : runBossRound(); };
}

/* ===== 問答回合 ===== */
async function runBossAnswerRound(){
  const tk = ++S.token;
  const item = S.bossQuestion;
  setState("hear", "請仔細聽題目", "題目會播放兩次");
  await speak(item.q, TEACHER_RATE); if (tk !== S.token) return;
  await sleep(1400);                if (tk !== S.token) return;
  await speak(item.q, TEACHER_RATE); if (tk !== S.token) return;
  await sleep(700);                 if (tk !== S.token) return;
  setState("busy", "準備回答…", "");
  await sleep(300);                 if (tk !== S.token) return;
  const r = await listen(20000, true); if (tk !== S.token) return;
  resolveBossAnswerRound(item, r);
}
async function resolveBossAnswerRound(item, r){
  const hardFail = r.error && HARD_ERR.includes(r.error);
  if (hardFail){
    setState("idle", "無法錄音", "");
    $("#resultBox").innerHTML = `<div class="result">${ERR[r.error] ? `<p class="msg">${ERR[r.error]}</p>` : ""}
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runBossAnswerRound();
    return;
  }
  if (!r.text){
    setState("idle", "沒聽到回答", "");
    $("#resultBox").innerHTML = `<div class="result"><p class="msg">沒有辨識到內容，請靠近麥克風再試一次。</p>
      <div class="actions"><button class="btn primary" id="retry">再試一次</button></div></div>`;
    $("#retry").onclick = () => runBossAnswerRound();
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
    $("#retry").onclick = () => runBossAnswerRound();
    return;
  }

  const pass = data.score >= PASS_LINE;
  const outcome = await applyBossRoundOutcome(pass, { kind: "answer", pass, detail: data.score });
  if (!outcome) return;

  setState("idle", pass ? "回答得很好" : "可以再更完整一點", "");
  $("#resultBox").innerHTML = `
    <div class="result">
      <div class="score"><b>${data.score}</b><span class="tag ${pass ? "pass" : "try"}">${pass ? "過關" : "再加油"}</span></div>
      <p class="heard en"><b>${esc(item.q)}</b></p>
      <p class="heard en">你說的：${esc(r.text)}</p>
      ${data.feedback ? `<p class="heard">${esc(data.feedback)}</p>` : ""}
      <div class="actions">
        <button class="btn line" id="replay">再聽一次題目</button>
        <button class="btn primary" id="next">${outcome.defeated ? "看結果" : "下一回合"}</button>
      </div>
    </div>`;
  $("#replay").onclick = async () => { $("#replay").disabled = true; await speak(item.q, TEACHER_RATE); const b = $("#replay"); if (b) b.disabled = false; };
  $("#next").onclick = () => { outcome.defeated ? renderBossVictory() : runBossRound(); };
}

/* ===== Boss 勝利（先用現有 HTML/CSS 的簡單版本，之後再換正式素材/特效） ===== */
function renderBossVictory(){
  stopAll();
  const progress = loadPathProgress();
  if (progress[S.viaPath] < 3) progress[S.viaPath] = 3;
  savePathProgress(progress);
  const rounds = S.bossRoundResults;
  const passedRounds = rounds.filter(x => x.pass).length;
  const kindLabel = { repeat: "複誦", read: "朗讀", answer: "問答" };
  app.innerHTML = `
    <section class="sum" style="text-align:center">
      <div class="big" style="font-size:40px">🎉 VICTORY!</div>
      <p class="muted" style="margin-top:4px;letter-spacing:1px">GEPT ADVENTURE COMPLETE</p>
      <div class="result" style="margin-top:20px;text-align:left">
        <p class="muted">本次 Boss 戰結果</p>
        <p style="margin-top:4px">總回合數 ${rounds.length}　答對 ${passedRounds}　答錯 ${rounds.length - passedRounds}</p>
        <ul class="list">
          ${rounds.map((x, i) => `<li><span>第 ${i + 1} 回合・${esc(kindLabel[x.kind])}</span><b>${x.pass ? "✅" : "❌"}</b></li>`).join("")}
        </ul>
      </div>
      <div class="result" style="margin-top:12px">
        <div style="font-size:48px">🏆</div>
        <p class="muted" style="margin-top:4px">最終寶箱：闖關地圖全通關紀念</p>
      </div>
      <div class="actions" style="margin-top:24px;justify-content:center">
        <button class="btn line" id="retryNode">重新挑戰 Boss</button>
        <button class="btn primary" id="toMap">回地圖</button>
      </div>
    </section>`;
  $("#toMap").onclick = renderPathMap;
  $("#retryNode").onclick = () => startBossBattle(S.viaPath);
}
