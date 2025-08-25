// Enhanced public/js/main.js with improved leaf animation and distribution

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

// Field validation function
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
                errorMessage = 'Please select a city';
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
        case '/ar-experience':
            // 8th Wall will handle permissions automatically
            break;
    }

    // Add enhanced floating leaves animation with better distribution
    createEnhancedFloatingLeaves();
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
        const inputs = registerForm.querySelectorAll('input, select');
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

    // Initialize searchable dropdown for city if it exists
    const cityContainer = document.querySelector('.searchable-dropdown');
    if (cityContainer) {
        // The searchable dropdown is initialized in the register.ejs inline script
        console.log('Searchable dropdown container found');
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
                errorMessage = 'Please select a city';
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
    const inputs = form.querySelectorAll('input, select');
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

// Updated searchable dropdown JavaScript with fixed positioning

function createSearchableDropdown(container) {
    const input = container.querySelector('input[name="city"]');
    if (!input) return;

    // Create dropdown list
    const dropdownList = document.createElement('div');
    dropdownList.className = 'dropdown-list';
    container.appendChild(dropdownList);

    let selectedIndex = -1;
    let filteredOptions = [];

    // Get the form group container for z-index management
    const formGroup = container.closest('.form-group');

    function filterCities(query) {
        if (!query || query.length < 1) {
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();
        
        // Filter cities that match the query
        const matches = allCities.filter(item => 
            item.city.toLowerCase().includes(normalizedQuery)
        );

        // Sort by relevance (exact matches first, then starts with, then contains)
        matches.sort((a, b) => {
            const aCityLower = a.city.toLowerCase();
            const bCityLower = b.city.toLowerCase();
            
            // Exact match
            if (aCityLower === normalizedQuery) return -1;
            if (bCityLower === normalizedQuery) return 1;
            
            // Starts with query
            if (aCityLower.startsWith(normalizedQuery) && !bCityLower.startsWith(normalizedQuery)) return -1;
            if (!aCityLower.startsWith(normalizedQuery) && bCityLower.startsWith(normalizedQuery)) return 1;
            
            // Alphabetical for same type of match
            return a.city.localeCompare(b.city);
        });

        return matches.slice(0, 10); // Limit to 10 results
    }

    function renderDropdown(options) {
        dropdownList.innerHTML = '';

        if (options.length === 0) {
            dropdownList.innerHTML = '<div class="no-results">No cities found</div>';
            dropdownList.classList.add('show');
            return;
        }

        // Group by state for better organization
        const groupedOptions = {};
        options.forEach(option => {
            if (!groupedOptions[option.state]) {
                groupedOptions[option.state] = [];
            }
            groupedOptions[option.state].push(option.city);
        });

        // Render grouped options
        Object.keys(groupedOptions).forEach((state, groupIndex) => {
            // Only show state header if there are multiple states
            if (Object.keys(groupedOptions).length > 1) {
                const header = document.createElement('div');
                header.className = 'dropdown-option group-header';
                header.textContent = state;
                dropdownList.appendChild(header);
            }

            groupedOptions[state].forEach((city, cityIndex) => {
                const option = document.createElement('div');
                option.className = 'dropdown-option';
                option.textContent = city;
                option.dataset.value = city;
                
                option.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    selectCity(city);
                });

                dropdownList.appendChild(option);
            });
        });

        dropdownList.classList.add('show');
        selectedIndex = -1;
    }

    function selectCity(city) {
        input.value = city;
        hideDropdown();
        
        // Clear any existing errors
        const errorElement = container.querySelector('.field-error');
        if (errorElement) {
            errorElement.remove();
        }
        container.classList.remove('error');
        
        // Trigger change event for validation
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function hideDropdown() {
        dropdownList.classList.remove('show');
        container.classList.remove('open');
        
        // Remove z-index management classes
        if (formGroup) {
            formGroup.classList.remove('dropdown-active');
        }
        
        selectedIndex = -1;
    }

    function showDropdown() {
        container.classList.add('open');
        
        // Add z-index management classes
        if (formGroup) {
            formGroup.classList.add('dropdown-active');
        }
        
        // Ensure dropdown is positioned correctly
        const rect = container.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        
        // If not enough space below, but this is rare in our form layout
        if (spaceBelow < 200 && rect.top > 200) {
            dropdownList.style.bottom = '100%';
            dropdownList.style.top = 'auto';
            dropdownList.style.borderRadius = '15px 15px 0 0';
        } else {
            dropdownList.style.top = '100%';
            dropdownList.style.bottom = 'auto';
            dropdownList.style.borderRadius = '0 0 15px 15px';
        }
    }

    function highlightOption(index) {
        const options = dropdownList.querySelectorAll('.dropdown-option:not(.group-header)');
        
        // Remove previous highlight
        options.forEach(opt => opt.classList.remove('highlighted'));
        
        if (index >= 0 && index < options.length) {
            options[index].classList.add('highlighted');
            // Scroll to highlighted option if needed
            options[index].scrollIntoView({ block: 'nearest' });
        }
    }

    // Input event listeners
    input.addEventListener('input', (e) => {
        const query = e.target.value;
        
        if (query.length === 0) {
            hideDropdown();
            return;
        }

        filteredOptions = filterCities(query);
        renderDropdown(filteredOptions);
        showDropdown();
    });

    input.addEventListener('focus', (e) => {
        const query = e.target.value;
        if (query.length > 0) {
            filteredOptions = filterCities(query);
            renderDropdown(filteredOptions);
            showDropdown();
        }
    });

    input.addEventListener('keydown', (e) => {
        const options = dropdownList.querySelectorAll('.dropdown-option:not(.group-header)');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, options.length - 1);
                highlightOption(selectedIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                highlightOption(selectedIndex);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && options[selectedIndex]) {
                    selectCity(options[selectedIndex].dataset.value);
                }
                break;
                
            case 'Escape':
                hideDropdown();
                input.blur();
                break;
        }
    });

    // Click outside to close - improved event handling
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            hideDropdown();
        }
    });

    // Prevent dropdown from closing when clicking inside it
    dropdownList.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Add searchable classes
    container.classList.add('searchable-container');
}

// Enhanced floating leaves animation with full screen distribution
function createEnhancedFloatingLeaves() {
    const leafContainer = document.querySelector('.leaf-background');
    if (!leafContainer) return;

    // Clear any existing leaves
    leafContainer.querySelectorAll('.floating-leaf').forEach(leaf => leaf.remove());

    // Create more leaves with better screen coverage
    for (let i = 0; i < 25; i++) {
        const leaf = document.createElement('div');
        leaf.className = 'floating-leaf';
        
        const size = 25 + Math.random() * 35; // Varied sizes from 25-60px
        const animationDuration = 8 + Math.random() * 12; // 8-20 seconds
        const delay = Math.random() * 15; // Up to 15 second delay
        
        // Better distribution across the entire screen
        const startX = Math.random() * 100; // 0-100% width
        const startY = Math.random() * 100; // 0-100% height
        
        const rotation = Math.random() * 360; // Random initial rotation
        
        // Choose random animation type for variety
        const animations = ['floatLeaf', 'floatLeafReverse', 'floatLeafSlow'];
        const animationType = animations[Math.floor(Math.random() * animations.length)];
        
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
            animation: ${animationType} ${animationDuration}s ease-in-out infinite;
            animation-delay: ${delay}s;
            opacity: ${0.3 + Math.random() * 0.5}; // 0.3 to 0.8 opacity
            transform-origin: center;
            transform: rotate(${rotation}deg);
            z-index: ${Math.floor(Math.random() * 5) + 1}; // Z-index 1-5
            pointer-events: none;
        `;
        
        leafContainer.appendChild(leaf);
    }
    
    // Ensure CSS animations are added
    if (!document.getElementById('enhancedLeafAnimation')) {
        const style = document.createElement('style');
        style.id = 'enhancedLeafAnimation';
        style.textContent = `
            @keyframes floatLeaf {
                0% { 
                    transform: translateY(0px) translateX(0px) rotate(0deg); 
                    opacity: 0.6;
                }
                25% { 
                    transform: translateY(-30px) translateX(20px) rotate(90deg); 
                    opacity: 0.8;
                }
                50% { 
                    transform: translateY(-45px) translateX(-15px) rotate(180deg); 
                    opacity: 1;
                }
                75% { 
                    transform: translateY(-30px) translateX(25px) rotate(270deg); 
                    opacity: 0.8;
                }
                100% { 
                    transform: translateY(0px) translateX(0px) rotate(360deg); 
                    opacity: 0.6;
                }
            }
            
            @keyframes floatLeafReverse {
                0% { 
                    transform: translateY(-20px) translateX(10px) rotate(180deg); 
                    opacity: 0.5;
                }
                25% { 
                    transform: translateY(-40px) translateX(-20px) rotate(270deg); 
                    opacity: 0.7;
                }
                50% { 
                    transform: translateY(-60px) translateX(15px) rotate(360deg); 
                    opacity: 0.9;
                }
                75% { 
                    transform: translateY(-40px) translateX(-10px) rotate(450deg); 
                    opacity: 0.7;
                }
                100% { 
                    transform: translateY(-20px) translateX(10px) rotate(540deg); 
                    opacity: 0.5;
                }
            }
            
            @keyframes floatLeafSlow {
                0% { 
                    transform: translateY(0px) translateX(0px) rotate(0deg) scale(1); 
                    opacity: 0.4;
                }
                33% { 
                    transform: translateY(-25px) translateX(30px) rotate(120deg) scale(1.1); 
                    opacity: 0.7;
                }
                66% { 
                    transform: translateY(-50px) translateX(-20px) rotate(240deg) scale(0.9); 
                    opacity: 0.8;
                }
                100% { 
                    transform: translateY(0px) translateX(0px) rotate(360deg) scale(1); 
                    opacity: 0.4;
                }
            }
        `;
        document.head.appendChild(style);
    }
}