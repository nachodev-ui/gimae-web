/* Navegación compartida por Inicio, Estudio Cheki y Gacha. */
(() => {
  'use strict';
  const menu = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  const year = document.querySelector('#year');

  if (year) year.textContent = new Date().getFullYear();
  if (!menu || !navigation) return;

  function closeMenu() {
    menu.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('open');
  }

  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('open', open);
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
})();
