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
const CONTR = {"i'm":"i am","it's":"it is","he's":"he is","she's":"she is","that's":"that is","what's":"what is","there's":"there is","here's":"here is","we're":"we are","you're":"you are","they're":"they are","don't":"do not","doesn't":"does not","didn't":"did not","can't":"can not","cannot":"can not","isn't":"is not","aren't":"are not","wasn't":"was not","weren't":"were not","won't":"will not","i'll":"i will","i've":"i have","let's":"let us"};
function tokenize(s){
  s = s.toLowerCase().replace(/[’‘]/g, "'");
  s = s.replace(/(\d{1,2}):(\d{2})/g, (m,h,mi) => n2w(+h) + " " + (+mi === 0 ? "" : (+mi < 10 ? "oh " : "") + n2w(+mi)));
  s = s.replace(/(\d{1,2})(st|nd|rd|th)\b/g, (m,n) => ord(+n));
  s = s.replace(/\d{1,2}/g, m => n2w(+m));
  s = s.replace(/[^a-z'\s]/g, " ");
  const out = [];
  s.split(/\s+/).filter(Boolean).forEach(w => {
    w = w.replace(/^'+|'+$/g, "");
    if (!w) return;
    (CONTR[w] ? CONTR[w].split(" ") : [w]).forEach(x => out.push(x));
  });
  return out;
}

/* ===== 逐字對齊（編輯距離） ===== */
function align(t, h){
  const n = t.length, m = h.length;
  const d = Array.from({length:n+1}, () => new Array(m+1).fill(0));
  for (let i=0;i<=n;i++) d[i][0] = i;
  for (let j=0;j<=m;j++) d[0][j] = j;
  for (let i=1;i<=n;i++) for (let j=1;j<=m;j++){
    const c = t[i-1] === h[j-1] ? 0 : 1;
    d[i][j] = Math.min(d[i-1][j-1] + c, d[i-1][j] + 1, d[i][j-1] + 1);
  }
  const ops = new Array(n).fill("del"), extra = [];
  let i = n, j = m;
  while (i > 0 || j > 0){
    const same = i>0 && j>0 && t[i-1] === h[j-1];
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

/* ===== V6-D3 問答 15 秒作答時間（GEPT 初級口說「回答問題」每題 15 秒） =====
   問答挑戰、Boss 問答回合、英檢口說練習的問答都呼叫 listenAnswer()，複誦／朗讀不用。
   倒數從「題目播完、開始錄音」那一刻起算；時間到自動停止錄音；可按「我回答完了」提早結束。 */
const ANSWER_SECONDS = 15;
function mountAnswerTimer(){
  const old = $("#answerTimer"); if (old) old.remove();
  const ring = $("#ring");
  const el = document.createElement("div");
  el.id = "answerTimer";
  el.className = "answer-timer" + (app.querySelector(".practice-stage") ? " large" : "");
  el.setAttribute("role", "timer");
  el.hidden = true;
  el.innerHTML = `<div class="at-num">${ANSWER_SECONDS}</div><div class="at-label">秒剩餘</div>
    <div class="at-bar"><i></i></div><button type="button" class="btn line at-done">我回答完了</button>`;
  if (ring) ring.insertAdjacentElement("afterend", el);
  const num = el.querySelector(".at-num"), label = el.querySelector(".at-label"), bar = el.querySelector(".at-bar i"), done = el.querySelector(".at-done");
  done.onclick = () => { if (activeRec && activeRec.state !== "inactive") activeRec.stop(); }; // 提早結束：跟點圓圈一樣
  let shown = null;
  const paint = ms => {
    const left = Math.max(0, ANSWER_SECONDS - ms / 1000), n = Math.ceil(left);
    bar.style.width = (left / ANSWER_SECONDS * 100) + "%";
    if (n !== shown){
      shown = n;
      num.textContent = n;
      el.dataset.stage = n > 5 ? "" : n > 2 ? "warn" : "final"; // 15～6 一般、5～3 提醒、2～0 最後
      el.setAttribute("aria-label", `剩餘 ${n} 秒`);
    }
  };
  return {
    start(){ el.hidden = false; paint(0); },
    tick: paint,
    end(ms){
      const timeUp = ms >= ANSWER_SECONDS * 1000 - 30;
      if (timeUp){ paint(ANSWER_SECONDS * 1000); label.textContent = "時間到"; }
      else label.textContent = "作答結束";
      el.dataset.ended = timeUp ? "timeup" : "done";
      done.remove();
    }
  };
}
async function listenAnswer(){
  const ui = mountAnswerTimer();
  return listen(ANSWER_SECONDS * 1000, true, {
    silenceStop: false, requireVoice: true,
    sayHint: `請在 ${ANSWER_SECONDS} 秒內回答，說完可以按「我回答完了」`,
    onStart: ui.start, onTick: ui.tick, onEnd: ui.end
  });
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
