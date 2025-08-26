// sms.js - Enhanced SMS Service with multiple providers and error handling
const axios = require('axios');
const { URLSearchParams } = require('url');

class SMSService {
    constructor(config) {
        this.config = {
            username: config.username || process.env.SMS_USERNAME || "Lekh09",
            apikey: config.apikey || process.env.SMS_APIKEY || "409DC-16CCF",
            sender: config.sender || process.env.SMS_SENDER || "MORORE",
            route: config.route || process.env.SMS_ROUTE || "OTP",
            templateId: config.templateId || process.env.SMS_TEMPLATEID || "1707174419181876651",
            baseUrl: config.baseUrl || process.env.SMS_BASE_URL || "http://123.108.46.13/sms-panel/api/http/index.php",
            timeout: config.timeout || 15000,
            retries: config.retries || 3
        };

        // Rate limiting
        this.rateLimiter = new Map(); // phoneNumber -> { count, lastReset }
        this.maxSMSPerHour = 5;
        this.maxSMSPerDay = 20;
    }

    // Generate OTP
    generateOTP(length = 4) {
        const digits = '0123456789';
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += digits[Math.floor(Math.random() * digits.length)];
        }
        return otp;
    }

    // Rate limiting check
    checkRateLimit(phoneNumber) {
        const now = Date.now();
        const hourly = now - (60 * 60 * 1000); // 1 hour ago
        const daily = now - (24 * 60 * 60 * 1000); // 24 hours ago

        if (!this.rateLimiter.has(phoneNumber)) {
            this.rateLimiter.set(phoneNumber, {
                hourlyCount: 0,
                dailyCount: 0,
                hourlyReset: now,
                dailyReset: now,
                attempts: []
            });
        }

        const limits = this.rateLimiter.get(phoneNumber);
        
        // Clean old attempts
        limits.attempts = limits.attempts.filter(attempt => attempt > hourly);
        
        // Check hourly limit
        const hourlyAttempts = limits.attempts.filter(attempt => attempt > hourly).length;
        if (hourlyAttempts >= this.maxSMSPerHour) {
            return {
                allowed: false,
                error: `Too many SMS requests. Maximum ${this.maxSMSPerHour} per hour allowed.`,
                resetTime: Math.ceil((hourly + (60 * 60 * 1000) - now) / 1000)
            };
        }

        // Check daily limit
        const dailyAttempts = limits.attempts.filter(attempt => attempt > daily).length;
        if (dailyAttempts >= this.maxSMSPerDay) {
            return {
                allowed: false,
                error: `Daily SMS limit exceeded. Maximum ${this.maxSMSPerDay} per day allowed.`,
                resetTime: Math.ceil((daily + (24 * 60 * 60 * 1000) - now) / 1000)
            };
        }

        // Add current attempt
        limits.attempts.push(now);
        this.rateLimiter.set(phoneNumber, limits);

        return { allowed: true };
    }

    // Validate phone number format
    validatePhoneNumber(phoneNumber) {
        // Remove any non-digits
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        
        // Check if it's a valid Indian mobile number (10 digits starting with 6-9)
        if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
            return {
                valid: false,
                error: 'Invalid phone number format. Must be a 10-digit Indian mobile number.'
            };
        }

        return { valid: true, phoneNumber: cleanPhone };
    }

    // Build SMS message
    buildMessage(username, otp, expiryMinutes = 5) {
        return `Hi ${username}, ${otp} is your AR Experience verification code, valid for ${expiryMinutes} minutes. Do not share with anyone. MORORE`;
    }

    // Send SMS via primary provider
    async sendViaPrimaryProvider(phoneNumber, message, retryCount = 0) {


        try {

             let formattedPhone = phoneNumber.replace(/\D/g, '');
            if (!formattedPhone.startsWith('91')) {
                formattedPhone = '91' + formattedPhone;
            }
            const params = new URLSearchParams({
                username: this.config.username,
                apikey: this.config.apikey,
                apirequest: "Text",
                sender: this.config.sender,
                mobile: formattedPhone,
                message: message,
                route: this.config.route,
                TemplateID: this.config.templateId,
                format: "JSON"
            });

            const url = `${this.config.baseUrl}?${params.toString()}`;
            
            console.log(`📤 Sending SMS to ${phoneNumber} (attempt ${retryCount + 1})`);
            
            const response = await axios.get(url, { 
                timeout: this.config.timeout,
                headers: {
                    'User-Agent': 'AR-Web-App/1.0'
                }
            });

            console.log(`📥 SMS API Response:`, response.data);

            // Check response format and status
            if (response.data) {
                const status = String(response.data.status || response.data.Status || "").toLowerCase();
                const responseCode = response.data.responsecode || response.data.ResponseCode;
                
                if (status === "success" || status === "sent" || responseCode === "200") {
                    return {
                        success: true,
                        provider: 'primary',
                        response: response.data,
                        messageId: response.data.messageid || response.data.MessageId || null
                    };
                } else {
                    throw new Error(`SMS failed: ${response.data.message || response.data.Message || 'Unknown error'}`);
                }
            } else {
                throw new Error('Invalid response from SMS provider');
            }

        } catch (error) {
            console.error(`❌ SMS API Error (attempt ${retryCount + 1}):`, error.message);
            
            if (retryCount < this.config.retries - 1) {
                console.log(`🔄 Retrying SMS in 2 seconds...`);
                await this.delay(2000);
                return this.sendViaPrimaryProvider(phoneNumber, message, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Fallback SMS provider (mock implementation - replace with real provider)
    async sendViaFallbackProvider(phoneNumber, message) {
        try {
            console.log(`📤 Sending SMS via fallback provider to ${phoneNumber}`);
            
            // Mock fallback provider - replace with actual implementation
            // Examples: Twilio, AWS SNS, TextLocal, etc.
            
            // For development, we'll simulate success
            if (process.env.NODE_ENV === 'development') {
                console.log(`📱 Fallback SMS (DEV): ${message}`);
                return {
                    success: true,
                    provider: 'fallback-dev',
                    response: { status: 'success', message: 'Development mode' },
                    messageId: `dev_${Date.now()}`
                };
            }

            // TODO: Implement real fallback provider here
            throw new Error('Fallback SMS provider not configured');

        } catch (error) {
            console.error(`❌ Fallback SMS Error:`, error.message);
            throw error;
        }
    }

    // Main send SMS method with fallback
    async sendOTP(phoneNumber, username, otp) {
        try {
            // Validate phone number
            const phoneValidation = this.validatePhoneNumber(phoneNumber);
            if (!phoneValidation.valid) {
                return {
                    success: false,
                    error: phoneValidation.error
                };
            }

            const validPhone = phoneValidation.phoneNumber;

            // Check rate limits
            const rateLimitCheck = this.checkRateLimit(validPhone);
            if (!rateLimitCheck.allowed) {
                return {
                    success: false,
                    error: rateLimitCheck.error,
                    resetTime: rateLimitCheck.resetTime
                };
            }

            // Build message
            const message = this.buildMessage(username, otp);
            
            console.log('\n' + '='.repeat(60));
            console.log('📱 SMS SENDING PROCESS');
            console.log(`📞 Phone: +91 ${validPhone}`);
            console.log(`👤 User: ${username}`);
            console.log(`🔐 OTP: ${otp}`);
            console.log(`💬 Message: ${message}`);
            console.log('='.repeat(60));

            let result;
            
            // Try primary provider first
            try {
                result = await this.sendViaPrimaryProvider(validPhone, message);
                console.log(`✅ SMS sent successfully via primary provider`);
            } catch (primaryError) {
                console.log(`⚠️  Primary provider failed, trying fallback...`);
                
                // Try fallback provider
                try {
                    result = await this.sendViaFallbackProvider(validPhone, message);
                    console.log(`✅ SMS sent successfully via fallback provider`);
                } catch (fallbackError) {
                    console.error(`❌ All SMS providers failed`);
                    
                    // In development, allow progression despite SMS failure
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`🚧 Development mode: Allowing progression despite SMS failure`);
                        return {
                            success: true,
                            provider: 'development-mock',
                            warning: 'SMS failed but allowed in development mode',
                            error: {
                                primary: primaryError.message,
                                fallback: fallbackError.message
                            }
                        };
                    }

                    return {
                        success: false,
                        error: 'SMS delivery failed. Please try again later.',
                        details: {
                            primary: primaryError.message,
                            fallback: fallbackError.message
                        }
                    };
                }
            }

            console.log(`✅ SMS delivery completed successfully`);
            console.log('='.repeat(60) + '\n');

            return {
                success: true,
                provider: result.provider,
                messageId: result.messageId,
                phoneNumber: validPhone
            };

        } catch (error) {
            console.error(`❌ SMS Service Error:`, error);
            return {
                success: false,
                error: 'Internal SMS service error'
            };
        }
    }

    // Utility method to add delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get SMS statistics
    getStats() {
        const stats = {
            totalNumbers: this.rateLimiter.size,
            rateLimitedNumbers: 0,
            totalAttempts: 0
        };

        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);

        for (const [phone, data] of this.rateLimiter.entries()) {
            const recentAttempts = data.attempts.filter(attempt => attempt > hourAgo).length;
            stats.totalAttempts += data.attempts.length;
            
            if (recentAttempts >= this.maxSMSPerHour) {
                stats.rateLimitedNumbers++;
            }
        }

        return stats;
    }

    // Clean up old rate limit data
    cleanupRateLimits() {
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        let cleaned = 0;

        for (const [phone, data] of this.rateLimiter.entries()) {
            // Remove old attempts
            data.attempts = data.attempts.filter(attempt => attempt > dayAgo);
            
            // If no recent attempts, remove the entry
            if (data.attempts.length === 0) {
                this.rateLimiter.delete(phone);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up rate limit data for ${cleaned} phone numbers`);
        }

        return cleaned;
    }
}

module.exports = SMSService;