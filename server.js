// Enhanced server.js with improved database and SMS integration
require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');

// Import custom services
const DatabaseService = require('./db');
const SMSService = require('./sms');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();

// Production settings
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// Initialize services
const dbService = new DatabaseService();
const smsService = new SMSService({
    username: process.env.SMS_USERNAME,
    apikey: process.env.SMS_APIKEY,
    sender: process.env.SMS_SENDER,
    route: process.env.SMS_ROUTE,
    templateId: process.env.SMS_TEMPLATEID
});

// Rate limiting middleware
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 auth requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware
app.use(generalLimiter);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
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
function validateUsername(username) {
    return username && 
           username.length >= 3 && 
           username.length <= 20 && 
           /^[a-zA-Z0-9_]+$/.test(username);
}

function validatePhoneNumber(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    return /^[6-9]\d{9}$/.test(cleanPhone);
}

function validateCity(city) {
    return city && city.length >= 2 && city.length <= 50;
}

// Routes
app.get('/', (req, res) => {
    res.render('welcome');
});

app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Enhanced registration endpoint
app.post('/register', authLimiter, async (req, res) => {
    console.log("🔵 /register - Request received");
    console.log("📋 Request body:", req.body);
    
    const { username, phoneNumber, city } = req.body;
    
    // Server-side validation
    const errors = [];
    
    if (!validateUsername(username)) {
        errors.push('Username must be 3-20 characters and contain only letters, numbers, and underscores');
    }
    
    if (!validatePhoneNumber(phoneNumber)) {
        errors.push('Please enter a valid 10-digit Indian mobile number');
    }
    
    if (!validateCity(city)) {
        errors.push('Please enter a valid city name');
    }
    
    if (errors.length > 0) {
        return res.render('register', { error: errors.join(', ') });
    }
    
    // Normalize phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    console.log("📱 Normalized phone:", cleanPhone);

    try {
        // Log registration attempt
        await dbService.logEvent('registration_attempt', {
            username,
            phoneNumber: cleanPhone,
            city,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Check if user already exists
        console.log("🔍 Checking if user already exists");
        const existingUser = await dbService.getUserByPhone(cleanPhone);
        let isNewUser = !existingUser.success;

        if (existingUser.success) {
            console.log("👤 Existing user found:", existingUser.user.username);
            
            // Update user info if needed
            await dbService.updateUser(existingUser.uid, {
                username,
                city,
                lastAttemptAt: dbService.FieldValue.serverTimestamp()
            });
        }

        // Store pending user info
        console.log("💾 Storing pending user info");
        const pendingResult = await dbService.storePendingUser(cleanPhone, {
            username,
            phoneNumber: cleanPhone,
            city,
            isNewUser
        });

        if (!pendingResult.success) {
            console.error("❌ Failed to store pending user:", pendingResult.error);
            return res.render('register', { error: 'Registration failed. Please try again.' });
        }

        // Generate OTP
        const otp = smsService.generateOTP();
        console.log("🔢 Generated OTP:", otp);
        
        // Store OTP in database
        const otpResult = await dbService.storeOTP(cleanPhone, otp, 5);
        if (!otpResult.success) {
            console.error("❌ Failed to store OTP:", otpResult.error);
            return res.render('register', { error: 'Registration failed. Please try again.' });
        }

        // Send SMS
        console.log("📤 Sending SMS");
        const smsResult = await smsService.sendOTP(cleanPhone, username, otp);
        
        if (!smsResult.success) {
            console.error("❌ SMS failed:", smsResult.error);
            
            // Clean up stored data
            await dbService.deleteOTP(cleanPhone);
            await dbService.deletePendingUser(cleanPhone);
            
            // In development, allow progression despite SMS failure
            if (NODE_ENV === 'development') {
                console.log("🚧 Development mode: Proceeding despite SMS failure");
                
                // Store session data for OTP verification
                req.session.userData = {
                    username,
                    phoneNumber: cleanPhone,
                    city,
                    otp,
                    otpGenerated: Date.now(),
                    isNewUser
                };

                console.log('\n' + '='.repeat(50));
                console.log(`🔢 OTP FOR TESTING (DEV MODE)`);
                console.log(`📱 Phone: +91 ${cleanPhone}`);
                console.log(`🔐 OTP: ${otp}`);
                console.log(`⏰ Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
                console.log('='.repeat(50) + '\n');
                
                return res.redirect('/otp');
            } else {
                return res.render('register', { 
                    error: smsResult.resetTime ? 
                        `${smsResult.error} Try again in ${Math.ceil(smsResult.resetTime / 60)} minutes.` :
                        'Failed to send SMS. Please try again later.'
                });
            }
        }

        // Store session data for OTP verification
        req.session.userData = {
            username,
            phoneNumber: cleanPhone,
            city,
            otp: NODE_ENV === 'development' ? otp : null,
            otpGenerated: Date.now(),
            isNewUser,
            smsProvider: smsResult.provider,
            messageId: smsResult.messageId
        };

        // Log successful SMS
        await dbService.logEvent('sms_sent', {
            phoneNumber: cleanPhone,
            provider: smsResult.provider,
            messageId: smsResult.messageId,
            ip: req.ip
        });

        console.log('\n' + '='.repeat(50));
        console.log(`📱 SMS SENT SUCCESSFULLY`);
        console.log(`📞 Phone: +91 ${cleanPhone}`);
        console.log(`📡 Provider: ${smsResult.provider}`);
        console.log(`🆔 Message ID: ${smsResult.messageId || 'N/A'}`);
        if (NODE_ENV === 'development') {
            console.log(`🔐 OTP (DEV): ${otp}`);
        }
        console.log(`⏰ Sent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log('='.repeat(50) + '\n');
        
        res.redirect('/otp');

    } catch (error) {
        console.error("❌ Registration error:", error);
        await dbService.logEvent('registration_error', {
            phoneNumber: cleanPhone,
            error: error.message,
            ip: req.ip
        });
        
        return res.render('register', { error: 'Registration failed. Please try again.' });
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

// Enhanced OTP verification endpoint
app.post('/verify-otp', authLimiter, async (req, res) => {
    console.log('🔵 OTP verification request received');
    
    // Get OTP from form
    let otp = req.body.otp || '';
    if (!otp) {
        otp = (req.body.otp1 || '') + (req.body.otp2 || '') + (req.body.otp3 || '') + (req.body.otp4 || '');
    }
    
    console.log('📝 Received OTP:', otp);
    
    if (!req.session.userData) {
        console.log('❌ No session data found');
        return res.redirect('/register');
    }
    
    const { phoneNumber, isNewUser } = req.session.userData;
    const displayOTP = NODE_ENV !== 'production' ? req.session.userData.otp : null;
    
    try {
        // Log verification attempt
        await dbService.logEvent('otp_verification_attempt', {
            phoneNumber: phoneNumber,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Verify OTP using database service
        console.log("🔐 Verifying OTP from database");
        const otpVerification = await dbService.verifyOTP(phoneNumber, otp);
        
        if (!otpVerification.success) {
            console.log("❌ OTP verification failed:", otpVerification.error);
            
            await dbService.logEvent('otp_verification_failed', {
                phoneNumber: phoneNumber,
                error: otpVerification.error,
                ip: req.ip
            });
            
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: otpVerification.error,
                testOTP: displayOTP
            });
        }

        console.log("✅ OTP verified successfully");

        // Retrieve pending user info
        console.log("📋 Retrieving pending user info");
        const pendingResult = await dbService.getPendingUser(phoneNumber);
        
        if (!pendingResult.success) {
            console.error("❌ Pending user not found:", pendingResult.error);
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: 'Registration session expired. Please register again.',
                testOTP: displayOTP
            });
        }

        const pendingData = pendingResult.userData;

        // Ensure Firebase Auth user exists
        const uid = `phone_${phoneNumber}`;
        const firebasePhone = `+91${phoneNumber}`;
        
        console.log("🔐 Managing Firebase Auth user");
        try {
            await admin.auth().getUser(uid);
            console.log("✅ Firebase user already exists");
        } catch (err) {
            if (err.code === "auth/user-not-found") {
                console.log("👤 Creating new Firebase user");
                await admin.auth().createUser({
                    uid,
                    phoneNumber: firebasePhone
                });
                console.log("✅ Firebase user created");
            } else {
                throw err;
            }
        }

        // Create or update user in database
        let userResult;
        if (isNewUser) {
            console.log("👤 Creating new user profile");
            userResult = await dbService.createUser({
                username: pendingData.username,
                phoneNumber: phoneNumber,
                city: pendingData.city
            });
        } else {
            console.log("👤 Updating existing user profile");
            userResult = await dbService.updateUser(uid, {
                username: pendingData.username,
                city: pendingData.city
            });
        }

        if (!userResult.success) {
            console.error("❌ Failed to save user:", userResult.error);
            return res.render('otp', { 
                phoneNumber: phoneNumber,
                error: 'Registration failed. Please try again.',
                testOTP: displayOTP
            });
        }

        // Mark user as verified
        await dbService.markUserVerified(uid);

        // Clean up temporary data
        await dbService.deletePendingUser(phoneNumber);

        // Log successful verification
        await dbService.logEvent('user_verified', {
            uid: uid,
            phoneNumber: phoneNumber,
            username: pendingData.username,
            city: pendingData.city,
            isNewUser: isNewUser,
            ip: req.ip
        });

        // Update session
        req.session.userData.verified = true;
        req.session.userData.uid = uid;
        
        console.log('✅ User registration/login completed successfully');
        console.log(`👤 User: ${pendingData.username} (${isNewUser ? 'New' : 'Existing'})`);
        console.log(`📞 Phone: +91 ${phoneNumber}`);
        console.log(`📍 City: ${pendingData.city}`);
        
        res.redirect('/ar-experience');

    } catch (error) {
        console.error("❌ OTP verification error:", error);
        
        await dbService.logEvent('otp_verification_error', {
            phoneNumber: phoneNumber,
            error: error.message,
            ip: req.ip
        });
        
        return res.render('otp', { 
            phoneNumber: phoneNumber,
            error: 'Verification failed. Please try again.',
            testOTP: displayOTP
        });
    }
});

// Enhanced resend OTP endpoint
app.post('/resend-otp', authLimiter, async (req, res) => {
    if (!req.session.userData) {
        return res.json({ success: false, message: 'Session expired' });
    }
    
    const { phoneNumber, username } = req.session.userData;
    
    try {
        // Log resend attempt
        await dbService.logEvent('otp_resend_attempt', {
            phoneNumber: phoneNumber,
            ip: req.ip
        });

        // Generate new OTP
        const newOTP = smsService.generateOTP();
        
        // Store new OTP in database
        const otpResult = await dbService.storeOTP(phoneNumber, newOTP, 5);
        if (!otpResult.success) {
            return res.json({ success: false, message: 'Failed to generate new OTP' });
        }

        // Send SMS
        const smsResult = await smsService.sendOTP(phoneNumber, username, newOTP);
        
        if (!smsResult.success) {
            // Clean up OTP if SMS failed
            await dbService.deleteOTP(phoneNumber);
            
            if (NODE_ENV === 'development') {
                // In dev mode, allow resend despite SMS failure
                req.session.userData.otp = newOTP;
                req.session.userData.otpGenerated = Date.now();
                
                console.log('\n' + '='.repeat(50));
                console.log(`🔄 OTP RESENT (DEV MODE)`);
                console.log(`📱 Phone: +91 ${phoneNumber}`);
                console.log(`🔐 New OTP: ${newOTP}`);
                console.log(`⏰ Resent: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
                console.log('='.repeat(50) + '\n');
                
                return res.json({ 
                    success: true, 
                    message: 'OTP resent successfully',
                    testOTP: newOTP
                });
            }
            
            return res.json({ 
                success: false, 
                message: smsResult.error || 'Failed to send SMS'
            });
        }

        // Update session
        req.session.userData.otp = NODE_ENV === 'development' ? newOTP : null;
        req.session.userData.otpGenerated = Date.now();

        // Log successful resend
        await dbService.logEvent('otp_resent', {
            phoneNumber: phoneNumber,
            provider: smsResult.provider,
            messageId: smsResult.messageId,
            ip: req.ip
        });
        
        console.log('\n' + '='.repeat(50));
        console.log(`🔄 OTP RESENT SUCCESSFULLY`);
        console.log(`📞 Phone: +91 ${phoneNumber}`);
        console.log(`📡 Provider: ${smsResult.provider}`);
        console.log(`🆔 Message ID: ${smsResult.messageId || 'N/A'}`);
        if (NODE_ENV === 'development') {
            console.log(`🔐 New OTP (DEV): ${newOTP}`);
        }
        console.log(`⏰ Resent: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log('='.repeat(50) + '\n');
        
        res.json({ 
            success: true, 
            message: 'OTP resent successfully',
            testOTP: NODE_ENV !== 'production' ? newOTP : undefined
        });
        
    } catch (error) {
        console.error("❌ Error resending OTP:", error);
        
        await dbService.logEvent('otp_resend_error', {
            phoneNumber: phoneNumber,
            error: error.message,
            ip: req.ip
        });
        
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

// Development endpoints
if (NODE_ENV !== 'production') {
    app.get('/dev/otp', (req, res) => {
        if (!req.session.userData) {
            return res.json({ 
                error: 'No OTP session found',
                sessionId: req.sessionID
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

    app.get('/dev/stats', async (req, res) => {
        try {
            const dbStats = await dbService.getUserStats();
            const smsStats = smsService.getStats();
            
            res.json({
                database: dbStats.success ? dbStats.stats : { error: dbStats.error },
                sms: smsStats,
                server: {
                    uptime: process.uptime(),
                    environment: NODE_ENV,
                    nodeVersion: process.version
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

// API endpoints
app.get('/api/user-data', async (req, res) => {
    if (!req.session.userData || !req.session.userData.verified) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { phoneNumber } = req.session.userData;
    
    try {
        const userResult = await dbService.getUserByPhone(phoneNumber);
        
        if (!userResult.success) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userResult.user;
        res.json({
            username: userData.username,
            city: userData.city,
            phoneNumber: userData.phoneNumber,
            verified: userData.isVerified,
            createdAt: userData.createdAt,
            lastLoginAt: userData.lastLoginAt
        });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/health-check', async (req, res) => {
    try {
        const dbStats = await dbService.getUserStats();
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: dbStats.success ? 'connected' : 'error',
            environment: NODE_ENV
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            timestamp: new Date().toISOString(),
            error: error.message 
        });
    }
});

// Cleanup tasks
const runCleanupTasks = async () => {
    try {
        console.log('🧹 Running cleanup tasks...');
        
        // Cleanup expired OTPs
        const otpCleanup = await dbService.cleanupExpiredOTPs();
        if (otpCleanup.success && otpCleanup.cleaned > 0) {
            console.log(`✅ Cleaned ${otpCleanup.cleaned} expired OTPs`);
        }
        
        // Cleanup expired pending users
        const userCleanup = await dbService.cleanupExpiredPendingUsers();
        if (userCleanup.success && userCleanup.cleaned > 0) {
            console.log(`✅ Cleaned ${userCleanup.cleaned} expired pending users`);
        }
        
        // Cleanup SMS rate limits
        const smsCleanup = smsService.cleanupRateLimits();
        if (smsCleanup > 0) {
            console.log(`✅ Cleaned ${smsCleanup} SMS rate limit entries`);
        }
        
        console.log('✅ Cleanup tasks completed');
    } catch (error) {
        console.error('❌ Cleanup task error:', error);
    }
};

// Run cleanup every hour
setInterval(runCleanupTasks, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Application error:', err.stack);
    
    // Log error to database
    dbService.logEvent('application_error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
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

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down gracefully...');
    
    // Run final cleanup
    await runCleanupTasks();
    
    console.log('✅ Cleanup completed. Server shutting down.');
    process.exit(0);
});

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AR Web Application Server Started');
    console.log('='.repeat(60));
    console.log(`🌐 Server running on: http://localhost:${PORT}`);
    console.log(`🏃 Environment: ${NODE_ENV}`);
    console.log(`🔐 Session Secret: ${SESSION_SECRET ? 'Configured' : 'Default (Change in production!)'}`);
    console.log(`🗄️  Database: Firebase Firestore`);
    console.log(`📱 SMS Service: Configured with rate limiting`);
    
    if (NODE_ENV !== 'production') {
        console.log(`⚠️  Development Mode Features:`);
        console.log(`   - OTP displayed on verification page`);
        console.log(`   - Debug endpoints available: /dev/otp, /dev/stats`);
        console.log(`   - SMS failures allow progression`);
    }
    
    console.log('\n📋 Application Flow:');
    console.log('   1. Welcome → /');
    console.log('   2. Register → /register');
    console.log('   3. OTP Verification → /otp');
    console.log('   4. AR Experience → /ar-experience');
    
    console.log('\n🔧 Features:');
    console.log('   ✅ Firebase Authentication & Firestore');
    console.log('   ✅ SMS OTP with fallback providers');
    console.log('   ✅ Rate limiting & validation');
    console.log('   ✅ Automatic cleanup tasks');
    console.log('   ✅ Comprehensive logging');
    console.log('   ✅ Error handling & recovery');
    console.log('='.repeat(60) + '\n');
    
    // Run initial cleanup
    setTimeout(runCleanupTasks, 5000);
});

module.exports = app;