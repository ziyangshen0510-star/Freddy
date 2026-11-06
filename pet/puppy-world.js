import * as THREE from './vendor/three.module.js';

// A jointed puppy, rendered locally. No remote models, tracking, or API keys.
const room = document.querySelector('#pet-room');
const mount = document.querySelector('#pet-world');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const easeSwing = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const emit = (name, detail) => room.dispatchEvent(new CustomEvent(`puppy:${name}`, { detail }));

function createWorld() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  // Soft contact shadows keep this light enough for a phone, including older iPhones.
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  camera.position.set(3.2, 2.9, 6.5);
  camera.lookAt(0, 1.06, 0);
  const hemisphere = new THREE.HemisphereLight(0xf9f3df, 0x889880, 2.2);
  scene.add(hemisphere);
  const light = new THREE.DirectionalLight(0xffedd4, 4.1);
  light.position.set(-3, 6, 4);
  light.castShadow = false;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -3;
  light.shadow.camera.right = 3;
  light.shadow.camera.top = 3;
  light.shadow.camera.bottom = -3;
  light.shadow.normalBias = 0.025;
  light.shadow.bias = -0.0003;
  light.shadow.radius = 4;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xc7dbe0, 2.0);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const shadowCanvas = document.createElement('canvas');shadowCanvas.width = 128;shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(64, 64, 7, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(28,35,28,.36)');gradient.addColorStop(.45, 'rgba(28,35,28,.19)');gradient.addColorStop(1, 'rgba(28,35,28,0)');
  shadowContext.fillStyle = gradient;shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.7), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;shadow.position.y = .006;scene.add(shadow);

  const fur = new THREE.MeshStandardMaterial({ color: 0x292d2e, roughness: 0.88 });
  const muzzleMaterial = fur.clone();
  muzzleMaterial.color.set(0x343a39);
  const earMaterial = fur.clone();
  earMaterial.color.set(0x202424);
  const black = new THREE.MeshStandardMaterial({ color: 0x101515, roughness: 0.42 });
  const noseMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0c1113, roughness: 0.24, clearcoat: 0.65, clearcoatRoughness: 0.25 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x654021, roughness: 0.20, clearcoat: 1 });
  const pupil = new THREE.MeshPhysicalMaterial({ color: 0x06090a, roughness: 0.08, clearcoat: 1 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xfffaed });
  const pink = new THREE.MeshPhysicalMaterial({ color: 0xc88683, roughness: 0.47, clearcoat: 0.25 });
  const scarf = new THREE.MeshStandardMaterial({ color: 0xa2b797, roughness: 1, side: THREE.DoubleSide });
  const scarfLight = new THREE.MeshStandardMaterial({ color: 0xb8c8a7, roughness: 1, side: THREE.DoubleSide });

  const sphere = new THREE.SphereGeometry(1, 24, 18);
  const capsule = new THREE.CapsuleGeometry(1, 1, 8, 16);
  function ellipsoid(parent, material, position, scale, part = 'body') {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    parent.add(mesh);
    return mesh;
  }
  function bone(parent, material, length, radius) {
    const geometry = capsule.clone();
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i += 1) {
      const taper = .79 + .27 * (vertices.getY(i) / 3 + .5);
      vertices.setX(i, vertices.getX(i) * taper);
      vertices.setZ(i, vertices.getZ(i) * taper);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(radius, length / 3, radius);
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    mesh.userData.part = 'body';
    parent.add(mesh);
    return mesh;
  }

  // Fine short strands are instanced rather than thousands of individual meshes.
  let randomSeed = 3821;
  function random() { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; }
  const hairGeometry = new THREE.ConeGeometry(0.003, 0.026, 3);
  const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x353a39, roughness: 1 });
  function coat(parent, position, radii, count) {
    const hairs = new THREE.InstancedMesh(hairGeometry, hairMaterial, count);
    const dummy = new THREE.Object3D();
    const up = V(0, 1, 0);
    for (let i = 0; i < count; i += 1) {
      const y = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      const point = V(r * Math.cos(angle), y, r * Math.sin(angle));
      const normal = V(point.x / radii.x, point.y / radii.y, point.z / radii.z).normalize();
      dummy.position.copy(point.multiply(radii).add(position));
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.scale.setScalar(0.65 + random() * 0.55);
      dummy.updateMatrix();
      hairs.setMatrixAt(i, dummy.matrix);
    }
    parent.add(hairs);
    return hairs;
  }

  const dog = new THREE.Group();
  scene.add(dog);
  const body = new THREE.Group();
  dog.add(body);
  ellipsoid(body, fur, V(), V(.43, .46, .74));
  coat(body, V(), V(.43, .46, .74), 1000);
  const chest = ellipsoid(dog, fur, V(0, 1.02, .34), V(.38, .47, .40));
  const neck = ellipsoid(dog, fur, V(0, 1.40, .49), V(.29, .38, .29));
  const head = new THREE.Group();
  head.position.set(0, 1.65, .62);
  dog.add(head);
  ellipsoid(head, fur, V(0, .02, 0), V(.445, .40, .455), 'head');
  coat(head, V(0, .02, 0), V(.445, .40, .455), 850);
  // Cheeks merge into a wide Labrador muzzle instead of a flat face.
  ellipsoid(head, muzzleMaterial, V(-.13, -.16, .33), V(.225, .16, .255), 'chin');
  ellipsoid(head, muzzleMaterial, V(.13, -.16, .33), V(.225, .16, .255), 'chin');
  ellipsoid(head, fur, V(0, -.08, .30), V(.26, .24, .24), 'head');
  ellipsoid(head, noseMaterial, V(0, -.12, .555), V(.165, .105, .105), 'nose');
  ellipsoid(head, black, V(-.084, -.135, .639), V(.027, .014, .009), 'nose');
  ellipsoid(head, black, V(.084, -.135, .639), V(.027, .014, .009), 'nose');
  const jaw = new THREE.Group();
  jaw.position.set(0, -.20, .27);
  head.add(jaw);
  ellipsoid(jaw, black, V(0, -.058, .11), V(.23, .055, .205), 'chin');
  ellipsoid(jaw, muzzleMaterial, V(0, -.10, .08), V(.22, .06, .17), 'chin');
  const tongue = ellipsoid(jaw, pink, V(0, -.066, .24), V(.095, .027, .145), 'chin');
  const tongueLine = new THREE.Mesh(new THREE.CylinderGeometry(.002, .002, .11, 6), new THREE.MeshBasicMaterial({ color: 0xad716e }));
  tongueLine.rotation.x = Math.PI / 2;
  tongueLine.position.set(0, -.037, .27);
  jaw.add(tongueLine);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * .218, .085, .401);
    eye.rotation.y = side * .16;
    head.add(eye);
    ellipsoid(eye, black, V(), V(.104, .105, .062), 'head');
    ellipsoid(eye, iris, V(0, .002, .040), V(.080, .087, .035), 'head');
    ellipsoid(eye, pupil, V(-side * .008, .005, .067), V(.046, .057, .018), 'head');
    ellipsoid(eye, glint, V(-.021, .033, .079), V(.019, .019, .006), 'head');
    ellipsoid(eye, glint, V(.024, -.022, .082), V(.007, .007, .003), 'head');
    ellipsoid(head, fur, V(side * .23, .215, .315), V(.105, .032, .055), 'head');
    eyes.push(eye);
  }

  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * .36, .20, -.015);
    head.add(ear);
    const leaf = ellipsoid(ear, earMaterial, V(side * .055, -.29, .01), V(.20, .40, .095), 'ear');
    leaf.rotation.z = side * -.12;
    coat(ear, V(side * .055, -.29, .01), V(.20, .39, .095), 140);
    ears.push(ear);
  }

  const collar = new THREE.Mesh(new THREE.TorusGeometry(.285, .055, 8, 40), scarf);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.38, .49);
  dog.add(collar);
  const bibShape = new THREE.Shape();
  bibShape.moveTo(-.28, .03);
  bibShape.quadraticCurveTo(0, -.05, .28, .03);
  bibShape.quadraticCurveTo(.22, -.19, .025, -.43);
  bibShape.quadraticCurveTo(-.20, -.24, -.28, .03);
  const bib = new THREE.Mesh(new THREE.ShapeGeometry(bibShape, 24), scarfLight);
  bib.position.set(0, 1.34, .785);
  bib.rotation.x = -.14;
  bib.castShadow = true;
  dog.add(bib);
  const knot = ellipsoid(dog, scarf, V(.29, 1.38, .47), V(.09, .07, .08));
  const scarfEnd = ellipsoid(dog, scarfLight, V(.37, 1.29, .46), V(.07, .18, .035));
  scarfEnd.rotation.z = .5;

  const legs = [];
  for (const front of [true, false]) for (const side of [-1, 1]) {
    const upper = new THREE.Group();
    dog.add(upper);
    bone(upper, fur, .43, front ? .12 : .15);
    ellipsoid(upper, fur, V(0, -.09, -.015), front ? V(.17, .23, .18) : V(.22, .27, .24));
    ellipsoid(upper, fur, V(0, -.37, 0), V(.10, .115, .10));
    const lower = new THREE.Group();
    lower.position.y = -.43;
    upper.add(lower);
    bone(lower, fur, .42, .088);
    const paw = new THREE.Group();
    paw.position.y = -.42;
    lower.add(paw);
    ellipsoid(paw, fur, V(0, .015, .055), V(.155, .095, .215));
    for (const toe of [-1, 0, 1]) ellipsoid(paw, muzzleMaterial, V(toe * .068, -.005, .18), V(.047, .055, .071));
    legs.push({ upper, lower, paw, side, front });
  }

  const tail = [];
  let tailParent = dog;
  for (let i = 0; i < 6; i += 1) {
    const joint = new THREE.Group();
    joint.position.copy(i === 0 ? V(0, 1.11, -.72) : V(0, .035, -.18));
    tailParent.add(joint);
    const segment = new THREE.Mesh(new THREE.CapsuleGeometry(.075 * (1 - i * .13), .14, 6, 10), fur);
    segment.rotation.x = Math.PI / 2;
    segment.position.z = -.09;
    segment.castShadow = true;
    joint.add(segment);
    tail.push(joint);
    tailParent = joint;
  }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(.105, 24, 16), new THREE.MeshStandardMaterial({ color: 0xdcb76c, roughness: .88 }));
  ball.castShadow = true;
  ball.position.set(1.12, .115, .62);
  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0xffedc0, roughness: 1 });
  for (const angle of [0, Math.PI / 2]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.106, .003, 4, 40), seamMaterial);
    seam.rotation.y = angle;
    ball.add(seam);
  }
  scene.add(ball);
  const bowl = new THREE.Group();
  bowl.position.set(-1.15, .02, .63);
  const bowlMesh = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(.22, 0), new THREE.Vector2(.28, .07), new THREE.Vector2(.30, .14), new THREE.Vector2(.25, .16), new THREE.Vector2(.21, .06), new THREE.Vector2(0, .06)], 40), new THREE.MeshStandardMaterial({ color: 0xcaa889, roughness: .38 }));
  bowlMesh.castShadow = true;
  bowlMesh.receiveShadow = true;
  bowl.add(bowlMesh);
  const kibble = [];
  const kibbleMaterial = new THREE.MeshStandardMaterial({ color: 0x8b613e, roughness: 1 });
  for (let i = 0; i < 14; i += 1) {
    const pellet = new THREE.Mesh(new THREE.DodecahedronGeometry(.038), kibbleMaterial);
    const angle = i * 2.4;
    const radius = .06 + (i % 3) * .045;
    pellet.position.set(Math.cos(angle) * radius, .10, Math.sin(angle) * radius);
    bowl.add(pellet);kibble.push(pellet);
  }
  scene.add(bowl);

  let action = null;
  let pending = null;
  let elapsed = 0;
  let phase = 0;
  let sleepTarget = false;
  let sleepBlend = 0;
  let sitBlend = 1;
  let pointer = { x: 0, y: 0, active: false };
  let nextBlink = 2;
  let blinkStart = -10;
  let nextWander = 4.5;
  let draggingBall = false;
  let grab = null;
  let activeFrame;
  let previousTime = 0;
  let previousDraw = 0;
  let visible = true;
  let disposed = false;
  let currentYaw = .32;
  let frameDt = 1 / 30;
  let turnTarget = 0;
  let travelSpeed = 0;
  let gaitBlend = 0;
  let runBlend = 0;
  let tailPhase = 0;
  let wagFrequency = 7;
  let wagAmplitude = .25;
  let bodyLean = 0;
  let roomNight = 0;
  let roomPeach = 0;
  const daylightColor = new THREE.Color(0xffedd4);
  const moonlightColor = new THREE.Color(0xc7d7ee);
  const sunsetColor = new THREE.Color(0xffc8a0);
  const pose = { crouch: 0, nuzzle: 0, feeding: 0, excitement: .3 };
  const previousPosition = V();
  const home = V(0, 0, 0);
  const ballHome = V(1.12, .115, .62);
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(V(0, 1, 0), -.15);
  const stageLabel = document.querySelector('#interaction-state');
  const proxies = [document.querySelector('#food-bowl'), document.querySelector('#toy-ball')];

  function stepAt(at, name, callback) {
    if (action && action.time >= at && !action.events.has(name)) { action.events.add(name); callback(); }
  }
  function announce(text) { emit('phase', { text }); }
  function finish(completed = true) {
    if (!action) return;
    const resolve = pending;
    action = null;pending = null;nextWander = elapsed + 8 + random() * 6;
    if (resolve) resolve(completed);
    if (stageLabel) stageLabel.textContent = sleepTarget ? '小狗在做梦' : '会动的小黑 · 可以摸摸它';
  }
  function begin(kind, options = {}) {
    finish(false);
    draggingBall = false;
    action = { kind, time: 0, start: dog.position.clone(), yaw: currentYaw, events: new Set(), ...options };
    if (kind === 'feed') {
      action.target = V(bowl.position.x, 0, bowl.position.z - 1.04);
      kibble.forEach((pellet) => { pellet.visible = true; });
    }
    if (kind === 'play') {
      const point = options.target || V(.75 + random() * .6, 0, -.50 - random() * .40);
      action.target = V(clamp(point.x, -1.3, 1.3), .115, clamp(point.z, -.9, .8));
      action.ballStart = ball.position.clone();
      const direction = action.target.clone().sub(dog.position);direction.y = 0;direction.normalize();
      action.fetchPoint = action.target.clone().addScaledVector(direction, -.85);action.fetchPoint.y = 0;
    }
    if (stageLabel) stageLabel.textContent = ({ stroke: '小黑在蹭蹭你', feed: '小黑正在吃东西', play: '小黑去追球啦' })[kind] || '小黑在散步';
    return new Promise((resolve) => { pending = resolve; });
  }
  function walk(from, to, u) {
    dog.position.lerpVectors(from, to, smooth(clamp((u - .06) / .94, 0, 1)));
    const delta = to.clone().sub(from);
    if (delta.lengthSq() > .005) {
      const difference = wrapAngle(Math.atan2(delta.x, delta.z) - currentYaw);
      turnTarget = difference;
      currentYaw += clamp(difference * (1 - Math.exp(-9 * frameDt)), -3.8 * frameDt, 3.8 * frameDt);
    }
  }
  function moveLeg(leg, stride, lift, crouch, sleeping) {
    const hipY = leg.front ? .875 - crouch * .25 - sleeping * .485 : .88 - sitBlend * .25 - sleeping * .42;
    leg.upper.position.set(leg.side * (leg.front ? .285 : .32), hipY, leg.front ? .41 : -.48);
    const footZ = (leg.front ? .49 + sleeping * .60 : -.49 + sitBlend * .15) + stride;
    const footY = .085 + lift;
    const dy = footY - hipY;
    const dz = footZ - leg.upper.position.z;
    const distance = clamp(Math.hypot(dy, dz), .12, .849);
    const bend = Math.acos(clamp((.43 ** 2 + distance ** 2 - .42 ** 2) / (2 * .43 * distance), -1, 1));
    const knee = Math.PI - Math.acos(clamp((.43 ** 2 + .42 ** 2 - distance ** 2) / (2 * .43 * .42), -1, 1));
    const sign = leg.front ? 1 : -1;
    leg.upper.rotation.x = -Math.atan2(dz, -dy) + sign * bend;
    leg.lower.rotation.x = -sign * knee;
    leg.paw.rotation.x = -leg.upper.rotation.x - leg.lower.rotation.x;
  }
  function projectProxy(mesh, proxy) {
    if (!proxy || grab?.element === proxy) return;
    const position = mesh.getWorldPosition(V()).project(camera);
    proxy.style.left = `${(position.x + 1) * 50}%`;
    proxy.style.top = `${(1 - position.y) * 50}%`;
  }

  function update(dt) {
    frameDt = dt;
    turnTarget = 0;
    previousPosition.copy(dog.position);
    elapsed += dt;
    if (action) action.time += dt;
    sleepBlend = THREE.MathUtils.damp(sleepBlend, sleepTarget ? 1 : 0, 3, dt);
    let gait = 0;
    let crouch = 0;
    let nuzzle = 0;
    let feeding = 0;
    let carrying = false;
    let excitement = .3;
    let targetSit = 1;
    if (!sleepTarget && action) {
      const t = action.time;
      if (action.kind === 'stroke') {
        nuzzle = Math.sin(Math.min(1, t / 1.4) * Math.PI);
        excitement = 1;
        stepAt(.2, 'happy', () => emit('sound', { kind: 'happy' }));
        if (t > 1.45) finish();
      } else if (action.kind === 'feed') {
        excitement = .45;targetSit = 0;
        if (t < 1.1) { walk(action.start, action.target, t / 1.1);gait = .6; }
        else if (t < 3.8) {
          currentYaw += clamp(wrapAngle(-currentYaw) * (1 - Math.exp(-8 * dt)), -3.8 * dt, 3.8 * dt);
          crouch = smooth((t - 1.1) / .6) * (1 - smooth((t - 3.3) / .5));
          feeding = t > 1.6 && t < 3.2 ? 1 : 0;
          kibble.forEach((pellet, i) => { pellet.visible = i >= Math.floor(Math.max(0, t - 1.6) * 9); });
        } else if (t < 5.0) { walk(action.target, home, (t - 3.8) / 1.2);gait = .5; }
        stepAt(1.15, 'sniff', () => announce('先闻一闻……嗯，是宝宝给的零食！'));
        stepAt(1.65, 'eat', () => { announce('啊呜啊呜……吃得很认真。');emit('sound', { kind: 'crunch' }); });
        stepAt(2.25, 'crunch2', () => emit('sound', { kind: 'crunch' }));
        stepAt(2.85, 'crunch3', () => emit('sound', { kind: 'crunch' }));
        if (t >= 5.05) finish();
      } else if (action.kind === 'play') {
        targetSit = 0;excitement = 1;
        if (t < 1.55) {
          const u = clamp((t - .25) / 1.3, 0, 1);
          ball.position.lerpVectors(action.ballStart, action.target, u);
          ball.position.y += Math.sin(u * Math.PI) * 1.05;
          ball.rotation.x += dt * 7;
        } else if (t < 2.25) {
          ball.position.copy(action.target);
          ball.position.y += Math.abs(Math.sin((t - 1.55) * Math.PI / .35)) * .16 * (1 - (t - 1.55) / .7);
        }
        if (t > .65 && t < 2.1) { walk(action.start, action.fetchPoint, (t - .65) / 1.45);gait = 1; }
        if (t >= 2.1 && t < 2.65) crouch = Math.sin((t - 2.1) / .55 * Math.PI) * .65;
        carrying = t >= 2.45 && t < 4.7;
        if (t >= 2.65 && t < 4.35) { walk(action.fetchPoint, home, (t - 2.65) / 1.7);gait = .85; }
        if (t >= 4.35) currentYaw += clamp(wrapAngle(.32 - currentYaw) * (1 - Math.exp(-8 * dt)), -3.8 * dt, 3.8 * dt);
        if (t >= 4.7) {
          const u = smooth((t - 4.7) / .65);
          const mouth = head.localToWorld(V(0, -.22, .67));
          ball.position.lerpVectors(mouth, ballHome, u);
          ball.position.y += Math.sin(u * Math.PI) * .16;
        }
        stepAt(.28, 'throw', () => { announce('咻——小黑盯住球，跑过去啦！');emit('sound', { kind: 'throw' }); });
        stepAt(1.55, 'bounce', () => emit('sound', { kind: 'bounce' }));
        stepAt(2.48, 'fetch', () => announce('叼到球啦！现在送回宝宝这里。'));
        stepAt(4.72, 'drop', () => emit('sound', { kind: 'bounce' }));
        if (t > 5.4) { ball.position.copy(ballHome);finish(); }
      } else if (action.kind === 'wander') {
        targetSit = 0;
        const target = action.target;
        if (t < 1.9) walk(action.start, target, t / 1.9);
        else if (t < 4.0) walk(target, home, (t - 1.9) / 2.1);
        gait = t < 4 ? .32 : 0;
        if (t > 4.25) finish();
      }
    }
    if (!action && !sleepTarget) {
      currentYaw += clamp(wrapAngle(.32 - currentYaw) * (1 - Math.exp(-4 * dt)), -3.8 * dt, 3.8 * dt);
      if (!reduce.matches && elapsed > nextWander && !grab) {
        nextWander = elapsed + 15 + random() * 9;
        void begin('wander', { target: V((random() - .5) * 1.25, 0, -.2 - random() * .3) });
      }
    }
    const distance = dog.position.distanceTo(previousPosition);
    const speed = distance / Math.max(dt, .001);
    travelSpeed = THREE.MathUtils.damp(travelSpeed, speed, 9, dt);
    gaitBlend = THREE.MathUtils.damp(gaitBlend, reduce.matches ? 0 : clamp(travelSpeed / .85, 0, 1), 10, dt);
    runBlend = THREE.MathUtils.damp(runBlend, smooth((travelSpeed - .65) / .75), 6, dt);
    gait = gaitBlend;
    for (const name of ['crouch', 'nuzzle', 'feeding', 'excitement']) {
      const target = ({ crouch, nuzzle, feeding, excitement })[name];
      pose[name] = THREE.MathUtils.damp(pose[name], target, name === 'feeding' ? 12 : 9, dt);
    }
    crouch = pose.crouch;nuzzle = pose.nuzzle;feeding = pose.feeding;excitement = pose.excitement;
    sitBlend = THREE.MathUtils.damp(sitBlend, targetSit, 5, dt);
    const breath = reduce.matches ? 0 : Math.sin(elapsed * 2.1) * .009;
    phase += reduce.matches ? 0 : distance / .46 * Math.PI * 2;
    const weightShift = Math.sin(phase * 2) * .009 * gait;
    bodyLean = THREE.MathUtils.damp(bodyLean, clamp(-turnTarget * .045, -.10, .10) * gait, 7, dt);
    body.position.set(0, .98 - sitBlend * .08 - sleepBlend * .52 - crouch * .10 + weightShift, -.06);
    body.rotation.x = -sitBlend * .38 + sleepBlend * .38;
    body.rotation.z = bodyLean;
    body.scale.y = 1 + breath;
    chest.position.y = 1.02 - sleepBlend * .57 - crouch * .26 + weightShift;
    neck.position.y = 1.40 - sleepBlend * .78 - crouch * .56;
    head.position.y = 1.65 - sleepBlend * 1.16 - crouch * .79 + weightShift * .65;
    head.position.z = .62 + sleepBlend * .21 + nuzzle * .04;
    const pointerYaw = pointer.active ? pointer.x * .55 : reduce.matches ? 0 : Math.sin(elapsed * .43) * .07;
    head.rotation.y = THREE.MathUtils.damp(head.rotation.y, (pointerYaw - (gait > .1 ? 0 : wrapAngle(currentYaw) * .35) + clamp(turnTarget * .16, -.25, .25)) * (1 - sleepBlend), 6, dt);
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x, crouch * .74 + sleepBlend * .10 + (pointer.active ? pointer.y * .15 : 0) + nuzzle * (action?.zone === 'chin' ? -.25 : -.12), 10, dt);
    head.rotation.z = THREE.MathUtils.damp(head.rotation.z, nuzzle * (action?.zone === 'ear' ? -.20 : .13) + (reduce.matches ? 0 : Math.sin(elapsed * .67) * .025) * (1 - sleepBlend), 10, dt);
    collar.position.y = 1.38 - sleepBlend * .77 - crouch * .49;
    bib.position.y = 1.34 - sleepBlend * .76 - crouch * .47;
    knot.position.y = 1.38 - sleepBlend * .77 - crouch * .49;
    scarfEnd.position.y = 1.29 - sleepBlend * .77 - crouch * .49;
    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      const walkingOffset = [0, .5, .75, .25][i];
      const runningOffset = [0, .5, .5, 0][i];
      const cycle = ((phase / (Math.PI * 2) + mix(walkingOffset, runningOffset, runBlend)) % 1 + 1) % 1;
      const stance = cycle < .62;
      const swing = clamp((cycle - .62) / .38, 0, 1);
      const step = stance ? mix(.16, -.16, cycle / .62) : mix(-.16, .16, easeSwing(swing));
      const lift = stance ? 0 : Math.sin(Math.PI * swing) ** 2 * mix(.085, .13, runBlend);
      moveLeg(leg, step * gait, lift * gait, crouch, sleepBlend);
    }
    if (!reduce.matches && elapsed > nextBlink) { blinkStart = elapsed;nextBlink = elapsed + 2.8 + random() * 3; }
    const blink = clamp(Math.sin(clamp((elapsed - blinkStart) / .24, 0, 1) * Math.PI), 0, 1);
    for (const eye of eyes) eye.scale.y = Math.max(.045, (1 - blink * .95) * (1 - sleepBlend * .96) * (1 - nuzzle * .45));
    const jawTarget = (carrying ? .18 : .075 + (reduce.matches ? 0 : Math.sin(elapsed * 5) * .018)) * (1 - sleepBlend) + feeding * (.05 + Math.max(0, Math.sin(elapsed * 23)) * .16);
    jaw.rotation.x = THREE.MathUtils.damp(jaw.rotation.x, jawTarget, 14, dt);
    tongue.visible = !carrying && sleepBlend < .5;
    tongueLine.visible = tongue.visible;
    tongue.scale.z = .145 * (1 + nuzzle * .35);
    for (let i = 0; i < ears.length; i += 1) {
      const side = i === 0 ? -1 : 1;
      ears[i].rotation.z = THREE.MathUtils.damp(ears[i].rotation.z, side * -.13 + (reduce.matches ? 0 : Math.sin(phase + i * 1.7) * .045 * gait) + nuzzle * side * .09 - bodyLean * .4, 9, dt);
      ears[i].rotation.x = THREE.MathUtils.damp(ears[i].rotation.x, nuzzle * -.08 + (reduce.matches ? 0 : Math.sin(elapsed * 1.3 + i) * .02), 7, dt);
    }
    wagFrequency = THREE.MathUtils.damp(wagFrequency, 5 + excitement * 7, 5, dt);
    wagAmplitude = THREE.MathUtils.damp(wagAmplitude, (.18 + excitement * .25) * (1 - sleepBlend), 6, dt);
    if (!reduce.matches) tailPhase += dt * wagFrequency;
    for (let i = 0; i < tail.length; i += 1) {
      tail[i].rotation.y = reduce.matches ? 0 : Math.sin(tailPhase - i * .35) * wagAmplitude;
      tail[i].rotation.x = mix(.15 + i * .045, i === 0 ? -.42 : 0, sleepBlend);
      if (i > 0) tail[i].position.y = .035 * (1 - sleepBlend);
    }
    tail[0].position.y = body.position.y + .10 * Math.cos(body.rotation.x) + .64 * Math.sin(body.rotation.x);
    tail[0].position.z = body.position.z + .10 * Math.sin(body.rotation.x) - .64 * Math.cos(body.rotation.x);
    dog.rotation.y = currentYaw;
    dog.position.y = 0;
    shadow.position.x = dog.position.x;shadow.position.z = dog.position.z;
    shadow.scale.y = mix(.83, 1, 1 - sitBlend);
    dog.updateMatrixWorld(true);
    if (carrying) {
      action.pickupStart ||= ball.position.clone();
      ball.position.lerpVectors(action.pickupStart, head.localToWorld(V(0, -.22, .68)), smooth((action.time - 2.45) / .24));
      ball.rotation.x += dt * .4;
    }
    if (!action && !draggingBall) ball.position.lerp(ballHome, Math.min(1, dt * 5));
    roomNight = THREE.MathUtils.damp(roomNight, room.dataset.roomTheme === 'night' ? 1 : 0, 4, dt);
    roomPeach = THREE.MathUtils.damp(roomPeach, room.dataset.roomTheme === 'peach' ? 1 : 0, 4, dt);
    hemisphere.intensity = mix(mix(2.2, 1.65, roomNight), 1.55, sleepBlend);
    light.intensity = mix(mix(4.1, 2.4, roomNight), 1.8, sleepBlend);
    light.color.copy(daylightColor).lerp(moonlightColor, roomNight).lerp(sunsetColor, roomPeach * .65);
    projectProxy(ball, proxies[1]);projectProxy(bowl, proxies[0]);
  }

  function resize() {
    const rect = room.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(room);
  resize();
  function frame(time) {
    if (disposed) return;
    if (time - previousDraw < 1000 / 30) { activeFrame = requestAnimationFrame(frame);return; }
    previousDraw = time;
    const dt = previousTime ? Math.min((time - previousTime) / 1000, .05) : .016;
    previousTime = time;
    if (visible && !document.hidden) { update(dt);renderer.render(scene, camera); }
    activeFrame = requestAnimationFrame(frame);
  }
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting;previousTime = 0; });
  observer.observe(room);
  document.addEventListener('visibilitychange', () => { previousTime = 0; });

  function ray(event) {
    const rect = room.getBoundingClientRect();
    const point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(point, camera);
    return point;
  }
  function groundPoint(event) { ray(event);return raycaster.ray.intersectPlane(ground, V()) || ballHome.clone(); }
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    ray(event);
    const hit = raycaster.intersectObject(dog, true).find((item) => item.object.userData.part);
    if (!hit) return;
    grab = { element: renderer.domElement, zone: hit.object.userData.part, lastX: event.clientX, lastY: event.clientY, distance: 0, lastReward: -10, moved: false };
    renderer.domElement.setPointerCapture(event.pointerId);
    emit('pet', { zone: grab.zone });
    grab.lastReward = elapsed;
  });
  renderer.domElement.addEventListener('pointermove', (event) => {
    const rect = room.getBoundingClientRect();
    pointer = { x: clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), y: clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1), active: true };
    if (!grab || grab.element !== renderer.domElement) return;
    grab.distance += Math.hypot(event.clientX - grab.lastX, event.clientY - grab.lastY);
    grab.lastX = event.clientX;grab.lastY = event.clientY;
    if (grab.distance > 25 && elapsed - grab.lastReward > 1.4) { emit('pet', { zone: grab.zone, continuous: true });grab.lastReward = elapsed;grab.distance = 0; }
  });
  function releaseDog() { if (grab?.element === renderer.domElement) grab = null; }
  renderer.domElement.addEventListener('pointerup', releaseDog);
  renderer.domElement.addEventListener('pointercancel', releaseDog);
  renderer.domElement.addEventListener('lostpointercapture', releaseDog);
  renderer.domElement.addEventListener('pointerleave', () => { pointer.active = false; });

  const ballButton = proxies[1];
  ballButton.addEventListener('pointerdown', (event) => {
    if (sleepTarget || event.button !== 0) return;
    event.stopPropagation();
    grab = { element: ballButton, startX: event.clientX, startY: event.clientY, moved: false };
    ballButton.setPointerCapture(event.pointerId);
    draggingBall = true;
  });
  ballButton.addEventListener('pointermove', (event) => {
    if (grab?.element !== ballButton) return;
    grab.moved ||= Math.hypot(event.clientX - grab.startX, event.clientY - grab.startY) > 8;
    if (!grab.moved) return;
    const point = groundPoint(event);
    ball.position.set(clamp(point.x, -1.5, 1.5), .35, clamp(point.z, -.9, 1));
  });
  ballButton.addEventListener('pointerup', (event) => {
    if (grab?.element !== ballButton) return;
    const moved = grab.moved;
    const target = moved ? groundPoint(event) : undefined;
    grab = null;draggingBall = false;
    if (moved) { event.preventDefault();room.lastBallDrag = Date.now();emit('throw', { target }); }
  });
  ballButton.addEventListener('pointercancel', () => { grab = null;draggingBall = false; });

  const controller = {
    perform(kind, options) {
      if (reduce.matches) { emit('sound', { kind: kind === 'feed' ? 'crunch' : 'happy' });return Promise.resolve(true); }
      return begin(kind, options);
    },
    sleep(value) { if (value === sleepTarget) return;finish(false);sleepTarget = value;draggingBall = false;grab = null;nextWander = elapsed + 8;if (stageLabel) stageLabel.textContent = value ? '小狗在做梦' : '会动的小黑 · 可以摸摸它'; },
    cancel() { finish(false);draggingBall = false;ball.position.copy(ballHome); },
    inspect() { return { state: sleepTarget ? 'sleeping' : action?.kind || 'idle', time: elapsed, phase: action?.time || 0, position: dog.position.toArray(), yaw: currentYaw, speed: travelSpeed, gait: gaitBlend, pawHeights: legs.map((leg) => leg.paw.getWorldPosition(V()).y), head: head.rotation.toArray().slice(0, 3), headScreen: head.getWorldPosition(V()).project(camera).toArray(), tail: tail[0].rotation.y, leg: legs[0].upper.rotation.x, ball: ball.position.toArray(), mouth: head.localToWorld(V(0, -.22, .68)).toArray(), eyes: eyes[0].scale.y, framesPaused: !visible || document.hidden, reducedMotion: reduce.matches }; },
  };
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();finish(false);room.classList.remove('has-live-dog');emit('unavailable', {});
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => { room.classList.add('has-live-dog'); });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true;cancelAnimationFrame(activeFrame);finish(false);
    resizeObserver.disconnect();observer.disconnect();renderer.dispose();
  });
  window.littlePuppy = controller;
  room.classList.add('has-live-dog');
  stageLabel.hidden = false;
  activeFrame = requestAnimationFrame(frame);
  emit('ready', controller);
}

try { createWorld(); }
catch (error) {
  // Keep all care actions available on browsers without working WebGL.
  mount.replaceChildren();
  emit('unavailable', {});
  console.warn('The live puppy could not start; the lightweight pet remains available.', error);
}
