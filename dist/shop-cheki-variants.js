/*
 * VARIANTES COMPUESTAS DE CHEKIS
 * Se ejecuta después de content.js y antes de shop.js para que el carrito
 * pueda distinguir cada cheki individual por integrante sin duplicar la
 * lógica comercial del carrito.
 */
(() => {
  'use strict';

  const config = window.GIMAE || {};
  const product = Array.isArray(config.merch)
    ? config.merch.find(item => String(item?.id) === '04')
    : null;
  const members = Array.isArray(config.members) ? config.members : [];

  if (!product || !Array.isArray(product.prices) || !members.length) return;
  if (product.prices.some(option => option?.memberId)) return;

  const individual = product.prices.find(option => String(option?.id) === 'individual');
  const group = product.prices.find(option => String(option?.id) === 'group');
  if (!individual || !group) return;

  product.memberVariantLabel = 'Integrante';
  product.prices = [
    ...members.map(member => ({
      ...individual,
      id: `individual-${member.id}`,
      label: `Individual · ${member.name}`,
      typeId: 'individual',
      typeLabel: individual.label || 'Individual',
      memberId: String(member.id),
      memberLabel: String(member.name)
    })),
    {
      ...group,
      id: 'group',
      label: group.label || 'Grupal',
      typeId: 'group',
      typeLabel: group.label || 'Grupal',
      memberId: '',
      memberLabel: ''
    }
  ];
})();
