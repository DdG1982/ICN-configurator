/**
 * 3D-laag op echte data: PDOK-luchtfoto als grond en als dakstructuur, 3DBAG-gebouwen (woning + buren),
 * bomen uit AHN, paneelplekken uit de pijplijn, zonnebaan met schaduw en een warmtekaart per dakvlak.
 * Leest alleen het DakModel (src/core/dak-model.ts). Wordt lazy geladen.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DakModel, Mesh } from '../core/dak-model';
import { klokNaarUtc, zonstand, zonVector } from '../calc/sun';

export type Thema = 'goudenuur' | 'natuur';

export interface SceneOpties {
  canvas: HTMLCanvasElement;
  model: DakModel;
  basis: string;
  thema: Thema;
  sober: boolean;
}

export interface SceneApi {
  flyIn(duurMs: number): Promise<void>;
  sla(): void;
  toonPanelen(ids: string[], intervalMs: number, opTel: (n: number) => void): Promise<void>;
  zetPanelen(actief: Set<string>): void;
  zetZon(dag: number, klokuur: number): void;
  /** Momentaan vermogen (kW) en aantal beschaduwde panelen, met echte schaduw van gebouwen en bomen. */
  vermogenNu(actief: Set<string>, dag: number, klokuur: number): { kw: number; schaduw: number; zonOp: boolean };
  zetWarmtekaart(aan: boolean): void;
  zetThema(t: Thema): void;
  zetUitsnede(px: number): void;
  opKlikPlek(cb: (id: string) => void): void;
  resize(): void;
  dispose(): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const WP = 0.43;

/** Kleurschaal warmtekaart: navy -> blauw -> groen -> zongeel (ICN-kleuren). */
export function warmteKleur(f: number, c = new THREE.Color()): THREE.Color {
  const stops: [number, number[]][] = [[0.45, [11, 27, 105]], [0.7, [71, 149, 202]], [0.88, [57, 181, 74]], [1, [250, 214, 90]]];
  let a = stops[0], b = stops[stops.length - 1];
  if (f <= stops[0][0]) b = a;
  for (let i = 0; i < stops.length - 1; i++) if (f >= stops[i][0] && f <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
  const t = Math.min(1, Math.max(0, (f - a[0]) / ((b[0] - a[0]) || 1)));
  return c.setRGB(...(a[1].map((v, i) => (v + (b[1][i] - v) * t) / 255) as [number, number, number]), THREE.SRGBColorSpace);
}

function zonnecellen() {
  const el = document.createElement('canvas');
  el.width = 128; el.height = 192;
  const c = el.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 128, 192);
  g.addColorStop(0, '#1d2b45'); g.addColorStop(1, '#0c1424');
  c.fillStyle = g; c.fillRect(0, 0, 128, 192);
  c.strokeStyle = 'rgba(150,170,200,0.22)'; c.lineWidth = 1;
  for (let x = 0; x <= 128; x += 128 / 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 192); c.stroke(); }
  for (let y = 0; y <= 192; y += 192 / 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
  c.strokeStyle = 'rgba(210,218,230,0.7)'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 188);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function maakHemel() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { boven: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, zonKleur: { value: new THREE.Color() }, zonRichting: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vR; void main(){ vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 boven; uniform vec3 horizon; uniform vec3 zonKleur; uniform vec3 zonRichting; varying vec3 vR;
      void main(){ float h = clamp(vR.y, 0.0, 1.0); vec3 c = mix(horizon, boven, pow(h, 0.55));
      float g = max(dot(normalize(vR), normalize(zonRichting)), 0.0);
      c += zonKleur * (pow(g, 900.0) * 3.0 + pow(g, 12.0) * 0.35);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
}

/** Bouw een geometry uit een Mesh, met UV's die de luchtfoto (dichtbij) van boven projecteren. */
function meshGeometry(m: Mesh, half: number, filter: (t: number) => boolean) {
  const pos: number[] = [], uv: number[] = [];
  for (let i = 0; i < m.type.length; i++) {
    if (!filter(m.type[i])) continue;
    for (let k = 0; k < 3; k++) {
      const x = m.pos[i * 9 + k * 3], y = m.pos[i * 9 + k * 3 + 1], z = m.pos[i * 9 + k * 3 + 2];
      pos.push(x, y, z);
      uv.push((x + half) / (2 * half), 1 - (z + half) / (2 * half));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function maakScene(o: SceneOpties): SceneApi {
  const { model } = o;
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !o.sober, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, o.sober ? 1 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 9000);
  const hemel = maakHemel();
  scene.add(hemel);

  const hemiLicht = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  const zon = new THREE.DirectionalLight(0xffffff, 3);
  zon.castShadow = true;
  zon.shadow.mapSize.set(o.sober ? 1024 : 2048, o.sober ? 1024 : 2048);
  Object.assign(zon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
  zon.shadow.bias = -0.0005;
  zon.shadow.normalBias = 0.04;
  scene.add(hemiLicht, zon, zon.target);

  // Luchtfoto's: wijd (fly-in, 1,6 km) en dichtbij (160 m, ook op de daken geprojecteerd).
  const laad = new THREE.TextureLoader();
  const fotoDichtbij = laad.load(`${o.basis}/${model.luchtfoto.dichtbij.bestand}`);
  const fotoWijd = laad.load(`${o.basis}/${model.luchtfoto.wijd.bestand}`);
  for (const t of [fotoDichtbij, fotoWijd]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
  const halfN = model.luchtfoto.dichtbij.half, halfW = model.luchtfoto.wijd.half;
  const grondWijd = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfW, 2 * halfW), new THREE.MeshStandardMaterial({ map: fotoWijd, roughness: 1 }));
  grondWijd.rotation.x = -Math.PI / 2; grondWijd.position.y = -0.08;
  const grond = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfN, 2 * halfN), new THREE.MeshStandardMaterial({ map: fotoDichtbij, roughness: 1 }));
  grond.rotation.x = -Math.PI / 2; grond.receiveShadow = true;
  scene.add(grondWijd, grond);

  // Gebouwen.
  const dakMat = new THREE.MeshStandardMaterial({ map: fotoDichtbij, color: 0xd8d8d8, roughness: 0.85, side: THREE.DoubleSide });
  const muurMat = new THREE.MeshStandardMaterial({ color: 0xc4ab92, roughness: 0.95, side: THREE.DoubleSide });
  const muurBuurMat = new THREE.MeshStandardMaterial({ color: 0xb9ab9b, roughness: 0.95, side: THREE.DoubleSide });
  const occluders: THREE.Object3D[] = [];
  let hoogte = 8, grootte = 12;
  if (model.woning) {
    const dak = new THREE.Mesh(meshGeometry(model.woning, halfN, (t) => t === 1), dakMat);
    const muur = new THREE.Mesh(meshGeometry(model.woning, halfN, (t) => t === 2), muurMat);
    for (const m of [dak, muur]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); occluders.push(m); }
    const bb = new THREE.Box3().setFromObject(dak);
    hoogte = Math.max(4, bb.max.y);
    grootte = Math.max(10, bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  }
  if (model.buren && model.buren.type.length) {
    const dak = new THREE.Mesh(meshGeometry(model.buren, halfN, (t) => t === 1), dakMat);
    const muur = new THREE.Mesh(meshGeometry(model.buren, halfN, (t) => t === 2), muurBuurMat);
    for (const m of [dak, muur]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); occluders.push(m); }
  }
  // Pand niet in 3DBAG: alleen de BAG-footprint als oplichtende contour.
  let contour: THREE.LineLoop | null = null;
  if (model.status === 'niet-in-3dbag' && model.footprint?.length) {
    const g = new THREE.BufferGeometry().setFromPoints(model.footprint.map(([x, z]) => new THREE.Vector3(x, 0.3, z)));
    contour = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x39b54a }));
    scene.add(contour);
  }

  // Bomen uit AHN.
  const boomGeo = new THREE.IcosahedronGeometry(1, 2);
  const stamGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 7);
  const stamMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 });
  const bomenObj: THREE.Mesh[] = [];
  for (const [i, b] of (model.bomen ?? []).entries()) {
    // Kroon als twee overlappende bollen; korte, dunne stam. Kleur varieert licht per boom.
    const kleur = new THREE.Color().setHSL(0.27 + ((i * 37) % 10) / 300, 0.32, 0.24 + ((i * 53) % 10) / 160);
    const mat = new THREE.MeshStandardMaterial({ color: kleur, roughness: 1 });
    const r = Math.max(1.2, b.r * 1.1);
    const top = Math.max(r * 1.4, b.h);
    for (const [dx, dy, dz, sc] of [[0, 0, 0, 1], [r * 0.35, -r * 0.25, -r * 0.2, 0.8]] as const) {
      const kroon = new THREE.Mesh(boomGeo, mat);
      kroon.position.set(b.x + dx, top - r * 0.95 + dy, b.z + dz);
      kroon.scale.set(r * sc, r * 0.85 * sc, r * sc);
      kroon.castShadow = true;
      scene.add(kroon);
      bomenObj.push(kroon);
      occluders.push(kroon);
    }
    const stamH = Math.max(0.6, top - r * 1.5);
    const stam = new THREE.Mesh(stamGeo, stamMat);
    stam.scale.set(0.7, stamH, 0.7); stam.position.set(b.x, stamH / 2, b.z);
    scene.add(stam);
  }

  // Paneelplekken.
  const celTex = zonnecellen();
  const paneelMat = new THREE.MeshPhysicalMaterial({ map: celTex, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  interface PaneelObj { id: string; groep: THREE.Group; doel: number; zicht: number; lijn: THREE.LineLoop; kies: THREE.Mesh; midden: THREE.Vector3; normaal: THREE.Vector3; kwh: number; schaduw: number }
  const panelen: PaneelObj[] = [];
  const klikbaar: THREE.Object3D[] = [];
  const vlakken = new Map((model.dakvlakken ?? []).map((v) => [v.id, v]));
  for (const p of model.plekken ?? []) {
    const v = vlakken.get(p.vlak)!;
    const H = p.hoeken.map((h) => new THREE.Vector3(...h));
    const u = H[1].clone().sub(H[0]), w = H[3].clone().sub(H[0]);
    const n = new THREE.Vector3(...v.normaal).normalize();
    const midden = H[0].clone().add(u.clone().multiplyScalar(0.5)).add(w.clone().multiplyScalar(0.5));
    const groep = new THREE.Group();
    const m = new THREE.Matrix4().makeBasis(u.clone().normalize(), w.clone().normalize(), n);
    groep.quaternion.setFromRotationMatrix(m);
    groep.position.copy(midden).addScaledVector(n, 0.1);
    const paneel = new THREE.Mesh(new THREE.BoxGeometry(u.length(), w.length(), 0.04), paneelMat);
    paneel.castShadow = true; paneel.receiveShadow = true;
    if (v.plat) {
      // Oost-west-opstelling op een plat dak: om de beurt 10 graden naar oost of west.
      const kolom = Math.round(midden.x / (u.length() + 0.02));
      paneel.rotation.y = (kolom % 2 ? 1 : -1) * THREE.MathUtils.degToRad(10);
      paneel.position.z = 0.12;
    }
    groep.add(paneel);
    groep.visible = false;
    const lijn = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(H.map((h) => h.clone().addScaledVector(n, 0.06))),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    const kies = new THREE.Mesh(new THREE.PlaneGeometry(u.length(), w.length()), new THREE.MeshBasicMaterial({ visible: false }));
    kies.quaternion.copy(groep.quaternion); kies.position.copy(midden).addScaledVector(n, 0.08);
    kies.userData.id = p.id; paneel.userData.id = p.id;
    scene.add(groep, lijn, kies);
    klikbaar.push(kies, paneel);
    panelen.push({ id: p.id, groep, doel: 0, zicht: 0, lijn, kies, midden, normaal: n, kwh: p.kwh, schaduw: p.schaduw });
  }

  // Warmtekaart: gekleurde cellen per dakvlak, net boven het dak.
  const warmte = new THREE.Group();
  const celMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, vertexColors: false });
  for (const v of model.dakvlakken ?? []) {
    const cellen = v.warmte.cellen;
    if (!cellen.length) continue;
    const s = v.warmte.stap * 0.98;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(s, s), celMat, cellen.length);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...v.warmte.u), new THREE.Vector3(...v.warmte.v), new THREE.Vector3(...v.normaal));
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const n = new THREE.Vector3(...v.normaal);
    const mtx = new THREE.Matrix4(), kl = new THREE.Color();
    cellen.forEach(([x, y, z, f], i) => {
      mtx.compose(new THREE.Vector3(x, y, z).addScaledVector(n, 0.05), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, mtx);
      im.setColorAt(i, warmteKleur(f, kl));
    });
    im.renderOrder = 2;
    warmte.add(im);
  }
  scene.add(warmte);
  let warmteDoel = 0;

  // Camera.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.minDistance = Math.max(10, grootte * 0.8);
  controls.maxDistance = Math.max(80, grootte * 4);
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, hoogte * 0.45, 0);
  const afstand = Math.max(24, grootte * 1.8);
  // Kijk naar het beste dakvlak (meeste opbrengst), zodat de panelen in beeld zijn.
  const beste = [...(model.dakvlakken ?? [])].filter((v) => v.geschikt && !v.plat).sort((a, b) => b.kwhPerKwp * b.opp - a.kwhPerKwp * a.opp)[0];
  const kijk = beste ? new THREE.Vector3(beste.normaal[0], 0, beste.normaal[2]) : new THREE.Vector3(0.3, 0, 0.7);
  if (kijk.lengthSq() < 0.01) kijk.set(0.3, 0, 0.7);
  kijk.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
  const eind = new THREE.Vector3(kijk.x * 0.78, 0.62, kijk.z * 0.78).normalize().multiplyScalar(afstand);
  const start = new THREE.Vector3(-60, 1300, 700);
  camera.position.copy(o.sober ? eind : start);
  camera.lookAt(controls.target);

  // Licht en thema.
  let thema: Thema = o.thema;
  let zonData = { dag: 172, uur: 15 };
  function pasLichtToe() {
    const z = zonstand(model.adres.lat, model.adres.lon, zonData.dag, klokNaarUtc(zonData.dag, zonData.uur));
    const v = zonVector(z);
    const boven = Math.max(0, Math.sin((z.hoogte * Math.PI) / 180));
    zon.position.set(v.x * 200, Math.max(v.y, 0.02) * 200, v.z * 200);
    const laag = 1 - Math.min(1, z.hoogte / 25);
    const zonKleur = new THREE.Color().setHSL(0.09 - laag * 0.04, 0.9, 0.62 + (1 - laag) * 0.3);
    if (thema === 'goudenuur') zonKleur.lerp(new THREE.Color(1, 0.66, 0.36), 0.5);
    zon.color.copy(zonKleur);
    zon.intensity = z.hoogte > 0 ? 0.6 + boven * 3.0 : 0;
    const u = hemel.material.uniforms;
    u.zonRichting.value.set(v.x, v.y, v.z);
    u.zonKleur.value.copy(zonKleur);
    const dag = Math.min(1, Math.max(0, (z.hoogte + 4) / 26));
    if (thema === 'goudenuur') {
      u.boven.value.setRGB(0.04 + dag * 0.14, 0.06 + dag * 0.2, 0.12 + dag * 0.34);
      u.horizon.value.setRGB(0.55 + dag * 0.25, 0.32 + dag * 0.35, 0.22 + dag * 0.4);
      hemiLicht.intensity = 0.3 + dag * 0.45;
    } else {
      u.boven.value.setRGB(0.2 + dag * 0.2, 0.42 + dag * 0.22, 0.66 + dag * 0.26);
      u.horizon.value.setRGB(0.78 + dag * 0.14, 0.82 + dag * 0.12, 0.84 + dag * 0.1);
      hemiLicht.color.setRGB(0.88, 0.92, 1);
      hemiLicht.groundColor.setRGB(0.32, 0.34, 0.26);
      hemiLicht.intensity = 0.6 + dag * 0.7;
    }
    renderer.toneMappingExposure = 1.0;
    scene.fog = new THREE.Fog(u.horizon.value.clone(), 600, 2400);
  }
  pasLichtToe();

  // Renderlus.
  let vlucht: { t0: number; duur: number; klaar: () => void } | null = null;
  let klik: (id: string) => void = () => {};
  let uitsnede = 0;
  let laatste = performance.now();
  let actief = true;
  let tijd = 0;
  function frame(nu: number) {
    if (!actief) return;
    const dt = Math.min(0.05, (nu - laatste) / 1000); laatste = nu; tijd += dt;
    if (vlucht) {
      const f = Math.min(1, (nu - vlucht.t0) / vlucht.duur);
      const e = ease(f);
      camera.position.set(
        THREE.MathUtils.lerp(start.x, eind.x, e),
        THREE.MathUtils.lerp(start.y, eind.y, Math.pow(e, 0.65)),
        THREE.MathUtils.lerp(start.z, eind.z, e),
      );
      camera.lookAt(0, controls.target.y * e, 0);
      if (f >= 1) { const k = vlucht.klaar; vlucht = null; controls.enabled = true; k(); }
    } else if (controls.enabled) controls.update();
    for (const p of panelen) {
      p.zicht += (p.doel - p.zicht) * Math.min(1, dt * 9);
      p.groep.visible = p.zicht > 0.01;
      p.groep.scale.setScalar(0.85 + p.zicht * 0.15);
      const lm = p.lijn.material as THREE.LineBasicMaterial;
      lm.opacity = (1 - p.doel) * (controls.enabled ? 0.6 : 0);
    }
    celMat.opacity += (warmteDoel - celMat.opacity) * Math.min(1, dt * 6);
    warmte.visible = celMat.opacity > 0.01;
    if (contour) (contour.material as THREE.LineBasicMaterial).color.setHSL(0.36, 0.55, 0.42 + 0.15 * Math.sin(tijd * 3));
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Klikken: plek aan/uit.
  const ray = new THREE.Raycaster();
  let neer = { x: 0, y: 0 };
  renderer.domElement.addEventListener('pointerdown', (e) => { neer = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!controls.enabled || Math.hypot(e.clientX - neer.x, e.clientY - neer.y) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const raak = ray.intersectObjects(klikbaar, false)[0];
    if (raak) klik(raak.object.userData.id);
  });

  const schaduwRay = new THREE.Raycaster();
  const api: SceneApi = {
    flyIn(duurMs) {
      if (o.sober || duurMs <= 0) { camera.position.copy(eind); camera.lookAt(controls.target); controls.enabled = true; return Promise.resolve(); }
      return new Promise((klaar) => { vlucht = { t0: performance.now(), duur: duurMs, klaar }; });
    },
    sla() { if (vlucht) vlucht.t0 = -1e9; },
    async toonPanelen(ids, intervalMs, opTel) {
      const volgorde = panelen.filter((p) => ids.includes(p.id)).sort((a, b) => b.midden.y - a.midden.y || a.midden.x - b.midden.x);
      let n = 0;
      for (const p of volgorde) {
        p.doel = 1; n++; opTel(n);
        if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
    zetPanelen(aan) { for (const p of panelen) p.doel = aan.has(p.id) ? 1 : 0; },
    zetZon(dag, uur) { zonData = { dag, uur }; pasLichtToe(); },
    vermogenNu(aan, dag, uur) {
      const z = zonstand(model.adres.lat, model.adres.lon, dag, klokNaarUtc(dag, uur));
      if (z.hoogte <= 0.5) return { kw: 0, schaduw: 0, zonOp: false };
      const sv = zonVector(z);
      const s = new THREE.Vector3(sv.x, sv.y, sv.z);
      const am = 1 / Math.max(0.05, Math.sin((z.hoogte * Math.PI) / 180));
      const dni = 1000 * Math.pow(0.7, Math.pow(am, 0.678));
      let kw = 0, schaduw = 0;
      for (const p of panelen) {
        if (!aan.has(p.id)) continue;
        const cos = p.normaal.dot(s);
        const diffuus = 0.11 * dni * ((1 + p.normaal.y) / 2) + 40 * Math.sin((z.hoogte * Math.PI) / 180);
        let direct = 0;
        if (cos > 0) {
          schaduwRay.set(p.midden.clone().addScaledVector(p.normaal, 0.25), s);
          schaduwRay.far = 400;
          const geraakt = schaduwRay.intersectObjects(occluders, false).length > 0;
          if (geraakt) schaduw++; else direct = dni * cos;
        }
        kw += WP * ((direct + diffuus) / 1000) * 0.86;
      }
      return { kw, schaduw, zonOp: true };
    },
    zetWarmtekaart(aan) {
      warmteDoel = aan ? 0.85 : 0;
      for (const p of panelen) (p.lijn.material as THREE.LineBasicMaterial).color = aan ? warmteKleur(p.schaduw) : new THREE.Color(0xffffff);
    },
    zetThema(t) { thema = t; pasLichtToe(); },
    zetUitsnede(px) { uitsnede = px; api.resize(); },
    opKlikPlek(cb) { klik = cb; },
    resize() {
      const el = renderer.domElement;
      const b = el.clientWidth, h = el.clientHeight;
      if (!b || !h) return;
      renderer.setSize(b, h, false);
      camera.aspect = b / h;
      camera.fov = b / h < 0.9 ? 50 : 38;
      if (uitsnede > 0 && uitsnede < b * 0.6) camera.setViewOffset(b, h, uitsnede / 2, 0, b, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    dispose() { actief = false; renderer.dispose(); },
  };
  api.resize();
  return api;
}
