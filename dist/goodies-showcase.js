/* Sweet flat lay de Gimae! · prendas y fondo en CSS, imágenes originales intactas. */
(() => {
  'use strict';
  const preview = document.getElementById('goodies-scene');
  const dialog = document.getElementById('catalog-dialog');
  const dialogImage = document.getElementById('catalog-image');
  if (!preview || !dialog || !dialogImage) return;

  const base = 'images/goodies/';
  const shirts = [
    ['Usi', 'usi', 'estampado-usi.webp'],
    ['Vewe', 'vewe', 'estampado-vewe.webp'],
    ['Suki', 'suki', 'estampado-suki.webp'],
    ['Vali', 'vali', 'estampado-vali.webp']
  ];
  const charms = [
    ['Vewe', 'vewe', 'llavero-vewe.webp'],
    ['Usi', 'usi', 'llavero-usi.webp'],
    ['Suki', 'suki', 'llavero-suki.webp'],
    ['Vali', 'vali', 'llavero-vali.webp']
  ];
  const postcards = [
    ['Suki', 'postal-suki.webp'],
    ['Usi', 'postal-usi.webp'],
    ['Vewe', 'postal-vewe.webp'],
    ['Vali', 'postal-vali.webp']
  ];
  // Silueta vectorial dibujada manualmente; los estampados siempre son las imágenes originales.
  const shirtShape = "<svg class=\"goodies-shirt-vector\" viewBox=\"0 0 360 360\" preserveAspectRatio=\"none\" focusable=\"false\" aria-hidden=\"true\"><path class=\"goodies-shirt-outline\" d=\"M126 28 C138 25 149 31 157 32 Q180 42 203 32 C214 28 224 25 234 28 L280 53 Q314 79 348 111 L314 170 L270 144 L270 335 Q180 344 90 335 L90 144 L46 170 L12 111 Q46 79 80 53 Z\"/><path class=\"goodies-shirt-shoulder\" d=\"M126 28 Q111 39 92 62 L90 144 L95 315 L105 326 L105 145 L80 59 Z\"/><path class=\"goodies-shirt-sleeve\" d=\"M17 119 L46 164 M343 119 L314 164\"/><path class=\"goodies-shirt-side\" d=\"M95 159 L95 326 M265 159 L265 326\"/><path class=\"goodies-shirt-hem\" d=\"M93 329 Q180 338 267 329\"/><path class=\"goodies-shirt-collar-back\" d=\"M148 29 Q180 65 212 29\"/><path class=\"goodies-shirt-collar-front\" d=\"M148 29 Q180 52 212 29\"/><rect class=\"goodies-shirt-neck-label\" x=\"163\" y=\"38\" width=\"34\" height=\"12\" rx=\"4\"/></svg>";
  // El lightstick tiene márgenes blancos en un archivo de 1920×1080; el viewBox solo encuadra la imagen.
  const lightstickCrop = "<svg class=\"goodies-lightstick-crop\" viewBox=\"858 0 190 1080\" role=\"img\" aria-label=\"Lightstick original de Gimae, ampliado para apreciar sus detalles\" focusable=\"false\"><image href=\"images/merch/lightstick.png\" x=\"0\" y=\"0\" width=\"1920\" height=\"1080\" preserveAspectRatio=\"none\"/></svg>";
  // Las etiquetas son constantes de este archivo, no contenido externo.
  function scene() {
    const shirtMarkup = shirts.map(([member, key, file]) =>
      '<div class="goodies-shirt goodies-color--' + key + '">' +
      shirtShape +
      '<span class="goodies-shirt-print"><img src="' + base + file + '" loading="lazy" decoding="async" alt="Estampado original de ' + member + ' de Gimae"></span>' +
      '<span class="goodies-item-name">' + member + '</span></div>').join('');
    const charmMarkup = charms.map(([member, key, file]) =>
      '<div class="goodies-charm goodies-color--' + key + '">' +
      '<img src="' + base + file + '" loading="lazy" alt="Llavero original individual de ' + member + ' de Gimae">' +
      '</div>').join('');
    const postcardMarkup = postcards.map(([member, file]) =>
      '<span class="goodies-postcard"><img src="' + base + file + '" loading="lazy" alt="Postal fotográfica original de ' + member + '"></span>').join('');
    return '<div class="goodies-decoration goodies-decoration--one" aria-hidden="true">✦</div>' +
      '<div class="goodies-decoration goodies-decoration--two" aria-hidden="true">♡</div>' +
      '<div class="goodies-scene-header"><span class="goodies-scene-spacer" aria-hidden="true"></span>' +
      '<strong class="goodies-scene-logo">gimae! <span>♡</span></strong>' +
      '<span class="goodies-scene-serial">2026</span></div>' +
      '<div class="goodies-shirts" aria-label="Cuatro estampados originales de Gimae">' + shirtMarkup + '</div>' +
      '<div class="goodies-scene-bottom">' +
      '<div class="goodies-zone goodies-zone--charms"><span class="goodies-zone-label">CHARM COLLECTION ✧</span>' +
      '<div class="goodies-charms">' + charmMarkup + '</div></div>' +
      '<div class="goodies-zone goodies-zone--cheki"><span class="goodies-zone-label">CHEKI TIME ♡</span>' +
      '<div class="goodies-chekis"><span class="goodies-cheki"><img src="images/merch/cheki-individual.png" loading="lazy" alt="Cheki individual del catálogo original"></span>' +
      '<span class="goodies-cheki"><img src="images/merch/cheki-grupal.png" loading="lazy" alt="Cheki grupal del catálogo original"></span></div></div>' +
      '<div class="goodies-zone goodies-zone--postcards"><span class="goodies-zone-label">POSTCARDS / MEMORIES</span>' +
      '<div class="goodies-postcards">' + postcardMarkup + '</div>' +
      '<span class="goodies-group-postcard"><img src="' + base + 'postal-grupal.webp" loading="lazy" alt="Postal grupal original de Gimae"></span></div>' +
      '<div class="goodies-zone goodies-zone--light"><span class="goodies-zone-label">LIGHT UP!</span>' +
      lightstickCrop + '</div>' +
      '</div><div class="goodies-scene-footer"><span class="goodies-scene-tag">✿ GIMAE! GOODS ✿</span>' +
      '<span class="goodies-scene-caption">Nuestros pequeños tesoros ♡</span><span class="goodies-scene-spacer" aria-hidden="true"></span></div>';
  }
  preview.innerHTML = scene();
  const modalScene = document.createElement('div');
  modalScene.id = 'goodies-modal-scene';
  modalScene.className = 'goodies-scene goodies-scene--modal';
  modalScene.dataset.goodiesStyle = 'flatlay';
  modalScene.innerHTML = scene();
  dialogImage.before(modalScene);

  function syncModal() {
    const original = dialog.querySelector('[data-catalog-view="original"]')?.getAttribute('aria-pressed') === 'true';
    modalScene.hidden = original;
    dialogImage.hidden = !original;
    if (original) {
      dialogImage.src = 'images/catalogo-original.webp';
      dialogImage.alt = 'Catálogo original de Gimae 2026';
    }
  }
  // app.js registra primero los listeners del modal; luego sincronizamos esta vista.
  function installModalSync() {
    document.getElementById('open-catalog')?.addEventListener('click', syncModal);
    dialog.querySelectorAll('[data-catalog-view]').forEach(button => button.addEventListener('click', syncModal));
    syncModal();
  }
  // app.js registra sus listeners dentro de GIMAE_READY: esperamos el mismo ciclo.
  if (window.GIMAE_READY?.then) window.GIMAE_READY.then(installModalSync);
  else installModalSync();
})();
