const fs = require('fs');
const path = require('path');

console.log('Starting build script...');

// Utilidades ---------------------------------------------------------------
const LOCAL_CONFIG_FILENAME = 'local.firebase.config.json';

function normalizeFirebaseConfig(value) {
  if (!value) return null;
  // Si ya viene como string (Vercel env), lo devolvemos tal cual.
  if (typeof value === 'string') return value;
  // Si es objeto (archivo local), lo serializamos.
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.warn('Could not stringify firebaseConfig value:', err);
    return null;
  }
}

function normalizeAdminUids(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return String(value);
}

function loadLocalConfig() {
  const candidatePath = path.join(__dirname, LOCAL_CONFIG_FILENAME);
  if (!fs.existsSync(candidatePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(candidatePath, 'utf8');
    const parsed = JSON.parse(raw);
    console.log(`Loaded local Firebase config from ${LOCAL_CONFIG_FILENAME}.`);
    return parsed;
  } catch (error) {
    console.warn(`Failed to read ${LOCAL_CONFIG_FILENAME}:`, error);
    return null;
  }
}

// Obtener las variables de entorno (modo despliegue)
let firebaseConfig = normalizeFirebaseConfig(process.env.__FIREBASE_CONFIG);
let appId = process.env.__APP_ID;
let adminUids = normalizeAdminUids(process.env.ADMIN_UIDS);

// Intentar fallback a archivo local si faltan datos (modo desarrollo)
if (!firebaseConfig || !appId || !adminUids) {
  const localConfig = loadLocalConfig();
  if (localConfig) {
    firebaseConfig = firebaseConfig || normalizeFirebaseConfig(localConfig.firebaseConfig);
    appId = appId || localConfig.appId;
    adminUids = adminUids || normalizeAdminUids(localConfig.adminUids);
  }
}

// Validar que las variables existan tras los intentos
if (!firebaseConfig || !appId || !adminUids) {
  console.error('Error: Missing Firebase configuration. Provide environment variables (__FIREBASE_CONFIG, __APP_ID, ADMIN_UIDS) or create local.firebase.config.json.');
  process.exit(1);
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
