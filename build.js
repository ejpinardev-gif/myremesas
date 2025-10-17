const fs = require('fs');
const path = require('path');

console.log('Starting build script...');

// Obtener las variables de entorno de Vercel
const firebaseConfig = process.env.__FIREBASE_CONFIG;
const appId = process.env.__APP_ID;
const adminUids = process.env.ADMIN_UIDS;

// Validar que las variables de entorno existan
if (!firebaseConfig || !appId || !adminUids) {
  console.error('Error: Missing required environment variables (__FIREBASE_CONFIG, __APP_ID, ADMIN_UIDS).');
  process.exit(1); // Salir con error
}

const mainJsPath = path.join(__dirname, 'public', 'main.js');

try {
  let content = fs.readFileSync(mainJsPath, 'utf8');
  console.log('Read public/main.js successfully.');

  // Reemplazar los placeholders con los valores reales
  content = content.replace('"VERCEL_INJECTED_FIREBASE_CONFIG"', firebaseConfig); // Reemplaza el placeholder con el JSON directamente
  content = content.replace('"VERCEL_INJECTED_APP_ID"', `"${appId}"`);
  content = content.replace('"VERCEL_INJECTED_ADMIN_UIDS"', `"${adminUids}"`);

  fs.writeFileSync(mainJsPath, content, 'utf8');
  console.log('Successfully injected environment variables into public/main.js.');
} catch (error) {
  console.error('Failed to process build script:', error);
  process.exit(1); // Salir con error
}