import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'https://cdn.skypack.dev/gsap@3.12.5';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02060a, 0.18);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 1.6, 2.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.4;
controls.maxDistance = 5;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

// Lighting
const ambient = new THREE.AmbientLight(0x6ab4ff, 0.55);
scene.add(ambient);
const directional = new THREE.DirectionalLight(0xffffff, 1.1);
directional.position.set(4, 2, 2);
scene.add(directional);

// Atmosphere shell
const atmosphereGeometry = new THREE.SphereGeometry(1.02, 96, 96);
const atmosphereMaterial = new THREE.ShaderMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  uniforms: {
    glowColor: { value: new THREE.Color('#6bf3ff') }
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    uniform vec3 glowColor;
    void main() {
      float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
      gl_FragColor = vec4(glowColor, intensity);
    }
  `
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// Star field
const starGeometry = new THREE.BufferGeometry();
const starCount = 1200;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  const r = 40 + Math.random() * 60;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i + 2] = r * Math.cos(phi);
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0x6bf3ff, size: 0.08, transparent: true, opacity: 0.75 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Earth shader
const textureLoader = new THREE.TextureLoader();
const dayTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-day.jpg');
const nightTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg');
const normalTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-normal.jpg');

const earthUniforms = {
  dayTexture: { value: dayTexture },
  nightTexture: { value: nightTexture },
  normalMap: { value: normalTexture },
  lightDirection: { value: new THREE.Vector3(1, 0, 0) },
};

const earthMaterial = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform sampler2D normalMap;
    uniform vec3 lightDirection;
    varying vec2 vUv;
    varying vec3 vNormal;
    void main() {
      vec3 normalTex = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
      vec3 normal = normalize(vNormal + normalTex * 0.18);
      float light = clamp(dot(normal, normalize(lightDirection)), -1.0, 1.0);
      float mixAmount = smoothstep(-0.2, 0.3, light);
      vec3 dayColor = texture2D(dayTexture, vUv).rgb;
      vec3 nightColor = texture2D(nightTexture, vUv).rgb;
      vec3 color = mix(nightColor * 0.9, dayColor, mixAmount);
      float atmosphere = pow(max(light, 0.0), 5.0);
      color += vec3(0.2, 0.4, 0.6) * atmosphere * 0.5;
      gl_FragColor = vec4(color, 1.0);
    }
  `
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMaterial);
scene.add(earth);

// Flight visuals
const MAX_FLIGHTS = 12000;
const planeGeometry = new THREE.ConeGeometry(0.007, 0.03, 7);
planeGeometry.rotateX(Math.PI / 2);
const planeMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#9ef2ff'),
  emissive: new THREE.Color('#33c5ff'),
  emissiveIntensity: 1.6,
  roughness: 0.35,
  metalness: 0.2,
  transparent: true,
  opacity: 0.95,
});
const planes = new THREE.InstancedMesh(planeGeometry, planeMaterial, MAX_FLIGHTS);
planes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(planes);

const flightIndexToIcao = new Array(MAX_FLIGHTS).fill(null);
const flightHistory = new Map();
let lastStates = [];
let activeCount = 0;

// Selection & trail
const trailMaterial = new THREE.LineBasicMaterial({ color: 0x5cd4ff, transparent: true, opacity: 0.9 });
let trailLine = null;
let selectedFlight = null;
const markerGeometry = new THREE.SphereGeometry(0.01, 24, 24);
const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, emissive: 0x77e1ff });
const selectionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
selectionMarker.visible = false;
scene.add(selectionMarker);

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(planes);
  if (intersects.length > 0) {
    const { instanceId } = intersects[0];
    const icao = flightIndexToIcao[instanceId];
    if (icao && flightHistory.has(icao)) {
      focusFlight(icao);
    }
  }
});

// Utility conversions
const EARTH_RADIUS = 1;
const ALTITUDE_SCALE = 1 / 400000; // meters -> scene units

function latLngToVector(lat, lon, altitude = 0) {
  const radius = EARTH_RADIUS + Math.max(altitude, 0) * ALTITUDE_SCALE;
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function headingToQuaternion(position, headingDeg) {
  const up = position.clone().normalize();
  const heading = THREE.MathUtils.degToRad(headingDeg || 0);
  const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
  const north = up.clone().cross(east).normalize();
  const direction = east.multiplyScalar(Math.sin(heading)).add(north.multiplyScalar(Math.cos(heading))).normalize();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  return quaternion;
}

function formatSpeed(ms) {
  if (!ms && ms !== 0) return '–';
  const knots = ms * 1.94384;
  return `${knots.toFixed(0)} kts`;
}

function formatAltitude(meters) {
  if (!meters && meters !== 0) return '–';
  return `${(meters * 3.28084).toFixed(0)} ft`;
}

function formatHeading(deg) {
  if (!deg && deg !== 0) return '–';
  return `${deg.toFixed(0)}°`;
}

function formatTime(epoch) {
  if (!epoch) return '–';
  return new Date(epoch * 1000).toUTCString().slice(17, 25);
}

// UI elements
const flightCountEl = document.getElementById('flightCount');
const detailCard = document.getElementById('detailCard');
const detailCallsign = document.getElementById('detailCallsign');
const detailRoute = document.getElementById('detailRoute');
const detailCountry = document.getElementById('detailCountry');
const detailAircraft = document.getElementById('detailAircraft');
const detailAltitude = document.getElementById('detailAltitude');
const detailSpeed = document.getElementById('detailSpeed');
const detailHeading = document.getElementById('detailHeading');
const detailTime = document.getElementById('detailTime');
const detailIcao = document.getElementById('detailIcao');
const altitudeRange = document.getElementById('altitudeRange');
const altitudeLabel = document.getElementById('altitudeLabel');
const searchInput = document.getElementById('searchInput');
const airlineFilterInput = document.getElementById('airlineFilter');
const utcClock = document.getElementById('utcClock');

const filters = {
  altitude: 45000,
  search: '',
  airline: '',
};

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const OPEN_SKY_PROXIES = [
  'https://corsproxy.io/?https://opensky-network.org/api/states/all',
  'https://api.allorigins.win/raw?url=https://opensky-network.org/api/states/all',
];
const REFRESH_MS = 20000;

const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');

function updateClock() {
  const now = new Date();
  const hh = now.getUTCHours().toString().padStart(2, '0');
  const mm = now.getUTCMinutes().toString().padStart(2, '0');
  const ss = now.getUTCSeconds().toString().padStart(2, '0');
  utcClock.textContent = `${hh}:${mm}:${ss} UTC`;
}
setInterval(updateClock, 1000);
updateClock();

altitudeRange.addEventListener('input', () => {
  filters.altitude = Number(altitudeRange.value);
  altitudeLabel.textContent = `≤ ${Number(altitudeRange.value).toLocaleString()} ft`;
  refreshScene();
});

searchInput.addEventListener('input', () => {
  filters.search = searchInput.value.trim().toLowerCase();
  refreshScene();
});

airlineFilterInput.addEventListener('input', () => {
  filters.airline = airlineFilterInput.value.trim().toLowerCase();
  refreshScene();
});

function setStatus(message, tone = 'ok') {
  statusText.textContent = message;
  connectionStatus.classList.remove('ok', 'warn', 'error');
  connectionStatus.classList.add(tone);
}

async function fetchWithTimeout(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFlights() {
  const sources = [OPEN_SKY_URL, ...OPEN_SKY_PROXIES];
  let lastError = null;
  setStatus('Refreshing live flights…', 'warn');

  for (const url of sources) {
    try {
      const data = await fetchWithTimeout(url);
      lastStates = Array.isArray(data.states) ? data.states : [];
      refreshScene();
      const total = lastStates.length;
      const visible = Math.min(activeCount, total);
      const tone = visible === 0 ? 'warn' : 'ok';
      const label = url === OPEN_SKY_URL ? 'OpenSky' : 'CORS relay';
      setStatus(
        visible === 0
          ? `Live feed OK (${label}), but no flights pass current filters`
          : `Live from ${label}: ${visible.toLocaleString()} active of ${total.toLocaleString()}`,
        tone,
      );
      return;
    } catch (error) {
      lastError = error;
      console.warn('Flight fetch failed', url, error);
    }
  }

  setStatus('Live feed unavailable (auto-retrying)…', 'error');
  if (lastError) {
    console.error(lastError);
  }
}

function filterState(state) {
  const callsign = (state[1] || '').trim();
  const airlineMatch = filters.airline ? callsign.toLowerCase().startsWith(filters.airline) : true;
  const searchTarget = `${callsign} ${state[2] || ''}`.toLowerCase();
  const searchMatch = filters.search ? searchTarget.includes(filters.search) : true;
  const altitudeFt = (state[13] || 0) * 3.28084;
  return airlineMatch && searchMatch && altitudeFt <= filters.altitude;
}

const tempMatrix = new THREE.Matrix4();

function refreshScene() {
  let index = 0;
  activeCount = 0;
  for (let i = 0; i < lastStates.length && index < MAX_FLIGHTS; i++) {
    const state = lastStates[i];
    if (!state || state[5] == null || state[6] == null) continue;
    if (!filterState(state)) continue;

    const [icao24, callsignRaw, originCountry,, , lon, lat, , , velocity, heading, , , baroAltitude, geoAltitude, ] = state;
    const callsign = (callsignRaw || 'N/A').trim();
    const altitude = (geoAltitude ?? baroAltitude ?? 0);
    const position = latLngToVector(lat, lon, altitude);
    const quaternion = headingToQuaternion(position, heading || 0);

    tempMatrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
    planes.setMatrixAt(index, tempMatrix);

    flightIndexToIcao[index] = icao24;
    activeCount++;
    const history = (flightHistory.get(icao24)?.geoHistory || []).slice();
    history.push({ position: position.clone(), timestamp: Date.now() });
    if (history.length > 60) history.shift();
    flightHistory.set(icao24, {
      callsign,
      originCountry: originCountry || 'Unknown',
      altitude,
      velocity: velocity || 0,
      heading: heading || 0,
      lastContact: state[4] || state[3] || 0,
      geoHistory: history,
      icao24,
    });
    index++;
  }

  planes.count = index;
  planes.instanceMatrix.needsUpdate = true;
  flightCountEl.textContent = activeCount.toLocaleString();

  // reset trails if selection lost
  if (selectedFlight && !flightHistory.has(selectedFlight)) {
    clearSelection();
  } else if (selectedFlight) {
    drawTrail(selectedFlight);
  }
}

function drawTrail(icao) {
  const info = flightHistory.get(icao);
  if (!info) return;
  const points = info.geoHistory.map((h) => h.position.clone());
  if (points.length < 2) return;

  if (trailLine) scene.remove(trailLine);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  trailLine = new THREE.Line(geometry, trailMaterial);
  scene.add(trailLine);

  const latest = points[points.length - 1];
  selectionMarker.position.copy(latest);
  selectionMarker.visible = true;
}

function focusFlight(icao) {
  selectedFlight = icao;
  drawTrail(icao);
  const info = flightHistory.get(icao);
  if (!info) return;

  detailCallsign.textContent = info.callsign || 'Unknown';
  detailRoute.textContent = 'Route unavailable in OpenSky public feed';
  detailCountry.textContent = info.originCountry || 'Unknown';
  detailAircraft.textContent = 'N/A';
  detailAltitude.textContent = formatAltitude(info.altitude);
  detailSpeed.textContent = formatSpeed(info.velocity);
  detailHeading.textContent = formatHeading(info.heading);
  detailTime.textContent = formatTime(info.lastContact);
  detailIcao.textContent = info.icao24 || '—';

  detailCard.hidden = false;
  gsap.fromTo(detailCard, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
}

function clearSelection() {
  selectedFlight = null;
  selectionMarker.visible = false;
  if (trailLine) {
    scene.remove(trailLine);
    trailLine = null;
  }
  detailCard.hidden = true;
}

// Animation loop
let sunAngle = 0;
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  sunAngle += 0.0005;
  const lightDir = new THREE.Vector3(Math.cos(sunAngle), 0.3, Math.sin(sunAngle));
  earthUniforms.lightDirection.value = lightDir;
  directional.position.copy(lightDir.clone().multiplyScalar(4));
  renderer.render(scene, camera);
}
animate();

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// Kick off data loop
setStatus('Connecting to OpenSky…', 'warn');
fetchFlights();
setInterval(fetchFlights, REFRESH_MS);

// Intro motion
function intro() {
  gsap.from(camera.position, { z: 6, duration: 2, ease: 'power2.out' });
  gsap.from('#app .hud', { opacity: 0, y: -6, duration: 0.8, stagger: 0.1, ease: 'power2.out' });
}
intro();
