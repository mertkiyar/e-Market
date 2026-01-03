import './style.css';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { createIcons, ScanLine, Package, ShoppingCart, Plus, Minus, Trash2, Edit2, Check, X, ChevronDown, Search, Keyboard, AlertCircle, Camera, PowerOff, Play, RotateCcw, Clock, Copy } from 'lucide';
import { format } from 'date-fns';
import { fetchSales, createSale, fetchProducts, saveProduct, deleteProduct, incrementScanCount } from './firebase.js';

// --- Sound Manager ---
const SoundManager = {
    ctx: null,
    init: () => {
        if (!SoundManager.ctx) {
            SoundManager.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playTone: (freq, type, duration) => {
        if (!SoundManager.ctx) SoundManager.init();
        const osc = SoundManager.ctx.createOscillator();
        const gain = SoundManager.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, SoundManager.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, SoundManager.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, SoundManager.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(SoundManager.ctx.destination);
        osc.start();
        osc.stop(SoundManager.ctx.currentTime + duration);
    },
    playSuccess: () => {
        SoundManager.playTone(800, 'sine', 0.1);
        setTimeout(() => SoundManager.playTone(1200, 'sine', 0.2), 100);
    },
    playError: () => {
        SoundManager.playTone(200, 'sawtooth', 0.3);
    },
    playAdd: () => {
        SoundManager.playTone(600, 'sine', 0.1);
    },
    resume: () => {
        if (SoundManager.ctx && SoundManager.ctx.state === 'suspended') {
            SoundManager.ctx.resume();
        }
    }
};

// --- State Management ---
const StorageManager = {
    getProducts: () => [], // Deprecated, use fetchProducts
    saveProducts: async (product) => await saveProduct(product),
    getCart: () => JSON.parse(localStorage.getItem('cart')) || [],
    saveCart: (cart) => localStorage.setItem('cart', JSON.stringify(cart)),
};

const state = {
    products: [],
    cart: StorageManager.getCart(),
    view: 'scanner', // scanner, products, cart
    scanner: null,
    isScanning: false,
    lastScannedCode: null,
    scanPaused: false,
    scanTimeout: null,
    currentOverlayQty: 1,
    sales: [],
    stopPromise: null,
    cartSearchQuery: '',
    productSearchQuery: '',
    scannerStarted: false,
};

// --- DOM Elements ---
const app = document.getElementById('app');
const mainContent = document.getElementById('main-content');
const pageTitle = document.getElementById('page-title');
const headerActions = document.getElementById('header-actions');
const navItems = document.querySelectorAll('.nav-item');
const cartBadge = document.getElementById('cart-badge');

// Create Overlay & Modal Elements dynamically
const createOverlayElements = () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'overlay-backdrop';
    backdrop.id = 'overlay-backdrop';
    app.appendChild(backdrop);

    const sheet = document.createElement('div');
    sheet.className = 'overlay-sheet';
    sheet.id = 'scan-result-sheet';
    app.appendChild(sheet);

    const modal = document.createElement('div');
    modal.className = 'modal-container';
    modal.id = 'product-modal';
    app.appendChild(modal);

    // Manual Entry Button
    const manualBtn = document.createElement('button');
    manualBtn.className = 'manual-entry-btn';
    manualBtn.id = 'manual-entry-btn';
    manualBtn.innerHTML = `<i data-lucide="keyboard"></i> Kod Gir`;
    manualBtn.style.display = 'none'; // Only show in scanner view
    app.appendChild(manualBtn);

    // Toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'toast';
    app.appendChild(toast);

    // Backdrop click to close
    backdrop.onclick = closeOverlay;

    // Manual Entry Click
    manualBtn.onclick = () => {
        openProductModal({ barcode: '' }, true); // True for "search mode"
    };
};

const showToast = (msg, icon = 'info') => {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<i data-lucide="${icon}"></i> ${msg}`;
    toast.classList.add('active');
    initIcons();
    setTimeout(() => toast.classList.remove('active'), 3000);
};

// --- Icons ---
const initIcons = () => createIcons({ icons: { ScanLine, Package, ShoppingCart, Plus, Minus, Trash2, Edit2, Check, X, ChevronDown, Search, Keyboard, AlertCircle, Camera, PowerOff, Play, Clock, Copy } });

// --- Router & Rendering ---
const render = () => {
    // Update Nav
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === state.view);
    });

    // Update Cart Badge
    const cartCount = state.cart.reduce((acc, item) => acc + item.quantity, 0);
    cartBadge.textContent = cartCount;
    cartBadge.classList.toggle('hidden', cartCount === 0);

    // View Logic
    const manualBtn = document.getElementById('manual-entry-btn');

    if (state.view === 'scanner') {
        pageTitle.textContent = 'Tarayıcı';
        headerActions.innerHTML = '';
        document.getElementById('scanner-view').style.display = 'block';
        document.getElementById('list-view').style.display = 'none';

        if (!state.scannerStarted) {
            // Show Start Screen
            const scannerView = document.getElementById('scanner-view');
            // Check if start screen already exists
            if (!document.getElementById('scanner-start-screen')) {
                const startScreen = document.createElement('div');
                startScreen.id = 'scanner-start-screen';
                startScreen.style.position = 'absolute';
                startScreen.style.top = '0';
                startScreen.style.left = '0';
                startScreen.style.width = '100%';
                startScreen.style.height = '100%';
                startScreen.style.background = 'var(--background)';
                startScreen.style.zIndex = '10';
                startScreen.style.display = 'flex';
                startScreen.style.flexDirection = 'column';
                startScreen.style.alignItems = 'center';
                startScreen.style.justifyContent = 'center';
                startScreen.innerHTML = `
                    <div style="width:80px; height:80px; background:var(--surface-light); border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:24px;">
                        <i data-lucide="camera" size="40" color="var(--primary)"></i>
                    </div>
                    <h2 style="margin-bottom:8px;">Tarayıcıyı Başlat</h2>
                    <p style="color:var(--text-muted); margin-bottom:32px; text-align:center; max-width:240px;">Barkod okutmak için kamerayı başlatın.</p>
                    <button id="btn-start-scanner" class="btn btn-primary" style="width:auto; padding: 12px 48px;">
                        <i data-lucide="play"></i> Başlat
                    </button>
                `;
                scannerView.appendChild(startScreen);

                document.getElementById('btn-start-scanner').onclick = () => {
                    state.scannerStarted = true;
                    startScreen.remove();
                    manualBtn.style.display = 'flex';
                    startScanner();
                };
            }
            manualBtn.style.display = 'none'; // Hide manual button on start screen
        } else {
            manualBtn.style.display = 'flex';
            // Show start overlay if camera is not running

            if (!state.isScanning) {
                const startOverlay = document.getElementById('start-overlay');
                if (startOverlay) {
                    startOverlay.style.display = 'flex';
                }
            }
            startScanner();
        }
    } else {
        if (state.scanner && state.scanner.isScanning) {
            state.stopPromise = state.scanner.stop().then(() => {
                state.scanner.clear();
                state.isScanning = false;
                state.stopPromise = null;
            }).catch(console.error);
        }
        clearTimeout(state.scanTimeout);

        document.getElementById('scanner-view').style.display = 'none';
        document.getElementById('list-view').style.display = 'block';
        manualBtn.style.display = 'none';

        if (state.view === 'products') renderProducts();
        if (state.view === 'cart') renderCart();
        if (state.view === 'history') renderHistory();
    }

    initIcons();
};

const navigate = (view) => {
    state.view = view;
    closeOverlay();
    closeModal();
    render();
};

// --- Scanner Logic ---
const initScannerDOM = () => {
    // Scanner View Container
    const scannerView = document.createElement('div');
    scannerView.id = 'scanner-view';
    scannerView.style.position = 'absolute';
    scannerView.style.top = '0';
    scannerView.style.left = '0';
    scannerView.style.width = '100%';
    scannerView.style.height = '100%';
    scannerView.style.zIndex = '0'; // Behind everything

    scannerView.innerHTML = `<div id="reader" style="width:100%;height:100%;"></div>`;
    mainContent.appendChild(scannerView);

    // Switch Camera Button
    const switchBtn = document.createElement('button');
    switchBtn.className = 'camera-switch-btn';
    switchBtn.id = 'btn-switch-camera';
    switchBtn.innerHTML = `<i data-lucide="rotate-ccw"></i>`; // Using generic camera icon, ideally 'rotate-ccw' or similar
    switchBtn.style.display = 'none';
    scannerView.appendChild(switchBtn);

    // Paused Overlay
    const pausedOverlay = document.createElement('div');
    pausedOverlay.className = 'paused-overlay';
    pausedOverlay.id = 'paused-overlay';
    pausedOverlay.style.display = 'none';
    pausedOverlay.innerHTML = `
        <div style="width:64px; height:64px; background:rgba(255,255,255,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
            <i data-lucide="power-off" size="32"></i>
        </div>
        <h3>Tarayıcı Duraklatıldı</h3>
        <p>Güç tasarrufu için kamera kapatıldı.</p>
        <button id="btn-resume-camera" class="btn btn-primary" style="width:auto; padding: 12px 32px;">
            <i data-lucide="play"></i> Devam Et
        </button>
        <button id="btn-manual-paused" class="btn btn-secondary" style="width:auto; margin-top:12px; background:transparent; border:1px solid rgba(255,255,255,0.2); color:white;">
            <i data-lucide="keyboard"></i> Kod Gir
        </button>
    `;
    scannerView.appendChild(pausedOverlay);

    // List View Container (for Products/Cart)
    const listView = document.createElement('div');
    listView.id = 'list-view';
    listView.style.display = 'none';
    listView.style.position = 'relative';
    listView.style.zIndex = '1';
    listView.style.background = 'var(--background)';
    listView.style.minHeight = '100%';
    mainContent.appendChild(listView);

    // Listeners
    document.getElementById('btn-resume-camera').onclick = () => {
        document.getElementById('paused-overlay').style.display = 'none';
        startScanner();
    };
    document.getElementById('btn-manual-paused').onclick = () => {
        openProductModal({ barcode: '' }, true);
    };
    document.getElementById('btn-switch-camera').onclick = switchCamera;
};

let availableCameras = [];
let currentCameraIndex = 0;

const startScanner = () => {
    if (state.stopPromise) {
        state.stopPromise.then(() => startScanner());
        return;
    }
    if (state.isScanning) return;

    if (document.getElementById('product-modal')?.classList.contains('active')) return;

    // Reset Timeout
    resetScanTimeout();

    setTimeout(() => {
        if (!state.scanner) {
            state.scanner = new Html5Qrcode("reader");
        }

        // Get Cameras if not already fetched
        if (availableCameras.length === 0) {
            Html5Qrcode.getCameras().then(devices => {
                if (devices && devices.length) {
                    availableCameras = devices;
                    // Try to find saved camera
                    const savedId = localStorage.getItem('preferredCamera');
                    if (savedId) {
                        const idx = availableCameras.findIndex(c => c.id === savedId);
                        if (idx !== -1) currentCameraIndex = idx;
                    } else {
                        currentCameraIndex = devices.length - 1;
                    }

                    if (availableCameras.length > 1) {
                        document.getElementById('btn-switch-camera').style.display = 'flex';
                    }

                    startCameraById(availableCameras[currentCameraIndex].id);
                } else {
                    // Fallback to facing mode
                    startCameraByMode("environment");
                }
            }).catch(err => {
                console.error("Error getting cameras", err);
                startCameraByMode("environment");
            });
        } else {
            startCameraById(availableCameras[currentCameraIndex].id);
        }
    }, 100);
};

const startCameraById = (cameraId) => {
    const config = {
        fps: 15,
        qrbox: { width: 300, height: 150 },
        // aspectRatio: 1.0,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128
        ]
    };

    state.scanner.start(cameraId, config, onScanSuccess)
        .then(() => {
            state.isScanning = true;
            localStorage.setItem('preferredCamera', cameraId);
        })
        .catch(err => {
            console.error("Error starting camera by ID", err);
            // Fallback
            startCameraByMode("environment");
        });
};

const startCameraByMode = (mode) => {
    const config = {
        fps: 15,
        qrbox: { width: 300, height: 150 },
        // aspectRatio: 1.0,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128
        ]
    };
    state.scanner.start({ facingMode: mode }, config, onScanSuccess)
        .then(() => {
            state.isScanning = true;
        }).catch(console.error);
};

const stopScanner = async () => {
    if (state.scanner && state.isScanning) {
        try {
            await state.scanner.stop();
            state.scanner.clear();
            state.isScanning = false;
        } catch (e) {
            console.error("Failed to stop scanner", e);
        }
    }
};

const switchCamera = () => {
    if (availableCameras.length < 2) return;

    // Stop current
    state.scanner.stop().then(() => {
        state.isScanning = false;
        currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
        startCameraById(availableCameras[currentCameraIndex].id);
    }).catch(console.error);
};

const resetScanTimeout = () => {
    clearTimeout(state.scanTimeout);
    state.scanTimeout = setTimeout(() => {
        if (state.view === 'scanner' && state.isScanning && !state.scanPaused) {
            // Stop Scanner to save power
            state.scanner.stop().then(() => {
                state.isScanning = false;
                state.scanner.clear(); // Clear canvas
                document.getElementById('paused-overlay').style.display = 'flex';
                initIcons();
                SoundManager.playError(); // Soft alert
            }).catch(console.error);
        }
    }, 15000); // 15s
};

const onScanSuccess = (decodedText, decodedResult) => {
    if (state.scanPaused || state.lastScannedCode === decodedText) return;

    state.scanPaused = true;
    state.lastScannedCode = decodedText;
    clearTimeout(state.scanTimeout); // Clear timeout on success

    SoundManager.playSuccess();

    // Increment Popularity
    incrementScanCount(decodedText).catch(console.error);

    const product = state.products.find(p => p.barcode === decodedText);

    if (product) {
        showProductOverlay(product);
    } else {
        showNewProductOverlay(decodedText);
    }
};

// --- Overlay Logic ---
const showProductOverlay = (product) => {
    // stopScanner(); // User requested to keep camera active
    state.currentOverlayQty = 1;
    const sheet = document.getElementById('scan-result-sheet');
    const backdrop = document.getElementById('overlay-backdrop');

    sheet.innerHTML = `
        <div class="overlay-handle"></div>
        <div style="display:flex; gap:16px; align-items:flex-start;">
            <img src="${product.image || 'https://placehold.co/100x100?text=No+Img'}" style="width:80px; height:80px; border-radius:12px; object-fit:cover; background:var(--surface-light);">
            <div style="flex:1;">
                <h3 style="margin-bottom:4px;">${product.name}</h3>
                <div style="color:var(--success); font-weight:700; font-size:1.25rem;">${parseFloat(product.price).toFixed(2)}₺</div>
                <div style="color:var(--text-muted); font-size:0.8rem; margin-top:4px;">${product.barcode}</div>
            </div>
        </div>
        
        <div class="qty-selector">
            <button class="qty-btn" id="overlay-minus"><i data-lucide="minus" size="16"></i></button>
            <span class="qty-value" id="overlay-qty">1</span>
            <button class="qty-btn" id="overlay-plus"><i data-lucide="plus" size="16"></i></button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:20px;">
            <button id="btn-scan-edit" class="btn btn-secondary">
                <i data-lucide="edit-2"></i> Düzenle
            </button>
            <button id="btn-scan-add" class="btn btn-primary">
                <i data-lucide="shopping-cart"></i> Sepete Ekle
            </button>
        </div>
        <button id="btn-scan-next" class="btn btn-secondary" style="width:100%; margin-top:12px; background:transparent; border:1px solid var(--border);">
            Scan Next Product
        </button>
    `;

    backdrop.classList.add('active');
    sheet.classList.add('active');
    initIcons();

    // Qty Logic
    const updateQtyDisplay = () => {
        document.getElementById('overlay-qty').textContent = state.currentOverlayQty;
    };
    document.getElementById('overlay-minus').onclick = () => {
        if (state.currentOverlayQty > 1) {
            state.currentOverlayQty--;
            updateQtyDisplay();
        }
    };
    document.getElementById('overlay-plus').onclick = () => {
        state.currentOverlayQty++;
        updateQtyDisplay();
    };

    document.getElementById('btn-scan-add').onclick = () => {
        const btn = document.getElementById('btn-scan-add');
        if (btn.disabled) return;
        btn.disabled = true; // Disable immediately

        addToCart(product, state.currentOverlayQty);
        SoundManager.playAdd();

        btn.innerHTML = `<i data-lucide="check"></i> Added`;
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            closeOverlay();
        }, 800);
    };

    document.getElementById('btn-scan-edit').onclick = () => {
        openProductModal(product);
    };

    document.getElementById('btn-scan-next').onclick = closeOverlay;
};

const showNewProductOverlay = (barcode) => {
    // stopScanner(); // User requested to keep camera active
    const sheet = document.getElementById('scan-result-sheet');
    const backdrop = document.getElementById('overlay-backdrop');

    sheet.innerHTML = `
        <div class="overlay-handle"></div>
        <div style="text-align:center; padding:10px 0;">
            <div style="background:var(--surface-light); width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
                <i data-lucide="search" size="24" color="var(--text-muted)"></i>
            </div>
            <h3>Unknown Product</h3>
            <p style="color:var(--text-muted); margin-bottom:20px;">Barcode: ${barcode}</p>
            
            <button id="btn-create-product" class="btn btn-primary">
                <i data-lucide="plus"></i> Add This Product
            </button>
            <button id="btn-cancel-scan" class="btn btn-secondary" style="margin-top:12px; background:transparent;">
                Cancel
            </button>
        </div>
    `;

    backdrop.classList.add('active');
    sheet.classList.add('active');
    initIcons();

    document.getElementById('btn-create-product').onclick = () => {
        openProductModal({ barcode });
    };
    document.getElementById('btn-cancel-scan').onclick = closeOverlay;
};

const closeOverlay = () => {
    document.getElementById('overlay-backdrop').classList.remove('active');
    document.getElementById('scan-result-sheet').classList.remove('active');
    state.scanPaused = false;
    state.lastScannedCode = null;
    resetScanTimeout(); // Restart timeout logic
    if (state.view === 'scanner') {
        startScanner();
    }
};

// --- Modal Logic (Add/Edit/Search) ---
const openProductModal = (initialData = {}, isSearchMode = false) => {
    stopScanner(); // Stop camera when modal opens
    const modal = document.getElementById('product-modal');
    const isEdit = !isSearchMode && !!initialData.barcode && state.products.some(p => p.barcode === initialData.barcode);

    modal.innerHTML = `
        <div class="modal-header">
            <h3 style="margin:0;">${isSearchMode ? 'Barkod Girin' : (isEdit ? 'Ürünü Düzenle' : 'Yeni Ürün')}</h3>
            <button id="btn-close-modal" style="background:none; border:none; color:var(--text); cursor:pointer;">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-content">
            <form id="modal-form">
                <div class="form-group">
                    <label class="form-label">Barkod</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" class="form-input" name="barcode" value="${initialData.barcode || ''}" ${isSearchMode ? 'placeholder="Okutun veya yazın..." autofocus' : 'readonly'}>
                        ${isSearchMode ? `<button type="button" id="btn-check-barcode" class="btn btn-primary" style="width:auto;"><i data-lucide="search"></i></button>` : ''}
                    </div>
                </div>
                
                <div id="modal-product-fields" style="${isSearchMode ? 'display:none;' : ''}">
                    <div class="form-group">
                        <label class="form-label">Ürün Adı</label>
                        <input type="text" class="form-input" name="name" value="${initialData.name || ''}" ${isSearchMode ? '' : 'required'} placeholder="Ürün adı girin">
                        <button type="button" id="btn-modal-fetch" class="btn btn-secondary" style="margin-top:8px; font-size:0.8rem; padding:8px;">
                            Web'den Bilgi Getir
                        </button>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Fiyat (₺)</label>
                        <input type="number" step="0.01" class="form-input" name="price" value="${initialData.price || ''}" ${isSearchMode ? '' : 'required'} placeholder="0.00">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Görsel Bağlantısı</label>
                        <input type="url" class="form-input" name="image" value="${initialData.image || ''}" placeholder="https://...">
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="margin-top:20px;">
                        ${isEdit ? 'Ürünü Güncelle' : 'Ürünü Kaydet'}
                    </button>
                    ${isEdit ? `
                        <button type="button" id="btn-delete-product" class="btn btn-secondary" style="margin-top:12px; background:var(--danger); color:white; border:none;">
                            <i data-lucide="trash-2"></i> Ürünü Sil
                        </button>
                    ` : ''}
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');
    initIcons();

    document.getElementById('btn-close-modal').onclick = closeModal;

    // Search Logic
    const handleSearch = () => {
        const code = document.querySelector('input[name="barcode"]').value;
        if (!code) return;

        const product = state.products.find(p => p.barcode === code);
        if (product) {
            closeModal();
            showProductOverlay(product);
        } else {
            // Switch to Add Mode
            isSearchMode = false; // Update flag so next submit works as save
            document.getElementById('modal-product-fields').style.display = 'block';
            document.querySelector('.modal-header h3').textContent = 'Yeni Ürün';
            document.querySelector('input[name="barcode"]').setAttribute('readonly', true);
            const checkBtn = document.getElementById('btn-check-barcode');
            if (checkBtn) checkBtn.style.display = 'none';

            // Add required attributes back
            document.querySelector('input[name="name"]').setAttribute('required', 'true');
            document.querySelector('input[name="price"]').setAttribute('required', 'true');

            // Try auto-fetch
            document.getElementById('btn-modal-fetch').click();
        }
    };

    if (isSearchMode) {
        document.getElementById('btn-check-barcode').onclick = handleSearch;
    }

    // Fetch Logic
    const fetchBtn = document.getElementById('btn-modal-fetch');
    if (fetchBtn) {
        fetchBtn.onclick = async () => {
            const barcode = document.querySelector('#modal-form input[name="barcode"]').value;
            fetchBtn.textContent = 'Aranıyor...';
            try {
                const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
                const data = await response.json();
                if (data.status === 1) {
                    const product = data.product;
                    document.querySelector('#modal-form input[name="name"]').value = product.product_name || '';
                    document.querySelector('#modal-form input[name="image"]').value = product.image_url || '';
                    fetchBtn.textContent = 'Bulundu!';
                } else {
                    fetchBtn.textContent = 'Bulunamadı';
                }
            } catch (e) {
                fetchBtn.textContent = 'Hata';
            }
        };
    }

    // Submit Logic
    document.getElementById('modal-form').onsubmit = (e) => {
        e.preventDefault();

        if (isSearchMode) {
            handleSearch();
            return;
        }

        const formData = new FormData(e.target);
        const newProduct = {
            barcode: formData.get('barcode'),
            name: formData.get('name'),
            price: parseFloat(formData.get('price')),
            image: formData.get('image'),
            updatedAt: new Date().toISOString(),
            addedAt: isEdit ? initialData.addedAt : new Date().toISOString()
        };

        if (isEdit) {
            const index = state.products.findIndex(p => p.barcode === newProduct.barcode);
            if (index !== -1) state.products[index] = newProduct;
        } else {
            if (state.products.find(p => p.barcode === newProduct.barcode)) {
                alert('Exists!');
                return;
            }
            state.products.push(newProduct);
        }

        // Save to Firebase
        StorageManager.saveProducts(newProduct).then(() => {
            showToast('Ürün kaydedildi', 'check');
        }).catch(err => {
            console.error(err);
            showToast('Kaydetme hatası', 'alert-circle');
        });

        closeModal();
        closeOverlay();
        SoundManager.playSuccess();
        render();
    };

    // Delete Logic
    if (isEdit) {
        const deleteBtn = document.getElementById('btn-delete-product');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
                    // Remove from products
                    state.products = state.products.filter(p => p.barcode !== initialData.barcode);

                    // Remove from cart if present
                    state.cart = state.cart.filter(item => item.barcode !== initialData.barcode);
                    StorageManager.saveCart(state.cart);

                    // Persistence delete
                    deleteProduct(initialData.barcode).then(() => {
                        console.log("Deleted from Firebase");
                    }).catch(console.error);

                    showToast('Ürün silindi', 'trash-2');
                    closeModal();
                    render();
                }
            };
        }
    }
};

const closeModal = () => {
    document.getElementById('product-modal').classList.remove('active');
    // Restart Scanner if needed and no other overlay is open
    if (state.view === 'scanner' && !document.getElementById('scan-result-sheet').classList.contains('active')) {
        startScanner();
    }
};

// --- Standard Views (Products/Cart) ---
const renderProducts = () => {
    pageTitle.textContent = `Ürünler (${state.products.length})`;
    headerActions.innerHTML = '';

    let container = document.getElementById('list-view');
    let searchInput = document.getElementById('product-search-input');
    let productListContainer = document.getElementById('product-list-container');

    if (!searchInput) {
        container.innerHTML = ''; // Clear only if building initial structure

        // Search Bar
        const searchContainer = document.createElement('div');
        searchContainer.style.padding = '0 4px 12px 4px';

        searchInput = document.createElement('input');
        searchInput.id = 'product-search-input'; // Add ID for persistence check
        searchInput.type = 'text';
        searchInput.className = 'form-input';
        searchInput.placeholder = 'Ürün ara...';
        searchInput.value = state.productSearchQuery || '';

        // Use input event but DO NOT re-render the whole function
        searchInput.oninput = (e) => {
            state.productSearchQuery = e.target.value;
            updateProductList(); // Only update the list
        };

        searchContainer.appendChild(searchInput);
        container.appendChild(searchContainer);

        // List Container
        productListContainer = document.createElement('div');
        productListContainer.id = 'product-list-container';
        container.appendChild(productListContainer);
    } else {
        if (document.activeElement !== searchInput) {
            searchInput.value = state.productSearchQuery || '';
        }
    }

    // Helper to render just the list
    const updateProductList = () => {
        const listContainer = document.getElementById('product-list-container');
        listContainer.innerHTML = '';

        // Filter
        let displayProducts = [...state.products];
        displayProducts.sort((a, b) => {
            const countA = a.scanCount || 0;
            const countB = b.scanCount || 0;
            if (countB !== countA) return countB - countA;
            const nameA = a.name || '';
            const nameB = b.name || '';
            return nameA.localeCompare(nameB);
        });

        if (state.productSearchQuery) {
            const q = state.productSearchQuery.toLowerCase();
            displayProducts = state.products.filter(p => (p.name || '').toLowerCase().includes(q) || (p.barcode || '').includes(q));
        }

        if (displayProducts.length === 0) {
            listContainer.innerHTML = `<div class="empty-state"><p>Ürün bulunamadı.</p></div>`;
            initIcons();
            return;
        }

        const content = document.createElement('div');
        content.className = 'cart-content';

        const list = document.createElement('div');
        list.className = 'card';

        displayProducts.forEach(product => {
            const cartItem = state.cart.find(i => i.barcode === product.barcode);
            const qty = cartItem ? cartItem.quantity : 0;

            const row = document.createElement('div');
            row.className = 'cart-item';
            row.innerHTML = `
                <div class="product-click-area" style="display:flex; gap:12px; align-items:center; flex:1;">
                    <img src="${product.image || 'https://placehold.co/100x100?text=No+Img'}" class="product-image" style="width:48px; height:48px; object-fit:cover; border-radius:4px;">
                    <div>
                        <div style="font-weight:600;">${product.name || 'İsimsiz Ürün'}</div>
                        <div style="color:var(--success); font-weight:700; font-size:0.95rem;">${(parseFloat(product.price) || 0).toFixed(2)}₺</div>
                    </div>
                </div>
                <div class="cart-controls">
                    ${qty > 0 ? `
                        <button class="cart-btn btn-minus" data-barcode="${product.barcode}"><i data-lucide="minus" size="16"></i></button>
                        <span>${qty}</span>
                        <button class="cart-btn btn-plus" data-barcode="${product.barcode}"><i data-lucide="plus" size="16"></i></button>
                    ` : `
                        <button class="cart-btn btn-add-simple" data-barcode="${product.barcode}" style="background:var(--primary); color:white; width:32px; height:32px;">
                            <i data-lucide="shopping-cart" size="16"></i>
                        </button>
                    `}
                </div>
            `;

            row.querySelector('.product-click-area').onclick = () => openProductModal(product);
            list.appendChild(row);
        });
        content.appendChild(list);
        listContainer.appendChild(content);

        // Re-attach listeners for the new list elements
        listContainer.querySelectorAll('.btn-plus').forEach(btn => {
            btn.onclick = () => updateCartQuantity(btn.dataset.barcode, 1);
        });
        listContainer.querySelectorAll('.btn-minus').forEach(btn => {
            btn.onclick = () => updateCartQuantity(btn.dataset.barcode, -1);
        });
        listContainer.querySelectorAll('.btn-add-simple').forEach(btn => {
            btn.onclick = () => {
                const product = state.products.find(p => p.barcode === btn.dataset.barcode);
                if (product) {
                    addToCart(product, 1);
                    SoundManager.playAdd();
                }
            };
        });

        initIcons();
    };

    // Initial list render
    updateProductList();
};

const renderCart = () => {
    pageTitle.textContent = 'Sepet';
    headerActions.innerHTML = '';

    const container = document.getElementById('list-view');
    container.innerHTML = '';
    let displayItems = state.cart;
    if (state.cart.length === 0) {
        container.innerHTML += `<div class="empty-state"><p>Sepetiniz boş.</p></div>`;
        initIcons();
        return;
    }

    const content = document.createElement('div');
    content.className = 'cart-content';

    const list = document.createElement('div');
    list.className = 'card';
    let total = 0;

    const fullTotal = state.cart.reduce((acc, item) => {
        const product = state.products.find(p => p.barcode === item.barcode);
        return acc + (product ? product.price * item.quantity : 0);
    }, 0);

    displayItems.forEach(item => {
        const product = state.products.find(p => p.barcode === item.barcode);
        if (!product) return;

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600;">${product.name || 'İsimsiz Ürün'}</div>
                <div style="font-size:0.85rem;">${(product.price || 0).toFixed(2)}₺ x ${item.quantity}</div>
            </div>
            <div class="cart-controls">
                <button class="cart-btn btn-minus" data-barcode="${item.barcode}"><i data-lucide="minus" size="16"></i></button>
                <span class="qty-display" data-barcode="${item.barcode}" style="min-width:24px; text-align:center; cursor:pointer; border-bottom:1px dashed var(--text-muted);">${item.quantity}</span>
                <button class="cart-btn btn-plus" data-barcode="${item.barcode}"><i data-lucide="plus" size="16"></i></button>
            </div>
        `;
        list.appendChild(row);
    });

    const totalRow = document.createElement('div');
    totalRow.className = 'cart-total';
    totalRow.innerHTML = `<span>Toplam</span><span style="color:var(--success);">${fullTotal.toFixed(2)}₺</span>`;
    list.appendChild(totalRow);

    content.appendChild(list);
    container.appendChild(content);

    // Fixed Footer
    const footer = document.createElement('div');
    footer.className = 'cart-footer';
    footer.innerHTML = `
        <button id="btn-clear-cart" class="btn btn-secondary" style="flex:1; background:var(--error); color:white; border:none;">
            <i data-lucide="trash-2"></i> Sepeti Boşalt
        </button>
        <button id="btn-checkout" class="btn btn-primary" style="flex:2;">
            <i data-lucide="check"></i> Sepeti Onayla
        </button>
    `;
    container.appendChild(footer);

    // Footer Listeners
    document.getElementById('btn-clear-cart').onclick = () => {
        if (confirm('Sepeti boşaltmak istediğinize emin misiniz?')) {
            state.cart = [];
            state.cartSearchQuery = ''; // Reset search
            StorageManager.saveCart(state.cart);
            render();
        }
    };
    document.getElementById('btn-checkout').onclick = async (e) => {
        const btn = e.target;
        if (btn.disabled) return;

        btn.disabled = true;
        btn.textContent = 'İşleniyor...';

        try {
            const saleData = {
                items: state.cart.map(item => {
                    const product = state.products.find(p => p.barcode === item.barcode);
                    return {
                        barcode: item.barcode,
                        quantity: item.quantity,
                        name: product ? product.name : 'Bilinmeyen Ürün',
                        price: product ? product.price : 0
                    };
                }),
                total: fullTotal
            };

            const saleId = await createSale(saleData);

            // Update Local State
            state.sales.unshift({
                id: saleId,
                ...saleData,
                date: new Date().toISOString(),
                status: 'completed'
            });

            // Clear Cart
            state.cart = [];
            state.cartSearchQuery = '';
            StorageManager.saveCart(state.cart);

            SoundManager.playSuccess(); // Play success sound
            showToast('Satış başarıyla tamamlandı!', 'check');
            navigate('history');

        } catch (error) {
            console.error(error);
            showToast('Hata oluştu', 'alert-circle');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> Checkout';
            initIcons();
        }
    };

    // Quantity & Edit Listeners
    container.querySelectorAll('.btn-plus').forEach(btn => {
        btn.onclick = () => updateCartQuantity(btn.dataset.barcode, 1);
    });
    // Quantity Listeners
    container.querySelectorAll('.btn-plus').forEach(btn => {
        btn.onclick = () => updateCartQuantity(btn.dataset.barcode, 1);
    });
    container.querySelectorAll('.btn-minus').forEach(btn => {
        btn.onclick = () => updateCartQuantity(btn.dataset.barcode, -1);
    });
    // Manual Quantity Entry
    container.querySelectorAll('.qty-display').forEach(span => {
        span.onclick = () => {
            const currentQty = parseInt(span.textContent);
            const newQtyStr = prompt('Adet girin:', currentQty);
            if (newQtyStr !== null) {
                const newQty = parseInt(newQtyStr);
                if (!isNaN(newQty) && newQty > 0) {
                    const diff = newQty - currentQty;
                    updateCartQuantity(span.dataset.barcode, diff);
                }
            }
        };
    });

    initIcons();
};

// --- History View ---
const renderHistory = () => {
    pageTitle.textContent = 'Geçmiş';
    headerActions.innerHTML = '';
    const container = document.getElementById('list-view');
    container.innerHTML = '';

    if (!state.sales || state.sales.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>Henüz satış yok.</p></div>`;
        return;
    }

    // Sort by Date Descending
    const sortedSales = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Group by Day
    const grouped = {};
    const todayStr = new Date().toDateString();

    sortedSales.forEach(sale => {
        const d = new Date(sale.date);
        const dayKey = d.toDateString();
        if (!grouped[dayKey]) grouped[dayKey] = [];
        grouped[dayKey].push(sale);
    });

    const list = document.createElement('div');
    const todayGroups = grouped[todayStr] ? { [todayStr]: grouped[todayStr] } : {};
    const otherGroups = { ...grouped };
    delete otherGroups[todayStr];

    const renderGroup = (dateKey, sales, isHidden = false) => {
        const groupContainer = document.createElement('div');
        if (isHidden) {
            groupContainer.style.display = 'none';
            groupContainer.className = 'history-past-group';
        }

        const dateObj = new Date(sales[0].date);
        const dateLabel = dateKey === todayStr ? 'Bugün' : dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

        const header = document.createElement('h3');
        header.style.fontSize = '0.9rem';
        header.style.color = 'var(--text-muted)';
        header.style.margin = '20px 0 8px 4px';
        header.style.textTransform = 'capitalize';
        header.textContent = dateLabel;
        groupContainer.appendChild(header);

        sales.forEach(sale => {
            const card = document.createElement('div');
            card.className = 'card';
            const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);
            const date = new Date(sale.date);
            const timeStr = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div>
                        <div style="font-weight:700; font-size:1.1rem;">${itemCount} ürün</div>
                        <div style="color:var(--text-muted); font-size:0.85rem;">${timeStr}</div>
                    </div>
                    <div style="font-size:1.25rem; font-weight:700; color:var(--success);">${sale.total.toFixed(2)}₺</div>
                </div>
                <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:12px;">
                    ${sale.items.map(item => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
                            <span>${item.name} <span style="color:var(--primary); font-weight:700; margin-left:4px;">x${item.quantity}</span></span>
                            <span>${(item.price * item.quantity).toFixed(2)}₺</span>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary restore-btn" data-sale-id="${sale.id}" style="width:100%; margin-top:12px;">
                    <i data-lucide="copy"></i> Sepete Kopyala
                </button>
            `;
            groupContainer.appendChild(card);
        });
        list.appendChild(groupContainer);
    };

    // Render Today
    if (grouped[todayStr]) {
        renderGroup(todayStr, grouped[todayStr]);
    } else {
        list.innerHTML += `<div style="text-align:center; padding:20px; color:var(--text-muted);">Bugün hiç satış yok.</div>`;
    }

    // Render Others (Hidden by default)
    const hasHistory = Object.keys(otherGroups).length > 0;
    if (hasHistory) {
        Object.keys(otherGroups).forEach(key => renderGroup(key, otherGroups[key], true));

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-secondary';
        toggleBtn.style.marginTop = '20px';
        toggleBtn.innerHTML = `Geçmiş Siparişleri Göster`;
        toggleBtn.onclick = () => {
            const hidden = list.querySelectorAll('.history-past-group');
            const isHidden = hidden[0].style.display === 'none';
            hidden.forEach(el => el.style.display = isHidden ? 'block' : 'none');
            toggleBtn.innerHTML = isHidden ? 'Geçmişi Gizle' : 'Geçmiş Siparişleri Göster';
        };
        list.appendChild(toggleBtn);
    }

    container.appendChild(list);

    // Restore listeners
    container.querySelectorAll('.restore-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const saleId = btn.dataset.saleId;
            const sale = state.sales.find(s => s.id === saleId);
            if (sale) {
                state.cart = sale.items.map(i => ({ barcode: i.barcode, quantity: i.quantity }));
                StorageManager.saveCart(state.cart);
                SoundManager.playAdd(); // Play add sound
                navigate('cart');
                showToast('Sepet geri yüklendi', 'check');
            }
        };
    });
    initIcons();
};

const addToCart = (product, qty = 1) => {
    const existing = state.cart.find(item => item.barcode === product.barcode);
    if (existing) {
        existing.quantity += qty;
    } else {
        state.cart.push({ barcode: product.barcode, quantity: qty });
    }
    StorageManager.saveCart(state.cart);
    render();
};

const updateCartQuantity = (barcode, change) => {
    const item = state.cart.find(i => i.barcode === barcode);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            state.cart = state.cart.filter(i => i.barcode !== barcode);
        }
        StorageManager.saveCart(state.cart);
        render();
    }
};

// --- Init ---
createOverlayElements();
initScannerDOM();
initIcons();

// Resume Audio Context on first interaction
document.addEventListener('click', () => {
    if (!SoundManager.ctx) SoundManager.init();
    SoundManager.resume();
}, { once: true });

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navigate(item.dataset.view);
    });
});

// Start in scanner view
render();

// Fetch initial data
Promise.all([fetchSales(), fetchProducts()]).then(([sales, products]) => {
    state.sales = sales;
    state.products = products;
    render(); // Re-render to show products if on products view
    if (state.view === 'history') renderHistory();
}).catch(console.error);
