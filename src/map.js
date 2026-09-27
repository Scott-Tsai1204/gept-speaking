"use strict";
/* ===== 怪獸長廊（怪獸圖鑑） ===== */
// 長廊 12 隻的立繪，依 MONSTERS 的順序對應（只換顯示用的圖，不動 MONSTERS 資料）。
// 名稱以程式裡的正式名稱為準；沒有符合名稱的素材就留 null，會顯示原本 emoji。
// 超過約 200 KB 的素材轉成 WebP（保留透明、尺寸不變），小圖維持 PNG，所以這裡寫完整副檔名。
const CORRIDOR_ART = [
  "monster_01_green_slime.png",           // 01 哈欠史萊姆
  "monster_02_meadow_rabbit.png",         // 02 迷路小兔
  "monster_03_bandit_cat.png",            // 03 貪睡貓怪
  "monster_04_storm_guardian.webp",       // 04 風暴衛兵
  "monster_05_clock_monster.webp",        // 05 時鐘怪
  "monster_06_mist_ghost.png",            // 06 迷霧幽靈（跟闖關地圖同一張）
  "monster_07_wind_sprite.webp",          // 07 急驚風
  "monster_08_stone_giant.webp",          // 08 石巨人
  "monster_09_deep_sea_dragon.webp",      // 09 深海海龍
  "monster_10_shadow_assassin.webp",      // 10 影子刺客
  "monster_11_thunder_eagle.webp",        // 11 雷霆鷹
  "monster_12_ultimate_demon_king.webp"   // 12 終極魔王（長廊的怪獸項目，跟 Zone 8 Boss 戰無關）
].map(f => f && `assets/monsters/common/${f}`);
// 「已發現」沿用既有的長廊解鎖規則（isMonsterUnlocked + gept_progress_v2），不另外存一份
function monsterCardHtml(mi, mon, progress, isCurrent, delay){
  const unlocked = isMonsterUnlocked(mi, progress);
  const stars = progress[mi];
  const cls = ["mon-card", mon.boss ? "boss" : "", mon.final ? "final" : "", unlocked ? "" : "locked", isCurrent ? "current" : ""].filter(Boolean).join(" ");
  // 未發現：只給深色剪影（沒有立繪的只給鎖頭），不顯示完整圖片與名字
  const src = CORRIDOR_ART[mi];
  const art = unlocked
    ? (src ? `<img class="mon-card-art" src="${src}" alt="">` : `<span class="mon-card-emoji">${mon.emoji}</span>`)
    : `${src ? `<img class="mon-card-art silhouette" src="${src}" alt="">` : ""}<span class="mon-lock">🔒</span>`;
  const sub = !unlocked ? "尚未發現" : (stars > 0 ? starsStr(stars) : (mon.final ? "終極魔王 · HP " + mon.hp : mon.boss ? "首領戰 · HP " + mon.hp : "HP " + mon.hp));
  const no = String(mi + 1).padStart(2, "0");
  return `<button class="${cls}" data-mi="${mi}" style="animation-delay:${delay}s" ${unlocked ? "" : "disabled"} aria-label="No.${no} ${unlocked ? esc(mon.name) : "尚未發現"}">
    <span class="mon-no">No.${no}</span>
    ${unlocked && stars > 0 ? '<span class="mon-check" aria-hidden="true">✓</span>' : ""}
    <span class="mon-ic">${art}</span>
    <span class="mon-name">${unlocked ? esc(mon.name) : "？？？？"}</span>
    <span class="mon-sub">${sub}</span>
    ${mon.boss && unlocked ? '<span class="badge boss-badge">BOSS</span>' : ""}
  </button>`;
}
function reviewCardHtml(count, delay){
  const enabled = count > 0;
  return `<div class="review-card" style="animation-delay:${delay}s">
    <div class="review-head"><span class="review-emoji">🔮</span><div><div class="review-title">記憶水晶</div><div class="review-sub">${enabled ? `有 ${count} 句待複習` : "答錯的句子會出現在這裡"}</div></div></div>
    <button class="btn ${enabled ? "primary" : "line"}" id="reviewNode" ${enabled ? "" : "disabled"}>${enabled ? "喚醒複習" : "尚無複習內容"}</button>
  </div>`;
}
function answerCardHtml(delay){
  return `<div class="review-card" style="animation-delay:${delay}s">
    <div class="review-head"><span class="review-emoji">🧑‍🏫</span><div><div class="review-title">問答挑戰</div><div class="review-sub">暖身題・看法題・情境題，AI 老師幫你評分</div></div></div>
    <button class="btn primary" id="answerNode">開始問答</button>
  </div>`;
}
function renderMap(){
  stopAll();
  S.viaPath = null;
  const progress = loadProgress();
  const missedCount = reviewPoolList().length;
  const currentIndex = MONSTERS.findIndex((_, mi) => isMonsterUnlocked(mi, progress) && progress[mi] < 3);
  const found = MONSTERS.filter((_, mi) => isMonsterUnlocked(mi, progress)).length;
  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="toStart">設定</button>
      <h1 style="flex:1;font-size:20px;margin:0;text-align:center">🏰 怪獸長廊</h1>
      <div class="pts">⭐ <b>${totalStars(progress)}</b></div>
    </header>
    <section class="map">
      ${answerCardHtml(0)}
      <p class="corridor-count">已發現 <b>${found}</b> / ${MONSTERS.length} 隻怪獸</p>
      <div class="corridor-grid">
        ${MONSTERS.map((m, mi) => monsterCardHtml(mi, m, progress, mi === currentIndex, (mi + 1) * 0.045)).join("")}
      </div>
      ${reviewCardHtml(missedCount, (MONSTERS.length + 1) * 0.045)}
    </section>`;
  $("#toStart").onclick = renderStart;
  app.querySelectorAll(".mon-card").forEach(btn => {
    if (btn.disabled) return;
    btn.onclick = () => startMonster(+btn.dataset.mi);
  });
  const rv = $("#reviewNode");
  if (rv && !rv.disabled) rv.onclick = startReview;
  $("#answerNode").onclick = startAnswerChallenge;
}

function startMonster(mi){
  const mon = MONSTERS[mi];
  const picked = pickRepeatRound(mon.pool(), mon.hp); // V6.0-B：Shuffle Bag 抽題（見 questionPicker.js）
  S.mode = "battle"; S.monsterIndex = mi; S.monster = mon; S.hp = mon.hp;
  Object.assign(S, { round: picked, i: 0, score: 0, combo: 0, results: [] });
  renderQuestion();
}
function startReview(){
  const pool = reviewPoolList();
  if (!pool.length) return;
  const picked = pool.slice(0, Math.min(5, pool.length)).map(x => x[0]);
  S.mode = "review"; S.monsterIndex = null; S.monster = { name: "記憶水晶", emoji: "🔮" }; S.hp = picked.length;
  Object.assign(S, { round: picked, i: 0, score: 0, combo: 0, results: [] });
  renderQuestion();
}

/* ===== 闖關地圖：直式小徑，混合複誦／朗讀／問答節點 ===== */
/* 這支檔案就是之後接上真的插畫地圖時會整個重寫的地方（見 art-prompts.md） */
const PATH_TYPE_SUB = { repeat: hp => `複誦 · HP ${hp}`, read: hp => `朗讀 · ${hp} 篇短文`, answer: () => "問答 · 3 題" };
function buildPathPoints(n){
  // 由下（起點）到上（Boss）依序排列，左右交錯做出 S 型小徑
  const pts = [];
  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    const x = 50 + Math.sin(i * 1.8) * 32;
    const y = 92 - t * 84;
    pts.push({ x, y });
  }
  return pts;
}
function pathCurveD(pts){
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++){
    const p0 = pts[i - 1], p1 = pts[i];
    const midY = (p0.y + p1.y) / 2;
    d += ` C ${p0.x} ${midY}, ${p1.x} ${midY}, ${p1.x} ${p1.y}`;
  }
  return d;
}
// 手動校正的節點座標：對應真的美術圖裡實際畫出來的小徑位置（不是公式生成）。
// 陣列順序＝旅程順序（Zone 1 最先出發），但畫面上「下面＝起點、上面＝終點」，
// 所以渲染時會整個反過來疊（見 renderPathMap 裡的 [...ZONE_ART].reverse()）。
// 之後每加一張分區美術，就在這裡多補一個 { img, nodes:[{ ni, x, y }] }（x/y 是該張圖裡的百分比位置）。
const HERO_IDLE_SRC = "assets/characters/hero/hero_idle.png";
const HERO_WALK_SRC = "assets/characters/hero/hero_walk.png";
const HERO_WALK_MS = 900; // 進地圖時先播一小段行走動畫，抵達後定格待機

// 闖關地圖上怪物的正式立繪：用 PATH_NODES 的索引對應，只換顯示用的圖，不動節點資料。
// 沒列在這裡的節點（貓頭鷹、老師…）維持原本 emoji；怪獸長廊不套用。
const PATH_MONSTER_ART = {
  0: "assets/monsters/common/monster_01_green_slime.png",   // 哈欠史萊姆
  3: "assets/monsters/common/monster_02_meadow_rabbit.png", // 迷路小兔
  4: "assets/characters/npc/goat_scholar.webp",             // 山羊學者（Zone 5 朗讀關）
  6: "assets/monsters/common/monster_06_mist_ghost.png"     // 迷霧幽靈（512 畫布留白較多，CSS 另外放大，見 index.html）
};
// 戰鬥畫面用：只有「從闖關地圖進來、而且正在打那個節點」時才回傳立繪
function currentPathMonsterArt(){
  if (S.viaPath == null || S.monster !== PATH_NODES[S.viaPath]) return null;
  return PATH_MONSTER_ART[S.viaPath] || null;
}

// w/h＝圖檔原始尺寸，寫進 <img width height> 讓瀏覽器在圖片載入前就預留正確高度（換圖時要一起更新）
const ZONE_ART = [
  { img: "assets/maps/zone1-meadow.webp", w: 1024, h: 1536, nodes: [{ ni: 0, x: 53, y: 91 }] },
  { img: "assets/maps/zone2-village.webp", w: 1086, h: 1448, nodes: [{ ni: 1, x: 50, y: 45 }] },
  { img: "assets/maps/zone3-forest.webp", w: 1024, h: 1536, nodes: [{ ni: 2, x: 50, y: 55 }] },
  { img: "assets/maps/zone4-river-valley.webp", w: 1086, h: 1448, nodes: [{ ni: 3, x: 58, y: 46 }] },
  { img: "assets/maps/zone5-mountain-valley.webp", w: 1024, h: 1536, nodes: [{ ni: 4, x: 60, y: 50 }] },
  { img: "assets/maps/zone6-volcano.webp", w: 1024, h: 1536, nodes: [{ ni: 5, x: 48, y: 68 }] },
  { img: "assets/maps/zone7-snow-mountain.webp", w: 1024, h: 1536, nodes: [{ ni: 6, x: 58, y: 50 }] },
  { img: "assets/maps/zone8-boss-castle.webp", w: 1024, h: 1536, nodes: [{ ni: 7, x: 50, y: 27 }] }
];

// 8 個 Zone 的正式名稱（出自 art-prompts.md 各分區的標題），跨 Zone 時的區域提示用
const ZONE_NAMES = ["青青草原", "小村莊", "神秘森林", "河谷", "山谷", "火山區", "冰雪山", "Boss 城堡"];
const ZONE_BANNER_MS = 1600;
function showZoneBanner(zoneNo){
  app.querySelectorAll(".zone-banner").forEach(e => e.remove());
  const el = document.createElement("div");
  el.className = "zone-banner";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="zb-no">ZONE ${zoneNo}</div><div class="zb-name">${esc(ZONE_NAMES[zoneNo - 1] || "")}</div>`;
  app.appendChild(el); // 放在 app 裡：離開地圖畫面時會跟著被清掉
  setTimeout(() => el.remove(), ZONE_BANNER_MS);
}

// 主角站的節點＝依實際進度已解鎖的最前面一關（打贏第 k 關就站到第 k+1 關）。
// 位置完全由 gept_progress_path_v1 推算，不另外存檔；刻意不看 ?unlockAll，測試模式下主角仍反映真實進度
function pathHeroIndex(progress){
  let h = 0;
  while (h + 1 < PATH_NODES.length && progress[h] > 0) h++;
  return h;
}
const HERO_STEP_MIN_MS = 500, HERO_STEP_MAX_MS = 1200;

function renderPathMap(){
  stopAll();
  const progress = loadPathProgress();
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const currentIndex = pathHeroIndex(progress);
  // 上次在地圖上畫主角的位置（只記在記憶體）：這次往前推進了就從那裡走過來；重新整理後沒有記錄就直接站好
  const walkFrom = S.pathHeroShown != null && S.pathHeroShown < currentIndex && !reduceMotion ? S.pathHeroShown : null;
  S.pathHeroShown = currentIndex;
  const avatarAt = walkFrom != null ? walkFrom : currentIndex;

  const zonesHtml = [...ZONE_ART].reverse().map(zone => {
    const nodesHtml = zone.nodes.map(({ ni, x, y }) => {
      const node = PATH_NODES[ni];
      const unlocked = isPathNodeUnlocked(ni, progress);
      const stars = progress[ni];
      const cls = ["path-node", node.boss ? "boss" : "", node.final ? "final" : "", unlocked ? "" : "locked", ni === currentIndex ? "current" : ""].filter(Boolean).join(" ");
      const art = PATH_MONSTER_ART[ni];
      const icon = !unlocked ? "🔒" : art ? `<img class="path-node-art" src="${art}" alt="">` : node.emoji;
      const sub = !unlocked ? "尚未解鎖" : (stars > 0 ? starsStr(stars) : PATH_TYPE_SUB[node.type](node.hp));
      return `<button class="${cls}" style="left:${x}%;top:${y}%" data-ni="${ni}" ${unlocked ? "" : "disabled"} aria-label="${esc(node.name)}：${esc(sub)}">
        <span class="path-node-ic">${icon}</span>
        ${node.boss && unlocked ? '<span class="badge boss-badge" style="position:absolute;top:-10px;left:50%;transform:translateX(-50%)">BOSS</span>' : ""}
        ${unlocked && stars >= 3 ? '<span class="path-node-clear" aria-hidden="true">✓</span>' : ""}
      </button>
      <div class="path-node-label" style="left:${x}%;top:${y}%">${esc(node.name)}</div>
      ${ni === avatarAt ? `<div class="path-avatar walking" id="pathAvatar" style="left:${x}%;top:${y}%"><div class="hero-walk"><img src="${HERO_WALK_SRC}" alt="主角"></div></div>` : ""}`;
    }).join("");
    // data-zone 給 CSS 做相鄰分區的重疊漸變用（見 index.html 的 .zone-wrap 規則）
    return `<div class="zone-wrap" data-zone="${ZONE_ART.indexOf(zone) + 1}"><img src="${zone.img}" width="${zone.w}" height="${zone.h}" class="zone-bg" alt=""> ${nodesHtml}</div>`;
  }).join("");

  app.innerHTML = `
    <header class="top">
      <button class="ghost" id="toStart">設定</button>
      <h1 style="flex:1;font-size:20px;margin:0;text-align:center">闖關地圖</h1>
      <div class="pts">⭐ <b>${totalStars(progress)}</b></div>
    </header>
    <section class="map map-container">
      <div class="map-world">${zonesHtml}</div>
    </section>`;
  $("#toStart").onclick = renderStart;
  app.querySelectorAll(".path-node").forEach(btn => {
    if (btn.disabled) return;
    btn.onclick = () => startPathNode(+btn.dataset.ni);
  });
  const avatar = $("#pathAvatar");
  if (avatar && walkFrom != null){
    // 分區圖載入前 zone-wrap 高度是 0，座標與捲動都會算錯（會捲到最上面的 Boss 區），所以等圖都有尺寸再走；
    // 等待期間主角先站在起點節點
    whenZoneArtReady().then(() => { if (avatar.isConnected) walkPathHero(avatar, walkFrom, currentIndex); });
  } else if (avatar){
    whenZoneArtReady().then(() => { if (avatar.isConnected) avatar.scrollIntoView({ block: "center" }); });
    if (reduceMotion){
      avatar.classList.remove("walking");
      avatar.innerHTML = `<img src="${HERO_IDLE_SRC}" alt="主角">`;
    } else {
      setTimeout(() => {
        if (!avatar.isConnected) return;
        avatar.classList.remove("walking");
        avatar.innerHTML = `<img src="${HERO_IDLE_SRC}" alt="主角">`;
      }, HERO_WALK_MS);
    }
  }
}

// 等目前地圖上的 8 張 .zone-bg 都載入（或失敗）才 resolve；網路太慢時最多等 ZONE_ART_WAIT_MS 就照目前版面繼續
const ZONE_ART_WAIT_MS = 5000;
function whenZoneArtReady(){
  const imgs = [...app.querySelectorAll(".zone-bg")];
  const loaded = Promise.all(imgs.map(img => img.complete ? null : new Promise(res => {
    img.addEventListener("load", res, { once: true });
    img.addEventListener("error", res, { once: true });
  })));
  return Promise.race([loaded, new Promise(res => setTimeout(res, ZONE_ART_WAIT_MS))]);
}

// 主角走路時的鏡頭跟隨：主角在視窗 30%～70% 之間鏡頭不動；超出才每幀捲一部分（平滑追上、不會每幀硬鎖造成晃動），
// 而且絕不讓主角超出上下 12% 的邊界。玩家中途自己滑動也沒關係，下一幀會再慢慢拉回安全區
const CAM_SAFE_TOP = 0.3, CAM_SAFE_BOTTOM = 0.7, CAM_EDGE = 0.12, CAM_FOLLOW = 0.18;
function followHeroCamera(avatar){
  const r = avatar.getBoundingClientRect(), cy = (r.top + r.bottom) / 2, vh = innerHeight;
  let over = 0;
  if (cy < vh * CAM_SAFE_TOP) over = cy - vh * CAM_SAFE_TOP;
  else if (cy > vh * CAM_SAFE_BOTTOM) over = cy - vh * CAM_SAFE_BOTTOM;
  if (!over) return;
  let step = over * CAM_FOLLOW;
  const minY = vh * CAM_EDGE, maxY = vh * (1 - CAM_EDGE);
  if (cy - step < minY) step = cy - minY;
  else if (cy - step > maxY) step = cy - maxY;
  window.scrollBy(0, step);
}

/* ===== V4：打贏一關回到地圖時，主角從上一個節點沿直線走到新解鎖的節點，停下後由玩家自己點（不會自動開戰） ===== */
function walkPathHero(avatar, fromNi, toNi){
  const world = $(".map-world");
  const nodeBtn = ni => app.querySelector(`.path-node[data-ni="${ni}"]`);
  // 節點中心在 .map-world 裡的座標（節點用 zone-wrap 的百分比定位，跨 zone 也能算）
  const at = ni => {
    const b = nodeBtn(ni), wr = world.getBoundingClientRect(), zr = b.parentElement.getBoundingClientRect();
    return { x: zr.left - wr.left + zr.width * parseFloat(b.style.left) / 100, y: zr.top - wr.top + zr.height * parseFloat(b.style.top) / 100 };
  };
  const a = at(fromNi), b = at(toNi);
  const place = (x, y) => { avatar.style.left = x + "px"; avatar.style.top = y + "px"; };
  world.appendChild(avatar); // 走路途中放在整張地圖上，才能跨越 zone 邊界
  place(a.x, a.y);
  avatar.classList.toggle("facing-left", b.x < a.x - 2);
  // 起始鏡頭：距離夠短就讓起點與終點都在畫面內；太長就把起點放在安全區邊緣（往上走放 70%、往下走放 30%），之後交給鏡頭跟隨
  const startView = Math.min(CAM_SAFE_BOTTOM * innerHeight, Math.max(CAM_SAFE_TOP * innerHeight, innerHeight / 2 - (b.y - a.y) / 2));
  window.scrollTo(0, window.scrollY + world.getBoundingClientRect().top + a.y - startView);
  const ms = Math.round(Math.min(HERO_STEP_MAX_MS, Math.max(HERO_STEP_MIN_MS, Math.hypot(b.x - a.x, b.y - a.y) * 3)));
  // V5：真的跨到另一個 Zone 才顯示區域提示（約在走到一半、越過交界時出現，不會停下主角）
  const fromZone = nodeBtn(fromNi).parentElement.dataset.zone, toZone = nodeBtn(toNi).parentElement.dataset.zone;
  if (fromZone !== toZone) setTimeout(() => { if (avatar.isConnected) showZoneBanner(+toZone); }, Math.round(ms * 0.35));

  // 每一幀：先依時間算出主角位置（ease-in-out），再檢查鏡頭要不要跟 —— 鏡頭永遠用主角「這一幀」的實際位置
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const t0 = performance.now();
  let arrived = false;
  const frame = now => {
    if (arrived || !avatar.isConnected) return;
    const t = Math.min(1, (now - t0) / ms), e = ease(t);
    place(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e);
    followHeroCamera(avatar);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // 抵達用 setTimeout 收尾：分頁在背景時 rAF 會暫停，主角仍會準時落在終點
  setTimeout(() => {
    if (!avatar.isConnected) return;
    arrived = true; // 鏡頭停止追蹤
    // 抵達：放回目的地所在的 zone、改回百分比座標（之後視窗縮放也會跟著節點），換成待機圖
    const btn = nodeBtn(toNi);
    avatar.style.left = btn.style.left;
    avatar.style.top = btn.style.top;
    btn.parentElement.appendChild(avatar);
    avatar.classList.remove("walking", "facing-left");
    avatar.innerHTML = `<img src="${HERO_IDLE_SRC}" alt="主角">`;
    btn.classList.add("just-unlocked"); // 新節點輕微發光，提示「新的道路開了」
    setTimeout(() => btn.classList.remove("just-unlocked"), 2400);
  }, ms);
}

/* ===== 暫時的測試用：?test 時在闖關地圖的戰鬥畫面放一顆「直接過關」，存 3 星後直接回地圖（看主角走到下一關） ===== */
function mountTestWinButton(){
  if (!TEST_QUICK_WIN || S.viaPath == null) return;
  const btn = document.createElement("button");
  btn.className = "test-win-btn";
  btn.textContent = "⚡ 直接過關（測試）";
  btn.onclick = () => {
    const ni = S.viaPath;
    stopAll();
    const progress = loadPathProgress();
    progress[ni] = 3;
    savePathProgress(progress);
    renderPathMap();
  };
  app.appendChild(btn); // 放在 app 裡：換畫面時會跟著被清掉
}

function startPathNode(ni){
  const node = PATH_NODES[ni];
  if (node.final) return startBossBattle(ni); // FINAL BOSS：多回合英語戰（見 src/boss.js），不是一般的複誦戰
  if (node.type === "repeat") return startPathBattle(ni);
  if (node.type === "read") return startReadNode(ni);
  if (node.type === "answer"){ S.viaPath = ni; return startAnswerChallenge(); }
}
function startPathBattle(ni){
  const node = PATH_NODES[ni];
  const picked = pickRepeatRound(node.pool(), node.hp); // V6.0-B：Shuffle Bag 抽題（見 questionPicker.js）
  S.viaPath = ni; S.mode = "battle"; S.monsterIndex = null; S.monster = node; S.hp = node.hp;
  Object.assign(S, { round: picked, i: 0, score: 0, combo: 0, results: [] });
  renderQuestion();
}
function startReadNode(ni){
  const node = PATH_NODES[ni];
  const picked = pickReadRound(node.hp); // V6.0-B：Shuffle Bag 抽題（見 questionPicker.js）
  S.viaPath = ni; S.mode = "read"; S.monsterIndex = null; S.monster = node; S.hp = node.hp;
  Object.assign(S, { round: picked, i: 0, score: 0, combo: 0, results: [] });
  renderReadQuestion();
}
function renderReadQuestion(){
  const segs = S.round.map((_, k) => `<i class="${k < S.i ? "done" : k === S.i ? "now" : ""}"></i>`).join("");
  const passedCount = S.results.filter(r => r && r.pct >= PASS_LINE).length;
  const remaining = Math.max(0, S.hp - passedCount);
  const hpPct = Math.round(remaining / S.hp * 100);
  const mon = S.monster;
  app.innerHTML = `
    <header class="top">
      <button class="back-btn" id="quit">← 地圖</button>
      <div class="segs" style="grid-template-columns:repeat(${S.round.length},1fr)" aria-label="第 ${S.i + 1} 篇，共 ${S.round.length} 篇">${segs}</div>
      <div class="pts">積分 <b>${S.score}</b></div>
    </header>
    <section class="stage">
      <div class="arena">
        <div class="mon-ring" id="monRing"><span id="monEmoji">${(art => art ? `<img class="mon-art" src="${art}" alt="${esc(mon.name)}">` : mon.emoji)(currentPathMonsterArt())}</span></div>
        <div class="mon-name">${esc(mon.name)}</div>
        <div class="hp-wrap"><div class="hp-bar-bg"><div class="hp-bar-fill ${hpPct <= 30 ? "low" : ""}" id="hpFill" style="width:${hpPct}%"></div></div></div>
      </div>
      <h2 id="status" aria-live="polite"></h2>
      <p id="hint" class="muted"></p>
      <div id="passageBox" class="en passage-box"></div>
      <button class="ring" id="ring" aria-label="錄音狀態"></button>
      <div id="live" class="en muted"></div>
      <div id="resultBox" style="width:100%"></div>
    </section>`;
  $("#quit").onclick = () => { stopAll(); renderPathMap(); };
  $("#ring").onclick = () => { if ($("#ring").dataset.state === "say" && activeRec) { try { activeRec.stop(); } catch(_){} } };
  mountTestWinButton();
  runReadQuestion();
}
async function runReadQuestion(){
  const tk = ++S.token, q = S.round[S.i];
  $("#resultBox").innerHTML = "";
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
    const finish = () => {
      if (done) return; done = true;
      clearInterval(timer); startBtn.remove(); resolve();
    };
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
  evaluate(q, r);
}
