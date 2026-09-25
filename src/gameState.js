"use strict";
/* ===== 題庫：原創的初級程度句子，不分主題，依難度分三池 ===== */
const EASY = [
  "I have math class at nine.",
  "My backpack is very heavy today.",
  "The teacher is writing on the board.",
  "I forgot my pencil case at home.",
  "We have a test this Friday.",
  "Can I borrow your eraser?",
  "The library closes at five o'clock.",
  "My classroom is on the second floor.",
  "I need to finish my homework tonight.",
  "The school bus comes at seven thirty.",
  "Our art teacher is very kind.",
  "I sit next to the window.",
  "Can I see the menu, please?",
  "I would like a cup of coffee.",
  "This soup is too hot for me.",
  "We need two more chairs, please.",
  "Is this seat taken?",
  "The chicken here is very popular.",
  "Could I have some water, please?",
  "My father always orders the same dish.",
  "This restaurant is famous for noodles.",
  "Please bring us the bill.",
  "I don't eat spicy food.",
  "The waiter is very friendly.",
  "How much is this jacket?",
  "Do you have this in a smaller size?",
  "I'm just looking, thank you.",
  "This store is having a big sale.",
  "Can I try on these shoes?",
  "Where is the fitting room?",
  "I like the blue one better.",
  "Do you take credit cards?",
  "This bag is too expensive for me.",
  "Can you gift wrap this, please?",
  "I bought a new watch yesterday.",
  "This shirt doesn't fit me well.",
  "Where is the nearest MRT station?",
  "What time does the next bus leave?",
  "How long does it take to get there?",
  "I missed my train this morning.",
  "Please take me to the airport.",
  "The traffic is really bad today.",
  "I usually ride my bike to work.",
  "Is there a taxi stand near here?",
  "The train was ten minutes late.",
  "You can transfer to the blue line here.",
  "My car broke down on the highway.",
  "Remember to buckle your seat belt."
];
const MEDIUM = [
  "I usually watch a movie with my family on weekends.",
  "She practices the piano for thirty minutes every evening.",
  "We are planning a short trip to the mountains next month.",
  "My brother works at a hospital near our house.",
  "It might rain later, so bring an umbrella with you.",
  "I have been learning English for almost two years.",
  "Our neighbor's dog barks loudly every morning.",
  "He always checks his email before breakfast.",
  "The weather has been really cold this week.",
  "I need to charge my phone before we leave.",
  "My grandmother tells interesting stories about her childhood.",
  "We should leave early to avoid the traffic jam.",
  "I'm trying to drink more water every day.",
  "The movie starts at eight, so let's meet at seven thirty.",
  "She is saving money to buy a new laptop.",
  "My favorite season is autumn because the weather is mild.",
  "I usually go jogging in the park before work.",
  "Could you turn down the volume a little, please?",
  "We finished the project two days before the deadline.",
  "I forgot to bring my umbrella again this morning."
];
const HARD = [
  "I usually study in the library after school because it is quiet there.",
  "My favorite subject is science, but math is more difficult for me.",
  "We have to hand in our history report before next Monday.",
  "The new gym is bigger than the old one, so more students can use it.",
  "I forgot my umbrella, so I got wet walking home from school.",
  "I want to order a beef burger with french fries and a small salad.",
  "Could you tell me if this restaurant has any vegetarian dishes on the menu?",
  "We waited for almost thirty minutes before our food finally arrived.",
  "My sister doesn't like seafood, so she always orders chicken or beef.",
  "The restaurant was so crowded that we had to wait outside for a table.",
  "I'm looking for a birthday present for my mother, but I don't know what to buy.",
  "This store offers a twenty percent discount if you buy two or more items.",
  "Could you tell me where I can find the shoes for children?",
  "I want to return this sweater because the color is different from the picture online.",
  "The shopping mall was so big that we got lost on the second floor.",
  "Excuse me, could you tell me which bus goes to the train station from here?",
  "I usually leave home early because the traffic gets very heavy after eight o'clock.",
  "We need to change trains at the next stop to reach the airport.",
  "The flight was delayed for two hours because of the bad weather.",
  "It normally takes about forty minutes to drive from my house to downtown."
];

/* ===== 朗讀關：初級程度短文，1 分鐘準備後朗讀，逐字比對（跟複誦關同一套比對邏輯） ===== */
const READ_PASSAGES = [
  "My name is Anna. I am a student. I live near the school with my family.",
  "Today is Monday. The weather is sunny and warm. I will walk to school with my brother.",
  "I have a small dog. Its name is Lucky. Every morning, I take Lucky for a walk in the park.",
  "My favorite food is noodles. I like to eat noodles with my friends after school. They are cheap and delicious.",
  "Last weekend, I went to the museum with my family. We saw many old paintings. It was a fun day.",
  "I usually get up at seven o'clock. I eat breakfast, brush my teeth, and then go to school by bus.",
  "My sister likes to read books. She reads every night before she goes to bed. She wants to be a writer.",
  "This weekend, I want to visit my grandmother. She lives in the countryside. I will bring her some fruit."
];

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
  { type:"read",   name:"智慧貓頭鷹", emoji:"📖", hp:1 },
  { type:"answer", name:"大考老師",   emoji:"👩‍🏫" },
  { type:"repeat", name:"迷霧幽靈",   emoji:"👻", hp:3, pool:() => MEDIUM.concat(HARD) },
  { type:"repeat", name:"終極魔王",   emoji:"🐲", hp:9, boss:true, final:true, pool:() => HARD }
];

/* ===== 問答挑戰：暖身題／看法題／情境題，交給後端 LLM 評分 ===== */
const WORKER_URL = "https://gept-speaking-proxy.gept-speaking.workers.dev";
const TYPE_LABEL = { warmup: "暖身題", opinion: "看法題", situational: "情境題" };
const QUESTIONS = [
  { type: "warmup", q: "What's your name?" },
  { type: "warmup", q: "How are you today?" },
  { type: "warmup", q: "What day is it today?" },
  { type: "warmup", q: "What's the weather like today?" },
  { type: "warmup", q: "What time is it now?" },
  { type: "warmup", q: "Where do you live?" },
  { type: "warmup", q: "How old are you?" },
  { type: "warmup", q: "What's your favorite color?" },
  { type: "warmup", q: "Do you have any brothers or sisters?" },
  { type: "warmup", q: "What did you have for breakfast today?" },
  { type: "warmup", q: "How do you usually get to school?" },
  { type: "warmup", q: "What's the date today?" },
  { type: "opinion", q: "What do you usually do on weekends?" },
  { type: "opinion", q: "What's your favorite food? Why do you like it?" },
  { type: "opinion", q: "Do you like your school or your job? Why?" },
  { type: "opinion", q: "What kind of music do you like?" },
  { type: "opinion", q: "Do you prefer reading books or watching movies? Why?" },
  { type: "opinion", q: "What's your favorite season? Why?" },
  { type: "opinion", q: "Do you like to travel? Why or why not?" },
  { type: "opinion", q: "What's your favorite sport? Why?" },
  { type: "opinion", q: "Do you prefer coffee or tea? Why?" },
  { type: "opinion", q: "Do you like animals? Why or why not?" },
  { type: "opinion", q: "What's your favorite subject? Why?" },
  { type: "opinion", q: "What's your favorite holiday? Why?" },
  { type: "situational", q: "Imagine you are at a restaurant. What would you say to order food?" },
  { type: "situational", q: "Imagine your friend is sick. What would you say to him or her?" },
  { type: "situational", q: "Imagine you are lost in a city. What would you ask someone?" },
  { type: "situational", q: "Imagine you want to buy a ticket for a movie. What would you say?" },
  { type: "situational", q: "Imagine you are checking into a hotel. What would you say?" },
  { type: "situational", q: "Imagine your friend invites you to a party, but you are busy. What would you say?" },
  { type: "situational", q: "Imagine you want to return a shirt to a store. What would you say?" },
  { type: "situational", q: "Imagine it's your friend's birthday. What would you say to him or her?" },
  { type: "situational", q: "Imagine you want to make a doctor's appointment. What would you say?" },
  { type: "situational", q: "Imagine you are late for a meeting. What would you say to your boss?" },
  { type: "situational", q: "Imagine you want to ask someone for directions to the MRT station. What would you say?" },
  { type: "situational", q: "Imagine your food order at a restaurant is wrong. What would you say to the waiter?" }
];

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
function isPathNodeUnlocked(ni, progress){ return ni === 0 || progress[ni - 1] > 0; }
function isMonsterUnlocked(mi, progress){ return mi === 0 || progress[mi - 1] > 0; }
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
