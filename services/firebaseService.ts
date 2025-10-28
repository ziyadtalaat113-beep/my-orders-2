
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    type User as FirebaseUser 
} from 'firebase/auth';
import { 
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    writeBatch,
    DocumentData,
    QueryDocumentSnapshot,
} from 'firebase/firestore';

import { SUPER_ADMIN_EMAIL } from '../constants';
import { User, UserRole, Order } from '../types';

const firebaseConfig = {
    apiKey: "AIzaSyDWWBIZqHdy36GYfR1L4_BFFs4c18TXY2E",
    authDomain: "order-c7dd2.firebaseapp.com",
    projectId: "order-c7dd2",
    storageBucket: "order-c7dd2.firebasestorage.app",
    messagingSenderId: "741648683831",
    appId: "1:741648683831:web:517a80533c8e2c08c280b2",
    measurementId: "G-THLLY50B0R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Initialize Firestore with offline persistence enabled
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const USERS_COLLECTION = 'users';
const ORDERS_COLLECTION = 'orders';

// --- AUTHENTICATION ---

const mapFirebaseError = (errorCode: string): string => {
    switch (errorCode) {
        case 'auth/email-already-in-use':
            return 'هذا البريد الإلكتروني مسجل بالفعل.';
        case 'auth/invalid-email':
            return 'البريد الإلكتروني غير صالح.';
        case 'auth/weak-password':
            return 'كلمة المرور ضعيفة جدًا.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        default:
            return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    }
}

export const onAuthStateChangedListener = (callback: (user: FirebaseUser | null) => void) => {
    return onAuthStateChanged(auth, callback);
}

export const registerWithEmail = async (email: string, pass: string): Promise<{ error?: string }> => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        const role: UserRole = email === SUPER_ADMIN_EMAIL ? 'admin' : 'guest';
        
        // FIX: Corrected a typo in the collection name from 'USERS_COLlection' to 'USERS_COLLECTION'.
        await setDoc(doc(db, USERS_COLLECTION, user.uid), {
            email: user.email,
            role: role
        });
        
        return {};
    } catch (error: any) {
        return { error: mapFirebaseError(error.code) };
    }
}

export const loginWithEmail = async (email: string, pass: string): Promise<{ error?: string }> => {
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        return {};
    } catch (error: any) {
        return { error: mapFirebaseError(error.code) };
    }
}

export const logout = () => {
    signOut(auth);
}

// --- FIRESTORE: USERS ---

export const getUser = async (uid: string): Promise<User | null> => {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
        const data = userDoc.data();
        return {
            id: userDoc.id,
            email: data.email,
            role: data.role
        };
    }
    return null;
}

export const getUsers = (callback: (users: User[]) => void) => {
    const q = query(collection(db, USERS_COLLECTION));
    return onSnapshot(q, (querySnapshot) => {
        const users: User[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            users.push({
                id: doc.id,
                email: data.email,
                role: data.role
            });
        });
        callback(users);
    });
}

export const updateUserRole = async (userId: string, newRole: UserRole) => {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, { role: newRole });
}


// --- FIRESTORE: ORDERS ---
const docToOrder = (doc: QueryDocumentSnapshot<DocumentData>): Order => {
    const data = doc.data();
    return {
        id: doc.id,
        name: data.name,
        ref: data.ref,
        date: data.date,
        type: data.type,
        status: data.status,
        addedBy: data.addedBy,
    };
}


export const getOrders = (callback: (orders: Order[]) => void) => {
    const q = query(collection(db, ORDERS_COLLECTION));
    return onSnapshot(q, (querySnapshot) => {
        const orders = querySnapshot.docs.map(docToOrder);
        callback(orders);
    });
}

export const addOrder = async (orderData: Omit<Order, 'id'>) => {
    await addDoc(collection(db, ORDERS_COLLECTION), orderData);
}

export const updateOrder = async (orderId: string, updates: Partial<Order>) => {
    const orderDocRef = doc(db, ORDERS_COLLECTION, orderId);
    await updateDoc(orderDocRef, updates);
}

export const deleteOrders = async (orderIds: string[]) => {
    const batch = writeBatch(db);
    orderIds.forEach(id => {
        const orderDocRef = doc(db, ORDERS_COLLECTION, id);
        batch.delete(orderDocRef);
    });
    await batch.commit();
}
