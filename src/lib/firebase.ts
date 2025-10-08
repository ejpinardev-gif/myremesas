import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  "projectId": "studio-7601782447-44d81",
  "appId": "1:775892034675:web:98ed2724bcaff2ed427606",
  "apiKey": "AIzaSyCnXU8XU7ZzA_12CDaYaY9W2rWBmkGLB-g",
  "authDomain": "studio-7601782447-44d81.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "775892034675"
};

// Initialize Firebase
const apps = getApps();
const app = !apps.length ? initializeApp(firebaseConfig) : apps[0];
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };
