// config.js - Place this file alongside your HTML files
const CONFIG = {
    // ==========================================
    // JSONBIN.IO SETUP (Easiest - Free Tier)
    // ==========================================
    // 1. Go to https://jsonbin.io
    // 2. Sign up for free account
    // 3. Click "Create Bin"
    // 4. Name it "keys", paste this as content: {"keys":[]}
    // 5. Copy the Bin ID from the URL
    // 6. Go to API Keys, copy the Master Key
    
    BIN_ID: 'YOUR_BIN_ID_HERE',
    API_KEY: '$2a$10$YOUR_API_KEY_HERE',
    
    // ==========================================
    // GITHUB GIST SETUP (Alternative)
    // ==========================================
    USE_GIST: false, // Set to true to use GitHub Gist
    GIST_ID: 'YOUR_GIST_ID_HERE',
    GITHUB_TOKEN: 'ghp_YOUR_GITHUB_TOKEN_HERE',
    
    // ==========================================
    // GENERAL SETTINGS
    // ==========================================
    KEY_PREFIX: '', // e.g., 'MYAPP-' makes keys like MYAPP-XXXX-XXXX-XXXX
};
