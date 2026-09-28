"use strict";
/* ===== V6.0-B 抽題器：Shuffle Bag ＋ 最近題目記憶 ＋ topic cooldown =====
   只決定「從現有題庫選哪一題」，不改題目內容、題型或各模式的出題結構。
   - 每個題池一個 Shuffle Bag（repeat_easy／repeat_medium／repeat_hard／read／answer_warmup／answer_preference／answer_situational）：
     洗牌後依序取用，用完才重新洗牌；重新洗牌時第一題不會是上一輪最後一題。
   - 最近題目記憶（REPEAT 10／READ 3／ANSWER 8 個 id）：重新洗牌後不會馬上又抽到剛用過的題目。
   - topic cooldown：有其他候選時，不選跟上一題（或同一輪已選題目）同 topic 的題目。
   - 所有限制都是「盡量」：候選不足時依序放寬 topic → 最近記憶 → 同一輪不重複，保證一定抽得到題目。
   抽題記憶存在 localStorage 的 gept_question_history_v1，跟遊戲進度分開。 */
const QUESTION_HISTORY_KEY = "gept_question_history_v1";
const RECENT_LIMIT = { repeat: 10, read: 3, answer: 8 };

let pickerState = null;   // { v, bags: { key: { queue:[id], all:[id] } }, recent: { mode:[id] }, lastTopic: { mode }, last: { key: id } }
let pickerIndex = null;   // 由 questionBank 建立：{ pools: { key: [item] }, byId: { id: item }, byText: Map(text → item) }

function pickerBuildIndex(){
  if (pickerIndex || !questionBank) return pickerIndex;
  const pools = { repeat_easy: [], repeat_medium: [], repeat_hard: [], read: [], answer_warmup: [], answer_preference: [], answer_situational: [] };
  const byId = {}, byText = new Map();
  questionBank.repeat.forEach(it => { const x = { id: it.id, topic: it.topic, text: it.text, difficulty: it.difficulty }; pools["repeat_" + it.difficulty].push(x); byId[x.id] = x; byText.set(x.text, x); });
  questionBank.read.forEach(it => { const x = { id: it.id, topic: it.topic, text: it.text }; pools.read.push(x); byId[x.id] = x; });
  questionBank.questions.forEach(it => { const x = { id: it.id, topic: it.topic, text: it.question, category: it.category }; pools["answer_" + it.category].push(x); byId[x.id] = x; });
  pickerIndex = { pools, byId, byText };
  return pickerIndex;
}

function pickerLoadState(){
  if (pickerState) return pickerState;
  const idx = pickerBuildIndex();
  let st = null;
  try { st = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEY) || "null"); } catch(_) { st = null; }
  if (!st || typeof st !== "object" || st.v !== 1) st = {};
  const clean = { v: 1, bags: {}, recent: {}, lastTopic: {}, last: {} };
  const known = id => typeof id === "string" && idx.byId[id];
  // V6-D0.1：opinion 改名為 preference（題目 id 不變），舊存檔的這一輪 bag 接著用，不重新洗牌
  [st.bags, st.last].forEach(m => { if (m && m.answer_opinion && !m.answer_preference){ m.answer_preference = m.answer_opinion; delete m.answer_opinion; } });
  // 舊資料裡已經不存在的 id 丟掉；題庫新增的題目插進目前這一輪的 Shuffle Bag
  Object.keys(idx.pools).forEach(key => {
    const b = st.bags && st.bags[key];
    const poolIds = idx.pools[key].map(x => x.id);
    if (!b || !Array.isArray(b.queue) || !Array.isArray(b.all)) return;
    const inPool = new Set(poolIds);
    const queue = [...new Set(b.queue)].filter(id => inPool.has(id));
    const all = new Set(b.all.filter(id => inPool.has(id)));
    poolIds.filter(id => !all.has(id)).forEach(id => { queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, id); all.add(id); });
    clean.bags[key] = { queue, all: [...all] };
    if (known(st.last && st.last[key])) clean.last[key] = st.last[key];
  });
  Object.keys(RECENT_LIMIT).forEach(mode => {
    const r = st.recent && Array.isArray(st.recent[mode]) ? st.recent[mode] : [];
    clean.recent[mode] = r.filter(known).slice(-RECENT_LIMIT[mode]);
    if (typeof (st.lastTopic && st.lastTopic[mode]) === "string") clean.lastTopic[mode] = st.lastTopic[mode];
  });
  pickerState = clean;
  return pickerState;
}
function pickerSave(){
  try { localStorage.setItem(QUESTION_HISTORY_KEY, JSON.stringify(pickerState)); } catch(_) {}
}

// 重新洗牌：整個題池洗一次；如果第一題剛好是上一輪最後一題，跟後面隨機一題交換（不會無限重洗）
function pickerRefill(key){
  const ids = pickerIndex.pools[key].map(x => x.id);
  const queue = shuffle(ids);
  const last = pickerState.last[key];
  if (queue.length > 1 && queue[0] === last){
    const j = 1 + Math.floor(Math.random() * (queue.length - 1));
    [queue[0], queue[j]] = [queue[j], queue[0]];
  }
  pickerState.bags[key] = { queue, all: ids.slice() };
}

/* 從某個題池的 Shuffle Bag 取一題。
   exclude：同一輪已經選過的 id；avoidTopics：這一題最好避開的 topic。
   依序放寬條件，保證有題目就一定回傳一題。 */
function pickerDraw(key, mode, exclude, avoidTopics){
  const pool = pickerIndex.pools[key];
  if (!pool || !pool.length) return null;
  let bag = pickerState.bags[key];
  if (!bag || !bag.queue.length){ pickerRefill(key); bag = pickerState.bags[key]; }
  const recent = new Set(pickerState.recent[mode] || []);
  const item = id => pickerIndex.byId[id];
  const tiers = [
    id => !exclude.has(id) && !recent.has(id) && !avoidTopics.has(item(id).topic),
    id => !exclude.has(id) && !recent.has(id),
    id => !exclude.has(id),
    () => true
  ];
  let chosen = null;
  for (const ok of tiers){
    const k = bag.queue.findIndex(id => item(id) && ok(id));
    if (k >= 0){ chosen = bag.queue.splice(k, 1)[0]; break; }
    // 這一輪 Shuffle Bag 裡剩下的都不符合「同一輪不重複」→ 開新的一輪再找
    if (ok === tiers[2]){ pickerRefill(key); bag = pickerState.bags[key]; const k2 = bag.queue.findIndex(id => !exclude.has(id)); if (k2 >= 0){ chosen = bag.queue.splice(k2, 1)[0]; break; } }
  }
  if (!chosen) chosen = pool[Math.floor(Math.random() * pool.length)].id; // 理論上不會走到這裡
  const x = item(chosen);
  pickerState.last[key] = chosen;
  pickerState.recent[mode] = (pickerState.recent[mode] || []).concat(chosen).slice(-RECENT_LIMIT[mode]);
  pickerState.lastTopic[mode] = x.topic;
  return x;
}

function pickerReady(){ return !!(questionBank && pickerBuildIndex() && pickerLoadState()); }

/* ===== 對外：各模式取題（出錯時退回原本的隨機抽題，遊戲不會卡住） ===== */

// REPEAT：pool 是原本 MONSTERS／PATH_NODES 的 pool()（EASY、MEDIUM、HARD 或 MEDIUM.concat(HARD)）
function pickRepeatRound(pool, n){
  try {
    if (!pickerReady()) throw new Error("question bank not ready");
    const diffs = [...new Set(pool.map(t => { const x = pickerIndex.byText.get(t); return x && x.difficulty; }))].filter(Boolean);
    if (!diffs.length) throw new Error("unknown repeat pool");
    const weights = diffs.map(d => pickerIndex.pools["repeat_" + d].length);
    const total = weights.reduce((a, b) => a + b, 0);
    const exclude = new Set(), out = [];
    for (let k = 0; k < n; k++){
      let r = Math.random() * total, d = diffs[diffs.length - 1];   // 混合題池：依各難度題數比例決定這題抽哪個難度（跟原本從合併題池均勻抽一致）
      for (let j = 0; j < diffs.length; j++){ if (r < weights[j]){ d = diffs[j]; break; } r -= weights[j]; }
      const avoid = new Set([pickerState.lastTopic.repeat].filter(Boolean));
      const x = pickerDraw("repeat_" + d, "repeat", exclude, avoid);
      exclude.add(x.id); out.push(x.text);
    }
    pickerSave();
    return out;
  } catch(err){
    console.error("[questionPicker] repeat 抽題失敗，改用隨機抽題", err);
    return shuffle(pool).slice(0, n);
  }
}

// READ
function pickReadRound(n){
  try {
    if (!pickerReady()) throw new Error("question bank not ready");
    const exclude = new Set(), out = [];
    for (let k = 0; k < n; k++){
      const x = pickerDraw("read", "read", exclude, new Set([pickerState.lastTopic.read].filter(Boolean)));
      exclude.add(x.id); out.push(x.text);
    }
    pickerSave();
    return out;
  } catch(err){
    console.error("[questionPicker] read 抽題失敗，改用隨機抽題", err);
    return shuffle(READ_PASSAGES).slice(0, n);
  }
}

// ANSWER：指定 category 取一題固定題庫的題目；avoidTopics 是同一輪已選題目的 topic
function pickAnswerQuestion(category, avoidTopics){
  try {
    if (!pickerReady()) throw new Error("question bank not ready");
    const avoid = new Set(avoidTopics || []);
    if (pickerState.lastTopic.answer) avoid.add(pickerState.lastTopic.answer);
    const x = pickerDraw("answer_" + category, "answer", new Set(), avoid);
    pickerSave();
    return { type: category, q: x.text, topic: x.topic };
  } catch(err){
    console.error("[questionPicker] answer 抽題失敗，改用隨機抽題", err);
    const pool = QUESTIONS.filter(it => it.type === category);
    return { ...shuffle(pool.length ? pool : QUESTIONS)[0] };
  }
}
// Boss 的問答回合：原本是從全部 36 題均勻抽，這裡先依題數比例選 category，再從該 category 的 Shuffle Bag 取
function pickBossAnswerQuestion(){
  const cats = Object.keys(TYPE_LABEL);
  let r = Math.random() * QUESTIONS.length, cat = cats[cats.length - 1];
  for (const c of cats){ const n = QUESTIONS.filter(it => it.type === c).length; if (r < n){ cat = c; break; } r -= n; }
  return pickAnswerQuestion(cat, []);
}
