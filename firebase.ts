import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ده الكود الخاص بيك من موقع فاير بيز (اللي إنت بعتهولي)
const firebaseConfig = {
  apiKey: "AIzaSyDWWBIZQhdy36GYfR1L4_BFFs4c18TXY2E",
  authDomain: "order-c7dd2.firebaseapp.com",
  projectId: "order-c7dd2",
  storageBucket: "order-c7dd2.firebaseapp.com",
  messagingSenderId: "741648683831",
  appId: "1:741648683831:web:517a80533c8e2c08c280b2",
  measurementId: "G-THLLY50B0R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);

