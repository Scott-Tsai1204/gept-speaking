"use strict";
/* ===== 題庫：原創的初級程度句子，不分主題，依難度分三池 =====
   V6.0-A：題目內容都放在 assets/data/question_bank.json，這裡的陣列由 loadQuestionBank() 載入後填入
   （保留原本的變數名稱，所以 MONSTERS／PATH_NODES／boss.js／map.js／questions.js 的取題方式都不變） */
const EASY = [];
const MEDIUM = [];
const HARD = [];

/* ===== 朗讀關：初級程度短文，1 分鐘準備後朗讀，逐字比對（跟複誦關同一套比對邏輯） ===== */
const READ_PASSAGES = [];

/* ===== 怪獸長廊：不分主題，隨機從難度池抽題 ===== */
const MONSTERS = [
  { name:"哈欠史萊姆", emoji:"🟢", hp:5, pool:() => EASY },
  { name:"迷路小兔",   emoji:"🐰", hp:5, pool:() => EASY },
  { name:"貪睡貓怪",   emoji:"🐱", hp:5, pool:() => EASY },
  { name:"風暴衛兵",   emoji:"🌪️", hp:7, boss:true, pool:() => MEDIUM },
  { name:"時鐘怪",     emoji:"⏰", hp:5, pool:() => MEDIUM },
  { name:"迷霧幽靈",   emoji:"👻", hp:5, pool:() => MEDIUM },
  { name:"急驚風",     emoji:"⚡", hp:5, pool:() => MEDIUM },
  { name:"石巨人",     emoji:"🗿", hp:7, boss:true, pool:() => HARD },
  { name:"深海海龍",   emoji:"🐉", hp:5, pool:() => MEDIUM.concat(HARD) },
  { name:"影子刺客",   emoji:"🦇", hp:5, pool:() => MEDIUM.concat(HARD) },
  { name:"雷霆鷹",     emoji:"🦅", hp:5, pool:() => MEDIUM.concat(HARD) },
  { name:"終極魔王",   emoji:"🐲", hp:9, boss:true, final:true, pool:() => HARD }
];
const PASS_LINE = 80;   // 初級口說通過分數
const TEACHER_RATE = 0.78;   // 問答挑戰「老師」唸題目的語速，比複誦戰稍慢

/* ===== 闖關地圖：直式小徑，混合複誦／朗讀／問答三種節點，最後是 Boss ===== */
const PATH_NODES = [
  { type:"repeat", name:"哈欠史萊姆", emoji:"🟢", hp:3, pool:() => EASY },
  { type:"read",   name:"呆呆貓頭鷹", emoji:"🦉", hp:1 },
  { type:"answer", name:"小老師",     emoji:"🧑‍🏫" },
  { type:"repeat", name:"迷路小兔",   emoji:"🐰", hp:3, pool:() => MEDIUM },
  { type:"read",   name:"山羊學者",   emoji:"📖", hp:1 },
  { type:"answer", name:"大考老師",   emoji:"👩‍🏫" },
  { type:"repeat", name:"迷霧幽靈",   emoji:"👻", hp:3, pool:() => MEDIUM.concat(HARD) },
  { type:"repeat", name:"終極魔王",   emoji:"🐲", hp:9, boss:true, final:true, pool:() => HARD }
];

/* ===== 問答挑戰：暖身題／看法題／情境題，交給後端 LLM 評分 ===== */
const WORKER_URL = "https://gept-speaking-proxy.gept-speaking.workers.dev";
// 問答題的三個分類：本遊戲依 GEPT 初級口說「回答問題」的能力與題目特徵自訂的題庫分類，方便練習與管理，並非 GEPT 官方公布的正式分類。
// V6-D0.1：opinion 改名為 preference（Worker 出題 API 仍使用舊名 opinion，見 questions.js 的 WORKER_QTYPE）
const TYPE_LABEL = { warmup: "基礎題", preference: "喜好題", situational: "情境題" };
const QUESTIONS = [];

/* ===== 題庫載入與驗證（question_bank.json → 上面 5 個陣列） ===== */
const QUESTION_BANK_URL = "assets/data/question_bank.json";
// 題數下限，驗證用（V6.0-C：問答 36 → 108）。V6-D0 起可用 tools/question-bank-manager.html 追加外部題庫，
// 所以只檢查「不少於」：現有題目意外遺失時仍會擋下。JSON 裡的 pending（待分類區）遊戲不讀取
const QUESTION_BANK_EXPECT = { repeat: 88, read: 8, questions: 108 };
let questionBank = null; // 驗證通過後的原始 JSON（repeat／read／questions）
function validateQuestionBank(bank){
  const errs = [];
  if (!bank || typeof bank !== "object") return ["題庫不是 JSON 物件"];
  const nonEmpty = v => typeof v === "string" && v.trim() !== "";
  const ids = new Set();
  const checkList = (key, fields, check) => {
    const list = bank[key];
    if (!Array.isArray(list)){ errs.push(`缺少 ${key} 陣列`); return; }
    if (list.length < QUESTION_BANK_EXPECT[key]) errs.push(`${key} 至少應該有 ${QUESTION_BANK_EXPECT[key]} 題，實際 ${list.length} 題`);
    list.forEach((item, k) => {
      const where = `${key}[${k}]${item && item.id ? `（${item.id}）` : ""}`;
      if (!item || typeof item !== "object"){ errs.push(`${where} 不是物件`); return; }
      fields.forEach(f => { if (!nonEmpty(item[f])) errs.push(`${where} 缺少欄位或內容為空：${f}`); });
      if (nonEmpty(item.id)){ if (ids.has(item.id)) errs.push(`${where} id 重複`); ids.add(item.id); }
      if (check) check(item, where);
    });
  };
  checkList("repeat", ["id", "text", "difficulty", "topic"], (it, w) => { if (!["easy", "medium", "hard"].includes(it.difficulty)) errs.push(`${w} difficulty 不合法：${it.difficulty}`); });
  checkList("read", ["id", "text", "topic"]);
  checkList("questions", ["id", "question", "category", "topic"], (it, w) => { if (!TYPE_LABEL[it.category]) errs.push(`${w} category 不合法：${it.category}`); });
  return errs;
}
async function loadQuestionBank(){
  const res = await fetch(QUESTION_BANK_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`題庫載入失敗：HTTP ${res.status}`);
  const bank = await res.json();
  const errs = validateQuestionBank(bank);
  if (errs.length){
    console.error("[question_bank] 驗證失敗，不使用這份題庫：\n- " + errs.join("\n- "));
    throw new Error("題庫格式驗證失敗（詳見 console）");
  }
  // 依 JSON 裡的順序填入，維持原本題目順序；問答題轉回程式原本使用的 { type, q } 格式
  bank.repeat.forEach(it => ({ easy: EASY, medium: MEDIUM, hard: HARD })[it.difficulty].push(it.text));
  bank.read.forEach(it => READ_PASSAGES.push(it.text));
  bank.questions.forEach(it => QUESTIONS.push({ type: it.category, q: it.question }));
  questionBank = bank;
  return bank;
}
// 頁面一載入就開始抓題庫；main.js 按「開始」時會等它完成才進入遊戲
const questionBankReady = loadQuestionBank().catch(err => { console.error("[question_bank]", err); throw err; });
questionBankReady.catch(() => {}); // 避免尚未有人 await 時出現 unhandled rejection

/* ===== 小工具 ===== */
const $ = s => document.querySelector(s);
const app = $("#app");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RECORDING_SUPPORTED = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function vibrate(pattern){ try { navigator.vibrate && navigator.vibrate(pattern); } catch(_) {} }

/* ===== 答對時的主角攻擊動畫＋特效（複誦戰／朗讀關／問答挑戰共用，疊在 #monRing 上） ===== */
const HERO_ATTACK_SRC = "assets/characters/hero/hero_attack.png";
const HERO_ATTACK2_SRC = "assets/characters/hero/hero_attack2.png";
const EFFECT_ATTACK_SRC = "assets/effects/effect_attack.png";
const ATTACK_ANIM_MS = 700;
function playHeroAttack(kind){
  return new Promise(resolve => {
    const ring = $("#monRing");
    if (!ring){ resolve(); return; }
    const heroSrc = kind === "magic" ? HERO_ATTACK2_SRC : HERO_ATTACK_SRC;
    const wrap = document.createElement("div");
    wrap.className = "battle-attack-fx";
    wrap.innerHTML = `<div class="battle-hero" style="background-image:url('${heroSrc}')"></div><div class="battle-effect" style="background-image:url('${EFFECT_ATTACK_SRC}')"></div>`;
    ring.appendChild(wrap);
    setTimeout(() => { wrap.remove(); resolve(); }, ATTACK_ANIM_MS);
  });
}

/* ===== 怪物受擊／消失特效（同樣疊在 #monRing 上，只有真的擊敗時才播消失） ===== */
const EFFECT_MONSTER_HIT_SRC = "assets/effects/effect_monster_hit.png";
const EFFECT_MONSTER_VANISH_SRC = "assets/effects/effect_monster_vanish.png";
const MONSTER_HIT_MS = 550;
const MONSTER_VANISH_MS = 650;
function playMonsterHit(){
  return new Promise(resolve => {
    const ring = $("#monRing");
    if (!ring){ resolve(); return; }
    const fx = document.createElement("div");
    fx.className = "monster-hit-fx";
    fx.style.backgroundImage = `url('${EFFECT_MONSTER_HIT_SRC}')`;
    ring.appendChild(fx);
    setTimeout(() => { fx.remove(); resolve(); }, MONSTER_HIT_MS);
  });
}
function playMonsterVanish(){
  return new Promise(resolve => {
    const ring = $("#monRing");
    if (!ring){ resolve(); return; }
    const icon = ring.children[0];
    if (icon) icon.style.transition = "opacity .5s ease, transform .5s ease";
    const fx = document.createElement("div");
    fx.className = "monster-vanish-fx";
    fx.style.backgroundImage = `url('${EFFECT_MONSTER_VANISH_SRC}')`;
    ring.appendChild(fx);
    setTimeout(() => { if (icon){ icon.style.opacity = "0"; icon.style.transform = "scale(.6)"; } }, 0);
    setTimeout(() => { fx.remove(); resolve(); }, MONSTER_VANISH_MS);
  });
}

/* ===== V3 戰鬥回饋：傷害數字／COMBO／MISS（純視覺，不影響 HP 或任何判定） =====
   都疊在 .arena 上、以 #monRing 為定位基準：-1 與 MISS 在怪物左上方往上飄（主角攻擊圖在左下，不會重疊），
   COMBO 在右上方；放上去後如果超出螢幕就往內推，避免手機產生水平捲軸 */
const DAMAGE_FX_MS = 900, MISS_FX_MS = 1000, COMBO_FX_MS = 1700;
const FX_MAX_SCALE = 1.3; // 動畫過程中最大的放大倍率（見 index.html 的 fxDamage/fxMiss/fxCombo）
function spawnBattleFx(cls, text, fx, fy, ms, centered){
  const ring = $("#monRing");
  const arena = ring && ring.closest(".arena");
  if (!arena) return null;
  const ar = arena.getBoundingClientRect(), rr = ring.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "battle-float " + cls;
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  const ax = rr.left - ar.left + rr.width * fx;
  el.style.left = ax + "px";
  el.style.top = (rr.top - ar.top + rr.height * fy) + "px";
  arena.appendChild(el);
  // 用不受動畫縮放影響的 offsetWidth 算「放到最大時」的左右邊界，超出畫面就往內推
  const w = el.offsetWidth, vw = document.documentElement.clientWidth;
  const left = ar.left + ax - (centered ? w / 2 : 0) - w * (FX_MAX_SCALE - 1) / 2;
  const right = left + w * FX_MAX_SCALE;
  if (right > vw - 6) el.style.marginLeft = (vw - 6 - right) + "px";
  else if (left < 6) el.style.marginLeft = (6 - left) + "px";
  setTimeout(() => el.remove(), ms);
  return el;
}
function showDamageNumber(){ spawnBattleFx("fx-damage", "-1", -0.02, 0.22, DAMAGE_FX_MS, true); }
function showMiss(){ spawnBattleFx("fx-miss", "MISS!", -0.14, 0.22, MISS_FX_MS, true); }
function showCombo(n){
  if (!(n > 0)) return;
  document.querySelectorAll(".battle-float.fx-combo").forEach(e => e.remove());
  spawnBattleFx("fx-combo", `COMBO ×${n}`, 0.96, 0.04, COMBO_FX_MS, false);
}

/* ===== 擊敗演出：被打倒的閃爍 → 原本的消散特效＋淡出 → 在怪物位置跳出 VICTORY!（留在畫面上直到離開戰鬥） ===== */
const DEFEAT_BLINK_MS = 450;
const STAGE_CLEAR_DELAY_MS = 450; // VICTORY! 跳出後，STAGE CLEAR! 接著出現
const VICTORY_HOLD_MS = 1500;     // VICTORY!＋STAGE CLEAR! 一起停留，之後才跳出原本的結果面板
async function playMonsterDefeat(){
  const ring = $("#monRing");
  const icon = ring && ring.children[0];
  if (icon){
    icon.classList.add("defeat-blink");
    await sleep(DEFEAT_BLINK_MS);
    icon.classList.remove("defeat-blink");
  }
  await playMonsterVanish();
}
function showVictory(){
  const ring = $("#monRing");
  const arena = ring && ring.closest(".arena");
  if (!arena) return;
  arena.querySelectorAll(".battle-victory, .battle-stage-clear").forEach(e => e.remove());
  const ar = arena.getBoundingClientRect(), rr = ring.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "battle-victory";
  el.setAttribute("role", "status");
  el.textContent = "VICTORY!";
  el.style.left = (rr.left - ar.left + rr.width / 2) + "px";
  el.style.top = (rr.top - ar.top + rr.height / 2) + "px";
  arena.appendChild(el);
  // V5：STAGE CLEAR! 小徽章接在 VICTORY! 下方（普通怪與 Boss 共用，不改呼叫端流程）
  setTimeout(() => {
    if (!el.isConnected) return;
    const sc = document.createElement("div");
    sc.className = "battle-stage-clear";
    sc.textContent = "STAGE CLEAR!";
    sc.style.left = el.style.left;
    sc.style.top = (parseFloat(el.style.top) + 36) + "px";
    arena.appendChild(sc);
  }, STAGE_CLEAR_DELAY_MS);
}

const S = { round: [], i: 0, score: 0, combo: 0, results: [], easy: false, token: 0, mode: null, monsterIndex: null, monster: null, hp: 0, viaPath: null };
let voice = null, activeRec = null, wakeLock = null;

/* ===== 常見的辨識/評分錯誤訊息（複誦戰、朗讀關、問答挑戰共用） ===== */
const ERR = {
  "not-allowed": "麥克風被封鎖了。請點網址列左側的圖示，允許麥克風後再試一次。",
  "service-not-allowed": "麥克風被封鎖了。請點網址列左側的圖示，允許麥克風後再試一次。",
  "audio-capture": "找不到麥克風，請確認裝置的麥克風可以使用。",
  "network": "語音辨識需要網路，請確認連線後再試一次。",
  "no-speech": "沒有聽到聲音。請靠近麥克風，看到「換你說」之後再開口。"
};
const HARD_ERR = ["not-allowed", "service-not-allowed", "audio-capture", "network"];

/* ===== 關卡進度（存在這支手機的瀏覽器裡） ===== */
function loadProgress(){
  try {
    const p = JSON.parse(localStorage.getItem("gept_progress_v2") || "null");
    if (Array.isArray(p) && p.length === MONSTERS.length) return p;
  } catch(_) {}
  return MONSTERS.map(() => 0);
}
function saveProgress(p){ try { localStorage.setItem("gept_progress_v2", JSON.stringify(p)); } catch(_) {} }

/* ===== 闖關地圖進度（跟怪獸長廊分開存） ===== */
function loadPathProgress(){
  try {
    const p = JSON.parse(localStorage.getItem("gept_progress_path_v1") || "null");
    if (Array.isArray(p) && p.length === PATH_NODES.length) return p;
  } catch(_) {}
  return PATH_NODES.map(() => 0);
}
function savePathProgress(p){ try { localStorage.setItem("gept_progress_path_v1", JSON.stringify(p)); } catch(_) {} }
// 測試用：網址帶 ?unlockAll（不分大小寫）時，闖關地圖與怪獸長廊全部開放（不改存檔、不影響一般網址）
const TEST_UNLOCK_ALL = /[?&]unlockall(=|&|$)/i.test(location.search);
// 暫時的測試開關：網址帶 ?test 時，闖關地圖的戰鬥畫面多一顆「直接過關」按鈕（見 map.js 的 mountTestWinButton）
const TEST_QUICK_WIN = /[?&]test(=|&|$)/i.test(location.search);
function isPathNodeUnlocked(ni, progress){ return TEST_UNLOCK_ALL || ni === 0 || progress[ni - 1] > 0; }
function isMonsterUnlocked(mi, progress){ return TEST_UNLOCK_ALL || mi === 0 || progress[mi - 1] > 0; }
function starsFromPassed(passed, hp){
  if (passed >= hp) return 3;
  if (passed >= Math.ceil(hp * 0.6)) return 2;
  if (passed >= 1) return 1;
  return 0;
}
function starsStr(n){ return "★".repeat(n) + "☆".repeat(3 - n); }
function totalStars(progress){ return progress.reduce((a, s) => a + s, 0); }

/* ===== 複習池：答錯的整句，之後在複習站再次出現 ===== */
function loadMissedSentences(){
  try { return JSON.parse(localStorage.getItem("gept_missed_sentences") || "{}"); } catch(_) { return {}; }
}
function saveMissedSentences(m){ try { localStorage.setItem("gept_missed_sentences", JSON.stringify(m)); } catch(_) {} }
function bumpMissedSentence(q){ const m = loadMissedSentences(); m[q] = (m[q] || 0) + 1; saveMissedSentences(m); }
function clearMissedSentence(q){ const m = loadMissedSentences(); if (q in m){ delete m[q]; saveMissedSentences(m); } }
function reviewPoolList(){ return Object.entries(loadMissedSentences()).sort((a, b) => b[1] - a[1]); }

/* ===== 常錯的字（存在這支手機的瀏覽器裡） ===== */
function bumpMissed(words){
  try {
    const m = JSON.parse(localStorage.getItem("gept_missed") || "{}");
    words.forEach(w => { m[w] = (m[w] || 0) + 1; });
    localStorage.setItem("gept_missed", JSON.stringify(m));
  } catch(_) {}
}
function topMissed(k = 8){
  try {
    const m = JSON.parse(localStorage.getItem("gept_missed") || "{}");
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k);
  } catch(_) { return []; }
}

/* ===== 清除遊戲進度（開始頁的按鈕）：只刪這個遊戲自己的 key，不影響同網域的其他網站 ===== */
const GAME_STORAGE_KEYS = ["gept_progress_path_v1", "gept_progress_v2", "gept_question_history_v1", "gept_missed_sentences", "gept_missed"];
function clearGameProgress(){
  GAME_STORAGE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
}
