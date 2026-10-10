/* Escaparate Goodies: fondos CSS, recursos originales, tres versiones.
   No se alteran ilustraciones, rostros ni estampados con IA. */
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
  // Las etiquetas son constantes de este archivo, no contenido externo.
  function scene() {
    const shirtMarkup = shirts.map(([member, key, file]) =>
      '<div class="goodies-shirt goodies-color--' + key + '">' +
      '<span class="goodies-shirt-fabric" aria-hidden="true"></span>' +
      '<img src="' + base + file + '" loading="lazy" alt="Estampado original de ' + member + ' de Gimae, sin modificaciones generativas">' +
      '<span class="goodies-item-name" aria-label="Integrante ' + member + '">' + member + '</span></div>').join('');
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
      '<img src="images/merch/lightstick.png" loading="lazy" alt="Lightstick original de Gimae"></div>' +
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
