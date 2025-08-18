// Enhanced public/js/main.js with timer and improved functionality

document.addEventListener('DOMContentLoaded', function() {
    
    // Handle "No" button clicks
    window.handleNo = function() {
        showModal('Age Restriction', 'You must be 18 years or above to use this application.', [
            { text: 'OK', action: () => {} }
        ]);
    };

    // Initialize based on current page
    const currentPage = window.location.pathname;
    
    switch(currentPage) {
        case '/':
            initWelcomePage();
            break;
        case '/register':
            initRegisterPage();
            break;
        case '/otp':
            initOTPPage();
            break;
        // REMOVED: permissions page initialization
        case '/ar-experience':
            // 8th Wall will handle permissions automatically
            break;
    }

    // Add floating leaves animation
    createFloatingLeaves();
});

function initWelcomePage() {
    // Add entrance animation
    const card = document.querySelector('.card');
    if (card) {
        card.style.transform = 'scale(0.8) translateY(50px)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            card.style.transition = 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            card.style.transform = 'scale(1) translateY(0)';
            card.style.opacity = '1';
        }, 100);
    }
}

function initRegisterPage() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
        
        // Add real-time validation
        const inputs = registerForm.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('blur', validateField);
            input.addEventListener('input', clearFieldError);
        });
    }

    // Add phone number formatting
    const phoneInput = document.querySelector('input[name="phoneNumber"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', formatPhoneNumber);
    }
}

function initOTPPage() {
    const otpInputs = document.querySelectorAll('.otp-input');
    if (otpInputs.length > 0) {
        handleOTPInputs(otpInputs);
        startOTPTimer();
    }

    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', handleOTPSubmit);
    }

    // Handle resend OTP
    const resendBtn = document.getElementById('resendOTP');
    if (resendBtn) {
        resendBtn.addEventListener('click', handleResendOTP);
    }
}

// REMOVED: initPermissionsPage and detectPermissionStatus functions

function startOTPTimer() {
    let timeLeft = 5 * 60; // 5 minutes in seconds
    const timerElement = document.getElementById('timer');
    const resendBtn = document.getElementById('resendOTP');
    
    if (!timerElement) return;
    
    const countdown = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            timerElement.textContent = 'Expired';
            timerElement.style.color = '#ff6b6b';
            
            if (resendBtn) {
                resendBtn.style.display = 'block';
                resendBtn.textContent = 'Get New OTP';
            }
            
            // Disable OTP inputs
            document.querySelectorAll('.otp-input').forEach(input => {
                input.disabled = true;
                input.style.opacity = '0.5';
            });
        }
        
        timeLeft--;
    }, 1000);
}

function handleOTPInputs(inputs) {
    inputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }

            // Add visual feedback
            e.target.classList.add('filled');

            // Move to next input
            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }

            // Update hidden OTP value
            updateOTPValue(inputs);
            
            // Auto-submit if all fields filled - REMOVED
            // Manual submit only now
        });

        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace') {
                if (!e.target.value && index > 0) {
                    inputs[index - 1].focus();
                    inputs[index - 1].value = '';
                }
                e.target.classList.remove('filled');
            }
        });

        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const paste = e.clipboardData.getData('text');
            const digits = paste.match(/\d/g);
            
            if (digits) {
                digits.slice(0, inputs.length).forEach((digit, i) => {
                    if (inputs[i]) {
                        inputs[i].value = digit;
                        inputs[i].classList.add('filled');
                    }
                });
                updateOTPValue(inputs);
                
                // Focus last filled input
                const lastIndex = Math.min(digits.length - 1, inputs.length - 1);
                inputs[lastIndex].focus();
            }
        });
    });
}

function updateOTPValue(inputs) {
    const otpValue = Array.from(inputs).map(input => input.value).join('');
    const hiddenInput = document.getElementById('otpValue');
    if (hiddenInput) {
        hiddenInput.value = otpValue;
    }
}

function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    const name = field.name;
    
    clearFieldError(field);
    
    let isValid = true;
    let errorMessage = '';
    
    switch(name) {
        case 'username':
            if (value.length < 3) {
                isValid = false;
                errorMessage = 'Username must be at least 3 characters';
            } else if (value.length > 20) {
                isValid = false;
                errorMessage = 'Username must be less than 20 characters';
            } else if (!/^[a-zA-Z0-9_]+$/.test(value)) {
                isValid = false;
                errorMessage = 'Username can only contain letters, numbers, and underscores';
            }
            break;
            
        case 'phoneNumber':
            const cleanPhone = value.replace(/\D/g, '');
            if (cleanPhone.length !== 10) {
                isValid = false;
                errorMessage = 'Phone number must be exactly 10 digits';
            } else if (!cleanPhone.startsWith('6') && !cleanPhone.startsWith('7') && !cleanPhone.startsWith('8') && !cleanPhone.startsWith('9')) {
                isValid = false;
                errorMessage = 'Please enter a valid Indian mobile number';
            }
            break;
            
        case 'city':
            if (value.length < 2) {
                isValid = false;
                errorMessage = 'City name must be at least 2 characters';
            }
            break;
    }
    
    if (!isValid) {
        showFieldError(field, errorMessage);
    }
    
    return isValid;
}

function clearFieldError(field) {
    if (typeof field === 'object' && field.target) {
        field = field.target;
    }
    
    field.classList.remove('error');
    const errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

function showFieldError(field, message) {
    field.classList.add('error');
    
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = message;
    
    field.parentNode.appendChild(errorElement);
}

function handleRegistration(e) {
    e.preventDefault();
    
    const form = e.target;
    const inputs = form.querySelectorAll('input');
    let allValid = true;
    
    // Validate all fields
    inputs.forEach(input => {
        if (!validateField({ target: input })) {
            allValid = false;
        }
    });
    
    if (!allValid) {
        showModal('Validation Error', 'Please fix the errors in the form before submitting.', [
            { text: 'OK', action: () => {} }
        ]);
        return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading"></span> Submitting...';
    submitBtn.disabled = true;
    
    // Submit form
    setTimeout(() => {
        form.submit();
    }, 1000);
}

function handleOTPSubmit(e) {
    e.preventDefault(); // Prevent default form submission
    
    console.log('Form submit event triggered - using manual submit');
    
    const otpInputs = document.querySelectorAll('.otp-input');
    const otp = Array.from(otpInputs).map(input => input.value).join('');
    
    console.log('Collected OTP:', otp);

    if (otp.length !== 4) {
        // Shake animation for error
        otpInputs.forEach(input => {
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 600);
        });
        
        showModal('Invalid OTP', 'Please enter the complete 4-digit OTP', [
            { text: 'OK', action: () => otpInputs[0].focus() }
        ]);
        return;
    }

    // Update the hidden input with the complete OTP
    const hiddenOtpInput = document.getElementById('otpValue');
    if (hiddenOtpInput) {
        hiddenOtpInput.value = otp;
        console.log('Hidden input updated with OTP:', hiddenOtpInput.value);
    } else {
        console.error('Hidden OTP input not found!');
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<span class="loading"></span> Verifying...';
        submitBtn.disabled = true;
    }

    // Submit form manually
    console.log('Manual form submission with OTP:', otp);
    setTimeout(() => {
        e.target.submit(); // Submit the form
    }, 500);
}

async function handleResendOTP() {
    const resendBtn = document.getElementById('resendOTP');
    resendBtn.innerHTML = '<span class="loading"></span> Sending...';
    resendBtn.disabled = true;
    
    try {
        const response = await fetch('/resend-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Reset timer and inputs
            document.querySelectorAll('.otp-input').forEach(input => {
                input.value = '';
                input.disabled = false;
                input.style.opacity = '1';
                input.classList.remove('filled');
            });
            
            document.getElementById('timer').style.color = 'white';
            startOTPTimer();
            
            showModal('OTP Sent', 'A new OTP has been sent to your phone number.', [
                { text: 'OK', action: () => document.querySelector('.otp-input').focus() }
            ]);
        } else {
            throw new Error(data.message || 'Failed to send OTP');
        }
    } catch (error) {
        showModal('Error', 'Failed to send OTP. Please try again.', [
            { text: 'OK', action: () => {} }
        ]);
    }
    
    resendBtn.textContent = 'Resend OTP';
    resendBtn.disabled = false;
}

// REMOVED: grantPermissions function - 8th Wall handles this automatically

// Create floating leaves animation with PNG
function createFloatingLeaves() {
    const leafContainer = document.querySelector('.leaf-background');
    if (!leafContainer) return;

    // Create more leaves with better distribution
    for (let i = 0; i < 20; i++) {
        const leaf = document.createElement('div');
        leaf.className = 'floating-leaf';
        
        const size = 30 + Math.random() * 40; // Varied sizes from 30-70px
        const animationDuration = 6 + Math.random() * 8; // 6-14 seconds
        const delay = Math.random() * 12; // Up to 12 second delay
        const startX = Math.random() * 100; // Full width spread
        const startY = Math.random() * 100; // Full height spread
        const rotation = Math.random() * 360; // Random initial rotation
        
        leaf.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background-image: url('/images/leaf.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            top: ${startY}%;
            left: ${startX}%;
            animation: floatLeaf ${animationDuration}s ease-in-out infinite;
            animation-delay: ${delay}s;
            opacity: ${0.4 + Math.random() * 0.5}; // 0.4 to 0.9 opacity
            transform-origin: center;
            transform: rotate(${rotation}deg);
            z-index: ${Math.floor(Math.random() * 8)}; // More depth layers
            pointer-events: none;
        `;
        
        leafContainer.appendChild(leaf);
    }
    
    // Add CSS animation for leaves with more varied movement
    if (!document.getElementById('leafAnimation')) {
        const style = document.createElement('style');
        style.id = 'leafAnimation';
        style.textContent = `
            @keyframes floatLeaf {
                0% { 
                    transform: translateY(0px) translateX(0px) rotate(0deg); 
                }
                20% { 
                    transform: translateY(-15px) translateX(8px) rotate(72deg); 
                }
                40% { 
                    transform: translateY(-25px) translateX(-12px) rotate(144deg); 
                }
                60% { 
                    transform: translateY(-20px) translateX(15px) rotate(216deg); 
                }
                80% { 
                    transform: translateY(-10px) translateX(-8px) rotate(288deg); 
                }
                100% { 
                    transform: translateY(0px) translateX(0px) rotate(360deg); 
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Modal system
function showModal(title, message, buttons = []) {
    // Remove existing modal
    const existingModal = document.querySelector('.custom-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    
    const buttonsHtml = buttons.length > 0 
        ? buttons.map((btn, index) => 
            `<button class="modal-btn ${index === 0 ? 'primary' : 'secondary'}" data-action="${index}">${btn.text}</button>`
          ).join('')
        : '<button class="modal-btn primary" data-action="0">OK</button>';
    
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <div class="modal-buttons">
                    ${buttonsHtml}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle button clicks
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-btn')) {
            const actionIndex = parseInt(e.target.dataset.action);
            const action = buttons[actionIndex]?.action || (() => {});
            modal.remove();
            action();
        } else if (e.target.classList.contains('modal-overlay')) {
            modal.remove();
        }
    });
    
    // Animate in
    setTimeout(() => modal.classList.add('show'), 10);
}

// Utility function for phone number formatting (Indian format)
function formatPhoneNumber(e) {
    const input = e.target;
    let value = input.value.replace(/\D/g, ''); // Remove all non-digits
    
    // Limit to 10 digits for Indian mobile numbers
    if (value.length > 10) {
        value = value.slice(0, 10);
    }
    
    input.value = value;
}

// Page transition effects
function initPageTransitions() {
    const links = document.querySelectorAll('a[href^="/"]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            
            document.body.classList.add('page-transition');
            
            setTimeout(() => {
                window.location.href = href;
            }, 300);
        });
    });
}

// Initialize page transitions
document.addEventListener('DOMContentLoaded', initPageTransitions);

// Handle browser back button
window.addEventListener('popstate', (e) => {
    // Add any cleanup logic here if needed
});

// Performance optimization - lazy load heavy animations
function lazyLoadAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    });
    
    document.querySelectorAll('.card').forEach(card => {
        observer.observe(card);
    });
}

// Initialize lazy loading
document.addEventListener('DOMContentLoaded', lazyLoadAnimations);