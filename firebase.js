import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, increment } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc };

// Fetch sales collection
export const fetchSales = async () => {
    const salesCol = collection(db, 'sales');
    const snapshot = await getDocs(salesCol);
    const sales = [];
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        // Convert Firestore Timestamp to ISO string if needed
        const date = data.date?.toDate ? data.date.toDate().toISOString() : data.date;
        sales.push({
            id: docSnap.id,
            date,
            items: data.items || [],
            status: data.status || '',
            total: data.total || 0,
        });
    });
    return sales;
};

// Create a new sale
export const createSale = async (saleData) => {
    const salesCol = collection(db, 'sales');
    const docRef = await addDoc(salesCol, {
        ...saleData,
        date: new Date(),
        status: 'completed'
    });
    return docRef.id;
};

// Fetch products
export const fetchProducts = async () => {
    const q = query(collection(db, 'products'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ barcode: doc.id, ...doc.data() }));
};

// Save product
export const saveProduct = async (product) => {
    await setDoc(doc(db, 'products', product.barcode), product, { merge: true });
};

// Delete product
export const deleteProduct = async (barcode) => {
    await deleteDoc(doc(db, 'products', barcode));
};

// Increment scan count
export const incrementScanCount = async (barcode) => {
    const productRef = doc(db, 'products', barcode);
    await setDoc(productRef, {
        scanCount: increment(1),
        lastScanned: new Date().toISOString()
    }, { merge: true });
};
