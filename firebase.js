import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, orderBy, setDoc, increment, getDoc, writeBatch } from "firebase/firestore";

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

// --- Approval System ---

// Fetch approval password hash from settings
export const fetchApprovalHash = async () => {
    const docRef = doc(db, 'settings', 'approval');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data().hash || null;
    }
    return null;
};

// Save approval password hash to settings
export const saveApprovalHash = async (hash) => {
    await setDoc(doc(db, 'settings', 'approval'), { hash, updatedAt: new Date().toISOString() });
};

// Bulk approve products (set pending/pendingDelete to false, or delete if pendingDelete approved)
export const approveProducts = async (barcodes, products) => {
    const batch = writeBatch(db);
    const toDelete = [];
    barcodes.forEach(barcode => {
        const product = products.find(p => p.barcode === barcode);
        if (product && product.pendingDelete) {
            // Approve deletion = actually delete
            batch.delete(doc(db, 'products', barcode));
            toDelete.push(barcode);
        } else {
            // Approve add/edit = clear pending flag
            const ref = doc(db, 'products', barcode);
            batch.update(ref, { pending: false, pendingDelete: false });
        }
    });
    await batch.commit();
    return toDelete; // Return which ones were deleted
};

// Bulk reject products (revert pending changes)
export const rejectProducts = async (barcodes, products) => {
    const batch = writeBatch(db);
    const toRemove = [];
    barcodes.forEach(barcode => {
        const product = products.find(p => p.barcode === barcode);
        if (product && product.pendingDelete) {
            // Reject deletion = cancel delete, keep product
            const ref = doc(db, 'products', barcode);
            batch.update(ref, { pendingDelete: false });
        } else {
            // Reject new/edited product = delete it
            batch.delete(doc(db, 'products', barcode));
            toRemove.push(barcode);
        }
    });
    await batch.commit();
    return toRemove;
};
