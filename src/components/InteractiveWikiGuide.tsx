import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  HelpCircle,
  Info,
  Laptop,
  MousePointerClick,
  Play,
  Server,
  Shirt,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

export interface WikiArticle {
  id: string;
  title: string;
  category: 'Ejecutables (Doble Clic)' | 'Archivos y Base de Datos' | 'Cerebro del Bot y Código' | 'Red y Servidor 24/7';
  shortSummary: string;
  fileLocation: string;
  plainExplanation: string;
  codeSnippet: string;
  lineByLineExplanation: Array<{ code: string; meaning: string }>;
  userActionRequired: string;
  relatedIds: string[];
}

export const WIKI_ARTICLES: Record<string, WikiArticle> = {
  win_bat: {
    id: 'win_bat',
    title: 'CLIC_AQUI_INICIAR_WINDOWS.bat (Ejecutable Doble Clic: Servidor + Baileys Local + PM2)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Archivo botón para Windows: al darle doble clic instala librerías, activa PM2 y enciende el Servidor Web + Bot Baileys Local juntos.',
    fileLocation: '/CLIC_AQUI_INICIAR_WINDOWS.bat (en la carpeta principal del proyecto)',
    plainExplanation:
      'Para que no tengas que abrir dos ventanas distintas ni escribir comandos en CMD, este archivo .bat hace todo con un solo doble clic: 1) Verifica Node.js e instala node_modules (con esbuild ^0.28.0), 2) Verifica o instala el guardián PM2, 3) Activa el Servidor Web y el Bot de WhatsApp Baileys Local juntos en segundo plano usando ecosystem.config.cjs (AUTO_START_BAILEYS=true), 4) Te abre automáticamente http://localhost:3000 y te muestra el código QR y los mensajes de WhatsApp en vivo.',
    codeSnippet: `@echo off
cd /d "%~dp0"
if not exist "node_modules\\" ( call npm install )
where pm2 >nul 2>nul || call npm install -g pm2
set AUTO_START_BAILEYS=true
call pm2 start ecosystem.config.cjs --update-env
call pm2 save
start "" "http://localhost:3000"
call pm2 logs formagym-bot-24-7 --lines 40`,
    lineByLineExplanation: [
      {
        code: 'cd /d "%~dp0"',
        meaning: 'Ubica automáticamente la carpeta donde descargaste el proyecto, sin importar si está en el Escritorio o en Descargas.',
      },
      {
        code: 'if not exist "node_modules\\" ( call npm install )',
        meaning: 'Si es la primera vez en esa computadora, descarga todas las librerías (incluyendo esbuild ^0.28.0 compatible con Vite 8).',
      },
      {
        code: 'where pm2 >nul 2>nul || call npm install -g pm2',
        meaning: 'Comprueba si tienes instalado el gestor 24/7 PM2. Si no está, lo instala automáticamente.',
      },
      {
        code: 'set AUTO_START_BAILEYS=true & call pm2 start ecosystem.config.cjs --update-env',
        meaning: 'Enciende en PM2 el servidor (server.ts) y activa el Bot Baileys Local integrado al mismo tiempo sin errores de HTML.',
      },
      {
        code: 'call pm2 logs formagym-bot-24-7 --lines 40',
        meaning: 'Muestra en pantalla el código QR de WhatsApp y cada mensaje que entra en tiempo real.',
      },
    ],
    userActionRequired:
      '¡Solo haz doble clic sobre CLIC_AQUI_INICIAR_WINDOWS.bat! Y cuando quieras apagarlo por completo, haz doble clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat.',
    relatedIds: ['pm2_manager', 'ecosystem_config', 'stop_bat', 'fix_unexpected_token', 'esbuild_028'],
  },

  mac_command: {
    id: 'mac_command',
    title: 'CLIC_AQUI_INICIAR_MAC.command (Ejecutable Doble Clic para Mac con PM2 + Baileys)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Archivo ejecutable para Mac que instala todo y activa el Servidor + Bot Baileys Local con PM2 al hacer doble clic.',
    fileLocation: '/CLIC_AQUI_INICIAR_MAC.command (en la carpeta principal del proyecto)',
    plainExplanation:
      'En computadoras Mac, este archivo .command funciona con doble clic desde Finder. Instala las librerías si faltan, instala PM2, activa el servidor junto con el Bot Baileys Local (AUTO_START_BAILEYS=true) mediante ecosystem.config.cjs y abre el navegador en http://localhost:3000.',
    codeSnippet: `#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then npm install; fi
if ! command -v pm2 >/dev/null 2>&1; then npm install -g pm2; fi
export AUTO_START_BAILEYS=true
pm2 start ecosystem.config.cjs --update-env
open "http://localhost:3000"
pm2 logs formagym-bot-24-7`,
    lineByLineExplanation: [
      {
        code: 'export AUTO_START_BAILEYS=true',
        meaning: 'Indica al servidor que encienda automáticamente el motor local de WhatsApp Baileys apenas arranque.',
      },
      {
        code: 'pm2 start ecosystem.config.cjs --update-env',
        meaning: 'Pone a correr el servidor y el bot en segundo plano 24/7 con auto-reinicio automático.',
      },
      {
        code: 'open "http://localhost:3000"',
        meaning: 'Abre Safari o Chrome directamente en el panel de control de FormaGym.',
      },
    ],
    userActionRequired:
      'Haz doble clic en CLIC_AQUI_INICIAR_MAC.command. Para apagarlo usa apagar_servidor_y_pm2_mac_linux.sh.',
    relatedIds: ['pm2_manager', 'ecosystem_config', 'linux_sh', 'server_ts'],
  },

  linux_sh: {
    id: 'linux_sh',
    title: 'iniciar_local_mac_linux.sh (Iniciador Automático con PM2 + Baileys para Linux/Mac)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Script universal para Linux o Mac que activa el servidor web y Baileys Local dentro de PM2.',
    fileLocation: '/iniciar_local_mac_linux.sh (en la carpeta principal del proyecto)',
    plainExplanation:
      'Es el archivo de arranque automático para Linux y Mac. Verifica node_modules, activa PM2 con ecosystem.config.cjs y mantiene encendido tanto el panel como el bot de WhatsApp Baileys.',
    codeSnippet: `#!/usr/bin/env bash
cd "$(dirname "$0")"
export AUTO_START_BAILEYS=true
pm2 start ecosystem.config.cjs --update-env
pm2 save`,
    lineByLineExplanation: [
      {
        code: 'export AUTO_START_BAILEYS=true',
        meaning: 'Activa el bot local de WhatsApp integrado en server.ts sin necesidad de correr otro script manual aparte.',
      },
      {
        code: 'pm2 start ecosystem.config.cjs --update-env',
        meaning: 'Inicia el proceso formagym-bot-24-7 administrado por PM2.',
      },
    ],
    userActionRequired:
      'Ejecútalo con doble clic o desde terminal con ./iniciar_local_mac_linux.sh.',
    relatedIds: ['pm2_manager', 'mac_command', 'win_bat', 'server_ts'],
  },

  git_clone: {
    id: 'git_clone',
    title: 'Descargar el Proyecto (Botón "Download ZIP" o git clone)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Cómo pasar el programa a cualquier computadora nueva en 1 minuto usando un archivo ZIP o Git.',
    fileLocation: 'Carpeta completa del proyecto en tu Escritorio o Documentos',
    plainExplanation:
      'Cuando tienes el proyecto en GitHub o en una carpeta, NO necesitas escribir comandos complicados para pasarlo a otra computadora. Tienes dos formas súper simples: (1) En la página de GitHub haz clic en el botón verde "<> Code" y luego en "Download ZIP", descomprime esa carpeta en el Escritorio y dale doble clic a CLIC_AQUI_INICIAR_WINDOWS.bat. O (2) si usas Git, descarga la carpeta con git clone.',
    codeSnippet: `# Opción A (Sin comandos):
1. Clic en botón verde "<> Code" -> "Download ZIP"
2. Extraer carpeta en el Escritorio
3. Doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat

# Opción B (Con Git instalado):
git clone <URL_DE_TU_REPOSITORIO>`,
    lineByLineExplanation: [
      {
        code: 'Download ZIP',
        meaning: 'Descarga todos los archivos del gimnasio comprimidos en un solo archivo .zip para que no uses ningún comando.',
      },
      {
        code: 'git clone <URL>',
        meaning: 'Si eres programador o tienes Git, copia toda la carpeta del proyecto directamente a tu computadora.',
      },
    ],
    userActionRequired:
      'Usa "Download ZIP" si la persona que usará la computadora no sabe nada de programación. Luego solo tendrá que hacer doble clic en el ejecutable.',
    relatedIds: ['win_bat', 'mac_command', 'nodejs'],
  },

  nodejs: {
    id: 'nodejs',
    title: 'Node.js (El Motor Gratuito que Ejecuta el Programa)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Programa gratuito que se instala una sola vez en la computadora (como instalar Word o Chrome) para que el sistema funcione.',
    fileLocation: 'https://nodejs.org (Se instala en Windows o Mac con Siguiente -> Siguiente)',
    plainExplanation:
      'Así como necesitas tener instalado Excel para abrir un archivo de Excel, tu computadora necesita tener instalado Node.js para poder encender el servidor del gimnasio y el bot de WhatsApp. Es 100% gratuito, seguro y se instala una sola vez en la vida haciendo clic en el botón verde "LTS" en nodejs.org.',
    codeSnippet: `Página oficial: https://nodejs.org
Versión recomendada: 20 LTS o 22 LTS (Botón Verde)
Instalación: Doble clic al instalador -> Siguiente -> Siguiente -> Finalizar`,
    lineByLineExplanation: [
      {
        code: 'Node.js LTS',
        meaning: 'Es el motor que permite que el archivo server.ts y la conexión de WhatsApp (Baileys) funcionen en tu computadora las 24 horas.',
      },
      {
        code: 'npm (Incluido dentro de Node.js)',
        meaning: 'Se instala automáticamente junto con Node.js y sirve para descargar sola la carpeta node_modules la primera vez que abres el ejecutable.',
      },
    ],
    userActionRequired:
      'En una computadora nueva, entra una sola vez a nodejs.org, descarga el instalador LTS e instálalo. Después de eso, los ejecutables de doble clic harán todo lo demás.',
    relatedIds: ['win_bat', 'node_modules', 'server_ts'],
  },

  node_modules: {
    id: 'node_modules',
    title: 'Carpeta node_modules y package.json (Piezas Automáticas)',
    category: 'Archivos y Base de Datos',
    shortSummary: 'Carpeta que se crea sola la primera vez que haces doble clic en el ejecutable y guarda las piezas internas del sistema.',
    fileLocation: '/node_modules/ y /package.json',
    plainExplanation:
      'Cuando descargas un proyecto con git clone o en ZIP, la carpeta node_modules no viene adentro porque es pesada. ¡Pero no tienes que hacer nada! Cuando haces doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat (o en el de Mac/Linux), el ejecutable detecta que falta node_modules, lee la lista de materiales en package.json y descarga todo automáticamente en 1 minuto.',
    codeSnippet: `// Dentro de package.json están anotadas las piezas que se instalan solas:
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.16", // Conexión a WhatsApp
    "express": "^4.21.2",                // Servidor Web Local
    "react": "^19.0.0"                   // Pantallas del Panel
  }
}`,
    lineByLineExplanation: [
      {
        code: '"@whiskeysockets/baileys"',
        meaning: 'Pieza que conecta el bot con el WhatsApp del gimnasio mediante código QR o código de 8 dígitos.',
      },
      {
        code: '"express"',
        meaning: 'Pieza que crea la página web local en http://localhost:3000 y guarda los datos en el disco duro.',
      },
      {
        code: '"react"',
        meaning: 'Pieza que dibuja las tablas, botones, gráficas y pestañas que ves en pantalla.',
      },
    ],
    userActionRequired:
      'No tienes que tocar ni borrar nunca esta carpeta. Se crea sola la primera vez que inicias el programa.',
    relatedIds: ['win_bat', 'baileys_lib', 'server_ts'],
  },

  db_json: {
    id: 'db_json',
    title: 'data/gym-local-db.json y formagym_local_db.json (La Base de Datos en tu Disco Duro)',
    category: 'Archivos y Base de Datos',
    shortSummary: 'El archivo físico donde se guardan todas tus membresías, inscripciones, pagos de ropa, productos, precios y reportes.',
    fileLocation: '/data/gym-local-db.json (y espejo en /formagym_local_db.json)',
    plainExplanation:
      '¡Aquí es donde va a parar toda la información de tu gimnasio! Cada vez que agregas un miembro, cambias el precio en dólares o bolívares, apruebas un pago, registras un pago de ropa o eliminas un producto, el código escribe instantáneamente los cambios en este archivo dentro de tu disco duro. Si apagas la computadora y la prendes mañana, el servidor lee este archivo y todo sigue exactamente igual.',
    codeSnippet: `{
  "settings": {
    "businessName": "FormaGym",
    "membershipMonthlyUsd": 30,
    "registrationUsd": 15,
    "activeRate": 68.45
  },
  "memberships": [ ... ],
  "products": [ ... ],
  "shopOrders": [ ... ],
  "deletedMemberships": [ ... ]
}`,
    lineByLineExplanation: [
      {
        code: '"settings"',
        meaning: 'Guarda el nombre del gimnasio, la tasa BCV/Euro/Manual activa, el precio de la mensualidad ($30), el precio de la inscripción vitalicia ($15) y los números de teléfono.',
      },
      {
        code: '"memberships"',
        meaning: 'Guarda la lista completa de clientes, sus cédulas, fechas de vencimiento y si ya tienen pagada la Inscripción Vitalicia (isRegistered: true).',
      },
      {
        code: '"products" y "shopOrders"',
        meaning: 'Guarda todos los productos de la tienda (jugos, agua, suplementos) y todos los pagos recibidos (incluyendo los pagos del Gestor de Ropa).',
      },
      {
        code: '"deletedMemberships", "deletedProducts", "deletedShopOrders"',
        meaning: 'Guarda el historial de eliminados. Si vacías el reporte de eliminados, también se limpia aquí para que no vuelva a reaparecer al recargar.',
      },
    ],
    userActionRequired:
      'Se guarda 100% solo. Si algún día cambias de computadora, solo copia el archivo data/gym-local-db.json a un pendrive (o usa el botón verde "Descargar Base de Datos en Excel / JSON" de arriba).',
    relatedIds: ['server_ts', 'app_tsx', 'clothes_manager'],
  },

  baileys_auth: {
    id: 'baileys_auth',
    title: 'Carpeta baileys_auth_info (La Memoria del Código QR de WhatsApp)',
    category: 'Archivos y Base de Datos',
    shortSummary: 'Carpeta donde se guarda la sesión vinculada de tu WhatsApp para que NO tengas que escanear el código QR cada vez que prendas la PC.',
    fileLocation: '/baileys_auth_info/creds.json',
    plainExplanation:
      'Cuando vinculas el WhatsApp del gimnasio escaneando el Código QR o metiendo el código de 8 dígitos en esta pestaña de Configuración, el programa crea automáticamente la carpeta baileys_auth_info. Adentro guarda las llaves encriptadas de tu sesión de WhatsApp Web. Gracias a esta carpeta, cuando reinicies la computadora y hagas doble clic en el ejecutable, el bot se reconectará solo a WhatsApp en 3 segundos sin pedirte QR.',
    codeSnippet: `const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');
sock.ev.on('creds.update', saveCreds);`,
    lineByLineExplanation: [
      {
        code: "useMultiFileAuthState('./baileys_auth_info')",
        meaning: 'Lee los archivos de sesión guardados en la carpeta baileys_auth_info al encender el servidor.',
      },
      {
        code: "sock.ev.on('creds.update', saveCreds)",
        meaning: 'Cada vez que WhatsApp actualiza la llave de seguridad, la guarda inmediatamente en disco para mantener la sesión viva 24/7.',
      },
    ],
    userActionRequired:
      'No la borres si quieres que tu WhatsApp siga conectado siempre. Solo si algún día quieres cambiar el número de teléfono del bot, usa el botón rojo "Desconectar / Cambiar Número" aquí en Configuración.',
    relatedIds: ['baileys_lib', 'server_ts'],
  },

  server_ts: {
    id: 'server_ts',
    title: 'server.ts (El Cerebro Central del Sistema y del Bot)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'El archivo principal de código que mantiene encendida la página web, guarda la base de datos en disco y responde los mensajes de WhatsApp.',
    fileLocation: '/server.ts',
    plainExplanation:
      'Piensa en server.ts como el gerente del gimnasio que trabaja las 24 horas. Cumple 4 tareas al mismo tiempo: (1) Muestra la página web en el puerto 3000, (2) Guarda cada cambio en el archivo data/gym-local-db.json, (3) Consulta la tasa oficial del BCV automáticamente cada hora, y (4) Escucha cada mensaje o foto de Pago Móvil que entra al WhatsApp para responderle al cliente y avisarle a los encargados.',
    codeSnippet: `// Estructura principal de server.ts:
1. loadPersistedState() / savePersistedState() -> Lee y guarda la base de datos en disco
2. refreshOfficialBcvRates()                   -> Actualiza la tasa BCV en vivo
3. startServerBaileysConnection()              -> Conecta el WhatsApp del gimnasio
4. evaluateSmartSpanishBot()                   -> Analiza lo que escribe el cliente y responde`,
    lineByLineExplanation: [
      {
        code: 'loadPersistedState() / savePersistedState()',
        meaning: 'Garantiza que todo lo que hagas en el panel quede grabado en el disco duro al instante.',
      },
      {
        code: 'refreshOfficialBcvRates()',
        meaning: 'Se conecta a las fuentes oficiales del BCV para mantener al día el precio del dólar y euro en bolívares.',
      },
      {
        code: 'evaluateSmartSpanishBot()',
        meaning: 'Es la función inteligente que entiende español venezolano: sabe cuándo alguien pregunta precios, cuándo envía un Pago Móvil de membresía, inscripción o ropa, y cuándo un Admin aprueba un pago.',
      },
    ],
    userActionRequired:
      'Nunca necesitas editar este archivo a mano. Todo se configura desde las casillas de esta pestaña de Configuración y los ejecutables lo encienden solo.',
    relatedIds: ['bot_brain', 'db_json', 'bcv_rate', 'clothes_manager'],
  },

  app_tsx: {
    id: 'app_tsx',
    title: 'src/App.tsx (El Panel Visual que Ves en el Navegador)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'El código visual que dibuja las pestañas de Membresías, Aprobar Pagos, Gráficas, Tienda/Precios, Eliminados y Configuración.',
    fileLocation: '/src/App.tsx y /src/components/',
    plainExplanation:
      'Mientras server.ts trabaja por detrás, src/App.tsx es la pantalla visual que usas con el ratón. Cada 4 segundos se comunica silenciosamente con server.ts para preguntarle: "¿Llegó algún pago nuevo por WhatsApp?" Si llegó un pago nuevo o un Admin aprobó algo desde su celular, la tabla se actualiza sola frente a tus ojos sin que tengas que recargar la página. Además incluye la Vista Pública para Clientes (/?vista=cliente).',
    codeSnippet: `// Sincronización automática en src/App.tsx:
useEffect(() => {
  fetch('/api/state') // Carga membresías, pagos de tienda/ropa y configuración
  fetch('/api/state/sync', { method: 'POST', body: JSON.stringify(snapshot) })
}, []);`,
    lineByLineExplanation: [
      {
        code: "fetch('/api/state')",
        meaning: 'Trae del servidor todas las membresías, pedidos de ropa/tienda y precios guardados para que al recargar la página nunca se pierda nada.',
      },
      {
        code: "fetch('/api/state/sync')",
        meaning: 'Cada vez que creas, editas o borras algo en la web, se lo envía inmediatamente al servidor para guardarlo en el disco duro.',
      },
    ],
    userActionRequired:
      'Solo úsalo normalmente desde tu navegador en http://localhost:3000 o desde tu enlace web.',
    relatedIds: ['server_ts', 'db_json', 'localhost_3000'],
  },

  bot_brain: {
    id: 'bot_brain',
    title: 'evaluateSmartSpanishBot() (Cómo Responde el Bot de WhatsApp)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'La lógica paso a paso con la que el bot atiende a los clientes, revisa quién es Admin y reenvía los pagos al número correspondiente.',
    fileLocation: '/server.ts (función evaluateSmartSpanishBot)',
    plainExplanation:
      'Cada vez que entra un mensaje de WhatsApp, esta función revisa primero quién está escribiendo: ¿Es un número de Administrador (Admin Numbers) o es un Cliente? Si es un Admin escribiendo "aprobado 0414..." o "inscrito 0414...", ejecuta la orden y le avisa al cliente. Si es un Cliente, le muestra los precios en Bolívares, le pregunta si ya tiene Inscripción Vitalicia o si va a pagar ropa/productos, recibe la foto del Pago Móvil y la reenvía al teléfono encargado.',
    codeSnippet: `// Resumen de decisiones del Bot:
if (esNumeroAdmin && mensaje === "aprobado 0414...") {
  aprobarPagoYActivarMembresia();
} else if (clienteEnviaPagoDeRopa) {
  preguntarQuePrendaDeRopaPagoYRegistrarEnCola();
} else if (clientePideMembresia) {
  verificarInscripcionVitaliciaYCobrar();
}`,
    lineByLineExplanation: [
      {
        code: 'if (esNumeroAdmin)',
        meaning: 'Reconoce los teléfonos agregados en "Admin Numbers". Les permite aprobar pagos o verificar inscripciones por WhatsApp, pero NUNCA les manda spam de captures de clientes.',
      },
      {
        code: 'else if (clienteEnviaPagoDeRopa)',
        meaning: 'Si el cliente quiere pagar ropa deportiva, le pide su comprobante y que escriba qué prenda pagó para que el administrador lo confirme.',
      },
      {
        code: 'else if (clientePideMembresia)',
        meaning: 'Revisa si el cliente ya tiene pagada la Inscripción Vitalicia ($15) o si es nuevo, y calcula el monto exacto en Bolívares.',
      },
    ],
    userActionRequired:
      'Funciona automáticamente. Puedes personalizar los precios, horarios y teléfonos en el formulario de abajo.',
    relatedIds: ['registration_flow', 'clothes_manager', 'receipt_scanner'],
  },

  clothes_manager: {
    id: 'clothes_manager',
    title: 'Gestor de Pagos de Ropa — Catálogo Abierto (Sin Precio, Sin Stock ni Nombre Fijo)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Módulo especial que gestiona los pagos de ropa deportiva sin obligarte a subir un catálogo con precios ni inventario.',
    fileLocation: '/src/components/ShopSection.tsx y /server.ts',
    plainExplanation:
      'Como la ropa del gimnasio es un catálogo completo y variado que cambia constantemente, en lugar de crear productos con precio fijo o stock, el sistema tiene un "Gestor de Pagos de Ropa". Cuando un cliente escribe por WhatsApp que quiere pagar ropa (o envía su Pago Móvil diciendo que es de ropa), el bot le pide que envíe el pago normal y que escriba exactamente qué prenda pagó (ej. "Conjunto deportivo negro talla M"). Si manda primero el capture sin decir qué prenda fue, el bot le pregunta: "¿Qué prenda(s) de ropa estás pagando?" y registra el pago con esa descripción en la cola para que tú lo confirmes.',
    codeSnippet: `// Cuando un cliente envía un pago de ropa en server.ts:
if (isClothesFlow && !clothesDescription) {
  return "👕 Recibimos los datos de tu pago. Por favor responde indicando qué prenda(s) de ropa pagaste (ej. Franela negra talla M) para confirmarlo.";
}
// Al indicar qué ropa pagó, se crea el registro en cola:
createShopOrder({
  categoryGroup: 'ropa',
  itemsSummary: 'Ropa (Catálogo): ' + clothesDescription,
  status: 'pending_approval'
});`,
    lineByLineExplanation: [
      {
        code: "categoryGroup: 'ropa'",
        meaning: 'Marca el pago como Ropa del Catálogo Abierto (sin descontar stock ni exigir un precio fijo de lista).',
      },
      {
        code: "itemsSummary: 'Ropa (Catálogo): ' + clothesDescription",
        meaning: 'Guarda exactamente lo que el cliente dijo que pagó (ej. "Lycra azul talla S y franela blanca") para que lo veas claro al aprobar.',
      },
      {
        code: 'ownerPhoneMemberships',
        meaning: 'Reenvía la foto del comprobante y la descripción de la ropa al teléfono encargado de Membresías y Ropa para su confirmación.',
      },
    ],
    userActionRequired:
      'Puedes ver, registrar y confirmar todos los pagos de ropa tanto en la pestaña "Tienda y Precios" (en el cuadro morado de Gestor de Pagos de Ropa) como en la pestaña "Aprobar Pagos".',
    relatedIds: ['bot_brain', 'receipt_scanner', 'db_json'],
  },

  registration_flow: {
    id: 'registration_flow',
    title: 'Inscripción Vitalicia ($15) + Membresía Mensual (Cómo Funciona en el Código)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Cómo el sistema controla que toda persona tenga su Inscripción de por vida antes de pagar la mensualidad.',
    fileLocation: '/server.ts y /src/components/ShopSection.tsx',
    plainExplanation:
      'En el gimnasio existen dos cobros: la Inscripción ($15 por defecto, atada a la misma tasa que la membresía) que se paga UNA SOLA VEZ EN LA VIDA, y la Membresía Mensual que se renueva cada mes. Cuando alguien quiere pagar la membresía y no aparece como inscrito en la base de datos, el bot le pregunta si es nuevo (para cobrarle Inscripción + Mensualidad juntas) o si ya estaba inscrito antes. Si dice que ya estaba inscrito, el bot le pide su Cédula, Nombre y Apellido y le pregunta a un Admin para que confirme si de verdad está inscrito.',
    codeSnippet: `// Cálculo automático con la misma tasa de la membresía:
const registrationBs = registrationUsd * settings.activeRate;
const comboNuevoClienteBs = (membershipMonthlyUsd + registrationUsd) * settings.activeRate;

// Una vez aprobado, queda registrado de por vida:
member.isRegistered = true;
member.registrationStatus = 'verified';`,
    lineByLineExplanation: [
      {
        code: 'registrationUsd * settings.activeRate',
        meaning: 'Multiplica el precio en dólares de la inscripción (ej. $15) por la misma tasa activa de la membresía para dar el monto en Bolívares.',
      },
      {
        code: 'member.isRegistered = true',
        meaning: 'Marca al cliente como "Inscrito Vitalicio (De por vida)". En los próximos meses el bot ya lo reconoce y solo le cobra la mensualidad.',
      },
      {
        code: "registrationStatus = 'pending_verification'",
        meaning: 'Cuando un cliente dice "Ya estoy inscrito", el bot guarda su Cédula, Nombre y Apellido y pone un botón en el panel (y envía un mensaje al Admin) para verificar si es verdad.',
      },
    ],
    userActionRequired:
      'Puedes cambiar el valor de la Inscripción ($15) cuando quieras en "Tienda y Precios" o aquí abajo en "Configuración", y se actualizará con la misma tasa de la membresía.',
    relatedIds: ['bot_brain', 'bcv_rate', 'db_json'],
  },

  receipt_scanner: {
    id: 'receipt_scanner',
    title: 'Escáner de Comprobantes de Pago Móvil (Lectura de Monto en Bs. y Operación)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Cómo el código lee automáticamente los Bolívares ("19.540,00 Bs") y el número de Operación de las capturas de Pago Móvil.',
    fileLocation: '/server.ts (extractVenezuelanBsAmountsFromText y extractOperationIdentifier)',
    plainExplanation:
      'Cuando un cliente envía una foto de su comprobante de Pago Móvil (Banco de Venezuela, Banesco, Mercantil, Provincial, etc.) o escribe los datos del pago, el código busca automáticamente dos cosas clave: el monto pagado en Bolívares y los dígitos de la "Operación" o "Referencia". Luego te muestra en la pestaña "Aprobar Pagos" el monto escaneado ARRIBA y el monto que debería decir ABAJO para que apruebes con un solo clic.',
    codeSnippet: `// Detecta números de Operación / Referencia (6 a 16 dígitos):
const opMatch = text.match(/(?:operaci[oó]n|referencia|ref)[:\\s#.-]*(\\d{5,16})/i);

// Compara el monto escaneado contra el monto esperado:
const diffBs = Math.abs(scannedAmountBs - expectedAmountBs);`,
    lineByLineExplanation: [
      {
        code: 'extractOperationIdentifier()',
        meaning: 'Extrae el número único de operación bancaria (ej. 007583657705) para evitar recibos repetidos.',
      },
      {
        code: 'scannedAmountBs vs expectedAmountBs',
        meaning: 'Compara cuántos Bolívares dice la captura contra cuántos Bolívares costaba la membresía o producto, avisándote si el pago está completo o si hay diferencia.',
      },
    ],
    userActionRequired:
      'Revisa las tarjetas en la pestaña "Aprobar Pagos" y pulsa el botón verde "Aprobar" cuando verifiques el comprobante.',
    relatedIds: ['bot_brain', 'clothes_manager'],
  },

  bcv_rate: {
    id: 'bcv_rate',
    title: 'Tasa BCV Automática y Botón "Aplicar Tasa" en la Tienda',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Cómo el sistema descarga el precio del Dólar/Euro BCV y recalcula todos los precios en Bolívares sin mostrarle la tasa al cliente.',
    fileLocation: '/server.ts (refreshOfficialBcvRates) y /src/components/ShopSection.tsx',
    plainExplanation:
      'El servidor busca automáticamente en internet la tasa oficial del Banco Central de Venezuela (Dólar BCV y Euro BCV) cada vez que arranca y cada 60 minutos. Además, en la pestaña "Tienda y Precios", cuando escribes un precio en Dólares ($), tienes un botón directo llamado "Aplicar Tasa" (tanto al crear un producto como en cada fila de la lista) para que recalcule inmediatamente los Bolívares sin tener que cambiar a otra tasa y regresar.',
    codeSnippet: `// Cálculo instantáneo al pulsar "Aplicar Tasa":
const rateVal = getRateForMode(product.rateMode); // Dólar BCV, Euro BCV o Manual
const nuevoPrecioBs = Number((precioUsd * rateVal).toFixed(2));`,
    lineByLineExplanation: [
      {
        code: 'getRateForMode(product.rateMode)',
        meaning: 'Toma la tasa elegida para ese producto o membresía (Dólar BCV, Euro BCV o Tasa Manual).',
      },
      {
        code: 'precioUsd * rateVal',
        meaning: 'Multiplica el precio en dólares por la tasa y guarda el precio exacto en Bolívares que el bot le dirá a los clientes.',
      },
    ],
    userActionRequired:
      'Si cambias un precio en dólares en la tienda, el precio en Bs. cambia al instante o puedes pulsar el botón azul "Aplicar Tasa" al lado del producto.',
    relatedIds: ['server_ts', 'registration_flow'],
  },

  baileys_lib: {
    id: 'baileys_lib',
    title: '@whiskeysockets/baileys (Conexión Gratuita a WhatsApp)',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Tecnología que vincula el WhatsApp del gimnasio directamente desde tu computadora sin pagar mensualidades ni APIs externas.',
    fileLocation: '/server.ts (startServerBaileysConnection)',
    plainExplanation:
      'Normalmente las empresas cobran por cada mensaje de WhatsApp, pero FormaGym utiliza @whiskeysockets/baileys. Esta librería hace exactamente lo mismo que cuando abres "WhatsApp Web" en tu navegador: vincula el programa como un "Dispositivo Vinculado" de tu teléfono. Así el bot puede leer y responder mensajes gratis las 24 horas.',
    codeSnippet: `const sock = makeWASocket({
  version,
  auth: state,
  browser: ['FormaGym Panel 24/7', 'Chrome', '1.0.0'],
});`,
    lineByLineExplanation: [
      {
        code: 'makeWASocket(...)',
        meaning: 'Abre el canal directo entre tu servidor local y WhatsApp.',
      },
      {
        code: "browser: ['FormaGym Panel 24/7', 'Chrome', '1.0.0']",
        meaning: 'Hace que en tu celular (en Dispositivos Vinculados) aparezca identificado claramente como Chrome / FormaGym.',
      },
    ],
    userActionRequired:
      'Solo vincula tu teléfono una vez usando el botón "Generar Código QR" o "Obtener Código de 8 Dígitos" un poco más abajo en esta misma pestaña.',
    relatedIds: ['baileys_auth', 'server_ts'],
  },

  localhost_3000: {
    id: 'localhost_3000',
    title: 'http://localhost:3000 (Cómo Abrir el Panel en tu Computadora)',
    category: 'Red y Servidor 24/7',
    shortSummary: 'La dirección web interna que abre el sistema cuando lo estás corriendo en tu propia computadora.',
    fileLocation: 'Barra de direcciones de tu navegador (Chrome, Edge, Safari)',
    plainExplanation:
      'La palabra "localhost" significa "esta misma computadora" y "3000" es el número de puerta (puerto) por donde atiende el programa de FormaGym. Cuando haces doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat, él abre http://localhost:3000 automáticamente por ti. Funciona incluso si el internet está lento porque corre directo en tu máquina.',
    codeSnippet: `Panel Administrativo en tu PC:
http://localhost:3000

Catálogo Público para Clientes en tu PC:
http://localhost:3000/?vista=cliente`,
    lineByLineExplanation: [
      {
        code: 'http://localhost:3000',
        meaning: 'Abre el panel administrativo completo en la computadora donde encendiste el ejecutable.',
      },
      {
        code: 'http://localhost:3000/?vista=cliente',
        meaning: 'Abre la página pública que solo muestra precios y productos disponibles para los clientes.',
      },
    ],
    userActionRequired:
      'Guarda http://localhost:3000 en la barra de Favoritos (Marcadores) de tu navegador para entrar con un clic.',
    relatedIds: ['lan_wifi', 'win_bat', 'pm2_server'],
  },

  lan_wifi: {
    id: 'lan_wifi',
    title: 'Dirección Wi-Fi Local (Abrir el Panel desde tu Celular en el Gimnasio)',
    category: 'Red y Servidor 24/7',
    shortSummary: 'Cómo entrar al panel de FormaGym desde cualquier teléfono o tablet conectada al mismo Wi-Fi del gimnasio.',
    fileLocation: 'Red Wi-Fi Local del Gimnasio (ej. http://192.168.1.X:3000)',
    plainExplanation:
      'Cuando enciendes el programa en la computadora de recepción del gimnasio, el servidor escucha en toda tu red Wi-Fi (`0.0.0.0:3000`). Eso significa que si conectas tu celular o una tablet al mismo Wi-Fi del gimnasio y escribes la dirección IP local de la computadora (aparece en la barra negra al iniciar), puedes usar todo el panel desde tu celular sin pagar hosting.',
    codeSnippet: `app.listen(3000, '0.0.0.0', () => {
  // Escucha tanto en localhost como en el Wi-Fi del gimnasio
});`,
    lineByLineExplanation: [
      {
        code: "'0.0.0.0'",
        meaning: 'Permite que otros celulares o laptops dentro del mismo Wi-Fi del gimnasio puedan entrar al sistema.',
      },
    ],
    userActionRequired:
      'Mira la dirección "Desde Celulares en el Wi-Fi" que aparece abajo y ábrela en el navegador de tu teléfono.',
    relatedIds: ['localhost_3000', 'pm2_server'],
  },

  pm2_server: {
    id: 'pm2_server',
    title: 'Convertir tu PC en un Servidor 24/7 Permanente (o Usar Cloudflare / Hosting)',
    category: 'Red y Servidor 24/7',
    shortSummary: 'Cómo dejar la computadora del gimnasio funcionando las 24 horas sin que se suspenda, o abrir un enlace público hacia internet.',
    fileLocation: 'Configuración de Energía de Windows/Mac + PM2 24/7',
    plainExplanation:
      'Para que tu computadora sea un servidor 24/7 por ti mismo solo necesitas dos cosas súper simples: (1) En la configuración de Windows o Mac, pon "Nunca" en "Suspender la pantalla/equipo cuando esté enchufado a la corriente", y (2) Haz doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat. Como el ejecutable ya activa PM2 + Baileys Local automáticamente, el bot de WhatsApp atenderá a clientes las 24 horas aunque cierres la ventana negra.',
    codeSnippet: `# Para dejar tu PC como servidor 24/7 sin comandos:
1. En Windows: Configuración -> Sistema -> Inicio/Apagado y suspensión -> "Nunca" suspender.
2. Doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat (activa PM2 + Baileys Local automáticamente).
3. Para apagar el servidor cuando quieras: Doble clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat.`,
    lineByLineExplanation: [
      {
        code: 'Suspensión -> "Nunca"',
        meaning: 'Evita que Windows se duerma en la noche, manteniendo el bot de WhatsApp despierto las 24 horas.',
      },
      {
        code: 'CLIC_AQUI_INICIAR_WINDOWS.bat',
        meaning: 'Enciende el servidor y el bot de WhatsApp dentro del guardián PM2 para que nunca se apague por error.',
      },
    ],
    userActionRequired:
      'Desactiva el modo suspensión de tu PC y ejecuta CLIC_AQUI_INICIAR_WINDOWS.bat.',
    relatedIds: ['pm2_manager', 'ecosystem_config', 'stop_bat', 'win_bat'],
  },

  pm2_manager: {
    id: 'pm2_manager',
    title: 'PM2 (Qué es, Cómo Funciona, Cómo Configurarlo y Cómo Apagarlo)',
    category: 'Red y Servidor 24/7',
    shortSummary: 'El guardián automático en segundo plano que mantiene vivo el Servidor Web + Bot Baileys Local 24/7 y los reinicia si algo falla.',
    fileLocation: 'Instalado automáticamente por el Doble Clic y configurado en /ecosystem.config.cjs',
    plainExplanation:
      'PM2 (Process Manager 2) es un programa guardián que corre escondido en el fondo de tu computadora. ¿Qué hace? Vigila a FormaGym y al Bot de WhatsApp las 24 horas del día. ¿Cómo lo hace? Cuando haces doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat, PM2 lee el archivo ecosystem.config.cjs y crea un servicio en segundo plano llamado "formagym-bot-24-7" con la variable AUTO_START_BAILEYS=true. Si por algún bajón de internet o pico de memoria el servidor se cierra, PM2 lo detecta en menos de 3 segundos y lo vuelve a encender automáticamente sin perder tu sesión de WhatsApp.',
    codeSnippet: `# 1. CÓMO ENCENDERLO (Automático con Doble Clic en CLIC_AQUI_INICIAR_WINDOWS.bat o por comando):
npm run pm2:start
# (Equivale a: pm2 start ecosystem.config.cjs --update-env && pm2 save)

# 2. CÓMO VER EL ESTADO Y LOS MENSAJES / QR EN VIVO:
pm2 status
npm run pm2:logs

# 3. CÓMO APAGARLO (Con Doble Clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat o por comando):
npm run pm2:stop     # Pausa el servidor y el bot
npm run pm2:delete   # Lo quita por completo de PM2
pm2 kill             # Apaga todo el motor PM2`,
    lineByLineExplanation: [
      {
        code: 'pm2 start ecosystem.config.cjs --update-env',
        meaning: 'Lee la receta de ecosystem.config.cjs y arranca server.ts junto con Baileys Local (AUTO_START_BAILEYS=true) en segundo plano.',
      },
      {
        code: 'pm2 status',
        meaning: 'Muestra una tablita indicando que "formagym-bot-24-7" está "online" (encendido), cuánta memoria usa y cuánto tiempo lleva activo.',
      },
      {
        code: 'pm2 logs formagym-bot-24-7 (o npm run pm2:logs)',
        meaning: 'Muestra en vivo el código QR de WhatsApp y cada mensaje que entra o responde el bot.',
      },
      {
        code: 'pm2 stop formagym-bot-24-7 / APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat',
        meaning: 'Apaga inmediatamente el servidor y desconecta el bot de WhatsApp cuando quieras detener el sistema.',
      },
    ],
    userActionRequired:
      'Para encenderlo: Doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat. Para apagarlo: Doble clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat.',
    relatedIds: ['ecosystem_config', 'stop_bat', 'win_bat', 'fix_unexpected_token'],
  },

  ecosystem_config: {
    id: 'ecosystem_config',
    title: 'ecosystem.config.cjs (Archivo que Une el Servidor + Baileys Local en PM2)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'El archivo de configuración que le ordena a PM2 encender tanto el servidor web como el Bot Baileys Local al mismo tiempo.',
    fileLocation: '/ecosystem.config.cjs (en la carpeta principal del proyecto)',
    plainExplanation:
      'Antes tenías que encender el servidor por un lado y el bot manual de Baileys por otro. Ahora ecosystem.config.cjs une ambos en un solo proceso: le ordena a PM2 arrancar server.ts con AUTO_START_BAILEYS: "true". Así, apenas prende el servidor en el puerto 3000, el motor local de Baileys se activa adentro del mismo servidor sin chocar ni dar errores de HTML.',
    codeSnippet: `module.exports = {
  apps: [{
    name: 'formagym-bot-24-7',
    script: './node_modules/tsx/dist/cli.mjs',
    args: 'server.ts',
    autorestart: true,
    max_memory_restart: '750M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      AUTO_START_BAILEYS: 'true'
    }
  }]
};`,
    lineByLineExplanation: [
      {
        code: "name: 'formagym-bot-24-7'",
        meaning: 'Es el nombre del proceso dentro de PM2 para controlarlo fácilmente.',
      },
      {
        code: "AUTO_START_BAILEYS: 'true'",
        meaning: 'Activa el Bot Baileys Local automáticamente al iniciar el servidor, migrando tu sesión previa si ya habías escaneado el QR.',
      },
      {
        code: 'autorestart: true',
        meaning: 'Le ordena a PM2 revivir el servidor y el bot automáticamente si algún día se cierra.',
      },
    ],
    userActionRequired:
      'No necesitas editarlo; CLIC_AQUI_INICIAR_WINDOWS.bat lo ejecuta automáticamente.',
    relatedIds: ['pm2_manager', 'win_bat', 'server_ts'],
  },

  stop_bat: {
    id: 'stop_bat',
    title: 'APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat (Apagar PM2 y el Bot con Doble Clic)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Ejecutable de doble clic para apagar por completo el servidor y el bot que están corriendo en segundo plano en PM2.',
    fileLocation: '/APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat (y /apagar_servidor_y_pm2_mac_linux.sh en Mac/Linux)',
    plainExplanation:
      'Como PM2 está diseñado para mantener el servidor y el bot encendidos 24/7 aunque cierres la ventana negra, cuando quieras apagar el sistema de verdad solo tienes que hacer doble clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat. Él le ordena a PM2 detener y borrar el proceso activo.',
    codeSnippet: `@echo off
cd /d "%~dp0"
call pm2 stop formagym-bot-24-7
call pm2 delete formagym-bot-24-7
call pm2 save --force`,
    lineByLineExplanation: [
      {
        code: 'call pm2 stop formagym-bot-24-7',
        meaning: 'Frena inmediatamente el servidor en el puerto 3000 y detiene el bot de WhatsApp.',
      },
      {
        code: 'call pm2 delete formagym-bot-24-7',
        meaning: 'Quita el proceso de la memoria de PM2 para que quede 100% apagado hasta que vuelvas a hacer doble clic en iniciar.',
      },
    ],
    userActionRequired:
      'Haz doble clic en APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat cada vez que quieras apagar el servidor.',
    relatedIds: ['pm2_manager', 'win_bat', 'ecosystem_config'],
  },

  fix_unexpected_token: {
    id: 'fix_unexpected_token',
    title: 'Solución al Error: Unexpected token \'<\', "<!doctype "... is not valid JSON',
    category: 'Cerebro del Bot y Código',
    shortSummary: 'Por qué fallaba el bot manual al recibir mensajes como "+112974886883436: Ola" y cómo quedó solucionado definitivamente.',
    fileLocation: '/server.ts y /bot_baileys_formagym.cjs',
    plainExplanation:
      'Ese error ocurría por dos causas en el script manual antiguo: 1) El bot intentaba enviar el mensaje por internet a la dirección privada de vista previa (https://ais-dev...), la cual pide inicio de sesión de Google y responde con una página web HTML ("<!doctype html>") en vez de datos JSON. Al intentar leer ese HTML como JSON, salía "Unexpected token <". 2) WhatsApp ahora envía identificadores internos llamados @lid (como +112974886883436@lid). Ahora: el ejecutable de doble clic activa Baileys ADENTRO de server.ts (en memoria directa sin llamadas externas HTML), extrae el número telefónico real desde senderPn/participantAlt, y además bot_baileys_formagym.cjs apunta a http://localhost:3000 verificando que la respuesta sea JSON.',
    codeSnippet: `// 1. Extracción del teléfono real cuando WhatsApp envía @lid (+112974886883436):
const senderPn = msg.key?.senderPn || msg.key?.participantAlt || msg.key?.remoteJid;

// 2. Procesamiento directo en server.ts (CERO errores de <!doctype html>):
const result = await processIncomingWhatsAppMessage(phone, text, pushName);`,
    lineByLineExplanation: [
      {
        code: 'msg.key?.senderPn || msg.key?.participantAlt',
        meaning: 'Obtiene el verdadero número de teléfono del cliente aunque WhatsApp envíe un código @lid como +112974886883436.',
      },
      {
        code: 'processIncomingWhatsAppMessage(phone, text, pushName)',
        meaning: 'Procesa el mensaje directamente dentro del servidor local en tu PC, sin pasar por páginas HTML externas.',
      },
    ],
    userActionRequired:
      'Ya está 100% corregido. Solo inicia con doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat.',
    relatedIds: ['win_bat', 'pm2_manager', 'server_ts', 'baileys_lib'],
  },

  esbuild_028: {
    id: 'esbuild_028',
    title: 'esbuild ^0.28.0 en package.json (Cambio de 0.25.0 a 0.28.0)',
    category: 'Ejecutables (Doble Clic)',
    shortSummary: 'Por qué esbuild fue actualizado de ^0.25.0 a ^0.28.0 en package.json para que todo instale y arranque sin errores.',
    fileLocation: '/package.json (línea 46)',
    plainExplanation:
      'El sistema utiliza Vite 8 (^8.3.0), el cual exige obligatoriamente que esbuild sea versión ^0.28.0. Cuando estaba en ^0.25.0, npm install chocaba con un error de conflicto de versiones (ERESOLVE). Ahora package.json ya tiene fijo "esbuild": "^0.28.0" para que al hacer doble clic en cualquier computadora se instale limpio a la primera.',
    codeSnippet: `"devDependencies": {
  "@types/better-sqlite3": "^7.6.13",
  "@types/express": "^5.0.6",
  "@types/node": "^22.14.0",
  "@types/qrcode": "^1.5.6",
  "autoprefixer": "^10.4.27",
  "esbuild": "^0.28.0",
  "tsx": "^4.21.0",
  "typescript": "~6.0.2",
  "vite": "^8.3.0"
}`,
    lineByLineExplanation: [
      {
        code: '"esbuild": "^0.28.0"',
        meaning: 'Versión exacta compatible con Vite 8 y tsx para que npm install y el servidor funcionen sin errores.',
      },
    ],
    userActionRequired:
      'Ya está aplicado en package.json. Si ya tenías una carpeta vieja, al hacer doble clic en CLIC_AQUI_INICIAR_WINDOWS.bat funcionará de inmediato.',
    relatedIds: ['node_modules', 'win_bat', 'pm2_manager'],
  },
};

interface InteractiveWikiGuideProps {
  localUrl: string;
  lanUrl: string;
  onDownloadOrganizedExcel: () => void;
  onDownloadOrganizedJson: () => void;
}

export const InteractiveWikiGuide: React.FC<InteractiveWikiGuideProps> = ({
  localUrl,
  lanUrl,
  onDownloadOrganizedExcel,
  onDownloadOrganizedJson,
}) => {
  const [selectedArticleId, setSelectedArticleId] = useState<string>('win_bat');
  const [activeChapter, setActiveChapter] = useState<
    'oneclick' | 'code_wiki' | 'database' | 'payments_wiki' | 'server_247'
  >('oneclick');
  const [copiedTextKey, setCopiedTextKey] = useState<string | null>(null);
  const [modalArticleId, setModalArticleId] = useState<string | null>(null);

  const selectedArticle = WIKI_ARTICLES[selectedArticleId] || WIKI_ARTICLES.win_bat;
  const modalArticle = modalArticleId ? WIKI_ARTICLES[modalArticleId] : null;

  const handleOpenWikiTerm = (id: string, openModal = true) => {
    if (WIKI_ARTICLES[id]) {
      setSelectedArticleId(id);
      if (openModal) {
        setModalArticleId(id);
      }
    }
  };

  const copyText = (key: string, text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
    setCopiedTextKey(key);
    setTimeout(() => {
      setCopiedTextKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Helper component for Wikipedia-style clickable blue text
  const WikiLink: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
    const article = WIKI_ARTICLES[id];
    const isSelected = selectedArticleId === id;
    return (
      <button
        type="button"
        onClick={() => handleOpenWikiTerm(id, true)}
        title={
          article
            ? `📘 Wiki: ${article.title} — Haz clic para ver cómo funciona este código`
            : 'Haz clic para ver explicación en la Wiki'
        }
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded font-semibold underline decoration-2 underline-offset-2 transition-all cursor-pointer text-left ${
          isSelected
            ? 'bg-blue-600 text-white decoration-white shadow-2xs'
            : 'bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-900 decoration-blue-400/80 border border-blue-200/80'
        }`}
      >
        <span>{children}</span>
        <HelpCircle className={`w-3 h-3 shrink-0 ${isSelected ? 'text-blue-100' : 'text-blue-500'}`} />
      </button>
    );
  };

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 space-y-6 shadow-xs">
      {/* WIKI HEADER & ONE-CLICK LAUNCHER DOWNLOAD BAR */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              Wiki Interactiva de FormaGym (Doble Clic + PM2 + Baileys Local)
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 text-[11px] font-bold">
              <MousePointerClick className="w-3.5 h-3.5 text-emerald-700" />
              Haz clic en cualquier texto azul subrayado para ver cómo funciona el código
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Enciclopedia Visual del Sistema: Ejecutables de Doble Clic (Servidor + Baileys + PM2) y Explicación del Código
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Esta guía funciona como una <strong>Wikipedia interactiva</strong>. Haz clic en cualquier enlace azul como{' '}
            <WikiLink id="win_bat">CLIC_AQUI_INICIAR_WINDOWS.bat</WikiLink>,{' '}
            <WikiLink id="pm2_manager">PM2 24/7</WikiLink>,{' '}
            <WikiLink id="fix_unexpected_token">Solución Error Unexpected token &apos;&lt;&apos;</WikiLink> o{' '}
            <WikiLink id="esbuild_028">esbuild ^0.28.0</WikiLink> para ver exactamente qué hace y cómo funciona por dentro.
          </p>
        </div>

        {/* Direct One-Click Executable Downloads */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="w-full text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-emerald-600" />
            <span>Descargar Ejecutables de Doble Clic (Ya incluidos también en la carpeta del proyecto):</span>
          </div>
          <a
            href="/api/launchers/download/windows-oneclick"
            download="CLIC_AQUI_INICIAR_WINDOWS.bat"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Windows (Iniciar Todo + PM2): CLIC_AQUI_INICIAR_WINDOWS.bat</span>
          </a>
          <a
            href="/api/launchers/download/windows-stop"
            download="APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat"
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Windows (Apagar PM2): APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat</span>
          </a>
          <a
            href="/api/launchers/download/mac-oneclick"
            download="CLIC_AQUI_INICIAR_MAC.command"
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Mac: CLIC_AQUI_INICIAR_MAC.command</span>
          </a>
          <a
            href="/api/launchers/download/linux-sh"
            download="iniciar_local_mac_linux.sh"
            className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Linux/Mac: iniciar_local_mac_linux.sh</span>
          </a>
        </div>
      </div>

      {/* WIKI CHAPTER NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveChapter('oneclick')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeChapter === 'oneclick'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <MousePointerClick className="w-3.5 h-3.5" />
          <span>1. Doble Clic + Explicación Completa de PM2</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveChapter('code_wiki')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeChapter === 'code_wiki'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>2. Cómo Funciona el Código (Mapa Wiki)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveChapter('database')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeChapter === 'database'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>3. Dónde se Guarda la Base de Datos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveChapter('payments_wiki')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeChapter === 'payments_wiki'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Shirt className="w-3.5 h-3.5" />
          <span>4. Pagos de Ropa, Inscripción ($15) y Membresías</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveChapter('server_247')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeChapter === 'server_247'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>5. Convertir tu PC en Servidor 24/7</span>
        </button>
      </div>

      {/* MAIN WIKI CONTENT AREA: LEFT = WIKI STORY WITH BLUE LINKS | RIGHT = LIVE CODE EXPLAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): WIKI EXPLANATION WITH CLICKABLE BLUE LINKS */}
        <div className="lg:col-span-7 space-y-5">
          {activeChapter === 'oneclick' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Capítulo 1 — Doble Clic Automático (Servidor Web + Baileys Local + PM2)
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Cómo Encender y Apagar Todo el Sistema y el Bot con Doble Clic (y Guía Completa de PM2)
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Ahora no necesitas abrir el servidor por un lado y el bot manual de Baileys por otro. Con un solo doble clic se enciende el <strong>Servidor Web + el Bot Baileys Local + el guardián PM2</strong> todo integrado y con{' '}
                  <WikiLink id="esbuild_028">esbuild ^0.28.0</WikiLink> ya configurado:
                </p>

                <div className="space-y-3 pt-1">
                  {/* Step 1 */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                        1
                      </span>
                      <span>Encender Todo con Doble Clic (Servidor + Bot Baileys + PM2)</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-7">
                      En Windows, haz doble clic en{' '}
                      <WikiLink id="win_bat">CLIC_AQUI_INICIAR_WINDOWS.bat</WikiLink> (en Mac usa{' '}
                      <WikiLink id="mac_command">CLIC_AQUI_INICIAR_MAC.command</WikiLink>). Él instalará automáticamente las librerías si es la primera vez, instalará <WikiLink id="pm2_manager">PM2</WikiLink>, activará el servidor junto con el Bot Baileys Local usando{' '}
                      <WikiLink id="ecosystem_config">ecosystem.config.cjs</WikiLink>, abrirá{' '}
                      <WikiLink id="localhost_3000">http://localhost:3000</WikiLink> y mostrará el QR o los mensajes en vivo.
                    </p>
                  </div>

                  {/* Step 2: PM2 Guide */}
                  <div className="p-4 rounded-xl bg-indigo-50/70 border-2 border-indigo-200 space-y-2">
                    <div className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-bold">
                        2
                      </span>
                      <span>¿Qué es PM2, qué hace, cómo lo hace y cómo se controla?</span>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed pl-7 space-y-1.5">
                      <p>
                        • <strong>¿Qué hace <WikiLink id="pm2_manager">PM2</WikiLink>?</strong> Es un administrador de procesos 24/7 que mantiene encendido el servidor y el bot de WhatsApp en segundo plano aunque cierres la ventana negra. Si ocurre un error o se cae la red, lo reinicia solo en 3 segundos.
                      </p>
                      <p>
                        • <strong>¿Cómo lo hace?</strong> Lee el archivo{' '}
                        <WikiLink id="ecosystem_config">ecosystem.config.cjs</WikiLink>, el cual arranca{' '}
                        <WikiLink id="server_ts">server.ts</WikiLink> con la orden <code className="font-mono bg-white px-1 rounded">AUTO_START_BAILEYS=true</code> bajo el nombre <code className="font-mono bg-white px-1 rounded">formagym-bot-24-7</code>.
                      </p>
                      <p>
                        • <strong>¿Cómo se configura / inicia?</strong> Automáticamente dando doble clic en{' '}
                        <WikiLink id="win_bat">CLIC_AQUI_INICIAR_WINDOWS.bat</WikiLink>, o si prefieres por comando escribiendo: <code className="font-mono bg-slate-900 text-emerald-300 px-1.5 py-0.5 rounded">npm run pm2:start</code>.
                      </p>
                      <p>
                        • <strong>¿Cómo se apaga PM2?</strong> Haciendo doble clic en{' '}
                        <WikiLink id="stop_bat">APAGAR_SERVIDOR_Y_PM2_WINDOWS.bat</WikiLink>, o escribiendo en terminal: <code className="font-mono bg-slate-900 text-rose-300 px-1.5 py-0.5 rounded">npm run pm2:stop</code> (o <code className="font-mono bg-slate-900 text-rose-300 px-1.5 py-0.5 rounded">pm2 kill</code>).
                      </p>
                    </div>
                  </div>

                  {/* Step 3: Fix Explanation */}
                  <div className="p-4 rounded-xl bg-emerald-50/70 border-2 border-emerald-300 space-y-1.5">
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center font-bold">
                        3
                      </span>
                      <span>Solución definitiva al error &ldquo;Unexpected token &apos;&lt;&apos;, &lt;!doctype...&rdquo; y esbuild 0.28.0</span>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed pl-7 space-y-1.5">
                      <p>
                        • Haz clic en{' '}
                        <WikiLink id="fix_unexpected_token">
                          Solución al Error Unexpected token &apos;&lt;&apos;
                        </WikiLink>{' '}
                        para ver cómo ahora el bot procesa los mensajes de WhatsApp (incluyendo IDs <code className="font-mono bg-white px-1 rounded">@lid</code> como <code className="font-mono bg-white px-1 rounded">+112974886883436</code>) directamente en tu servidor local sin chocar con páginas HTML.
                      </p>
                      <p>
                        • Haz clic en <WikiLink id="esbuild_028">esbuild ^0.28.0</WikiLink> para ver el ajuste en <code className="font-mono bg-white px-1 rounded">package.json</code> que garantiza que <code className="font-mono bg-white px-1 rounded">npm install</code> funcione siempre sin errores.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeChapter === 'code_wiki' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Capítulo 2 — Arquitectura del Código Explicada como Wikipedia
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Cómo Funciona el Código de FormaGym por Dentro? (Haz clic en los textos azules)
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  El programa está dividido en piezas muy ordenadas. Haz clic en cualquiera de los enlaces azules para ver su código real y qué significa cada línea:
                </p>

                <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <strong className="text-slate-900 block mb-1">
                      1. El Motor de Arranque Automático:
                    </strong>
                    Cuando haces doble clic en <WikiLink id="win_bat">CLIC_AQUI_INICIAR_WINDOWS.bat</WikiLink> o en{' '}
                    <WikiLink id="mac_command">CLIC_AQUI_INICIAR_MAC.command</WikiLink>, tu computadora usa{' '}
                    <WikiLink id="nodejs">Node.js</WikiLink> y las herramientas de{' '}
                    <WikiLink id="node_modules">node_modules</WikiLink> para encender el sistema sin pedirte ningún comando.
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <strong className="text-slate-900 block mb-1">
                      2. El Cerebro del Servidor y del Bot de WhatsApp:
                    </strong>
                    El archivo principal se llama <WikiLink id="server_ts">server.ts</WikiLink>. Adentro vive la librería{' '}
                    <WikiLink id="baileys_lib">@whiskeysockets/baileys</WikiLink> (que conecta tu WhatsApp usando la memoria guardada en <WikiLink id="baileys_auth">baileys_auth_info</WikiLink>) y la función inteligente{' '}
                    <WikiLink id="bot_brain">evaluateSmartSpanishBot()</WikiLink> que conversa con los clientes en español.
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <strong className="text-slate-900 block mb-1">
                      3. El Panel Visual y las Tasas Automáticas:
                    </strong>
                    La pantalla donde administras todo está programada en{' '}
                    <WikiLink id="app_tsx">src/App.tsx</WikiLink>. Ella se conecta con el calculador de{' '}
                    <WikiLink id="bcv_rate">Tasa BCV Automática</WikiLink> y con el{' '}
                    <WikiLink id="receipt_scanner">Escáner de Comprobantes de Pago Móvil</WikiLink> para que todo precio en dólares se convierta solo a Bolívares.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeChapter === 'database' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Capítulo 3 — Ubicación Exacta de los Archivos Guardados
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Dónde se Guarda la Base de Datos y la Sesión de WhatsApp?
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Nada queda flotando en el aire ni se borra al cerrar el navegador. El servidor{' '}
                  <WikiLink id="server_ts">server.ts</WikiLink> guarda todo directamente en archivos físicos dentro de la carpeta del proyecto en tu computadora:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <div className="text-xs font-bold text-slate-900">
                      1. Base de Datos del Gimnasio
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Todo se guarda al instante en{' '}
                      <WikiLink id="db_json">data/gym-local-db.json</WikiLink>. Contiene todas las membresías, quiénes tienen <WikiLink id="registration_flow">Inscripción Vitalicia ($15)</WikiLink>, productos, pagos del <WikiLink id="clothes_manager">Gestor de Ropa</WikiLink> y el reporte de eliminados.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <div className="text-xs font-bold text-slate-900">
                      2. Sesión Vinculada de WhatsApp
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Cuando escaneas el código QR una vez, se guarda en la carpeta{' '}
                      <WikiLink id="baileys_auth">baileys_auth_info</WikiLink>. Así, cuando apagues y prendas la computadora mañana, el bot se conecta solo sin volver a pedir QR.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 mt-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-950">
                      Descargar Copia de Seguridad Manual a tu Computadora:
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      Descarga un archivo Excel (.CSV) o .JSON con todas tus tablas organizadas:
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onDownloadOrganizedExcel}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Descargar Excel (.CSV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={onDownloadOrganizedJson}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar .JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeChapter === 'payments_wiki' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Capítulo 4 — Cómo Funcionan los Pagos en el Código
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Pagos de Ropa (Sin Precio ni Stock), Inscripción Vitalicia ($15) y Membresías
                </h3>

                <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                  <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
                    <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                      <Shirt className="w-4 h-4 text-indigo-700" />
                      <span>1. ¿Cómo funciona el Gestor de Pagos de Ropa (Catálogo Abierto)?</span>
                    </div>
                    <p>
                      Como las prendas de ropa son un catálogo grande que no tiene precio fijo ni stock en la lista, creamos el módulo{' '}
                      <WikiLink id="clothes_manager">Gestor de Pagos de Ropa (Catálogo Abierto)</WikiLink>. Cuando un cliente pregunta por ropa o quiere pagar ropa en WhatsApp,{' '}
                      <WikiLink id="bot_brain">evaluateSmartSpanishBot()</WikiLink> le indica que envíe su comprobante de Pago Móvil normal y que <strong>escriba qué prenda(s) de ropa pagó</strong> (por ejemplo: <em>&ldquo;Conjunto deportivo negro talla M&rdquo;</em>). El pago entra a la pestaña <strong>Aprobar Pagos</strong> y a <strong>Tienda y Precios</strong> con esa descripción para que lo confirmes.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-900">
                      2. ¿Cómo funciona la Inscripción Vitalicia ($15) + Membresía?
                    </div>
                    <p>
                      En <WikiLink id="registration_flow">Inscripción Vitalicia ($15) + Membresía</WikiLink>, la inscripción cuesta $15 por defecto (puedes cambiar su valor y usa la misma{' '}
                      <WikiLink id="bcv_rate">Tasa BCV Automática</WikiLink> que la membresía). Una vez que la persona está inscrita, queda registrada de por vida. Si alguien nuevo pide membresía, debe pagar la inscripción primero; y si dice que ya estaba inscrito, el bot le pide su <strong>Cédula, Nombre y Apellido</strong> y le pregunta a un Admin para confirmar si realmente está inscrito.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeChapter === 'server_247' && (
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Capítulo 5 — Tu Computadora como Servidor 24/7
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Cómo Dejar tu Propia Computadora como Servidor 24/7 sin Comandos
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  No necesitas alquilar servidores complicados. Al hacer doble clic en{' '}
                  <WikiLink id="win_bat">CLIC_AQUI_INICIAR_WINDOWS.bat</WikiLink>, tu computadora ya es un servidor completo:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      En la misma computadora:
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <WikiLink id="localhost_3000">{localUrl}</WikiLink>
                      <button
                        type="button"
                        onClick={() => copyText('local_url', localUrl)}
                        className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold cursor-pointer"
                      >
                        {copiedTextKey === 'local_url' ? 'Copiado ✓' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      En celulares del mismo Wi-Fi:
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <WikiLink id="lan_wifi">{lanUrl}</WikiLink>
                      <button
                        type="button"
                        onClick={() => copyText('lan_url', lanUrl)}
                        className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold cursor-pointer"
                      >
                        {copiedTextKey === 'lan_url' ? 'Copiado ✓' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  Haz clic en <WikiLink id="pm2_server">Convertir tu PC en un Servidor 24/7 Permanente</WikiLink> para ver cómo quitar la suspensión automática de Windows/Mac y hacer que el bot arranque solo cuando prendes la computadora.
                </div>
              </div>
            </div>
          )}

          {/* FULL DIRECTORY OF ALL BLUE WIKI LINKS (QUICK INDEX) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Índice Rápido de la Wiki — Haz clic en cualquier término azul para inspeccionar su código:</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.values(WIKI_ARTICLES).map((art) => (
                <WikiLink key={art.id} id={art.id}>
                  {art.title.split(' (')[0]}
                </WikiLink>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): LIVE INTERACTIVE WIKI INSPECTOR PANEL */}
        <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-5 space-y-4 border border-slate-800 shadow-lg sticky top-20">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold uppercase tracking-wider">
                📘 Artículo de la Wiki Seleccionado
              </span>
              <h3 className="text-sm font-bold text-white mt-1.5 leading-snug">
                {selectedArticle.title}
              </h3>
            </div>
            <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 px-2 py-1 rounded shrink-0">
              {selectedArticle.category}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                ¿Dónde está ubicado?
              </span>
              <code className="font-mono text-xs text-emerald-300 break-all">
                {selectedArticle.fileLocation}
              </code>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider block">
                Explicación Sencilla (Sin Tecnicismos):
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {selectedArticle.plainExplanation}
              </p>
            </div>

            {/* Code snippet & Line by line translation */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                ¿Cómo funciona el código por dentro? (Línea por Línea):
              </span>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed">
                {selectedArticle.codeSnippet}
              </pre>
              <div className="space-y-1.5">
                {selectedArticle.lineByLineExplanation.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-0.5"
                  >
                    <code className="text-[11px] font-mono font-bold text-sky-300 block">
                      {item.code}
                    </code>
                    <p className="text-[11px] text-slate-300 leading-snug">{item.meaning}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 space-y-1">
              <span className="text-[10px] font-bold uppercase text-emerald-300 block">
                ¿Qué tienes que hacer tú?
              </span>
              <p className="text-xs text-emerald-100 leading-relaxed font-medium">
                {selectedArticle.userActionRequired}
              </p>
            </div>

            {selectedArticle.relatedIds.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Artículos Relacionados en la Wiki (Haz clic para abrir):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedArticle.relatedIds.map((relId) => {
                    const rel = WIKI_ARTICLES[relId];
                    if (!rel) return null;
                    return (
                      <button
                        key={relId}
                        type="button"
                        onClick={() => handleOpenWikiTerm(relId, false)}
                        className="px-2 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400/40 text-blue-200 text-[11px] font-semibold underline cursor-pointer"
                      >
                        {rel.title.split(' (')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POPUP MODAL WHEN USER CLICKS ANY BLUE WIKI LINK FOR IMMEDIATE CLARITY */}
      {modalArticle && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setModalArticleId(null)}
        >
          <div
            className="bg-slate-900 text-white border-2 border-blue-500 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5" />
                  Explicación Wiki del Código
                </span>
                <h3 className="text-base font-bold text-white mt-1.5">
                  {modalArticle.title}
                </h3>
                <p className="text-xs font-mono text-emerald-400 mt-0.5">
                  Ubicación: {modalArticle.fileLocation}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalArticleId(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 space-y-1">
                <span className="text-[11px] font-bold text-blue-300 uppercase">
                  ¿Qué es y cómo funciona en palabras simples?
                </span>
                <p className="text-slate-100 leading-relaxed text-xs">
                  {modalArticle.plainExplanation}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold text-amber-300 uppercase block">
                  Código Real y Explicación Línea por Línea:
                </span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                  {modalArticle.codeSnippet}
                </pre>
                <div className="space-y-1.5">
                  {modalArticle.lineByLineExplanation.map((line, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-0.5"
                    >
                      <code className="font-mono font-bold text-sky-300 text-[11px] block">
                        {line.code}
                      </code>
                      <p className="text-slate-300 text-xs">{line.meaning}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 space-y-1">
                <span className="text-[11px] font-bold uppercase text-emerald-300 block">
                  ¿Tengo que hacer algo con esto?
                </span>
                <p className="text-emerald-100 text-xs font-medium">
                  {modalArticle.userActionRequired}
                </p>
              </div>

              {modalArticle.relatedIds.length > 0 && (
                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400">Ver también en la Wiki:</span>
                  {modalArticle.relatedIds.map((rid) => {
                    const r = WIKI_ARTICLES[rid];
                    if (!r) return null;
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => handleOpenWikiTerm(rid, true)}
                        className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400/40 text-blue-200 text-xs font-semibold underline cursor-pointer"
                      >
                        {r.title.split(' (')[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setModalArticleId(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Entendido, cerrar explicación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
