"use strict";
/* ===== V6-D0 外部題庫（課外書來源）匯入核心 =====
   純資料處理，不碰畫面：Excel 列 → 驗證 → 重複檢查 → 分類建議 → 合併成遊戲可用的 question_bank.json。
   原則：
   - 使用者輸入的 Question／Text 一個字都不改（連前後空白都原樣保留）
   - 分類建議只是建議：寫在 suggestedCategory／suggestedTopic／suggestedDifficulty，使用者按「接受」才會變成正式欄位
   - 既有題目（repeat／read／questions）原封不動，只在陣列尾端追加
   - 遊戲一定要有的欄位（ANSWER 的 category、REPEAT 的 difficulty）空白時，題目放進 pending（待分類區），遊戲不讀取
   這些題目是「外部題庫／課外書來源」，不是官方 GEPT 題目。 */
(function(global){

const CATEGORIES = ["warmup", "opinion", "situational"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const UNSPECIFIED_TOPIC = "unspecified"; // Topic 空白時放進遊戲題庫用的標記（遊戲的 topic cooldown 需要非空字串）

/* ---------- Excel 工作表格式 ---------- */
const SHEETS = {
  answer: { sheet: "ANSWER", textCol: "question", cols: { question: "Question", sourcebook: "Source Book", sourcepage: "Source Page", category: "Category", topic: "Topic", notes: "Notes" }, required: ["question", "sourcebook", "sourcepage"] },
  repeat: { sheet: "REPEAT", textCol: "text", cols: { text: "Text", sourcebook: "Source Book", sourcepage: "Source Page", difficulty: "Difficulty", topic: "Topic", notes: "Notes" }, required: ["text", "sourcebook", "sourcepage"] },
  read:   { sheet: "READ",   textCol: "text", cols: { text: "Text", sourcebook: "Source Book", sourcepage: "Source Page", topic: "Topic", notes: "Notes" }, required: ["text", "sourcebook", "sourcepage"] }
};
const TYPES = ["answer", "repeat", "read"];
const BANK_KEY = { answer: "questions", repeat: "repeat", read: "read" }; // question_bank.json 裡的陣列名稱
const TEXT_FIELD = { answer: "question", repeat: "text", read: "text" };

// 表頭比對：不分大小寫、忽略「(optional)」與空白標點，所以 "Source Book"、"source book (optional)" 都認得
const headerKey = h => String(h == null ? "" : h).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
const cellStr = v => v == null ? "" : String(v);
const isBlank = v => cellStr(v).trim() === "";

// 讀一張工作表的二維陣列（SheetJS sheet_to_json header:1 的結果）→ { rows, problems }
function parseSheetRows(type, aoa){
  const spec = SHEETS[type], problems = [], rows = [];
  const headerIdx = aoa.findIndex(r => Array.isArray(r) && r.some(c => !isBlank(c)));
  if (headerIdx < 0) return { rows, problems, empty: true };
  const colIndex = {};
  aoa[headerIdx].forEach((h, i) => { const k = headerKey(h); if (spec.cols[k] && colIndex[k] == null) colIndex[k] = i; });
  const missingCols = spec.required.filter(k => colIndex[k] == null);
  if (missingCols.length){
    problems.push(`${spec.sheet} 工作表缺少欄位：${missingCols.map(k => spec.cols[k]).join("、")}`);
    return { rows, problems };
  }
  for (let r = headerIdx + 1; r < aoa.length; r++){
    const line = aoa[r] || [];
    if (!line.some(c => !isBlank(c))) continue; // 整列空白：略過
    const get = k => colIndex[k] == null ? "" : cellStr(line[colIndex[k]]);
    rows.push({
      type, origin: "excel", sheet: spec.sheet, rowNum: r + 1, // Excel 的列號（1 起算）
      text: get(spec.textCol),                                // 原文，完全不處理
      sourceBook: get("sourcebook").trim(), sourcePage: get("sourcepage").trim(), notes: get("notes").trim(),
      given: { category: get("category").trim(), topic: get("topic").trim(), difficulty: get("difficulty").trim() }
    });
  }
  return { rows, problems };
}

// 整本活頁簿（SheetJS workbook）→ { rows, problems, counts, missingSheets }
function parseWorkbook(XLSX, wb){
  const out = { rows: [], problems: [], counts: { answer: 0, repeat: 0, read: 0 }, missingSheets: [] };
  TYPES.forEach(type => {
    const name = wb.SheetNames.find(n => n.trim().toUpperCase() === SHEETS[type].sheet);
    if (!name){ out.missingSheets.push(SHEETS[type].sheet); return; }
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false });
    const res = parseSheetRows(type, aoa);
    out.problems.push(...res.problems);
    out.rows.push(...res.rows);
    out.counts[type] = res.rows.length;
  });
  return out;
}

/* ---------- 文字正規化與相似度（只用來比對，不會寫回題目） ---------- */
const CONTRACTIONS = [
  [/\blet's\b/g, "let us"], [/\bwon't\b/g, "will not"], [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bshan't\b/g, "shall not"],
  [/\bi'm\b/g, "i am"], [/\b(what|it|that|there|he|she|who|where|how|here)'s\b/g, "$1 is"],
  [/n't\b/g, " not"], [/'re\b/g, " are"], [/'ve\b/g, " have"], [/'ll\b/g, " will"], [/'d\b/g, " would"]
];
const SPELLING = [[/\bfavourite\b/g, "favorite"], [/\bcolour\b/g, "color"], [/\bneighbour\b/g, "neighbor"], [/\btheatre\b/g, "theater"], [/\bcentre\b/g, "center"]];
function normalizeText(s){
  let t = cellStr(s).toLowerCase().replace(/[‘’ʼ`]/g, "'");
  CONTRACTIONS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  SPELLING.forEach(([re, rep]) => { t = t.replace(re, rep); });
  return t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function bigrams(s){
  const t = s.replace(/\s+/g, " "), m = new Map();
  for (let i = 0; i < t.length - 1; i++){ const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function diceSimilarity(a, b){
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, na = 0, nb = 0;
  A.forEach(v => { na += v; });
  B.forEach(v => { nb += v; });
  A.forEach((v, g) => { if (B.has(g)) inter += Math.min(v, B.get(g)); });
  return na + nb ? 2 * inter / (na + nb) : 0;
}
const SIMILAR_THRESHOLD = 0.85;
const DUP_LABEL = {
  exact: "完全相同",
  case: "忽略大小寫／前後空白後相同",
  normalized: "可能重複（只差縮寫或標點）",
  similar: "高度相似"
};
// 比較兩段文字 → null 或 { level, score }
function compareTexts(a, b){
  const ra = cellStr(a), rb = cellStr(b);
  if (ra === rb) return { level: "exact", score: 1 };
  if (ra.trim().toLowerCase() === rb.trim().toLowerCase()) return { level: "case", score: 1 };
  const na = normalizeText(ra), nb = normalizeText(rb);
  if (na && na === nb) return { level: "normalized", score: 1 };
  const score = diceSimilarity(na, nb);
  return score >= SIMILAR_THRESHOLD ? { level: "similar", score } : null;
}

/* ---------- 分類建議（規則式；判斷不了就說判斷不了，不硬猜） ---------- */
const UNSURE = "無法可靠判斷";
function suggestCategory(question){
  const q = cellStr(question).trim(), t = q.toLowerCase().replace(/[‘’]/g, "'");
  if (!q) return { value: null, reason: UNSURE };
  const hit = (re, why) => re.test(t) ? why : null;
  const situational =
    hit(/\b(imagine|suppose|pretend)\b/, "含 imagine／suppose") ||
    hit(/\bwhat (would|will|should|could|can) you (say|ask|tell|do)\b/, "問「你會怎麼說／問」") ||
    hit(/\bhow (would|will|could|can|should) you (ask|tell|say|invite|explain|respond|reply|apologi[sz]e|thank)\b/, "問「你會怎麼開口」");
  if (situational) return { value: "situational", reason: situational };
  const opinion =
    hit(/\bwhy\b/, "含 why") ||
    hit(/\b(do|would) you (like|enjoy|love|prefer|think|feel|agree)\b/, "問喜好或看法") ||
    hit(/\b(would you rather|what do you think|in your opinion|how do you feel)\b/, "問看法") ||
    hit(/\bfavou?rite\b/, "含 favorite") ||
    hit(/\bprefer\b|\bwhich .*\b(better|more|like)\b/, "比較喜好") ||
    hit(/\bwhat kind of .* (do|would) you like\b/, "問喜歡的種類") ||
    hit(/\b(is it|do you think it is) (important|good|bad|useful|necessary)\b|\bshould\b/, "問看法");
  if (opinion) return { value: "opinion", reason: opinion };
  const warmup = hit(new RegExp("^(what('s| is| are) (your|the)|what time|what day|what did you|what do you usually|what do your|what languages|" +
    "where (do|did|is|are|does)|when (is|do|did|does)|who (is|do|does|did|cooks)|how (old|are you|many|much|long|often|do you usually|do you get|do you go|was|is)|" +
    "do you have|did you|can you|is there|are there|are you|have you|" +
    "what (\\w+ ){1,2}(do|does|did|can) you (play|have|study|eat|speak|take|use|wear))\\b"), "基本個人／事實問題");
  if (warmup) return { value: "warmup", reason: warmup };
  return { value: null, reason: UNSURE };
}

// Topic 關鍵字（名稱沿用現有題庫的 topic 寫法；ANSWER 的學校類現有題庫叫 school_work）
const TOPIC_KEYWORDS = {
  food: ["food", "eat", "eating", "ate", "breakfast", "lunch", "dinner", "noodles", "rice", "fruit", "snack", "snacks", "cook", "cooking", "cooks", "drink", "coffee", "tea", "cake", "delicious", "hungry", "meal", "vegetable", "vegetables", "meat", "chicken", "beef", "pizza", "sweet", "salty", "spicy", "soup", "bread", "milk", "juice",
    "apple", "apples", "banana", "bananas", "orange", "oranges", "egg", "eggs", "candy", "ice cream", "sandwich", "hamburger", "dumplings"],
  restaurant: ["restaurant", "waiter", "waitress", "menu", "order food", "the bill", "book a table", "dish", "dishes"],
  school: ["school", "class", "classes", "classroom", "teacher", "teachers", "homework", "student", "students", "subject", "subjects", "test", "exam", "math", "science", "history", "study", "classmate", "classmates", "lesson"],
  family: ["family", "mother", "father", "mom", "dad", "parents", "brother", "brothers", "sister", "sisters", "grandmother", "grandfather", "grandma", "grandpa", "uncle", "aunt", "cousin"],
  animals: ["animal", "animals", "dog", "dogs", "cat", "cats", "pet", "pets", "zoo", "bird", "birds", "fish", "rabbit", "horse"],
  weather: ["weather", "rain", "rainy", "raining", "sunny", "cold", "hot", "warm", "snow", "windy", "cloudy", "umbrella", "season", "summer", "winter", "spring", "autumn", "typhoon"],
  travel: ["travel", "trip", "vacation", "visit", "country", "countries", "beach", "tourist", "abroad", "sightseeing", "famous place"],
  transportation: ["bus", "train", "mrt", "taxi", "car", "bike", "bicycle", "scooter", "drive", "driving", "traffic", "station", "airport", "flight", "subway", "get off"],
  shopping: ["shop", "shopping", "store", "buy", "bought", "price", "sale", "discount", "clerk", "mall", "market", "cheap", "expensive", "size", "try on"],
  sports: ["sport", "sports", "basketball", "baseball", "soccer", "football", "tennis", "swim", "swimming", "jogging", "badminton", "volleyball", "team", "gym"],
  hobbies: ["hobby", "hobbies", "reading", "read books", "book", "books", "draw", "drawing", "painting", "collect", "free time", "after school"],
  music: ["music", "song", "songs", "sing", "singing", "piano", "guitar", "violin", "instrument", "concert", "band"],
  health: ["health", "healthy", "sick", "doctor", "hospital", "medicine", "headache", "fever", "exercise", "sleep", "dentist", "drugstore"],
  entertainment: ["movie", "movies", "film", "tv", "television", "cinema", "video game", "video games", "show", "theater"],
  holidays: ["holiday", "holidays", "festival", "new year", "christmas", "moon festival", "dragon boat"],
  home: ["home", "house", "room", "rooms", "apartment", "kitchen", "bedroom", "neighbor", "neighbors", "living room"],
  daily_routine: ["get up", "wake up", "go to bed", "brush my teeth", "take a shower", "every morning", "every day", "usually"],
  weekend: ["weekend", "weekends", "saturday", "sunday"],
  social: ["friend", "friends", "party", "parties", "invite", "birthday"],
  directions: ["directions", "lost", "turn left", "turn right", "how to get to", "the way to", "map"],
  work: ["job", "work", "office", "boss", "company", "meeting", "coworker"],
  technology: ["phone", "computer", "laptop", "internet", "email", "app", "online"]
};
const TOPIC_ALIAS = { answer: { school: "school_work", work: "school_work" } }; // 對齊現有 ANSWER 題庫的 topic 名稱
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TOPIC_RES = Object.fromEntries(Object.entries(TOPIC_KEYWORDS).map(([k, words]) =>
  [k, words.map(w => ({ w, re: new RegExp("\\b" + escapeRe(w) + "\\b", "g") }))]));
function suggestTopic(text, type){
  const t = cellStr(text).toLowerCase().replace(/[‘’]/g, "'");
  if (!t.trim()) return { value: null, reason: UNSURE };
  const scores = [];
  Object.entries(TOPIC_RES).forEach(([topic, list]) => {
    let n = 0; const words = [];
    list.forEach(({ w, re }) => { const m = t.match(re); if (m){ n += m.length * (w.includes(" ") ? 2 : 1); words.push(w); } });
    if (n) scores.push({ topic, n, words });
  });
  scores.sort((a, b) => b.n - a.n);
  if (!scores.length) return { value: null, reason: UNSURE };
  // 第一名要明顯領先（同分或差距太小就不猜）
  if (scores.length > 1 && scores[0].n - scores[1].n < 1)
    return { value: null, reason: `${UNSURE}（${scores.slice(0, 3).map(s => s.topic).join("／")} 都有可能）` };
  const top = scores[0], alias = (TOPIC_ALIAS[type] || {})[top.topic];
  return { value: alias || top.topic, reason: `關鍵字：${top.words.slice(0, 3).join("、")}` };
}

// REPEAT 難度：以現有題庫已標好的難度做校正（各難度分數的中位數，取相鄰中點當門檻）
const CLAUSE_WORDS = /\b(because|so|but|if|when|that|which|who|before|after|while|although|until|than|unless)\b/g;
function difficultyScore(text){
  const words = normalizeText(text).split(" ").filter(Boolean);
  // 逗號只算半個：「, so」這種逗號加連接詞不要重複計算（用現有 88 題校正過，這樣最準）
  const clauses = (cellStr(text).toLowerCase().match(CLAUSE_WORDS) || []).length + 0.5 * (cellStr(text).match(/,/g) || []).length;
  const longWords = words.filter(w => w.length >= 8).length;
  return words.length + 1.5 * clauses + 0.5 * longWords;
}
function calibrateDifficulty(bank){
  const med = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  const by = { easy: [], medium: [], hard: [] };
  ((bank && bank.repeat) || []).forEach(it => { if (by[it.difficulty]) by[it.difficulty].push(difficultyScore(it.text)); });
  const m = { easy: med(by.easy), medium: med(by.medium), hard: med(by.hard) };
  if (m.easy == null || m.medium == null || m.hard == null) return { t1: 8.5, t2: 13, from: "預設值" };
  return { t1: (m.easy + m.medium) / 2, t2: (m.medium + m.hard) / 2, from: "現有題庫" };
}
const DIFF_MARGIN = 0.75; // 分數太靠近門檻就不猜
function suggestDifficulty(text, cal){
  if (!cellStr(text).trim()) return { value: null, reason: UNSURE };
  const s = difficultyScore(text), wc = normalizeText(text).split(" ").filter(Boolean).length;
  const why = `${wc} 個字，複雜度 ${s.toFixed(1)}（門檻 ${cal.t1.toFixed(1)}／${cal.t2.toFixed(1)}）`;
  if (Math.abs(s - cal.t1) < DIFF_MARGIN) return { value: null, reason: `${UNSURE}：介於 easy 與 medium，${why}` };
  if (Math.abs(s - cal.t2) < DIFF_MARGIN) return { value: null, reason: `${UNSURE}：介於 medium 與 hard，${why}` };
  return { value: s < cal.t1 ? "easy" : s < cal.t2 ? "medium" : "hard", reason: why };
}

/* ---------- 現有題庫 ---------- */
function emptyPending(){ return { questions: [], repeat: [], read: [] }; }
// 把待分類區裡的題目也變成可處理的列（使用者可以在這次幫它們分類，id 不變）
function pendingRows(bank){
  const rows = [], p = (bank && bank.pending) || {};
  TYPES.forEach(type => {
    (p[BANK_KEY[type]] || []).forEach(it => rows.push({
      type, origin: "pending", id: it.id, sheet: "待分類區", rowNum: null,
      text: cellStr(it[TEXT_FIELD[type]]), sourceBook: cellStr(it.sourceBook), sourcePage: cellStr(it.sourcePage), notes: cellStr(it.notes),
      given: { category: cellStr(it.category), topic: cellStr(it.topic), difficulty: cellStr(it.difficulty) },
      stored: it
    }));
  });
  return rows;
}

/* ---------- 逐列分析：必要欄位、既有值是否合法、重複、建議 ---------- */
function analyzeRows(rows, bank, cal){
  const existing = { answer: [], repeat: [], read: [] };
  TYPES.forEach(type => ((bank && bank[BANK_KEY[type]]) || []).forEach(it => existing[type].push({ id: it.id, text: it[TEXT_FIELD[type]] })));
  const seen = { answer: [], repeat: [], read: [] }; // 這批裡已經看過的列（抓同一批互相重複）
  rows.forEach(row => {
    row.errors = []; row.warnings = []; row.dups = [];
    const spec = SHEETS[row.type];
    if (isBlank(row.text)) row.errors.push(`必要欄位空白：${spec.cols[spec.textCol]}`);
    if (isBlank(row.sourceBook)) row.errors.push("必要欄位空白：Source Book");
    if (isBlank(row.sourcePage)) row.errors.push("必要欄位空白：Source Page");
    if (!isBlank(row.text) && row.text !== row.text.trim()) row.warnings.push("文字前後有空白（會原樣保留）");
    // Excel 已填的分類：大小寫不同視為同一個值；不合法的值當作空白並提醒
    row.valid = { category: "", difficulty: "", topic: row.given.topic };
    if (row.type === "answer" && row.given.category){
      const c = row.given.category.toLowerCase();
      if (CATEGORIES.includes(c)) row.valid.category = c; else row.warnings.push(`Category「${row.given.category}」不是 warmup／opinion／situational，當作空白`);
    }
    if (row.type === "repeat" && row.given.difficulty){
      const d = row.given.difficulty.toLowerCase();
      if (DIFFICULTIES.includes(d)) row.valid.difficulty = d; else row.warnings.push(`Difficulty「${row.given.difficulty}」不是 easy／medium／hard，當作空白`);
    }
    // 重複：跟現有題庫、再跟這批前面的列比
    if (!isBlank(row.text)){
      existing[row.type].forEach(e => { const c = compareTexts(row.text, e.text); if (c) row.dups.push({ ...c, against: "existing", id: e.id, text: e.text }); });
      seen[row.type].forEach(o => { const c = compareTexts(row.text, o.text); if (c) row.dups.push({ ...c, against: "batch", label: rowLabel(o), text: o.text }); });
      seen[row.type].push(row);
    }
    // 建議：只在該欄空白時產生
    row.suggest = {};
    if (row.type === "answer" && !row.valid.category) row.suggest.category = suggestCategory(row.text);
    if (row.type === "repeat" && !row.valid.difficulty) row.suggest.difficulty = suggestDifficulty(row.text, cal);
    if (!row.valid.topic) row.suggest.topic = suggestTopic(row.text, row.type);
    if (!row.decision) row.decision = { category: "blank", topic: "blank", difficulty: "blank" }; // 預設：保留空白（建議不自動套用）
    if (!row.manual) row.manual = { category: "", difficulty: "" }; // 使用者在工具裡手動選的（建議判斷不了時用）
    if (row.include == null) row.include = true;
  });
  return rows;
}
function rowLabel(row){ return row.origin === "pending" ? `待分類區 ${row.id}` : `${row.sheet} 第 ${row.rowNum} 列`; }

// 這一列最後的欄位值（Excel 有填 > 使用者手動選的 > 使用者接受的建議 > 空白）
function finalFields(row){
  const manual = row.manual || {};
  const pick = f => row.valid[f] || manual[f] || (row.decision[f] === "accept" && row.suggest[f] && row.suggest[f].value) || "";
  return { category: pick("category"), topic: pick("topic"), difficulty: pick("difficulty"),
    accepted: ["category", "topic", "difficulty"].filter(f => !row.valid[f] && !manual[f] && row.decision[f] === "accept" && row.suggest[f] && row.suggest[f].value) };
}
// 這一列會去哪裡：game（進遊戲題庫）／pending（待分類區）／skip（不匯出）
function rowDestination(row){
  if (row.origin === "pending"){ // 待分類區的題目不會被刪掉：沒分類完就留在待分類區
    const f = finalFields(row);
    return (row.type === "answer" && !f.category) || (row.type === "repeat" && !f.difficulty) ? "pending" : "game";
  }
  if (row.errors.length || !row.include) return "skip";
  const f = finalFields(row);
  if (row.type === "answer" && !f.category) return "pending";
  if (row.type === "repeat" && !f.difficulty) return "pending";
  return "game";
}

/* ---------- 合併輸出 ---------- */
function nextNumber(ids, re){ let max = 0; ids.forEach(id => { const m = re.exec(id || ""); if (m) max = Math.max(max, +m[1]); }); return max + 1; }
const pad3 = n => String(n).padStart(3, "0");
function buildMergedBank(bank, rows){
  const out = JSON.parse(JSON.stringify(bank)); // 既有內容整份複製，下面只在尾端追加
  const oldPending = out.pending || emptyPending();
  out.pending = emptyPending();
  const allIds = [];
  ["questions", "repeat", "read"].forEach(k => { (out[k] || []).forEach(it => allIds.push(it.id)); (oldPending[k] || []).forEach(it => allIds.push(it.id)); });
  const counters = {
    question: nextNumber(allIds, /^question_(\d+)$/), read: nextNumber(allIds, /^read_(\d+)$/),
    easy: nextNumber(allIds, /^repeat_easy_(\d+)$/), medium: nextNumber(allIds, /^repeat_medium_(\d+)$/), hard: nextNumber(allIds, /^repeat_hard_(\d+)$/),
    pending: nextNumber(allIds, /^repeat_pending_(\d+)$/)
  };
  const newId = (type, difficulty) => {
    if (type === "answer") return "question_" + pad3(counters.question++);
    if (type === "read") return "read_" + pad3(counters.read++);
    const key = difficulty || "pending";
    return `repeat_${key}_` + pad3(counters[key]++);
  };
  const added = { questions: [], repeat: [], read: [] }, pendingAdded = { questions: [], repeat: [], read: [] };
  rows.forEach(row => {
    const dest = rowDestination(row);
    if (dest === "skip") return;
    const f = finalFields(row), key = BANK_KEY[row.type];
    const id = row.origin === "pending" ? row.id : newId(row.type, f.difficulty);
    const item = { id };
    item[TEXT_FIELD[row.type]] = row.text; // 原文
    if (row.type === "repeat" && (f.difficulty || dest === "game")) item.difficulty = f.difficulty;
    if (row.type === "answer" && (f.category || dest === "game")) item.category = f.category;
    item.topic = f.topic || (dest === "game" ? UNSPECIFIED_TOPIC : "");
    item.origin = "external"; // 外部題庫（課外書來源），不是官方 GEPT 題目
    item.sourceBook = row.sourceBook;
    item.sourcePage = row.sourcePage;
    if (row.notes) item.notes = row.notes;
    if (row.suggest.category && row.suggest.category.value) item.suggestedCategory = row.suggest.category.value;
    if (row.suggest.topic && row.suggest.topic.value) item.suggestedTopic = row.suggest.topic.value;
    if (row.suggest.difficulty && row.suggest.difficulty.value) item.suggestedDifficulty = row.suggest.difficulty.value;
    if (f.accepted.length) item.acceptedSuggestions = f.accepted;
    row.assignedId = id;
    if (dest === "game"){ out[key].push(item); added[key].push(id); }
    else { out.pending[key].push(item); pendingAdded[key].push(id); }
  });
  if (!out.pending.questions.length && !out.pending.repeat.length && !out.pending.read.length) delete out.pending;
  return { bank: out, added, pendingAdded };
}

/* ---------- 匯出前檢查：跟遊戲 gameState.js 的 validateQuestionBank 同一套規則，另外確認既有題目完全沒變 ---------- */
function validateForGame(bank, minCounts){
  const errs = [], ids = new Set();
  const nonEmpty = v => typeof v === "string" && v.trim() !== "";
  const checkList = (key, fields, check) => {
    const list = bank[key];
    if (!Array.isArray(list)){ errs.push(`缺少 ${key} 陣列`); return; }
    if (minCounts && list.length < minCounts[key]) errs.push(`${key} 題數變少了：原本 ${minCounts[key]} 題，現在 ${list.length} 題`);
    list.forEach((item, k) => {
      const where = `${key}[${k}]${item && item.id ? `（${item.id}）` : ""}`;
      fields.forEach(f => { if (!nonEmpty(item[f])) errs.push(`${where} 缺少欄位或內容為空：${f}`); });
      if (nonEmpty(item.id)){ if (ids.has(item.id)) errs.push(`${where} id 重複`); ids.add(item.id); }
      if (check) check(item, where);
    });
  };
  checkList("repeat", ["id", "text", "difficulty", "topic"], (it, w) => { if (!DIFFICULTIES.includes(it.difficulty)) errs.push(`${w} difficulty 不合法`); });
  checkList("read", ["id", "text", "topic"]);
  checkList("questions", ["id", "question", "category", "topic"], (it, w) => { if (!CATEGORIES.includes(it.category)) errs.push(`${w} category 不合法`); });
  const p = bank.pending || {};
  ["questions", "repeat", "read"].forEach(k => (p[k] || []).forEach(it => { if (ids.has(it.id)) errs.push(`待分類區 ${it.id} 跟其他題目 id 重複`); ids.add(it.id); }));
  return errs;
}
function existingUnchanged(before, after){
  const errs = [];
  ["repeat", "read", "questions"].forEach(k => {
    (before[k] || []).forEach((it, i) => { if (JSON.stringify(it) !== JSON.stringify(after[k][i])) errs.push(`既有題目被改動：${k}[${i}]（${it.id}）`); });
  });
  return errs;
}

global.QBCore = {
  CATEGORIES, DIFFICULTIES, SHEETS, TYPES, BANK_KEY, TEXT_FIELD, UNSPECIFIED_TOPIC, DUP_LABEL, UNSURE,
  parseWorkbook, parseSheetRows, normalizeText, compareTexts, diceSimilarity,
  suggestCategory, suggestTopic, suggestDifficulty, calibrateDifficulty, difficultyScore,
  pendingRows, analyzeRows, finalFields, rowDestination, rowLabel, buildMergedBank, validateForGame, existingUnchanged
};
})(window);
