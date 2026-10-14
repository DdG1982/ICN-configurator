/**
 * 3D-laag: omgeving, digitale tweeling van het dak, panelen, zonnebaan en warmtekaart.
 * Leest alleen het genormaliseerde RoofModel en de berekende indeling. Wordt lazy geladen.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Gebouw, RoofModel } from '../core/roof-model';
import type { Plek } from '../calc/layout';
import { klokNaarUtc, zonstand, zonVector } from '../calc/sun';

export type Thema = 'goudenuur' | 'daglicht';

export interface SceneOpties {
  canvas: HTMLCanvasElement;
  model: RoofModel;
  plekken: Plek[];
  raster: number[][];
  paneel: { breedte: number; hoogte: number };
  thema: Thema;
  sober: boolean;
}

export interface SceneApi {
  flyIn(duurMs: number): Promise<void>;
  sla(): void;
  toonPanelen(intervalMs: number, opTel: (n: number) => void): Promise<void>;
  zetPanelen(plekken: Plek[]): void;
  zetZon(dag: number, klokuur: number): void;
  zetWarmtekaart(aan: boolean): void;
  zetThema(t: Thema): void;
  opKlikPlek(cb: (id: string) => void): void;
  resize(): void;
  dispose(): void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------- Texturen (canvas, geen externe bestanden) ---------- */

function canvasTex(w: number, h: number, teken: (c: CanvasRenderingContext2D) => void, herhaal = false) {
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  teken(el.getContext('2d')!);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function dakpannen() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#3b3f45'; c.fillRect(0, 0, 256, 256);
    const r = seeded(7);
    for (let y = 0; y < 256; y += 16) {
      for (let x = (y / 16) % 2 ? -10 : 0; x < 256; x += 20) {
        const l = 52 + r() * 14;
        c.fillStyle = `hsl(215 5% ${l * 0.62}%)`;
        c.fillRect(x + 1, y + 1, 18, 14);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 1, y + 13, 18, 2);
      }
    }
  }, true);
}

function baksteen() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#d8d0c4'; c.fillRect(0, 0, 256, 256);
    const r = seeded(3);
    for (let y = 0; y < 256; y += 8) {
      for (let x = (y / 8) % 2 ? -11 : 0; x < 256; x += 22) {
        const h = 14 + r() * 8, l = 34 + r() * 8;
        c.fillStyle = `hsl(${h} 42% ${l}%)`;
        c.fillRect(x + 1, y + 1, 20, 6);
      }
    }
  }, true);
}

function zonnecellen() {
  return canvasTex(128, 192, (c) => {
    const g = c.createLinearGradient(0, 0, 128, 192);
    g.addColorStop(0, '#1b2638'); g.addColorStop(1, '#0d1420');
    c.fillStyle = g; c.fillRect(0, 0, 128, 192);
    c.strokeStyle = 'rgba(150,170,200,0.22)'; c.lineWidth = 1;
    for (let x = 0; x <= 128; x += 128 / 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 192); c.stroke(); }
    for (let y = 0; y <= 192; y += 192 / 10) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
    c.strokeStyle = 'rgba(200,210,225,0.65)'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 188);
  });
}

/* ---------- Omgeving: dorpsplattegrond + huizen ---------- */

interface Straat { x1: number; z1: number; x2: number; z2: number; b: number }

function maakStraten(): Straat[] {
  const s: Straat[] = [];
  // De straat van de woning loopt oost-west, ten zuiden van het huis.
  s.push({ x1: -600, z1: 20, x2: 600, z2: 20, b: 7 });
  for (let z = -100; z >= -460; z -= 120) s.push({ x1: -520, z1: z, x2: 520, z2: z, b: 6 });
  for (let z = 140; z <= 440; z += 110) s.push({ x1: -520, z1: z, x2: 520, z2: z, b: 6 });
  for (let x = -480; x <= 480; x += 160) s.push({ x1: x, z1: -520, x2: x, z2: 520, b: 6 });
  s.push({ x1: -900, z1: -260, x2: 900, z2: 300, b: 10 }); // doorgaande weg, schuin
  return s;
}

function grondTextuur(straten: Straat[], grootte: number) {
  const px = 2048, schaal = px / grootte;
  return canvasTex(px, px, (c) => {
    const r = seeded(11);
    // Akkers en weilanden in stroken (Drents landschap) rondom het dorp.
    for (let i = 0; i < 260; i++) {
      const x = r() * px, y = r() * px, w = 60 + r() * 220, h = 20 + r() * 90;
      const groen = r() > 0.35;
      c.fillStyle = groen ? `hsl(${88 + r() * 20} ${28 + r() * 14}% ${30 + r() * 10}%)` : `hsl(${38 + r() * 10} ${30 + r() * 10}% ${44 + r() * 10}%)`;
      c.save(); c.translate(x, y); c.rotate((r() - 0.5) * 0.3); c.fillRect(-w / 2, -h / 2, w, h); c.restore();
    }
    // Bebouwde kom: tuinen.
    const kom = 560 * schaal;
    c.fillStyle = 'hsl(95 26% 34%)';
    c.beginPath(); c.ellipse(px / 2, px / 2, kom, kom * 0.92, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * kom;
      c.fillStyle = `hsla(${90 + r() * 30} 30% ${26 + r() * 14}% / 0.6)`;
      c.fillRect(px / 2 + Math.cos(a) * d, px / 2 + Math.sin(a) * d, 6 + r() * 10, 6 + r() * 10);
    }
    // Kanaal.
    c.strokeStyle = 'hsl(205 30% 32%)'; c.lineWidth = 16 * schaal;
    c.beginPath(); c.moveTo(0, px * 0.82); c.bezierCurveTo(px * 0.3, px * 0.78, px * 0.6, px * 0.9, px, px * 0.86); c.stroke();
    // Straten.
    for (const st of straten) {
      c.strokeStyle = 'hsl(220 6% 30%)'; c.lineWidth = st.b * schaal; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(px / 2 + st.x1 * schaal, px / 2 + st.z1 * schaal);
      c.lineTo(px / 2 + st.x2 * schaal, px / 2 + st.z2 * schaal);
      c.stroke();
    }
  });
}

function dakGeometrie(): THREE.BufferGeometry {
  // Eenheidsprisma: grondvlak 1x1, nok langs x, hoogte 1.
  const v = new Float32Array([
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function bouwDorp(scene: THREE.Scene, straten: Straat[], vrij: (x: number, z: number) => boolean) {
  const r = seeded(42);
  const plekken: { x: number; z: number; b: number; d: number; h: number; dak: number; rot: boolean; plat: boolean }[] = [];
  for (const st of straten) {
    const dx = st.x2 - st.x1, dz = st.z2 - st.z1, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    for (let t = 10; t < len - 10; t += 13 + r() * 6) {
      for (const kant of [-1, 1]) {
        if (r() < 0.18) continue;
        const off = st.b / 2 + 9 + r() * 4;
        const x = st.x1 + ux * t - uz * off * kant, z = st.z1 + uz * t + ux * off * kant;
        if (Math.hypot(x, z) > 540 || !vrij(x, z)) continue;
        const plat = r() < 0.12;
        plekken.push({ x, z, b: 8 + r() * 4, d: 8 + r() * 3, h: 2.8 + r() * 0.8 + (plat ? 3 : 0), dak: plat ? 0 : 3.5 + r() * 2, rot: Math.abs(ux) < Math.abs(uz), plat });
      }
    }
  }
  const romp = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), plekken.length);
  const daken = new THREE.InstancedMesh(dakGeometrie(), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), plekken.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), kleur = new THREE.Color();
  plekken.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot ? Math.PI / 2 : 0);
    m.compose(new THREE.Vector3(p.x, p.h / 2, p.z), q, new THREE.Vector3(p.b, p.h, p.d));
    romp.setMatrixAt(i, m);
    romp.setColorAt(i, kleur.setHSL(0.05 + r() * 0.04, 0.32, 0.36 + r() * 0.12));
    m.compose(new THREE.Vector3(p.x, p.h, p.z), q, new THREE.Vector3(p.b + 0.6, p.dak || 0.01, p.d + 0.6));
    daken.setMatrixAt(i, m);
    const rood = r() < 0.4;
    daken.setColorAt(i, rood ? kleur.setHSL(0.03, 0.42, 0.33) : kleur.setHSL(0.6, 0.05, 0.22 + r() * 0.08));
  });
  romp.receiveShadow = daken.receiveShadow = true;
  scene.add(romp, daken);

  const bomen: THREE.Vector3[] = [];
  for (let i = 0; i < 700; i++) {
    const a = r() * Math.PI * 2, d = 30 + Math.sqrt(r()) * 560;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (vrij(x, z)) bomen.push(new THREE.Vector3(x, 0, z));
  }
  const kroon = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), bomen.length);
  bomen.forEach((b, i) => {
    const s = 2.5 + r() * 3;
    m.compose(new THREE.Vector3(b.x, s * 1.6, b.z), q.identity(), new THREE.Vector3(s, s * 1.15, s));
    kroon.setMatrixAt(i, m);
    kroon.setColorAt(i, kleur.setHSL(0.24 + r() * 0.06, 0.38, 0.22 + r() * 0.1));
  });
  scene.add(kroon);
}

/* ---------- Gedetailleerde gebouwen rond de woning ---------- */

function bouwHuis(g: Gebouw, muur: THREE.Material, dak: THREE.Material): THREE.Group {
  const groep = new THREE.Group();
  const romp = new THREE.Mesh(new THREE.BoxGeometry(g.breedte, g.gootHoogte, g.diepte), muur);
  romp.position.y = g.gootHoogte / 2;
  const dakHoogte = g.nokHoogte - g.gootHoogte;
  if (dakHoogte < 0.5) {
    const plat = new THREE.Mesh(new THREE.BoxGeometry(g.breedte + 0.2, 0.25, g.diepte + 0.2), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }));
    plat.position.y = g.gootHoogte + 0.12;
    groep.add(romp, plat);
  } else {
    // Overstek langs de dakhelling, zodat het dakvlak exact door de gootlijn loopt.
    const d = new THREE.Mesh(dakGeometrie(), dak);
    const o = 0.35;
    const halfDwars = (g.nokRichting === 'x' ? g.diepte : g.breedte) / 2;
    const tan = dakHoogte / halfDwars;
    const lang = (g.nokRichting === 'x' ? g.breedte : g.diepte) + o * 2;
    if (g.nokRichting === 'x') d.scale.set(lang, dakHoogte + o * tan, (halfDwars + o) * 2);
    else { d.rotation.y = Math.PI / 2; d.scale.set(lang, dakHoogte + o * tan, (halfDwars + o) * 2); }
    d.position.y = g.gootHoogte - o * tan;
    groep.add(romp, d);
  }
  groep.position.set(g.midden.x, 0, g.midden.z);
  groep.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return groep;
}

/* ---------- Hemel ---------- */

function maakHemel() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      boven: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      zonKleur: { value: new THREE.Color() }, zonRichting: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: 'varying vec3 vR; void main(){ vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 boven; uniform vec3 horizon; uniform vec3 zonKleur; uniform vec3 zonRichting; varying vec3 vR;
      void main(){ float h = clamp(vR.y, 0.0, 1.0); vec3 c = mix(horizon, boven, pow(h, 0.55));
      float g = max(dot(normalize(vR), normalize(zonRichting)), 0.0);
      c += zonKleur * (pow(g, 900.0) * 3.0 + pow(g, 12.0) * 0.35);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
}

/* ---------- Scene ---------- */

export function maakScene(o: SceneOpties): SceneApi {
  const { model } = o;
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !o.sober, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, o.sober ? 1 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Zachte omgevingsreflectie, zodat panelen glas en geen zwart vlak lijken.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 6000);
  const hemel = maakHemel();
  scene.add(hemel);

  const hemiLicht = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  const zon = new THREE.DirectionalLight(0xffffff, 3);
  zon.castShadow = true;
  zon.shadow.mapSize.set(o.sober ? 1024 : 2048, o.sober ? 1024 : 2048);
  Object.assign(zon.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 260 });
  zon.shadow.bias = -0.0004;
  zon.shadow.normalBias = 0.03;
  scene.add(hemiLicht, zon, zon.target);

  // Grond.
  const straten = maakStraten();
  const grond = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: grondTextuur(straten, 2400), roughness: 1 }));
  grond.rotation.x = -Math.PI / 2;
  grond.receiveShadow = true;
  scene.add(grond);

  // Kavel van de woning: gras, oprit, terras, stoep.
  const kavel = canvasTex(1024, 1024, (c) => {
    const r = seeded(5);
    c.fillStyle = '#5d7a3e'; c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `hsla(${85 + r() * 25} 35% ${28 + r() * 16}% / 0.5)`; c.fillRect(r() * 1024, r() * 1024, 2, 3); }
    const s = 1024 / 70; const X = (x: number) => 512 + x * s, Z = (z: number) => 512 + z * s;
    c.fillStyle = '#9b958b'; c.fillRect(X(-35), Z(16.5), 70 * s, 7 * s); // straat
    c.fillStyle = '#4a4d52'; c.fillRect(X(-35), Z(17.2), 70 * s, 5.6 * s);
    c.fillStyle = '#b9b2a6'; c.fillRect(X(6.6), Z(4.8), 3.6 * s, 12 * s); // oprit
    c.fillStyle = '#c9c1b2'; c.fillRect(X(-4), Z(4.3), 7 * s, 2.4 * s); // pad en terras
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let x = -4; x < 3; x += 0.6) { c.beginPath(); c.moveTo(X(x), Z(4.3)); c.lineTo(X(x), Z(6.7)); c.stroke(); }
    c.fillStyle = '#3f5a2c';
    for (let x = -30; x < 30; x += 1.2) c.fillRect(X(x), Z(15.2), 1.0 * s, 0.9 * s); // haag
  });
  const tuin = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({ map: kavel, roughness: 1 }));
  tuin.rotation.x = -Math.PI / 2; tuin.position.y = 0.02; tuin.receiveShadow = true;
  scene.add(tuin);

  bouwDorp(scene, straten, (x, z) => Math.abs(x) > 34 || Math.abs(z) > 40);

  // Omliggende gebouwen en bomen (schaduwwerpers uit het RoofModel).
  const buurMuur = new THREE.MeshStandardMaterial({ map: baksteen(), roughness: 0.95 });
  (buurMuur.map as THREE.Texture).repeat.set(2, 1);
  const buurDak = new THREE.MeshStandardMaterial({ color: 0x8a4a36, roughness: 0.8, side: THREE.DoubleSide });
  for (const g of model.omgeving.gebouwen) scene.add(bouwHuis(g, buurMuur, buurDak));
  for (const b of model.omgeving.bomen) {
    const stam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, b.hoogte - b.kroonStraal * 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }));
    stam.position.set(b.positie.x, (b.hoogte - b.kroonStraal * 0.6) / 2, b.positie.z);
    stam.castShadow = true;
    scene.add(stam);
    // Kroon als losse trosjes: organischer dan één bol.
    const r = seeded(b.id.length * 97);
    const kroonGeo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 7; i++) {
      const s = b.kroonStraal * (0.5 + r() * 0.25);
      const a = r() * Math.PI * 2, d = b.kroonStraal * 0.45 * Math.sqrt(r());
      const blad = new THREE.Mesh(kroonGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.24 + r() * 0.05, 0.42, 0.22 + r() * 0.08), roughness: 0.95 }));
      blad.position.set(b.positie.x + Math.cos(a) * d, b.hoogte - b.kroonStraal + (r() - 0.35) * b.kroonStraal * 0.8, b.positie.z + Math.sin(a) * d);
      blad.scale.set(s, s * 0.9, s);
      blad.castShadow = true; blad.receiveShadow = true;
      scene.add(blad);
    }
  }

  // De woning zelf.
  const w = model.woning;
  const muurTex = baksteen(); muurTex.repeat.set(3, 1);
  const huis = bouwHuis(w, new THREE.MeshStandardMaterial({ map: muurTex, roughness: 0.92 }), new THREE.MeshStandardMaterial({ map: (() => { const t = dakpannen(); t.repeat.set(4, 2); return t; })(), roughness: 0.75, side: THREE.DoubleSide }));
  scene.add(huis);
  const glas = new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.15, metalness: 0.4 });
  const kozijn = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.6 });
  const raam = (x: number, y: number, b: number, h: number, z: number) => {
    const k = new THREE.Mesh(new THREE.BoxGeometry(b + 0.16, h + 0.16, 0.08), kozijn);
    const g = new THREE.Mesh(new THREE.BoxGeometry(b, h, 0.1), glas);
    k.position.set(x, y, z); g.position.set(x, y, z + 0.02);
    scene.add(k, g);
  };
  const voor = w.midden.z + w.diepte / 2 + 0.02;
  raam(-3, 1.45, 2.2, 1.5, voor); raam(0.9, 1.1, 1.0, 2.2, voor); raam(3.2, 1.45, 1.6, 1.5, voor);

  // Panelen op het zuidvlak.
  const zuid = model.dakvlakken[0];
  const t = (zuid.helling * Math.PI) / 180;
  const vlakGroep = new THREE.Group();
  vlakGroep.position.set(w.midden.x, w.gootHoogte, w.midden.z + w.diepte / 2);
  vlakGroep.rotation.x = -(Math.PI / 2 - t);
  // In vlakGroep: x langs de nok, y omhoog langs het dak (v), z = normaal.
  scene.add(vlakGroep);

  const celTex = zonnecellen();
  const paneelMat = new THREE.MeshPhysicalMaterial({ map: celTex, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const randMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.4, metalness: 0.6 });
  const leegMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
  const leegRandMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
  const paneelGeo = new THREE.BoxGeometry(o.paneel.breedte, o.paneel.hoogte, 0.035);
  const randGeo = new THREE.BoxGeometry(o.paneel.breedte + 0.02, o.paneel.hoogte + 0.02, 0.03);

  interface PaneelObj { plek: Plek; groep: THREE.Group; doel: number; zichtbaar: number; leeg: THREE.Mesh; lijn: THREE.LineSegments }
  const panelen: PaneelObj[] = [];
  const klikbaar: THREE.Object3D[] = [];
  for (const p of o.plekken) {
    const g = new THREE.Group();
    const rand = new THREE.Mesh(randGeo, randMat);
    const vlak = new THREE.Mesh(paneelGeo, paneelMat);
    vlak.position.z = 0.012;
    rand.castShadow = true; vlak.receiveShadow = true;
    g.add(rand, vlak);
    g.position.set(p.u, p.v, 0.14);
    g.visible = false;
    const leeg = new THREE.Mesh(new THREE.PlaneGeometry(o.paneel.breedte, o.paneel.hoogte), leegMat.clone());
    leeg.position.set(p.u, p.v, 0.1);
    const lijn = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(o.paneel.breedte - 0.04, o.paneel.hoogte - 0.04)), leegRandMat.clone());
    lijn.position.copy(leeg.position);
    leeg.userData.id = p.id; vlak.userData.id = p.id; rand.userData.id = p.id;
    vlakGroep.add(g, leeg, lijn);
    klikbaar.push(leeg, vlak, rand);
    panelen.push({ plek: p, groep: g, doel: 0, zichtbaar: 0, leeg, lijn });
  }

  // Warmtekaart over het zuidvlak (en een zachtere over het noordvlak voor contrast).
  const nv = o.raster.length, nu = o.raster[0].length;
  const warmteTex = canvasTex(nu * 8, nv * 8, (c) => {
    const kleur = (x: number) => {
      // Sequentieel: diep paars -> rood -> amber -> lichtgeel.
      const stops: [number, number[]][] = [[0.55, [58, 28, 98]], [0.75, [170, 45, 70]], [0.88, [232, 128, 34]], [1, [255, 226, 120]]];
      let a = stops[0], b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) if (x >= stops[i][0] && x <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
      const f = Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0] || 1)));
      return a[1].map((v, i) => Math.round(v + (b[1][i] - v) * f));
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const [r, g, b] = kleur(o.raster[j][i]);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillRect(i * 8, (nv - 1 - j) * 8, 8, 8);
    }
  });
  warmteTex.magFilter = THREE.LinearFilter;
  const warmte = new THREE.Mesh(new THREE.PlaneGeometry(zuid.breedte, zuid.diepte), new THREE.MeshBasicMaterial({ map: warmteTex, transparent: true, opacity: 0, depthWrite: false }));
  warmte.position.set(0, zuid.diepte / 2, 0.06);
  warmte.renderOrder = 2;
  vlakGroep.add(warmte);
  let warmteDoel = 0;

  // Camera en besturing.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.minDistance = 14; controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, 4, 0);
  const eind = new THREE.Vector3(5, 17, 29);
  const start = new THREE.Vector3(-40, 1100, 650);
  camera.position.copy(o.sober ? eind : start);
  camera.lookAt(controls.target);

  // Thema's.
  let thema: Thema = o.thema;
  let zonData = { dag: 172, uur: 17 };
  function pasLichtToe() {
    const z = zonstand(model.breedtegraad, model.lengtegraad, zonData.dag, klokNaarUtc(zonData.dag, zonData.uur));
    const v = zonVector(z);
    const boven = Math.max(0, Math.sin((z.hoogte * Math.PI) / 180));
    zon.position.set(v.x * 120, Math.max(v.y, 0.02) * 120, v.z * 120);
    zon.target.position.set(0, 0, 0);
    const laag = 1 - Math.min(1, z.hoogte / 25);
    const zonKleur = new THREE.Color().setHSL(0.09 - laag * 0.04, 0.9, 0.62 + (1 - laag) * 0.3);
    // Goudenuur: het zonlicht krijgt altijd een warme toon.
    if (thema === 'goudenuur') zonKleur.lerp(new THREE.Color(1, 0.66, 0.36), 0.5);
    zon.color.copy(zonKleur);
    zon.intensity = z.hoogte > 0 ? 0.6 + boven * 3.2 : 0;
    const u = hemel.material.uniforms;
    u.zonRichting.value.set(v.x, v.y, v.z);
    u.zonKleur.value.copy(zonKleur);
    if (thema === 'goudenuur') {
      const dag = Math.min(1, Math.max(0, (z.hoogte + 4) / 30));
      u.boven.value.setRGB(0.04 + dag * 0.14, 0.06 + dag * 0.2, 0.12 + dag * 0.34);
      u.horizon.value.setRGB(0.55 + dag * 0.25, 0.32 + dag * 0.35, 0.22 + dag * 0.4);
      hemiLicht.color.setRGB(0.55 + dag * 0.3, 0.55 + dag * 0.35, 0.65 + dag * 0.3);
      hemiLicht.groundColor.setRGB(0.22, 0.18, 0.12);
      hemiLicht.intensity = 0.3 + dag * 0.45;
      renderer.toneMappingExposure = 1.0;
    } else {
      const dag = Math.min(1, Math.max(0, (z.hoogte + 4) / 22));
      u.boven.value.setRGB(0.18 + dag * 0.2, 0.38 + dag * 0.25, 0.62 + dag * 0.3);
      u.horizon.value.setRGB(0.72 + dag * 0.2, 0.74 + dag * 0.2, 0.78 + dag * 0.18);
      hemiLicht.color.setRGB(0.85, 0.9, 1);
      hemiLicht.groundColor.setRGB(0.32, 0.3, 0.24);
      hemiLicht.intensity = 0.55 + dag * 0.75;
      renderer.toneMappingExposure = 1.05;
    }
    scene.fog = new THREE.Fog(u.horizon.value.clone(), 250, 1900);
  }
  pasLichtToe();

  // Renderlus.
  let vlucht: { van: THREE.Vector3; t0: number; duur: number; klaar: () => void } | null = null;
  let klik: (id: string) => void = () => {};
  let laatste = performance.now();
  let actief = true;
  function frame(nu: number) {
    if (!actief) return;
    const dt = Math.min(0.05, (nu - laatste) / 1000); laatste = nu;
    if (vlucht) {
      const f = Math.min(1, (nu - vlucht.t0) / vlucht.duur);
      const e = ease(f);
      // Eerst recht naar beneden, dan kantelen naar het eindbeeld.
      camera.position.set(
        THREE.MathUtils.lerp(vlucht.van.x, eind.x, e),
        THREE.MathUtils.lerp(vlucht.van.y, eind.y, Math.pow(e, 0.7)),
        THREE.MathUtils.lerp(vlucht.van.z, eind.z, e),
      );
      camera.lookAt(0, 4 * e, 0);
      if (f >= 1) { const k = vlucht.klaar; vlucht = null; controls.enabled = true; k(); }
    } else if (controls.enabled) controls.update();
    for (const p of panelen) {
      p.zichtbaar += (p.doel - p.zichtbaar) * Math.min(1, dt * 9);
      p.groep.visible = p.zichtbaar > 0.01;
      p.groep.position.z = 0.14 + (1 - p.zichtbaar) * 0.9;
      p.groep.scale.setScalar(0.85 + p.zichtbaar * 0.15);
      const leegZicht = (1 - p.doel) * (controls.enabled ? 1 : 0);
      (p.leeg.material as THREE.MeshBasicMaterial).opacity = leegZicht * 0.08;
      (p.lijn.material as THREE.LineBasicMaterial).opacity = leegZicht * 0.55;
    }
    const wm = warmte.material as THREE.MeshBasicMaterial;
    wm.opacity += (warmteDoel - wm.opacity) * Math.min(1, dt * 6);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Klikken op panelen of lege plekken.
  const ray = new THREE.Raycaster();
  let neer = { x: 0, y: 0 };
  renderer.domElement.addEventListener('pointerdown', (e) => { neer = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!controls.enabled || Math.hypot(e.clientX - neer.x, e.clientY - neer.y) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const raak = ray.intersectObjects(klikbaar, false).find((h) => h.object.visible !== false);
    if (raak) klik(raak.object.userData.id);
  });

  const api: SceneApi = {
    flyIn(duurMs) {
      if (o.sober) { controls.enabled = true; return Promise.resolve(); }
      return new Promise((klaar) => { vlucht = { van: start.clone(), t0: performance.now(), duur: duurMs, klaar }; });
    },
    sla() { if (vlucht) vlucht.t0 = -1e9; },
    async toonPanelen(intervalMs, opTel) {
      const actieven = panelen.filter((p) => p.plek.actief).sort((a, b) => a.plek.rij - b.plek.rij || a.plek.kolom - b.plek.kolom);
      let n = 0;
      for (const p of actieven) {
        p.doel = 1; n++; opTel(n);
        if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
    zetPanelen(plekken) {
      const aan = new Set(plekken.filter((p) => p.actief).map((p) => p.id));
      for (const p of panelen) p.doel = aan.has(p.plek.id) ? 1 : 0;
    },
    zetZon(dag, uur) { zonData = { dag, uur }; pasLichtToe(); },
    zetWarmtekaart(aan) { warmteDoel = aan ? 0.82 : 0; },
    zetThema(t) { thema = t; pasLichtToe(); },
    opKlikPlek(cb) { klik = cb; },
    resize() {
      const el = renderer.domElement;
      const b = el.clientWidth, h = el.clientHeight;
      if (!b || !h) return;
      renderer.setSize(b, h, false);
      camera.aspect = b / h;
      // Op smalle schermen iets verder weg zodat het hele dak in beeld blijft.
      camera.fov = b / h < 0.9 ? 50 : 38;
      camera.updateProjectionMatrix();
    },
    dispose() { actief = false; renderer.dispose(); },
  };
  api.resize();
  return api;
}
