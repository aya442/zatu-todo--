// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAaC0i6QiN-gpZG7cMe3tdc6_Ugg6a-Kxo",
  authDomain: "light-todo-24f87.firebaseapp.com",
  projectId: "light-todo-24f87",
  storageBucket: "light-todo-24f87.firebasestorage.app",
  messagingSenderId: "627717055727",
  appId: "1:627717055727:web:51b20c86f9958c2121271a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
export default app;