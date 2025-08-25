// db.js - Enhanced Database Service with Firebase Firestore
const admin = require('firebase-admin');

class DatabaseService {
    constructor() {
        this.db = admin.firestore();
        this.FieldValue = admin.firestore.FieldValue;
        
        // Collections
        this.USERS_COLLECTION = 'users';
        this.OTP_COLLECTION = 'otps';
        this.PENDING_USERS_COLLECTION = 'pendingUsers';
        this.SESSIONS_COLLECTION = 'sessions';
        this.LOGS_COLLECTION = 'logs';
    }

    // User Management
    async createUser(userData) {
        try {
            const uid = `phone_${userData.phoneNumber}`;
            const userDoc = {
                uid: uid,
                username: userData.username,
                phoneNumber: userData.phoneNumber,
                city: userData.city,
                isVerified: false,
                createdAt: this.FieldValue.serverTimestamp(),
                updatedAt: this.FieldValue.serverTimestamp(),
                lastLoginAt: null,
                profileComplete: true,
                status: 'active'
            };

            await this.db.collection(this.USERS_COLLECTION).doc(uid).set(userDoc);
            console.log(`✅ User created with UID: ${uid}`);
            return { success: true, uid, user: userDoc };
        } catch (error) {
            console.error('❌ Error creating user:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserByPhone(phoneNumber) {
        try {
            const uid = `phone_${phoneNumber}`;
            const userDoc = await this.db.collection(this.USERS_COLLECTION).doc(uid).get();
            
            if (!userDoc.exists) {
                return { success: false, error: 'User not found' };
            }

            return { success: true, user: userDoc.data(), uid };
        } catch (error) {
            console.error('❌ Error fetching user:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUser(uid, updateData) {
        try {
            const updateDoc = {
                ...updateData,
                updatedAt: this.FieldValue.serverTimestamp()
            };

            await this.db.collection(this.USERS_COLLECTION).doc(uid).update(updateDoc);
            console.log(`✅ User updated: ${uid}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error updating user:', error);
            return { success: false, error: error.message };
        }
    }

    async markUserVerified(uid) {
        try {
            await this.db.collection(this.USERS_COLLECTION).doc(uid).update({
                isVerified: true,
                lastLoginAt: this.FieldValue.serverTimestamp(),
                updatedAt: this.FieldValue.serverTimestamp()
            });
            console.log(`✅ User verified: ${uid}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error verifying user:', error);
            return { success: false, error: error.message };
        }
    }

    // OTP Management
    async storeOTP(phoneNumber, otp, expiryMinutes = 5) {
        try {
            const expiresAt = admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + expiryMinutes * 60 * 1000)
            );

            const otpDoc = {
                phoneNumber: phoneNumber,
                otp: otp,
                expiresAt: expiresAt,
                attempts: 0,
                maxAttempts: 3,
                createdAt: this.FieldValue.serverTimestamp(),
                isUsed: false
            };

            await this.db.collection(this.OTP_COLLECTION).doc(phoneNumber).set(otpDoc);
            console.log(`✅ OTP stored for ${phoneNumber}: ${otp}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error storing OTP:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyOTP(phoneNumber, inputOtp) {
        try {
            const otpDoc = await this.db.collection(this.OTP_COLLECTION).doc(phoneNumber).get();
            
            if (!otpDoc.exists) {
                return { success: false, error: 'OTP not found' };
            }

            const otpData = otpDoc.data();
            const currentTime = Date.now();
            const expiryTime = otpData.expiresAt.toMillis();

            // Check if already used
            if (otpData.isUsed) {
                return { success: false, error: 'OTP already used' };
            }

            // Check if expired
            if (currentTime > expiryTime) {
                await this.deleteOTP(phoneNumber);
                return { success: false, error: 'OTP expired' };
            }

            // Check attempts
            if (otpData.attempts >= otpData.maxAttempts) {
                await this.deleteOTP(phoneNumber);
                return { success: false, error: 'Maximum attempts exceeded' };
            }

            // Verify OTP
            if (otpData.otp !== inputOtp) {
                // Increment attempts
                await this.db.collection(this.OTP_COLLECTION).doc(phoneNumber).update({
                    attempts: this.FieldValue.increment(1)
                });
                
                const remainingAttempts = otpData.maxAttempts - (otpData.attempts + 1);
                return { 
                    success: false, 
                    error: `Invalid OTP. ${remainingAttempts} attempts remaining` 
                };
            }

            // Mark as used and delete
            await this.db.collection(this.OTP_COLLECTION).doc(phoneNumber).update({
                isUsed: true,
                usedAt: this.FieldValue.serverTimestamp()
            });

            // Clean up after successful verification
            setTimeout(() => this.deleteOTP(phoneNumber), 1000);

            console.log(`✅ OTP verified successfully for ${phoneNumber}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error verifying OTP:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteOTP(phoneNumber) {
        try {
            await this.db.collection(this.OTP_COLLECTION).doc(phoneNumber).delete();
            console.log(`✅ OTP deleted for ${phoneNumber}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting OTP:', error);
            return { success: false, error: error.message };
        }
    }

    // Pending Users Management
    async storePendingUser(phoneNumber, userData) {
        try {
            const pendingDoc = {
                ...userData,
                phoneNumber: phoneNumber,
                createdAt: this.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromDate(
                    new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
                )
            };

            await this.db.collection(this.PENDING_USERS_COLLECTION).doc(phoneNumber).set(pendingDoc);
            console.log(`✅ Pending user stored for ${phoneNumber}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error storing pending user:', error);
            return { success: false, error: error.message };
        }
    }

    async getPendingUser(phoneNumber) {
        try {
            const pendingDoc = await this.db.collection(this.PENDING_USERS_COLLECTION).doc(phoneNumber).get();
            
            if (!pendingDoc.exists) {
                return { success: false, error: 'Pending user not found' };
            }

            const data = pendingDoc.data();
            
            // Check if expired
            if (Date.now() > data.expiresAt.toMillis()) {
                await this.deletePendingUser(phoneNumber);
                return { success: false, error: 'Registration session expired' };
            }

            return { success: true, userData: data };
        } catch (error) {
            console.error('❌ Error fetching pending user:', error);
            return { success: false, error: error.message };
        }
    }

    async deletePendingUser(phoneNumber) {
        try {
            await this.db.collection(this.PENDING_USERS_COLLECTION).doc(phoneNumber).delete();
            console.log(`✅ Pending user deleted for ${phoneNumber}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting pending user:', error);
            return { success: false, error: error.message };
        }
    }

    // Analytics and Logging
    async logEvent(eventType, data) {
        try {
            const logDoc = {
                eventType: eventType,
                data: data,
                timestamp: this.FieldValue.serverTimestamp(),
                userAgent: data.userAgent || null,
                ip: data.ip || null
            };

            await this.db.collection(this.LOGS_COLLECTION).add(logDoc);
            return { success: true };
        } catch (error) {
            console.error('❌ Error logging event:', error);
            return { success: false, error: error.message };
        }
    }

    // Cleanup utilities
    async cleanupExpiredOTPs() {
        try {
            const now = admin.firestore.Timestamp.now();
            const expiredOTPs = await this.db.collection(this.OTP_COLLECTION)
                .where('expiresAt', '<', now)
                .get();

            const batch = this.db.batch();
            let count = 0;

            expiredOTPs.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                console.log(`✅ Cleaned up ${count} expired OTPs`);
            }

            return { success: true, cleaned: count };
        } catch (error) {
            console.error('❌ Error cleaning expired OTPs:', error);
            return { success: false, error: error.message };
        }
    }

    async cleanupExpiredPendingUsers() {
        try {
            const now = admin.firestore.Timestamp.now();
            const expiredUsers = await this.db.collection(this.PENDING_USERS_COLLECTION)
                .where('expiresAt', '<', now)
                .get();

            const batch = this.db.batch();
            let count = 0;

            expiredUsers.forEach(doc => {
                batch.delete(doc.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                console.log(`✅ Cleaned up ${count} expired pending users`);
            }

            return { success: true, cleaned: count };
        } catch (error) {
            console.error('❌ Error cleaning expired pending users:', error);
            return { success: false, error: error.message };
        }
    }

    // Statistics
    async getUserStats() {
        try {
            const totalUsers = await this.db.collection(this.USERS_COLLECTION).count().get();
            const verifiedUsers = await this.db.collection(this.USERS_COLLECTION)
                .where('isVerified', '==', true)
                .count().get();
            const pendingOTPs = await this.db.collection(this.OTP_COLLECTION).count().get();
            const pendingUsers = await this.db.collection(this.PENDING_USERS_COLLECTION).count().get();

            return {
                success: true,
                stats: {
                    totalUsers: totalUsers.data().count,
                    verifiedUsers: verifiedUsers.data().count,
                    pendingOTPs: pendingOTPs.data().count,
                    pendingUsers: pendingUsers.data().count
                }
            };
        } catch (error) {
            console.error('❌ Error fetching stats:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = DatabaseService;