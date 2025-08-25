// Enhanced server.js with OTP and Firestore integration
require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const axios = require('axios');
const { URLSearchParams } = require('url');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const app = express();

// Production settings
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// SMS-OTP configuration
const SMS_USERNAME = process.env.SMS_USERNAME || "Lekh09";
const SMS_APIKEY = process.env.SMS_APIKEY || "409DC-16CCF";
const SMS_SENDER = process.env.SMS_SENDER || "MORORE";
const SMS_ROUTE = process.env.SMS_ROUTE || "OTP";
const SMS_TEMPLATEID = process.env.SMS_TEMPLATEID || "1707174419181876651";

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware - SINGLE CONFIGURATION
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    },
    name: 'sessionId'
}));

// Trust proxy in production
if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Utility functions
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

function validatePhoneNumber(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    // Indian mobile numbers: 10 digits starting with 6, 7, 8, or 9
    return /^[6-9]\d{9}$/.test(cleanPhone);
}

function validateUsername(username) {
    return username && username.length >= 3 && username.length <= 20;
}

// Routes
app.get('/', (req, res) => {
    res.render('welcome');
});

app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// POST /register - Store user data and send OTP
app.post('/register', async (req, res) => {
    console.log("📵 /register - Request received");
    console.log("📋 Request body:", req.body);
    
    const { username, phoneNumber, city } = req.body;
    
    // Server-side validation
    const errors = [];
    
    if (!validateUsername(username)) {
        errors.push('Username must be between 3-20 characters');
    }
    
    if (!validatePhoneNumber(phoneNumber)) {
        errors.push('Please enter a valid 10-digit Indian mobile number');
    }
    
    if (!city || city.length < 2) {
        errors.push('Please enter a valid city name');
    }
    
    if (errors.length > 0) {
        return res.render('register', { error: errors.join(', ') });
    }
    
    // Normalize phone number
    const rawPhone = phoneNumber.trim().replace(/\s+/g, '');
    console.log("📱 Normalized phone:", rawPhone);

    try {
        // Check if user already exists
        const uid = `phone_${rawPhone}`;
        console.log("🔍 Checking if user already exists with UID:", uid);
        
        let existingUser = null;
        try {
            await admin.auth().getUser(uid);
            // If we get here, user exists in Firebase Auth
            
            // Check if user profile exists in Firestore
            const userSnap = await db.collection("users").doc(uid).get();
            if (userSnap.exists) {
                existingUser = userSnap.data();
                console.log("✅ Existing user found:", existingUser.username);
            }
        } catch (err) {
            if (err.code !== "auth/user-not-found") {
                console.error("❌ Error checking user:", err);
                return res.render('register', { error: 'Error checking user. Please try again.' });
            }
            console.log("🆕 New user - proceeding with registration");
        }

        // Store pending user info
        console.log("💾 Storing pending user info in Firestore");
        const pendingData = { 
            username, 
            phoneNumber: rawPhone,
            city,
            isNewUser: !existingUser
        };
        
        await db.collection("otpUsers").doc(rawPhone).set(pendingData);
        console.log("✅ Pending user info stored");

        // Generate & store OTP
        const otp = generateOTP();
        console.log("🔢 Generated OTP:", otp);
        
        const expiresAt = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        );
        
        console.log("💾 Storing OTP in Firestore");
        await db.collection("otps").doc(rawPhone).set({ otp, expiresAt });
        console.log("✅ OTP stored in Firestore");

        // Build SMS API URL
        const smsMessage = `Hi ${username}, ${otp} is your AR Experience verification code, valid for 5 minutes. MORORE`;
        const params = new URLSearchParams({
            username: SMS_USERNAME,
            apikey: SMS_APIKEY,
            apirequest: "Text",
            sender: SMS_SENDER,
            mobile: rawPhone,
            message: smsMessage,
            route: SMS_ROUTE,
            TemplateID: SMS_TEMPLATEID,
            format: "JSON"
        });
        const url = `http://123.108.46.13/sms-panel/api/http/index.php?${params.toString()}`;
        
        console.log("📤 Sending SMS via API");

        try {
            const smsResp = await axios.get(url, { timeout: 10000 });
            console.log("📣 SMS gateway replied:", smsResp.data);
            const status = String(smsResp.data?.status || "").toLowerCase();
            
            if (status !== "success") {
                console.error("❌ SMS failed:", smsResp.data);
                // For development, we'll still proceed to OTP page
                if (NODE_ENV === 'development') {
                    console.log("🚧 Development mode: Proceeding despite SMS failure");
                } else {
                    return res.render('register', { error: 'Failed to send OTP. Please try again.' });
                }
            }

            // Store session data for OTP verification
            req.session.userData = {
                username,
                phoneNumber: rawPhone,
                city,
                otp,
                otpGenerated: Date.now()
            };

            console.log('\n' + '='.repeat(50));
            console.log(`📢 OTP GENERATED FOR TESTING`);
            console.log(`📱 Phone Number: +91 ${rawPhone}`);
            console.log(`🔢 OTP Code: ${otp}`);
            console.log(`⏰ Generated at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
            console.log('='.repeat(50) + '\n');
            
            res.redirect('/otp');

        } catch (smsError) {
            console.error("❌ SMS API error:", smsError.response?.data || smsError.message);
            
            // For development, we'll still proceed
            if (NODE_ENV === 'development') {
                req.session.userData = {
                    username,
                    phoneNumber: rawPhone,
                    city,
                    otp,
                    otpGenerated: Date.now()
                };
                
                console.log("🚧 Development mode: Proceeding despite SMS error");
                res.redirect('/otp');
            } else {
                return res.render('register', { error: 'Failed to send OTP. Please try again.' });
            }
        }
    } catch (e) {
        console.error("❌ Error in register endpoint:", e);
        return res.render('register', { error: 'Internal server error. Please try again.' });
    }
});

app.get('/otp', (req, res) => {
    if (!req.session.userData) {
        return res.redirect('/register');
    }
    
    const { phoneNumber, otp } = req.session.userData;
    
    // Pass OTP to the view ONLY in development mode
    const displayOTP = NODE_ENV !== 'production' ? otp : null;
    
    res.render('otp', { 
        phoneNumber: phoneNumber,
        error: null,
        testOTP: displayOTP
    });
});

app.post('/verify-otp', async (req, res) => {
    console.log('📵 OTP verification request received:', req.body);
    
    // Get OTP from form
    let otp = req.body.otp;
    if (!otp) {
        otp = (req.body.otp1 || '') + (req.body.otp2 || '') + (req.body.otp3 || '') + (req.body.otp4 || '');
    }
    
    console.log('Received OTP:', otp);
    
    if (!req.session.userData) {
        console.log('No session data found, redirecting to register');
        return res.redirect('/register');
    }
    
    const { phoneNumber } = req.session.userData;
    
    try {
        // Validate OTP from Firestore
        console.log("🔍 Looking up OTP in Firestore");
        const otpSnap = await db.collection("otps").doc(phoneNumber).get();
        
        if (!otpSnap.exists) {
            console.log("❌ No OTP found for this phone");
            const displayOTP = NODE_ENV !== 'production' ? req.session.userData.otp : null;
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: 'OTP not found. Please request a new one.',
                testOTP: displayOTP
            });
        }
        
        const otpData = otpSnap.data();
        console.log("📄 OTP data found:", { 
            storedOtp: otpData.otp, 
            expiresAt: otpData.expiresAt.toDate() 
        });
        
        const currentTime = admin.firestore.Timestamp.now().toMillis();
        const expiryTime = otpData.expiresAt.toMillis();
        
        if (otpData.otp !== otp) {
            console.log("❌ OTP mismatch - provided:", otp, "stored:", otpData.otp);
            const displayOTP = NODE_ENV !== 'production' ? req.session.userData.otp : null;
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: 'Invalid OTP. Please try again.',
                testOTP: displayOTP
            });
        }
        
        if (currentTime > expiryTime) {
            console.log("❌ OTP expired");
            const displayOTP = NODE_ENV !== 'production' ? req.session.userData.otp : null;
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: 'OTP has expired. Please request a new one.',
                testOTP: displayOTP
            });
        }
        
        console.log("✅ OTP valid - deleting from Firestore");
        await db.collection("otps").doc(phoneNumber).delete();

        // Retrieve and delete pending user info
        console.log("🔍 Retrieving pending user info");
        const pendingSnap = await db.collection("otpUsers").doc(phoneNumber).get();
        const pending = pendingSnap.exists ? pendingSnap.data() : {};
        console.log("📄 Pending user data:", pending);
        
        await db.collection("otpUsers").doc(phoneNumber).delete();
        console.log("✅ Deleted pending user info");

        // Normalize to E.164
        let firebasePhone;
        if (/^\d{10}$/.test(phoneNumber)) {
            firebasePhone = "+91" + phoneNumber;
        } else if (phoneNumber.startsWith("+") && /^\+\d{11,15}$/.test(phoneNumber)) {
            firebasePhone = phoneNumber;
        } else {
            firebasePhone = "+" + phoneNumber;
        }
        console.log("📱 Firebase phone format:", firebasePhone);

        // Ensure Firebase user exists
        const uid = `phone_${phoneNumber}`;
        console.log("🔍 Checking if Firebase user exists with UID:", uid);
        
        try {
            await admin.auth().getUser(uid);
            console.log("✅ Firebase user already exists");
        } catch (err) {
            if (err.code === "auth/user-not-found") {
                console.log("🔍 Creating new Firebase user");
                await admin.auth().createUser({
                    uid,
                    phoneNumber: firebasePhone
                });
                console.log("✅ Firebase user created");
            } else {
                console.error("❌ Firebase auth error:", err);
                return res.render('otp', { 
                    phoneNumber: phoneNumber,
                    error: 'Authentication error. Please try again.',
                    testOTP: NODE_ENV !== 'production' ? req.session.userData.otp : null
                });
            }
        }

        // Store user profile in Firestore
        console.log("💾 Storing user profile in Firestore");
        const userProfileData = {
            username: pending.username || req.session.userData.username,
            phoneNumber: phoneNumber,
            city: pending.city || req.session.userData.city,
            createdAt: FieldValue.serverTimestamp(),
            lastLoginAt: FieldValue.serverTimestamp()
        };

        await db.collection("users").doc(uid).set(userProfileData, { merge: true });
        console.log("✅ User profile stored");

        // Mark as verified and proceed to AR experience
        req.session.userData.verified = true;
        console.log('✅ OTP verified successfully, redirecting to AR experience');
        
        res.redirect('/ar-experience');

    } catch (e) {
        console.error("❌ Error in verify-otp endpoint:", e);
        const displayOTP = NODE_ENV !== 'production' ? req.session.userData.otp : null;
        return res.render('otp', { 
            phoneNumber: phoneNumber,
            error: 'Internal server error. Please try again.',
            testOTP: displayOTP
        });
    }
});

app.post('/resend-otp', async (req, res) => {
    if (!req.session.userData) {
        return res.json({ success: false, message: 'Session expired' });
    }
    
    const { phoneNumber, username } = req.session.userData;
    
    try {
        const newOTP = generateOTP();
        const expiresAt = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 5 * 60 * 1000)
        );
        
        // Update OTP in Firestore
        await db.collection("otps").doc(phoneNumber).set({ otp: newOTP, expiresAt });
        
        // Update session
        req.session.userData.otp = newOTP;
        req.session.userData.otpGenerated = Date.now();
        
        // Send SMS
        const smsMessage = `Hi ${username}, ${newOTP} is your AR Experience verification code, valid for 5 minutes. MORORE`;
        const params = new URLSearchParams({
            username: SMS_USERNAME,
            apikey: SMS_APIKEY,
            apirequest: "Text",
            sender: SMS_SENDER,
            mobile: phoneNumber,
            message: smsMessage,
            route: SMS_ROUTE,
            TemplateID: SMS_TEMPLATEID,
            format: "JSON"
        });
        const url = `http://123.108.46.13/sms-panel/api/http/index.php?${params.toString()}`;
        
        try {
            const smsResp = await axios.get(url, { timeout: 10000 });
            console.log("📣 SMS resent:", smsResp.data);
        } catch (smsError) {
            console.error("❌ SMS resend error:", smsError.message);
            if (NODE_ENV !== 'development') {
                return res.json({ success: false, message: 'Failed to send SMS' });
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log(`🔄 OTP RESENT FOR TESTING`);
        console.log(`📱 Phone Number: +91 ${phoneNumber}`);
        console.log(`🔢 New OTP Code: ${newOTP}`);
        console.log(`⏰ Resent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log('='.repeat(50) + '\n');
        
        res.json({ 
            success: true, 
            message: 'OTP sent successfully',
            testOTP: NODE_ENV !== 'production' ? newOTP : undefined
        });
        
    } catch (error) {
        console.error("❌ Error resending OTP:", error);
        res.json({ success: false, message: 'Failed to resend OTP' });
    }
});

app.get('/ar-experience', (req, res) => {
    if (!req.session.userData || !req.session.userData.verified) {
        return res.redirect('/register');
    }
    
    res.render('ar-experience', { 
        userData: req.session.userData 
    });
});

// Development-only endpoint to get current OTP
if (NODE_ENV !== 'production') {
    app.get('/dev/otp', (req, res) => {
        console.log('Session check - Session ID:', req.sessionID);
        console.log('Session data:', req.session);
        
        if (!req.session.userData) {
            return res.json({ 
                error: 'No OTP session found',
                sessionId: req.sessionID,
                hasSession: !!req.session,
                sessionKeys: Object.keys(req.session || {})
            });
        }
        
        const { otp, phoneNumber, otpGenerated } = req.session.userData;
        const timeRemaining = Math.max(0, (5 * 60 * 1000) - (Date.now() - otpGenerated));
        
        res.json({
            phoneNumber: `+91 ${phoneNumber}`,
            otp: otp,
            timeRemaining: Math.floor(timeRemaining / 1000),
            expired: timeRemaining <= 0,
            sessionId: req.sessionID
        });
    });
}

// API endpoints
app.get('/api/user-data', async (req, res) => {
    if (!req.session.userData || !req.session.userData.verified) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { phoneNumber } = req.session.userData;
    const uid = `phone_${phoneNumber}`;
    
    try {
        const userSnap = await db.collection("users").doc(uid).get();
        if (!userSnap.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userSnap.data();
        res.json({
            username: userData.username || null,
            city: userData.city || null,
            phoneNumber: userData.phoneNumber || null,
            verified: true
        });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health-check', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        error: 'Something went wrong!',
        message: NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page Not Found',
        message: 'The page you are looking for does not exist.'
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    if (NODE_ENV !== 'production') {
        console.log('⚠️ Development mode: OTP will be displayed on the page');
    }
    console.log('📱 Flow: Welcome → Register → OTP → AR Experience');
    console.log('🔥 Firebase Firestore integration enabled');
});

module.exports = app;