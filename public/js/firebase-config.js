// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDSGZovvnyN6MXwEln5Bmdqx7CgGcverhc",
    authDomain: "romracaphe.firebaseapp.com",
    projectId: "romracaphe",
    storageBucket: "romracaphe.firebasestorage.app",
    messagingSenderId: "770609951521",
    appId: "1:770609951521:web:beef21e5c1167a0e06c460",
    measurementId: "G-M0V6ZMMMR9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Export for global usage
window.FirebaseStorage = storage;
window.FirebaseRef = ref;
window.FirebaseUpload = uploadBytesResumable;
window.FirebaseGetDownloadURL = getDownloadURL;
