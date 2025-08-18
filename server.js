// Enhanced server.js with additional features
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();

// Production settings
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

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
        secure: NODE_ENV === 'production', // Use secure cookies in production
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    },
    name: 'sessionId'
}));

// Trust proxy in production (for Render)
if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Utility functions
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
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

app.post('/register', (req, res) => {
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
    
    // Generate and store OTP
    const otp = generateOTP();
    req.session.userData = {
        username,
        phoneNumber,
        city,
        otp,
        otpGenerated: Date.now()
    };
    
    console.log('Session data saved:', {
        username,
        phoneNumber,
        city,
        otp,
        otpGenerated: new Date(Date.now()).toLocaleString('en-IN')
    });
    
    // In production, send SMS here
    console.log('\n' + '='.repeat(50));
    console.log(`🔐 OTP GENERATED FOR TESTING`);
    console.log(`📱 Phone Number: +91 ${phoneNumber}`);
    console.log(`🔢 OTP Code: ${otp}`);
    console.log(`⏰ Generated at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    console.log('='.repeat(50) + '\n');
    
    res.redirect(`/otp`);
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
        testOTP: displayOTP // Pass OTP for testing display
    });
});

app.post('/verify-otp', (req, res) => {
    console.log('OTP verification request received:', req.body);
    
    // Get OTP from either the hidden field or individual inputs
    let otp = req.body.otp;
    if (!otp) {
        // Fallback: combine individual OTP inputs
        otp = (req.body.otp1 || '') + (req.body.otp2 || '') + (req.body.otp3 || '') + (req.body.otp4 || '');
    }
    
    console.log('Received OTP:', otp);
    
    if (!req.session.userData) {
        console.log('No session data found, redirecting to register');
        return res.redirect('/register');
    }
    
    const { otp: sessionOTP, otpGenerated, phoneNumber } = req.session.userData;
    console.log('Session OTP:', sessionOTP, 'Generated at:', new Date(otpGenerated));
    
    // Check if OTP is expired (5 minutes)
    if (Date.now() - otpGenerated > 5 * 60 * 1000) {
        console.log('OTP expired');
        
        // Pass OTP for testing even on error
        const displayOTP = NODE_ENV !== 'production' ? sessionOTP : null;
        
        return res.render('otp', { 
            phoneNumber: phoneNumber,
            error: 'OTP has expired. Please request a new one.',
            testOTP: displayOTP
        });
    }
    
    if (otp !== sessionOTP) {
        console.log('OTP mismatch. Received:', otp, 'Expected:', sessionOTP);
        
        // Pass OTP for testing even on error
        const displayOTP = NODE_ENV !== 'production' ? sessionOTP : null;
        
        return res.render('otp', { 
            phoneNumber: phoneNumber,
            error: 'Invalid OTP. Please try again.',
            testOTP: displayOTP
        });
    }
    
    // Mark as verified and redirect directly to AR experience
    req.session.userData.verified = true;
    console.log('OTP verified successfully, redirecting directly to AR experience');
    
    // Skip permissions page and go directly to AR experience
    res.redirect('/ar-experience');
});

app.post('/resend-otp', (req, res) => {
    if (!req.session.userData) {
        return res.json({ success: false, message: 'Session expired' });
    }
    
    const newOTP = generateOTP();
    req.session.userData.otp = newOTP;
    req.session.userData.otpGenerated = Date.now();
    
    // In production, send SMS here
    console.log('\n' + '='.repeat(50));
    console.log(`🔄 OTP RESENT FOR TESTING`);
    console.log(`📱 Phone Number: +91 ${req.session.userData.phoneNumber}`);
    console.log(`🔢 New OTP Code: ${newOTP}`);
    console.log(`⏰ Resent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    console.log('='.repeat(50) + '\n');
    
    // Return the new OTP in development mode
    res.json({ 
        success: true, 
        message: 'OTP sent successfully',
        testOTP: NODE_ENV !== 'production' ? newOTP : undefined
    });
});

// REMOVED: /permissions route - no longer needed

// REMOVED: /grant-permissions route - no longer needed

app.get('/ar-experience', (req, res) => {
    // Simplified check - only verify OTP verification, not permissions
    if (!req.session.userData || !req.session.userData.verified) {
        return res.redirect('/register');
    }
    
    res.render('ar-experience', { 
        userData: req.session.userData 
    });
});

// Development-only endpoint to get current OTP (remove in production)
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

// API endpoints for future use
app.get('/api/user-data', (req, res) => {
    if (!req.session.userData) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    res.json({
        username: req.session.userData.username,
        city: req.session.userData.city,
        verified: req.session.userData.verified || false
    });
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
        console.log('⚠️  Development mode: OTP will be displayed on the page');
    }
    console.log('📱 Flow: Welcome → Register → OTP → AR Experience');
});

module.exports = app;