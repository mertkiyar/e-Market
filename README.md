# e-Market - Mobile Barcode Scanner

A web-based mobile barcode scanner application for small businesses. This application allows users to scan products, manage inventory, create shopping carts, and track sales history. It is designed to run on mobile devices with camera support.

## Features

### Scanner
- **Fast Barcode Scanning**: Uses the device camera to quickly scan product barcodes (EAN, UPC, Code 128).
- **Manual Entry**: Option to manually enter barcodes if scanning fails.
- **Camera Control**: Efficient camera lifecycle management to preserve battery. The camera active state is optimized for user flow.
- **Sound Feedback**: Audio cues for successful scans, errors, and cart additions.

### Product Management
- **Inventory List**: View all saved products with search functionality.
- **Popularity Sorting**: Products are automatically sorted by scan frequency, keeping frequently used items at the top.
- **Product Details**: Add and edit product names, prices, and images.
- **Corrupt Data Handling**: Robust handling of incomplete product data (e.g., missing names) allowing for safe deletion or correction.
- **Quick Actions**: Add to cart or edit directly from the product list.

### Shopping Cart
- **Real-time Cart**: View scanned items, adjust quantities, or remove items.
- **Total Calculation**: Automatic calculation of the total price.
- **Checkout**: Save sales to history and clear the current cart.

### Sales History
- **Daily Grouping**: Sales are grouped by date for easy review.
- **Restore Cart**: Ability to reload a past sale back into the active cart for repeat orders.

## Technology Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES Modules)
- **Build Tool**: Vite
- **Database**: Firebase Firestore
- **Scanning Library**: html5-qrcode
- **Icons**: Lucide
- **Date Handling**: date-fns

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (Node Package Manager)
- A Firebase project with Firestore enabled

## Installation

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

This project uses Firebase for data persistence. You must configure your API keys.

1. Create a `.env` file in the root directory.
2. Copy the contents of `.env.example` into `.env`.
3. Fill in your Firebase project credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

## Usage

### Development Server
To run the application locally for development:
```bash
npm run dev
```
Open the provided URL (usually `http://localhost:5173`) in your browser. Note that camera access usually requires HTTPS or localhost.

### Building for Production
To create a production-ready build:
```bash
npm run build
```
The output will be in the `dist` directory.

### Preview Production Build
To test the production build locally:
```bash
npm run preview
```

## Project Structure

- `src/`: Source files (though simple setup uses root files currently).
- `public/`: Static assets.
- `main.js`: Core application logic, state management, and DOM manipulation.
- `firebase.js`: Firebase configuration and service functions.
- `style.css`: Global styles and responsive design definitions.
- `index.html`: Main entry point.

## License

MIT License
