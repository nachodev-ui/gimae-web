/*
 * GIMAE — visor 3D interactivo del Lightstick.
 * Se monta de forma progresiva dentro de #product-dialog cuando el producto
 * abierto es Lightstick. La foto original sigue disponible como vista alterna.
 */
(() => {
  'use strict';

  const dialog = document.querySelector('#product-dialog');
  const content = document.querySelector('#product-dialog-content');
  if (!dialog || !content) return;

  const THREE_VERSION = '0.169.0';
  const THREE_URL = `https://esm.sh/three@${THREE_VERSION}`;
  const ORBIT_URL = `https://esm.sh/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`;
  const STYLE_ID = 'gimae-lightstick-3d-styles';
  const COLOR_STEPS = [
    { label: 'Rosado', value: '#ff66b7' },
    { label: 'Rojo', value: '#ff6578' },
    { label: 'Amarillo', value: '#ffd85f' },
    { label: 'Verde menta', value: '#79e0bd' },
    { label: 'Celeste', value: '#58d8ff' },
    { label: 'Morado', value: '#a778ff' }
  ];

  let activeCleanup = null;
  let modulePromise = null;
  let syncQueued = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .lightstick3d-switch{display:flex;gap:8px;margin:0 0 12px;padding:4px;border:1px solid #ead5e0;border-radius:999px;background:#fff8fc;width:max-content;max-width:100%}
      .lightstick3d-switch button{min-height:34px;border:0;border-radius:999px;background:transparent;padding:6px 13px;color:#81506b;font:750 .72rem/1 var(--body);cursor:pointer}
      .lightstick3d-switch button[aria-pressed="true"]{background:#fff;color:#9c356d;box-shadow:0 2px 8px #5b25431a}
      .lightstick3d-switch button:focus-visible,.lightstick3d-power:focus-visible,.lightstick3d-reset:focus-visible{outline:3px solid #96306c;outline-offset:2px}
      .lightstick3d-panel{position:relative;overflow:hidden;border:1px solid #d9c3ec;border-radius:22px;background:radial-gradient(circle at 50% 28%,#fff 0 9%,#fff9fd 44%,#f4edff 100%);box-shadow:0 8px 0 #efe3fb;isolation:isolate}
      .lightstick3d-panel[hidden]{display:none!important}
      .lightstick3d-hide-2d{display:none!important}
      .lightstick3d-canvas{position:relative;width:100%;height:500px;touch-action:none;cursor:grab}
      .lightstick3d-canvas:active{cursor:grabbing}
      .lightstick3d-canvas canvas{display:block;width:100%!important;height:100%!important}
      .lightstick3d-badge{position:absolute;left:14px;top:14px;z-index:2;border:1px solid #e7d2f4;border-radius:999px;background:#ffffffdc;padding:6px 10px;color:#75528e;font:800 .6rem/1 var(--body);letter-spacing:.08em;backdrop-filter:blur(8px);pointer-events:none}
      .lightstick3d-controls{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;border-top:1px solid #eadff0;background:#fffdfef2;padding:12px 14px;backdrop-filter:blur(8px)}
      .lightstick3d-power{min-height:42px;border:0;border-radius:999px;background:linear-gradient(135deg,#e84694,#c62f78);padding:0 16px;color:#fff;font:800 .76rem/1 var(--body);box-shadow:0 4px 0 #f4c4dd;cursor:pointer}
      .lightstick3d-power:hover{transform:translateY(-1px)}
      .lightstick3d-status{min-width:0;color:#6f5364;font-size:.73rem;line-height:1.35}
      .lightstick3d-status strong{display:block;color:#412d45;font-size:.78rem}
      .lightstick3d-reset{min-height:36px;border:1px solid #e6d2df;border-radius:999px;background:#fff;padding:0 11px;color:#80536d;font:750 .7rem/1 var(--body);cursor:pointer}
      .lightstick3d-help{margin:0;border-top:1px dashed #ead8e3;background:#fffafd;padding:9px 14px;color:#866679;font-size:.67rem;line-height:1.45;text-align:center}
      .lightstick3d-error{display:grid;place-items:center;min-height:360px;padding:28px;color:#73576a;text-align:center;line-height:1.6}
      .lightstick3d-error strong{display:block;margin-bottom:6px;color:#412d45;font:600 1rem var(--display)}
      @media(max-width:820px){.lightstick3d-canvas{height:420px}}
      @media(max-width:620px){.lightstick3d-canvas{height:350px}.lightstick3d-controls{grid-template-columns:1fr auto}.lightstick3d-status{grid-column:1/-1;grid-row:2}.lightstick3d-power{width:100%}}
      @media(prefers-reduced-motion:reduce){.lightstick3d-power{transition:none!important}}
    `;
    document.head.append(style);
  }

  function loadThree() {
    if (!modulePromise) {
      modulePromise = Promise.all([
        import(THREE_URL),
        import(ORBIT_URL)
      ]).then(([THREE, controlsModule]) => ({ THREE, OrbitControls: controlsModule.OrbitControls }));
    }
    return modulePromise;
  }

  function isLightstickDetail() {
    const title = content.querySelector('#product-dialog-title')?.textContent?.trim().toLowerCase() || '';
    const heroSrc = content.querySelector('.product-gallery-hero')?.getAttribute('src') || '';
    return title === 'lightstick' || heroSrc.includes('images/merch/lightstick.png');
  }

  function createLogoTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const letters = [
      ['G', '#ff78b9'], ['I', '#ff8f8a'], ['M', '#ffd56e'],
      ['A', '#a7df8a'], ['E', '#75d8eb'], ['!', '#62bff7']
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 150px Arial Rounded MT Bold, Arial, sans-serif';
    ctx.lineJoin = 'round';
    letters.forEach(([letter, color], index) => {
      const y = 130 + index * 142;
      ctx.lineWidth = 24;
      ctx.strokeStyle = 'rgba(255,255,255,.98)';
      ctx.strokeText(letter, 256, y);
      ctx.fillStyle = color;
      ctx.fillText(letter, 256, y);
    });
    ctx.font = '900 70px Arial Rounded MT Bold, Arial, sans-serif';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,.98)';
    ctx.fillStyle = '#ff8ec5';
    ctx.strokeText('♡', 365, 105);
    ctx.fillText('♡', 365, 105);
    ctx.strokeText('♡', 150, 885);
    ctx.fillText('♡', 150, 885);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function disposeObject(root) {
    root.traverse(node => {
      if (node.geometry?.dispose) node.geometry.dispose();
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => {
        if (material.map?.dispose) material.map.dispose();
        material.dispose?.();
      });
    });
  }

  async function mountViewer({ panel, mount, powerButton, resetButton, status }) {
    const { THREE, OrbitControls } = await loadThree();
    if (!panel.isConnected) return () => {};

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.15, 13.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 5.2;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI - 0.12;
    controls.target.set(0, 0.15, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b8da, 2.35));
    const key = new THREE.DirectionalLight(0xffffff, 3.15);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc9ea, 1.75);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const root = new THREE.Group();
    root.rotation.y = -0.15;
    scene.add(root);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0xf5f4f6, roughness: 0.46, metalness: 0.08 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.28, metalness: 0.22 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf4c96d, roughness: 0.36, metalness: 0.18 });
    const chamberMat = new THREE.MeshPhysicalMaterial({
      color: 0xc7c9cd,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.24,
      metalness: 0.02,
      transparent: true,
      opacity: 0.55,
      transmission: 0.18,
      thickness: 0.38,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
      depthWrite: false
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xd9dade,
      emissive: 0x000000,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.62,
      roughness: 0.16,
      metalness: 0,
      depthWrite: false
    });
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    function cylinder(radiusTop, radiusBottom, height, material, y, segments = 64) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    }

    cylinder(0.43, 0.43, 2.95, handleMat, -1.72);
    cylinder(0.44, 0.44, 0.12, rimMat, -3.23);
    cylinder(0.45, 0.45, 0.09, rimMat, -0.21);
    cylinder(0.45, 0.45, 0.46, bandMat, 0.06);
    cylinder(0.44, 0.44, 0.08, rimMat, 0.34);
    const chamber = cylinder(0.43, 0.43, 3.08, chamberMat, 1.92);
    chamber.castShadow = false;
    cylinder(0.44, 0.44, 0.12, rimMat, 3.51);

    const topLip = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.028, 12, 64), rimMat);
    topLip.rotation.x = Math.PI / 2;
    topLip.position.y = 3.54;
    root.add(topLip);

    const core = cylinder(0.31, 0.31, 2.72, coreMat, 1.9, 48);
    core.castShadow = false;
    core.receiveShadow = false;
    const aura = cylinder(0.405, 0.405, 2.92, auraMat, 1.9, 48);
    aura.castShadow = false;
    aura.receiveShadow = false;

    const buttonMat = new THREE.MeshStandardMaterial({ color: 0xe84694, roughness: 0.35, metalness: 0.04 });
    const modelButton = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.055, 32), buttonMat);
    modelButton.rotation.x = Math.PI / 2;
    modelButton.position.set(0, -1.42, 0.445);
    root.add(modelButton);

    const logoTexture = createLogoTexture(THREE);
    if (logoTexture) {
      const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 1.68),
        new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, depthWrite: false })
      );
      logo.position.set(0, 2.0, 0.442);
      root.add(logo);
    }

    const glowLight = new THREE.PointLight(0xffffff, 0, 7.5, 1.4);
    glowLight.position.set(0, 1.85, 0);
    root.add(glowLight);
    const glowTop = new THREE.PointLight(0xffffff, 0, 4.2, 1.5);
    glowTop.position.set(0, 3.15, 0);
    root.add(glowTop);
    const glowBottom = new THREE.PointLight(0xffffff, 0, 4.2, 1.5);
    glowBottom.position.set(0, 0.65, 0);
    root.add(glowBottom);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 64),
      new THREE.ShadowMaterial({ color: 0x5f426e, opacity: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.31;
    floor.receiveShadow = true;
    scene.add(floor);

    let colorIndex = -1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const offChamber = new THREE.Color('#c7c9cd');
    const offCore = new THREE.Color('#d9dade');

    function applyColor(index) {
      colorIndex = index;
      const mode = COLOR_STEPS[index] || null;

      if (!mode) {
        chamberMat.color.copy(offChamber);
        chamberMat.emissive.set('#000000');
        chamberMat.emissiveIntensity = 0;
        chamberMat.opacity = 0.55;
        chamberMat.transmission = 0.18;
        coreMat.color.copy(offCore);
        coreMat.emissive.set('#000000');
        coreMat.emissiveIntensity = 0;
        coreMat.opacity = 0.62;
        auraMat.opacity = 0;
        glowLight.intensity = 0;
        glowTop.intensity = 0;
        glowBottom.intensity = 0;
        status.innerHTML = '<strong>Apagado</strong>Presiona el botón para encenderlo.';
        powerButton.textContent = '⏻ Encender';
        powerButton.setAttribute('aria-label', 'Encender lightstick');
        return;
      }

      const color = new THREE.Color(mode.value);
      const shellTint = color.clone().lerp(new THREE.Color('#ffffff'), 0.32);
      chamberMat.color.copy(shellTint);
      chamberMat.emissive.copy(color);
      chamberMat.emissiveIntensity = 0.72;
      chamberMat.opacity = 0.68;
      chamberMat.transmission = 0.08;
      coreMat.color.copy(color);
      coreMat.emissive.copy(color);
      coreMat.emissiveIntensity = 4.6;
      coreMat.opacity = 1;
      auraMat.color.copy(color);
      auraMat.opacity = 0.42;
      glowLight.color.copy(color);
      glowTop.color.copy(color);
      glowBottom.color.copy(color);
      glowLight.intensity = 11;
      glowTop.intensity = 4.2;
      glowBottom.intensity = 4.2;

      status.innerHTML = `<strong>Encendido · ${mode.label}</strong>Color ${index + 1} de ${COLOR_STEPS.length}.`;
      powerButton.textContent = index === COLOR_STEPS.length - 1 ? '⏻ Apagar' : '✦ Cambiar color';
      powerButton.setAttribute('aria-label', index === COLOR_STEPS.length - 1
        ? 'Apagar lightstick'
        : `Cambiar color del lightstick. Actual: ${mode.label}`);
    }

    function nextColor() {
      if (colorIndex < 0) applyColor(0);
      else if (colorIndex >= COLOR_STEPS.length - 1) applyColor(-1);
      else applyColor(colorIndex + 1);
    }

    function resetView() {
      camera.position.set(0, 0.15, 13.2);
      controls.target.set(0, 0.15, 0);
      root.rotation.set(0, -0.15, 0);
      controls.update();
    }

    powerButton.addEventListener('click', nextColor);
    resetButton.addEventListener('click', resetView);
    applyColor(-1);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth || 480);
      const height = Math.max(1, mount.clientHeight || 500);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frame = 0;
    function animate(time) {
      frame = requestAnimationFrame(animate);
      controls.update();
      if (!reducedMotion && colorIndex >= 0) {
        const pulse = 1 + Math.sin(time * 0.004) * 0.025;
        aura.scale.set(pulse, 1, pulse);
        const wave = Math.sin(time * 0.004);
        glowLight.intensity = 10.5 + wave * 1.25;
        glowTop.intensity = 4 + wave * 0.45;
        glowBottom.intensity = 4 + wave * 0.45;
      } else {
        aura.scale.set(1, 1, 1);
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      powerButton.removeEventListener('click', nextColor);
      resetButton.removeEventListener('click', resetView);
      controls.dispose();
      disposeObject(root);
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      mount.replaceChildren();
    };
  }

  function revealPhotoElements() {
    content.querySelectorAll('.product-gallery-stage,.product-gallery-thumbs').forEach(node => {
      node.classList.remove('lightstick3d-hide-2d');
      if (node.classList.contains('product-gallery-stage')) node.hidden = false;
    });
  }

  function hidePhotoElements() {
    content.querySelectorAll('.product-gallery-stage,.product-gallery-thumbs').forEach(node => {
      node.classList.add('lightstick3d-hide-2d');
    });
  }

  function destroyActive() {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    content.querySelector('.lightstick3d-switch')?.remove();
    content.querySelector('.lightstick3d-panel')?.remove();
    revealPhotoElements();
  }

  async function mountIntoLightstick() {
    if (!isLightstickDetail()) {
      destroyActive();
      return;
    }
    if (content.querySelector('.lightstick3d-panel')) return;

    injectStyles();
    const mediaColumn = content.querySelector('.product-gallery-column');
    const photoStage = content.querySelector('.product-gallery-stage');
    const photoThumbs = content.querySelector('.product-gallery-thumbs');
    if (!mediaColumn || !photoStage) return;
    const thumbsInitiallyHidden = photoThumbs?.hidden ?? true;

    const switcher = document.createElement('div');
    switcher.className = 'lightstick3d-switch';
    switcher.setAttribute('aria-label', 'Cambiar vista del lightstick');
    const threeButton = document.createElement('button');
    threeButton.type = 'button';
    threeButton.textContent = 'Vista 3D';
    threeButton.setAttribute('aria-pressed', 'true');
    const photoButton = document.createElement('button');
    photoButton.type = 'button';
    photoButton.textContent = 'Foto original';
    photoButton.setAttribute('aria-pressed', 'false');
    switcher.append(threeButton, photoButton);

    const panel = document.createElement('section');
    panel.className = 'lightstick3d-panel';
    panel.setAttribute('aria-label', 'Vista 3D interactiva del lightstick');
    const badge = document.createElement('span');
    badge.className = 'lightstick3d-badge';
    badge.textContent = '3D INTERACTIVO ✦';
    const mount = document.createElement('div');
    mount.className = 'lightstick3d-canvas';
    mount.setAttribute('role', 'img');
    mount.setAttribute('aria-label', 'Modelo 3D estilizado del lightstick de Gimae. Arrastra para girar.');
    const controlsBar = document.createElement('div');
    controlsBar.className = 'lightstick3d-controls';
    const powerButton = document.createElement('button');
    powerButton.type = 'button';
    powerButton.className = 'lightstick3d-power';
    powerButton.textContent = '⏻ Encender';
    const status = document.createElement('span');
    status.className = 'lightstick3d-status';
    status.setAttribute('aria-live', 'polite');
    status.innerHTML = '<strong>Apagado</strong>Presiona el botón para encenderlo.';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'lightstick3d-reset';
    resetButton.textContent = 'Centrar';
    controlsBar.append(powerButton, status, resetButton);
    const help = document.createElement('p');
    help.className = 'lightstick3d-help';
    help.textContent = 'Arrastra para girar · rueda o pellizca para acercar o alejar · el botón recorre todos los colores y luego se apaga.';
    panel.append(badge, mount, controlsBar, help);

    mediaColumn.insertBefore(switcher, photoStage);
    mediaColumn.insertBefore(panel, photoStage);

    function show3D() {
      panel.hidden = false;
      hidePhotoElements();
      threeButton.setAttribute('aria-pressed', 'true');
      photoButton.setAttribute('aria-pressed', 'false');
    }

    function showPhoto() {
      panel.hidden = true;
      photoStage.classList.remove('lightstick3d-hide-2d');
      photoStage.hidden = false;
      if (photoThumbs) {
        photoThumbs.classList.remove('lightstick3d-hide-2d');
        photoThumbs.hidden = thumbsInitiallyHidden;
      }
      threeButton.setAttribute('aria-pressed', 'false');
      photoButton.setAttribute('aria-pressed', 'true');
    }

    threeButton.addEventListener('click', show3D);
    photoButton.addEventListener('click', showPhoto);
    show3D();

    try {
      const viewerCleanup = await mountViewer({ panel, mount, powerButton, resetButton, status });
      if (!panel.isConnected) {
        viewerCleanup();
        return;
      }
      activeCleanup = () => {
        viewerCleanup();
        threeButton.removeEventListener('click', show3D);
        photoButton.removeEventListener('click', showPhoto);
        revealPhotoElements();
      };
    } catch (error) {
      mount.innerHTML = '<div class="lightstick3d-error"><div><strong>Vista 3D no disponible</strong>Puedes seguir revisando el producto con la foto original.</div></div>';
      powerButton.disabled = true;
      resetButton.disabled = true;
      showPhoto();
      photoButton.focus({ preventScroll: true });
      console.warn('[Gimae shop] No se pudo cargar el visor 3D del lightstick.', error);
    }
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      mountIntoLightstick();
    });
  }

  const observer = new MutationObserver(queueSync);
  observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  dialog.addEventListener('close', destroyActive);
  queueSync();
})();
