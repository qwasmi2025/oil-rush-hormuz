import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || "",
  authDomain: "hormuzgame.firebaseapp.com",
  projectId: "hormuzgame",
  storageBucket: "hormuzgame.firebasestorage.app",
  messagingSenderId: "495552767275",
  appId: "1:495552767275:web:7de815659a60d974ff516e",
  measurementId: "G-9H08C4EL0Y",
};

// Guard against duplicate initialization during Vite HMR
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export { firebaseApp };
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
