// ============================================================================
// FORMAGYM — CONFIGURACIÓN OFICIAL DE PM2 (SERVIDOR WEB + BAILEYS LOCAL 24/7)
// Este archivo es ejecutado automáticamente al hacer doble clic en:
// - CLIC_AQUI_INICIAR_WINDOWS.bat (Windows)
// - CLIC_AQUI_INICIAR_MAC.command (Mac)
// - iniciar_local_mac_linux.sh (Linux / Mac)
// Mantiene el servidor web (http://localhost:3000) y el Bot Local de Baileys
// encendidos 24/7 en segundo plano y los reinicia solos si ocurre algún fallo.
// ============================================================================

module.exports = {
  apps: [
    {
      name: 'formagym-bot-24-7',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
        AUTO_START_BAILEYS: 'true',
      },
    },
  ],
};
