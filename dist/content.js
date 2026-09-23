// Información oficial suministrada por Gimae. Precios en CLP.
window.GIMAE = {
  "socials": {
    "instagram": "https://www.instagram.com/gimae_official",
    "tiktok": "https://www.tiktok.com/@gimae_official",
    "spotify": "https://open.spotify.com/artist/3fCnhznvLe2OnwRa3Rif4g"
  },
  // EFECTOS DEL SITIO: cambia cada flag a false para desactivar una función.
  // La música es una composición sintetizada localmente; volume acepta valores de 0 a 0.08.
  "EFFECTS": {
    "cursorSparkles": true,
    "stageTransitions": true,
    "music": true,
    "musicStartsEnabled": true,
    "volume": 0.035
  },
  // TIENDA: activa o desactiva aquí cada forma de entrega.
  // Deja cost y eta vacíos cuando todavía deban coordinarse; la interfaz mostrará "A coordinar".
  "SHIPPING": {
    "options": [
      {
        "id": "pickup",
        "label": "Retiro en persona (a coordinar)",
        "enabled": true,
        "cost": null,
        "eta": ""
      },
      {
        "id": "instagram_shipping",
        "label": "Envío a coordinar por Instagram",
        "enabled": true,
        "cost": null,
        "eta": ""
      }
    ]
  },
  // CHECKOUT: cambia enabled a true o false sin modificar dist/shop.js.
  "PAYMENT_METHODS": {
    "bankTransfer": { "enabled": true, "label": "Transferencia bancaria" },
    "paypal": { "enabled": false, "label": "PayPal" }
  },
  // TRANSFERENCIA: reemplaza únicamente los textos "COMPLETAR" con datos que decidas publicar.
  // Nunca agregues claves, contraseñas, tokens ni información que no deba quedar en el repositorio público.
  "BANK_TRANSFER": {
    "accountHolder": "COMPLETAR",
    "rut": "COMPLETAR",
    "bank": "COMPLETAR",
    "accountType": "COMPLETAR",
    "accountNumber": "COMPLETAR",
    "confirmationEmail": "COMPLETAR"
  },
  // PAYPAL: publica solo el Client ID. El secret NUNCA debe ir en este archivo.
  // CLP_PER_USD es un tipo de cambio manual; actualízalo antes de habilitar PayPal.
  "PAYPAL_CLIENT_ID": "COMPLETAR",
  "PAYPAL_CURRENCY": "USD",
  "CLP_PER_USD": null,
  // CANALES: Instagram copia el mensaje y abre el perfil. WhatsApp requiere solo dígitos con código de país.
  "ORDER_CONTACTS": {
    "instagram": { "enabled": true, "url": "https://www.instagram.com/gimae_official" },
    "whatsapp": { "enabled": false, "number": "" },
    "email": { "enabled": false, "address": "" }
  },
  // AVATAR: todos los diálogos son locales y predefinidos. No se usa IA ni backend.
  // "label" siempre queda visible para explicar la naturaleza del widget.
  // IMÁGENES: reemplaza los WebP de dist/images/avatar/ conservando 768x768, transparencia y encuadre.
  // Las bases usan <expresión>.webp y neutral/happy/excited requieren además <expresión>-mouth.webp.
  "AVATAR_CONFIG": {
    "enabled": true,
    "name": "Suki",
    "label": "Avatar animado · diálogos predefinidos",
    "storageKey": "gimae.avatar.hidden"
  },
  // GUION DEL AVATAR:
  // - text: ["variante 1", "variante 2"] elige una variante al azar.
  // - text: [["parte 1", "parte 2"], ["otra variante"]] permite varias partes con "Siguiente".
  // - Reemplaza los textos marcados COMPLETAR sin agregar datos personales no publicados.
  // - {{members}}, {{events}}, {{merch}}, {{socials}} y {{instagram}} se rellenan desde este archivo.
  "AVATAR_SCRIPT": {
    "start": "welcome",
    "nodes": {
      "welcome": {
        "id": "welcome",
        "expression": "happy",
        "text": [
          "COMPLETAR: ¡Hola! Soy el avatar animado de Suki. Elige una opción para recorrer el sitio.",
          "COMPLETAR: ¡Bienvenido al rincón de Gimae! ¿Qué parte del sitio quieres conocer?"
        ],
        "options": [
          { "label": "Sobre el grupo", "target": "group" },
          { "label": "Eventos", "target": "events" },
          { "label": "Merch", "target": "merch" },
          { "label": "Crear una cheki", "target": "cheki" },
          { "label": "Gacha", "target": "gacha" },
          { "label": "Redes oficiales", "target": "socials" },
          { "label": "Despedirme", "target": "farewell" }
        ]
      },
      "group": {
        "id": "group",
        "expression": "excited",
        "text": [
          [
            "COMPLETAR: Las integrantes publicadas en el sitio son {{members}}.",
            "COMPLETAR: Puedes visitar la sección Members para conocer sus perfiles y redes oficiales."
          ],
          [
            "COMPLETAR: Gimae reúne a {{members}}.",
            "COMPLETAR: Revisa sus tarjetas en la página principal para conocer la información oficial disponible."
          ]
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Ver las redes", "target": "socials" }
        ]
      },
      "events": {
        "id": "events",
        "expression": "thinking",
        "text": [
          [
            "COMPLETAR: {{events}}",
            "COMPLETAR: Para comprobar novedades también puedes visitar {{instagram}}."
          ]
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Redes oficiales", "target": "socials" }
        ]
      },
      "merch": {
        "id": "merch",
        "expression": "happy",
        "text": [
          [
            "COMPLETAR: El catálogo configurado actualmente incluye {{merch}}.",
            "COMPLETAR: La disponibilidad debe confirmarse mediante los canales oficiales antes de completar una compra."
          ],
          [
            "COMPLETAR: Estos son los productos publicados en content.js: {{merch}}.",
            "COMPLETAR: Si necesitas confirmar stock, revisa {{instagram}}."
          ]
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Sobre las redes", "target": "socials" }
        ]
      },
      "cheki": {
        "id": "cheki",
        "expression": "wink",
        "text": [
          "COMPLETAR: En Crea tu cheki puedes preparar una imagen desde tu navegador. La fotografía se procesa localmente y no se envía al sitio.",
          "COMPLETAR: El estudio de chekis funciona directamente en tu dispositivo y permite descargar el resultado cuando esté listo."
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Conocer el gacha", "target": "gacha" }
        ]
      },
      "gacha": {
        "id": "gacha",
        "expression": "excited",
        "text": [
          "COMPLETAR: El gacha del sitio es gratuito y guarda la colección únicamente en este dispositivo.",
          "COMPLETAR: Puedes abrir sobres digitales y revisar el álbum local desde la página Gacha."
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Conocer las chekis", "target": "cheki" }
        ]
      },
      "socials": {
        "id": "socials",
        "expression": "happy",
        "text": [
          [
            "COMPLETAR: Las redes oficiales configuradas son {{socials}}.",
            "COMPLETAR: Para novedades que todavía no aparezcan en el sitio, revisa {{instagram}}."
          ]
        ],
        "options": [
          { "label": "Volver al menú", "target": "welcome" },
          { "label": "Eventos", "target": "events" }
        ]
      },
      "farewell": {
        "id": "farewell",
        "expression": "shy",
        "text": [
          "COMPLETAR: ¡Gracias por visitar el sitio! Puedes minimizarme o cerrar la ventana cuando quieras.",
          "COMPLETAR: ¡Nos vemos! Gracias por recorrer este pequeño rincón de Gimae."
        ],
        "options": [
          { "label": "Volver a conversar", "target": "welcome" }
        ]
      }
    }
  },
  // CHEKIS: "name" y "accent" alimentan automáticamente las opciones y la firma.
  // Usa un color hexadecimal en "accent" si quieres ajustar el tono de una integrante.
  "members": [
    {
      "id": "01",
      "name": "Suki",
      "color": "pink",
      "accent": "#e84694",
      "colorLabel": "Rosado",
      "photo": "images/suki.webp",
      "handle": "@bunnidoru",
      "socials": {
        "instagram": "https://www.instagram.com/bunnidoru/"
      }
    },
    {
      "id": "02",
      "name": "Usi",
      "color": "red",
      "accent": "#df4d62",
      "colorLabel": "Rojo",
      "photo": "images/usi.webp",
      "handle": "@usi__chan",
      "socials": {
        "instagram": "https://www.instagram.com/usi__chan/"
      }
    },
    {
      "id": "03",
      "name": "Vewe",
      "color": "yellow",
      "accent": "#c99a18",
      "colorLabel": "Amarillo",
      "photo": "images/vewe.webp",
      "handle": "@novvewe",
      "socials": {
        "instagram": "https://www.instagram.com/novvewe/"
      }
    },
    {
      "id": "04",
      "name": "Vali",
      "color": "purple",
      "accent": "#8f62bf",
      "colorLabel": "Morado",
      "photo": "images/vali.webp",
      "handle": "@vali_chuu",
      "socials": {
        "instagram": "https://www.instagram.com/vali_chuu/"
      }
    }
  ],
  // PRODUCTOS:
  // - "stock": null muestra "Disponibilidad por confirmar".
  // - "image" es la imagen principal y "gallery" alimentará el modal de detalle.
  // - Las imágenes se muestran con object-fit: contain; no se recortan ni alteran diseños/rostros.
  // - Para stock por variante usa "stockByVariant": { "01": 3, "02": 2 }.
  // - Cambia "active" a false para ocultar un producto sin borrar su información.
  "merch": [
    {
      "id": "01",
      "name": "Poleras estampadas",
      "note": "Tu color, tu member.",
      "description": "Poleras estampadas de Gimae disponibles por integrante y color. La imagen corresponde al diseño de referencia del producto; el estampado se presenta sin recortes ni modificaciones.",
      "price": 15000,
      "color": "pink",
      "active": true,
      "stock": null,
      "image": "images/merch/poleras.png",
      "imageAlt": "Cuatro poleras estampadas de Gimae en los colores de las integrantes",
      "gallery": [
        {
          "src": "images/merch/poleras.png",
          "alt": "Vista de las cuatro poleras estampadas de Gimae"
        }
      ],
      "variantLabel": "Color / integrante",
      "variantSource": "members"
    },
    {
      "id": "02",
      "name": "Lightstick",
      "note": "Lleva tu brillo al escenario.",
      "description": "Lightstick oficial de Gimae con el logotipo multicolor. La fotografía de producto se muestra completa para conservar proporciones y detalles.",
      "price": 8000,
      "color": "purple",
      "active": true,
      "stock": null,
      "image": "images/merch/lightstick.png",
      "imageAlt": "Lightstick de Gimae con logotipo multicolor",
      "gallery": [
        {
          "src": "images/merch/lightstick.png",
          "alt": "Vista completa del lightstick de Gimae"
        }
      ]
    },
    {
      "id": "03",
      "name": "Llaveros",
      "note": "Un pequeño amuleto idol.",
      "description": "Llaveros de las integrantes de Gimae con ilustración, lazo y cuentas en el color de cada member.",
      "price": 3000,
      "color": "yellow",
      "active": true,
      "stock": null,
      "image": "images/merch/llaveros.png",
      "imageAlt": "Cuatro llaveros de Gimae, uno por integrante",
      "gallery": [
        {
          "src": "images/merch/llaveros.png",
          "alt": "Vista conjunta de los cuatro llaveros de Gimae"
        }
      ],
      "variantLabel": "Integrante",
      "variantSource": "members"
    },
    {
      "id": "04",
      "name": "Chekis",
      "note": "Un recuerdo en formato instantáneo.",
      "description": "Chekis impresas en formato instantáneo. Puedes elegir la versión individual o grupal; el detalle mostrará la imagen correspondiente a la variante seleccionada.",
      "image": "images/merch/cheki-individual.png",
      "imageAlt": "Cheki individual de Gimae",
      "gallery": [
        {
          "src": "images/merch/cheki-individual.png",
          "alt": "Cheki individual de Gimae"
        },
        {
          "src": "images/merch/cheki-grupal.png",
          "alt": "Cheki grupal de las integrantes de Gimae"
        }
      ],
      "variantLabel": "Tipo",
      "prices": [
        {
          "id": "individual",
          "label": "Individual",
          "value": 4500,
          "image": "images/merch/cheki-individual.png",
          "imageAlt": "Cheki individual de Gimae"
        },
        {
          "id": "group",
          "label": "Grupal",
          "value": 5000,
          "image": "images/merch/cheki-grupal.png",
          "imageAlt": "Cheki grupal de las integrantes de Gimae"
        }
      ],
      "color": "pink",
      "active": true,
      "stock": null
    },
    {
      "id": "05",
      "name": "Postales",
      "note": "Un pedacito de nuestro universo.",
      "description": "Postales de Gimae. La imagen de producto todavía no está publicada en el catálogo; se mantendrá la tarjeta funcional hasta contar con el asset definitivo.",
      "price": 2000,
      "color": "red",
      "active": true,
      "stock": null,
      "image": null,
      "imageAlt": "",
      "gallery": []
    }
  ]
};
