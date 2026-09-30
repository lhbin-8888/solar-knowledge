import * as THREE from 'three';
import { OrbitControls } from '../assets/js/OrbitControls.js';

/* ===================== 全局状态 ===================== */
let KNOWLEDGE = { categories: [] };
let OFFLINE = false;

const canvas = document.getElementById('scene');
let renderer, scene, camera, controls;
const planets = [];          // {cat, pivot, mesh, orbitRadius, speed, labelEl}
const orbitLines = [];       // THREE.LineLoop[]  便于重建时清理
const satGroups = {};        // catId -> {group, sats:[{mesh, angle, radius, speed, yOff}]}
const dipperStars = [];      // 北斗七星闪烁用：{mat, base, amp, speed, phase}
let selectedCat = null;
let paused = false;          // 选中行星后暂停公转，便于点击卫星
let hoverObj = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let focus = null;
const clock = new THREE.Clock();
let elapsed = 0;   // 累计时间，供闪烁等动画使用

/* 整体缩放系数：行星图标、轨道、卫星轨道、相机距离统一放大，保持布局比例不重叠 */
const PLANET_SCALE = 2;
const DEFAULT_CAM = new THREE.Vector3(0, 70 * PLANET_SCALE, 165 * PLANET_SCALE);

/* 搜索 / 标签筛选 */
let searchQuery = '';
const activeTags = new Set();

/* ===================== 数据加载 ===================== */
async function loadData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (!r.ok) throw new Error('bad status ' + r.status);
    KNOWLEDGE = await r.json();
    OFFLINE = false;
  } catch (e) {
    KNOWLEDGE = window.SEED_DATA || { categories: [] };
    OFFLINE = true;
    document.getElementById('offline-bar').classList.remove('hidden');
  }
}

/* ===================== 场景初始化 ===================== */
function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.copy(DEFAULT_CAM);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 600 * PLANET_SCALE;

  scene.add(new THREE.AmbientLight(0x334466, 0.55));
  const sunLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  buildStarfield();
  buildNebulae();
  buildDipper();
  buildSun();
  buildSolarSystem();
  bindEvents();

  window.addEventListener('resize', onResize);
  animate();
}

/* 圆形星点贴图：中心实白、边缘渐隐，避免点精灵被渲染成正方形 */
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.34, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.60, 'rgba(255,255,255,0.22)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function buildStarfield() {
  const N = 4200;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 400 + Math.random() * 900;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
    pos[i*3+2] = r * Math.cos(ph);
    // 亮度 + 轻微冷暖色偏，整体更亮
    const b = 0.62 + Math.random() * 0.38;
    const tint = Math.random();
    let cr, cg, cb;
    if (tint < 0.18)      { cr = b;        cg = b * 0.92; cb = b * 0.78; } // 暖白
    else if (tint < 0.40) { cr = b * 0.78; cg = b * 0.88; cb = b;        } // 偏蓝
    else                  { cr = b;        cg = b;        cb = b;        } // 纯白
    col[i*3] = cr; col[i*3+1] = cg; col[i*3+2] = cb;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: true,
    map: makeDotTexture(),                 // 关键：圆形贴图，否则点精灵是方块
    vertexColors: true, transparent: true, opacity: 1.0,
    alphaTest: 0.02, depthWrite: false, blending: THREE.AdditiveBlending
  });
  scene.add(new THREE.Points(g, m));
}

/* 星际云团：用加色混合的柔光精灵铺在远景球壳上 */
function makeNebulaTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  grd.addColorStop(0,   `rgba(${rgb},0.55)`);
  grd.addColorStop(0.4, `rgba(${rgb},0.18)`);
  grd.addColorStop(1,   `rgba(${rgb},0)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function buildNebulae() {
  const defs = [
    { rgb: '80,120,255',  n: 7, op: 0.38 }, // 蓝
    { rgb: '130,90,240',  n: 7, op: 0.34 }, // 紫
    { rgb: '55,80,210',   n: 6, op: 0.32 }, // 深蓝
    { rgb: '170,110,250', n: 5, op: 0.30 }, // 紫罗兰
  ];
  defs.forEach((d) => {
    const tex = makeNebulaTexture(d.rgb);
    for (let i = 0; i < d.n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true, alphaTest: 0.008,
        opacity: d.op, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const s = new THREE.Sprite(mat);
      const r = 360 + Math.random() * 560;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      s.position.set(
        r * Math.sin(ph) * Math.cos(th),
        r * Math.sin(ph) * Math.sin(th) * 0.6,
        r * Math.cos(ph)
      );
      const sc = 200 + Math.random() * 230;
      s.scale.set(sc, sc * 0.8, 1);
      scene.add(s);
    }
  });
}

/* 亮星贴图：白色核心 + 蓝白柔光晕 */
function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(190,210,255,0.35)');
  g.addColorStop(1,   'rgba(180,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* 北斗七星：7 颗亮星 + 斗形连线，置于远景星空 */
function buildDipper() {
  // 斗形相对坐标（x 向右、y 向上），顺序即连线顺序：斗口→斗底→斗柄
  const pts = [
    [0, 4],     // 天枢 Dubhe
    [0, 0],     // 天璇 Merak
    [3, -0.5],  // 天玑 Phecda
    [3, 3],     // 天权 Megrez
    [6, 3],     // 玉衡 Alioth
    [8.5, 3.5], // 开阳 Mizar
    [11, 4.5],  // 摇光 Alkaid
  ];
  const scale = 5.5;
  const starTex = makeStarTexture();
  const group = new THREE.Group();
  const positions = [];

  pts.forEach((p, i) => {
    const mat = new THREE.SpriteMaterial({
      map: starTex, color: 0xcfe0ff, transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    const v = new THREE.Vector3(p[0] * scale, p[1] * scale, 0);
    s.position.copy(v);
    const sz = i % 2 ? 13 : 15;   // 交错大小更有层次
    s.scale.set(sz, sz, 1);
    group.add(s);
    positions.push(v);
    dipperStars.push({
      mat, base: 0.9, amp: 0.34,
      speed: 0.5 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2
    });
  });

  // 斗形连线（不闭合）
  const lineGeo = new THREE.BufferGeometry().setFromPoints(positions);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.22 });
  group.add(new THREE.Line(lineGeo, lineMat));

  // 放到远景、略微抬高偏左后方的天区
  group.position.set(-300, 170, -380);
  scene.add(group);
}

function buildSun() {
  const geo = new THREE.SphereGeometry(6, 48, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcf66 });
  const sun = new THREE.Mesh(geo, mat);
  scene.add(sun);
  sun.userData = { type: 'sun' };
  const glowTex = makeGlowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(28, 28, 1);
  sun.add(glow);
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,230,160,0.9)');
  grd.addColorStop(0.4, 'rgba(255,190,90,0.35)');
  grd.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ===================== 行星与卫星 ===================== */
function buildSolarSystem() {
  const labelsLayer = document.getElementById('labels');
  labelsLayer.innerHTML = '';

  KNOWLEDGE.categories.forEach((cat) => {
    const color = new THREE.Color(cat.color);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const geo = new THREE.SphereGeometry(cat.size * PLANET_SCALE, 40, 40);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.85, metalness: 0.1,
      emissive: color.clone().multiplyScalar(0.18)
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = cat.orbitRadius * PLANET_SCALE;
    mesh.userData = { type: 'planet', catId: cat.id };
    pivot.add(mesh);

    scene.add(makeOrbitLine(cat.orbitRadius * PLANET_SCALE, color, orbitLines));

    const labelEl = document.createElement('div');
    labelEl.className = 'plabel';
    labelEl.textContent = cat.name;
    labelEl.style.color = '#' + color.getHexString();
    labelsLayer.appendChild(labelEl);

    planets.push({ cat, pivot, mesh, orbitRadius: cat.orbitRadius, speed: cat.speed, labelEl });

    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    satGroups[cat.id] = { group, sats: [] };
  });

  rebuildAllSatellites();
}

function makeOrbitLine(radius, color, collect) {
  const pts = [];
  const seg = 160;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22 });
  const line = new THREE.LineLoop(g, m);
  if (collect) collect.push(line);
  return line;
}

/* 新增 / 删除分类后，整体重建太阳系（清理旧行星、轨道、标签、卫星组） */
function rebuildSolarSystem() {
  planets.forEach((p) => {
    scene.remove(p.pivot);
    if (p.labelEl && p.labelEl.parentNode) p.labelEl.parentNode.removeChild(p.labelEl);
  });
  orbitLines.forEach((o) => scene.remove(o));
  orbitLines.length = 0;
  Object.values(satGroups).forEach((e) => scene.remove(e.group));
  planets.length = 0;
  for (const k in satGroups) delete satGroups[k];
  buildSolarSystem();
  renderTagChips();
}

function rebuildAllSatellites() {
  KNOWLEDGE.categories.forEach((cat) => rebuildSatellites(cat.id));
}

function rebuildSatellites(catId) {
  const entry = satGroups[catId];
  if (!entry) return;
  entry.sats.forEach((s) => entry.group.remove(s.mesh));
  entry.sats = [];

  const cat = KNOWLEDGE.categories.find((c) => c.id === catId);
  const color = new THREE.Color(cat.color);
  const sats = cat.satellites || [];
  const baseR = cat.size * PLANET_SCALE + 2.6 * PLANET_SCALE;

  sats.forEach((sat, i) => {
    const radius = baseR + i * 1.1 * PLANET_SCALE;
    const geo = new THREE.SphereGeometry(0.5, 20, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: color.clone().lerp(new THREE.Color(0xffffff), 0.45),
      emissive: color.clone().multiplyScalar(0.6), roughness: 0.5
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { type: 'satellite', catId, satId: sat.id };
    entry.group.add(mesh);
    entry.sats.push({
      mesh, angle: (i / Math.max(1, sats.length)) * Math.PI * 2,
      radius, speed: 0.6 + i * 0.05, yOff: (i % 2 ? 1 : -1) * 0.6
    });
  });
}

/* ===================== 渲染循环 ===================== */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!paused) {
    planets.forEach((p) => { p.pivot.rotation.y += p.speed * dt * 0.5; });
  }

  // 北斗七星缓慢闪烁
  elapsed += dt;
  for (let i = 0; i < dipperStars.length; i++) {
    const d = dipperStars[i];
    d.mat.opacity = d.base + d.amp * Math.sin(elapsed * d.speed + d.phase);
  }

  planets.forEach((p) => {
    const entry = satGroups[p.cat.id];
    if (selectedCat === p.cat.id && entry) {
      const wp = new THREE.Vector3();
      p.mesh.getWorldPosition(wp);
      entry.group.position.copy(wp);
      entry.group.visible = true;
      entry.sats.forEach((s) => {
        s.angle += s.speed * dt;
        s.mesh.position.set(Math.cos(s.angle) * s.radius, s.yOff, Math.sin(s.angle) * s.radius);
      });
    } else {
      entry.group.visible = false;
    }
  });

  updateLabels();
  if (focus) updateFocus(dt);
  else controls.update();
  renderer.render(scene, camera);
}

function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  const v = new THREE.Vector3();
  planets.forEach((p) => {
    p.mesh.getWorldPosition(v);
    v.project(camera);
    const el = p.labelEl;
    if (v.z > 1) { el.style.opacity = '0'; return; }
    el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
    el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
    el.style.opacity = (selectedCat && selectedCat !== p.cat.id) ? '0.25' : '1';
    el.classList.toggle('sel', selectedCat === p.cat.id);
  });
}

/* ===================== 相机聚焦 ===================== */
function focusOn(targetVec, camVec, dur = 0.9) {
  focus = {
    fromT: controls.target.clone(), toT: targetVec.clone(),
    fromC: camera.position.clone(), toC: camVec.clone(),
    t: 0, dur
  };
  controls.enabled = false;
}
function updateFocus(dt) {
  focus.t = Math.min(1, focus.t + dt / focus.dur);
  const e = easeInOut(focus.t);
  controls.target.lerpVectors(focus.fromT, focus.toT, e);
  camera.position.lerpVectors(focus.fromC, focus.toC, e);
  if (focus.t >= 1) { focus = null; controls.enabled = true; }
}
function easeInOut(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }

/* ===================== 选择 / 打开 ===================== */
function selectCategory(catId) {
  const p = planets.find((x) => x.cat.id === catId);
  if (!p) return;
  selectedCat = catId;
  paused = true;
  const wp = new THREE.Vector3();
  p.mesh.getWorldPosition(wp);
  const dir = wp.clone().normalize();
  const camVec = wp.clone()
    .add(dir.multiplyScalar(p.cat.size * PLANET_SCALE * 7 + 12 * PLANET_SCALE))
    .add(new THREE.Vector3(0, p.cat.size * PLANET_SCALE * 3 + 6 * PLANET_SCALE, 0));
  focusOn(wp, camVec);
  showDetail(p.cat);
}

function deselect() {
  selectedCat = null;
  paused = false;
  hideDetail();
}

function openBook(catId, satId) {
  const cat = KNOWLEDGE.categories.find((c) => c.id === catId);
  if (!cat) return;
  const sat = (cat.satellites || []).find((s) => s.id === satId);
  if (!sat) return;
  document.getElementById('book-title').textContent = sat.title;
  document.getElementById('book-author').textContent = sat.author ? ('作者：' + sat.author) : '';
  const cover = document.getElementById('book-cover');
  if (sat.cover) { cover.style.backgroundImage = `url("${sat.cover}")`; }
  else { cover.style.backgroundImage = `url("${coverFor(cat, sat)}")`; }
  const tagsBox = document.getElementById('book-tags');
  tagsBox.innerHTML = (sat.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const body = document.getElementById('book-body');
  body.innerHTML = window.marked ? window.marked.parse(sat.content || '') : (sat.content || '');
  document.getElementById('book-modal').classList.remove('hidden');
}

/* ===================== 封面生成（按分类色渐变） ===================== */
function coverFor(cat, sat) {
  if (sat.cover) return sat.cover;
  const w = 240, h = 320;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const col = new THREE.Color(cat.color);
  const c1 = `rgb(${Math.round(col.r*55)},${Math.round(col.g*55)},${Math.round(col.b*55)})`;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1); g.addColorStop(1, cat.color);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.15; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w*0.82, h*0.22, 64, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(w*0.18, h*0.82, 84, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px "PingFang SC","Microsoft YaHei",sans-serif';
  wrapText(ctx, sat.title, 20, 64, w - 40, 32);
  ctx.font = '14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(cat.name, 20, h - 56);
  if (sat.author) { ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(sat.author, 20, h - 30); }
  return cv.toDataURL('image/png');
}
function wrapText(ctx, text, x, y, maxW, lh) {
  let line = '', yy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = ch; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

/* ===================== 交互事件 ===================== */
function bindEvents() {
  let downX = 0, downY = 0, downT = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = Date.now(); });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved < 6 && Date.now() - downT < 400) handleClick(e);
  });
  renderer.domElement.addEventListener('pointermove', handleHover);

  document.getElementById('btn-reset').addEventListener('click', resetView);
  document.getElementById('detail-close').addEventListener('click', deselect);
  document.getElementById('btn-admin').addEventListener('click', openAdmin);
  document.getElementById('btn-add-cat').addEventListener('click', openAddCatBox);
  document.getElementById('btn-del-cat').addEventListener('click', deleteCategory);
  document.getElementById('btn-cat-ok').addEventListener('click', confirmAddCategory);
  document.getElementById('btn-cat-cancel').addEventListener('click', cancelAddCat);
  document.getElementById('results-close').addEventListener('click', clearFilter);

  document.getElementById('search').addEventListener('input', (e) => { searchQuery = e.target.value; applyFilter(); });
  document.getElementById('search-clear').addEventListener('click', () => {
    document.getElementById('search').value = ''; searchQuery = ''; applyFilter();
  });
  document.getElementById('clear-filter').addEventListener('click', clearFilter);

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => {
      const which = b.getAttribute('data-close');
      document.getElementById(which === 'book' ? 'book-modal' : 'admin-modal').classList.add('hidden');
      if (which === 'admin') refreshAdminList();
    });
  });
  document.getElementById('book-modal').addEventListener('click', (e) => {
    if (e.target.id === 'book-modal') e.currentTarget.classList.add('hidden');
  });
  document.getElementById('admin-modal').addEventListener('click', (e) => {
    if (e.target.id === 'admin-modal') e.currentTarget.classList.add('hidden');
  });
}

function setPointer(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}
function pick() {
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  planets.forEach((p) => targets.push(p.mesh));
  if (selectedCat && satGroups[selectedCat]) satGroups[selectedCat].sats.forEach((s) => targets.push(s.mesh));
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0].object : null;
}
function handleClick(e) {
  setPointer(e);
  const obj = pick();
  if (!obj) { deselect(); return; }
  const ud = obj.userData;
  if (ud.type === 'satellite') openBook(ud.catId, ud.satId);
  else if (ud.type === 'planet') selectCategory(ud.catId);
}
function handleHover(e) {
  setPointer(e);
  const obj = pick();
  document.body.style.cursor = obj ? 'pointer' : 'default';
  if (hoverObj && hoverObj !== obj) setHover(hoverObj, false);
  if (obj && obj !== hoverObj) setHover(obj, true);
  hoverObj = obj;
}
function setHover(obj, on) {
  if (obj.userData.type === 'planet') obj.scale.setScalar(on ? 1.18 : 1);
  else if (obj.userData.type === 'satellite') obj.scale.setScalar(on ? 1.6 : 1);
}
function resetView() {
  deselect();
  clearFilter();
  focusOn(new THREE.Vector3(0, 0, 0), DEFAULT_CAM.clone(), 1.0);
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ===================== 详情面板 ===================== */
function showDetail(cat) {
  document.getElementById('detail-title').textContent = cat.name;
  document.getElementById('detail-sub').textContent = `共 ${(cat.satellites || []).length} 个卫星（书籍 / 知识点）`;
  const dot = document.getElementById('detail-dot');
  dot.style.background = cat.color; dot.style.color = cat.color;
  const list = document.getElementById('sat-list');
  list.innerHTML = '';
  (cat.satellites || []).forEach((sat) => list.appendChild(satCard(cat, sat)));
  document.getElementById('detail').classList.remove('hidden');
  document.getElementById('results').classList.add('hidden');
}
function hideDetail() { document.getElementById('detail').classList.add('hidden'); }

function satCard(cat, sat) {
  const card = document.createElement('div');
  card.className = 'sat-card';
  const cover = document.createElement('img');
  cover.className = 'sat-cover';
  cover.src = sat.cover || coverFor(cat, sat);
  cover.alt = sat.title;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML =
    `<div class="t"><span>${esc(sat.title)}</span></div>` +
    (sat.author ? `<div class="a">${esc(sat.author)}</div>` : '') +
    (sat.summary ? `<div class="s">${esc(sat.summary)}</div>` : '') +
    ((sat.tags && sat.tags.length) ? `<div class="tags">${sat.tags.map((t)=>`<span class="tag">${esc(t)}</span>`).join('')}</div>` : '');
  card.appendChild(cover); card.appendChild(meta);
  card.addEventListener('click', () => openBook(cat.id, sat.id));
  return card;
}

/* ===================== 搜索 / 标签筛选 ===================== */
function collectTags() {
  const s = new Set();
  KNOWLEDGE.categories.forEach((c) => (c.satellites || []).forEach((x) => (x.tags || []).forEach((t) => s.add(t))));
  return [...s].sort();
}
function renderTagChips() {
  const box = document.getElementById('tagchips');
  box.innerHTML = '';
  collectTags().forEach((t) => {
    const c = document.createElement('span');
    c.className = 'chip' + (activeTags.has(t) ? ' on' : '');
    c.textContent = t;
    c.onclick = () => { activeTags.has(t) ? activeTags.delete(t) : activeTags.add(t); renderTagChips(); applyFilter(); };
    box.appendChild(c);
  });
  document.getElementById('filterbar').classList.toggle('hidden', collectTags().length === 0);
}
function applyFilter() {
  const q = searchQuery.trim().toLowerCase();
  const tags = [...activeTags];
  const filtering = q || tags.length;
  const list = document.getElementById('results-list');
  const resPanel = document.getElementById('results');

  if (!filtering) {
    resPanel.classList.add('hidden');
    if (selectedCat) {
      const cat = KNOWLEDGE.categories.find((c) => c.id === selectedCat);
      if (cat) showDetail(cat);
    }
    return;
  }

  const matches = [];
  KNOWLEDGE.categories.forEach((c) => {
    (c.satellites || []).forEach((s) => {
      const hay = (s.title + ' ' + (s.author || '') + ' ' + (s.summary || '') + ' ' + (s.tags || []).join(' ')).toLowerCase();
      const okQ = !q || hay.includes(q);
      const okT = tags.every((t) => (s.tags || []).includes(t));
      if (okQ && okT) matches.push({ cat: c, sat: s });
    });
  });

  list.innerHTML = '';
  matches.forEach(({ cat, sat }) => {
    const card = satCard(cat, sat);
    const catLine = document.createElement('div');
    catLine.className = 'res-cat';
    catLine.innerHTML = `分类：<b>${esc(cat.name)}</b>`;
    card.insertBefore(catLine, card.firstChild);
    list.appendChild(card);
  });
  if (!matches.length) {
    list.innerHTML = '<div class="muted small">没有匹配的书籍，换个关键词或标签试试。</div>';
  }
  document.getElementById('results-title').textContent = '搜索结果';
  document.getElementById('results-sub').textContent = `匹配到 ${matches.length} 本`;
  resPanel.classList.remove('hidden');
  document.getElementById('detail').classList.add('hidden');
}
function clearFilter() {
  searchQuery = '';
  activeTags.clear();
  document.getElementById('search').value = '';
  renderTagChips();
  applyFilter();
}

/* ===================== 管理后台 ===================== */
let adminCatId = null;
let editingSatId = null;

function openAdmin() {
  if (OFFLINE) { toast('管理功能需启动本地服务（start.bat）'); return; }
  repopulateAdminCats();
  const sel = document.getElementById('admin-cat');
  sel.onchange = () => { adminCatId = sel.value; editingSatId = null; resetForm(); refreshAdminList(); };
  resetForm();
  refreshAdminList();
  document.getElementById('admin-modal').classList.remove('hidden');
}

function refreshAdminList() {
  const box = document.getElementById('admin-sat-list');
  box.innerHTML = '';
  const cat = KNOWLEDGE.categories.find((c) => c.id === adminCatId);
  (cat.satellites || []).forEach((sat) => {
    const row = document.createElement('div');
    row.className = 'admin-sat';
    row.innerHTML = `<div class="nm">${esc(sat.title)}<small>${esc(sat.author || '')}</small></div>`;
    const edit = document.createElement('button'); edit.textContent = '编辑';
    edit.onclick = () => startEdit(sat);
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '删除';
    del.onclick = () => deleteSat(sat.id);
    row.appendChild(edit); row.appendChild(del);
    box.appendChild(row);
  });
  if (!(cat.satellites || []).length) {
    box.innerHTML = '<div class="muted small">该分类暂无卫星，下方填写后点击「保存」新增。</div>';
  }
}

function resetForm() {
  editingSatId = null;
  document.getElementById('f-title').value = '';
  document.getElementById('f-author').value = '';
  document.getElementById('f-summary').value = '';
  document.getElementById('f-tags').value = '';
  document.getElementById('f-cover').value = '';
  document.getElementById('f-content').value = '';
  document.getElementById('admin-form-title').textContent = '➕ 新增卫星（书籍 / 知识点）';
  document.getElementById('f-cancel').classList.add('hidden');
}

function startEdit(sat) {
  editingSatId = sat.id;
  document.getElementById('f-title').value = sat.title;
  document.getElementById('f-author').value = sat.author || '';
  document.getElementById('f-summary').value = sat.summary || '';
  document.getElementById('f-tags').value = (sat.tags || []).join(', ');
  document.getElementById('f-cover').value = sat.cover || '';
  document.getElementById('f-content').value = sat.content || '';
  document.getElementById('admin-form-title').textContent = '✏ 编辑：' + sat.title;
  document.getElementById('f-cancel').classList.remove('hidden');
}

async function saveSat() {
  const title = document.getElementById('f-title').value.trim();
  const content = document.getElementById('f-content').value;
  if (!title) { toast('请填写书名 / 标题'); return; }
  const tags = document.getElementById('f-tags').value
    .split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  const cover = document.getElementById('f-cover').value.trim();
  const payload = { title, author: document.getElementById('f-author').value.trim(),
    summary: document.getElementById('f-summary').value.trim(), tags, cover, content };
  try {
    let url, method;
    if (editingSatId) { url = '/api/satellite/' + editingSatId; method = 'PUT'; }
    else { url = '/api/category/' + adminCatId + '/satellite'; method = 'POST'; }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('status ' + r.status);
    KNOWLEDGE = await (await fetch('/api/data', { cache: 'no-store' })).json();
    rebuildSatellites(adminCatId);
    resetForm();
    refreshAdminList();
    if (selectedCat === adminCatId) showDetail(KNOWLEDGE.categories.find((c) => c.id === adminCatId));
    renderTagChips();
    toast(editingSatId ? '已更新' : '已新增卫星');
  } catch (e) {
    toast('保存失败：' + e.message);
  }
}

async function deleteSat(satId) {
  if (!confirm('确认删除该卫星（书籍）？此操作不可撤销。')) return;
  try {
    const r = await fetch('/api/satellite/' + satId, { method: 'DELETE' });
    if (!r.ok) throw new Error('status ' + r.status);
    KNOWLEDGE = await (await fetch('/api/data', { cache: 'no-store' })).json();
    rebuildSatellites(adminCatId);
    refreshAdminList();
    if (selectedCat === adminCatId) showDetail(KNOWLEDGE.categories.find((c) => c.id === adminCatId));
    renderTagChips();
    toast('已删除');
  } catch (e) {
    toast('删除失败：' + e.message);
  }
}

/* ===================== 分类管理 ===================== */
function repopulateAdminCats() {
  const sel = document.getElementById('admin-cat');
  const cur = adminCatId;
  sel.innerHTML = '';
  KNOWLEDGE.categories.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
  adminCatId = KNOWLEDGE.categories.some((c) => c.id === cur) ? cur : KNOWLEDGE.categories[0]?.id;
  sel.value = adminCatId || '';
}

function openAddCatBox() {
  document.getElementById('add-cat-box').classList.remove('hidden');
  document.getElementById('f-cat-name').focus();
}
function cancelAddCat() {
  document.getElementById('add-cat-box').classList.add('hidden');
  document.getElementById('f-cat-name').value = '';
  document.getElementById('f-cat-color').value = '';
}

async function confirmAddCategory() {
  const name = document.getElementById('f-cat-name').value.trim();
  if (!name) { toast('请填写分类名称'); return; }
  const color = document.getElementById('f-cat-color').value.trim();
  try {
    const r = await fetch('/api/category', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    if (!r.ok) throw new Error('status ' + r.status);
    const cat = await r.json();
    KNOWLEDGE = await (await fetch('/api/data', { cache: 'no-store' })).json();
    rebuildSolarSystem();
    repopulateAdminCats();
    adminCatId = cat.id;
    document.getElementById('admin-cat').value = cat.id;
    cancelAddCat();
    resetForm();
    refreshAdminList();
    toast('已新增分类：' + cat.name);
  } catch (e) {
    toast('新增分类失败：' + e.message);
  }
}

async function deleteCategory() {
  if (!adminCatId) return;
  const cat = KNOWLEDGE.categories.find((c) => c.id === adminCatId);
  const nm = cat ? cat.name : adminCatId;
  if (!confirm(`确认删除分类「${nm}」？该分类下所有卫星（书籍）将一并删除，此操作不可撤销。`)) return;
  try {
    const r = await fetch('/api/category/' + adminCatId, { method: 'DELETE' });
    if (!r.ok) throw new Error('status ' + r.status);
    const wasSel = selectedCat === adminCatId;
    KNOWLEDGE = await (await fetch('/api/data', { cache: 'no-store' })).json();
    if (wasSel) deselect();
    rebuildSolarSystem();
    repopulateAdminCats();
    resetForm();
    refreshAdminList();
    toast('已删除分类：' + nm);
  } catch (e) {
    toast('删除分类失败：' + e.message);
  }
}

/* ===================== 工具 ===================== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ===================== 启动 ===================== */
(async function start() {
  await loadData();
  initScene();
  renderTagChips();
  document.getElementById('f-save').addEventListener('click', saveSat);
  document.getElementById('f-cancel').addEventListener('click', resetForm);
})();
