"use strict";
/* ===== 文字正規化（把辨識結果與標準答案放在同一基準上比對） ===== */
const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
const ORD_IRR = { one:"first", two:"second", three:"third", five:"fifth", eight:"eighth", nine:"ninth", twelve:"twelfth" };
const n2w = n => n < 20 ? ONES[n] : TENS[Math.floor(n/10)] + (n%10 ? " " + ONES[n%10] : "");
function ord(n){
  const w = n2w(n).split(" "), last = w.pop();
  const o = ORD_IRR[last] || (last.endsWith("y") ? last.slice(0,-1) + "ieth" : last + "th");
  return [...w, o].join(" ");
}
const CONTR = {"i'm":"i am","that's":"that is","what's":"what is","there's":"there is","here's":"here is","we're":"we are","you're":"you are","they're":"they are","don't":"do not","doesn't":"does not","didn't":"did not","can't":"can not","cannot":"can not","isn't":"is not","aren't":"are not","wasn't":"was not","weren't":"were not","won't":"will not","i'll":"i will","i've":"i have","let's":"let us",
  // V6-D4.4 縮寫 ↔ 完整形式：語音辨識有時寫縮寫、有時寫成完整兩個字，兩邊都展開成完整形式再比對
  "couldn't":"could not","shouldn't":"should not","wouldn't":"would not","mustn't":"must not",
  "haven't":"have not","hasn't":"has not","hadn't":"had not",
  "should've":"should have","could've":"could have","would've":"would have","must've":"must have","might've":"might have",
  "you've":"you have","we've":"we have","they've":"they have",
  "you'll":"you will","he'll":"he will","she'll":"she will","it'll":"it will","we'll":"we will","they'll":"they will","that'll":"that will",
  // 有歧義的縮寫展開成「可選字」（would|had）：對齊時跟其中任何一個相同就算對（見 tokEq）
  "i'd":"i would|had","you'd":"you would|had","he'd":"he would|had","she'd":"she would|had","it'd":"it would|had",
  "we'd":"we would|had","they'd":"they would|had",
  "it's":"it is|has","he's":"he is|has","she's":"she is|has"};
// 可選字的比對：兩個字相同，或其中一邊是「a|b」而另一邊（或它的任一選項）有交集
function tokEq(a, b){
  if (a === b) return true;
  if (!a.includes("|") && !b.includes("|")) return false;
  const bs = b.split("|");
  return a.split("|").some(x => bs.includes(x));
}
// 顯示或存「常錯的字」時用第一個選項（it's → it is，跟改版前一樣）
function plainTok(t){ return t.split("|")[0]; }
// V6-D4.1 電話號碼：只認明確的格式，轉成逐位的英文數字（8774-5656 → eight seven seven four five six five six）。
// 標準答案與辨識結果都經過這裡，所以 8774-5656／87745656／8774 5656／逐位英文念法都會變成同一串。
// 一般數字（2、15、50、100、年份 2026、時間 7:30）不套用，維持原本的處理
const DIGIT_WORDS = ONES.slice(0, 10);
const spellDigits = str => " " + str.replace(/\D/g, "").split("").map(d => DIGIT_WORDS[+d]).join(" ") + " ";
function normalizePhoneNumbers(s){
  // 1) 分組的號碼：02-8774-5656、(02) 8774 5656、8774-5656、8774 5656。有 - . ( ) 要 6 位以上；只用空白分組要 7 位以上；
  //    每組都是西元年（2019-2020、2019 2020）不算
  //    （每組 2～6 位不限定怎麼分：語音辨識有時會分成 877-45656 這種奇怪的組，也要認得）
  s = s.replace(/(?<![\d$,.])\(?\d{2,6}\)?(?:[-.\s]\d{2,6}){1,3}(?![\d,])/g, m => {
    const digits = m.replace(/\D/g, "");
    const hasSep = /[-.()]/.test(m);
    const years = m.match(/\d+/g).every(g => /^(19|20)\d\d$/.test(g));
    return !years && ((hasSep && digits.length >= 6) || (!hasSep && digits.length >= 7)) ? spellDigits(m) : m;
  });
  // 2) 連在一起的 7～12 位數字（金額會有 $ 或千分位逗號，不會被當成電話）
  s = s.replace(/(?<![\d$,.])\d{7,12}(?![\d,])/g, spellDigits);
  return s;
}
function tokenize(s){
  s = s.toLowerCase().replace(/[’‘]/g, "'");
  s = normalizePhoneNumbers(s);
  s = s.replace(/(\d{1,2}):(\d{2})/g, (m,h,mi) => n2w(+h) + " " + (+mi === 0 ? "" : (+mi < 10 ? "oh " : "") + n2w(+mi)));
  s = s.replace(/(\d{1,2})(st|nd|rd|th)\b/g, (m,n) => ord(+n));
  s = s.replace(/\d{1,2}/g, m => n2w(+m));
  s = s.replace(/\b(?:[a-z]\.){2,}/g, m => m.replace(/\./g, "") + " "); // V6-D4.3：有點的縮寫 D.C.／U.S.A. 先接起來（dc、usa）
  s = s.replace(/[^a-z'\s]/g, " ");
  const out = [];
  s.split(/\s+/).filter(Boolean).forEach(w => {
    w = w.replace(/^'+|'+$/g, "");
    if (!w) return;
    (CONTR[w] ? CONTR[w].split(" ") : [w]).forEach(x => out.push(x));
  });
  // 念號碼時常把 0 說成「oh」：緊鄰逐位數字的 oh／o 視為 zero（號碼開頭、結尾的 0 也算；標準答案與辨識結果同樣處理）
  const isDigitWord = w => DIGIT_WORDS.includes(w);
  for (let pass = 0; pass < 2; pass++){ // 跑兩次，連續的「oh oh」也能接上
    for (let k = 0; k < out.length; k++){
      if ((out[k] === "oh" || out[k] === "o") && (isDigitWord(out[k - 1]) || isDigitWord(out[k + 1]))) out[k] = "zero";
    }
  }
  return normalizeDateTokens(mergeLetterAbbreviations(out));
}

// V6-D4.3 縮寫：語音辨識常把 DC 寫成 D.C. 或 D C（變成兩個單一字母），連續 2 個以上的單一字母合成一個字（D.C.／D C／DC → dc，
// U.S.A. → usa）。a 和 I 本身是英文單字，不參與合併
const isLetterToken = w => w.length === 1 && w >= "a" && w <= "z" && w !== "a" && w !== "i";
function mergeLetterAbbreviations(tokens){
  const out = [];
  for (let k = 0; k < tokens.length; k++){
    if (isLetterToken(tokens[k]) && isLetterToken(tokens[k + 1])){
      let w = "";
      while (k < tokens.length && isLetterToken(tokens[k])) w += tokens[k++];
      out.push(w); k--;
    } else out.push(tokens[k]);
  }
  return out;
}

/* ===== V6-D4.2 日期：只有「月份＋日期」（或「日期＋of＋月份」）的前後文，日期的基數與序數才視為相同 =====
   October 31／October 31st／October thirty-one／October thirty-first 都變成「october thirty first」；
   the 31st of October／31 October 也一樣。其他地方的數字（I have thirty-one books）完全不動。
   在「已切好的字詞序列」上處理：基數和序數的字數永遠相同（thirty one ↔ thirty first、twenty ↔ twentieth），
   所以標準答案逐字正規化後串起來再套用，也不會打亂「哪個字對應畫面上哪個字」 */
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december",
  "jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec"];
const DAY_WORD = {}; // 日期用字 → 數值（基數與序數都收）
for (let n = 1; n <= 19; n++){ DAY_WORD[ONES[n]] = n; DAY_WORD[ord(n)] = n; }
DAY_WORD.twenty = 20; DAY_WORD.twentieth = 20; DAY_WORD.thirty = 30; DAY_WORD.thirtieth = 30;
// 從 i 開始讀一個 1～31 的日期：回傳 { n, len }（len＝用掉幾個字），讀不到就 null
function readDay(tokens, i){
  const a = tokens[i], b = tokens[i + 1];
  if ((a === "twenty" || a === "thirty") && b && DAY_WORD[b] >= 1 && DAY_WORD[b] <= 9 && b !== "ten"){
    const n = (a === "twenty" ? 20 : 30) + DAY_WORD[b];
    if (n <= 31) return { n, len: 2 };
  }
  if (a in DAY_WORD) return { n: DAY_WORD[a], len: 1 };
  return null;
}
// may／march 在「I may…」「we march…」這種用法時不是月份
const NOT_MONTH_BEFORE = new Set(["i","you","we","they","he","she","it","who","that","which","can","will","to"]);
const isMonthAt = (tokens, i) => MONTHS.includes(tokens[i]) && !((tokens[i] === "may" || tokens[i] === "march") && NOT_MONTH_BEFORE.has(tokens[i - 1]));
function normalizeDateTokens(tokens){
  const out = tokens.slice();
  const toOrdinal = (i, d) => { ord(d.n).split(" ").forEach((w, k) => { out[i + k] = w; }); };
  for (let i = 0; i < out.length; i++){
    if (isMonthAt(out, i)){
      // October 31 / October the 31st
      const j = out[i + 1] === "the" ? i + 2 : i + 1;
      const d = readDay(out, j);
      if (d) toOrdinal(j, d);
    } else {
      // the 31st of October / 31 October
      const d = readDay(out, i);
      if (!d) continue;
      const k = i + d.len, m = out[k] === "of" ? k + 1 : k;
      if (isMonthAt(out, m)) toOrdinal(i, d);
    }
  }
  return out;
}

/* ===== 逐字對齊（編輯距離） ===== */
function align(t, h){
  const n = t.length, m = h.length;
  const d = Array.from({length:n+1}, () => new Array(m+1).fill(0));
  for (let i=0;i<=n;i++) d[i][0] = i;
  for (let j=0;j<=m;j++) d[0][j] = j;
  for (let i=1;i<=n;i++) for (let j=1;j<=m;j++){
    const c = tokEq(t[i-1], h[j-1]) ? 0 : 1;
    d[i][j] = Math.min(d[i-1][j-1] + c, d[i-1][j] + 1, d[i][j-1] + 1);
  }
  const ops = new Array(n).fill("del"), extra = [];
  let i = n, j = m;
  while (i > 0 || j > 0){
    const same = i>0 && j>0 && tokEq(t[i-1], h[j-1]);
    if (i>0 && j>0 && d[i][j] === d[i-1][j-1] + (same ? 0 : 1)){ ops[i-1] = same ? "ok" : "sub"; i--; j--; }
    else if (i>0 && d[i][j] === d[i-1][j] + 1){ ops[i-1] = "del"; i--; }
    else { extra.unshift(h[j-1]); j--; }
  }
  return { ops, extra, dist: d[n][m] };
}

/* ===== 語音：播放題目 ===== */
function loadVoices(){
  return new Promise(res => {
    const v = speechSynthesis.getVoices();
    if (v.length) return res(v);
    speechSynthesis.addEventListener("voiceschanged", () => res(speechSynthesis.getVoices()), { once:true });
    setTimeout(() => res(speechSynthesis.getVoices()), 1500);
  });
}
function speak(text, rate = 0.9){
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = rate;
    if (voice) u.voice = voice;
    let done = false;
    const fin = () => { if (!done){ done = true; clearTimeout(t); resolve(); } };
    const t = setTimeout(fin, 3000 + text.length * 130);   // Android 有時不會觸發 onend，用計時器保底
    u.onend = fin; u.onerror = fin;
    speechSynthesis.speak(u);
  });
}

/* ===== 語音：錄下玩家的回答（有靜音自動偵測），交給後端 Whisper 辨識 =====
   選填參數（V6-D3 問答 15 秒計時用；不傳時行為跟原本完全一樣）：
   silenceStop:false 不因停頓自動結束；requireVoice:true 整段都沒偵測到聲音就當 no-speech（不送去辨識）；
   sayHint 錄音中的提示；onStart()／onTick(經過毫秒)／onEnd(經過毫秒) 給倒數 UI 用。
   結束時間以 performance.now() 的實際經過時間判斷（每幀檢查），setTimeout 只是分頁在背景時的保底 */
function recordAudio({ maxMs = 12000, silenceMs = 1500, minMs = 600, silenceStop = true, requireVoice = false, sayHint, onStart, onTick, onEnd } = {}){
  return new Promise(async resolve => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch(_) { resolve({ blob: null, error: "not-allowed" }); return; }

    let mime = "audio/webm;codecs=opus";
    if (!(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime))) mime = "";
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch(_) { stream.getTracks().forEach(t => t.stop()); resolve({ blob: null, error: "audio-capture" }); return; }

    const chunks = [];
    const startedAt = Date.now();
    let audioCtx, analyser, source, raf, lastLoud = Date.now(), settled = false;
    let maxTimer = null, t0 = 0, heard = false;
    const elapsedNow = () => t0 ? performance.now() - t0 : 0;

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(maxTimer);
      try { source && source.disconnect(); } catch(_){}
      try { audioCtx && audioCtx.close(); } catch(_){}
      stream.getTracks().forEach(t => t.stop()); // 麥克風關掉：時間到之後不能再錄
      activeRec = null;
      if (onEnd) onEnd(elapsedNow());
    };

    rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    rec.onerror = () => {
      if (settled) return;
      settled = true; cleanup();
      resolve({ blob: null, error: "audio-capture" });
    };
    rec.onstop = () => {
      if (settled) return;
      settled = true; cleanup();
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      const noVoice = requireVoice && analyser && !heard; // 從頭到尾都沒聲音：不送空白錄音去辨識
      resolve(blob.size > 800 && !noVoice ? { blob, error: null } : { blob: null, error: "no-speech" });
    };

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
    } catch(_) { analyser = null; }

    activeRec = rec;
    rec.start();
    t0 = performance.now();
    setState("say", "換你說", sayHint || "說完停一下會自動送出，也可以點圓圈提早結束");
    if (onStart) onStart();

    const stopRec = () => { if (rec.state !== "inactive") rec.stop(); };
    maxTimer = setTimeout(stopRec, maxMs);

    if (analyser || onTick){
      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      const tick = () => {
        if (settled) return;
        const el = elapsedNow();
        if (onTick) onTick(el);
        if (el >= maxMs){ stopRec(); return; } // 以實際經過時間為準，不會因為卡頓多錄
        if (analyser){
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let k = 0; k < data.length; k++){ const v = (data[k] - 128) / 128; sum += v * v; }
          const rms = Math.sqrt(sum / data.length);
          if (rms > 0.02){ lastLoud = Date.now(); heard = true; }
          const elapsed = Date.now() - startedAt;
          if (silenceStop && elapsed > minMs && Date.now() - lastLoud > silenceMs){
            stopRec();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  });
}

/* ===== 限時作答（倒數＋提早結束按鈕），問答與朗讀共用 =====
   V6-D3 問答：每題 15 秒（GEPT 初級口說「回答問題」）——問答挑戰、Boss 問答回合、英檢口說練習的問答都呼叫 listenAnswer()
   V6-D4 朗讀：最長 60 秒——闖關朗讀關、Boss 朗讀回合、英檢口說練習的朗讀都呼叫 listenRead()
   複誦不用（仍是停頓自動送出）。倒數從「開始錄音」那一刻起算；時間到自動停止錄音；可按按鈕提早結束。 */
const ANSWER_SECONDS = 15;
const READ_SECONDS = 60;
function mountAnswerTimer(seconds = ANSWER_SECONDS, doneLabel = "我回答完了"){
  const old = $("#answerTimer"); if (old) old.remove();
  const ring = $("#ring");
  const el = document.createElement("div");
  el.id = "answerTimer";
  el.className = "answer-timer" + (app.querySelector(".practice-stage") ? " large" : "");
  el.setAttribute("role", "timer");
  el.hidden = true;
  el.innerHTML = `<div class="at-num">${seconds}</div><div class="at-label">秒剩餘</div>
    <div class="at-bar"><i></i></div><button type="button" class="btn line at-done">${doneLabel}</button>`;
  if (ring) ring.insertAdjacentElement("afterend", el);
  const num = el.querySelector(".at-num"), label = el.querySelector(".at-label"), bar = el.querySelector(".at-bar i"), done = el.querySelector(".at-done");
  done.onclick = () => { if (activeRec && activeRec.state !== "inactive") activeRec.stop(); }; // 提早結束：跟點圓圈一樣
  let shown = null;
  const paint = ms => {
    const left = Math.max(0, seconds - ms / 1000), n = Math.ceil(left);
    bar.style.width = (left / seconds * 100) + "%";
    if (n !== shown){
      shown = n;
      num.textContent = n;
      el.dataset.stage = n > 5 ? "" : n > 2 ? "warn" : "final"; // 最後 5～3 秒提醒、2～0 秒最後階段
      el.setAttribute("aria-label", `剩餘 ${n} 秒`);
    }
  };
  return {
    start(){ el.hidden = false; paint(0); },
    tick: paint,
    end(ms){
      const timeUp = ms >= seconds * 1000 - 30;
      if (timeUp){ paint(seconds * 1000); label.textContent = "時間到"; }
      else label.textContent = "作答結束";
      el.dataset.ended = timeUp ? "timeup" : "done";
      done.remove();
    }
  };
}
function listenTimed(seconds, doneLabel, sayHint, withTimings){
  const ui = mountAnswerTimer(seconds, doneLabel);
  return listen(seconds * 1000, withTimings, {
    silenceStop: false, requireVoice: true, sayHint,
    onStart: ui.start, onTick: ui.tick, onEnd: ui.end
  });
}
async function listenAnswer(){
  return listenTimed(ANSWER_SECONDS, "我回答完了", `請在 ${ANSWER_SECONDS} 秒內回答，說完可以按「我回答完了」`, true);
}
async function listenRead(){
  return listenTimed(READ_SECONDS, "我朗讀完了", `請在 ${READ_SECONDS} 秒內唸完，唸完可以按「我朗讀完了」`, false);
}
async function transcribeAudio(blob, withTimings){
  try {
    const form = new FormData();
    form.append("audio", blob, "answer.webm");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const url = WORKER_URL + "/transcribe" + (withTimings ? "?timing=1" : "");
    const res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { text: "", error: "network" };
    const data = await res.json();
    return { text: String(data.text || "").trim(), fluency: data.fluency || null, error: null };
  } catch(_) { return { text: "", error: "network" }; }
}
async function listen(maxMs = 12000, withTimings = false, recordOpts = {}){
  const { blob, error } = await recordAudio({ maxMs, ...recordOpts });
  if (error) return { text: "", error };
  setState("busy", "辨識中…", "AI 正在聽你說的話");
  const { text, fluency, error: terr } = await transcribeAudio(blob, withTimings);
  if (terr) return { text: "", error: terr };
  if (!text) return { text: "", error: "no-speech" };
  return { text, fluency, error: null };
}
