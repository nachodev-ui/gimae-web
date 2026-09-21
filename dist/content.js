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
    // default conserva el diseño actual; la URL ?avatar-style= tiene prioridad.
    "dialogStyle": "default",
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
  // PRODUCTOS: "stock": null muestra "Disponibilidad por confirmar".
  // Reemplázalo por un entero cuando conozcas el stock. Para stock por variante usa,
  // por ejemplo, "stockByVariant": { "01": 3, "02": 2 } con los IDs reales de variante.
  // Cambia "active" a false para ocultar un producto sin borrar su información.
  "merch": [
    {
      "id": "01",
      "name": "Poleras estampadas",
      "note": "Tu color, tu member.",
      "price": 15000,
      "color": "pink",
      "active": true,
      "stock": null,
      "variantLabel": "Color / integrante",
      "variantSource": "members"
    },
    {
      "id": "02",
      "name": "Lightstick",
      "note": "Lleva tu brillo al escenario.",
      "price": 8000,
      "color": "purple",
      "active": true,
      "stock": null
    },
    {
      "id": "03",
      "name": "Llaveros",
      "note": "Un pequeño amuleto idol.",
      "price": 3000,
      "color": "yellow",
      "active": true,
      "stock": null
    },
    {
      "id": "04",
      "name": "Chekis",
      "note": "Un recuerdo en formato instantáneo.",
      "variantLabel": "Tipo",
      "prices": [
        {
          "id": "individual",
          "label": "Individual",
          "value": 4500
        },
        {
          "id": "group",
          "label": "Grupal",
          "value": 5000
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
      "price": 2000,
      "color": "red",
      "active": true,
      "stock": null
    }
  ]
};
