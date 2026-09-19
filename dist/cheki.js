/*
 * GENERADOR DE CHEKIS
 * - Los nombres y colores se leen desde window.GIMAE.members en content.js.
 * - Para cambiar el peso máximo permitido, edita MAX_FILE_SIZE.
 * - El encuadre y toda la exportación ocurren localmente en el navegador.
 */
(() => {
  'use strict';

  const MAX_FILE_SIZE = 12 * 1024 * 1024;
  const WIDTH = 640;
  const HEIGHT = 1020;
  const PHOTO = { x: 48, y: 48, width: 544, height: 690 };
  const members = window.GIMAE?.members || [];
  const canvas = document.querySelector('#cheki-canvas');

  if (!canvas || !members.length) return;

  const context = canvas.getContext('2d', { alpha: false });
  const form = document.querySelector('#cheki-form');
  const photoInput = document.querySelector('#cheki-photo');
  const memberList = document.querySelector('#cheki-members');
  const messageInput = document.querySelector('#cheki-message');
  const fanNameInput = document.querySelector('#cheki-name');
  const messageCount = document.querySelector('#cheki-message-count');
  const zoomInput = document.querySelector('#cheki-zoom');
  const stickersInput = document.querySelector('#cheki-stickers');
  const errorBox = document.querySelector('#cheki-error');
  const statusBox = document.querySelector('#cheki-status');
  const downloadButton = document.querySelector('#cheki-download');
  const shareButton = document.querySelector('#cheki-share');
  const resetButton = document.querySelector('#cheki-reset');

  const state = {
    image: null,
    memberIndex: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    pointerX: 0,
    pointerY: 0
  };

  // Si agregas una integrante en content.js, su opción aparecerá aquí automáticamente.
  members.forEach((member, index) => {
    const label = document.createElement('label');
    label.className = `cheki-member-choice ${member.color}`;
    label.style.setProperty('--member-choice', member.accent || '#e84694');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'chekiMember';
    radio.value = String(index);
    radio.checked = index === 0;
    const dot = document.createElement('span');
    dot.className = 'cheki-member-dot';
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = member.name;
    label.append(radio, dot, name);
    memberList.append(label);
  });

  function selectedMember() {
    return members[state.memberIndex] || members[0];
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setStatus(message) {
    statusBox.textContent = message;
  }

  function formatDate() {
    const now = new Date();
    const parts = [now.getDate(), now.getMonth() + 1, String(now.getFullYear()).slice(-2)];
    return parts.map(value => String(value).padStart(2, '0')).join('.');
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawHeart(ctx, x, y, size, color, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(size / 32, size / 32);
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.bezierCurveTo(-18, -6, -30, 9, 0, 30);
    ctx.bezierCurveTo(30, 9, 18, -6, 0, 9);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawStar(ctx, x, y, radius, color, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const length = point % 2 === 0 ? radius : radius * 0.42;
      const px = Math.cos(angle) * length;
      const py = Math.sin(angle) * length;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function imageMetrics() {
    if (!state.image) return null;
    const imageWidth = state.image.naturalWidth || state.image.width;
    const imageHeight = state.image.naturalHeight || state.image.height;
    const baseScale = Math.max(PHOTO.width / imageWidth, PHOTO.height / imageHeight);
    const scale = baseScale * state.zoom;
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const maxPanX = Math.max(0, (drawWidth - PHOTO.width) / 2);
    const maxPanY = Math.max(0, (drawHeight - PHOTO.height) / 2);
    state.panX = Math.max(-maxPanX, Math.min(maxPanX, state.panX));
    state.panY = Math.max(-maxPanY, Math.min(maxPanY, state.panY));
    return {
      drawWidth,
      drawHeight,
      x: PHOTO.x + (PHOTO.width - drawWidth) / 2 + state.panX,
      y: PHOTO.y + (PHOTO.height - drawHeight) / 2 + state.panY
    };
  }

  function fitCanvasText(text, maxWidth, startSize, family, weight = '400') {
    let size = startSize;
    do {
      context.font = `${weight} ${size}px ${family}`;
      if (context.measureText(text).width <= maxWidth) break;
      size -= 2;
    } while (size > 26);
    return size;
  }

  function renderPreview() {
    const member = selectedMember();
    const accent = member.accent || '#e84694';
    const message = messageInput.value.trim() || 'Un recuerdo lleno de magia ♡';
    const fanName = fanNameInput.value.trim();

    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.fillStyle = '#f4edf2';
    roundedRect(context, 25, 25, WIDTH - 50, HEIGHT - 50, 22);
    context.fill();
    context.fillStyle = '#ffffff';
    roundedRect(context, 31, 31, WIDTH - 62, HEIGHT - 62, 18);
    context.fill();

    context.save();
    roundedRect(context, PHOTO.x, PHOTO.y, PHOTO.width, PHOTO.height, 8);
    context.clip();
    if (state.image) {
      const metrics = imageMetrics();
      context.drawImage(state.image, metrics.x, metrics.y, metrics.drawWidth, metrics.drawHeight);
      context.fillStyle = 'rgba(20, 8, 20, 0.05)';
      context.fillRect(PHOTO.x, PHOTO.y, PHOTO.width, PHOTO.height);
    } else {
      const gradient = context.createLinearGradient(PHOTO.x, PHOTO.y, PHOTO.x + PHOTO.width, PHOTO.y + PHOTO.height);
      gradient.addColorStop(0, '#ffe2f1');
      gradient.addColorStop(0.5, '#f6edff');
      gradient.addColorStop(1, '#fff2bf');
      context.fillStyle = gradient;
      context.fillRect(PHOTO.x, PHOTO.y, PHOTO.width, PHOTO.height);
      context.fillStyle = 'rgba(255,255,255,.48)';
      for (let x = PHOTO.x - 50; x < PHOTO.x + PHOTO.width; x += 72) {
        context.save();
        context.translate(x, PHOTO.y + PHOTO.height / 2);
        context.rotate(-0.35);
        context.fillRect(0, -PHOTO.height, 24, PHOTO.height * 2);
        context.restore();
      }
      context.textAlign = 'center';
      context.fillStyle = accent;
      context.font = '600 38px "Fredoka", sans-serif';
      context.fillText('TU SELFIE AQUÍ', WIDTH / 2, 370);
      context.fillStyle = '#765f75';
      context.font = '500 23px "DM Sans", sans-serif';
      context.fillText('sube una foto y crea tu momento idol', WIDTH / 2, 414);
    }

    if (stickersInput.checked) {
      context.globalAlpha = 0.92;
      drawHeart(context, 103, 112, 44, accent, -0.2);
      drawStar(context, 535, 145, 29, '#fff4a8', 0.12);
      drawHeart(context, 533, 630, 34, '#ffffff', 0.18);
      drawStar(context, 107, 640, 24, accent, -0.25);
      context.globalAlpha = 1;
    }

    context.fillStyle = '#ff9f45';
    context.font = '700 24px "Courier New", monospace';
    context.textAlign = 'left';
    context.shadowColor = 'rgba(0,0,0,.45)';
    context.shadowBlur = 4;
    context.fillText(formatDate(), PHOTO.x + 18, PHOTO.y + PHOTO.height - 19);
    context.restore();

    context.shadowColor = 'transparent';
    context.fillStyle = accent;
    context.textAlign = 'left';
    context.font = '700 20px "DM Sans", sans-serif';
    context.fillText(`GIMAE! · ${member.name.toUpperCase()}`, 58, 786);

    if (fanName) {
      context.textAlign = 'right';
      context.font = '600 18px "DM Sans", sans-serif';
      context.fillText(`para ${fanName}`, WIDTH - 58, 786);
    }

    context.textAlign = 'center';
    const messageSize = fitCanvasText(message, WIDTH - 110, 50, '"Caveat", "Comic Sans MS", cursive', '600');
    context.font = `600 ${messageSize}px "Caveat", "Comic Sans MS", cursive`;
    context.fillText(message, WIDTH / 2, 865);

    context.textAlign = 'right';
    context.font = '600 46px "Caveat", "Comic Sans MS", cursive';
    context.fillText(`${member.name} ♡`, WIDTH - 60, 938);

    context.textAlign = 'left';
    context.fillStyle = '#b8aab5';
    context.font = '600 13px "DM Sans", sans-serif';
    context.fillText('GIMAE! ESTUDIO CHEKI · HECHO CON AMOR', 58, 974);
    context.restore();
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (error) {
        try {
          return await createImageBitmap(file);
        } catch (fallbackError) {
          // Continúa con Image; los navegadores modernos suelen respetar EXIF aquí también.
        }
      }
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo leer la imagen.'));
      };
      image.src = objectUrl;
    });
  }

  async function handlePhoto(file) {
    showError('');
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showError('Ese archivo no parece ser una imagen. Prueba con JPG, PNG o WebP.');
      photoInput.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError('La imagen supera los 12 MB. Elige una foto más liviana e inténtalo otra vez.');
      photoInput.value = '';
      return;
    }

    setStatus('Preparando tu selfie…');
    try {
      const decoded = await decodeImage(file);
      if (state.image && typeof state.image.close === 'function') state.image.close();
      state.image = decoded;
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      zoomInput.value = '1';
      zoomInput.disabled = false;
      downloadButton.disabled = false;
      shareButton.disabled = false;
      renderPreview();
      setStatus('¡Lista! Arrastra tu selfie para dejarla justo como quieres.');
    } catch (error) {
      showError('No pudimos abrir esa imagen. Prueba con otra foto en formato JPG, PNG o WebP.');
      setStatus('Sube una selfie para comenzar.');
      photoInput.value = '';
    }
  }

  function canvasBlob() {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear el PNG.')), 'image/png');
    });
  }

  async function downloadCheki() {
    if (!state.image) return;
    renderPreview();
    try {
      const blob = await canvasBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gimae-cheki-${selectedMember().name.toLowerCase()}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Tu cheki se descargó como PNG. ♡');
    } catch (error) {
      showError('No pudimos descargar tu cheki. Inténtalo nuevamente.');
    }
  }

  async function shareCheki() {
    if (!state.image) return;
    try {
      const blob = await canvasBlob();
      const file = new File([blob], `gimae-cheki-${selectedMember().name.toLowerCase()}.png`, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          files: [file],
          title: 'Mi cheki de Gimae!',
          text: `Mi momento idol con ${selectedMember().name} ♡`
        });
        setStatus('¡Tu cheki está lista para brillar!');
        return;
      }
      await downloadCheki();
      setStatus('Tu navegador no permite compartir archivos; descargamos el PNG por ti.');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        await downloadCheki();
        setStatus('No se pudo abrir el menú de compartir; descargamos el PNG por ti.');
      }
    }
  }

  function resetCheki() {
    if (state.image && typeof state.image.close === 'function') state.image.close();
    state.image = null;
    state.memberIndex = 0;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    form.reset();
    photoInput.value = '';
    messageInput.value = '¡Gracias por este momento!';
    stickersInput.checked = true;
    zoomInput.value = '1';
    zoomInput.disabled = true;
    memberList.querySelector('input[value="0"]').checked = true;
    downloadButton.disabled = true;
    shareButton.disabled = true;
    showError('');
    updateMessageCount();
    renderPreview();
    setStatus('Sube una selfie para comenzar.');
    photoInput.focus();
  }

  function updateMessageCount() {
    messageCount.value = `${messageInput.value.length}/40`;
    messageCount.textContent = messageCount.value;
  }

  function movePhoto(deltaX, deltaY) {
    if (!state.image) return;
    state.panX += deltaX;
    state.panY += deltaY;
    imageMetrics();
    renderPreview();
  }

  photoInput.addEventListener('change', event => handlePhoto(event.target.files?.[0]));
  memberList.addEventListener('change', event => {
    if (event.target.name !== 'chekiMember') return;
    state.memberIndex = Number(event.target.value);
    renderPreview();
  });
  messageInput.addEventListener('input', () => { updateMessageCount(); renderPreview(); });
  fanNameInput.addEventListener('input', renderPreview);
  stickersInput.addEventListener('change', renderPreview);
  zoomInput.addEventListener('input', () => {
    state.zoom = Number(zoomInput.value);
    imageMetrics();
    renderPreview();
  });
  downloadButton.addEventListener('click', downloadCheki);
  shareButton.addEventListener('click', shareCheki);
  resetButton.addEventListener('click', resetCheki);

  canvas.addEventListener('pointerdown', event => {
    if (!state.image) return;
    state.dragging = true;
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!state.dragging || !state.image) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    movePhoto((event.clientX - state.pointerX) * scaleX, (event.clientY - state.pointerY) * scaleY);
    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
  });
  function stopDragging(event) {
    state.dragging = false;
    canvas.classList.remove('is-dragging');
    if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('keydown', event => {
    if (!state.image || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 30 : 10;
    if (event.key === 'ArrowLeft') movePhoto(-step, 0);
    if (event.key === 'ArrowRight') movePhoto(step, 0);
    if (event.key === 'ArrowUp') movePhoto(0, -step);
    if (event.key === 'ArrowDown') movePhoto(0, step);
  });

  updateMessageCount();
  renderPreview();
  if (document.fonts?.ready) document.fonts.ready.then(renderPreview);
})();
