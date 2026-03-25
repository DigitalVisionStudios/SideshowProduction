// Externalized Meety/BOGO logic
// VERSION: 2.3.0 - Enhanced Fee System (Oct 26, 2025)
// Changelog: 
//   - Implemented comprehensive fee calculation with 3.9% + $0.30 (2.9% base + 1% buffer + $0.30)
//   - Added bidirectional fee conversion utilities (sticker ↔ net, deposit ↔ full price)
//   - Enhanced logging and transparency for all fee calculations
//   - Updated all fee computation to use buffered rate consistently
//   - Added feeBreakdown, stickerFromNet, fullPriceFromDeposit utility functions
const MEETYBUTTON_VERSION = '2.3.1-production';
const MEETYBUTTON_DATE = '2025-10-26';
console.log('%c[MEETYBUTTON.JS] v' + MEETYBUTTON_VERSION, 'color:#00ff00;font-weight:bold;font-size:14px', 'Build: ' + MEETYBUTTON_DATE);
console.log('%c[MEETYBUTTON.JS]', 'color:#00ff00;font-weight:bold', 'Loading meetybutton.js script...');
(function(){
  if (window.__meetyBogoInit) return; window.__meetyBogoInit = true;
  console.log('%c[MEETYBUTTON.JS]', 'color:#00ff00;font-weight:bold', 'Meety BOGO system initializing...');

  // Global feature flags (safe defaults). Merchant can override via window.__meetyBogoFlags
  window.__meetyBogoFlags = window.__meetyBogoFlags || {};
  // Disable the 1h -> 2h tattoo BOGO option by default across all BOGO tattoo paths
  if (typeof window.__meetyBogoFlags.disableTattoo1h === 'undefined') {
    window.__meetyBogoFlags.disableTattoo1h = true;
  }

  // Add loading spinner CSS if not already added
  if (!document.querySelector('#meety-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'meety-loading-styles';
    style.textContent = `
      .meety-loading-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #666;
        border-radius: 50%;
        animation: meety-spin 1s linear infinite;
        margin-right: 8px;
        vertical-align: middle;
      }
      
      @keyframes meety-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      
      .meety-btn.loading {
        opacity: 0.8;
        pointer-events: none;
        cursor: not-allowed;
        position: relative;
      }
      
      .gift-card-btn.loading {
        opacity: 0.8;
        pointer-events: none;
        cursor: not-allowed;
        position: relative;
      }
      
      .meety-btn.loading::after,
      .gift-card-btn.loading::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        top: 50%;
        left: 50%;
        margin-left: -8px;
        margin-top: -8px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #333;
        animation: meety-spin 1s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // Loading state management utilities
  const LoadingManager = {
    setLoading: function(button, loadingText = 'Loading...') {
      if (!button) return;
      
      // Store original state
      button.dataset.originalText = button.innerHTML;
      button.dataset.originalDisabled = button.disabled;
      button.dataset.originalClass = button.className;
      
      // Add loading state
      button.disabled = true;
      button.classList.add('loading');
      
      // For buttons with spinner CSS (like add-to-cart-btn), keep original text but make it transparent via CSS
      // For other buttons, show loading text
      if (button.classList.contains('add-to-cart-btn')) {
        // The CSS will handle making text transparent and showing spinner
        // Don't change innerHTML to preserve original button content
      } else {
        button.innerHTML = loadingText;
      }
      
      // Add some visual feedback for non-CSS spinner buttons
      if (!button.classList.contains('add-to-cart-btn')) {
        button.style.opacity = '0.7';
        button.style.cursor = 'not-allowed';
      }
    },
    
    removeLoading: function(button) {
      if (!button) return;
      
      // Remove loading class
      button.classList.remove('loading');
      
      // Restore original state
      button.disabled = button.dataset.originalDisabled === 'true';
      
      // Only restore innerHTML if we changed it (non-add-to-cart buttons)
      if (!button.classList.contains('add-to-cart-btn') && button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
      }
      
      // Remove visual feedback
      button.style.opacity = '';
      button.style.cursor = '';
      
      // Clean up data attributes
      delete button.dataset.originalText;
      delete button.dataset.originalDisabled;
      delete button.dataset.originalClass;
    }
  };
  const isTattoo1hDisabled = () => window.__meetyBogoFlags && window.__meetyBogoFlags.disableTattoo1h === true;

  // Global cart operation queue processor
  // Ensures only one cart operation executes at a time to prevent race conditions
  async function processCartOperationQueue() {
    // Check if already processing or queue is empty
    if (window.__meetyBogo.cartOperationLock || window.__meetyBogo.cartOperationQueue.length === 0) {
      return;
    }
    
    // Acquire lock
    window.__meetyBogo.cartOperationLock = true;
    console.log('[MeetyBogo]', '🔒 Cart operation lock acquired, queue length:', window.__meetyBogo.cartOperationQueue.length);
    
    try {
      // Get the next operation from queue
      const operation = window.__meetyBogo.cartOperationQueue.shift();
      
      if (!operation) {
        return;
      }
      
      console.log('[MeetyBogo]', '▶️ Processing cart operation:', operation.id);
      
      // Execute the operation
      try {
        const result = await operation.execute();
        operation.resolve(result);
        console.log('[MeetyBogo]', '✅ Cart operation completed successfully:', operation.id);
      } catch (error) {
        console.error('[MeetyBogo]', '❌ Cart operation failed:', operation.id, error);
        operation.reject(error);
      }
      
    } finally {
      // Release lock
      window.__meetyBogo.cartOperationLock = false;
      console.log('[MeetyBogo]', '🔓 Cart operation lock released');
      
      // Process next operation in queue after a small delay
      if (window.__meetyBogo.cartOperationQueue.length > 0) {
        console.log('[MeetyBogo]', '⏭️ Processing next operation in queue, remaining:', window.__meetyBogo.cartOperationQueue.length);
        setTimeout(() => processCartOperationQueue(), 100);
      }
    }
  }
  
  // Queue a cart operation for sequential execution
  function queueCartOperation(operationFn, operationId = 'cart-op-' + Date.now()) {
    return new Promise((resolve, reject) => {
      const operation = {
        id: operationId,
        execute: operationFn,
        resolve: resolve,
        reject: reject,
        queuedAt: Date.now()
      };
      
      window.__meetyBogo.cartOperationQueue.push(operation);
      console.log('[MeetyBogo]', '📥 Cart operation queued:', operationId, 'Queue length:', window.__meetyBogo.cartOperationQueue.length);
      
      // Start processing the queue
      processCartOperationQueue();
    });
  }

  // Remove all existing gift cards from cart (ensures only one gift card at checkout)
  async function removeExistingGiftCards(maxRetries = 3) {
    console.log('[MeetyBogo]', '🧹 Checking for existing gift cards in cart...');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Fetch current cart (always get fresh state)
        const cartResponse = await fetch('/cart.js?t=' + Date.now());
        if (!cartResponse.ok) {
          console.warn('[MeetyBogo]', '⚠️ Could not fetch cart for cleanup');
          return { removed: 0, errors: [] };
        }
        
        const cart = await cartResponse.json();
        console.log('[MeetyBogo]', `📦 Current cart has ${cart.item_count} items (attempt ${attempt}/${maxRetries})`);
        
        if (!cart.items || cart.items.length === 0) {
          console.log('[MeetyBogo]', '✅ Cart is empty, no cleanup needed');
          return { removed: 0, errors: [] };
        }
        
        // Identify gift card items by checking for Shopify's gift card property
        const giftCardItems = cart.items.filter(item => {
          const props = item.properties || {};
          return props['__shopify_send_gift_card_to_recipient'] === 'true' ||
                 props['Recipient email'] || 
                 props['_Recipient Email'] ||
                 item.product_type === 'Gift Card' ||
                 (item.title && item.title.toLowerCase().includes('gift card'));
        });
        
        console.log('[MeetyBogo]', '🎁 Found', giftCardItems.length, 'gift card(s) in cart');
        
        if (giftCardItems.length === 0) {
          console.log('[MeetyBogo]', '✅ No gift cards to remove');
          return { removed: 0, errors: [] };
        }
        
        // Remove gift cards sequentially to avoid conflicts
        let successCount = 0;
        let errors = [];
        
        for (let i = 0; i < giftCardItems.length; i++) {
          const item = giftCardItems[i];
          
          try {
            console.log('[MeetyBogo]', `🗑️ Removing gift card ${i + 1}/${giftCardItems.length}:`, {
              title: item.title || item.product_title,
              variant_id: item.variant_id,
              key: item.key
            });
            
            // Small delay between removals to prevent conflicts
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            const response = await fetch('/cart/change.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                id: item.key,
                quantity: 0
              })
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('[MeetyBogo]', '❌ Failed to remove gift card:', errorText);
              
              // Check if it's a 409 conflict - retry if we have attempts left
              if (response.status === 409 && attempt < maxRetries) {
                console.log('[MeetyBogo]', `⏳ Cart conflict detected, will retry (attempt ${attempt}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Exponential backoff
                throw new Error('RETRY_409');
              }
              
              errors.push(errorText);
              continue; // Try next item
            }
            
            console.log('[MeetyBogo]', '✅ Successfully removed gift card:', item.title || item.product_title);
            successCount++;
            
          } catch (error) {
            if (error.message === 'RETRY_409') {
              throw error; // Propagate retry signal
            }
            console.error('[MeetyBogo]', '❌ Error removing gift card:', error);
            errors.push(error.message);
          }
        }
        
        console.log('[MeetyBogo]', `🧹 Cleanup complete: ${successCount}/${giftCardItems.length} gift cards removed`);
        
        if (errors.length > 0) {
          console.warn('[MeetyBogo]', '⚠️ Some gift cards could not be removed:', errors);
        }
        
        return { removed: successCount, errors };
        
      } catch (error) {
        if (error.message === 'RETRY_409' && attempt < maxRetries) {
          console.log('[MeetyBogo]', `🔄 Retrying cleanup (attempt ${attempt + 1}/${maxRetries})...`);
          continue; // Retry the entire cleanup process
        }
        
        console.error('[MeetyBogo]', '❌ Gift card cleanup failed:', error);
        return { removed: 0, errors: [error.message] };
      }
    }
    
    // If we exhausted all retries
    console.error('[MeetyBogo]', '❌ Gift card cleanup failed after', maxRetries, 'attempts');
    return { removed: 0, errors: ['Max retries exceeded'] };
  }

  // Namespaced global state management to prevent pollution
  window.__meetyBogo = window.__meetyBogo || {
    states: new Map(),
    contexts: new Map(),
    activeOverlays: new Set(),
    processingButtons: new Set(), // Track buttons currently processing to prevent spam
    lastClickTimestamps: new Map(), // Track last click time per button for debouncing
    cartOperationLock: false, // Global lock for cart operations to prevent race conditions
    cartOperationQueue: [], // Queue for pending cart operations
    cleanup: (btnId) => {
      if (window.__meetyBogo.states.has(btnId)) {
        console.log(LOG_PREFIX, 'Global cleanup for button:', btnId);
        window.__meetyBogo.states.delete(btnId);
        window.__meetyBogo.contexts.delete(btnId);
        window.__meetyBogo.activeOverlays.delete(btnId);
        window.__meetyBogo.processingButtons.delete(btnId);
        window.__meetyBogo.lastClickTimestamps.delete(btnId);
      }
    },
    cleanupAll: () => {
      console.log(LOG_PREFIX, 'Global cleanup all');
      window.__meetyBogo.states.clear();
      window.__meetyBogo.contexts.clear();
      window.__meetyBogo.activeOverlays.clear();
      window.__meetyBogo.processingButtons.clear();
      window.__meetyBogo.lastClickTimestamps.clear();
      window.__meetyBogo.cartOperationQueue = [];
      window.__meetyBogo.cartOperationLock = false;
    }
  };

  // Add CSS for universal back buttons and enhanced form styling
  const backButtonCSS = `
    .meety-back-button-container {
      text-align: center;
      margin-top: 15px;
    }
    .meety-universal-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }
    .meety-universal-back-btn:hover {
      opacity: 0.8;
    }
    .meety-universal-back-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .meety-universal-back-btn svg {
      flex-shrink: 0;
    }
    
    /* Hide BOGO Tracking Products from Cart GUI */
    [data-cart-item][data-variant-id] {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    /* Hide tracking products completely */
    [data-cart-item] .cart-item__details:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    [data-cart-item]:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    .cart-item:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    .cart__item:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    .line-item:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    [class*="cart"]:has(.cart-item__property-name:contains("BOGO Inventory Tracker")),
    /* Target by product title patterns */
    [data-cart-item]:has([class*="title"]:contains("Gift Card Counter")),
    .cart-item:has([class*="title"]:contains("Gift Card Counter")),
    .cart__item:has([class*="title"]:contains("Gift Card Counter")),
    .line-item:has([class*="title"]:contains("Gift Card Counter")),
    /* Target by SKU patterns */
    [data-cart-item]:has([class*="sku"]:contains("COUNTER-")),
    .cart-item:has([class*="sku"]:contains("COUNTER-")),
    .cart__item:has([class*="sku"]:contains("COUNTER-")),
    .line-item:has([class*="sku"]:contains("COUNTER-")) {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
    
    /* Fallback selectors for different cart structures */
    .cart-item[data-key*="46793563111681"],
    .cart-item[data-key*="46793563144449"],
    .cart-item[data-key*="46793563177217"],
    .cart-item[data-key*="46793563209985"],
    .cart__item[data-variant-id="46793563111681"],
    .cart__item[data-variant-id="46793563144449"],
    .cart__item[data-variant-id="46793563177217"],
    .cart__item[data-variant-id="46793563209985"],
    [data-cart-item][data-variant-id="46793563111681"],
    [data-cart-item][data-variant-id="46793563144449"],
    [data-cart-item][data-variant-id="46793563177217"],
    [data-cart-item][data-variant-id="46793563209985"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
    }
    
    /* Hide quantity controls for gift cards */
    .cart-item:has([class*="title"]:contains("Gift Card")) [class*="quantity-selector"],
    .cart-item:has([class*="title"]:contains("Gift Card")) [class*="quantity-controls"],
    .cart-item:has([class*="title"]:contains("Gift Card")) .cart-item__quantity-controls,
    .cart-item:has([class*="title"]:contains("Gift Card")) .quantity-controls,
    .cart-item:has([class*="title"]:contains("Gift Card")) .cart__quantity-controls,
    .cart-item:has([class*="title"]:contains("Gift Card")) [class*="qty"],
    .cart-item:has([class*="title"]:contains("Gift Card")) .qty-controls,
    .cart-item:has([class*="title"]:contains("Gift Card")) .quantity-wrapper,
    .cart-item:has([class*="title"]:contains("Gift Card")) .js-qty,
    .cart__item:has([class*="title"]:contains("Gift Card")) [class*="quantity-selector"],
    .cart__item:has([class*="title"]:contains("Gift Card")) [class*="quantity-controls"],
    .cart__item:has([class*="title"]:contains("Gift Card")) .cart-item__quantity-controls,
    .cart__item:has([class*="title"]:contains("Gift Card")) .quantity-controls,
    .cart__item:has([class*="title"]:contains("Gift Card")) .cart__quantity-controls,
    .cart__item:has([class*="title"]:contains("Gift Card")) [class*="qty"],
    .cart__item:has([class*="title"]:contains("Gift Card")) .qty-controls,
    .cart__item:has([class*="title"]:contains("Gift Card")) .quantity-wrapper,
    .cart__item:has([class*="title"]:contains("Gift Card")) .js-qty,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) [class*="quantity-selector"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) [class*="quantity-controls"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .cart-item__quantity-controls,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .quantity-controls,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .cart__quantity-controls,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) [class*="qty"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .qty-controls,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .quantity-wrapper,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .js-qty {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    
    /* Hide individual + and - buttons for gift cards */
    .cart-item:has([class*="title"]:contains("Gift Card")) button[class*="plus"],
    .cart-item:has([class*="title"]:contains("Gift Card")) button[class*="minus"],
    .cart-item:has([class*="title"]:contains("Gift Card")) button[class*="increment"],
    .cart-item:has([class*="title"]:contains("Gift Card")) button[class*="decrement"],
    .cart-item:has([class*="title"]:contains("Gift Card")) .btn--plus,
    .cart-item:has([class*="title"]:contains("Gift Card")) .btn--minus,
    .cart-item:has([class*="title"]:contains("Gift Card")) .qty-btn,
    .cart-item:has([class*="title"]:contains("Gift Card")) [data-quantity-plus],
    .cart-item:has([class*="title"]:contains("Gift Card")) [data-quantity-minus],
    .cart__item:has([class*="title"]:contains("Gift Card")) button[class*="plus"],
    .cart__item:has([class*="title"]:contains("Gift Card")) button[class*="minus"],
    .cart__item:has([class*="title"]:contains("Gift Card")) button[class*="increment"],
    .cart__item:has([class*="title"]:contains("Gift Card")) button[class*="decrement"],
    .cart__item:has([class*="title"]:contains("Gift Card")) .btn--plus,
    .cart__item:has([class*="title"]:contains("Gift Card")) .btn--minus,
    .cart__item:has([class*="title"]:contains("Gift Card")) .qty-btn,
    .cart__item:has([class*="title"]:contains("Gift Card")) [data-quantity-plus],
    .cart__item:has([class*="title"]:contains("Gift Card")) [data-quantity-minus],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) button[class*="plus"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) button[class*="minus"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) button[class*="increment"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) button[class*="decrement"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .btn--plus,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .btn--minus,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .qty-btn,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) [data-quantity-plus],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) [data-quantity-minus] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    
    /* Make quantity input readonly for gift cards */
    .cart-item:has([class*="title"]:contains("Gift Card")) input[name*="quantity"],
    .cart-item:has([class*="title"]:contains("Gift Card")) input[class*="quantity"],
    .cart-item:has([class*="title"]:contains("Gift Card")) input[class*="qty"],
    .cart-item:has([class*="title"]:contains("Gift Card")) .quantity-input,
    .cart__item:has([class*="title"]:contains("Gift Card")) input[name*="quantity"],
    .cart__item:has([class*="title"]:contains("Gift Card")) input[class*="quantity"],
    .cart__item:has([class*="title"]:contains("Gift Card")) input[class*="qty"],
    .cart__item:has([class*="title"]:contains("Gift Card")) .quantity-input,
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) input[name*="quantity"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) input[class*="quantity"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) input[class*="qty"],
    [data-cart-item]:has([class*="title"]:contains("Gift Card")) .quantity-input {
      pointer-events: none !important;
      background: #f5f5f5 !important;
      color: #666 !important;
      cursor: not-allowed !important;
    }
    
    /* Enhanced Gift Card Form Styles */
    .gift-form input:invalid:not(:placeholder-shown),
    .gift-form select:invalid:not(:placeholder-shown) {
      border-color: #e74c3c !important;
      background: #fff5f5;
    }
    
    .gift-form input:valid,
    .gift-form select:valid:not([value=""]) {
      border-color: #27ae60 !important;
    }
    
    .gift-form input::placeholder,
    .gift-form textarea::placeholder {
      color: #aaa;
      opacity: 1;
    }
    
    .gift-form input:hover:not(:focus),
    .gift-form select:hover:not(:focus),
    .gift-form textarea:hover:not(:focus) {
      border-color: #b8b8b8;
    }
    
    .gift-form .form-group {
      position: relative;
    }
    
    .gift-form input:focus,
    .gift-form select:focus,
    .gift-form textarea:focus {
      border-color: #667eea !important;
      outline: none;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .add-to-cart-btn:active {
      transform: translateY(0) !important;
    }
    
    .add-to-cart-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none !important;
    }
    
    /* Loading state for button */
    .add-to-cart-btn.loading {
      position: relative;
      color: transparent;
      cursor: not-allowed;
      opacity: 0.9;
    }
    
    .add-to-cart-btn.loading::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      top: 50%;
      left: 50%;
      margin-left: -10px;
      margin-top: -10px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }
    
    .add-to-cart-btn.loading::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.1);
      border-radius: inherit;
      pointer-events: none;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Success checkmark animation */
    .form-success-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #27ae60;
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0;
      animation: successPop 0.3s ease forwards;
    }
    
    .form-success-icon::after {
      content: '✓';
      color: white;
      font-size: 11px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    
    @keyframes successPop {
      0% {
        transform: translateY(-50%) scale(0);
        opacity: 0;
      }
      50% {
        transform: translateY(-50%) scale(1.1);
      }
      100% {
        transform: translateY(-50%) scale(1);
        opacity: 1;
      }
    }
  `;
  
  // Inject CSS if not already present
  if (!document.querySelector('#meety-back-button-styles')) {
    const style = document.createElement('style');
    style.id = 'meety-back-button-styles';
    style.textContent = backButtonCSS;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', () => {
  console.log('[Meety] init (buttons | parsed-dropdown | piercings-categories)');
  const LOG_PREFIX = '[MeetyGiftDebug]';

  // Helper: determine if BOGO is sold out based on tattoo tracking liquid total or state flag
  function isBogoSoldOut(st, btn) {
    if (st && st.bogoSoldOut === true) return true;
    try {
      const raw = btn?.getAttribute('data-bogo-tattoo-liquid-total');
      if (raw != null && raw !== '') {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n <= 0) return true;
      }
    } catch(_){}
    return false;
  }

  /* === Tooth Gems Gift Variant Mapping Config === */
  const TOOTH_GEMS_VARIANT_RULES = [
    { style:'single',  placement:'upper-front', keywords:['single','upper'] },
    { style:'single',  placement:'lower-front', keywords:['single','lower'] },
    { style:'single',  placement:'canine',      keywords:['single','canine'] },
    { style:'single',  placement:'custom',      keywords:['single'] },
    { style:'pair',    placement:'upper-front', keywords:['pair','upper'] },
    { style:'pair',    placement:'lower-front', keywords:['pair','lower'] },
    { style:'pair',    placement:'canine',      keywords:['pair','canine'] },
    { style:'pair',    placement:'custom',      keywords:['pair'] },
    { style:'cluster', placement:'upper-front', keywords:['cluster','upper'] },
  { style:'cluster', placement:'lower-front', keywords:['cluster','lower'] },
    { style:'cluster', placement:'canine',      keywords:['cluster','canine'] },
    { style:'cluster', placement:'custom',      keywords:['cluster'] }
  ];

  /* Normalize variant titles for display purposes */
  function normalizeVariantTitleForDisplay(title, category) {
    if (!title || typeof title !== 'string') return title;
    
    // Fix teeth whitening variants that incorrectly show "Triple" instead of "Single"
    if (category === 'teeth-whitening' || category === 'whitening') {
      // Replace "Triple" with "Single" for whitening services
      if (title.toLowerCase().includes('triple')) {
        return title.replace(/triple/gi, 'Single');
      }
      // Also handle "3x" or similar patterns
      if (title.match(/\b3x?\b/i)) {
        return title.replace(/\b3x?\b/gi, 'Single');
      }
    }
    
    return title;
  }

  async function fetchGiftProduct(handle){
    if(!handle) return null;
    try { 
      const r = await fetchWithTimeout(`/products/${handle}.js`, {}, 5000); 
      if(!r.ok) throw new Error('gift product fetch failed ' + r.status); 
      return await r.json(); 
    }
    catch(e){ console.warn(LOG_PREFIX,'fetchGiftProduct error', e); return null; }
  }

  function findToothGemVariant(variants, style, placement){
    if(!Array.isArray(variants) || !variants.length) return null;
    const titleNorm = v => (v.title||'').toLowerCase();
    const rule = TOOTH_GEMS_VARIANT_RULES.find(r => r.style===style && r.placement===placement);
    if(rule){
      const kw = rule.keywords.map(k=>k.toLowerCase());
      const hit = variants.find(v => kw.every(k => titleNorm(v).includes(k)));
      if(hit) return hit;
    }
    const styleHit = variants.find(v => titleNorm(v).includes(style.replace(/-/g,' ')));
    if(styleHit) return styleHit;
    if(style === 'cluster'){
      const clusterHit = variants.find(v => /cluster|set|multi/.test(titleNorm(v)));
      if(clusterHit) return clusterHit;
    }
    return [...variants].sort((a,b)=> b.price - a.price)[0];
  }

  async function ensureToothGemVariantMapping(st, btn){
    if(!st || !st.giftGems || st.giftGems.variantId) return;
    const giftHandle = btn.getAttribute('data-gift-gems-product-handle');
    const bogoHandle = btn.getAttribute('data-bogo-product-handle');
    const handle = giftHandle || bogoHandle;
    if(!handle){ console.warn(LOG_PREFIX,'No handle for tooth gems gift variant mapping'); return; }
    if(!st._giftGemsProduct || st._giftGemsProduct.handle !== handle){ st._giftGemsProduct = await fetchGiftProduct(handle); }
    const variants = (st._giftGemsProduct?.variants||[]).filter(v=>v.available!==false);
    if(!variants.length){ console.warn(LOG_PREFIX,'No variants available on gift product for tooth gems'); return; }
    const match = findToothGemVariant(variants, st.giftGems.style, st.giftGems.placement);
    if(match){ st.giftGems.variantId = match.id; st.giftGems.variantTitle = match.title; console.log(LOG_PREFIX,'Mapped tooth gem gift selection to variant', match.id, match.title); }
    else { console.warn(LOG_PREFIX,'Failed to match tooth gem variant; leaving undefined'); }
  }

  function modifyCalendarVariant(baseCalendar, variantId){
    if(!baseCalendar || !variantId) return baseCalendar;
    try { return { ...baseCalendar, variantId: String(variantId) }; }
    catch(e){ console.warn(LOG_PREFIX,'modifyCalendarVariant error', e); return baseCalendar; }
  }

  /* Helpers */
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function waitFor(testFn, tries=20, intervalMs=100){
    for (let i=0;i<tries;i++){ if (testFn()) return true; await sleep(intervalMs); }
    return false;
  }
  function decodeEntities(s){ if (s == null) return ''; const t=document.createElement('textarea'); t.innerHTML=s; return t.value; }
  function parseJSONSafe(s){ try { return JSON.parse(s); } catch { return null; } }
  function normalizeTxt(s){ return (s||'').replace(/\s+/g,' ').trim(); }

  /* Get the correct BOGO product handle based on category */
  function getBogoProductHandle(btn, category) {
    // Map categories to their respective product handle attributes
    const handleMap = {
      'tooth-gems': 'data-bogo-product-handle', // Keep existing for tooth gems
      'teeth-whitening': 'data-bogo-whitening-product-handle', // New separate handle for whitening
      'piercings': 'data-bogo-product-handle',
      'tattoo': 'data-bogo-product-handle'
    };
    
    const attributeName = handleMap[category] || 'data-bogo-product-handle';
    const handle = btn.getAttribute(attributeName);
    
    console.log(LOG_PREFIX, 'getBogoProductHandle:', {
      category,
      attributeName,
      handle,
      availableHandles: {
        'tooth-gems': btn.getAttribute('data-bogo-product-handle'),
        'teeth-whitening': btn.getAttribute('data-bogo-whitening-product-handle')
      }
    });
    
    return handle;
  }

  /* Get the correct BOGO product ID based on category */
  function getBogoProductId(btn, category) {
    // Map categories to their respective product ID attributes
    const idMap = {
      'tooth-gems': 'data-bogo-product-id', // Keep existing for tooth gems
      'teeth-whitening': 'data-bogo-whitening-product-id', // New separate ID for whitening
      'piercings': 'data-bogo-product-id',
      'tattoo': 'data-bogo-product-id'
    };
    
    const attributeName = idMap[category] || 'data-bogo-product-id';
    const productId = btn.getAttribute(attributeName);
    
    console.log(LOG_PREFIX, 'getBogoProductId:', {
      category,
      attributeName,
      productId,
      availableIds: {
        'tooth-gems': btn.getAttribute('data-bogo-product-id'),
        'teeth-whitening': btn.getAttribute('data-bogo-whitening-product-id')
      }
    });
    
    return productId;
  }

  /* Check if any BOGO products are configured */
  function hasAnyBogoProduct(btn) {
    const toothGemsHandle = btn.getAttribute('data-bogo-product-handle');
    const teethWhiteningHandle = btn.getAttribute('data-bogo-whitening-product-handle');
    
    const hasAny = !!(toothGemsHandle || teethWhiteningHandle);
    
    console.log(LOG_PREFIX, 'hasAnyBogoProduct:', {
      toothGemsHandle,
      teethWhiteningHandle,
      hasAny
    });
    
    return hasAny;
  }

  /* BOGO Product Fetching with Automatic Retry */
  async function fetchBogoProduct(productHandle, retryAttempt = 0) {
    if (!productHandle || productHandle === '') return null;
    
    const maxRetries = 10; // Will keep trying for a long time
    const baseTimeout = 8000; // Start with 8 seconds
    const maxTimeout = 30000; // Max 30 seconds per attempt
    
    // Exponential backoff: 8s, 12s, 18s, 27s, 30s (capped)
    const currentTimeout = Math.min(baseTimeout * Math.pow(1.5, retryAttempt), maxTimeout);
    
    try {
      console.log(LOG_PREFIX, `Fetching BOGO product (attempt ${retryAttempt + 1}):`, productHandle, `(${currentTimeout}ms timeout)`);
      const response = await fetchWithTimeout(`/products/${productHandle}.js`, {}, currentTimeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const productData = await response.json();
      
      // Validate product data structure
      if (!productData || !productData.variants || !Array.isArray(productData.variants)) {
        console.error(LOG_PREFIX, 'Invalid product data structure:', productData);
        throw new Error('Product data missing variants array');
      }
      
      console.log(LOG_PREFIX, '✓ BOGO product fetched successfully:', productData.title, productData.variants.length, 'variants');
      return productData;
    } catch (error) {
      console.warn(LOG_PREFIX, `Fetch attempt ${retryAttempt + 1} failed:`, error.message);
      
      // If we haven't exceeded max retries, try again
      if (retryAttempt < maxRetries) {
        const waitTime = 1000 * (retryAttempt + 1); // 1s, 2s, 3s, 4s...
        console.log(LOG_PREFIX, `Retrying in ${waitTime}ms... (connection may be slow)`);
        await sleep(waitTime);
        return fetchBogoProduct(productHandle, retryAttempt + 1); // Recursive retry
      }
      
      // After all retries exhausted, return null
      console.error(LOG_PREFIX, 'All retry attempts exhausted for BOGO product');
      return null;
    }
  }

  /* BOGO Price Comparison */
  function compareAndSelectVariants(variant1, variant2, bogoCategory) {
    const price1 = variant1.price / 100; // Convert cents to dollars
    const price2 = variant2.price / 100;
    
    let higherPriced, lowerPriced;
    if (price1 >= price2) {
      higherPriced = variant1;
      lowerPriced = variant2;
    } else {
      higherPriced = variant2;
      lowerPriced = variant1;
    }

    console.log(LOG_PREFIX, 'BOGO comparison:', {
      variant1: `${variant1.title} - $${price1}`,
      variant2: `${variant2.title} - $${price2}`,
      selected: `${higherPriced.title} - $${higherPriced.price / 100}`,
      free: `${lowerPriced.title} - $${lowerPriced.price / 100}`,
      category: bogoCategory
    });

    return {
      chargedVariant: higherPriced,
      freeVariant: lowerPriced,
      totalSavings: lowerPriced.price / 100
    };
  }

  /* Gift Card Tracking Inventory (Option 1: hidden tracking variant add)
     Upgraded caching: introduce TTL + forceFresh so we don't hold stale zero inventory. */
  function invalidateTrackingProductCache(handle){
    if(!handle){ return; }
    window.__bogoTrackCache = window.__bogoTrackCache || {};
    if(window.__bogoTrackCache[handle]) delete window.__bogoTrackCache[handle];
  }
  
  // Request deduplication to prevent race conditions
  const pendingTrackingRequests = new Map();
  
  async function fetchProductByHandleCached(handle, opts){
    if(!handle) return null;
    opts = opts || {};
    const ttlMs = opts.ttlMs || 45000; // 45s default TTL to allow near-realtime updates during promos
    const forceFresh = !!opts.forceFresh;
    
    // Check for pending request to prevent race conditions
    const requestKey = `${handle}_${forceFresh}`;
    if (pendingTrackingRequests.has(requestKey)) {
      console.log(LOG_PREFIX, 'fetchProductByHandleCached: reusing pending request for', handle);
      return await pendingTrackingRequests.get(requestKey);
    }
    
    window.__bogoTrackCache = window.__bogoTrackCache || {};
    const entry = window.__bogoTrackCache[handle];
    const now = Date.now();
    if(!forceFresh && entry && (now - entry.fetchedAt) < ttlMs){
      return entry.data;
    }
    
    // Create and cache the promise to prevent duplicate requests
    const fetchPromise = (async () => {
      try {
        const url = `/products/${handle}.js${forceFresh ? ('?fresh=' + now) : ''}`;
        const r = await fetchWithTimeout(url, { cache: forceFresh ? 'no-store' : 'default' }, 6000);
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        
        // Update cache with fresh data
        window.__bogoTrackCache[handle] = { data: j, fetchedAt: now };
        console.log(LOG_PREFIX, 'fetchProductByHandleCached: cached fresh data for', handle);
        
        return j;
      } catch(e){
        console.warn(LOG_PREFIX,'Tracking product fetch failed', handle, e);
        // Return stale data if available, otherwise null
        return entry ? entry.data : null;
      } finally {
        // Always clean up the pending request
        pendingTrackingRequests.delete(requestKey);
      }
    })();
    
    // Cache the promise to prevent race conditions
    pendingTrackingRequests.set(requestKey, fetchPromise);
    
    return await fetchPromise;
  }

  async function getTrackingVariantIdForState(st, btn, opts){
    if(!st || !btn) {
      console.log(LOG_PREFIX, '❌ getTrackingVariantIdForState: Missing state or button', { hasSt: !!st, hasBtn: !!btn });
      return null;
    }
    
    // Establish category / subtype precedence
    let sub = st.giftSubtype || st.__gemsWhiteningChosen || btn.getAttribute('data-bogo-category');
    if(sub === 'gems-whitening'){
      // If still aggregated, attempt to pick by current giftSubtype if set later
      sub = st.giftSubtype || st.__gemsWhiteningChosen; // may be null
    }
    
    console.log(LOG_PREFIX, '🔍 getTrackingVariantIdForState analysis:', {
      buttonId: btn.id,
      stateGiftSubtype: st.giftSubtype,
      stateGemsWhiteningChosen: st.__gemsWhiteningChosen,
      buttonBogoCategory: btn.getAttribute('data-bogo-category'),
      determinedCategory: sub
    });
    
    const map = {
      'piercings': btn.getAttribute('data-bogo-track-piercings'),
      'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
      'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening'),
      'tattoo': btn.getAttribute('data-bogo-track-tattoo')
    };
    
    console.log(LOG_PREFIX, '🔍 Tracking handle map for button', btn.id, ':', map);
    
    const handle = map[sub];
    if(!handle) {
      console.log(LOG_PREFIX, '❌ No tracking handle found for category:', sub);
      return null;
    }
    
    console.log(LOG_PREFIX, '🎯 Using tracking handle:', handle, 'for category:', sub);
    
    const prod = await fetchProductByHandleCached(handle, opts);
    if(!prod || !prod.variants || !prod.variants.length) {
      console.log(LOG_PREFIX, '❌ No product or variants found for handle:', handle);
      return null;
    }
    
    console.log(LOG_PREFIX, '✅ Found tracking product:', {
      handle,
      productTitle: prod.title,
      variantCount: prod.variants.length
    });
    
    // Prefer first variant with inventory_management and quantity > 0; fallback to first
    let variant = prod.variants.find(v=> v.inventory_management && typeof v.inventory_quantity === 'number' && v.inventory_quantity > 0) || prod.variants[0];
    
    console.log(LOG_PREFIX, '✅ Selected tracking variant:', {
      variantId: variant?.id,
      variantTitle: variant?.title,
      productTitle: prod.title
    });
    
    return variant ? variant.id : null;
  }
  function resolveTrackingHandle(btn, category){
    if(!btn) return '';
    const attr = {
      'piercings': 'data-bogo-track-piercings',
      'tooth-gems': 'data-bogo-track-tooth-gems',
      'teeth-whitening': 'data-bogo-track-teeth-whitening',
      'tattoo': 'data-bogo-track-tattoo'
    }[category];
    if(!attr) return '';
    const val = btn.getAttribute(attr) || '';
    // If still empty, attempt raw attribute variant
    const raw = btn.getAttribute(attr + '-raw') || '';
    return val || raw;
  }
  async function diagnosticFetchProduct(handle){
    if(!handle) return;
    try {
      const url = `/products/${handle}.js?trackDiag=${Date.now()}`;
      const resp = await fetchWithTimeout(url, { cache: 'no-store' }, 5000);
      if(!resp.ok){
        console.log(LOG_PREFIX, `[TrackInv][Diag] Product fetch failed`, { handle, status: resp.status });
        return;
      }
      const text = await resp.text();
      let parsed = null; try { parsed = JSON.parse(text); } catch(_e){}
      console.log(LOG_PREFIX, `[TrackInv][Diag] Product fetch success`, { handle, length: text.length, title: parsed?.title, variants: parsed?.variants?.length });
    } catch(e){ console.warn(LOG_PREFIX,'[TrackInv][Diag] diagnostic fetch error', handle, e); }
  }
  async function fetchTrackingRemaining(st, btn, opts){
    try {
      if(!st||!btn) return null;
      // Allow explicit category override for gems-whitening subcategories
      let sub = opts?.category || st.giftSubtype || st.__gemsWhiteningChosen || btn.getAttribute('data-bogo-category');
      if(sub === 'gems-whitening') sub = st.giftSubtype || st.__gemsWhiteningChosen;
      console.log(LOG_PREFIX, 'fetchTrackingRemaining category resolution:', {
        'opts.category': opts?.category,
        'st.giftSubtype': st.giftSubtype,
        'st.__gemsWhiteningChosen': st.__gemsWhiteningChosen,
        'btn bogo-category': btn.getAttribute('data-bogo-category'),
        'resolved sub': sub
      });
      const handleMap = {
        'piercings': btn.getAttribute('data-bogo-track-piercings'),
        'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
        'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening'),
        'tattoo': btn.getAttribute('data-bogo-track-tattoo')
      };
      const handle = handleMap[sub];
      console.log(LOG_PREFIX, 'fetchTrackingRemaining handle lookup:', { sub, handle, handleMap });
      if(!handle) return null;
      // Force fresh when explicitly requested or when we previously saw zero remaining.
      const forceFresh = opts?.forceFresh || st.__trackingRemaining === 0;
      console.log(LOG_PREFIX, 'fetchTrackingRemaining fetching product:', { handle, forceFresh });
      const prod = await fetchProductByHandleCached(handle, { forceFresh });
      console.log(LOG_PREFIX, 'fetchTrackingRemaining product result:', prod ? { handle: prod.handle, variants: prod.variants?.length } : 'NOT_FOUND');
      if(!prod) return null;
      // Sum all variant inventory if multiple; we assume each gift purchase consumes 1 unit total
      let total = 0;
      console.log(LOG_PREFIX, 'fetchTrackingRemaining variant details:', prod.variants?.map(v => ({
        id: v.id,
        title: v.title,
        inventory_quantity: v.inventory_quantity,
        inventory_quantity_type: typeof v.inventory_quantity,
        available: v.available
      })));
      (prod.variants||[]).forEach(v=>{
        // Check multiple inventory sources - inventory_quantity, available flag, or fallback to available inventory
        let qty = v.inventory_quantity;
        
        // If inventory_quantity is not available or null/undefined, check if variant is available
        if (typeof qty !== 'number' || qty === null || qty === undefined) {
          // If variant is marked as available, assume some inventory exists
          if (v.available === true) {
            qty = 1; // Assume at least 1 in stock if marked available
          } else {
            qty = 0; // Not available
          }
        }
        
        const isNumber = typeof qty === 'number';
        const contribution = isNumber ? Math.max(0, qty) : 0;
        console.log(LOG_PREFIX, 'Processing variant:', { id: v.id, qty, isNumber, contribution, available: v.available, originalQty: v.inventory_quantity });
        if(isNumber) total += contribution;
      });
      
      // Fallback to liquid total if API variants don't have proper inventory data
      if (total === 0 || prod.variants?.every(v => typeof v.inventory_quantity !== 'number')) {
        console.log(LOG_PREFIX, 'API inventory data incomplete, checking liquid total fallback');
        
        // Try to get liquid total from button attributes based on category
        let liquidTotalAttr = null;
        if (sub === 'tattoo') {
          liquidTotalAttr = btn.getAttribute('data-bogo-tattoo-liquid-total');
        } else if (sub === 'piercings') {
          liquidTotalAttr = btn.getAttribute('data-bogo-piercings-liquid-total');
        } else if (sub === 'tooth-gems') {
          liquidTotalAttr = btn.getAttribute('data-bogo-tooth-gems-liquid-total');
        } else if (sub === 'teeth-whitening') {
          liquidTotalAttr = btn.getAttribute('data-bogo-teeth-whitening-liquid-total');
        }
        
        if (liquidTotalAttr) {
          const liquidTotal = parseInt(liquidTotalAttr, 10);
          if (!isNaN(liquidTotal) && liquidTotal >= 0) {
            console.log(LOG_PREFIX, 'Using liquid total fallback:', { sub, liquidTotal, apiTotal: total });
            total = liquidTotal;
          }
        }
      }
      
      console.log(LOG_PREFIX, 'fetchTrackingRemaining final result:', { total, cached: st.__trackingRemaining });
      
      // Store result in category-specific cache for gems-whitening
      if (sub === 'tooth-gems' || sub === 'teeth-whitening') {
        st[`__trackingRemaining_${sub}`] = total;
      } else {
        st.__trackingRemaining = total; // legacy cache
      }
      
      return total;
    } catch(e){ console.warn(LOG_PREFIX,'fetchTrackingRemaining failed', e); return null; }
  }
  function getAnyOpenMeetyPopup(){ return document.querySelector('.popup-content.meety-popover-content[role="tooltip"]'); }
  function getMeetyOverlay(){ return document.querySelector('.popup-overlay.meety-popover-overlay'); }
  const anyOverlayOpen = () => Array.from(document.querySelectorAll('[id^="meety-popup-overlay-"]')).some(el => el.style.display !== 'none');

  /* Display registry */
  const displayRegistry = new Map();
  function setTempDisplay(el, value){ if (!displayRegistry.has(el)) displayRegistry.set(el, el.getAttribute('style')); el.style.display = value; }
  function restoreAllDisplays(){ for (const [el, prev] of displayRegistry.entries()){ if (!el) continue; if (prev == null) el.removeAttribute('style'); else el.setAttribute('style', prev); } displayRegistry.clear(); }

  /* Hide calendars outside overlays */
  function isInsideOurOverlay(el){ return !!el.closest('.meety-step-calendar'); }
  function hideAllCalendarsOutsideOverlays(){
    document.querySelectorAll('.meety-inline-widget').forEach(w => { if (!isInsideOurOverlay(w)) w.style.display = 'none'; });
  }
  
  // Enhanced global widget cleanup function
  function forceCleanupAllMeetyElements() {
    console.log(LOG_PREFIX, 'forceCleanupAllMeetyElements: performing global cleanup');
    
    // Hide all widgets outside our overlays
    hideAllCalendarsOutsideOverlays();
    
    // Remove all Meety popups and overlays
    document.querySelectorAll('.popup-content.meety-popover-content, .popup-overlay.meety-popover-overlay').forEach(el => {
      try {
        if (el.style.display !== 'none') {
          el.style.display = 'none';
        }
        // Try to remove if it's not being used
        if (!el.closest('[id^="meety-popup-overlay-"]')) {
          el.remove();
        }
      } catch(e) {
        console.warn(LOG_PREFIX, 'Failed to cleanup Meety element:', e);
      }
    });
    
    // Clean up any orphaned Meety elements
    document.querySelectorAll('[class*="meety-popover"], [class*="popup-content"][role="tooltip"]').forEach(el => {
      if (!el.closest('[id^="meety-popup-overlay-"]') && !isInsideOurOverlay(el)) {
        try {
          el.style.display = 'none';
          el.remove();
        } catch(e) {}
      }
    });
    
    // Restore original displays for any displaced widgets
    restoreAllDisplays();
  }
  hideAllCalendarsOutsideOverlays();
  requestAnimationFrame(hideAllCalendarsOutsideOverlays);
  setTimeout(hideAllCalendarsOutsideOverlays, 400);

  const moInitialHide = new MutationObserver(muts => {
    if (anyOverlayOpen()) return;
    for (const m of muts){
      for (const n of m.addedNodes){
        if (n && n.nodeType === 1){
          if (n.matches?.('.meety-inline-widget') && !isInsideOurOverlay(n)) n.style.display = 'none';
          n.querySelectorAll?.('.meety-inline-widget')?.forEach(el => { if (!isInsideOurOverlay(el)) el.style.display = 'none'; });
        }
      }
    }
  });
  moInitialHide.observe(document.documentElement, { childList:true, subtree:true });

  /* Widget matching */
  function widgetMatches(widgetEl, btnData){
    const wJson = parseJSONSafe(widgetEl.getAttribute('meety-data'));
    if (!wJson) return false;
    const sameTemplate  = String(wJson.template)        === String(btnData.template);
    const sameAssigned  = String(wJson.assignedProduct) === String(btnData.assignedProduct);
    const sameProduct   = String(wJson.productId)       === String(btnData.productId);
    const bothNoVariant = (wJson.variantId == null && btnData.variantId == null);
    const sameVariant   = String(wJson.variantId)       === String(btnData.variantId);
    return sameTemplate && sameAssigned && sameProduct && (bothNoVariant || sameVariant);
  }
  
  /* Enhanced widget matching for BOGO - more flexible variant matching */
  function widgetMatchesFlexible(widgetEl, btnData){
    const wJson = parseJSONSafe(widgetEl.getAttribute('meety-data'));
    if (!wJson) return false;
    const sameTemplate  = String(wJson.template)        === String(btnData.template);
    const sameAssigned  = String(wJson.assignedProduct) === String(btnData.assignedProduct);
    const sameProduct   = String(wJson.productId)       === String(btnData.productId);
    
    // For BOGO scenarios, we're more flexible with variant matching
    // If the template, assigned product, and product ID match, we consider it a match
    // even if variants differ (since BOGO modifies the variant)
    return sameTemplate && sameAssigned && sameProduct;
  }
  function findImmediateByJson(btnData){
    return Array.from(document.querySelectorAll('.meety-inline-widget')).find(el => widgetMatches(el, btnData)) || null;
  }
  function findClosestByProduct(btnData){
    const cands = Array.from(document.querySelectorAll('.meety-inline-widget')).filter(el=>{
      const j = parseJSONSafe(el.getAttribute('meety-data'));
      return j && String(j.productId) === String(btnData.productId);
    });
    if (!cands.length) return null;
    const center = window.innerHeight / 2;
    let best = cands[0], bestDist = Math.abs((best.getBoundingClientRect().top||0)-center);
    for (const el of cands){
      const d = Math.abs((el.getBoundingClientRect().top||0)-center);
      if (d < bestDist){ best = el; bestDist = d; }
    }
    return best;
  }
  async function findOrWaitMatchingWidget(btnData, timeoutMs=8000, isBogoFlow=false){
    console.log(LOG_PREFIX, 'findOrWaitMatchingWidget: start', btnData, 'timeoutMs', timeoutMs, 'isBogoFlow', isBogoFlow);
    
    // Try exact match first
    let el = findImmediateByJson(btnData);
    if (el) { console.log(LOG_PREFIX, 'Immediate exact widget match found'); return el; }
    
    // For non-BOGO flows, try product-based fallback immediately since widgets should exist
    if (!isBogoFlow) {
      el = findClosestByProduct(btnData);
      if (el) {
        console.log(LOG_PREFIX, 'Immediate product-based widget match found for non-BOGO flow');
        return el;
      }
    }
    
    // For BOGO flows, try flexible matching (ignores variant differences)
    if (isBogoFlow) {
      el = Array.from(document.querySelectorAll('.meety-inline-widget')).find(widget => widgetMatchesFlexible(widget, btnData));
      if (el) { 
        console.log(LOG_PREFIX, 'BOGO flexible widget match found'); 
        return el; 
      }
    }
    
    // Use conservative timeouts - most widgets should be found immediately
    const actualTimeout = isBogoFlow ? Math.min(timeoutMs, 2000) : Math.min(timeoutMs, 1500);
    
    return await new Promise(resolve=>{
      let resolved = false;
      const done = (node)=>{ if (resolved) return; resolved=true; clearTimeout(timer); obs.disconnect(); resolve(node); };
      const obs = new MutationObserver(muts=>{
        for (const m of muts){
          for (const n of m.addedNodes){
            if (n && n.nodeType===1){
              // Try exact match first
              if (n.matches?.('.meety-inline-widget') && widgetMatches(n, btnData)) return done(n);
              const q = n.querySelector?.('.meety-inline-widget');
              if (q && widgetMatches(q, btnData)) return done(q);
              
              // For BOGO, try flexible match
              if (isBogoFlow) {
                if (n.matches?.('.meety-inline-widget') && widgetMatchesFlexible(n, btnData)) return done(n);
                const qFlex = n.querySelector?.('.meety-inline-widget');
                if (qFlex && widgetMatchesFlexible(qFlex, btnData)) return done(qFlex);
              }
            }
          }
        }
      });
      obs.observe(document.documentElement, { childList:true, subtree:true });
      const timer = setTimeout(()=>{ if (resolved) return; obs.disconnect(); const fallback = findClosestByProduct(btnData) || null; console.log(LOG_PREFIX, 'Widget wait timeout; fallback', !!fallback); resolve(fallback); }, actualTimeout);
    });
  }
  function getServiceTriggerIn(widgetEl){ return widgetEl.querySelector('[aria-describedby^="popup-"]'); }

  /* Overlay state */
  const states = window.__meetyBogo.states; // Use namespaced states

  function buildOverlayForButton(btn){
    return ErrorBoundary.safeSync(() => {
      const btnId = btn.id;
      const overlayId = `meety-popup-overlay-${btnId}`;
      
      // Session isolation: Check for conflicts when opening a new artist session
      const newCategory = btn.getAttribute('data-bogo-category');
      const bogoConflicts = checkBogoContextConflicts(btn, newCategory);
      
      if (bogoConflicts.warnings.length > 0) {
        console.warn(LOG_PREFIX, 'BOGO context conflicts detected:', bogoConflicts.warnings);
        // Clear conflicting context to prevent issues
        clearBogoContext('Artist change detected');
        clearTrackingCache(); // Clear tracking cache to get fresh inventory
      }
      
      // Validate existing cart state for potential conflicts
      validateCartForNewSession(btnId, newCategory).then(validation => {
        if (validation.warnings.length > 0) {
          console.warn(LOG_PREFIX, 'Cart validation warnings for new session:', validation.warnings);
        }
      });
      
      if (document.getElementById(overlayId)) return states.get(btnId);

    const chooserTitleTxt = btn.getAttribute('data-chooser-title') || 'What kind of services would you like?';
    const chooserNoteTxt  = btn.getAttribute('data-chooser-note')  || '#';
    const serviceTitleTxt = btn.getAttribute('data-service-title') || 'Select service to continue';
    const serviceNoteTxt  = btn.getAttribute('data-service-note')  || 'Pick a service above.';

    const overlay = document.createElement('div'); overlay.id = overlayId; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    Object.assign(overlay.style, { position:'fixed', inset:'0', display:'none', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.6)', zIndex:10000 });

    const container = document.createElement('div'); container.id = `meety-popup-container-${btnId}`;
    Object.assign(container.style, { background:'#fff', borderRadius:'8px', maxWidth:'900px', width:'92%', maxHeight:'85vh', overflow:'hidden', boxShadow:'0 10px 30px rgba(0,0,0,.25)' });

    const header = document.createElement('div'); header.id = `meety-popup-header-${btnId}`; header.style.cssText = 'display:flex;justify-content:flex-end;border-bottom:1px solid #eee;padding:.5rem .75rem;';
    const close = document.createElement('button'); close.id = `meety-popup-close-${btnId}`; close.textContent = '×'; close.setAttribute('aria-label','Close popup');
    close.style.cssText = 'background:none;border:none;font-size:1.5rem;cursor:pointer;line-height:1;padding:.25rem .5rem;';
    header.appendChild(close);

    const body = document.createElement('div'); body.id = `meety-popup-body-${btnId}`; body.style.cssText = 'padding:1rem;overflow:auto;max-height:calc(85vh - 50px);';

    // Create AbortController for proper event listener cleanup
    const abortController = new AbortController();
    const signal = abortController.signal;

    // Step -1: Main Service Type Selector 
    const stepMainChooser = document.createElement('div'); stepMainChooser.id = `meety-step-main-chooser-${btnId}`; stepMainChooser.className = 'meety-step meety-step-chooser'; stepMainChooser.style.display='none';
    
    // Dynamic service type selector will be built by renderMainServiceChooser function

    // Step 0
    const stepChooser = document.createElement('div'); stepChooser.id = `meety-step-chooser-${btnId}`; stepChooser.className = 'meety-step meety-step-chooser'; stepChooser.style.display='none';
    const chooserTitle = document.createElement('h3'); chooserTitle.id = `meety-chooser-title-${btnId}`; chooserTitle.textContent = chooserTitleTxt; chooserTitle.style.color = '#000';
    const chooserRow = document.createElement('div'); chooserRow.id = `meety-chooser-row-${btnId}`; chooserRow.className = 'meety-chooser-row';
    const chooserNote = document.createElement('div'); chooserNote.id = `meety-chooser-note-${btnId}`; chooserNote.className='meety-note'; chooserNote.textContent = chooserNoteTxt;
    stepChooser.append(chooserTitle, chooserRow, chooserNote);

    // Step 1
    const stepService = document.createElement('div'); stepService.id = `meety-step-service-${btnId}`; stepService.className = 'meety-step meety-step-service'; stepService.style.display='none';
    const h3 = document.createElement('h3'); h3.id = `meety-service-title-${btnId}`; h3.textContent = serviceTitleTxt; h3.style.color = '#000';
    const menuSlot = document.createElement('div'); menuSlot.id = `meety-menu-slot-${btnId}`; menuSlot.className = 'menu-slot';
    const note = document.createElement('div'); note.className = 'meety-note'; note.id = `meety-service-note-${btnId}`; note.textContent = serviceNoteTxt;
    stepService.append(h3, menuSlot, note);

    // Step 1.5: BOGO First Service Selection
    const stepBogoFirst = document.createElement('div'); stepBogoFirst.id = `meety-step-bogo-first-${btnId}`; stepBogoFirst.className = 'meety-step meety-step-bogo'; stepBogoFirst.style.display='none';
    stepBogoFirst.innerHTML = `
      <h3>Select Your First Service</h3>
      <p class="bogo-explanation"></p>
      <div class="bogo-service-selection">
        <div class="menu-slot" id="bogo-first-menu-slot-${btnId}"></div>
      </div>
    `;

    // Step 1.6: BOGO Second Service Selection
    const stepBogoSecond = document.createElement('div'); stepBogoSecond.id = `meety-step-bogo-second-${btnId}`; stepBogoSecond.className = 'meety-step meety-step-bogo'; stepBogoSecond.style.display='none';
    stepBogoSecond.innerHTML = `
      <h3>Select Your Second Service</h3>
      <p class="bogo-explanation-second"></p>
      <div class="bogo-service-selection">
        <div class="menu-slot" id="bogo-second-menu-slot-${btnId}"></div>
        <div class="bogo-pricing-display" style="display:none; margin-top: 16px;">
          <div class="bogo-price-breakdown"></div>
          <button class="meety-continue-btn primary bogo-continue-btn">Continue with Selection</button>
        </div>
        <div style="text-align: center; margin-top: 10px;">
          <button class="gift-card-btn secondary back-btn bogo-back-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back to First Service
          </button>
        </div>
      </div>
    `;

    // Step 1.7: BOGO Summary (Your Selection)
    const stepBogoSummary = document.createElement('div'); stepBogoSummary.id = `meety-step-bogo-summary-${btnId}`; stepBogoSummary.className = 'meety-step meety-step-bogo'; stepBogoSummary.style.display='none';
    // (Tooth Gems only) BOGO Third Service Selection (for Buy One Get Two Free)
    const stepBogoThird = document.createElement('div'); stepBogoThird.id = `meety-step-bogo-third-${btnId}`; stepBogoThird.className = 'meety-step meety-step-bogo'; stepBogoThird.style.display='none';
    stepBogoThird.innerHTML = `
      <h3>Select Your Third Gem Service</h3>
      <p class="bogo-explanation-third">You have two selected. Pick your final free gem service (you pay for the highest-priced overall).</p>
      <div class="bogo-service-selection">
        <div class="menu-slot" id="bogo-third-menu-slot-${btnId}"></div>
        <div class="bogo-pricing-display" style="display:none; margin-top: 16px;">
          <div class="bogo-price-breakdown"></div>
          <button class="meety-continue-btn primary bogo-third-continue-btn">Continue with Selection</button>
        </div>
        <div style="text-align: center; margin-top: 10px;">
          <button class="gift-card-btn secondary back-btn bogo-third-back-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back to Second Service
          </button>
        </div>
      </div>`;
    stepBogoSummary.innerHTML = `
      <h3 class="bogo-summary-heading" style="color: #333; text-align: center; margin-bottom: 20px;">Your Selection</h3>
      <div class="bogo-final-summary" style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div class="selected-services"></div>
        <div class="pricing-summary"></div>
      </div>
      <div style="text-align: center;">
        <button class="meety-continue-btn primary bogo-book-btn">Book Appointment</button>
        <div style="margin-top: 10px;">
          <button class="gift-card-btn secondary back-btn bogo-summary-back-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back to Service Selection
          </button>
        </div>
      </div>
    `;

    // Step 2
    const stepCalendar = document.createElement('div'); stepCalendar.id = `meety-step-calendar-${btnId}`; stepCalendar.className = 'meety-step meety-step-calendar'; stepCalendar.style.display='none';

    // Gift Purchase Step (final recipient details)
  // Tooth Gem Gift Multi-Step (3 selection/refinement steps before form)
  const stepGiftGemsOne = document.createElement('div'); stepGiftGemsOne.id = `meety-step-gift-gems-1-${btnId}`; stepGiftGemsOne.className = 'meety-step meety-step-gift-gems'; stepGiftGemsOne.style.display='none';
  const stepGiftGemsTwo = document.createElement('div'); stepGiftGemsTwo.id = `meety-step-gift-gems-2-${btnId}`; stepGiftGemsTwo.className = 'meety-step meety-step-gift-gems'; stepGiftGemsTwo.style.display='none';
  const stepGiftGemsThree = document.createElement('div'); stepGiftGemsThree.id = `meety-step-gift-gems-3-${btnId}`; stepGiftGemsThree.className = 'meety-step meety-step-gift-gems'; stepGiftGemsThree.style.display='none';
  stepGiftGemsOne.innerHTML = `<h3 style="margin-top:0;">Choose Gem Style</h3><div class="gems-style-options"></div><div class="gems-nav" style="text-align:center;margin-top:14px;"><button class="gift-card-btn primary gems1-continue" disabled>Continue</button><div style="margin-top:8px;"><button class="gift-card-btn secondary gems1-cancel">Cancel</button></div></div>`;
  stepGiftGemsTwo.innerHTML = `<h3 style="margin-top:0;">Select Placement</h3><div class="gems-placement-options"></div><div class="gems-nav" style="text-align:center;margin-top:14px;"><button class="gift-card-btn secondary gems2-back">Back</button> <button class="gift-card-btn primary gems2-continue" disabled>Continue</button></div>`;
  stepGiftGemsThree.innerHTML = `<h3 style="margin-top:0;">Confirm Gem Selection</h3><div class="gems-summary-box" style="background:#f6f7f9;padding:12px 14px;border:1px solid #e2e6ea;border-radius:8px;font-size:13px;line-height:1.4;"></div><div style="text-align:center;margin-top:16px;"><button class="gift-card-btn secondary gems3-back">Back</button> <button class="gift-card-btn primary gems3-finish">Continue to Gift Details</button></div>`;

  // NEW whitening gift summary step for unified flow
  const stepGiftWhiteningSummary = document.createElement('div');
  stepGiftWhiteningSummary.id = `meety-step-gift-whitening-summary-${btnId}`;
  stepGiftWhiteningSummary.className = 'meety-step meety-step-gift-whitening';
  stepGiftWhiteningSummary.style.display='none';
  stepGiftWhiteningSummary.innerHTML = `
    <h3 style="margin-top:0;">Confirm Teeth Whitening Gift</h3>
    <div class="whitening-summary-box" style="background:#f6f7f9;padding:12px 14px;border:1px solid #e2e6ea;border-radius:8px;font-size:13px;line-height:1.45;">
      <p style="margin:0 0 6px;">You're creating a <strong>Teeth Whitening</strong> gift card. The recipient can choose an available whitening session when redeeming.</p>
      <p style="margin:0;font-size:12px;color:#666;">Add any special notes in the next step.</p>
    </div>
    <div style="text-align:center;margin-top:16px;">
      <button class="gift-card-btn secondary whitening-summary-back">Back</button>
      <button class="gift-card-btn primary whitening-summary-continue">Continue to Gift Details</button>
    </div>`;

  const stepGiftPurchase = document.createElement('div'); stepGiftPurchase.id = `meety-step-gift-purchase-${btnId}`; stepGiftPurchase.className = 'meety-step meety-step-gift-purchase'; stepGiftPurchase.style.display='none';
    stepGiftPurchase.innerHTML = `
      <h3 style="color: #333; margin-bottom: 8px;">🎁 Gift Card Purchase</h3>
      <p style="color: #666; font-size: 14px; margin-bottom: 24px; line-height: 1.5;">
        Purchase a gift card for someone special. After you complete checkout, they'll receive <strong>two emails</strong>: 
        one welcome email from us, and one from Shopify with their gift card redemption code.
      </p>
      <div class="gift-form" style="display: flex; flex-direction: column; gap: 18px;">
        <div class="form-group">
          <label for="gift-card-type-${btnId}" style="display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px;">
            Gift Card Type <span style="color: #e74c3c;">*</span>
          </label>
          <select 
            id="gift-card-type-${btnId}" 
            name="gift-card-type" 
            required
            style="width: 100%; padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; transition: border-color 0.2s ease; cursor: pointer;"
            onfocus="this.style.borderColor='#667eea'; this.style.outline='none';"
            onblur="this.style.borderColor='#e0e0e0';"
          >
            <option value="">Select gift card service...</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="recipient-name-${btnId}" style="display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px;">
            Recipient's Full Name <span style="color: #e74c3c;">*</span>
          </label>
          <input 
            type="text" 
            id="recipient-name-${btnId}" 
            name="recipient-name" 
            placeholder="e.g., Sarah Johnson"
            required
            autocomplete="name"
            style="width: 100%; padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s ease;"
            onfocus="this.style.borderColor='#667eea'; this.style.outline='none';"
            onblur="this.style.borderColor='#e0e0e0';"
          >
          <small style="display: block; color: #999; font-size: 12px; margin-top: 4px;">
            Who will be receiving this gift card?
          </small>
        </div>
        
        <div class="form-group">
          <label for="recipient-email-${btnId}" style="display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px;">
            Recipient's Email <span style="color: #e74c3c;">*</span>
          </label>
          <input 
            type="email" 
            id="recipient-email-${btnId}" 
            name="recipient-email" 
            placeholder="sarah@example.com"
            required
            autocomplete="email"
            style="width: 100%; padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s ease;"
            onfocus="this.style.borderColor='#667eea'; this.style.outline='none';"
            onblur="this.style.borderColor='#e0e0e0';"
          >
          <small style="display: block; color: #999; font-size: 12px; margin-top: 4px;">
            📧 We'll send them a welcome email with booking instructions
          </small>
        </div>
        
        <div class="form-group">
          <label for="recipient-phone-${btnId}" style="display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px;">
            Recipient's Phone <span style="color: #e74c3c;">*</span>
          </label>
          <input 
            type="tel" 
            id="recipient-phone-${btnId}" 
            name="recipient-phone" 
            placeholder="(555) 123-4567"
            required
            autocomplete="tel"
            pattern="[0-9\\s\\(\\)\\-\\+]+"
            style="width: 100%; padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s ease;"
            onfocus="this.style.borderColor='#667eea'; this.style.outline='none';"
            onblur="this.style.borderColor='#e0e0e0';"
          >
          <small style="display: block; color: #999; font-size: 12px; margin-top: 4px;">
            📱 For appointment reminders and booking confirmation
          </small>
        </div>

        <div class="form-group" style="margin-top: 8px;">
          <label for="gift-message-${btnId}" style="display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px;">
            Personal Message <span style="color: #999; font-weight: 400;">(Optional)</span>
          </label>
          <textarea 
            id="gift-message-${btnId}" 
            name="gift-message"
            placeholder="Add a personal note for the recipient... (optional)"
            rows="3"
            maxlength="250"
            style="width: 100%; padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s ease; resize: vertical; font-family: inherit;"
            onfocus="this.style.borderColor='#667eea'; this.style.outline='none';"
            onblur="this.style.borderColor='#e0e0e0';"
          ></textarea>
          <small style="display: block; color: #999; font-size: 12px; margin-top: 4px;">
            💌 Add a heartfelt message (max 250 characters)
          </small>
        </div>
        
        <div style="background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px; margin-top: 4px;">
          <div style="display: flex; align-items: start; gap: 10px;">
            <span style="font-size: 18px;">📧</span>
            <div style="flex: 1;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #555; line-height: 1.5;">
                <strong>What happens after checkout?</strong>
              </p>
              <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #666; line-height: 1.6;">
                <li><strong>Email 1 (Immediately):</strong> Welcome email from Sideshow with booking instructions</li>
                <li><strong>Email 2 (After payment):</strong> Gift card email from Shopify with redemption code</li>
                <li>Both emails go to the recipient's email address you entered above</li>
                <li>You'll receive a separate order confirmation with gift card receipt</li>
                <li>Gift card expires January 31, 2026</li>
              </ul>
              <div style="margin-top: 8px; padding: 8px; background: #fff; border-left: 3px solid #667eea; font-size: 11px; color: #555;">
                💡 <strong>Tip:</strong> The recipient will see your personal message (if added) in the Shopify gift card email along with the redemption code.
              </div>
            </div>
          </div>
        </div>
        
        <button 
          class="add-to-cart-btn" 
          id="add-to-cart-${btnId}"
          style="width: 100%; padding: 16px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);"
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.4)';"
          onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)';"
        >
          🎁 Add Gift Card to Cart
        </button>
      </div>
    `;

    // Piercing Gift Step 1 (first piercing selection)
    const stepGiftPiercingFirst = document.createElement('div'); stepGiftPiercingFirst.id = `meety-step-gift-piercing-first-${btnId}`; stepGiftPiercingFirst.className = 'meety-step meety-step-bogo'; stepGiftPiercingFirst.style.display='none';
    stepGiftPiercingFirst.innerHTML = `
      <h3 style="margin-bottom:10px;">Gift Card – First Piercing</h3>
      <p style="font-size:13px;color:#666;margin:0 0 14px;">Select the first piercing to lock onto this gift card. You'll pick a second next.</p>
      <div class="menu-slot" id="gift-piercing-first-slot-${btnId}"></div>
    `;
    // Piercing Gift Step 2
  const stepGiftPiercingSecond = document.createElement('div'); stepGiftPiercingSecond.id = `meety-step-gift-piercing-second-${btnId}`; stepGiftPiercingSecond.className = 'meety-step meety-step-bogo'; stepGiftPiercingSecond.style.display='none';
    stepGiftPiercingSecond.innerHTML = `
      <h3 style="margin-bottom:10px;">Gift Card – Second Piercing</h3>
      <p style="font-size:13px;color:#666;margin:0 0 14px;">Select the second piercing (or repeat). After this you'll enter recipient details.</p>
      <div class="menu-slot" id="gift-piercing-second-slot-${btnId}"></div>
      <div style="text-align:center;margin-top:12px;">
        <button type="button" class="gift-card-btn secondary back-btn gift-goto-first" style="font-size:12px;padding:6px 10px;">
          <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M15 18l-6-6 6-6\"/></svg>
          Back
        </button>
      </div>
    `;

    /* NEW: Tattoo Gift Hours Step (purchase + redemption) */
  /* NEW: Dedicated BOGO Category Step (so animations work instead of reusing chooser) */
  const stepBogoCategory = document.createElement('div');
  stepBogoCategory.id = `meety-step-bogo-category-${btnId}`;
  stepBogoCategory.className = 'meety-step meety-step-bogo-category';
  stepBogoCategory.style.display = 'none';
  addDevInfo(stepBogoCategory, 'BOGO Category (Container Initialized)', 'awaiting population');
    const stepTattooHours = document.createElement('div');
    stepTattooHours.id = `meety-step-tattoo-hours-${btnId}`;
    stepTattooHours.className = 'meety-step meety-step-tattoo-hours';
    stepTattooHours.style.display = 'none';
    stepTattooHours.innerHTML = `
      <h3 style="text-align:center;margin:0 0 14px;">Select Tattoo Hours</h3>
      <p style="font-size:13px;color:#555;margin:0 0 18px;text-align:center;">
        Choose how many hours you are buying or redeeming. (Promo doubles session time automatically.)
      </p>
      <div class="tattoo-hours-options" style="display:flex;flex-direction:column;gap:14px;max-width:520px;margin:0 auto;"></div>
      <div style="text-align:center;margin-top:8px;">
        <button type="button" class="gift-card-btn secondary back-btn tattoo-hours-back-btn" style="font-size:.8rem;padding:6px 14px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Back
        </button>
      </div>
    `;
    addDevInfo(stepTattooHours, 'Tattoo Hours Chooser', 'showTattooGiftHourChooser(mode)');

    // Redeem Step (Simplified existing gift flow — no code entry here)
    const stepRedeem = document.createElement('div'); stepRedeem.id = `meety-step-redeem-${btnId}`; stepRedeem.className = 'meety-step meety-step-redeem'; stepRedeem.style.display='none';
    stepRedeem.innerHTML = `
      <h3>I Already Have a Gift Card</h3>
      <p>Select the session length covered by your gift card. You'll apply the code later at checkout.</p>
      <div class="redeem-form"></div>
    `;

  const fees = document.createElement('div'); fees.className = 'meety-fees-disclaimer'; fees.id = `meety-fees-${btnId}`; fees.textContent = ''; fees.style.display='none';

  // Card authorization notice footer
  const cardNotice = document.createElement('div');
  cardNotice.className = 'meety-card-notice';
  cardNotice.id = `meety-card-notice-${btnId}`;
  cardNotice.style.cssText = 'margin-top:20px;padding:12px 16px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;color:#666;line-height:1.5;text-align:center;';
  
  // Build dynamic fee text from downpayment config (if available)
  let feeText = 'A card processing fee will be added.';
  if (window.__meetyDownpayConfig?.percent && window.__meetyDownpayConfig?.flat) {
    feeText = `A ${window.__meetyDownpayConfig.percent}% + $${window.__meetyDownpayConfig.flat.toFixed(2)} card processing fee will be added.`;
  } else if (window.__meetyDownpayConfig?.percent) {
    feeText = `A ${window.__meetyDownpayConfig.percent}% card processing fee will be added.`;
  }
  
  cardNotice.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
        <line x1="1" y1="10" x2="23" y2="10"></line>
      </svg>
      <span style="font-weight:500;color:#555;" class="meety-card-fee-notice">${feeText}</span>
    </div>
  `;

  // Instagram Explanation Step (No-Calendar Mode)
  const stepInstagram = document.createElement('div');
  stepInstagram.id = `meety-step-instagram-${btnId}`;
  stepInstagram.className = 'meety-step meety-step-instagram';
  stepInstagram.style.display = 'none';

  body.append(stepMainChooser, stepChooser, stepBogoCategory, stepService, stepBogoFirst, stepBogoSecond, stepBogoThird, stepBogoSummary, stepCalendar, stepGiftPiercingFirst, stepGiftPiercingSecond, stepTattooHours, stepGiftGemsOne, stepGiftGemsTwo, stepGiftGemsThree, stepGiftWhiteningSummary, stepGiftPurchase, stepRedeem, stepInstagram, fees, cardNotice);
    container.append(header, body); overlay.appendChild(container); document.body.appendChild(overlay);

    const state = {
      overlay, container, body,
      stepMainChooser, stepChooser, chooserRow, chooserTitle, chooserNote,
  stepService, stepBogoCategory, stepBogoFirst, stepBogoSecond, stepBogoThird, stepBogoSummary, stepCalendar, stepGiftPiercingFirst, stepGiftPiercingSecond, stepTattooHours, stepGiftGemsOne, stepGiftGemsTwo, stepGiftGemsThree, stepGiftWhiteningSummary, stepGiftPurchase, stepRedeem, stepInstagram, menuSlot, serviceTitle: h3, serviceNote: note,
      fees, active: null,
  serviceUiMode: (btn.getAttribute('data-service-ui')||'buttons').toLowerCase(),
  cal1Parser: (btn.getAttribute('data-cal1-parser')||btn.getAttribute('data-service-ui')||'buttons').toLowerCase(),
  cal2Parser: (btn.getAttribute('data-cal2-parser')||btn.getAttribute('data-service-ui')||'buttons').toLowerCase(),
      piercingCatsRaw: (btn.getAttribute('data-piercing-cats')||'Ear|Facial|Oral|Body|Vulvar|Penile'),
      promoMode: (btn.getAttribute('data-piercing-promo-mode')||'off').toLowerCase(),
      promoKeysRaw: (btn.getAttribute('data-piercing-promo-keys')||'#'),
  promoEnabled: (btn.getAttribute('data-promo-enabled') === 'true'),
      bogoFirstSelection: null,
      bogoSecondSelection: null,
  bogoThirdSelection: null,
  giftPiercingFirstSelection: null,
  giftPiercingSecondSelection: null,
  /* Tattoo gift state */
  pendingTattooGiftVariant: null,
  tattooGiftPurchaseHours: null,
  tattooGiftPurchaseLabel: null,
  giftGems: null,
  giftSubtype: null,
  giftWhitening: null,
  giftFlowStage: null
    };
    state.button = btn;
    state.btnId = btnId;
    state.abortController = abortController; // Store for cleanup
    // Initialize navigation history for consistent back button behavior
    state.navigationHistory = [];
    state.currentStepId = null;
    states.set(btnId, state);

  // Attach reference for downstream property enrichment
  try { overlay.meetyState = state; } catch(e) { console.warn(LOG_PREFIX, 'overlay.meetyState attach failed', e); }

    // Use AbortController for proper event listener cleanup
    close.addEventListener('click', () => closeOverlay(btnId), { signal });
    // Removed overlay click-to-close to prevent accidental dismissal
    // overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeOverlay(btnId); });
  const escHandler = (e)=>{ const open = overlay.style.display!=='none'; if (open && e.key==='Escape') closeOverlay(btnId); };
  document.addEventListener('keydown', escHandler, { signal });
  state._escHandler = escHandler;



    return state;
    }, 'buildOverlayForButton', null);
  }
  function openOverlay(btnId){ 
    const st = states.get(btnId); 
    
    // Validate state before opening
    const validation = StateValidator.validateOverlayState(st, 'openOverlay');
    if (!validation.valid) {
      console.error(LOG_PREFIX, 'Cannot open overlay - state validation failed:', validation.errors);
      return;
    }
    
    // Additional null safety check for overlay element
    if (!st.overlay) {
      console.error(LOG_PREFIX, 'Cannot open overlay - overlay element is null');
      return;
    }
    
    // Clean up any stray widgets before opening
    forceCleanupAllMeetyElements();
    
    st.overlay.style.display = 'flex'; 
    st.overlay.classList.add('open'); 
    document.documentElement.style.overflow='hidden'; 
  }
  function closeOverlay(btnId){
    const st = states.get(btnId);
    if(!st) return;
    
    console.log(LOG_PREFIX, 'closeOverlay: starting cleanup for', btnId);
    
    cleanupActive(st);
    st.overlay.classList.remove('open');
    st.overlay.style.display = 'none';
    document.documentElement.style.overflow='';
    try { resetOverlayState(st); } catch(e){ console.warn(LOG_PREFIX, 'resetOverlayState error', e); }
    
    // Enhanced cleanup with global widget cleanup
    setTimeout(() => {
      forceCleanupAllMeetyElements();
    }, 100);
    
    // Deep destroy after reset so a brand new overlay & listeners are created next open.
    // This avoids leftover detached handlers or partially cleaned dynamic nodes.
    setTimeout(() => {
      try { destroyOverlay(btnId); } catch(e){ console.warn(LOG_PREFIX, 'destroyOverlay error', e); }
    }, 250);
  }

  function destroyOverlay(btnId){
    const st = states.get(btnId);
    if(!st) return;
    
    console.log(LOG_PREFIX, 'destroyOverlay: cleaning up for button', btnId);
    
    // Enhanced cleanup before destroying overlay
    try {
      cleanupActive(st);
    } catch(e) {
      console.warn(LOG_PREFIX, 'cleanupActive failed during destroy:', e);
    }
    
    // Use AbortController to clean up all event listeners
    if (st.abortController) {
      try {
        st.abortController.abort();
        console.log(LOG_PREFIX, 'AbortController cleanup completed for', btnId);
      } catch(e) {
        console.warn(LOG_PREFIX, 'AbortController cleanup failed:', e);
      }
    }
    
    // Legacy cleanup for _escHandler (if AbortController fails)
    try {
      if(st._escHandler){ document.removeEventListener('keydown', st._escHandler); }
    } catch(e){}
    
    // Clean up any event listeners or timers associated with this overlay
    if (st.activeTimers) {
      st.activeTimers.forEach(timer => clearTimeout(timer));
      st.activeTimers = [];
    }
    
    // Remove overlay DOM entirely with enhanced cleanup
    try { 
      if (st.overlay) {
        // Find and clean up any nested widgets or popups first
        const nestedWidgets = st.overlay.querySelectorAll('.meety-inline-widget');
        nestedWidgets.forEach(widget => {
          // Clean up any Meety-specific state
          const popups = widget.querySelectorAll('.popup-content, .popup-overlay');
          popups.forEach(popup => {
            try {
              popup.remove();
            } catch(e) {
              popup.style.display = 'none';
            }
          });
        });
        
        st.overlay.remove(); 
      }
    } catch(e){
      console.warn(LOG_PREFIX, 'Overlay removal failed:', e);
    }
    
    // Force cleanup of any remaining Meety elements on the page
    setTimeout(() => {
      document.querySelectorAll('.popup-content.meety-popover-content[style*="display: block"], .popup-overlay.meety-popover-overlay[style*="display: block"]').forEach(el => {
        try {
          el.style.display = 'none';
          el.remove();
        } catch(e) {}
      });
    }, 100);
    
    // Delete state entry so next open triggers rebuild
    states.delete(btnId);
    window.__meetyBogo.cleanup(btnId);
    
    console.log(LOG_PREFIX, 'destroyOverlay: cleanup complete for button', btnId);
  }

  function resetOverlayState(st){
    if(!st) return;
    // Clear navigation history
    st.navigationHistory = [];
    st.currentStepId = null;
    // Clear flow indicators
    st.serviceFlow = null;
    st.selectedServiceType = null;
    st.selectedServiceCategory = null;
    st.selectedTattooPaidHours = null;
    st.selectedTattooTotalHours = null;
    // Gift / existing flags
    st.giftExistingFlow = false;
    st.giftExistingDurationLabel = null;
    // Piercing & gems whitening
    st.piercingGiftMode = false;
    st.giftPiercingFirstSelection = null;
    st.giftPiercingSecondSelection = null;
    st.__gemsWhiteningChosen = null;
    // Tattoo gift
    st.pendingTattooGiftVariant = null;
    st.tattooGiftPurchaseHours = null;
    st.tattooGiftPurchaseLabel = null;
    st.tattooRedemptionAutoSelect = null;
  // Tooth gem gift multi-step
  st.giftGems = null;
  st.giftSubtype = null;
  st.giftWhitening = null;
  st.giftFlowStage = null;
  st.giftRedeemMode = null;
  st._giftGemsProduct = null;
  // Unified BOGO gift mode fields
  st.giftBogoMode = null;
  st.giftChargedVariantId = null;
  st.giftChargedVariantTitle = null;
    // BOGO data
    st.bogoCategory = null;
    st.bogoProductData = null;
    st.bogoFirstSelection = null;
    st.bogoSecondSelection = null;
    st.bogoThirdSelection = null;
    st.bogoDetails = null;
    st.bogoSelection = null;
    st._bogoInitialized = false;
    // Timeouts
    if (st._timeouts){ st._timeouts.forEach(id=> clearTimeout(id)); st._timeouts = []; }
    // Remove transient subtype or temp nodes
    try{
      st.overlay.querySelectorAll('.meety-step-gemswhitening-subtype').forEach(n=> n.remove());
    }catch(e){}
    // Remove chips & dynamic UI artifacts
    try { st.stepGiftPurchase?.querySelectorAll('.tattoo-hours-chip').forEach(c=>c.remove()); } catch(e){}
    // Remove any universal back buttons
    try { st.overlay.querySelectorAll('.meety-universal-back-btn, .meety-back-button-container').forEach(el => el.remove()); } catch(e){}
    // Remove BOGO reminder boxes
    try { st.overlay.querySelectorAll('.bogo-booking-reminder').forEach(n => n.remove()); } catch(e){}
    // Remove BOGO free service banners
    try { st.overlay.querySelectorAll('.meety-bogo-free-service-inline').forEach(n => n.remove()); } catch(e){}
    // Clear dynamic containers (but keep structural nodes intact)
    const safeClear = (el)=>{ if(el) el.innerHTML=''; };
    safeClear(st.stepChooser);
    safeClear(st.stepBogoCategory);
    safeClear(st.stepBogoFirst?.querySelector(`#bogo-first-menu-slot-${st.button.id}`));
    safeClear(st.stepBogoSecond?.querySelector(`#bogo-second-menu-slot-${st.button.id}`));
    safeClear(st.stepBogoThird?.querySelector(`#bogo-third-menu-slot-${st.button.id}`));
    safeClear(st.stepBogoSummary);
    safeClear(st.stepGiftPurchase);
  safeClear(st.stepGiftGemsOne);
  safeClear(st.stepGiftGemsTwo);
  safeClear(st.stepGiftGemsThree);
  safeClear(st.stepGiftWhiteningSummary);
    safeClear(st.stepRedeem);
    safeClear(st.stepTattooHours?.querySelector('.tattoo-hours-options'));
    // Remove leftover dev info markers
    try { st.overlay.querySelectorAll('div').forEach(d=>{ if((d.textContent||'').startsWith('Dev Info:')) d.remove(); }); } catch(e){}
    // Reset active step reference
    st.activeStep = null;
  }

  function transitionToStep(st, targetStep, options = {}) {
    const currentStep = st.activeStep;
    if (!targetStep) return;
    // Prevent overlapping animations
    if (st._transitioning) return;
    st._transitioning = true;

    // Update navigation history unless explicitly told not to
    if (!options.skipHistory) {
      updateNavigationHistory(st, targetStep, options.stepId || getStepId(targetStep));
    }

    if (currentStep === targetStep) {
      targetStep.style.display = 'block';
      targetStep.style.animationName = 'meetyStepIn';
      st.activeStep = targetStep;
      st._transitioning = false;
      // Ensure back button is updated
      updateBackButton(st, targetStep);
      return;
    }

    if (currentStep) {
      currentStep.style.animationName = 'meetyStepOut';
      setTimeout(() => {
        currentStep.style.display = 'none';
        targetStep.style.display = 'block';
        targetStep.style.animationName = 'meetyStepIn';
        st.activeStep = targetStep;
        st._transitioning = false;
        // Ensure back button is updated after transition
        updateBackButton(st, targetStep);
      }, 300); // Match animation duration
    } else {
      targetStep.style.display = 'block';
      targetStep.style.animationName = 'meetyStepIn';
      st.activeStep = targetStep;
      st._transitioning = false;
      // Ensure back button is updated
      updateBackButton(st, targetStep);
    }
    if (targetStep === st.stepCalendar) {
      // Only show fees disclaimer if downpayment split enabled & we have some label text
      const cfg = window.__meetyDownpayConfig;
      const hasCfg = cfg && cfg.enabled && (cfg.disclaimer || cfg.percent || cfg.flat);
      st.fees.style.display = hasCfg ? 'block' : 'none';
    } else {
      st.fees.style.display = 'none';
    }
  }

  /* Navigation History Management for Consistent Back Button Behavior */
  function getStepId(stepElement) {
    if (!stepElement) return 'unknown';
    
    // Extract step ID from common patterns
    if (stepElement.id) return stepElement.id;
    
    // Map step elements to logical IDs
    const stepMappings = {
      'meety-step-main-chooser': 'main-chooser',
      'meety-step-chooser': 'chooser', 
      'meety-step-bogo-category': 'bogo-category',
      'meety-step-service': 'service',
      'meety-step-bogo-first': 'bogo-first',
      'meety-step-bogo-second': 'bogo-second',
      'meety-step-bogo-third': 'bogo-third',
      'meety-step-bogo-summary': 'bogo-summary',
      'meety-step-calendar': 'calendar',
      'meety-step-gift-gems': 'gift-gems-1',
      'meety-step-gift-whitening': 'gift-whitening-summary',
      'meety-step-gift-purchase': 'gift-purchase',
      'meety-step-redeem': 'redeem',
      'meety-step-tattoo-hours': 'tattoo-hours'
    };
    
    // Check class names for matches
    for (const [className, stepId] of Object.entries(stepMappings)) {
      if (stepElement.classList?.contains(className)) {
        return stepId;
      }
    }
    
    return stepElement.className || 'unknown';
  }

  function updateNavigationHistory(st, targetStep, stepId) {
    if (!st.navigationHistory) st.navigationHistory = [];

    // Don't add the same step consecutively
    const lastStep = st.navigationHistory[st.navigationHistory.length - 1];
    if (lastStep && lastStep.stepId === stepId) return;

    // Store only the stepId and timestamp. Resolve DOM nodes at navigation time to avoid stale element refs
    st.navigationHistory.push({ stepId: stepId, timestamp: Date.now() });
    st.currentStepId = stepId;
    
    // Keep history reasonably sized (last 10 steps)
    if (st.navigationHistory.length > 10) {
      st.navigationHistory = st.navigationHistory.slice(-10);
    }
    
    console.log(LOG_PREFIX, 'Navigation history updated:', {
      currentStep: stepId,
      historyLength: st.navigationHistory.length,
      history: st.navigationHistory.map(h => h.stepId)
    });

    // Add visual debug indicator in development
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
      updateDebugNavigationIndicator(st);
    }
  }

  // Resolve a step DOM element by its logical stepId
  function resolveStepElementById(st, stepId) {
    if (!st || !stepId) return null;
    switch (stepId) {
      case 'main-chooser': return st.stepMainChooser;
      case 'chooser': return st.stepChooser;
      case 'bogo-category': return st.stepBogoCategory;
      case 'service': return st.stepService;
      case 'bogo-first': return st.stepBogoFirst;
      case 'bogo-second': return st.stepBogoSecond;
      case 'bogo-third': return st.stepBogoThird;
      case 'bogo-summary': return st.stepBogoSummary;
      case 'calendar': return st.stepCalendar;
      case 'gift-gems-1': return st.stepGiftGemsOne;
      case 'gift-gems-2': return st.stepGiftGemsTwo;
      case 'gift-gems-3': return st.stepGiftGemsThree;
      case 'gift-whitening-summary': return st.stepGiftWhiteningSummary;
      case 'gift-purchase': return st.stepGiftPurchase;
      case 'redeem': return st.stepRedeem;
      case 'tattoo-hours': return st.stepTattooHours;
      case 'gift-piercing-first': return st.stepGiftPiercingFirst;
      case 'gift-piercing-second': return st.stepGiftPiercingSecond;
      default:
        // Attempt heuristic lookup by id or class
        if (typeof stepId === 'string') {
          const elById = st.overlay?.querySelector('#' + stepId);
          if (elById) return elById;
        }
        return null;
    }
  }

  function goBackStep(st) {
    if (!st.navigationHistory || st.navigationHistory.length < 2) {
      console.warn(LOG_PREFIX, 'Cannot go back - insufficient history');
      // Fallback to main chooser or close overlay
      if (st.stepMainChooser) {
        transitionToStep(st, st.stepMainChooser, { skipHistory: true });
      } else {
        closeOverlay(st.button.id);
      }
      return;
    }
    
    // Remove current step from history and get the previous step id
    const currentEntry = st.navigationHistory.pop();
    const previousEntry = st.navigationHistory[st.navigationHistory.length - 1];
    if (!previousEntry || !previousEntry.stepId) {
      console.warn(LOG_PREFIX, 'Cannot go back - invalid previous step');
      return;
    }

    console.log(LOG_PREFIX, 'Going back from', currentEntry?.stepId, 'to step:', previousEntry.stepId);

    // Resolve the DOM element for the previous step at runtime (avoid stale refs)
    const prevEl = resolveStepElementById(st, previousEntry.stepId);
    if (!prevEl) {
      console.warn(LOG_PREFIX, 'Previous step element not found for', previousEntry.stepId);
      return;
    }

    // Transition to previous step without adding to history
    transitionToStep(st, prevEl, { skipHistory: true, stepId: previousEntry.stepId });

    // Handle special cases where step content needs to be rebuilt
    // Do this after transition to ensure element is visible
    setTimeout(() => {
      restoreStepContent(st, previousEntry.stepId, currentEntry?.stepId);
    }, 50);
  }

  function restoreStepContent(st, targetStepId, fromStepId) {
    const btn = st.button;
    
    console.log(LOG_PREFIX, 'Restoring step content for:', targetStepId, 'from:', fromStepId);
    
    // Handle BOGO flow step restoration
    if (targetStepId === 'bogo-first' && fromStepId === 'bogo-second') {
      console.log(LOG_PREFIX, 'Restoring BOGO first step content');
      // Rebuild the first step menu if it's empty
      const firstSlot = st.stepBogoFirst?.querySelector(`#bogo-first-menu-slot-${btn.id}`);
      const isSlotEmpty = !firstSlot || !firstSlot.innerHTML.trim() || firstSlot.innerHTML.trim().length < 50;

      if (isSlotEmpty) {
        console.log(LOG_PREFIX, 'BOGO first step menu is empty/missing, attempting robust rebuild');
        // If we don't have product data yet, try to fetch it first
        const ensureAndBuild = async () => {
          try {
            if (!st.bogoProductData) {
              // Try to resolve a sensible category for the handle
              const category = st.bogoCategory || btn.getAttribute('data-bogo-category') || st.inferredBogoCategory || 'none';
              const handle = getBogoProductHandle(btn, category);
              if (handle) {
                st.bogoProductData = await fetchBogoProduct(handle);
                if (!st.bogoProductData) console.warn(LOG_PREFIX, 'Fetched BOGO product returned null');
              }
            }
            if (st.bogoProductData && (st.bogoCategory || btn.getAttribute('data-bogo-category'))) {
              await setupBogoFirstStep(st, btn, st.bogoProductData, st.bogoCategory || btn.getAttribute('data-bogo-category'));
            } else if (st.bogoProductData) {
              await setupBogoFirstStep(st, btn, st.bogoProductData, st.bogoCategory || st.inferredBogoCategory || btn.getAttribute('data-bogo-category'));
            } else {
              console.warn(LOG_PREFIX, 'Cannot rebuild first step: missing bogoProductData after fetch attempt');
              // As a last resort, re-run flow initializer
              await setupBogoFlow(st, btn);
            }
          } catch (e) {
            console.warn(LOG_PREFIX, 'Error during robust rebuild of BOGO first step', e);
          }
        };

        // Try rebuild with a couple of retries in case some async data is still arriving
        (async () => {
          await ensureAndBuild();
          if (firstSlot && (!firstSlot.innerHTML || firstSlot.innerHTML.trim().length < 50)) {
            // Retry once after short wait
            await sleep(120);
            await ensureAndBuild();
          }
        })();
      } else {
        console.log(LOG_PREFIX, 'BOGO first step menu content appears intact');
      }
    }
    
    if (targetStepId === 'bogo-second' && fromStepId === 'bogo-third') {
      console.log(LOG_PREFIX, 'Restoring BOGO second step content');
      // Rebuild the second step menu if needed
      (async () => {
        await sleep(50);
        const secondSlot = st.stepBogoSecond?.querySelector(`#bogo-second-menu-slot-${btn.id}`);
        const hasMeaningfulChildren = secondSlot && Array.from(secondSlot.children).some(c => !(c.textContent||'').startsWith('Dev Info:') && (c.innerHTML||'').trim().length > 20);
        if (!secondSlot || !hasMeaningfulChildren) {
          console.log(LOG_PREFIX, 'BOGO second step menu is empty or missing meaningful content, rebuilding');
          // Ensure product data exists
          if (!st.bogoProductData) {
            const handle = getBogoProductHandle(btn, st.bogoCategory || btn.getAttribute('data-bogo-category'));
            if (handle) st.bogoProductData = await fetchBogoProduct(handle);
          }

          // If first selection missing but we have context, try to restore it from bogoSelection or bogoModifiedCalendar
          if (!st.bogoFirstSelection) {
            if (st.bogoSelection && st.bogoSelection.firstVariant) {
              st.bogoFirstSelection = st.bogoSelection.firstVariant;
            } else if (st.bogoModifiedCalendar && st.bogoModifiedCalendar.variantId) {
              // try to pick the variant from product data matching variantId
              const vid = String(st.bogoModifiedCalendar.variantId);
              if (st.bogoProductData && st.bogoProductData.variants) {
                const found = st.bogoProductData.variants.find(v => String(v.id) === String(vid));
                if (found) st.bogoFirstSelection = found;
              }
            }
          }

          // If still missing critical context, reinitialize flow
          if (!st.bogoFirstSelection || !st.bogoProductData) {
            console.warn(LOG_PREFIX, 'Missing bogoFirstSelection or productData while restoring second step; reinitializing BOGO flow');
            await setupBogoFlow(st, btn);
            return;
          }

          // Now call setup for second step
          await setupBogoSecondStep(st, btn);

          // If slot still not populated, retry once after short delay
          await sleep(120);
          const secondSlotAfter = st.stepBogoSecond?.querySelector(`#bogo-second-menu-slot-${btn.id}`);
          if (secondSlotAfter && Array.from(secondSlotAfter.children).length === 0) {
            console.warn(LOG_PREFIX, 'Second slot still empty after rebuild, attempting setupBogoSecondStep again');
            setupBogoSecondStep(st, btn);
          }
        } else {
          console.log(LOG_PREFIX, 'BOGO second step menu appears intact');
        }
      })();
    }

    // If coming back to second step from summary or other steps, also ensure it is rebuilt
    if (targetStepId === 'bogo-second' && (!fromStepId || fromStepId === 'bogo-summary' || fromStepId === 'service')) {
      (async () => {
        await sleep(40);
        const secondSlot = st.stepBogoSecond?.querySelector(`#bogo-second-menu-slot-${btn.id}`);
        const hasMeaningfulChildren = secondSlot && Array.from(secondSlot.children).some(c => !(c.textContent||'').startsWith('Dev Info:') && (c.innerHTML||'').trim().length > 20);
        if (!secondSlot || !hasMeaningfulChildren) {
          console.log(LOG_PREFIX, 'BOGO second step returned without content (from ' + fromStepId + '), rebuilding');
          if (!st.bogoProductData) {
            const handle = getBogoProductHandle(btn, st.bogoCategory || btn.getAttribute('data-bogo-category'));
            if (handle) st.bogoProductData = await fetchBogoProduct(handle);
          }
          if (!st.bogoFirstSelection && st.bogoSelection && st.bogoSelection.firstVariant) st.bogoFirstSelection = st.bogoSelection.firstVariant;
          if (st.bogoFirstSelection && st.bogoProductData) setupBogoSecondStep(st, btn);
        }
      })();
    }
    
    // Handle category step restoration
    if (targetStepId === 'bogo-category') {
      console.log(LOG_PREFIX, 'Restoring BOGO category step');
      // Reset BOGO state that might need refreshing
      setTimeout(() => {
        // Check if category step needs rebuilding
        const categoryContainer = st.stepBogoCategory;
        if (categoryContainer && categoryContainer.children.length <= 1) { // Only dev info present
          console.log(LOG_PREFIX, 'BOGO category step needs rebuilding');
          showBogoServiceCategoryStep(st, btn);
        }
      }, 100);
    }

    // Restore third step if necessary
    if (targetStepId === 'bogo-third') {
      console.log(LOG_PREFIX, 'Restoring BOGO third step content');
      (async () => {
        await sleep(50);
        const thirdSlot = st.stepBogoThird?.querySelector(`#bogo-third-menu-slot-${btn.id}`);
        const hasMeaningfulChildren = thirdSlot && Array.from(thirdSlot.children).some(c => !(c.textContent||'').startsWith('Dev Info:') && (c.innerHTML||'').trim().length > 20);
        if (!thirdSlot || !hasMeaningfulChildren) {
          console.log(LOG_PREFIX, 'BOGO third step empty, attempting rebuild');
          if (!st.bogoProductData) {
            const handle = getBogoProductHandle(btn, st.bogoCategory || btn.getAttribute('data-bogo-category'));
            if (handle) st.bogoProductData = await fetchBogoProduct(handle);
          }
          // Ensure first/second exist
          if (!st.bogoFirstSelection && st.bogoSelection?.firstVariant) st.bogoFirstSelection = st.bogoSelection.firstVariant;
          if (!st.bogoSecondSelection && st.bogoSelection?.secondVariant) st.bogoSecondSelection = st.bogoSelection.secondVariant;

          if (!st.bogoSecondSelection || !st.bogoProductData) {
            console.warn(LOG_PREFIX, 'Missing context for third step rebuild; reinitializing BOGO flow');
            await setupBogoFlow(st, btn);
            return;
          }

          setupBogoThirdStep(st, btn);
          await sleep(120);
          const thirdSlotAfter = st.stepBogoThird?.querySelector(`#bogo-third-menu-slot-${btn.id}`);
          if (thirdSlotAfter && Array.from(thirdSlotAfter.children).length === 0) {
            console.warn(LOG_PREFIX, 'Third slot still empty after rebuild, retrying setupBogoThirdStep');
            setupBogoThirdStep(st, btn);
          }
        } else {
          console.log(LOG_PREFIX, 'BOGO third step content present');
        }
      })();
    }
    
    // Handle main chooser restoration
    if (targetStepId === 'main-chooser') {
      console.log(LOG_PREFIX, 'Restoring main chooser step');
      // Clear any transient state that might affect display
      st.__gemsWhiteningChosen = null;
      st.selectedServiceCategory = null;
    }
    
    // Handle chooser (promo) step restoration
    if (targetStepId === 'chooser') {
      console.log(LOG_PREFIX, 'Restoring chooser (promo) step');
      // Check if chooser content is missing and rebuild if needed
      setTimeout(() => {
        const chooserContent = st.stepChooser?.querySelector('.gift-card-options');
        if (!chooserContent || chooserContent.children.length === 0) {
          console.log(LOG_PREFIX, 'Chooser step needs rebuilding');
          renderBlackFridayChooser(st, btn);
        }
      }, 100);
    }
  }

  function forceRebuildStep(st, stepId) {
    const btn = st.button;
    console.log(LOG_PREFIX, 'Force rebuilding step:', stepId);
    
    switch(stepId) {
      case 'bogo-first':
        if (st.bogoProductData && st.bogoCategory) {
          setupBogoFirstStep(st, btn, st.bogoProductData, st.bogoCategory);
        }
        break;
      case 'bogo-second':
        if (st.bogoFirstSelection) {
          setupBogoSecondStep(st, btn);
        }
        break;
      case 'bogo-category':
        showBogoServiceCategoryStep(st, btn);
        break;
      case 'chooser':
        renderBlackFridayChooser(st, btn);
        break;
      case 'main-chooser':
        if (st.chooserConfig) {
          const {json1, json2, cal1Label, cal2Label} = st.chooserConfig;
          const promoTitle = btn.getAttribute('data-promo-title') || 'Promotions';
          const hasBogoProduct = hasAnyBogoProduct(btn);
          const hasGiftCards = !!(btn.getAttribute('data-gift-card-variant-1') || btn.getAttribute('data-gift-card-variant-2') || btn.getAttribute('data-gift-card-variant-3'));
          renderMainServiceChooser(st, btn, {json1, json2, cal1Label, cal2Label, promoTitle, hasBogoPotential: hasBogoProduct, hasGiftCards});
        }
        break;
      default:
        console.warn(LOG_PREFIX, 'No rebuild handler for step:', stepId);
    }
  }

  function createBackButton(st, options = {}) {
    const backBtn = document.createElement('div');
    backBtn.className = 'meety-back-button-container';
    backBtn.style.cssText = 'text-align: center; margin-top: 15px;';
    
    const backButton = document.createElement('button');
    backButton.className = 'gift-card-btn secondary back-btn meety-universal-back-btn';
    backButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
      ${options.text || 'Back'}
    `;
    
    // Use custom handler if provided, otherwise use navigation history
    if (options.customHandler) {
      backButton.addEventListener('click', options.customHandler);
    } else {
      backButton.addEventListener('click', () => goBackStep(st));
    }
    
    backBtn.appendChild(backButton);
    return backBtn;
  }

  function updateBackButton(st, targetStep) {
    // Remove existing universal back buttons to avoid duplicates
    targetStep.querySelectorAll('.meety-universal-back-btn').forEach(btn => {
      const container = btn.closest('.meety-back-button-container');
      if (container) container.remove();
    });
    
    // Don't add back button to first step (main chooser) or calendar (final step)
    const stepId = getStepId(targetStep);
    const isFirstStep = stepId === 'main-chooser' || (!st.navigationHistory || st.navigationHistory.length <= 1);
    const isCalendarStep = stepId === 'calendar';
    
    if (isFirstStep || isCalendarStep) {
      return;
    }
    
    // Check if step already has a manually placed back button
    const hasExistingBackBtn = targetStep.querySelector('.back-btn:not(.meety-universal-back-btn)');
    if (hasExistingBackBtn) {
      console.log(LOG_PREFIX, 'Step already has custom back button, updating its behavior to use navigation history');
      
      // Update existing back buttons to use universal navigation instead of hardcoded paths
      const existingBtns = targetStep.querySelectorAll('.back-btn:not(.meety-universal-back-btn)');
      existingBtns.forEach(btn => {
        // Remove old event listeners by cloning the node
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Add new universal back behavior
        newBtn.addEventListener('click', () => goBackStep(st));
      });
      
      return;
    }
    
    // Add universal back button
    const backBtn = createBackButton(st);
    targetStep.appendChild(backBtn);
    
    console.log(LOG_PREFIX, 'Added universal back button to step:', stepId);
  }

  function updateDebugNavigationIndicator(st) {
    // Remove existing debug indicator
    const existing = st.overlay?.querySelector('.meety-debug-nav-indicator');
    if (existing) existing.remove();

    if (!st.navigationHistory || st.navigationHistory.length === 0) return;

    // Create debug navigation breadcrumb
    const debugDiv = document.createElement('div');
    debugDiv.className = 'meety-debug-nav-indicator';
    debugDiv.style.cssText = 'position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,0.7); color: white; font-size: 11px; padding: 4px 8px; border-radius: 3px; z-index: 10001; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    
    const currentStepId = st.navigationHistory[st.navigationHistory.length - 1]?.stepId || 'unknown';
    const historyPath = st.navigationHistory.map(h => h.stepId).join(' → ');
    debugDiv.innerHTML = `Nav: ${historyPath}`;
    debugDiv.title = `Navigation History (Dev Mode)\nCurrent: ${currentStepId}\nClick to log full history and force rebuild`;
    
    debugDiv.addEventListener('click', () => {
      console.log(LOG_PREFIX, 'Full Navigation History:', st.navigationHistory);
      console.log(LOG_PREFIX, 'Current Step State:', {
        currentStepId,
        bogoCategory: st.bogoCategory,
        bogoProductData: !!st.bogoProductData,
        bogoFirstSelection: st.bogoFirstSelection?.title,
        bogoSecondSelection: st.bogoSecondSelection?.title
      });
      
      // Offer to force rebuild current step
      if (confirm('Force rebuild current step content?')) {
        forceRebuildStep(st, currentStepId);
      }
    });

    if (st.overlay) {
      st.overlay.appendChild(debugDiv);
    }
  }

  function showStepMainChooser(st){ transitionToStep(st, st.stepMainChooser, { stepId: 'main-chooser' }); }
  
  /* Render Main Service Type Chooser - Step 1 */
  function renderMainServiceChooser(st, btn, options) {
    const { json1, json2, cal1Label, cal2Label, promoTitle, hasBogoPotential = false, hasGiftCards = false } = options;
    console.log(LOG_PREFIX, 'renderMainServiceChooser enter', { hasJson1: !!json1, hasJson2: !!json2, cal1Label, cal2Label, promoTitle, hasBogoPotential, hasGiftCards, chooserMode: st.chooserConfig?.chooserMode, selectedServiceType: st.selectedServiceType, bookingFlowMode: st.bookingFlowMode });
    
    st.stepMainChooser.innerHTML = '';
    
    // Title
    const title = document.createElement('h3');
    title.textContent = 'What type of service are you looking for?';
    title.style.textAlign = 'center';
    
    // Options container
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'gift-card-options';
    
    // Primary Calendar Button (if available)
    if (json1) {
      const primaryBtn = document.createElement('button');
      primaryBtn.className = 'gift-card-btn main-service-btn booking-type-btn';
      primaryBtn.innerHTML = `
        <div style="text-align: left;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${cal1Label || 'Regular Booking'}</div>
          <div style="font-size: 13px; opacity: 0.8; line-height: 1.3;">Book and pay for services at regular prices</div>
        </div>
      `;
      primaryBtn.addEventListener('click', () => {
        st.serviceFlow = 'primary';
        st.selectedServiceType = 'primary';
        st.serviceUiMode = st.cal1Parser;
        proceedWithSelectedService(st, btn, json1);
      });
      optionsContainer.appendChild(primaryBtn);
    }
    
    // Secondary Calendar Button (if available)
    if (json2) {
      const secondaryBtn = document.createElement('button');
      secondaryBtn.className = 'gift-card-btn main-service-btn booking-type-btn';
      secondaryBtn.innerHTML = `
        <div style="text-align: left;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${cal2Label || 'Alternative Booking'}</div>
          <div style="font-size: 13px; opacity: 0.8; line-height: 1.3;">Alternative booking options or specialized services</div>
        </div>
      `;
      secondaryBtn.addEventListener('click', () => {
        st.serviceFlow = 'secondary';
        st.selectedServiceType = 'secondary';
        st.serviceUiMode = st.cal2Parser;
        proceedWithSelectedService(st, btn, json2);
      });
      optionsContainer.appendChild(secondaryBtn);
    }
    
  const hasBogoProduct = hasAnyBogoProduct(btn);
  // Relaxed gating: if merchant enabled promo, show it regardless of gift cards / bogo assets
  const promoPossible = !!st.promoEnabled;
  console.log(LOG_PREFIX, 'Main chooser promo gating check', { promoEnabled: st.promoEnabled, hasGiftCards, hasBogoProduct, hasBogoPotential, promoPossible });
    if (promoPossible) {
      const promoBtn = document.createElement('button');
      promoBtn.className = 'gift-card-btn main-service-btn booking-type-btn';
      promoBtn.style.background = 'linear-gradient(135deg, #d4af37, #f4e04a)';
      promoBtn.style.borderColor = '#d4af37';
      promoBtn.style.color = '#2c2c2c';
      promoBtn.style.boxShadow = '0 3px 8px rgba(212, 175, 55, 0.3)';
      let promoDescription = '';
      if (hasBogoProduct && hasGiftCards) promoDescription = 'BOGO deals, gift cards, and special promotions';
      else if (hasBogoProduct) promoDescription = 'Buy One Get One FREE deals and special offers';
      else if (hasGiftCards) promoDescription = 'Gift cards and promotion pricing';
      const label = hasBogoProduct && !hasGiftCards ? 'BOGO Deals' : (promoTitle || 'Promotions');
      promoBtn.innerHTML = `<div style="text-align: left;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 16px;">🎉</span>
          <div style="font-weight: 600; font-size: 16px;">${label}</div>
        </div>
        <div style="font-size: 13px; opacity: 0.9; line-height: 1.3;">${promoDescription}</div>
      </div>`;
      promoBtn.addEventListener('click', () => {
        console.log(LOG_PREFIX, 'Promo/Bogo path selected from Step 0');
        st.serviceFlow = 'promo';
        st.selectedServiceType = 'promo';
        renderBlackFridayChooser(st, btn);
        showStepChooser(st);
      });
      optionsContainer.appendChild(promoBtn);
    }
    
    // Note
    const note = document.createElement('div');
    note.className = 'meety-note';
    note.textContent = 'Choose the service type you\'re interested in.';
    note.style.textAlign = 'center';
    
    st.stepMainChooser.append(title, optionsContainer, note);
    
    addDevInfo(st.stepMainChooser, 'Main Service Chooser', `renderMainServiceChooser() | BOGO: ${hasBogoPotential} | Gifts: ${hasGiftCards}`);
  }
  
  /* Render Black Friday Chooser - Step 2 */
  function renderBlackFridayChooser(st, btn) {
    console.log(LOG_PREFIX, 'renderBlackFridayChooser enter', { selectedServiceType: st.selectedServiceType, serviceFlow: st.serviceFlow, bogoCategory: btn.getAttribute('data-bogo-category') });
    st.stepChooser.innerHTML = '';
  try { addDevInfo(st.stepChooser, 'Render BF Chooser Start', 'pre-build'); } catch(e) {}
  const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
  // Will be created later; track desired disable state from inventory banner
  let buyGiftBtn;
  let bookMyselfBtn;
  let shouldDisableBogo = false; // sold-out flag to disable all BOGO deals (booking + purchase)
    
  // Title
  const title = document.createElement('h3');
  title.textContent = btn.getAttribute('data-promo-title') || 'Black Friday Special - Choose Your Option';
    title.style.textAlign = 'center';
    title.style.color = '#000';
    
    // Promotional description
    const promoDescription = btn.getAttribute('data-promo-description') || 
      '🎉 <strong>Black Friday Deals Available!</strong> Choose from booking services, gift cards, or redeem existing gift cards.';
    const promoText = document.createElement('div');
    promoText.style.cssText = 'margin: 8px 0 15px; font-size: 14px; color: #666; text-align: center; line-height: 1.4;';
    promoText.innerHTML = promoDescription;

    // Inventory banner (Multi-mode BOGO tracking)
    const btnId = btn.id;
    const invBanner = document.createElement('div');
    invBanner.id = `bf-inv-banner-${btnId}`;
    invBanner.className = 'bf-inventory-banner';
    (async () => {
      try {
        // Determine which tracking product to check based on current BOGO category
        console.log(LOG_PREFIX, 'Inventory banner check for category:', bogoCategory);
        console.log(LOG_PREFIX, 'Button attributes check:', {
          'data-bogo-track-tattoo': btn.getAttribute('data-bogo-track-tattoo'),
          'data-bogo-track-tattoo-raw': btn.getAttribute('data-bogo-track-tattoo-raw'),
          'data-bogo-tattoo-liquid-total': btn.getAttribute('data-bogo-tattoo-liquid-total'),
          'data-bogo-track-piercings': btn.getAttribute('data-bogo-track-piercings'),
          'data-bogo-track-piercings-raw': btn.getAttribute('data-bogo-track-piercings-raw'),
          'data-bogo-piercings-liquid-total': btn.getAttribute('data-bogo-piercings-liquid-total'),
          'data-bogo-track-tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
          'data-bogo-track-teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
        });
        
        let trackingHandle = null;
        let liquidTotal = NaN;
        let categoryName = '';
        
        // Enhanced handling for gems-whitening combined category
        if (bogoCategory === 'gems-whitening') {
          if (st.__gemsWhiteningChosen) {
            // Single subcategory chosen
            if (st.__gemsWhiteningChosen === 'tooth-gems') {
              trackingHandle = btn.getAttribute('data-bogo-track-tooth-gems');
              const liquidTotalRaw = btn.getAttribute('data-bogo-tooth-gems-liquid-total');
              liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
              categoryName = 'Tooth Gems';
            } else if (st.__gemsWhiteningChosen === 'teeth-whitening') {
              trackingHandle = btn.getAttribute('data-bogo-track-teeth-whitening');
              const liquidTotalRaw = btn.getAttribute('data-bogo-teeth-whitening-liquid-total');
              liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
              categoryName = 'Teeth Whitening';
            }
          } else {
            // Combined view - check both subcategories
            const gemsHandle = btn.getAttribute('data-bogo-track-tooth-gems');
            const whiteningHandle = btn.getAttribute('data-bogo-track-teeth-whitening');
            
            if (gemsHandle && whiteningHandle) {
              // Check both inventories
              const gemsRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'tooth-gems' });
              const whiteningRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'teeth-whitening' });
              
              const gemsCount = gemsRemaining || 0;
              const whiteningCount = whiteningRemaining || 0;
              const combinedAvailable = Math.min(gemsCount, whiteningCount); // Limited by the lower inventory
              
              console.log(LOG_PREFIX, 'Combined gems-whitening inventory:', {
                gemsCount,
                whiteningCount,
                combinedAvailable
              });
              
              shouldDisableBogo = (combinedAvailable <= 0);
              st.bogoSoldOut = shouldDisableBogo;
              
              if (combinedAvailable > 0) {
                invBanner.innerHTML = `🔥 Gems + Whitening BOGO Available: <strong>${combinedAvailable}</strong> sets`;
                invBanner.classList.add('show');
                invBanner.style.borderColor = '#f59e0b'; invBanner.style.background = '#fff7ed'; invBanner.style.color = '#7c2d12';
              } else {
                invBanner.innerHTML = `⚠️ Gems + Whitening BOGO is currently sold out`;
                invBanner.classList.add('show');
                invBanner.style.borderColor = '#dc2626'; invBanner.style.background = '#fef2f2'; invBanner.style.color = '#7f1d1d';
              }
              
              // Update buttons immediately
              const updateButton = (btn, label) => {
                if (btn) {
                  btn.disabled = shouldDisableBogo;
                  btn.classList.toggle('disabled', shouldDisableBogo);
                  btn.setAttribute('aria-disabled', shouldDisableBogo ? 'true' : 'false');
                  if (shouldDisableBogo) btn.title = 'Sold Out'; else btn.removeAttribute('title');
                  console.log(LOG_PREFIX, `Updated ${label} button:`, { disabled: shouldDisableBogo });
                } else {
                  console.log(LOG_PREFIX, `${label} button not ready yet, shouldDisableBogo set to:`, shouldDisableBogo);
                }
              };
              
              updateButton(buyGiftBtn, 'buyGift');
              updateButton(bookMyselfBtn, 'bookMyself');
              return; // Skip single category logic below
            }
          }
        } else if (bogoCategory === 'tattoo') {
          trackingHandle = btn.getAttribute('data-bogo-track-tattoo') || btn.getAttribute('data-bogo-track-tattoo-raw');
          const liquidTotalRaw = btn.getAttribute('data-bogo-tattoo-liquid-total');
          liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
          categoryName = 'Tattoo';
        } else if (bogoCategory === 'piercings') {
          trackingHandle = btn.getAttribute('data-bogo-track-piercings') || btn.getAttribute('data-bogo-track-piercings-raw');
          const liquidTotalRaw = btn.getAttribute('data-bogo-piercings-liquid-total');
          liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
          categoryName = 'Piercings';
        } else if (bogoCategory === 'tooth-gems') {
          trackingHandle = btn.getAttribute('data-bogo-track-tooth-gems');
          categoryName = 'Tooth Gems';
        } else if (bogoCategory === 'teeth-whitening') {
          trackingHandle = btn.getAttribute('data-bogo-track-teeth-whitening');
          categoryName = 'Teeth Whitening';
        }

        console.log(LOG_PREFIX, 'Inventory tracking check:', { bogoCategory, trackingHandle, liquidTotal, categoryName });

        // Only show banner if tracking is configured for this category
        if (!trackingHandle) return; // skip banner entirely

        const render = (total) => {
          console.log(LOG_PREFIX, 'Rendering inventory banner:', { categoryName, total });
          if (typeof total === 'number' && !isNaN(total)) {
            // Toggle all BOGO entry points when sold out
            shouldDisableBogo = (total <= 0);
            st.bogoSoldOut = shouldDisableBogo;
            
            // Update buttons if they exist, or schedule update for later
            const updateButton = (btn, label) => {
              if (btn) {
                btn.disabled = shouldDisableBogo;
                btn.classList.toggle('disabled', shouldDisableBogo);
                btn.setAttribute('aria-disabled', shouldDisableBogo ? 'true' : 'false');
                if (shouldDisableBogo) btn.title = 'Sold Out'; else btn.removeAttribute('title');
                console.log(LOG_PREFIX, `Updated ${label} button:`, { disabled: shouldDisableBogo });
              } else {
                console.log(LOG_PREFIX, `${label} button not ready yet, shouldDisableBogo set to:`, shouldDisableBogo);
              }
            };
            
            updateButton(buyGiftBtn, 'buyGift');
            updateButton(bookMyselfBtn, 'bookMyself');
            if (total > 0) {
              invBanner.innerHTML = `🔥 ${categoryName} BOGO Gift Cards Remaining: <strong>${total}</strong>`;
              invBanner.classList.add('show');
              invBanner.style.borderColor = '#f59e0b'; invBanner.style.background = '#fff7ed'; invBanner.style.color = '#7c2d12';
            } else {
              invBanner.innerHTML = `⚠️ ${categoryName} BOGO is currently sold out`;
              invBanner.classList.add('show');
              invBanner.style.borderColor = '#dc2626'; invBanner.style.background = '#fef2f2'; invBanner.style.color = '#7f1d1d';
            }
          }
        };

        // Step 1: Show immediate server-side total if available
        if (!isNaN(liquidTotal)) render(liquidTotal);

        // Step 2: Refresh with a force-fresh client fetch for near real-time accuracy
        const category = (bogoCategory === 'gems-whitening' && st.__gemsWhiteningChosen) ? st.__gemsWhiteningChosen : bogoCategory;
        const total = await fetchTrackingRemaining(st, btn, { forceFresh: true, category });
        if (typeof total === 'number') {
          // Avoid downgrading from a known positive Liquid total to 0 due to untracked/null API fields
          if (!isNaN(liquidTotal) && liquidTotal > 0 && total === 0) {
            render(liquidTotal);
          } else {
            render(total);
          }
        }
      } catch(e){ /* silently ignore */ }
    })();

    // Strong checkout reminder (always visible in redemption chooser context)
  const redeemReminder = document.createElement('div');
  redeemReminder.style.cssText = 'font-size:11.5px;margin:18px 4px 4px;color:#777;text-align:center;line-height:1.35;';
  redeemReminder.innerHTML = 'Reminder: Gift card value is applied later at checkout when you enter the code. Pricing shown here is before that.<br><u>Expiration date: January 31, 2026</u>';
    
    const isGemsWhitening = bogoCategory === 'gems-whitening';
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'gift-card-options';

    // Simplified: if gems-whitening and subtype not chosen, push user to dedicated category step and exit.
    if (isGemsWhitening && !st.__gemsWhiteningChosen) {
      console.log(LOG_PREFIX, 'Redirecting to gems-whitening category step (no subtype chosen)');
      showBogoServiceCategoryStep(st, btn);
      return;
    }

    // If we have a gems-whitening subtype chosen, show a small pill + change button
    if (isGemsWhitening && st.__gemsWhiteningChosen) {
      const chipBar = document.createElement('div');
      chipBar.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:10px;margin:-4px 0 14px;flex-wrap:wrap;';
      const chip = document.createElement('span');
      chip.textContent = st.__gemsWhiteningChosen === 'tooth-gems' ? 'Promo: Tooth Gems (Buy 1 Get 2 Free)' : 'Promo: Teeth Whitening';
      chip.style.cssText = 'background:#111;color:#fff;padding:6px 12px;border-radius:20px;font-size:11px;letter-spacing:.5px;';
      const changeBtn = document.createElement('button');
      changeBtn.type='button';
      changeBtn.textContent = 'Change';
      changeBtn.style.cssText='background:transparent;border:1px solid #ccc;padding:5px 10px;border-radius:16px;font-size:11px;cursor:pointer;';
  changeBtn.onclick = ()=>{ st.__gemsWhiteningChosen = null; showBogoServiceCategoryStep(st, btn); };
      chipBar.append(chip, changeBtn);
      st.stepChooser.appendChild(chipBar);
    }
    
    // Book for Myself Option
  bookMyselfBtn = document.createElement('button');
  bookMyselfBtn.className = 'gift-card-btn booking-detail-btn';
  const hasBogo = bogoCategory !== 'none';
    
    bookMyselfBtn.innerHTML = `
      <div style="text-align: left;">
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">📅 Book Appointment for Myself</div>
        <div style="font-size: 12px; opacity: 0.8; line-height: 1.3;">
          ${hasBogo ? 'Get BOGO deals and special promotion pricing' : 'Book with current promotions and deals'}
        </div>
      </div>
    `;
    // Apply pending disable from banner if computed already
    console.log(LOG_PREFIX, 'Creating bookMyselfBtn, shouldDisableBogo:', shouldDisableBogo);
    if (shouldDisableBogo) {
      bookMyselfBtn.disabled = true; 
      bookMyselfBtn.classList.add('disabled'); 
      bookMyselfBtn.setAttribute('aria-disabled','true'); 
      bookMyselfBtn.title = 'Sold Out';
      console.log(LOG_PREFIX, 'bookMyselfBtn disabled due to sold out inventory');
    }
    bookMyselfBtn.addEventListener('click', () => {
      if (shouldDisableBogo) { try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); } return; }
      console.log(LOG_PREFIX, 'Book Myself clicked in Black Friday chooser', { hasBogo, bogoCategory, selectedServiceType: st.selectedServiceType });
      if (hasBogo) {
        st.serviceFlow = 'bogo';
        if (bogoCategory === 'piercings') {
          console.log(LOG_PREFIX, 'Direct piercings BOGO flow (skipping category chooser)');
          setupBogoFlow(st, btn);
          return;
        }
        // For gems-whitening we must present subtype chooser first if not chosen
        if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen) {
          console.log(LOG_PREFIX, 'Routing to gems-whitening category step before BOGO flow');
          showBogoServiceCategoryStep(st, btn);
          return;
        } else if (bogoCategory === 'gems-whitening') {
          console.log(LOG_PREFIX, 'Subtype already chosen; proceeding to BOGO flow');
          setupBogoFlow(st, btn);
          return;
        }
        console.log(LOG_PREFIX, 'Non-piercings BOGO category step (regular)');
        showBogoServiceCategoryStep(st, btn);
        return;
      }
      const json1 = st.chooserConfig?.json1;
      const json2 = st.chooserConfig?.json2;
      const chosenCalendar = json1 || json2;
      if (chosenCalendar) proceedWithChosenCalendar(st, chosenCalendar);
    });
    optionsContainer.appendChild(bookMyselfBtn);
    
    // Always show gift card options (even if variants not configured) per updated requirement
    buyGiftBtn = document.createElement('button');
    buyGiftBtn.className = 'gift-card-btn booking-detail-btn';
    buyGiftBtn.innerHTML = `
      <div style="text-align: left;">
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">🎁 Purchase Gift Card</div>
        <div style="font-size: 12px; opacity: 0.8; line-height: 1.3;">
          Buy a gift card for someone else to use later
        </div>
      </div>
    `;
    // Apply pending disable from banner if computed already
    console.log(LOG_PREFIX, 'Creating buyGiftBtn, shouldDisableBogo:', shouldDisableBogo);
    if (shouldDisableBogo) { 
      buyGiftBtn.disabled = true; 
      buyGiftBtn.classList.add('disabled'); 
      buyGiftBtn.setAttribute('aria-disabled','true'); 
      buyGiftBtn.title = 'Sold Out'; 
      console.log(LOG_PREFIX, 'buyGiftBtn disabled due to sold out inventory');
    }
    buyGiftBtn.addEventListener('click', async () => {
      if (shouldDisableBogo) { try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); } return; }
      
      // Add loading state
      LoadingManager.setLoading(buyGiftBtn, 'Loading Gift Options...');
      
      try {
        const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
        if(bogoCategory === 'piercings') {
          try {
            const handle = btn.getAttribute('data-bogo-product-handle');
            if(handle){
              const productData = await fetchBogoProduct(handle);
              if(productData){
                st.piercingGiftVariants = productData.variants.slice();
                st.menuSlot.innerHTML = '';
                productData.variants.filter(v=>v.available).forEach(v => {
                  const b = document.createElement('button');
                  b.className = 'meety-menu-item';
                  b.type = 'button';
                  b.setAttribute('data-variant-id', v.id);
                  b.setAttribute('data-title', v.title);
                  b.textContent = `${v.title} - $${(v.price/100).toFixed(2)}`;
                  st.menuSlot.appendChild(b);
                });
              }
            }
          } catch(e){ console.warn(LOG_PREFIX, 'Piercing gift lightweight fetch failed', e); }
          startPiercingGiftFlow(st, btn);
        } else if (bogoCategory === 'tattoo') {
          showTattooGiftHourChooser(st, btn, 'purchase');
        } else if (bogoCategory === 'tooth-gems' || bogoCategory === 'teeth-whitening') {
          startGiftFlow(st, btn, bogoCategory);
        } else if (bogoCategory === 'gems-whitening') {
          startGemsWhiteningBogoGiftFlow(st, btn);
          return;
        } else {
          startGiftFlow(st, btn);
        }
      } catch (error) {
        console.error(LOG_PREFIX, 'Gift card button error:', error);
        try { 
          showTemporaryToast('Error loading gift options. Please try again.'); 
        } catch(_) { 
          alert('Error loading gift options. Please try again.'); 
        }
      } finally {
        // Always remove loading state
        LoadingManager.removeLoading(buyGiftBtn);
      }
    });
    optionsContainer.appendChild(buyGiftBtn);

    const haveGiftBtn = document.createElement('button');
    haveGiftBtn.className = 'gift-card-btn secondary booking-detail-btn';
    haveGiftBtn.innerHTML = `
      <div style="text-align: left;">
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">💳 Redeem Gift Card</div>
        <div style="font-size: 12px; opacity: 0.8; line-height: 1.3;">
          I already have a gift card and want to book services
        </div>
      </div>
    `;
    haveGiftBtn.addEventListener('click', () => {
      // If gems-whitening, redemption should respect chosen subtype (if any)
      if (isGemsWhitening && !st.__gemsWhiteningChosen) {
        // Force choose before redemption
        renderBlackFridayChooser(st, btn);
        return;
      }
      renderGiftCardRedemptionFlow(st, btn);
    });
    optionsContainer.appendChild(haveGiftBtn);
    
    // Back button
    const backBtn = document.createElement('div');
    backBtn.style.textAlign = 'center';
    backBtn.style.marginTop = '15px';
    const backButton = document.createElement('button');
    backButton.className = 'gift-card-btn secondary back-btn';
    backButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Back to Service Types
    `;
    backButton.addEventListener('click', () => {
      showStepMainChooser(st);
    });
    backBtn.appendChild(backButton);
    
  st.stepChooser.append(title, invBanner, promoText, optionsContainer, backBtn, redeemReminder);
  
  addDevInfo(st.stepChooser, 'Gift Card Main Menu', 'renderGiftCardChooser()');
  }
  
  /* Proceed with selected service type */
  async function proceedWithSelectedService(st, btn, selectedJson) {
    console.log(LOG_PREFIX, 'Selected service type:', st.selectedServiceType);
    
    // Check if this is a BOGO category for the selected service
    const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
    const forceBogoMode = (st.serviceUiMode === 'bogo');
    if ((forceBogoMode || bogoCategory !== 'none')) {
      if (st.selectedServiceType === 'promo' || forceBogoMode) {
        // Only check for sold-out when user is actually trying to access BOGO/promo flow
        if (isBogoSoldOut(st, btn)) {
          console.log(LOG_PREFIX, 'BOGO entry blocked: sold out');
          try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); }
          return;
        }
        console.log(LOG_PREFIX, 'proceedWithSelectedService: triggering BOGO flow', { forceBogoMode, bogoCategory, selectedServiceType: st.selectedServiceType });
        await setupBogoFlow(st, btn);
        return;
      } else {
        console.log(LOG_PREFIX, 'proceedWithSelectedService: BOGO available but skipped (not promo path)', { forceBogoMode, bogoCategory, selectedServiceType: st.selectedServiceType });
      }
    }
    
    // Regular service flow - proceed with chosen calendar
    await proceedWithChosenCalendar(st, selectedJson);
  }

  /* Piercing Gift Flow Helpers */
  function buildGiftPiercingMenus(st){
    const firstSlot = st.stepGiftPiercingFirst.querySelector(`#gift-piercing-first-slot-${st.button.id}`) || st.stepGiftPiercingFirst.querySelector('.menu-slot');
    const secondSlot = st.stepGiftPiercingSecond.querySelector(`#gift-piercing-second-slot-${st.button.id}`) || st.stepGiftPiercingSecond.querySelector('.menu-slot');
    if(!firstSlot || !secondSlot) return;
    const variants = (st.piercingGiftVariants || []).filter(v=>v && v.available !== false);
    if(!variants.length){
      firstSlot.innerHTML = '<p style="font-size:12px;color:#999;">No piercing variants available.</p>';
      return;
    }
    // Build first step with dropdown parser
    firstSlot.innerHTML='';
    buildPiercingDualDropdown(st, variants, null, firstSlot, (picked)=>{
      st.giftPiercingFirstSelection = { title: picked.title, variantId: picked.id };
      // Build second step fresh excluding first
      secondSlot.innerHTML='';
      buildPiercingDualDropdown(st, variants, picked.id, secondSlot, (picked2)=>{
        st.giftPiercingSecondSelection = { title: picked2.title, variantId: picked2.id };
        showStepGiftPurchase(st);
        setupGiftPurchaseForm(st, st.button);
      });
      transitionToStep(st, st.stepGiftPiercingSecond, { stepId: 'gift-piercing-second' });
    });
    const back = st.stepGiftPiercingSecond.querySelector('.gift-goto-first');
    if(back){ back.addEventListener('click',()=> transitionToStep(st, st.stepGiftPiercingFirst, { stepId: 'gift-piercing-first' })); }
  }

  function startPiercingGiftFlow(st, btn){
    st.piercingGiftMode = true;
    buildGiftPiercingMenus(st);
    transitionToStep(st, st.stepGiftPiercingFirst, { stepId: 'gift-piercing-first' });
  }
  
  /* Render Gift Card Redemption Flow - Step 3 */
  function renderGiftCardRedemptionFlow(st, btn) {
    const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';

    // For non-tattoo BOGO categories, keep existing shortcut
    if (bogoCategory !== 'none' && bogoCategory !== 'tattoo') {
      if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen) {
        console.log(LOG_PREFIX, 'Gift redemption: showing gems-whitening chooser directly');
        showGemsWhiteningChooser(st, btn, () => {
          st.giftExistingFlow = true;
          // Set redemption flag to exclude tracking
          if (window.__meetyBogoContext) {
            window.__meetyBogoContext.isRedemption = true;
            console.log(LOG_PREFIX, 'Marked as redemption flow - no inventory tracking');
          }
          setupBogoFlow(st, btn);
        });
        return;
      }
      console.log(LOG_PREFIX, 'Gift redemption: going directly to BOGO flow (non-tattoo)');
      st.giftExistingFlow = true;
      // Set redemption flag to exclude tracking
      if (window.__meetyBogoContext) {
        window.__meetyBogoContext.isRedemption = true;
        console.log(LOG_PREFIX, 'Marked as redemption flow - no inventory tracking');
      }
      setupBogoFlow(st, btn);
      return;
    }

    // Tattoo redemption now uses the hours button chooser
    if (bogoCategory === 'tattoo') {
      showTattooGiftHourChooser(st, btn, 'redeem');
      return;
    }

    // Tooth Gems redemption unified flow (3 steps + summary -> calendar)
    if(bogoCategory === 'tooth-gems' || (bogoCategory === 'gems-whitening' && st.__gemsWhiteningChosen === 'tooth-gems')){
      startToothGemsGiftFlow(st, btn, 'redeem');
      return;
    }

    // Fallback original non-BOGO redemption (unchanged for other categories)
    st.stepRedeem.innerHTML = '';
    const title = document.createElement('h3');
  title.textContent = 'Select the services your gift card covers';
    title.style.color = '#000';
    const subtitle = document.createElement('p');
  subtitle.textContent = 'Choose the session length your gift card covers. You\'ll enter the gift card code at checkout to apply its value.';
    subtitle.style.cssText = 'margin: 8px 0 18px; color: #666; text-align: center; font-size:13px; line-height:1.35;';
    const formContainer = document.createElement('div');
    formContainer.className = 'redeem-form';
    formContainer.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    const sessionGroup = document.createElement('div');
    sessionGroup.innerHTML = `
      <label style="font-weight: 600; color: #333; margin-bottom: 6px; display: block;">Gift Card Session Length:</label>
      <select id="gift-coverage-${btn.id}" style="padding: 10px; border: 1px solid #ddd; border-radius: 6px; width: 100%;">
        <option value="">Select session length...</option>
      </select>
      <div style="font-size:11px;color:#777;margin-top:6px;line-height:1.3;">Reminder: actual gift card code is entered later at checkout for value.</div>
    `;
    const coverageSelect = sessionGroup.querySelector('select');
    const calendars = [
      { idx: 1, raw: btn.getAttribute('data-gift-calendar-1'), label: btn.getAttribute('data-gift-label-1') || '1 Hour Session' },
      { idx: 2, raw: btn.getAttribute('data-gift-calendar-2'), label: btn.getAttribute('data-gift-label-2') || '2 Hour Session' },
      { idx: 3, raw: btn.getAttribute('data-gift-calendar-3'), label: btn.getAttribute('data-gift-label-3') || '3 Hour Session' }
    ];
    calendars.forEach(cal => { if (cal.raw && cal.raw !== '#') { const option = document.createElement('option'); option.value = cal.idx; option.textContent = cal.label; option.dataset.calendarJson = cal.raw; option.dataset.label = cal.label; coverageSelect.appendChild(option); } });
    formContainer.appendChild(sessionGroup);
    const continueBtn = document.createElement('button');
    continueBtn.className = 'gift-card-btn';
    continueBtn.textContent = 'Continue to Booking';
    continueBtn.addEventListener('click', () => {
      const selectedCoverage = coverageSelect.value;
      if (!selectedCoverage) { alert('Please select session length.'); return; }
      const selectedOption = coverageSelect.options[coverageSelect.selectedIndex];
      const calendarRaw = selectedOption.dataset.calendarJson;
      const label = selectedOption.dataset.label;
      if (calendarRaw) {
        const parsed = parseJSONSafe(decodeEntities(calendarRaw));
        if (parsed) {
          st.giftExistingFlow = true;
          st.giftRedeemMode = true;
          st.serviceFlow = 'redeem';
          
          // Set redemption flag to exclude tracking
          if (!window.__meetyBogoContext) window.__meetyBogoContext = {};
          window.__meetyBogoContext.isRedemption = true;
          console.log(LOG_PREFIX, 'Marked as redemption flow - no inventory tracking');
          
          st.giftExistingDurationLabel = label;
          st.skipServiceStep = true;
          
          // Check for Instagram mode
          const noCalendarMode = btn.getAttribute('data-bogo-no-calendar') === 'true';
          const instagramUrl = btn.getAttribute('data-bogo-instagram-url') || '#';
          
          if (noCalendarMode && instagramUrl && instagramUrl !== '#') {
            console.log(LOG_PREFIX, 'Redemption: Instagram mode enabled');
            
            // Get Instagram product and match variant by title
            const redeemProductHandle = btn.getAttribute('data-instagram-redeem-product');
            
            if (redeemProductHandle && redeemProductHandle !== '#') {
              // Fetch Instagram product to get correct variant ID
              fetch(`/products/${redeemProductHandle}.js`)
                .then(response => response.json())
                .then(product => {
                  if (product && product.variants) {
                    // Try to match variant by title
                    let matchedVariant = product.variants.find(v => 
                      v.title.toLowerCase() === label.toLowerCase() ||
                      v.title.toLowerCase().includes(label.toLowerCase())
                    );
                    
                    // If no match, use first variant
                    if (!matchedVariant) {
                      matchedVariant = product.variants[0];
                      console.warn(LOG_PREFIX, `No variant match for "${label}", using first variant`);
                    }
                    
                    console.log(LOG_PREFIX, 'Matched Instagram variant for redemption:', {
                      requestedLabel: label,
                      matchedVariantId: matchedVariant.id,
                      matchedVariantTitle: matchedVariant.title
                    });
                    
                    // Store the Instagram product variant (not calendar variant!)
                    st.instagramSelectedVariant = matchedVariant.id;
                    st.instagramSelectedVariantTitle = matchedVariant.title || label;
                    showInstagramExplanationStep(st, btn, instagramUrl);
                  }
                })
                .catch(error => {
                  console.error(LOG_PREFIX, 'Failed to fetch Instagram redeem product:', error);
                  // Fallback to calendar
                  proceedWithChosenCalendar(st, parsed);
                });
            } else {
              console.warn(LOG_PREFIX, 'Instagram mode enabled but no redeem product configured');
              // Fallback to calendar
              proceedWithChosenCalendar(st, parsed);
            }
          } else {
            // Normal calendar flow
            proceedWithChosenCalendar(st, parsed);
          }
        }
      }
    });
    formContainer.appendChild(continueBtn);
    const backBtn = document.createElement('div');
    backBtn.style.textAlign = 'center';
    backBtn.style.marginTop = '15px';
    const backButton = document.createElement('button');
    backButton.className = 'gift-card-btn secondary back-btn';
    backButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Back to Black Friday Options
    `;
    backButton.addEventListener('click', () => { renderBlackFridayChooser(st, btn); showStepChooser(st); });
    backBtn.appendChild(backButton);
    st.stepRedeem.append(title, subtitle, formContainer, backBtn);
    addDevInfo(st.stepRedeem, 'Gift Card Redemption (Regular)', 'renderGiftCardRedemptionFlow() - Non-BOGO');
    showStepRedeem(st);
  }
  function showStepChooser(st){ transitionToStep(st, st.stepChooser, { stepId: 'chooser' }); }
  function showStepService(st){ transitionToStep(st, st.stepService, { stepId: 'service' }); }
  function showStepBogoCategory(st){ transitionToStep(st, st.stepBogoCategory, { stepId: 'bogo-category' }); }
  
  /* Show Instagram Explanation Step (No-Calendar Mode) */
  function showInstagramExplanationStep(st, btn, instagramUrl) {
    console.log(LOG_PREFIX, 'Showing Instagram explanation step', {
      hasPreSelectedVariant: !!st.instagramSelectedVariant,
      variantId: st.instagramSelectedVariant,
      variantTitle: st.instagramSelectedVariantTitle
    });
    
    // Get the Instagram step (created during initialization)
    const instagramStep = st.stepInstagram;
    
    if (!instagramStep) {
      console.error(LOG_PREFIX, 'Instagram step not found in state!');
      return;
    }
    
    // Check if we already have a pre-selected variant from BOGO flow
    const hasPreSelectedVariant = !!(st.instagramSelectedVariant && st.instagramSelectedVariantTitle);
    
    console.log(LOG_PREFIX, 'Instagram mode - has pre-selected variant:', hasPreSelectedVariant);
    
    // Build service display HTML (either pre-selected from BOGO or dropdown for direct booking)
    const buildServiceDisplay = async () => {
      let serviceHTML = '';
      
      // If we have a pre-selected variant from BOGO flow, just display it
      if (hasPreSelectedVariant) {
        console.log(LOG_PREFIX, 'Using pre-selected BOGO variant:', st.instagramSelectedVariantTitle);
        serviceHTML = `
          <div style="background:#f8f9fa;border:2px solid #28a745;border-radius:8px;padding:16px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:600;color:#666;margin-bottom:4px;">Your Selected Service:</div>
            <div style="font-size:18px;font-weight:700;color:#28a745;">${st.instagramSelectedVariantTitle}</div>
          </div>
        `;
        return serviceHTML;
      }
      
      // No pre-selected variant - fetch product to build dropdown (legacy path for direct Instagram booking)
      const bookingProduct = btn.getAttribute('data-instagram-booking-product');
      const redeemProduct = btn.getAttribute('data-instagram-redeem-product');
      let productToFetch = null;
      
      if (st.serviceFlow === 'booking' || st.serviceFlow === 'bogo') {
        productToFetch = bookingProduct;
      } else if (st.serviceFlow === 'redeem') {
        productToFetch = redeemProduct;
      }
      
      if (productToFetch && productToFetch !== '#' && productToFetch.trim() !== '') {
        try {
          const response = await fetch(`/products/${productToFetch}.js`);
          const product = await response.json();
          
          if (product && product.variants && product.variants.length > 0) {
            const variants = product.variants.map(v => ({
              id: v.id,
              label: v.title !== 'Default Title' ? v.title : product.title,
              price: v.price / 100
            }));
            
            console.log(LOG_PREFIX, 'Loaded variants for dropdown:', variants.length, variants);
            
            if (variants.length > 1) {
              serviceHTML = `
                <div style="margin-bottom:20px;text-align:left;">
                  <label for="instagram-variant-select-${st.btnId}" style="display:block;margin-bottom:8px;font-size:14px;font-weight:600;color:#333;">
                    Select service duration:
                  </label>
                  <select 
                    id="instagram-variant-select-${st.btnId}"
                    class="instagram-variant-select"
                    style="
                      width:100%;
                      padding:12px;
                      border:2px solid #dee2e6;
                      border-radius:8px;
                      font-size:15px;
                      background:white;
                      cursor:pointer;
                      color:#495057;
                    "
                  >
                    ${variants.map((v, idx) => `<option value="${v.id}">${v.label} - $${v.price.toFixed(2)}</option>`).join('')}
                  </select>
                </div>
              `;
            } else if (variants.length === 1) {
              // Single variant - display it
              serviceHTML = `
                <div style="background:#f8f9fa;border:2px solid #28a745;border-radius:8px;padding:16px;margin-bottom:20px;">
                  <div style="font-size:14px;font-weight:600;color:#666;margin-bottom:4px;">Service:</div>
                  <div style="font-size:18px;font-weight:700;color:#28a745;">${variants[0].label} - $${variants[0].price.toFixed(2)}</div>
                </div>
              `;
            }
          }
        } catch (e) {
          console.error(LOG_PREFIX, 'Failed to fetch product variants:', e);
        }
      }
      
      return serviceHTML;
    };
    
    // Build and display Instagram explanation UI
    buildServiceDisplay().then(serviceHTML => {
      instagramStep.innerHTML = `
        <h2 style="font-size:24px;margin-bottom:16px;color:#333;text-align:center;">📅 Check Availability on Instagram</h2>
        
        <div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:20px;margin-bottom:20px;">
          <p style="font-size:15px;line-height:1.6;color:#495057;margin-bottom:16px;">
            Ashley's schedule varies and appointments are booked directly through Instagram.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#495057;margin:0;">
            Please check her Instagram for current availability and send a DM to schedule your appointment.
          </p>
        </div>
        
        ${serviceHTML}
        
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:20px;">
          <a href="${instagramUrl}" 
             target="_blank" 
             rel="noopener noreferrer"
             class="instagram-btn gift-card-btn secondary"
             style="display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;"
             >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            Check Instagram
          </a>
          
          <button type="button"
                  class="add-to-cart-btn gift-card-btn primary"
                  data-state-id="${st.btnId}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:6px;">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            Add to Cart
          </button>
        </div>
      `;
      
      // Attach event listeners
      const addToCartBtn = instagramStep.querySelector('.add-to-cart-btn');
      
      console.log(LOG_PREFIX, 'Instagram step: Attaching event listeners', {
        addToCartBtn: !!addToCartBtn,
        stateId: st.btnId
      });
      
      if (addToCartBtn) {
        // Remove any existing listeners by cloning
        const newAddToCartBtn = addToCartBtn.cloneNode(true);
        addToCartBtn.parentNode.replaceChild(newAddToCartBtn, addToCartBtn);
        
        newAddToCartBtn.addEventListener('click', function(e) {
          e.preventDefault();
          console.log(LOG_PREFIX, '🔵 Instagram Add to Cart button clicked!');
          handleInstagramAddToCart(this, st.btnId);
        });
        console.log(LOG_PREFIX, 'Add to Cart listener attached');
      } else {
        console.error(LOG_PREFIX, 'Add to Cart button not found in DOM!');
      }
      
      // Add back button at the bottom
      const backButtonContainer = createBackButton(st, { text: 'Back' });
      instagramStep.appendChild(backButtonContainer);
      
      // Show the Instagram step using proper transition
      st.currentStep = 'instagram-explanation';
      transitionToStep(st, instagramStep, { stepId: 'instagram-explanation' });
    });
  }

  /* Handle Add to Cart from Instagram Explanation Step */
  function handleInstagramAddToCart(buttonEl, stateId) {
    // Find the state object
    const overlay = document.getElementById('meety-popup-overlay-' + stateId);
    if (!overlay || !overlay.meetyState) {
      console.error(LOG_PREFIX, 'Could not find overlay state for Instagram add-to-cart');
      return;
    }
    
    const st = overlay.meetyState;
    const btn = st.button;
    
    if (!btn) {
      console.error(LOG_PREFIX, 'No button reference found in state');
      return;
    }
    
    console.log(LOG_PREFIX, 'Instagram mode: Adding service to cart');
    
    // Check if we have a pre-selected variant from BOGO flow
    let selectedVariantId = null;
    const serviceFlow = st.serviceFlow;
    
    if (st.instagramSelectedVariant) {
      // Use the variant that was selected in the BOGO flow
      selectedVariantId = st.instagramSelectedVariant;
      console.log(LOG_PREFIX, 'Using pre-selected BOGO variant:', selectedVariantId, st.instagramSelectedVariantTitle);
    } else {
      // Legacy path: determine product based on flow type
      console.log(LOG_PREFIX, 'No pre-selected variant, determining from flow type:', serviceFlow);
      
      if (serviceFlow === 'booking' || serviceFlow === 'bogo') {
        // "Book for Myself" flow - use instagram_booking_product
        const bookingProductHandle = btn.getAttribute('data-instagram-booking-product');
        if (bookingProductHandle && bookingProductHandle !== '#' && bookingProductHandle.trim() !== '') {
          console.log(LOG_PREFIX, 'Fetching booking product:', bookingProductHandle);
          selectedVariantId = 'FETCH:' + bookingProductHandle;
        }
      } else if (serviceFlow === 'redeem') {
        // "Redeem Gift Card" flow - use instagram_redeem_product
        const redeemProductHandle = btn.getAttribute('data-instagram-redeem-product');
        if (redeemProductHandle && redeemProductHandle !== '#' && redeemProductHandle.trim() !== '') {
          console.log(LOG_PREFIX, 'Fetching redeem product:', redeemProductHandle);
          selectedVariantId = 'FETCH:' + redeemProductHandle;
        }
      }
      
      // Fallback to calendar variant if no Instagram product configured
      if (!selectedVariantId || selectedVariantId === '#' || selectedVariantId.trim() === '') {
        const calendarData = btn.getAttribute('data-meety-data');
        if (calendarData && calendarData !== '#') {
          try {
            const calendarJson = parseJSONSafe(decodeEntities(calendarData));
            selectedVariantId = calendarJson?.variantId;
            console.log(LOG_PREFIX, 'Using fallback calendar variant:', selectedVariantId);
          } catch (e) {
            console.error(LOG_PREFIX, 'Failed to parse calendar data:', e);
          }
        }
      }
    }
    
    if (!selectedVariantId) {
      alert('Product variant not configured. Please contact support.');
      return;
    }
    
    // Get the tracking product handle and category (only for BOGO flows)
    const bogoCategory = btn.getAttribute('data-bogo-category');
    let trackingHandle = null;
    
    // Only add tracking products for BOGO flows, not standard bookings
    const isBogoFlow = st.bogoDetails || serviceFlow === 'bogo';
    
    if (isBogoFlow) {
      if (bogoCategory === 'tattoo') {
        trackingHandle = btn.getAttribute('data-bogo-track-tattoo');
      } else if (bogoCategory === 'piercings') {
        trackingHandle = btn.getAttribute('data-bogo-track-piercings');
      } else if (bogoCategory === 'tooth-gems') {
        trackingHandle = btn.getAttribute('data-bogo-track-tooth-gems');
      } else if (bogoCategory === 'teeth-whitening') {
        trackingHandle = btn.getAttribute('data-bogo-track-teeth-whitening');
      }
      console.log(LOG_PREFIX, 'BOGO flow detected, tracking handle:', trackingHandle);
    } else {
      console.log(LOG_PREFIX, 'Standard booking flow, no tracking product needed');
    }
    
    // Disable button to prevent double-click
    buttonEl.disabled = true;
    const originalText = buttonEl.innerHTML;
    buttonEl.innerHTML = '⏳ Adding...';
    
    // Set Instagram mode flag to prevent duplicate tracking in other functions
    if (!window.__meetyBogoContext) window.__meetyBogoContext = {};
    window.__meetyBogoContext.isInstagramMode = true;
    window.__meetyBogoContext.trackingAlreadyAdded = true; // Prevent gift card function from adding tracking
    
    // Helper function to build cart items and add to cart
    const buildAndAddToCart = function(finalVariantId) {
      console.log(LOG_PREFIX, 'Final selected variant ID:', finalVariantId);
      
      // Prepare cart items array with appropriate properties
      const flowTypeLabel = serviceFlow === 'redeem' ? 'Gift Card Redemption' : 
                           (isBogoFlow ? 'BOGO Booking' : 'Direct Booking');
      
      const cartItems = [{
        id: finalVariantId,
        quantity: 1,
        properties: {
          'Booking Type': 'Instagram Scheduled',
          'Instagram Booking': 'Please schedule via Instagram DM',
          'Flow Type': flowTypeLabel,
          'Artist': btn.textContent?.trim() || 'Ashley'
        }
      }];
      
      // Add BOGO-specific properties if applicable
      if (isBogoFlow && st.instagramSelectedVariantTitle) {
        cartItems[0].properties['Selected Service'] = st.instagramSelectedVariantTitle;
      }
    
      // Add tracking product if available
      if (trackingHandle && trackingHandle !== '#' && trackingHandle.trim() !== '') {
        console.log(LOG_PREFIX, 'Fetching tracking product:', trackingHandle);
        
        // Fetch tracking product variant ID
        fetch(`/products/${trackingHandle}.js`)
          .then(response => response.json())
          .then(productData => {
            if (productData && productData.variants && productData.variants[0]) {
              const trackingVariantId = productData.variants[0].id;
              console.log(LOG_PREFIX, 'Adding tracking product variant:', trackingVariantId);
              
              cartItems.push({
                id: trackingVariantId,
                quantity: 1,
                properties: {
                  'BOGO Inventory Tracker': 'true',
                  '_tracking': 'true',
                  '_category': bogoCategory,
                  '_Linked Service Variant': finalVariantId,
                  '_Service Type': 'Instagram Scheduled Booking'
                }
              });
            }
            
            // Add all items to cart
            return addItemsToCart(cartItems, buttonEl, originalText, st, btn);
          })
          .catch(error => {
            console.warn(LOG_PREFIX, 'Failed to fetch tracking product, adding service only:', error);
            // Add service without tracking product
            return addItemsToCart(cartItems, buttonEl, originalText, st, btn);
          });
      } else {
        // No tracking product configured, add service only
        console.log(LOG_PREFIX, 'No tracking product configured, adding service only');
        addItemsToCart(cartItems, buttonEl, originalText, st, btn);
      }
    };
    
    // Check if user selected a variant from dropdown
    const variantSelector = st.stepInstagram?.querySelector('.instagram-variant-select');
    let userSelectedVariantId = null;
    
    if (variantSelector) {
      userSelectedVariantId = variantSelector.value;
      console.log(LOG_PREFIX, 'User selected variant from dropdown:', userSelectedVariantId);
    }
    
    // If variant ID needs to be fetched from product handle, do that first
    if (typeof selectedVariantId === 'string' && selectedVariantId.startsWith('FETCH:')) {
      const productHandle = selectedVariantId.substring(6);
      console.log(LOG_PREFIX, 'Fetching product variant for handle:', productHandle);
      
      fetch(`/products/${productHandle}.js`)
        .then(response => response.json())
        .then(productData => {
          if (productData && productData.variants && productData.variants.length > 0) {
            let variantId;
            
            // Use user-selected variant if available, otherwise use first variant
            if (userSelectedVariantId) {
              variantId = parseInt(userSelectedVariantId, 10);
              console.log(LOG_PREFIX, 'Using user-selected variant:', variantId);
            } else {
              variantId = productData.variants[0].id;
              console.log(LOG_PREFIX, 'No dropdown selection, using first variant:', variantId);
            }
            
            buildAndAddToCart(variantId);
          } else {
            throw new Error('Product has no variants');
          }
        })
        .catch(error => {
          console.error(LOG_PREFIX, 'Failed to fetch Instagram product:', error);
          buttonEl.disabled = false;
          buttonEl.innerHTML = originalText;
          alert('Failed to load product. Please try again or contact support.');
        });
    } else {
      // Direct variant ID, use it immediately (unless dropdown has different selection)
      const finalVariantId = userSelectedVariantId ? parseInt(userSelectedVariantId, 10) : selectedVariantId;
      console.log(LOG_PREFIX, 'Using direct variant ID:', finalVariantId);
      buildAndAddToCart(finalVariantId);
    }
  }
  
  /* Helper function to add items to cart */
  function addItemsToCart(items, buttonEl, originalText, st, btn) {
    const btnId = st.btnId || btn.id.replace('meety-open-btn-', '');
    
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    })
    .then(response => {
      if (!response.ok) throw new Error('Cart add failed');
      return response.json();
    })
    .then((data) => {
      console.log(LOG_PREFIX, 'Instagram booking added to cart successfully:', data);
      
      // Store Instagram redirect flag in session storage
      const instagramUrl = btn.getAttribute('data-bogo-instagram-url');
      sessionStorage.setItem('meetyInstagramRedirect', 'true');
      sessionStorage.setItem('meetyInstagramUrl', instagramUrl);
      
      // Hide loading state on button
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalText;
      
      // Success modal function
      const showSuccessModal = () => {
        // Close the popup overlay first
        if (st && st.overlay) {
          st.overlay.style.display = 'none';
          console.log(LOG_PREFIX, 'Closed popup overlay before showing success modal');
        }
        showInstagramSuccessModal(btnId, instagramUrl, st);
      };
      
      // Watch for cart drawer to open (same pattern as gift card purchase)
      try {
        const cartDrawer = document.getElementById('CartDrawer');
        if (cartDrawer) {
          console.log(LOG_PREFIX, '👀 Setting up cart drawer observer for Instagram booking');
          
          // Check if it's already open
          if (cartDrawer.classList.contains('js-drawer-open')) {
            console.log(LOG_PREFIX, '🛒 Cart drawer already open, showing success modal');
            showSuccessModal();
          } else {
            // Create observer to watch for class changes
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                  if (cartDrawer.classList.contains('js-drawer-open')) {
                    console.log(LOG_PREFIX, '🛒 Cart drawer opened, showing Instagram success modal');
                    showSuccessModal();
                    observer.disconnect(); // Stop observing after success
                  }
                }
              });
            });
            
            observer.observe(cartDrawer, {
              attributes: true,
              attributeFilter: ['class']
            });
            
            console.log(LOG_PREFIX, '✅ Cart drawer observer active');
            
            // Fallback: if cart drawer doesn't open within 2 seconds, show modal anyway
            setTimeout(() => {
              const successOverlay = document.getElementById(`instagram-success-overlay-${btnId}`);
              if (!successOverlay) {
                console.log(LOG_PREFIX, '⏱️ Cart drawer timeout, showing success modal');
                showSuccessModal();
                observer.disconnect();
              }
            }, 2000);
          }
        } else {
          console.warn(LOG_PREFIX, '⚠️ Cart drawer not found, showing success modal immediately');
          showSuccessModal();
        }
      } catch (e) {
        console.error(LOG_PREFIX, '❌ Error setting up cart drawer observer:', e);
        showSuccessModal(); // Fallback to immediate display
      }
      
      // Use the SAME pattern as gift card purchase (lines 9910-9922)
      // Critical: Use theme.ajaxCart.update() with callback, NOT loadCart()
      setTimeout(() => {
        try {
          if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.update === 'function') {
            console.log(LOG_PREFIX, 'Updating cart via theme.ajaxCart.update()');
            theme.ajaxCart.update(() => openAjaxCartDrawer());
          } else if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.updateCart === 'function') {
            console.log(LOG_PREFIX, 'Updating cart via theme.ajaxCart.updateCart()');
            theme.ajaxCart.updateCart(() => { 
              waitForCartDrawerReady(3000).finally(() => openAjaxCartDrawer()); 
            });
          } else {
            console.log(LOG_PREFIX, 'Fallback: Manual cart fetch and refresh');
            fetch('/cart.js')
              .then(r => r.json())
              .then(j => { 
                try { 
                  document.dispatchEvent(new CustomEvent('cart:refreshed', { detail: j })); 
                } catch(_e){} 
              })
              .finally(() => openAjaxCartDrawer());
          }
        } catch(err) { 
          console.warn(LOG_PREFIX, 'ajaxCart.update failed', err); 
          openAjaxCartDrawer(); 
        }
      }, 250);
    })
    .catch(error => {
      console.error(LOG_PREFIX, 'Failed to add to cart:', error);
      alert('Failed to add to cart. Please try again.');
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalText;
    });
  }
  
  /* Show Instagram booking success modal */
  function showInstagramSuccessModal(btnId, instagramUrl, st) {
    console.log(LOG_PREFIX, '🎉 Showing Instagram booking success modal');
    
    // Create success overlay
    const overlay = document.createElement('div');
    overlay.id = `instagram-success-overlay-${btnId}`;
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 999999; 
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
        animation: fadeIn 0.3s ease-out;
      ">
        <div style="
          background: white;
          padding: 40px 50px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
          max-width: 500px;
          position: relative;
          animation: successPop 0.3s ease-out;
        ">
          <button onclick="document.getElementById('instagram-success-overlay-${btnId}').remove(); window.location.reload();" style="
            position: absolute;
            top: 15px;
            right: 15px;
            background: #f0f0f0;
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            color: #666;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
          " onmouseover="this.style.background='#e0e0e0'; this.style.color='#333';" onmouseout="this.style.background='#f0f0f0'; this.style.color='#666';">×</button>
          
          <div style="
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: linear-gradient(135deg, #E4405F 0%, #C13584 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          ">
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: checkmarkDraw 0.5s ease-out 0.2s both;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          
          <h3 style="
            margin: 0 0 10px;
            font-size: 22px;
            font-weight: 600;
            color: #333;
          ">✅ Added to Cart!</h3>
          
          <p style="
            margin: 0 0 10px;
            font-size: 14px;
            color: #666;
            line-height: 1.5;
          ">Your booking has been added to your cart.</p>
          
          <div style="
            background: #fff3e0;
            border: 2px solid #ff9800;
            border-radius: 8px;
            padding: 16px;
            margin: 20px 0;
          ">
            <p style="
              margin: 0 0 8px;
              font-size: 14px;
              color: #e65100;
              font-weight: 600;
            ">📱 Important: Schedule on Instagram</p>
            <p style="
              margin: 0;
              font-size: 13px;
              color: #666;
              line-height: 1.4;
            ">After checkout, visit Instagram to check availability and schedule your appointment.</p>
          </div>
          
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <a href="${instagramUrl}" 
               target="_blank" 
               rel="noopener noreferrer"
               style="
                 padding: 12px 24px;
                 background: linear-gradient(135deg, #E4405F 0%, #C13584 100%);
                 color: white;
                 border: none;
                 border-radius: 8px;
                 font-size: 14px;
                 font-weight: 600;
                 cursor: pointer;
                 text-decoration: none;
                 display: inline-block;
                 transition: all 0.3s ease;
                 box-shadow: 0 4px 12px rgba(228, 64, 95, 0.3);
               "
               onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(228, 64, 95, 0.4)';" 
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(228, 64, 95, 0.3)';">
              Check Instagram
            </a>
            <button onclick="document.getElementById('instagram-success-overlay-${btnId}').remove(); window.location.reload();" style="
              padding: 12px 24px;
              background: white;
              color: #667eea;
              border: 2px solid #667eea;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
            " onmouseover="this.style.background='#f5f7ff';" onmouseout="this.style.background='white';">
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes successPop {
          0% { 
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          100% { 
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes checkmarkDraw {
          0% {
            stroke-dasharray: 0, 100;
            opacity: 0;
          }
          100% {
            stroke-dasharray: 100, 100;
            opacity: 1;
          }
        }
      </style>
    `;
    document.body.appendChild(overlay);
  }

  /* Back button handler for Instagram step */
  function goBackFromInstagramStep(stateId) {
    const overlay = document.getElementById('meety-popup-overlay-' + stateId);
    if (!overlay || !overlay.meetyState) return;
    
    const st = overlay.meetyState;
    
    // Hide Instagram step
    if (st.stepInstagram) {
      st.stepInstagram.style.display = 'none';
    }
    
    // If we came from BOGO summary (have BOGO selection), go back to summary
    if (st.bogoSelection && st.stepBogoSummary) {
      console.log(LOG_PREFIX, 'Instagram back: returning to BOGO summary');
      showStepBogoSummary(st);
    } else {
      // Otherwise go back to chooser
      console.log(LOG_PREFIX, 'Instagram back: returning to chooser');
      showStepChooser(st);
    }
  }
  
  function showStepBogoFirst(st){ transitionToStep(st, st.stepBogoFirst, { stepId: 'bogo-first' }); }
  function showStepBogoSecond(st){ transitionToStep(st, st.stepBogoSecond, { stepId: 'bogo-second' }); }
  function showStepBogoSummary(st){ transitionToStep(st, st.stepBogoSummary, { stepId: 'bogo-summary' }); }
  function showStepCalendar(st){
    if (st.piercingGiftMode) { console.log(LOG_PREFIX, 'Calendar step suppressed (piercing gift mode)'); return; }
    
    // Check for Instagram mode (no-calendar) for non-BOGO standard bookings
    const btn = st.button;
    if (btn) {
      const noCalendarMode = btn.getAttribute('data-bogo-no-calendar') === 'true';
      const instagramUrl = btn.getAttribute('data-bogo-instagram-url') || '#';
      
      // Only use Instagram mode if not in BOGO flow
      if (noCalendarMode && instagramUrl && instagramUrl !== '#' && !st.bogoDetails) {
        console.log(LOG_PREFIX, 'Non-BOGO booking: Instagram mode enabled, showing Instagram step instead of calendar');
        
        // Get the selected service info from the widget
        const widget = st.active?.widgetEl;
        if (widget) {
          try {
            const selectedText = widget.querySelector('.meety-text')?.textContent?.trim();
            if (selectedText) {
              console.log(LOG_PREFIX, 'Captured selected service for Instagram mode:', selectedText);
              st.instagramSelectedVariantTitle = selectedText;
              
              // Try to get variant ID from the calendar data
              const calendarData = btn.getAttribute('data-meety-data');
              if (calendarData && calendarData !== '#') {
                const calendarJson = parseJSONSafe(decodeEntities(calendarData));
                if (calendarJson?.variantId) {
                  st.instagramSelectedVariant = calendarJson.variantId;
                  console.log(LOG_PREFIX, 'Using calendar variant ID for Instagram mode:', st.instagramSelectedVariant);
                }
              }
            }
          } catch (e) {
            console.warn(LOG_PREFIX, 'Failed to capture selected service for Instagram mode:', e);
          }
        }
        
        // Set booking flow
        st.serviceFlow = 'booking';
        
        // Show Instagram explanation step
        showInstagramExplanationStep(st, btn, instagramUrl);
        return;
      }
    }
    
    transitionToStep(st, st.stepCalendar, { stepId: 'calendar' });
    
    // Inject BOGO reminder note if this is a BOGO booking
    if (st.bogoDetails) {
      // Remove any stray duplicates first
      st.stepCalendar.querySelectorAll('.bogo-booking-reminder').forEach(n=>n.remove());
      if (!st.stepCalendar.querySelector('.bogo-booking-reminder')) {
      const note = document.createElement('div');
      note.className = 'meety-note bogo-booking-reminder';
      note.style.cssText = 'background: #e8f5e8; border: 1px solid #4caf50; padding: 10px; border-radius: 6px; margin-bottom: 15px;';
      if (st.bogoDetails.category === 'tattoo' && st.selectedTattooPaidHours) {
        const charged = st.bogoDetails.chargedService;
        const actual = (charged.price/100).toFixed(2);
        const doubled = (charged.price*2/100).toFixed(2);
        note.innerHTML = `
          <strong>🎉 BOGO Booking Confirmed!</strong><br>
          <span style="font-size: 13px;">
            Paying for: <strong>${charged.title}</strong> — <span style="text-decoration:line-through;color:#999;">$${doubled}</span> / <strong>$${actual}</strong><br>
            Time Doubling Applied: Paid ${st.selectedTattooPaidHours}h → ${st.selectedTattooTotalHours}h total (Save $${((charged.price||0)/100).toFixed(2)})
          </span>
        `;
      } else {
        note.innerHTML = `
          <strong>🎉 BOGO Booking Confirmed!</strong><br>
          <span style="font-size: 13px;">
            Paying for: <strong>${st.bogoDetails.chargedService.title}</strong> - $${(st.bogoDetails.chargedService.price / 100).toFixed(2)}<br>
            Getting FREE: <strong>${st.bogoDetails.freeService.title}</strong> - 
            <span style="text-decoration:line-through;color:#999;">$${(st.bogoDetails.freeService.price / 100).toFixed(2)}</span> <span style="color: #4caf50;">FREE (Save $${st.bogoDetails.totalSavings.toFixed(2)})</span>
          </span>
        `;
      }
      st.stepCalendar.prepend(note);
      }
    }
    
    // Inject reminder note for existing gift card flow (once)
    if (st.giftExistingFlow) {
      if (!st.stepCalendar.querySelector('.gift-existing-reminder')) {
        const note = document.createElement('div');
        note.className = 'meety-note gift-existing-reminder';
        const label = st.giftExistingDurationLabel ? ` (${st.giftExistingDurationLabel})` : '';
        note.style.cssText = 'font-size:11.5px;margin:18px 4px 2px;color:#777;text-align:center;line-height:1.35;';
  note.textContent = `Reminder: Enter your gift card code at checkout to apply its value${label}.`;
        st.stepCalendar.appendChild(note);
      }
    }
  }
  function showStepGiftPurchase(st){ transitionToStep(st, st.stepGiftPurchase, { stepId: 'gift-purchase' }); }
  function showStepGiftGems1(st){ transitionToStep(st, st.stepGiftGemsOne, { stepId: 'gift-gems-1' }); }
  function showStepGiftGems2(st){ transitionToStep(st, st.stepGiftGemsTwo, { stepId: 'gift-gems-2' }); }
  function showStepGiftGems3(st){ transitionToStep(st, st.stepGiftGemsThree, { stepId: 'gift-gems-3' }); }

  function startToothGemsGiftFlow(st, btn, mode='purchase'){
    // Initialize selection state (variant resolved later)
    st.giftGems = { style:null, placement:null, variantId:null, variantTitle:null };
    st.giftRedeemMode = (mode === 'redeem');
    
    // CRITICAL FIX: For redemption flows, mark the BOGO context to prevent tracking
    if (st.giftRedeemMode && window.__meetyBogoContext) {
      console.log(LOG_PREFIX, '🎫 TOOTH GEMS REDEMPTION: Marking BOGO context to prevent tracking');
      window.__meetyBogoContext.isRedemption = true;
      window.__meetyBogoContext.isGiftPurchase = false;
    }
    
    buildGemsStep1(st, btn);
    const finishBtn = st.stepGiftGemsThree.querySelector('.gems3-finish');
    if(finishBtn){ finishBtn.textContent = st.giftRedeemMode ? 'Continue to Booking Calendar' : 'Continue to Gift Details'; }
    showStepGiftGems1(st);
  }

  function buildGemsStep1(st, btn){
    const root = st.stepGiftGemsOne.querySelector('.gems-style-options');
    root.innerHTML='';
    const styles = [
      { key:'single', label:'Single Gem', desc:'One brilliant tooth gem' },
      { key:'pair', label:'Gem Pair', desc:'Two matching gems' },
      { key:'cluster', label:'Cluster / Set', desc:'Multi-stone artistic set' },
    ];
    styles.forEach(s=>{
      const b=document.createElement('button');
      b.className='gift-card-btn booking-detail-btn';
      b.innerHTML=`<div style="text-align:left"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">${s.label}</div><div style="font-size:12px;opacity:.8;line-height:1.3;">${s.desc}</div></div>`;
      b.addEventListener('click',()=>{
        st.giftGems.style = s.key;
        root.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        st.stepGiftGemsOne.querySelector('.gems1-continue').disabled=false;
      });
      root.appendChild(b);
    });
    const cont = st.stepGiftGemsOne.querySelector('.gems1-continue');
    cont.disabled = !st.giftGems.style;
    cont.onclick=()=>{ buildGemsStep2(st, btn); showStepGiftGems2(st); };
    st.stepGiftGemsOne.querySelector('.gems1-cancel').onclick=()=>{ showStepChooser(st); };
  }

  function buildGemsStep2(st, btn){
    const root = st.stepGiftGemsTwo.querySelector('.gems-placement-options');
    root.innerHTML='';
    const placements = [
      { key:'upper-front', label:'Upper Front', desc:'Visible bright smile zone'},
      { key:'lower-front', label:'Lower Front', desc:'Subtle sparkle lower row'},
      { key:'canine', label:'Canine Tooth', desc:'Edgy focal accent'},
      { key:'custom', label:'Custom / Other', desc:'We will confirm during booking'},
    ];
    placements.forEach(p=>{
      const b=document.createElement('button');
      b.className='gift-card-btn booking-detail-btn';
      b.innerHTML=`<div style="text-align:left"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">${p.label}</div><div style="font-size:12px;opacity:.8;line-height:1.3;">${p.desc}</div></div>`;
      b.addEventListener('click',()=>{
        st.giftGems.placement = p.key;
        root.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        st.stepGiftGemsTwo.querySelector('.gems2-continue').disabled=false;
      });
      root.appendChild(b);
    });
    st.stepGiftGemsTwo.querySelector('.gems2-back').onclick=()=>{ goBackStep(st); };
    const cont = st.stepGiftGemsTwo.querySelector('.gems2-continue');
    cont.disabled = !st.giftGems.placement;
    cont.onclick=()=>{ buildGemsStep3(st, btn); showStepGiftGems3(st); };
  }

  function buildGemsStep3(st, btn){
    const sum = st.stepGiftGemsThree.querySelector('.gems-summary-box');
    sum.innerHTML = `<strong>Selected Style:</strong> ${st.giftGems.style}<br><strong>Placement:</strong> ${st.giftGems.placement}<br><br>${st.giftRedeemMode ? 'We will book an appropriate session next.' : 'We will match this to the best gift card variant. You can leave extra notes in the next step.'}`;
    st.stepGiftGemsThree.querySelector('.gems3-back').onclick=()=>{ goBackStep(st); };
    st.stepGiftGemsThree.querySelector('.gems3-finish').onclick=async ()=>{
      await ensureToothGemVariantMapping(st, btn);
      if(st.giftRedeemMode){
        const rawCal = btn.getAttribute('data-meety-data');
        const baseCal = rawCal ? parseJSONSafe(decodeEntities(rawCal)) : null;
        const calWithVariant = modifyCalendarVariant(baseCal, st.giftGems.variantId);
        if(calWithVariant){
          st.skipServiceStep = true;
          await proceedWithChosenCalendar(st, calWithVariant);
        } else {
          console.warn(LOG_PREFIX,'Tooth gems redeem: missing calendar or variant');
        }
        return;
      }
      showStepGiftPurchase(st);
      setupGiftPurchaseForm(st, btn, { toothGems: true });
      try {
        const form = st.stepGiftPurchase.querySelector('.gift-form');
        if(form && !form.querySelector('.gems-summary-chip')){
          const chip = document.createElement('div');
          chip.className='gems-summary-chip';
          chip.style.cssText='background:#eef5ff;border:1px solid #c7dbf5;padding:6px 10px;border-radius:18px;font-size:12px;display:inline-flex;gap:6px;align-items:center;margin:0 0 12px 0;';
          const vt = st.giftGems.variantTitle ? ` • ${st.giftGems.variantTitle}` : '';
          chip.innerHTML = `<span style=\"font-weight:600;\">Tooth Gems:</span> ${st.giftGems.style.replace(/-/g,' ')} @ ${st.giftGems.placement.replace(/-/g,' ')}${vt}`;
          form.prepend(chip);
        }
      } catch(e){}
    };
  }

  function showStepGiftWhiteningSummary(st){ transitionToStep(st, st.stepGiftWhiteningSummary, { stepId: 'gift-whitening-summary' }); }

  function buildWhiteningGiftSummary(st, btn){
    st.giftWhitening = { variantId: null, variantTitle: 'Teeth Whitening Session'};
    const backBtn = st.stepGiftWhiteningSummary.querySelector('.whitening-summary-back');
    const contBtn = st.stepGiftWhiteningSummary.querySelector('.whitening-summary-continue');
    if(backBtn){
      backBtn.onclick = ()=>{
        // Use universal back system for better navigation consistency
        goBackStep(st);
      };
    }
    if(contBtn){ contBtn.onclick = ()=>{ showStepGiftPurchase(st); setupGiftPurchaseForm(st, btn); }; }
  }

  function getInferredTrackingCategory(btn) {
    if (!btn) return null;
    
    const trackingHandles = {
      'tattoo': btn.getAttribute('data-bogo-track-tattoo'),
      'piercings': btn.getAttribute('data-bogo-track-piercings'),
      'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
      'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
    };
    
    // Filter out empty handles
    const validCategories = Object.entries(trackingHandles)
      .filter(([cat, handle]) => handle && handle.trim() !== '' && handle !== '#')
      .map(([cat]) => cat);
    
    console.log(LOG_PREFIX, 'getInferredTrackingCategory analysis:', {
      buttonId: btn.id,
      trackingHandles,
      validCategories
    });
    
    // If only one category has tracking configured, use it
    if (validCategories.length === 1) {
      return validCategories[0];
    }
    
    // If multiple categories, try to infer from button context or product info
    if (validCategories.length > 1) {
      const buttonClasses = btn.className || '';
      const buttonId = btn.id || '';
      
      // Check for category hints in button ID/classes
      if ((buttonClasses.includes('tattoo') || buttonId.includes('tattoo')) && validCategories.includes('tattoo')) {
        return 'tattoo';
      } else if ((buttonClasses.includes('piercing') || buttonId.includes('piercing')) && validCategories.includes('piercings')) {
        return 'piercings';
      } else if ((buttonClasses.includes('gem') || buttonId.includes('gem')) && validCategories.includes('tooth-gems')) {
        return 'tooth-gems';
      } else if ((buttonClasses.includes('whitening') || buttonId.includes('whitening')) && validCategories.includes('teeth-whitening')) {
        return 'teeth-whitening';
      }
      
      // Default to first available category if no specific hints found
      console.warn(LOG_PREFIX, 'Multiple tracking categories but no clear hints - defaulting to first:', validCategories[0]);
      return validCategories[0];
    }
    
    return null;
  }

  function startGiftFlow(st, btn, forcedSubtype){
    if(forcedSubtype) st.giftSubtype = forcedSubtype;
    const bogoCategory = btn.getAttribute('data-bogo-category') || '';
    // If parent dual category and not chosen, show chooser
    if(bogoCategory === 'gems-whitening' && !st.giftSubtype && !st.__gemsWhiteningChosen){
      showGemsWhiteningChooser(st, btn, ()=>{ st.giftSubtype = st.__gemsWhiteningChosen; startGiftFlow(st, btn); });
      return;
    }
    st.giftSubtype = st.giftSubtype || st.__gemsWhiteningChosen || bogoCategory || null;
    if(st.giftSubtype === 'tooth-gems') { startToothGemsGiftFlow(st, btn); return; }
    if(st.giftSubtype === 'teeth-whitening'){ buildWhiteningGiftSummary(st, btn); showStepGiftWhiteningSummary(st); return; }
    showStepGiftPurchase(st); setupGiftPurchaseForm(st, btn);
  }
  function showStepRedeem(st){ transitionToStep(st, st.stepRedeem, { stepId: 'redeem' }); }
  function showStepTattooHours(st){ transitionToStep(st, st.stepTattooHours, { stepId: 'tattoo-hours' }); }

  /* NEW: Tattoo Gift Hour Chooser (mode: 'purchase' | 'redeem') */
  async function showTattooGiftHourChooser(st, btn, mode){
    const wrap = st.stepTattooHours.querySelector('.tattoo-hours-options');
    wrap.innerHTML = '';
    // Respect Sold Out from liquid total if present
    const liquidTotalRaw = btn.getAttribute('data-bogo-tattoo-liquid-total');
    const liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
    // Only block purchase when sold out; redemption must remain available
    if (!isNaN(liquidTotal) && liquidTotal <= 0 && mode !== 'redeem') {
      wrap.innerHTML = '<div style="font-size:13px;color:#7f1d1d;background:#fef2f2;border:1px solid #dc2626;padding:10px;border-radius:6px;text-align:center;">Tattoo BOGO gift cards are sold out.</div>';
      showStepTattooHours(st);
      return;
    }
    // Dynamic heading / description based on mode
    const heading = st.stepTattooHours.querySelector('h3');
    const desc = st.stepTattooHours.querySelector('p');
    if (mode === 'redeem') {
      if (heading) heading.textContent = 'Select the services your gift card covers';
      if (desc) desc.textContent = 'Choose the paid hours listed on the tattoo gift card. We automatically book the full doubled session. Enter the gift card code at checkout to apply its value.';
    } else {
      if (heading) heading.textContent = 'Select Tattoo Hours';
      if (desc) desc.textContent = 'Choose how many hours you are buying. Promo doubles session time automatically.';
    }

  // Fetch product data to get variant prices
  const productHandle = btn.getAttribute('data-bogo-product-handle') || btn.getAttribute('data-gift-product-handle');
  let variantPrices = {};
  
  if (productHandle && mode === 'purchase') {
    try {
      const productData = await fetchProductByHandleCached(productHandle);
      if (productData && productData.variants) {
        productData.variants.forEach(v => {
          variantPrices[v.id] = v.price / 100; // Convert cents to dollars
        });
        console.log(LOG_PREFIX, 'Loaded variant prices for tattoo options:', {
          productHandle,
          variantPrices,
          allVariants: productData.variants.map(v => ({ id: v.id, title: v.title, price: v.price / 100 }))
        });
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'Could not fetch product data for tattoo pricing:', e);
    }
  }

  // Variants: purchase flow uses data-gift-variant-* (legacy), previous code looked for data-gift-card-variant-* (incorrect)
  const v1 = btn.getAttribute('data-gift-variant-1') || btn.getAttribute('data-gift-card-variant-1');
  const v2 = btn.getAttribute('data-gift-variant-2') || btn.getAttribute('data-gift-card-variant-2');
  const v3 = btn.getAttribute('data-gift-variant-3') || btn.getAttribute('data-gift-card-variant-3');
  
  console.log(LOG_PREFIX, 'Tattoo variant IDs from button attributes:', { v1, v2, v3 });
  
  // Labels: support both data-gift-label-* and data-gift-duration-label-* for flexibility
  const l1 = btn.getAttribute('data-gift-label-1') || btn.getAttribute('data-gift-duration-label-1') || '1 Hour';
  const l2 = btn.getAttribute('data-gift-label-2') || btn.getAttribute('data-gift-duration-label-2') || '2 Hours';
  const l3 = btn.getAttribute('data-gift-label-3') || btn.getAttribute('data-gift-duration-label-3') || '3 Hours';
    const c1 = btn.getAttribute('data-gift-calendar-1');
    const c2 = btn.getAttribute('data-gift-calendar-2');
    const c3 = btn.getAttribute('data-gift-calendar-3');

    const opts = [
      {hours:1, variant:v1, label:l1, calendar:c1, doubled:2},
      {hours:2, variant:v2, label:l2, calendar:c2, doubled:4},
      {hours:3, variant:v3, label:l3, calendar:c3, doubled:6}
    ]
    .filter(o => !(o.hours === 1 && isTattoo1hDisabled()))
    .filter(o=> {
      if (mode === 'purchase') {
        // Purchase mode: check if variant exists
        return o.variant && o.variant !== '#' && o.variant !== '';
      } else {
        // Redeem mode: check if calendar exists
        return o.calendar && o.calendar !== '#' && o.calendar !== '';
      }
    });

    if(!opts.length){
      wrap.innerHTML = '<div style="font-size:12px;color:#a00;text-align:center;">No tattoo gift tiers configured.</div>';
      console.warn(LOG_PREFIX, 'Tattoo gift tiers missing or filtered out', { mode, v1, v2, v3, c1, c2, c3 });
      showStepTattooHours(st);
      return;
    }

    opts.forEach(o=>{
      const b = document.createElement('button');
      b.type='button';
      b.className='gift-card-btn booking-detail-btn';
      b.style.display='flex';
      b.style.justifyContent='space-between';
      b.style.alignItems='center';
      
      // Get price for this variant
      const variantPrice = variantPrices[o.variant];
      console.log(LOG_PREFIX, `Price lookup for variant ${o.variant} (${o.hours}h):`, variantPrice);
      const priceDisplay = variantPrice ? `<div style="font-size:14px;font-weight:600;color:#16a34a;margin-top:4px;">$${variantPrice.toFixed(2)}</div>` : '<div style="font-size:12px;color:#dc2626;margin-top:4px;">Price not found</div>';
      
      if (mode==='redeem') {
        b.innerHTML = `
          <div style=\"text-align:left;flex:1;\">
            <div style=\"font-weight:600;font-size:15px;margin-bottom:4px;\">Gift Card: ${o.hours} Paid Hour${o.hours>1?'s':''}</div>
            <div style=\"font-size:12px;opacity:.8;line-height:1.3;\">Books ${o.doubled} total hours (${o.doubled-o.hours} FREE already included)</div>
          </div>
          <div style=\"font-size:11px;padding:4px 8px;background:#111;color:#fff;border-radius:14px;letter-spacing:.5px;\">x2 TIME</div>`;
      } else {
        b.innerHTML = `
          <div style=\"text-align:left;flex:1;\">
            <div style=\"font-weight:600;font-size:15px;margin-bottom:4px;\">Pay ${o.hours} Hour${o.hours>1?'s':''} → Get ${o.doubled} Hours</div>
            <div style=\"font-size:12px;opacity:.8;line-height:1.3;\">${o.doubled-o.hours} hour${o.doubled-o.hours>1?'s':''} FREE with promotion</div>
            ${priceDisplay}
          </div>
          <div style=\"font-size:11px;padding:4px 8px;background:#111;color:#fff;border-radius:14px;letter-spacing:.5px;\">x2 TIME</div>`;
      }
      b.addEventListener('click', ()=>{
        if (mode==='purchase'){
          st.pendingTattooGiftVariant = o.variant;
          st.tattooGiftPurchaseHours = o.hours;
          st.tattooGiftPurchaseLabel = `Pay ${o.hours}h → ${o.doubled}h`;
          showStepGiftPurchase(st);
          setupGiftPurchaseForm(st, btn);
        } else {
          const parsed = parseJSONSafe(decodeEntities(o.calendar));
          if (parsed){
            st.giftExistingFlow = true;
            st.giftRedeemMode = true;
            st.serviceFlow = 'redeem';
            
            // Set redemption flag to exclude tracking
            if (!window.__meetyBogoContext) window.__meetyBogoContext = {};
            window.__meetyBogoContext.isRedemption = true;
            console.log(LOG_PREFIX, 'Marked as redemption flow - no inventory tracking');
            
            st.giftExistingDurationLabel = `Tattoo Gift – ${o.hours}h (Redeem → ${o.doubled}h)`;
            
            // Store tattoo hours for auto-selection (same format as BOGO flow)
            st.selectedTattooPaidHours = o.hours;
            st.selectedTattooTotalHours = o.doubled;
            st.tattooRedemptionAutoSelect = getTattooServiceTextFromHours(o.hours, o.doubled);
            
            console.log(LOG_PREFIX, 'Tattoo redemption: stored hours for auto-selection:', {
              paidHours: o.hours,
              totalHours: o.doubled,
              autoSelectText: st.tattooRedemptionAutoSelect
            });
            
            // Check for Instagram mode
            const noCalendarMode = btn.getAttribute('data-bogo-no-calendar') === 'true';
            const instagramUrl = btn.getAttribute('data-bogo-instagram-url') || '#';
            
            if (noCalendarMode && instagramUrl && instagramUrl !== '#') {
              console.log(LOG_PREFIX, 'Tattoo redemption: Instagram mode enabled');
              
              // Get Instagram product and match variant by title
              const redeemProductHandle = btn.getAttribute('data-instagram-redeem-product');
              
              if (redeemProductHandle && redeemProductHandle !== '#') {
                // Fetch Instagram product to get correct variant ID
                fetch(`/products/${redeemProductHandle}.js`)
                  .then(response => response.json())
                  .then(product => {
                    if (product && product.variants) {
                      // Try to match variant by title - must match "Pay for X Hour" at the start
                      let matchedVariant = product.variants.find(v => {
                        const titleLower = v.title.toLowerCase();
                        // Match "pay for X hour" at the beginning of the title
                        const payForPattern = new RegExp(`^pay for ${o.hours} hour`, 'i');
                        return payForPattern.test(titleLower);
                      });
                      
                      // If no match, use first variant
                      if (!matchedVariant) {
                        matchedVariant = product.variants[0];
                        console.warn(LOG_PREFIX, `No variant match for "Pay for ${o.hours} hour", using first variant`);
                      }
                      
                      console.log(LOG_PREFIX, 'Matched Instagram variant:', {
                        requestedHours: o.hours,
                        requestedLabel: o.label,
                        matchedVariantId: matchedVariant.id,
                        matchedVariantTitle: matchedVariant.title
                      });
                      
                      // Store the Instagram product variant (not calendar variant!)
                      st.instagramSelectedVariant = matchedVariant.id;
                      st.instagramSelectedVariantTitle = matchedVariant.title || o.label;
                      showInstagramExplanationStep(st, btn, instagramUrl);
                    }
                  })
                  .catch(error => {
                    console.error(LOG_PREFIX, 'Failed to fetch Instagram redeem product:', error);
                    // Fallback to calendar
                    st.skipServiceStep = false;
                    proceedWithChosenCalendar(st, parsed);
                  });
              } else {
                console.warn(LOG_PREFIX, 'Instagram mode enabled but no redeem product configured');
                // Fallback to calendar
                st.skipServiceStep = false;
                proceedWithChosenCalendar(st, parsed);
              }
            } else {
              // Normal calendar flow - don't skip service step for tattoos
              st.skipServiceStep = false;
              proceedWithChosenCalendar(st, parsed);
            }
          }
        }
      });
      wrap.appendChild(b);
    });

    // Redemption reminder footer
    let reminder = st.stepTattooHours.querySelector('.tattoo-redeem-reminder');
    if (mode==='redeem') {
      if (!reminder){
        reminder = document.createElement('div');
        reminder.className = 'tattoo-redeem-reminder';
        reminder.style.cssText = 'margin-top:18px;font-size:11px;color:#666;text-align:center;line-height:1.4;';
        st.stepTattooHours.insertBefore(reminder, st.stepTattooHours.querySelector('.tattoo-hours-back-btn').parentNode);
      }
      // Include expiration note for redemption, underlined per request
  reminder.innerHTML = 'Reminder: You\'ll enter your gift card code at checkout to apply its value to this booking.<br><u>Expiration date: January 31, 2026</u>';
    } else if (reminder) {
      reminder.remove();
    }

    const backBtn = st.stepTattooHours.querySelector('.tattoo-hours-back-btn');
    if (backBtn){
      backBtn.onclick = ()=>{
        // Use universal back system for consistent navigation
        goBackStep(st);
      };
    }

    showStepTattooHours(st);
  }
  
  /* Add Dev Info Helper */
  function addDevInfo(container, stepName, additionalInfo = '') {
    // Dev info disabled for production
    // Uncomment below to show debug information during development
    /*
    const devInfo = document.createElement('div');
    devInfo.style.cssText = 'margin-top:20px;padding:8px;background:#f0f0f0;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#666;text-align:center;';
    devInfo.innerHTML = `<strong>Dev Info:</strong> ${stepName}${additionalInfo ? ' | ' + additionalInfo : ''}`;
    container.appendChild(devInfo);
    */
  }

  /* Show Gems-Whitening Chooser Helper */
  function showGemsWhiteningChooser(st, btn, onComplete) {
    // Build a transient step container to enable animated transition rather than instantaneous innerHTML swap
    const tempStep = document.createElement('div');
    tempStep.className = 'meety-step meety-step-gemswhitening';
    tempStep.style.display = 'block';
    tempStep.style.maxWidth = '680px';
    tempStep.style.margin = '0 auto';
    tempStep.style.padding = '12px 12px 16px';
    tempStep.style.border = '1px solid #eee';
    tempStep.style.borderRadius = '8px';
    
    const title = document.createElement('h3');
    title.textContent = 'Select Service Type';
    title.style.textAlign = 'center';
    title.style.color = '#000';
    
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Choose what type of services your gift card will cover:';
    subtitle.style.cssText = 'text-align:center;color:#666;margin-bottom:20px;';
    
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'gift-card-options';
    optionsContainer.style.cssText = 'max-width:420px;margin:20px auto;display:flex;flex-direction:column;gap:16px;';
    
    const btnGems = document.createElement('button');
    btnGems.className = 'gift-card-btn booking-detail-btn';
    btnGems.innerHTML = `<div style="text-align:left;"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">💎 Tooth Gems Services</div><div style="font-size:12px;opacity:.8;line-height:1.3;">Single gems or gem sets</div></div>`;
    btnGems.addEventListener('click', () => {
      if (st._transitioning) return; // guard
      console.log(LOG_PREFIX, 'Gems chosen in gift chooser');
      st.__gemsWhiteningChosen = 'tooth-gems';
      // Animate out then proceed
      transitionToStep(st, st.stepChooser, { stepId: 'chooser' }); // ensure base chooser is set for next render
      if (onComplete) onComplete();
    });
    
    const btnWhite = document.createElement('button');
    btnWhite.className = 'gift-card-btn booking-detail-btn';
    btnWhite.innerHTML = `<div style="text-align:left;"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">✨ Teeth Whitening Services</div><div style="font-size:12px;opacity:.8;line-height:1.3;">Professional whitening treatments</div></div>`;
    btnWhite.addEventListener('click', () => {
      if (st._transitioning) return;
      console.log(LOG_PREFIX, 'Whitening chosen in gift chooser');
      st.__gemsWhiteningChosen = 'teeth-whitening';
      transitionToStep(st, st.stepChooser, { stepId: 'chooser' });
      if (onComplete) onComplete();
    });
    
    optionsContainer.append(btnGems, btnWhite);
    tempStep.append(title, subtitle, optionsContainer);
    addDevInfo(tempStep, 'Gift Gems/Whitening Chooser', 'showGemsWhiteningChooser()');

    // Insert temp step into overlay body if not already
    const body = st.bodyEl || document.querySelector('#meety-popup-body-' + st.sectionId);
    if (body && !tempStep.parentNode) body.appendChild(tempStep);

    // Use transitionToStep for animation
    transitionToStep(st, tempStep);
    st._tempGemsWhiteningStep = tempStep;
  }

  function cleanupActive(st){
    if (st.active) {
      const { sectionEl, placeholder, widgetEl } = st.active;
      
      // Restore original meety-data if we modified it for BOGO
      if (st.originalMeetyData && widgetEl) {
        widgetEl.setAttribute('meety-data', st.originalMeetyData);
        console.log(LOG_PREFIX, 'Restored original meety-data');
        st.originalMeetyData = null;
      }
      
      // Enhanced cleanup for inline widgets and popup elements
      if (widgetEl) {
        // Remove BOGO inline elements
        const bogoElements = widgetEl.querySelectorAll('.meety-bogo-free-service-inline, .meety-bogo-summary-item');
        bogoElements.forEach(el => el.remove());
        
        // Clean up any Meety popups, overlays, and inline elements
        const meetyPopups = widgetEl.querySelectorAll('.popup-content, .meety-popover-content, .popup-overlay, .meety-popover-overlay');
        meetyPopups.forEach(el => {
          try {
            el.remove();
          } catch(e) {
            el.style.display = 'none';
          }
        });
        
        // Reset any modified widget attributes
        const modifiedAttributes = ['data-bogo-modified', 'data-temp-variant'];
        modifiedAttributes.forEach(attr => {
          if (widgetEl.hasAttribute(attr)) {
            widgetEl.removeAttribute(attr);
          }
        });
        
        // Force close any open Meety service selections
        const serviceSelectors = widgetEl.querySelectorAll('[aria-expanded="true"], .is-open, .active');
        serviceSelectors.forEach(el => {
          el.setAttribute('aria-expanded', 'false');
          el.classList.remove('is-open', 'active');
        });
      }
      
      if (placeholder && placeholder.parentNode) { 
        placeholder.parentNode.insertBefore(sectionEl, placeholder); 
        placeholder.remove(); 
      }
      sectionEl.style.display = '';
      st.active = null;
    }
    
    // Enhanced global cleanup
    const meetyOverlay = getMeetyOverlay(); 
    if (meetyOverlay) { 
      try {
        meetyOverlay.click?.(); 
      } catch(e) {
        meetyOverlay.style.display = 'none';
      }
    }
    
    // Clean up any stray Meety popups across the entire page
    document.querySelectorAll('.popup-content.meety-popover-content, .popup-overlay.meety-popover-overlay').forEach(el => {
      try {
        el.remove();
      } catch(e) {
        el.style.display = 'none';
      }
    });
    
    restoreAllDisplays(); 
    hideAllCalendarsOutsideOverlays();
    
    // Perform additional global cleanup
    setTimeout(() => {
      forceCleanupAllMeetyElements();
    }, 200);
  }

  /* Handle service flow based on selected type */
  async function proceedWithServiceFlow(st, btn) {
    if (!st.chooserConfig) {
      console.error(LOG_PREFIX, 'proceedWithServiceFlow: No chooser config found');
      return;
    }
    
    // Enhanced state validation to prevent wrong path navigation
    const currentStep = st.currentStepId || 'unknown';
    console.log(LOG_PREFIX, 'proceedWithServiceFlow: starting from step', currentStep, {
      serviceFlow: st.serviceFlow,
      selectedServiceType: st.selectedServiceType,
      giftRedeemMode: st.giftRedeemMode,
      bogoDetails: !!st.bogoDetails
    });
    
    // Check if this is a BOGO category
    const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
    const forceBogoMode = (st.serviceUiMode === 'bogo');
    
    if ((forceBogoMode || bogoCategory !== 'none')) {
      if (isBogoSoldOut(st, btn)) {
        console.log(LOG_PREFIX, 'Service flow BOGO blocked: sold out');
        try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); }
        return;
      }
      
      // Validate BOGO flow state before proceeding
      const validBogoStates = ['promo', 'bogo'];
      const isValidBogoState = st.selectedServiceType === 'promo' || forceBogoMode || validBogoStates.includes(st.serviceFlow);
      
      if (isValidBogoState) {
        console.log(LOG_PREFIX, 'proceedWithServiceFlow: triggering BOGO flow', { 
          forceBogoMode, 
          bogoCategory, 
          selectedServiceType: st.selectedServiceType,
          serviceFlow: st.serviceFlow
        });
        await setupBogoFlow(st, btn);
        return;
      } else {
        console.log(LOG_PREFIX, 'proceedWithServiceFlow: BOGO present but not in valid context', { 
          forceBogoMode, 
          bogoCategory, 
          selectedServiceType: st.selectedServiceType,
          serviceFlow: st.serviceFlow
        });
      }
    }
    
    const {json1, json2, cal1Label, cal2Label, chooserMode} = st.chooserConfig;
    
    // Validate that we have proper calendar configurations
    if (!json1 && !json2) {
      console.error(LOG_PREFIX, 'proceedWithServiceFlow: No valid calendar configurations found');
      showStepService(st);
      return;
    }
    
    if (chooserMode === 'dropdown' || chooserMode === 'auto') {
      // For tattoo service, show dropdown to choose between calendars
      console.log(LOG_PREFIX, 'proceedWithServiceFlow: showing calendar chooser');
      renderChooser(st, btn, {json1, json2, cal1Label, cal2Label, chooserMode: 'dropdown'});
    } else {
      // Direct navigation to calendar
      const selectedCalendar = json1 || json2;
      if (!selectedCalendar) {
        console.error(LOG_PREFIX, 'proceedWithServiceFlow: No calendar available for direct navigation');
        showStepService(st);
        return;
      }
      
      console.log(LOG_PREFIX, 'proceedWithServiceFlow: proceeding with direct calendar');
      await proceedWithChosenCalendar(st, selectedCalendar);
    }
  }

  /* Setup BOGO Flow */
  async function setupBogoFlow(st, btn) {
    let bogoCategory = st.inferredBogoCategory || btn.getAttribute('data-bogo-category');
    
    // If gems-whitening was chosen, use the selected subcategory
    if (bogoCategory === 'gems-whitening') {
      if (st.__gemsWhiteningChosen) {
        bogoCategory = st.__gemsWhiteningChosen;
        console.log(LOG_PREFIX, 'Using gems-whitening subcategory:', bogoCategory);
      } else {
        // We should not proceed yet; show category chooser step instead of blank UI
        console.warn(LOG_PREFIX, 'Gems/Whitening BOGO invoked without subtype; redirecting to category chooser');
        showBogoServiceCategoryStep(st, btn);
        return;
      }
    }
    
    // Show loading state with persistent retry messaging
    if (st.stepContainer) {
      const loadingId = `loading-${Date.now()}`;
      st.stepContainer.innerHTML = `
        <div id="${loadingId}" style="text-align:center;padding:40px 20px;">
          <div class="meety-loading-spinner" style="display:inline-block;width:40px;height:40px;margin-bottom:20px;"></div>
          <p id="${loadingId}-msg" style="color:#666;font-size:16px;margin:0;">Loading BOGO options...</p>
          <p id="${loadingId}-sub" style="color:#999;font-size:14px;margin-top:10px;">Please wait, this may take a moment</p>
          <p id="${loadingId}-retry" style="color:#3498db;font-size:13px;margin-top:15px;display:none;">⏳ Connection slow, retrying automatically...</p>
        </div>
      `;
      
      // Monitor for slow connection and update UI
      setTimeout(() => {
        const retryMsg = document.getElementById(`${loadingId}-retry`);
        if (retryMsg) retryMsg.style.display = 'block';
      }, 5000); // Show retry message after 5 seconds
    }
    // DIRECT-FLOW INVENTORY DEBUG (mirrors category step logging)
    try {
      st._trackingInvLogged = st._trackingInvLogged || {};
      if(!st._trackingInvLogged[bogoCategory]){
        (async()=>{
          const pierHandleResolved = resolveTrackingHandle(btn,'piercings');
          const pierRaw = btn.getAttribute('data-bogo-track-piercings-raw');
          if(bogoCategory==='piercings'){
            console.log(LOG_PREFIX,'[TrackInv] (direct) piercing tracking handle resolved:', pierHandleResolved || '(empty)', '| raw setting:', pierRaw || '(none)');
          }
          const handleMap = {
            'piercings': resolveTrackingHandle(btn,'piercings'),
            'tooth-gems': resolveTrackingHandle(btn,'tooth-gems'),
            'teeth-whitening': resolveTrackingHandle(btn,'teeth-whitening'),
            'tattoo': resolveTrackingHandle(btn,'tattoo')
          };
          async function fetchTrackingInventory(handle){
            if(!handle) return null;
            const prod = await fetchProductByHandleCached(handle);
            if(!prod) return null;
            let total=0; const variants=(prod.variants||[]).map(v=>{ const qty=typeof v.inventory_quantity==='number'?Math.max(0,v.inventory_quantity):0; total+=qty; return { id:v.id, title:v.title, qty }; });
            return { handle: prod.handle, title: prod.title, total, variants };
          }
          const toLog=[];
          if(bogoCategory==='gems-whitening'){
            ['tooth-gems','teeth-whitening'].forEach(cat=>{ const h=handleMap[cat]; if(h) toLog.push({cat,handle:h}); });
          } else if (handleMap[bogoCategory]) {
            toLog.push({cat:bogoCategory, handle: handleMap[bogoCategory]});
          }
          if(!toLog.length){
            console.log(LOG_PREFIX,'[TrackInv] (direct) no tracking handles configured for', bogoCategory, '| handleMap value:', handleMap[bogoCategory]);
          } else {
            // Run diagnostics without blocking
            toLog.forEach(entry=> diagnosticFetchProduct(entry.handle));
            for(const entry of toLog){
              const info = await fetchTrackingInventory(entry.handle);
              if(!info){ console.log(LOG_PREFIX, `[TrackInv] (direct ${entry.cat}) fetch failed`, entry.handle); continue; }
              console.log(`${LOG_PREFIX} [TrackInv] (${entry.cat}) Tracking Product: ${info.title} (handle:${info.handle}) | TOTAL: ${info.total}`, info.variants);
            }
          }
          st._trackingInvLogged[bogoCategory]=true;
        })();
      }
    } catch(e){ console.warn(LOG_PREFIX,'[TrackInv] direct logging error', e); }

    // Get the correct product handle for this category
    const productHandle = getBogoProductHandle(btn, bogoCategory);
    
    // Validate product handle
    if (!productHandle || productHandle === '#') {
      console.error(LOG_PREFIX, 'No valid product handle for BOGO category:', bogoCategory);
      if (st.stepContainer) {
        st.stepContainer.innerHTML = `
          <div style="text-align:center;padding:40px 20px;">
            <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
            <h3 style="color:#e74c3c;margin:0 0 15px 0;font-size:20px;">Configuration Error</h3>
            <p style="color:#666;font-size:16px;margin:0 0 20px 0;line-height:1.5;">
              BOGO product not configured for this service type.<br>
              Please contact support.
            </p>
            <button class="meety-btn" style="background:#6c757d;" onclick="this.closest('[id^=meety-popup-overlay-]').querySelector('.meety-close-btn').click();">Close</button>
          </div>
        `;
      }
      return;
    }
    
    console.log(LOG_PREFIX, 'Setting up BOGO flow:', { 
      bogoCategory, 
      inferredBogoCategory: st.inferredBogoCategory, 
      rawBogoCategory: btn.getAttribute('data-bogo-category'), 
      gemsWhiteningChosen: st.__gemsWhiteningChosen,
      productHandle, 
      bookingFlowMode: st.bookingFlowMode 
    });

    // Fetch BOGO product data with automatic retry (will wait for connection to improve)
    if (!st.bogoProductData) {
      try {
        const productData = await fetchBogoProduct(productHandle);
        
        // Only show error if all retries exhausted (very rare - means persistent failure)
        if (!productData) {
          console.error(LOG_PREFIX, 'Failed to load BOGO product data after all retries');
          if (st.stepContainer) {
            st.stepContainer.innerHTML = `
              <div style="text-align:center;padding:40px 20px;">
                <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
                <h3 style="color:#e74c3c;margin:0 0 15px 0;font-size:20px;">Unable to Connect</h3>
                <p style="color:#666;font-size:16px;margin:0 0 20px 0;line-height:1.5;">
                  We tried multiple times but couldn't load the BOGO options.<br>
                  Please check your internet connection and try again.
                </p>
                <button class="meety-btn" style="margin-right:10px;" onclick="location.reload();">Refresh & Try Again</button>
                <button class="meety-btn" style="background:#6c757d;" onclick="this.closest('[id^=meety-popup-overlay-]').querySelector('.meety-close-btn').click();">Close</button>
              </div>
            `;
          }
          return;
        }
        
        st.bogoProductData = productData;
      } catch (error) {
        console.error(LOG_PREFIX, 'Unexpected exception fetching BOGO product:', error);
        if (st.stepContainer) {
          st.stepContainer.innerHTML = `
            <div style="text-align:center;padding:40px 20px;">
              <div style="font-size:48px;margin-bottom:20px;">⚠️</div>
              <h3 style="color:#e74c3c;margin:0 0 15px 0;font-size:20px;">Unexpected Error</h3>
              <p style="color:#666;font-size:16px;margin:0 0 20px 0;line-height:1.5;">
                ${error.message || 'Something went wrong. Please try again.'}
              </p>
              <button class="meety-btn" style="margin-right:10px;" onclick="location.reload();">Refresh Page</button>
              <button class="meety-btn" style="background:#6c757d;" onclick="this.closest('[id^=meety-popup-overlay-]').querySelector('.meety-close-btn').click();">Close</button>
            </div>
          `;
        }
        return;
      }
    }
    
    // If we already built first BOGO step and are recalling due to re-entry, verify slots and rebuild any empty ones
    if (st._bogoInitialized && st.bogoProductData) {
      console.log(LOG_PREFIX, 'BOGO flow already initialized - verifying slots before showing first step');
      try {
        const firstSlot = st.stepBogoFirst?.querySelector(`#bogo-first-menu-slot-${btn.id}`);
        const secondSlot = st.stepBogoSecond?.querySelector(`#bogo-second-menu-slot-${btn.id}`);
        const thirdSlot = st.stepBogoThird?.querySelector(`#bogo-third-menu-slot-${btn.id}`);

        const isEmpty = (slot) => !slot || !slot.innerHTML || slot.innerHTML.trim().length < 50 || Array.from(slot.children).filter(c=>!(c.textContent||'').startsWith('Dev Info:')).length === 0;

        if (isEmpty(firstSlot)) {
          console.log(LOG_PREFIX, 'First slot empty on re-entry - rebuilding first step');
          await setupBogoFirstStep(st, btn, st.bogoProductData, st.bogoCategory || btn.getAttribute('data-bogo-category'));
          return;
        }

        // If first exists but second is empty and we have first selection, rebuild second
        if (!isEmpty(firstSlot) && isEmpty(secondSlot) && st.bogoFirstSelection) {
          console.log(LOG_PREFIX, 'Second slot empty on re-entry - rebuilding second step');
          await setupBogoSecondStep(st, btn);
          showStepBogoSecond(st);
          return;
        }

        // If third is expected (tooth-gems) and empty, rebuild third
        if (isEmpty(thirdSlot) && st.bogoCategory === 'tooth-gems' && st.bogoSecondSelection) {
          console.log(LOG_PREFIX, 'Third slot empty on re-entry - rebuilding third step');
          setupBogoThirdStep(st, btn);
          showStepBogoThird(st);
          return;
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'Error verifying BOGO slots on re-entry', e);
      }

      // Default: show first step
      showStepBogoFirst(st);
      return;
    }
    
    if (!productHandle) {
      console.error(LOG_PREFIX, 'No BOGO product handle specified');
      if (st.serviceUiMode === 'bogo') {
        // Provide a simple inline error UI instead of jumping to generic service step
        st.stepBogoFirst.innerHTML = '<h3>BOGO Services</h3><p style="color:#b00;margin:10px 0;">BOGO product not configured in theme editor.</p>';
        showStepBogoFirst(st);
        return;
      } else {
        showStepService(st);
        return;
      }
    }

    // Fetch product data and setup first service selection
    const productData = await fetchBogoProduct(productHandle);
    if (!productData) {
      console.error(LOG_PREFIX, 'Failed to fetch BOGO product data');
      showStepService(st);
      return;
    }

    // Store product data and category for later use
    st.bogoProductData = productData;
    st.bogoCategory = bogoCategory;

    // Clear any previous selections only when starting a fresh BOGO flow (not on internal step rebuild)
    st.bogoFirstSelection = null;
    st.bogoSecondSelection = null;
    st.bogoThirdSelection = null;

    // Setup first service selection step
    await setupBogoFirstStep(st, btn, productData, bogoCategory);
    st._bogoInitialized = true;
  }

  /* Show BOGO Service Category Selection Step */
  function showBogoServiceCategoryStep(st, btn) {
    console.log(LOG_PREFIX, 'showBogoServiceCategoryStep enter', { selectedServiceType: st.selectedServiceType, serviceFlow: st.serviceFlow, bogoCategoryConfigured: btn.getAttribute('data-bogo-category') });
    const bogoCategory = btn.getAttribute('data-bogo-category') || 'piercings';
    
    console.log(LOG_PREFIX, 'showBogoServiceCategoryStep bogoCategory:', bogoCategory);
    // DEBUG INVENTORY LOGGING (tracking products) --------------------
    (async()=>{
      try {
        st._trackingInvLogged = st._trackingInvLogged || {};
        if (st._trackingInvLogged[bogoCategory]) return; // avoid duplicate logs per overlay/category
        const handleMap = {
          'piercings': resolveTrackingHandle(btn,'piercings'),
          'tooth-gems': resolveTrackingHandle(btn,'tooth-gems'),
          'teeth-whitening': resolveTrackingHandle(btn,'teeth-whitening'),
          'tattoo': resolveTrackingHandle(btn,'tattoo')
        };
        async function fetchTrackingInventory(handle){
          if(!handle) return null;
            const prod = await fetchProductByHandleCached(handle);
            if(!prod) return null;
            let total=0; const variants=(prod.variants||[]).map(v=>{ const qty = typeof v.inventory_quantity==='number'?Math.max(0,v.inventory_quantity):0; total+=qty; return { id:v.id, title:v.title, qty }; });
            return { handle: prod.handle, title: prod.title, total, variants };
        }
        const toLog = [];
        if (bogoCategory === 'gems-whitening') {
          ['tooth-gems','teeth-whitening'].forEach(cat=>{ const h=handleMap[cat]; if(h) toLog.push({ cat, handle:h }); });
        } else {
          if (handleMap[bogoCategory]) toLog.push({ cat:bogoCategory, handle: handleMap[bogoCategory] });
        }
        if(!toLog.length){
          console.log(LOG_PREFIX,'[TrackInv] No tracking handles configured for category', bogoCategory);
          st._trackingInvLogged[bogoCategory]=true; return;
        }
  // Run diagnostic fetches in parallel (non-blocking for inventory summary)
  toLog.forEach(entry=> diagnosticFetchProduct(entry.handle));
  for(const entry of toLog){
          const info = await fetchTrackingInventory(entry.handle);
          if(!info){
            console.log(LOG_PREFIX, `[TrackInv] (${entry.cat}) tracking product not found / fetch failed`, entry.handle);
            continue;
          }
          console.log(`${LOG_PREFIX} [TrackInv] (${entry.cat}) Tracking Product: ${info.title} (handle:${info.handle}) | TOTAL: ${info.total}`, info.variants);
        }
        st._trackingInvLogged[bogoCategory]=true;
      } catch(e){ console.warn(LOG_PREFIX,'[TrackInv] logging error', e); }
    })();
    // END DEBUG INVENTORY LOGGING ------------------------------------
    // Work inside dedicated container for proper animation
    const container = st.stepBogoCategory;
    container.innerHTML = '';
    
    // Combined Gems/Whitening category chooser
    if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen) {
      console.log(LOG_PREFIX, 'Showing gems-whitening chooser in category step');
      try { addDevInfo(container, 'Gems-Whitening Category Init', 'pre-build'); } catch(e) {}
      const title = document.createElement('h3');
      title.textContent = 'Select Promotion Type';
      title.style.textAlign = 'center';
      title.style.color = '#000';
      
      // Check inventory for both subcategories and show combined status
      const checkCombinedInventory = async () => {
        try {
          const gemsHandle = resolveTrackingHandle(btn, 'tooth-gems');
          const whiteningHandle = resolveTrackingHandle(btn, 'teeth-whitening');
          
          let gemsInventory = 0;
          let whiteningInventory = 0;
          let combinedSoldOut = false;
          
          // Check gems inventory
          if (gemsHandle) {
            const gemsRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'tooth-gems' });
            gemsInventory = gemsRemaining || 0;
          }
          
          // Check whitening inventory  
          if (whiteningHandle) {
            const whiteningRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'teeth-whitening' });
            whiteningInventory = whiteningRemaining || 0;
          }
          
          // Both must have inventory for the combined promo to be available
          combinedSoldOut = (gemsInventory <= 0) || (whiteningInventory <= 0);
          
          console.log(LOG_PREFIX, 'Combined gems-whitening inventory check:', {
            gemsInventory,
            whiteningInventory,
            combinedSoldOut
          });
          
          // Show inventory banner if tracking is configured
          if (gemsHandle || whiteningHandle) {
            const invBanner = document.createElement('div');
            invBanner.className = 'bf-inventory-banner show';
            invBanner.style.cssText = 'margin: 10px 0 15px; padding: 10px; border-radius: 6px; text-align: center; font-size: 13px;';
            
            if (combinedSoldOut) {
              invBanner.innerHTML = '⚠️ Combined Gems + Whitening promotion is currently sold out';
              invBanner.style.borderColor = '#dc2626';
              invBanner.style.background = '#fef2f2';
              invBanner.style.color = '#7f1d1d';
            } else {
              invBanner.innerHTML = `🔥 Available: Tooth Gems (${gemsInventory}) + Teeth Whitening (${whiteningInventory})`;
              invBanner.style.borderColor = '#f59e0b';
              invBanner.style.background = '#fff7ed';
              invBanner.style.color = '#7c2d12';
            }
            
            container.appendChild(invBanner);
          }
          
          return { gemsInventory, whiteningInventory, combinedSoldOut };
        } catch (e) {
          console.warn(LOG_PREFIX, 'Combined inventory check failed:', e);
          return { gemsInventory: 0, whiteningInventory: 0, combinedSoldOut: true };
        }
      };
      
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'gift-card-options';
      optionsContainer.style.cssText = 'max-width:420px;margin:20px auto;display:flex;flex-direction:column;gap:16px;';
      
      const btnGems = document.createElement('button');
      btnGems.className = 'gift-card-btn booking-detail-btn';
      btnGems.innerHTML = `<div style="text-align:left;"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">💎 Tooth Gems Promo</div><div style="font-size:12px;opacity:.8;line-height:1.3;">Buy 1 Get 2 FREE - Select up to 3 gem services</div></div>`;
      btnGems.addEventListener('click', async () => {
        // Check gems-specific inventory before proceeding
        const gemsRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'tooth-gems' });
        if (gemsRemaining !== null && gemsRemaining <= 0) {
          try { showTemporaryToast('Tooth Gems promotion is currently sold out'); } 
          catch(_) { alert('Tooth Gems promotion is currently sold out'); }
          return;
        }
        
        console.log(LOG_PREFIX, 'Tooth Gems selected from category step');
        st.__gemsWhiteningChosen = 'tooth-gems';
        st.selectedServiceCategory = 'tooth-gems';
        st.selectedServiceType = 'promo';
        // Return to main promo chooser so user can pick Book / Gift / Redeem
        renderBlackFridayChooser(st, btn);
        showStepChooser(st);
      });
      
      const btnWhite = document.createElement('button');
      btnWhite.className = 'gift-card-btn booking-detail-btn';
      btnWhite.innerHTML = `<div style="text-align:left;"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">✨ Teeth Whitening Promo</div><div style="font-size:12px;opacity:.8;line-height:1.3;">Buy one Get another one FREE</div></div>`;
      btnWhite.addEventListener('click', async () => {
        // Check whitening-specific inventory before proceeding
        const whiteningRemaining = await fetchTrackingRemaining(st, btn, { forceFresh: true, category: 'teeth-whitening' });
        if (whiteningRemaining !== null && whiteningRemaining <= 0) {
          try { showTemporaryToast('Teeth Whitening promotion is currently sold out'); } 
          catch(_) { alert('Teeth Whitening promotion is currently sold out'); }
          return;
        }
        
        console.log(LOG_PREFIX, 'Teeth Whitening selected from category step');
        st.__gemsWhiteningChosen = 'teeth-whitening';
        st.selectedServiceCategory = 'teeth-whitening';
        st.selectedServiceType = 'promo';
        // Return to main promo chooser so user can choose desired action first
        renderBlackFridayChooser(st, btn);
        showStepChooser(st);
      });
      
      // Check inventory and potentially disable buttons
      checkCombinedInventory().then(({ gemsInventory, whiteningInventory, combinedSoldOut }) => {
        if (gemsInventory <= 0) {
          btnGems.disabled = true;
          btnGems.classList.add('disabled');
          btnGems.setAttribute('aria-disabled', 'true');
          btnGems.title = 'Tooth Gems Sold Out';
        }
        
        if (whiteningInventory <= 0) {
          btnWhite.disabled = true;
          btnWhite.classList.add('disabled');
          btnWhite.setAttribute('aria-disabled', 'true');
          btnWhite.title = 'Teeth Whitening Sold Out';
        }
      });
      
      optionsContainer.appendChild(btnGems);
      optionsContainer.appendChild(btnWhite);
      container.appendChild(title);
      container.appendChild(optionsContainer);
      st.currentStep = 'bogo-category';
      showStepBogoCategory(st);
      // Fallback safety: if for some reason no children after render, inject minimal UI
      queueMicrotask(()=>{
        if (!container.children.length) {
          console.warn(LOG_PREFIX, 'Category container empty after gems-whitening build; injecting fallback.');
          const fb = document.createElement('div');
          fb.innerHTML = '<p style="color:#b00;font-size:12px;">Retry selecting a promo type:</p>';
          ['Tooth Gems Promo','Teeth Whitening Promo'].forEach(txt=>{
            const b=document.createElement('button'); b.className='gift-card-btn'; b.style.margin='6px 4px'; b.textContent=txt; b.onclick=()=>{
              st.__gemsWhiteningChosen = txt.includes('Gems') ? 'tooth-gems':'teeth-whitening';
              setupBogoFlow(st, btn);
            }; fb.appendChild(b);
          });
          container.appendChild(fb);
        }
      });
      return;
    }
    
    // Title (avoid duplication if inline chooser already asked the question)
    const title = document.createElement('h3');
  const suppressDuplicate = false; // inline chooser removed; always show title normally unless explicitly hidden elsewhere
    if (!suppressDuplicate) {
      title.textContent = 'What type of services would you like?';
      title.style.textAlign = 'center';
      title.style.color = '#000';
    } else {
      title.style.display = 'none';
    }
    
  if (bogoCategory === 'piercings' || bogoCategory === 'tooth-gems') {
      // Dropdown-based selection for these categories
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:420px;margin:0 auto;display:flex;flex-direction:column;gap:14px;';
      const label = document.createElement('label');
      label.textContent = bogoCategory === 'piercings' ? 'Select Piercing Category:' : 'Select Tooth Gem Type:';
      label.style.fontWeight = '600';
      label.style.fontSize = '14px';
      const select = document.createElement('select');
      select.style.cssText = 'padding:10px;border:1px solid #ccc;border-radius:6px;';
      select.innerHTML = '<option value="">Choose...</option>';
      const opts = bogoCategory === 'piercings'
        ? [ ['ear','Ear Piercings'], ['nose','Nose Piercings'], ['oral','Oral Piercings'], ['body','Body Piercings'] ]
        : [ ['single','Single Gems'], ['sets','Gem Sets'] ];
      opts.forEach(([val,text])=>{ const o=document.createElement('option'); o.value=val; o.textContent=text; select.appendChild(o); });
      const go = document.createElement('button');
      go.className = 'gift-card-btn';
      go.textContent = 'Continue';
      go.style.fontSize = '14px';
      go.addEventListener('click', () => {
        if (isBogoSoldOut(st, btn)) { try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); } return; }
        if (!select.value) { alert('Please select an option'); return; }
        st.selectedServiceCategory = select.value;
        st.selectedServiceType = 'promo';
        console.log(LOG_PREFIX, 'Selected BOGO category via dropdown:', select.value);
        setupBogoFlow(st, btn);
      });
      wrap.append(label, select, go);
  container.appendChild(title);
  container.appendChild(wrap);
    } else if (bogoCategory === 'tattoo') {
      // Tattoo hours doubling chooser
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:18px;';
      const expl = document.createElement('div');
      expl.style.cssText = 'font-size:13px;line-height:1.5;color:#444;background:#f5f7fa;padding:12px 14px;border:1px solid #e2e6ea;border-radius:8px;';
      // Build dynamic bullet list based on feature flag
      const tattooDeals = [
        { pay:1, get:2 },
        { pay:2, get:4 },
        { pay:3, get:6 }
      ].filter(o => !(o.pay === 1 && isTattoo1hDisabled()));
      const bulletsHtml = tattooDeals.map(o => `
          <li>Pay for <strong>${o.pay} hour${o.pay>1?'s':''}</strong> &rarr; Get <strong>${o.get} hour${o.get>1?'s':''}</strong> total</li>`).join('');
      expl.innerHTML = `
        <strong>Limited Time Tattoo Session Deal</strong><br>
        Pick how many hours you'd like to pay for now. <u>Your session time is doubled</u> automatically:<br>
        <ul style="margin:8px 0 0 18px;padding:0;font-size:12px;line-height:1.4;list-style:disc;">
          ${bulletsHtml}
        </ul>
        You will only be charged for the hours you select below. The extra time is free and applied automatically.`;
      const optionsContainer = document.createElement('div');
      optionsContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
      const hourOptions = [
        { pay:1, get:2 },
        { pay:2, get:4 },
        { pay:3, get:6 }
      ].filter(o => !(o.pay === 1 && isTattoo1hDisabled()));
      hourOptions.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'gift-card-btn booking-detail-btn';
        b.style.cssText += 'display:flex;justify-content:space-between;align-items:center;';
        b.innerHTML = `<div style="text-align:left;flex:1 1 auto;">
            <div style="font-weight:600;font-size:15px;margin-bottom:4px;">Pay ${opt.pay} Hour${opt.pay>1?'s':''}</div>
            <div style="font-size:12px;opacity:.8;line-height:1.3;">Get ${opt.get} total hours (includes ${opt.get-opt.pay} FREE)</div>
          </div>
          <div style="font-size:11px;padding:4px 8px;background:#111;color:#fff;border-radius:14px;letter-spacing:.5px;">x2 TIME</div>`;
        b.addEventListener('click', () => {
          if (isBogoSoldOut(st, btn)) { try { showTemporaryToast('BOGO is currently sold out'); } catch(_) { alert('BOGO is currently sold out'); } return; }
          st.selectedServiceCategory = `tattoo-${opt.pay}h`; // store chosen paid hours category
          st.selectedTattooPaidHours = opt.pay;
          st.selectedTattooTotalHours = opt.get;
          st.selectedServiceType = 'promo';
          console.log(LOG_PREFIX, 'Tattoo hours selected', { pay: opt.pay, total: opt.get });
          // Proceed to BOGO flow – treat as BOGO logic but hours doubling is conceptual
          setupBogoFlow(st, btn);
        });
        optionsContainer.appendChild(b);
      });
      // Back button
      const backWrap = document.createElement('div');
      backWrap.style.textAlign = 'center';
      const backBtn = document.createElement('button');
      backBtn.className = 'gift-card-btn secondary back-btn';
      backBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Back
      `;
      backBtn.addEventListener('click', () => {
        renderBlackFridayChooser(st, btn); // go back to promo chooser
        showStepChooser(st);
      });
      backWrap.appendChild(backBtn);
  container.appendChild(title);
      wrap.append(expl, optionsContainer, backWrap);
      container.appendChild(wrap);
    } else {
      // Fallback to button grid for other categories (whitening, tattoo)
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'gift-card-options';
      const categoryOptions = {
        'teeth-whitening': [ { label: '✨ Whitening Treatments', desc: 'Professional teeth whitening services', value: 'whitening' } ],
        'tattoo': [
          { label: '🖊️ Small Tattoos', desc: 'Minimal / flash pieces', value: 'small' },
          { label: '🖋️ Medium Tattoos', desc: 'Multi-hour, moderate detail', value: 'medium' },
          { label: '🖌️ Large / Session', desc: 'Large scale or all-day sessions', value: 'large' },
          { label: '🎨 Custom / Other', desc: 'Custom concepts or mixed styles', value: 'custom' }
        ]
      };
      const options = categoryOptions[bogoCategory] || [];
      options.forEach(option => {
        const catBtn = document.createElement('button');
        catBtn.className = 'gift-card-btn booking-detail-btn';
        catBtn.innerHTML = `<div style="text-align:left;"><div style="font-weight:600;font-size:15px;margin-bottom:4px;">${option.label}</div><div style="font-size:12px;opacity:.8;line-height:1.3;">${option.desc}</div></div>`;
        catBtn.addEventListener('click', () => {
          st.selectedServiceCategory = option.value;
          st.selectedServiceType = 'promo';
          setupBogoFlow(st, btn);
        });
        optionsContainer.appendChild(catBtn);
      });
  container.appendChild(title);
  container.appendChild(optionsContainer);
    }
    
    st.currentStep = 'bogo-category';
  const extraTattoo = (bogoCategory === 'tattoo' && st.selectedTattooPaidHours) ? ` | Tattoo Hours: pay ${st.selectedTattooPaidHours} -> ${st.selectedTattooTotalHours}` : '';
  addDevInfo(container, 'BOGO Category Selection', `showBogoServiceCategoryStep() | Category: ${bogoCategory}${extraTattoo}`);
    showStepBogoCategory(st);
  }

  /* Setup BOGO First Step */
  // Heuristic keyword map for variant filtering per category
  const BOGO_FILTER_KEYWORDS = {
    'piercings': {
      ear: ['ear','lobe','helix','cartilage','tragus','rook','conch','daith'],
      nose: ['nose','nostril','septum','bridge'],
      oral: ['tongue','lip','labret','monroe','smiley'],
      body: ['navel','nipple','industrial','surface','eyebrow','belly']
    },
    'tooth-gems': {
      single: ['single','solo','one'],
      sets: ['set','cluster','multi','multiple']
    },
    'teeth-whitening': {
      whitening: ['whitening','bleach','brighten']
    },
    'tattoo': {
      small: ['small','mini','flash','tiny'],
      medium: ['medium','mid','standard'],
      large: ['large','session','full','sleeve','day'],
      custom: ['custom','concept','design']
    }
  };
  function filterBogoVariants(variants, bogoCategory, subCat){
    if (!bogoCategory || !subCat) return variants;
    const group = BOGO_FILTER_KEYWORDS[bogoCategory];
    if (!group) return variants;
    const keys = group[subCat];
    if (!keys || !keys.length) return variants;
    const out = variants.filter(v => keys.some(k => (v.title||'').toLowerCase().includes(k)));
    return out.length ? out : variants; // fallback if no matches
  }
  async function setupBogoFirstStep(st, btn, productData, bogoCategory) {
    console.log(LOG_PREFIX, 'setupBogoFirstStep called with category:', bogoCategory, 'gemsWhiteningChosen:', st.__gemsWhiteningChosen);
    
    // Clear any existing selections when rebuilding first step
    if (st.bogoFirstSelection) {
      console.log(LOG_PREFIX, 'Clearing existing BOGO selections for fresh first step');
      st.bogoFirstSelection = null;
      st.bogoSecondSelection = null;
      st.bogoThirdSelection = null;
    }
    
    // Combined Gems/Whitening category chooser
    if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen) {
      console.log(LOG_PREFIX, 'Showing gems-whitening chooser interface');
      const container = st.stepBogoFirst.querySelector(`#bogo-first-menu-slot-${btn.id}`);
      console.log(LOG_PREFIX, 'Container found:', !!container, 'button id:', btn.id);
      container.innerHTML = '';
      st.stepBogoFirst.querySelector('h3').textContent = 'Select Promotion Type';
      const expl = st.stepBogoFirst.querySelector('.bogo-explanation');
      if (expl) expl.textContent = 'Choose whether you want the Tooth Gems (Buy 1 Get 2 FREE) or Teeth Whitening promotion.';
      const wrap = document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;gap:16px;';
      const btnGems = document.createElement('button');
      btnGems.className='meety-continue-btn primary';
      btnGems.textContent='Tooth Gems Promo';
      btnGems.onclick=()=>{ 
        console.log(LOG_PREFIX, 'Tooth Gems selected'); 
        st.__gemsWhiteningChosen='tooth-gems'; 
        st.bogoCategory='tooth-gems'; 
        setupBogoFirstStep(st, btn, productData, 'tooth-gems'); 
      };
      const btnWhite = document.createElement('button');
      btnWhite.className='meety-continue-btn';
      btnWhite.textContent='Teeth Whitening Promo';
      btnWhite.onclick=()=>{ 
        console.log(LOG_PREFIX, 'Teeth Whitening selected'); 
        st.__gemsWhiteningChosen='teeth-whitening'; 
        st.bogoCategory='teeth-whitening'; 
        setupBogoFirstStep(st, btn, productData, 'teeth-whitening'); 
      };
      wrap.append(btnGems, btnWhite);
      container.appendChild(wrap);
      console.log(LOG_PREFIX, 'Chooser UI created, showing step');
      try { addDevInfo(st.stepBogoFirst, 'Gems/Whitening Subtype Chooser', 'setupBogoFirstStep()'); } catch(e) {}
      showStepBogoFirst(st);
      return;
    }
    // Defensive: if a downstream call passed bogoCategory as original parent but subtype is missing, redirect gracefully
    if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen) {
      console.warn(LOG_PREFIX, 'setupBogoFirstStep encountered gems-whitening without subtype after guard; showing category chooser');
      showBogoServiceCategoryStep(st, btn);
      return;
    }
    const bogoRules = {
      'piercings': { title: 'Piercing Services', subtitle: 'Buy One Get One FREE', limit: 10 },
      'tooth-gems': { title: 'Tooth Gem Services', subtitle: 'Buy One Get Two FREE', limit: 10 },
      'teeth-whitening': { title: 'Teeth Whitening Services', subtitle: 'Buy One Get One FREE', limit: 5 },
      'tattoo': { title: 'Tattoo Services', subtitle: 'Buy One Get One FREE (Session Value Applies)', limit: 6 }
    };
    
    const rule = bogoRules[bogoCategory] || bogoRules['piercings'];
    
    // Update title and explanation
    st.stepBogoFirst.querySelector('h3').textContent = `${rule.title} - First Service`;
    const explanationEl = st.stepBogoFirst.querySelector('.bogo-explanation');
    explanationEl.textContent = `${rule.subtitle} - Choose your first service. You'll be charged for the higher-priced service.`;
    if ((st.serviceUiMode === 'bogo') && (!bogoCategory || bogoCategory === 'none')) {
      explanationEl.textContent = 'Select your first service. (Configure BOGO category in theme editor for tailored messaging.)';
    }
    
    const baseVariants = productData.variants.filter(v => v.available);
    // Tattoo fast path: we already chose hours in category step; treat as single selection (highest priced or closest variant)
    if (bogoCategory === 'tattoo' && st.selectedTattooPaidHours) {
      // Sort variants by price ascending (1h=cheapest, 2h=mid, 3h=highest)
      const sortedVariants = [...baseVariants].sort((a, b) => a.price - b.price);
      
      // Pick variant by index based on selected hours: 1h=index 0, 2h=index 1, 3h=index 2
      const variantIndex = st.selectedTattooPaidHours - 1;
      let picked = sortedVariants[variantIndex];
      
      // Fallback: if index is out of bounds, try title matching
      if (!picked) {
        picked = baseVariants.find(v => (v.title||'').toLowerCase().includes(st.selectedTattooPaidHours + ' hour')) ||
                 baseVariants.find(v => (v.title||'').toLowerCase().includes(st.selectedTattooPaidHours + 'hr'));
      }
      
      // Last fallback: just use the variant at that index or highest priced
      if (!picked) {
        picked = baseVariants[variantIndex] || [...baseVariants].sort((a,b)=> b.price - a.price)[0];
      }
      
      if (picked) {
        st.bogoFirstSelection = picked;
        st.bogoSecondSelection = null;
        st.bogoThirdSelection = null;
        console.log(LOG_PREFIX, 'Tattoo fast-path variant chosen', { 
          variant: picked.title, 
          variantId: picked.id,
          price: picked.price / 100,
          paidHours: st.selectedTattooPaidHours, 
          totalHours: st.selectedTattooTotalHours,
          method: variantIndex < sortedVariants.length ? 'price-based-index' : 'fallback'
        });
        // Proceed directly (treat like single whitening path)
        proceedWithBogoSelection(st, btn, { singleOnly: true, tattooFastPath: true });
        return;
      } else {
        console.warn(LOG_PREFIX, 'Tattoo fast-path could not pick a variant; falling back to normal listing');
      }
    }
    // Forced single-step path for teeth whitening: always treat as single selection BOGO (Buy 1 Get 1) no matter variant count
    if (bogoCategory === 'teeth-whitening') {
      if (!baseVariants.length) {
        console.warn(LOG_PREFIX, 'No available whitening variants found');
      } else {
        // Heuristic: pick highest price (assumed most comprehensive) or first
        const picked = [...baseVariants].sort((a,b)=> b.price - a.price)[0];
        st.bogoFirstSelection = picked;
        st.bogoSecondSelection = null;
        console.log(LOG_PREFIX, 'Teeth whitening forced single-step selection', { variant: picked.title });
        proceedWithBogoSelection(st, btn, { singleOnly: true });
        return;
      }
    }
    const menuSlot = st.stepBogoFirst.querySelector(`#bogo-first-menu-slot-${btn.id}`);
    if (!menuSlot) {
      console.error(LOG_PREFIX, 'Could not find BOGO first menu slot');
      return;
    }
    menuSlot.innerHTML = '';

    console.log(LOG_PREFIX, 'BOGO first step menu slot cleared, building UI for category:', bogoCategory);

    // Special dual-dropdown UI for categories needing category/service split (piercings, tooth-gems, teeth-whitening)
    if (bogoCategory === 'piercings' || bogoCategory === 'tooth-gems' || bogoCategory === 'teeth-whitening') {
      buildPiercingDualDropdown(st, baseVariants, null, menuSlot, (variant) => {
        st.bogoFirstSelection = variant;
        console.log(LOG_PREFIX, `First BOGO (${bogoCategory}) service selected:`, variant.title);
        setupBogoSecondStep(st, btn);
      });
    } else {
      const filtered = filterBogoVariants(baseVariants, bogoCategory, st.selectedServiceCategory);
      const serviceOptions = filtered.map((variant, index) => ({
        text: `${variant.title} - $${(variant.price / 100).toFixed(2)}`,
        index: index,
        variant: variant
      }));
      renderBogoServiceUI(st, menuSlot, serviceOptions, (selectedOption) => {
        st.bogoFirstSelection = selectedOption.variant;
        console.log(LOG_PREFIX, 'First BOGO service selected:', selectedOption.variant.title);
        setupBogoSecondStep(st, btn);
      });
    }
    
    showStepBogoFirst(st);
  }

  /* Setup BOGO Second Step */
  function setupBogoSecondStep(st, btn) {
    const bogoCategory = st.bogoCategory;
    const productData = st.bogoProductData;
    
    console.log(LOG_PREFIX, 'setupBogoSecondStep called, first selection:', st.bogoFirstSelection?.title);
    
    const bogoRules = {
      'piercings': { title: 'Piercing Services', subtitle: 'Buy One Get One FREE', limit: 10 },
      'tooth-gems': { title: 'Tooth Gem Services', subtitle: 'Buy One Get Two FREE', limit: 10 },
      'teeth-whitening': { title: 'Teeth Whitening Services', subtitle: 'Buy One Get One FREE', limit: 5 },
      'tattoo': { title: 'Tattoo Services', subtitle: 'Buy One Get One FREE (Session Value Applies)', limit: 6 }
    };
    
    const rule = bogoRules[bogoCategory] || bogoRules['piercings'];
    
    // Update title and explanation
    st.stepBogoSecond.querySelector('h3').textContent = `${rule.title} - Second Service`;
    const explanationEl = st.stepBogoSecond.querySelector('.bogo-explanation-second');
    explanationEl.textContent = `Selected: ${st.bogoFirstSelection.title}. Now choose your second service.`;
    
    // Allow selecting the same service again for BOGO deals (e.g., 2x same piercing)
    const baseVariants = productData.variants.filter(v => v.available);
    const menuSlot = st.stepBogoSecond.querySelector(`#bogo-second-menu-slot-${btn.id}`);
    
    if (!menuSlot) {
      console.error(LOG_PREFIX, 'Could not find BOGO second menu slot');
      return;
    }
    
    menuSlot.innerHTML = '';
    console.log(LOG_PREFIX, 'BOGO second step menu slot cleared, available variants:', baseVariants.length);

    if (bogoCategory === 'piercings' || bogoCategory === 'tooth-gems' || bogoCategory === 'teeth-whitening') {
      // Don't exclude first selection - allow same service to be selected again
      buildPiercingDualDropdown(st, baseVariants, null, menuSlot, (variant) => {
        st.bogoSecondSelection = variant;
        console.log(LOG_PREFIX, `Second BOGO (${bogoCategory}) service selected:`, variant.title);
        if (bogoCategory === 'tooth-gems') {
          setupBogoThirdStep(st, btn);
        } else {
          proceedWithBogoSelection(st, btn);
        }
      });
    } else {
      const filtered = filterBogoVariants(baseVariants, bogoCategory, st.selectedServiceCategory);
      const serviceOptions = filtered.map((variant, index) => ({
        text: `${variant.title} - $${(variant.price / 100).toFixed(2)}`,
        index: index,
        variant: variant
      }));
      renderBogoServiceUI(st, menuSlot, serviceOptions, (selectedOption) => {
        st.bogoSecondSelection = selectedOption.variant;
        console.log(LOG_PREFIX, 'Second BOGO service selected:', selectedOption.variant.title);
        if (bogoCategory === 'tooth-gems') {
          setupBogoThirdStep(st, btn);
        } else {
          proceedWithBogoSelection(st, btn);
        }
      });
    }
    
    showStepBogoSecond(st);
  }

  function setupBogoThirdStep(st, btn){
    const bogoCategory = st.bogoCategory;
    if (bogoCategory !== 'tooth-gems') return;
    const productData = st.bogoProductData;
    // Allow selecting the same gems again - don't exclude previous selections
    const baseVariants = productData.variants.filter(v => v.available);
    const menuSlot = st.stepBogoThird.querySelector(`#bogo-third-menu-slot-${btn.id}`);
    menuSlot.innerHTML = '';
    buildPiercingDualDropdown(st, baseVariants, null, menuSlot, (variant) => {
      st.bogoThirdSelection = variant;
      console.log(LOG_PREFIX, 'Third BOGO (tooth-gems) service selected:', variant.title);
      proceedWithBogoSelection(st, btn);
    });
    // Back button
    const backBtn = st.stepBogoThird.querySelector('.bogo-third-back-btn');
    if (backBtn){ backBtn.onclick = () => goBackStep(st); }
    transitionToStep(st, st.stepBogoThird, { stepId: 'bogo-third' });
  }

  /* Dual Dropdown Builder for Piercings Mix & Match */
  function buildPiercingDualDropdown(st, variants, excludeId, container, onPick){
    // Defensive: normalize variants to an array; handle legacy callers that passed an object/hash
    if(!Array.isArray(variants)){
      if(variants && typeof variants === 'object') {
        variants = Object.values(variants).filter(v => v && typeof v === 'object');
      } else {
        console.warn(LOG_PREFIX, 'buildPiercingDualDropdown received non-array variants, defaulting to []', variants);
        variants = [];
      }
    }
    // Categories come explicitly as leading parenthetical token e.g. (Ear) Tragus
    let defaultCatOrder = (st.piercingCatsRaw || 'Ear|Facial|Oral|Body|Vulvar|Penile').split('|').map(c=>c.trim()).filter(Boolean);
    if (st.bogoCategory === 'tooth-gems') {
      defaultCatOrder = ['Single','Sets'];
    } else if (st.bogoCategory === 'teeth-whitening') {
      defaultCatOrder = ['Whitening'];
    }
    const catRegex = /^\(([^)]+)\)\s*/;
    const norm = variants
      .filter(v => !excludeId || v.id !== excludeId)
      .map(v => {
        const title = v.title || '';
        const m = title.match(catRegex);
        let cat = 'Other';
        if (m) {
          cat = m[1].trim();
        } else if (st.bogoCategory === 'tooth-gems') {
          cat = /(set|cluster|multi)/i.test(title) ? 'Sets' : 'Single';
        } else if (st.bogoCategory === 'teeth-whitening') {
          cat = 'Whitening';
        }
        const display = m ? title.replace(catRegex,'').trim() : title;
        return { v, cat, display };
      });
    // Preserve configured order; append any unexpected categories at end
    const present = [];
    defaultCatOrder.forEach(c => { if (norm.some(n => n.cat.toLowerCase() === c.toLowerCase())) present.push(c); });
    norm.forEach(n => { if (!present.includes(n.cat)) present.push(n.cat); });

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

    const row1 = document.createElement('div');
    const lab1 = document.createElement('label'); lab1.textContent = 'Category'; lab1.style.fontWeight='600'; lab1.style.fontSize='13px';
    const selCat = document.createElement('select'); selCat.style.cssText='padding:10px;border:1px solid #ccc;border-radius:6px;';
  selCat.innerHTML = '<option value="">All Categories</option>' + present.map(c=>`<option value="${c}">${c}</option>`).join('');
    row1.append(lab1, selCat);

    const row2 = document.createElement('div');
  const lab2 = document.createElement('label');
  lab2.textContent = (st.bogoCategory === 'tooth-gems') ? 'Gem Service' : (st.bogoCategory === 'teeth-whitening' ? 'Whitening Service' : 'Piercing Service');
    const selService = document.createElement('select'); selService.style.cssText='padding:10px;border:1px solid #ccc;border-radius:6px;';
    row2.append(lab2, selService);

    function refreshServices(){
      const cat = selCat.value;
      const list = norm.filter(n => !cat || n.cat === cat);
      selService.innerHTML = list.length ? '' : '<option value="">No options</option>';
      list.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.v.id;
        opt.textContent = `${n.display} - $${(n.v.price/100).toFixed(2)}`;
        selService.appendChild(opt);
      });
    }
    selCat.addEventListener('change', refreshServices);
    refreshServices();

    const go = document.createElement('button');
    go.className = 'meety-continue-btn primary';
    go.textContent = 'Continue';
    go.addEventListener('click', () => {
      const val = selService.value;
      if (!val){ alert('Please select a service'); return; }
      const picked = norm.find(n => String(n.v.id) === String(val));
      if (picked){ onPick(picked.v); }
    });

    wrap.append(row1, row2, go);
    container.appendChild(wrap);
  }

  /* Render BOGO Service UI using existing parsing logic */
  function renderBogoServiceUI(st, menuSlot, options, onSelection) {
    menuSlot.innerHTML = '';
    const mode = st.serviceUiMode;

    // For BOGO mode, always use the configured service UI mode or fall back to buttons
    const effectiveMode = (mode === 'bogo') ? 'buttons' : mode;

    if (effectiveMode === 'piercings-categories') {
      const cats = parseCats(st.piercingCatsRaw);
      const parsed = analyzeBogoServicesForPiercings(options, cats, st);
      if (parsed.anyFound) {
        renderBogoPiercingsUI(st, menuSlot, parsed, cats, onSelection);
        return;
      }
    }

    if (effectiveMode === 'parsed-dropdown') {
      const parsed = options.map(o => ({ raw: o.text, groups: parseParentheticalGroups(o.text), variant: o.variant })).filter(x => x.groups.length);
      if (parsed.length > 0) {
        renderBogoDropdownUI(st, menuSlot, options, parsed, onSelection);
        return;
      }
    }

    // Default: buttons UI
    options.forEach(opt => {
      const b = document.createElement('button');
      b.textContent = opt.text;
      b.style.cssText = 'padding:.6rem .9rem;border-radius:6px;border:1px solid #111;background:#111;color:#fff;cursor:pointer;text-align:left;margin-bottom:8px;width:100%;';
      b.addEventListener('click', () => onSelection(opt));
      menuSlot.appendChild(b);
    });
  }

  /* Analyze BOGO services for piercings - modified to include variant reference */
  function analyzeBogoServicesForPiercings(options, cats, st) {
    const keys = splitPromoKeys(st.promoKeysRaw);
    const out = [];
    let anyFound = false;

    options.forEach(o => {
      const t = o.text;
      const hit = findFirstCat(t, cats);
      if (!hit) {
        out.push({ original: t, base: t, cat: 'Other', promo: hasPromo(t, keys), variant: o.variant });
        return;
      }
      anyFound = true;
      const base = stripToken(t, hit.token);
      out.push({ original: t, base, cat: hit.cat, promo: hasPromo(t, keys), variant: o.variant });
    });

    return { items: out, anyFound, promoKeys: keys };
  }

  /* Render BOGO Piercings UI */
  function renderBogoPiercingsUI(st, menuSlot, parsed, cats, onSelection) {
    menuSlot.innerHTML = '';

    // Unique categories present
    const present = [];
    cats.forEach(c => {
      if (parsed.items.some(it => it.cat.toLowerCase() === c.toLowerCase())) present.push(c);
    });
    if (parsed.items.some(it => it.cat === 'Other')) present.push('Other');

    // Row 1: Piercing Type
    const row1 = document.createElement('div'); row1.className = 'meety-row';
    const lab1 = document.createElement('label'); lab1.textContent = 'Piercing Type:';
    const selType = document.createElement('select'); selType.className = 'meety-select'; selType.id = 'bogo-piercing-type';
    selType.innerHTML = '<option value="all">All</option>';
    present.forEach(c => {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; selType.appendChild(opt);
    });
    row1.append(lab1, selType);

    // Row 2: Piercing
    const row2 = document.createElement('div'); row2.className = 'meety-row';
    const lab2 = document.createElement('label'); lab2.textContent = 'Piercing:';
    const selOpt = document.createElement('select'); selOpt.className = 'meety-select'; selOpt.id = 'bogo-piercing-option';
    row2.append(lab2, selOpt);

    const promoMode = st.promoMode;
    const keys = parsed.promoKeys;

    function meetsPromo(it) {
      if (promoMode !== 'include-only') return true;
      if (!keys.length) return true;
      return !!it.promo;
    }

    function formatDisplay(it, isAll) {
      let label = it.base;
      if (promoMode === 'highlight' && it.promo) label = `★ ${label}`;
      if (isAll) label = `${label} (${it.cat})`;
      return label;
    }

    function refreshOptions() {
      const type = selType.value;
      const isAll = type === 'all';
      const filtered = parsed.items.filter(it => (isAll || it.cat === type) && meetsPromo(it));

      selOpt.innerHTML = '';
      filtered.forEach(it => {
        const o = document.createElement('option');
        o.value = it.original;
        o.textContent = formatDisplay(it, isAll);
        o.dataset.itemIndex = parsed.items.indexOf(it);
        selOpt.appendChild(o);
      });

      if (!filtered.length) {
        const o = document.createElement('option'); o.value = ''; o.textContent = 'No options';
        selOpt.appendChild(o);
      }
    }

    selType.addEventListener('change', refreshOptions);
    refreshOptions();

    const go = document.createElement('button'); go.className = 'meety-continue-btn primary'; go.textContent = 'Continue';
    go.addEventListener('click', () => {
      const selectedOption = selOpt.selectedOptions[0];
      if (selectedOption && selectedOption.value) {
        const itemIndex = parseInt(selectedOption.dataset.itemIndex);
        const matchingItem = parsed.items[itemIndex];
        if (matchingItem) {
          onSelection({ text: selectedOption.value, variant: matchingItem.variant });
        }
      }
    });

    menuSlot.append(row1, row2, go);
  }

  /* Render BOGO Dropdown UI */
  function renderBogoDropdownUI(st, menuSlot, options, parsed, onSelection) {
    menuSlot.innerHTML = '';
    
    const order = parsed[0].groups.map(g => g.key);
    const valueArrays = new Map();
    order.forEach(k => valueArrays.set(k, []));
    parsed.forEach(p => {
      p.groups.forEach(g => {
        if (!valueArrays.has(g.key)) valueArrays.set(g.key, []);
        const arr = valueArrays.get(g.key);
        if (!arr.includes(g.val)) arr.push(g.val);
      });
    });

    const controls = document.createElement('div'); controls.className = 'meety-row';
    const selects = [];

    order.forEach(key => {
      const label = document.createElement('label'); label.textContent = key + ':';
      const sel = document.createElement('select'); sel.className = 'meety-select'; sel.dataset.key = key;
      const vals = valueArrays.get(key) || [];
      vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
      controls.append(label, sel);
      selects.push(sel);
    });

    const go = document.createElement('button'); go.className = 'meety-continue-btn primary'; go.textContent = 'Continue';
    go.addEventListener('click', () => {
      const pick = order.map(k => `(${k}) ${selects.find(s => s.dataset.key === k).value}`).join(' / ');
      const matchingOption = options.find(opt => normalizeTxt(opt.text).includes(normalizeTxt(pick)));
      if (matchingOption) {
        onSelection(matchingOption);
      }
    });

    menuSlot.append(controls, go);
  }

  /* Show BOGO Pricing */
  function showBogoPricing(st, btn) {
    const comparison = compareAndSelectVariants(st.bogoFirstSelection, st.bogoSecondSelection, st.bogoCategory);
    
    // Store comparison result
    st.bogoSelection = comparison;
    
    // Display pricing breakdown
    const pricingDisplay = st.stepBogoSecond.querySelector('.bogo-pricing-display');
    const priceBreakdown = st.stepBogoSecond.querySelector('.bogo-price-breakdown');
    
    priceBreakdown.innerHTML = `
      <div style="padding: 12px; background: #f8f9fa; border-radius: 6px; margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px; color: #2c3e50;">Your Selection:</h4>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>${comparison.chargedVariant.title}</span>
          <span style="font-weight: 600;">$${(comparison.chargedVariant.price / 100).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>${comparison.freeVariant.title}</span>
          <span><span style="text-decoration:line-through;color:#999;">$${(comparison.freeVariant.price / 100).toFixed(2)}</span> <span style="color: #27ae60; font-weight: 600;">FREE</span></span>
        </div>
        <div style="border-top: 1px solid #ddd; padding-top: 8px; display: flex; justify-content: space-between;">
          <span style="font-weight: 600;">You Pay:</span>
          <span style="font-weight: 600; font-size: 16px;">$${(comparison.chargedVariant.price / 100).toFixed(2)}</span>
        </div>
        <div style="font-size: 12px; color: #27ae60; text-align: center; margin-top: 4px;">
          You save $${comparison.totalSavings.toFixed(2)}!
        </div>
      </div>
    `;
    
    pricingDisplay.style.display = 'block';
    
    // Setup continue button
    const continueBtn = st.stepBogoSecond.querySelector('.bogo-continue-btn');
    if (continueBtn) {
      continueBtn.onclick = () => proceedWithBogoSelection(st, btn);
    } else {
      console.warn(LOG_PREFIX, 'bogo-continue-btn not found when showing pricing display');
    }
    
    // Setup back button
    const backBtn = st.stepBogoSecond.querySelector('.bogo-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        // Reset selections and go back to first step
        st.bogoFirstSelection = null;
        st.bogoSecondSelection = null;
        setupBogoFirstStep(st, btn, st.bogoProductData, st.bogoCategory);
      });
    }
  }



  /* Analyze BOGO Services - determine which is charged and which is free */
  function analyzeBogoServices(variant1, variant2) {
    const price1 = variant1.price / 100; // Convert cents to dollars
    const price2 = variant2.price / 100;
    
    let chargedVariant, freeVariant;
    if (price1 >= price2) {
      chargedVariant = variant1;
      freeVariant = variant2;
    } else {
      chargedVariant = variant2;
      freeVariant = variant1;
    }

    return {
      chargedVariant: chargedVariant,
      freeVariant: freeVariant,
      totalSavings: freeVariant.price / 100
    };
  }

  /* Proceed with BOGO Selection */
  async function proceedWithBogoSelection(st, btn, opts) {
    const cat = btn.getAttribute('data-bogo-category');
    const singleWhitening = opts && opts.singleOnly;
    if (!st.bogoFirstSelection) {
      console.error(LOG_PREFIX, 'Cannot proceed, first selection missing');
      return;
    }
    const tattooFast = (cat === 'tattoo' && st.selectedTattooPaidHours);
    if (!st.bogoSecondSelection && !singleWhitening && !tattooFast) {
      console.error(LOG_PREFIX, 'Cannot proceed, second selection missing (non-single flow)');
      return;
    }
    const threeMode = (cat === 'tooth-gems') && !!st.bogoThirdSelection; // only if third picked
    // Build array of all selected variants (allow single in whitening fast-path)
    const picks = st.bogoSecondSelection ? [st.bogoFirstSelection, st.bogoSecondSelection] : [st.bogoFirstSelection];
    if (st.bogoThirdSelection) picks.push(st.bogoThirdSelection);
    // Determine charged = highest price; others free (use index-based filtering to handle same-variant selections)
    let chargedIndex = 0;
    let maxPrice = picks[0]?.price || 0;
    picks.forEach((v, i) => { 
      if ((v.price||0) > maxPrice) { 
        maxPrice = v.price; 
        chargedIndex = i; 
      } 
    });
    let charged = picks[chargedIndex];
    // Filter by index to properly handle when same variant is selected multiple times
    let frees = picks.filter((v, i) => i !== chargedIndex);
    // Teeth Whitening special-case: Buy 1 Get 1 of the same service
    const isTeethWhitening = (cat === 'teeth-whitening') || (cat === 'gems-whitening' && st.__gemsWhiteningChosen === 'teeth-whitening');
    if (isTeethWhitening && (!st.bogoSecondSelection || singleWhitening)) {
      // Duplicate the charged selection as a free item
      frees = [charged];
    }
    const totalSavings = frees.reduce((sum,v)=> sum + (v.price||0)/100, 0);
    console.log(LOG_PREFIX, 'Proceeding with BOGO selection (multi)', { charged, frees, totalSavings });
    st.bogoSelection = {
      firstVariant: st.bogoFirstSelection,
      secondVariant: st.bogoSecondSelection,
      thirdVariant: st.bogoThirdSelection || null,
      chargedVariant: charged,
      freeVariant: frees[0] || null,
      extraFreeVariants: frees.slice(1),
      totalSavings
    };
    st.bogoDetails = {
      chargedService: charged,
      freeService: frees[0] || null,
      extraFreeServices: frees.slice(1),
      totalSavings,
      category: cat
    };

    // Tattoo special-case: savings are equivalent to the paid service value (time is doubled)
    if (cat === 'tattoo' && st.selectedTattooPaidHours) {
      const chargedDollars = (charged?.price || 0) / 100;
      st.bogoSelection.totalSavings = chargedDollars;
      st.bogoDetails.totalSavings = chargedDollars;
      // Do NOT fabricate a freeVariant/freeService to avoid incorrect FREE rows; UI will handle tattoo separately
    }
    // Prepare global context for line-item property injection on /cart/add*
    try {
      // For gems-whitening, use the specific subcategory for tracking
      let trackingCategory = st.bogoDetails.category || '';
      if (trackingCategory === 'gems-whitening' && st.__gemsWhiteningChosen) {
        trackingCategory = st.__gemsWhiteningChosen;
        console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'Using gems-whitening subcategory for tracking:', trackingCategory);
      }
      
      // For gift card BOGO flows, calculate the base price (remove fees from variant price)
      let chargedBasePriceCents = charged.price;
      if (st.giftBogoMode && window.__meetyDownpayConfig?.enabled) {
        const cfg = window.__meetyDownpayConfig;
        const flatC = Math.round(cfg.flat * 100);
        const mult = 1 + cfg.percent / 100;
        let calculatedBase = Math.max(0, Math.round((charged.price - flatC) / mult));
        if (cfg.floorBase) {
          calculatedBase = Math.floor(calculatedBase / 100) * 100;
          if (calculatedBase > charged.price) calculatedBase = charged.price;
        }
        chargedBasePriceCents = calculatedBase;
        console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'Gift card BOGO - calculated base from variant price:', {
          variantPriceWithFees: charged.price / 100,
          calculatedBase: chargedBasePriceCents / 100
        });
      }
      
      window.__meetyBogoContext = {
        charged: { id: charged.id, title: charged.title, priceCents: chargedBasePriceCents },
        free: (frees[0] ? { id: frees[0].id, title: frees[0].title, priceCents: frees[0].price } : null),
        free2: (frees[1] ? { id: frees[1].id, title: frees[1].title, priceCents: frees[1].price } : null),
        savingsCents: Math.round(st.bogoSelection.totalSavings * 100),
        category: trackingCategory,
        // NEW: Flow type flags for tracking
        isGiftPurchase: false,  // This will be set to true in gift purchase flows
        isRedemption: false,    // This will be set to true in redemption flows
        isBogoBooking: true,    // NEW: Flag for regular BOGO booking flows
        injected: false,
        at: Date.now()
      };
      
      // CRITICAL: Store button reference in context for correct tracking product resolution
      if (btn) {
        window.__meetyBogoContext.buttonElement = btn;
        console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '🎯 Stored button reference in BOGO context:', {
          buttonId: btn.id,
          buttonText: btn.textContent?.trim(),
          category: trackingCategory,
          trackingHandle: btn.getAttribute(`data-bogo-track-${trackingCategory}`)
        });
      }
      
      console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'BOGO context set up for BOOKING flow:', window.__meetyBogoContext);
      
      // CRITICAL: Warm cache for tracking product (BLOCKING to ensure it's ready)
      try {
        if (btn && trackingCategory) {
          const categoryAttrMap = {
            'tattoo': 'data-bogo-track-tattoo',
            'piercings': 'data-bogo-track-piercings',
            'tooth-gems': 'data-bogo-track-tooth-gems',
            'teeth-whitening': 'data-bogo-track-teeth-whitening'
          };
          
          const attributeName = categoryAttrMap[trackingCategory];
          const trackingHandle = attributeName ? btn.getAttribute(attributeName) : null;
          
          if (trackingHandle) {
            console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '🔥 Preloading tracking product cache (BLOCKING):', {
              category: trackingCategory,
              handle: trackingHandle,
              buttonId: btn.id
            });
            
            // BLOCKING: Wait for cache to be populated before proceeding
            await fetchProductByHandleCached(trackingHandle);
            
            // Verify cache was populated
            const cached = window.__bogoTrackCache?.[trackingHandle];
            if (cached) {
              console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '✅ Successfully preloaded tracking product:', trackingHandle);
              console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '🔍 Cache verification:', {
                cached: !!cached,
                title: cached.product?.title,
                variantCount: cached.product?.variants?.length,
                firstVariantId: cached.product?.variants?.[0]?.id
              });
            } else {
              console.warn('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '⚠️ Cache population failed for:', trackingHandle);
            }
          } else {
            console.warn('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', '⚠️ No tracking handle found for category:', trackingCategory);
          }
        }
      } catch(e) {
        console.warn('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'Cache warming error:', e);
      }
    } catch(e){ console.warn(LOG_PREFIX, 'Failed setting BOGO context', e); }
    // Persist free service info to cart (non-blocking)
    try {
      const attrPayload = {
        'BOGO Charged Service': charged.title,
        'BOGO Total Savings': `$${st.bogoSelection.totalSavings.toFixed(2)}`,
        'BOGO Category': cat || ''
      };
      if (frees[0]) attrPayload['BOGO Free Service'] = frees[0].title;
      if (frees[1]) attrPayload['BOGO Free Service 2'] = frees[1].title;
      // Tattoo hour doubling context
      if (cat === 'tattoo' && st.selectedTattooPaidHours && st.selectedTattooTotalHours) {
        attrPayload['Tattoo Paid Hours'] = st.selectedTattooPaidHours;
        attrPayload['Tattoo Total Hours'] = st.selectedTattooTotalHours;
        attrPayload['Tattoo Free Hours'] = (st.selectedTattooTotalHours - st.selectedTattooPaidHours);
      }
      updateCartAttributes(attrPayload).catch(e=>console.warn(LOG_PREFIX,'BOGO cart attribute update failed', e));
    } catch(e){ console.warn(LOG_PREFIX,'BOGO cart attribute attempt error', e); }
    
    // Create modified Meety calendar JSON with the higher-priced variant
    // Get the correct calendar JSON based on BOGO category
    const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
    let baseCalendarRaw = null;
    
    // Get category-specific calendar JSON first, fallback to primary
    // Determine if this is a gift card redemption flow
    const isRedemption = st.giftExistingFlow === true;
    
    if (bogoCategory === 'piercings') {
      baseCalendarRaw = isRedemption 
        ? btn.getAttribute('data-bogo-gift-piercing-calendar') 
        : btn.getAttribute('data-piercing-calendar-json');
    } else if (bogoCategory === 'tooth-gems') {
      baseCalendarRaw = isRedemption 
        ? btn.getAttribute('data-bogo-gift-tooth-gems-calendar') 
        : btn.getAttribute('data-teeth-gems-calendar-json');
    } else if (bogoCategory === 'teeth-whitening') {
      baseCalendarRaw = isRedemption 
        ? btn.getAttribute('data-bogo-gift-teeth-whitening-calendar') 
        : btn.getAttribute('data-teeth-whitening-calendar-json');
    } else if (bogoCategory === 'tattoo') {
      baseCalendarRaw = btn.getAttribute('data-tattoo-calendar-json');
    } else if (bogoCategory === 'gems-whitening') {
      // For gems-whitening combined category, use the chosen subtype
      if (st.__gemsWhiteningChosen === 'tooth-gems') {
        baseCalendarRaw = isRedemption 
          ? btn.getAttribute('data-bogo-gift-tooth-gems-calendar') 
          : btn.getAttribute('data-teeth-gems-calendar-json');
      } else if (st.__gemsWhiteningChosen === 'teeth-whitening') {
        baseCalendarRaw = isRedemption 
          ? btn.getAttribute('data-bogo-gift-teeth-whitening-calendar') 
          : btn.getAttribute('data-teeth-whitening-calendar-json');
      }
    }
    
    // Fallback to primary calendar if category-specific not found or invalid
    if (!baseCalendarRaw || baseCalendarRaw === '#') {
      baseCalendarRaw = btn.getAttribute('data-meety-data');
    }
    
    const baseCalendar = baseCalendarRaw ? parseJSONSafe(decodeEntities(baseCalendarRaw)) : null;
    
    console.log(LOG_PREFIX, 'BOGO Calendar Creation:', {
      bogoCategory: bogoCategory,
      isRedemption: isRedemption,
      gemsWhiteningChosen: st.__gemsWhiteningChosen,
      selectedCalendarRaw: baseCalendarRaw,
      baseCalendar: baseCalendar,
      chargedVariant: charged
    });
    
    if (baseCalendar) {
  const modifiedCalendar = await createBogoMeetyCalendar(baseCalendar, charged, btn);
      if (modifiedCalendar) {
        console.log(LOG_PREFIX, 'Using BOGO-modified Meety calendar:', modifiedCalendar);
        st.bogoModifiedCalendar = modifiedCalendar; // Store for later use
        st.bogoOriginalCalendar = baseCalendar; // Store original for flexible matching
        showBogoSummary(st, btn);
        return;
      }
    }

    // Fallback to service selection if calendar modification fails
    showStepService(st);
  }

  /* Show BOGO Summary Step */
  // Unified Gems + Whitening Gift BOGO Flow starter
  function startGemsWhiteningBogoGiftFlow(st, btn){
    const parentCat = btn.getAttribute('data-bogo-category');
    if (parentCat !== 'gems-whitening') {
      console.warn(LOG_PREFIX, 'startGemsWhiteningBogoGiftFlow called with non gems-whitening category');
      return;
    }
    // Require subtype selection first
    if(!st.__gemsWhiteningChosen){
      // Reuse existing category chooser logic
      showBogoServiceCategoryStep(st, btn);
      return;
    }
    st.giftBogoMode = true;
    st.giftSubtype = st.__gemsWhiteningChosen; // 'tooth-gems' or 'teeth-whitening'
    // Kick off standard BOGO multi-step path (reused for gift selection)
    setupBogoFlow(st, btn);
  }
  
  function showBogoSummary(st, btn) {
    // Populate the selected services
    const servicesContainer = st.stepBogoSummary.querySelector('.selected-services');
    const sel = st.bogoSelection;
    const rows = [sel.firstVariant, sel.secondVariant, sel.thirdVariant].filter(Boolean);
    const tattooFast = (st.bogoDetails?.category === 'tattoo' && st.selectedTattooPaidHours);
    if (tattooFast) {
      // Minimal header for tattoo - use correct hours display instead of variant title
      const displayText = `Pay for ${st.selectedTattooPaidHours} Hour${st.selectedTattooPaidHours > 1 ? 's' : ''}, get ${st.selectedTattooTotalHours} Hours`;
      servicesContainer.innerHTML = `<div style="margin-bottom:12px;">
        <h4 style="color:#333;margin-bottom:6px;">Tattoo Session</h4>
        <div class="service-item" style="padding:8px;margin-bottom:4px;border-left:3px solid #28a745;"><strong>${displayText}</strong> - $${(sel.firstVariant.price/100).toFixed(2)}</div>
      </div>`;
    } else {
      servicesContainer.innerHTML = `<div style="margin-bottom:16px;">
        <h4 style="color:#333;margin-bottom:8px;">Selected Services:</h4>
        ${rows.map(v=>`<div class="service-item" style="padding:8px;margin-bottom:6px;border-left:3px solid #28a745;"><strong>${v.title}</strong> - $${(v.price/100).toFixed(2)}</div>`).join('')}
      </div>`;
    }
    
    // Populate the pricing summary
    const pricingContainer = st.stepBogoSummary.querySelector('.pricing-summary');
  const chargedService = sel.chargedVariant;
  const freeLines = (sel.freeVariant ? [sel.freeVariant] : []).concat(sel.extraFreeVariants||[]).filter(Boolean);
  const tattooHoursNote = (st.bogoDetails?.category === 'tattoo' && st.selectedTattooPaidHours) ? `<div style=\"margin-top:10px;font-size:12px;background:#f5f7fa;border:1px solid #e2e6ea;padding:8px 10px;border-radius:6px;\"><strong>Time Doubling Applied:</strong> Paid ${st.selectedTattooPaidHours}h → ${st.selectedTattooTotalHours}h total (${st.selectedTattooTotalHours - st.selectedTattooPaidHours}h FREE)</div>` : '';
  
  // Format the price display based on category
  let priceDisplay = `<strong>$${(chargedService.price/100).toFixed(2)}</strong>`;
  let chargedServiceDisplayText = chargedService.title;
  
  if (st.bogoDetails?.category === 'tattoo') {
    // For tattoos, just show the actual price (no need to double it - the variant price is already correct)
    const actualPrice = (chargedService.price/100).toFixed(2);
    priceDisplay = `<strong>$${actualPrice}</strong>`;
    
    // Use correct hours display text instead of variant title
    if (st.selectedTattooPaidHours && st.selectedTattooTotalHours) {
      chargedServiceDisplayText = `Pay for ${st.selectedTattooPaidHours} Hour${st.selectedTattooPaidHours > 1 ? 's' : ''}, get ${st.selectedTattooTotalHours} Hours`;
    }
  }
  
    pricingContainer.innerHTML = `<div style="border-top:1px solid #ddd;padding-top:16px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span>You Pay: <strong>${chargedServiceDisplayText}</strong></span>
        <span>${priceDisplay}</span>
      </div>
  ${freeLines.map(f=>`<div style=\"display:flex;justify-content:space-between;margin-bottom:8px;color:#28a745;\"><span>FREE: <strong>${f.title}</strong></span><span><span style=\"text-decoration:line-through;color:#999;\">$${(f.price/100).toFixed(2)}</span> <strong style=\"color:#28a745;\">FREE</strong></span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#666;">
        <span>Total Savings:</span>
        <span>$${sel.totalSavings.toFixed(2)}</span>
      </div>
      ${tattooHoursNote}
    </div>`;
    
    // Setup event handlers
    const bookBtn = st.stepBogoSummary.querySelector('.bogo-book-btn');
    const backBtn = st.stepBogoSummary.querySelector('.bogo-summary-back-btn');
    
    bookBtn.onclick = async () => {
      // Check for Instagram scheduling mode (no-calendar)
      const noCalendarMode = btn.getAttribute('data-bogo-no-calendar') === 'true';
      const instagramUrl = btn.getAttribute('data-bogo-instagram-url') || '#';
      
      if (noCalendarMode && instagramUrl && instagramUrl !== '#') {
        console.log(LOG_PREFIX, 'Instagram mode enabled - showing Instagram step instead of calendar');
        // Store the selected service info before going to Instagram step
        if (st.bogoSelection?.chargedVariant) {
          st.instagramSelectedVariant = st.bogoSelection.chargedVariant.id;
          st.instagramSelectedVariantTitle = st.bogoSelection.chargedVariant.title;
        }
        showInstagramExplanationStep(st, btn, instagramUrl);
      } else {
        // Normal flow: proceed to calendar
        if (st.bogoModifiedCalendar) {
          await proceedWithChosenCalendar(st, st.bogoModifiedCalendar);
        }
      }
    };
    
    backBtn.onclick = () => {
      goBackStep(st);
    };
    
    // Adapt summary for unified BOGO Gift flow (gems-whitening gift purchase path)
    if (st.giftBogoMode) {
      try {
        bookBtn.textContent = 'Continue to Gift Details';
        bookBtn.onclick = () => {
          if (st.bogoSelection?.chargedVariant) {
            st.giftChargedVariantId = st.bogoSelection.chargedVariant.id;
            st.giftChargedVariantTitle = st.bogoSelection.chargedVariant.title;
          }
          showStepGiftPurchase(st);
          setupGiftPurchaseForm(st, btn);
        };
        backBtn.onclick = () => {
            // Use universal back system for BOGO gift mode
            goBackStep(st);
        };
      } catch(e){ console.warn(LOG_PREFIX, 'Failed adapting BOGO summary for gift mode', e); }
    }

    // Gift redemption (existing gift card) adjustments: change heading + add reminder
    if (st.giftExistingFlow) {
      try {
        const headingEl = st.stepBogoSummary.querySelector('.bogo-summary-heading');
        if (headingEl) headingEl.textContent = 'Gift Card Details';
        if (!st.stepBogoSummary.querySelector('.gift-code-reminder')) {
          const remind = document.createElement('div');
          remind.className = 'gift-code-reminder';
          remind.style.cssText = 'margin-top:14px;font-size:12px;color:#666;text-align:center;line-height:1.4;';
          remind.innerHTML = 'Reminder: Enter your gift card code at checkout to apply its value.';
          // Place after pricing summary for visibility
          const ps = st.stepBogoSummary.querySelector('.pricing-summary');
          if (ps && ps.parentNode) {
            ps.parentNode.appendChild(remind);
          } else {
            st.stepBogoSummary.appendChild(remind);
          }
        }
      } catch(e){ console.warn(LOG_PREFIX,'Gift redemption summary augmentation failed', e); }
    }

    showStepBogoSummary(st);
  }

  /* Create BOGO-Modified Meety Calendar 
   * 
   * HOW BOGO CALENDAR WORKS:
   * 1. Takes the appropriate category-specific calendar JSON as the base
   * 2. Substitutes the variantId with the higher-priced selected service
   * 3. Keeps all other calendar settings (template, assignedProduct, etc.) the same
   * 4. Result: User books the expensive service, but gets both services in the deal
   */
  async function createBogoMeetyCalendar(baseCalendar, chargedVariant, btn) {
    try {
      const bogoCategory = btn.getAttribute('data-bogo-category') || 'none';
      
      // Use the baseCalendar passed in (category-specific selection is now handled earlier)
      const categoryCalendar = baseCalendar;
      
      console.log(LOG_PREFIX, 'createBogoMeetyCalendar: Using pre-selected category calendar for', bogoCategory);
      
      // Clone the category-specific calendar configuration
      const modifiedCalendar = { ...categoryCalendar };
      
      // IMPORTANT: Replace variant ID with the higher-priced BOGO selection
      // This ensures the user pays the correct amount in the calendar booking
      modifiedCalendar.variantId = chargedVariant.id.toString();
      
      // Only update product ID if it's explicitly different from the base calendar
      // This maintains compatibility with existing widgets
      const bogoProductId = getBogoProductId(btn, bogoCategory);
      if (bogoProductId && bogoProductId !== '' && bogoProductId !== categoryCalendar.productId) {
        console.log(LOG_PREFIX, 'BOGO: Updating productId from', categoryCalendar.productId, 'to', bogoProductId, 'for category', bogoCategory);
        modifiedCalendar.productId = bogoProductId;
      }
      
      console.log(LOG_PREFIX, 'BOGO Calendar Created:', {
        category: bogoCategory,
        baseCalendar: categoryCalendar.variantId,
        substitutedVariant: modifiedCalendar.variantId,
        chargedService: chargedVariant.title,
        price: chargedVariant.price / 100
      });
      
      return modifiedCalendar;
    } catch (error) {
      console.error(LOG_PREFIX, 'Failed to create BOGO Meety calendar:', error);
      return null;
    }
  }

  /* Open from button */
  async function handleOpenFromButton(btn){
    const btnId = btn.id;
    const st = buildOverlayForButton(btn);
    // Refresh texts (in case edited live)
    st.chooserTitle.textContent = btn.getAttribute('data-chooser-title') || 'What kind of services would you like?';
    st.chooserNote.textContent  = btn.getAttribute('data-chooser-note')  || '#';
    st.serviceTitle.textContent = btn.getAttribute('data-service-title') || 'Select service to continue';
    st.serviceNote.textContent  = btn.getAttribute('data-service-note')  || 'Pick a service above.';
  st.serviceUiMode = (btn.getAttribute('data-service-ui')||'buttons').toLowerCase();
  st.cal1Parser = (btn.getAttribute('data-cal1-parser')||st.serviceUiMode).toLowerCase();
  st.cal2Parser = (btn.getAttribute('data-cal2-parser')||st.serviceUiMode).toLowerCase();
    st.piercingCatsRaw = (btn.getAttribute('data-piercing-cats')||'Ear|Facial|Oral|Body|Vulvar|Penile');
    st.promoMode = (btn.getAttribute('data-piercing-promo-mode')||'off').toLowerCase();
    st.promoKeysRaw = (btn.getAttribute('data-piercing-promo-keys')||'#');
    st.promoEnabled = (btn.getAttribute('data-promo-enabled') === 'true');

    openOverlay(btnId);

    const raw1 = btn.getAttribute('data-meety-data');
    const raw2 = btn.getAttribute('data-meety-data-2');
    const json1 = parseJSONSafe(decodeEntities(raw1));
    const json2 = parseJSONSafe(decodeEntities(raw2));

    const cal1Label = btn.getAttribute('data-cal1-label') || 'Calendar A';
    const cal2Label = btn.getAttribute('data-cal2-label') || 'Calendar B';
    const chooserMode = (btn.getAttribute('data-chooser-mode') || 'auto').toLowerCase();
  const bookingFlowMode = (btn.getAttribute('data-booking-flow-mode') || 'standard').toLowerCase();
  st.bookingFlowMode = bookingFlowMode;

  // Interpret bookingFlowMode into capability flags
  const rawBogoCategory = btn.getAttribute('data-bogo-category') || 'none';
  let inferredBogoCategory = rawBogoCategory;
  if (bookingFlowMode === 'bogo_piercings') inferredBogoCategory = 'piercings';
  else if (bookingFlowMode === 'bogo_tooth_gems') inferredBogoCategory = 'tooth-gems';
  else if (bookingFlowMode === 'bogo_teeth_whitening') inferredBogoCategory = 'teeth-whitening';
  else if (bookingFlowMode === 'bogo_gems_whitening') inferredBogoCategory = 'gems-whitening';
  else if (bookingFlowMode === 'bogo_tattoo') inferredBogoCategory = 'tattoo';
  // Store back for downstream logic consistency
  st.inferredBogoCategory = inferredBogoCategory;
  
  console.log(LOG_PREFIX, 'BOGO Category Mapping:', { 
    bookingFlowMode, 
    rawBogoCategory, 
    inferredBogoCategory, 
    willTriggerBogo: inferredBogoCategory !== 'none' 
  });

  const hasBogoProduct = hasAnyBogoProduct(btn);
  const hasGiftCards = !!(btn.getAttribute('data-gift-card-variant-1') || btn.getAttribute('data-gift-card-variant-2') || btn.getAttribute('data-gift-card-variant-3'));
  const hasSecondaryCalendar = !!json2;
  const bogoEnabled = hasBogoProduct && (inferredBogoCategory !== 'none');

  // Count distinct service paths for Step 0 determination
  let pathCount = 0;
  if (json1) pathCount++; // primary booking
  if (hasSecondaryCalendar) pathCount++; // secondary calendar path
  if (bogoEnabled && json1) pathCount++; // bogo path piggybacks primary
  // Count promo path whenever promo enabled & multi-step chooser mode (independent of gift cards or bogo assets)
  if (st.promoEnabled && bookingFlowMode === 'multi_step_chooser') pathCount++; // promo path

  const forceStep0 = (pathCount > 1) || (bookingFlowMode === 'multi_step_chooser');

    cleanupActive(st);

    const has1 = !!json1, has2 = !!json2;
    if (forceStep0 && has1) {
      st.chooserConfig = {json1, json2, cal1Label, cal2Label, chooserMode, bookingFlowMode};
  const promoTitle = btn.getAttribute('data-promo-title') || 'Promotions';
  renderMainServiceChooser(st, btn, {json1, json2, cal1Label, cal2Label, promoTitle, hasBogoPotential: bogoEnabled, hasGiftCards});
      showStepMainChooser(st);
      return;
    }
    if ((chooserMode === 'dropdown' || chooserMode === 'buttons' || chooserMode === 'auto' || chooserMode === 'tattoo-gift-card' || chooserMode === 'bogo-gift-card') && has1 && has2) {
      // Store the chooser config for later use
      st.chooserConfig = {json1, json2, cal1Label, cal2Label, chooserMode};

      // RUNTIME SCHEMA / CONFIG SNAPSHOT
      try {
        const runtimeConfig = {
          chooserMode,
          serviceUiMode: st.serviceUiMode,
          bogo: {
            category: btn.getAttribute('data-bogo-category') || 'none',
            toothGemsHandle: btn.getAttribute('data-bogo-product-handle') || null,
            teethWhiteningHandle: btn.getAttribute('data-bogo-whitening-product-handle') || null,
            piercingCalendarJson: (btn.getAttribute('data-piercing-calendar-json')||'').slice(0,120),
            teethGemsCalendarJson: (btn.getAttribute('data-teeth-gems-calendar-json')||'').slice(0,120),
            teethWhiteningCalendarJson: (btn.getAttribute('data-teeth-whitening-calendar-json')||'').slice(0,120)
          },
          calendars: {
            primaryLabel: cal1Label,
            secondaryLabel: cal2Label,
            hasPrimary: !!json1,
            hasSecondary: !!json2,
            primarySnippet: json1 ? json1.slice(0,100) : null,
            secondarySnippet: json2 ? json2.slice(0,100) : null
          },
            giftCards: {
              tier1: {
                label: btn.getAttribute('data-gift-duration-label-1') || null,
                variant: btn.getAttribute('data-gift-card-variant-1') || null,
                calendar: (btn.getAttribute('data-gift-calendar-1')||'').slice(0,100)
              },
              tier2: {
                label: btn.getAttribute('data-gift-duration-label-2') || null,
                variant: btn.getAttribute('data-gift-card-variant-2') || null,
                calendar: (btn.getAttribute('data-gift-calendar-2')||'').slice(0,100)
              },
              tier3: {
                label: btn.getAttribute('data-gift-duration-label-3') || null,
                variant: btn.getAttribute('data-gift-card-variant-3') || null,
                calendar: (btn.getAttribute('data-gift-calendar-3')||'').slice(0,100)
              }
            },
          promo: {
            title: btn.getAttribute('data-promo-title') || null,
            descriptionSnippet: (btn.getAttribute('data-promo-description')||'').slice(0,140)
          },
          piercingCategories: {
            enabled: st.serviceUiMode === 'piercings-categories',
            rawKeywords: btn.getAttribute('data-piercing-categories') || null,
            promoFilterMode: btn.getAttribute('data-piercing-promo-filter') || 'off',
            promoKeywords: btn.getAttribute('data-piercing-promo-keywords') || '#'
          },
          triggers: (btn.getAttribute('data-additional-triggers')||'').split(',').map(s=>s.trim()).filter(Boolean),
          internal: {
            selectedServiceType: st.selectedServiceType || null,
            currentStep: st.currentStep || null
          }
        };
        console.log(LOG_PREFIX, 'Runtime Config Snapshot (multi-calendar path):', runtimeConfig);
      } catch(e) { console.warn(LOG_PREFIX, 'Failed to log runtime config snapshot', e); }

      // EARLY BOGO: If this button is in BOGO mode (explicit service_ui_mode or category), jump directly to BOGO selection
      const bogoCategoryEarly = btn.getAttribute('data-bogo-category') || 'none';
      if (st.serviceUiMode === 'bogo' && bogoCategoryEarly !== 'none') {
        console.log(LOG_PREFIX, 'Early BOGO trigger (explicit bogo mode)');
        await setupBogoFlow(st, btn);
        return;
      } else if (bogoCategoryEarly !== 'none') {
        console.log(LOG_PREFIX, 'Early BOGO suppressed (gift card multi-calendar path). Will defer until promo path selection.', { bogoCategoryEarly, chooserMode });
      }
      
      if (chooserMode === 'tattoo-gift-card' || chooserMode === 'bogo-gift-card') {
        // Start with main service type selector for gift card modes
        const promoTitle = btn.getAttribute('data-promo-title') || 'Black Friday Special';
        renderMainServiceChooser(st, btn, {json1, json2, cal1Label, cal2Label, promoTitle});
        showStepMainChooser(st);
      } else {
        // For other modes, go directly to calendar chooser 
        renderChooser(st, btn, {json1, json2, cal1Label, cal2Label, chooserMode});
        showStepChooser(st);
      }
    } else if (chooserMode === 'tattoo-gift-card' || chooserMode === 'bogo-gift-card') {
      // Gift card mode with single calendar - still show main chooser
      st.chooserConfig = {json1, json2, cal1Label, cal2Label, chooserMode};
      const promoTitle = btn.getAttribute('data-promo-title') || 'Black Friday Special';
      renderMainServiceChooser(st, btn, {json1, json2, cal1Label, cal2Label, promoTitle});
      showStepMainChooser(st);
    } else {
      const chosen = has1 ? json1 : (has2 ? json2 : null);
      if (!chosen) return closeOverlay(btnId);
      // EARLY BOGO (single calendar path)
      st.chooserConfig = { json1: chosen, json2: null, cal1Label, cal2Label, chooserMode };
      const bogoCategoryEarlySingle = btn.getAttribute('data-bogo-category') || 'none';
      // RUNTIME SCHEMA / CONFIG SNAPSHOT (single calendar)
      try {
        const runtimeConfig = {
          chooserMode,
          singleCalendar: true,
          serviceUiMode: st.serviceUiMode,
          bogo: {
            category: btn.getAttribute('data-bogo-category') || 'none',
            toothGemsHandle: btn.getAttribute('data-bogo-product-handle') || null,
            teethWhiteningHandle: btn.getAttribute('data-bogo-whitening-product-handle') || null
          },
          calendars: {
            primaryLabel: cal1Label,
            hasPrimary: !!chosen,
            primarySnippet: chosen ? chosen.slice(0,100) : null
          },
          promo: {
            title: btn.getAttribute('data-promo-title') || null
          },
          internal: {
            selectedServiceType: st.selectedServiceType || null,
            currentStep: st.currentStep || null
          }
        };
        console.log(LOG_PREFIX, 'Runtime Config Snapshot (single-calendar path):', runtimeConfig);
      } catch(e) { console.warn(LOG_PREFIX, 'Failed to log runtime config snapshot (single)'); }
      if (st.serviceUiMode === 'bogo' && bogoCategoryEarlySingle !== 'none') {
        console.log(LOG_PREFIX, 'Early BOGO trigger (single calendar explicit bogo mode)');
        await setupBogoFlow(st, btn);
        return;
      } else if (bogoCategoryEarlySingle !== 'none' && (chooserMode === 'tattoo-gift-card' || chooserMode === 'bogo-gift-card')) {
        console.log(LOG_PREFIX, 'Early BOGO suppressed (gift card single-calendar). Will defer until promo path.', { bogoCategoryEarlySingle, chooserMode });
      }
      await proceedWithChosenCalendar(st, chosen);
    }
  }

  /* Step 0: chooser */
  function renderChooser(st, btn, {json1, json2, cal1Label, cal2Label, chooserMode}){
    st.chooserRow.innerHTML = '';
    
    if (chooserMode === 'tattoo-gift-card') {
      renderTattooGiftCardChooser(st, btn, {json1, json2, cal1Label, cal2Label});
      return;
    }

    if (chooserMode === 'bogo-gift-card') {
      renderBogoGiftCardChooser(st, btn);
      return;
    }
    
    if (chooserMode === 'dropdown' || chooserMode === 'auto') {
      const select = document.createElement('select'); select.className = 'meety-chooser-select';
      select.innerHTML = '<option value="">Select a calendar…</option><option value="1"></option><option value="2"></option>';
      select.options[1].textContent = cal1Label; select.options[2].textContent = cal2Label;
      const go = document.createElement('button'); go.className = 'meety-chooser-btn primary'; go.textContent = 'Continue';
  go.addEventListener('click', async ()=>{ const v = select.value; if (v !== '1' && v !== '2') return; if (v==='1') st.serviceUiMode = st.cal1Parser; else st.serviceUiMode = st.cal2Parser; const chosen = (v==='1')?json1:json2; await proceedWithChosenCalendar(st, chosen); });
      st.chooserRow.append(select, go);
    }
    if (chooserMode === 'buttons') {
  const b1 = document.createElement('button'); b1.className = 'meety-chooser-btn primary'; b1.textContent = cal1Label; b1.addEventListener('click', async ()=>{ st.serviceUiMode = st.cal1Parser; await proceedWithChosenCalendar(st, json1); });
  const b2 = document.createElement('button'); b2.className = 'meety-chooser-btn primary'; b2.textContent = cal2Label; b2.addEventListener('click', async ()=>{ st.serviceUiMode = st.cal2Parser; await proceedWithChosenCalendar(st, json2); });
      st.chooserRow.append(b1, b2);
    }
  }

  /* Render Tattoo Gift Card Chooser */
  function renderTattooGiftCardChooser(st, btn, {json1, json2, cal1Label, cal2Label}) {
    // Update the title for tattoo gift card mode
    const promoTitle = btn.getAttribute('data-promo-title') || 'Black Friday Tattoo Special - Choose Your Option';
    st.chooserTitle.textContent = promoTitle;
    st.chooserTitle.style.textAlign = 'center';
    
    // Add promotional paragraph explaining the offer
    const promoDescription = btn.getAttribute('data-promo-description') || '🎉 <strong>Buy One Get One FREE!</strong> Purchase any tattoo gift card session and receive <strong>double the time</strong> at no extra cost. Perfect for sharing the experience or treating yourself to more time.';
    const promoText = document.createElement('p');
    promoText.style.cssText = 'margin: 8px 0 15px; font-size: 14px; color: #666; text-align: center; line-height: 1.4;';
    promoText.innerHTML = promoDescription;
    st.chooserRow.appendChild(promoText);
    
    // Add the promotional explanation
    st.chooserNote.textContent = 'Gift card codes are applied during checkout.';
    st.chooserNote.style.textAlign = 'center';
    st.chooserNote.style.marginBottom = '15px';
    
    // Tattoo Gift Card Mode: 3 options
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'gift-card-options';
    
    const bookMyself = document.createElement('button');
    bookMyself.className = 'gift-card-btn';
    bookMyself.textContent = 'Book Tattoo Session for Myself';
    bookMyself.addEventListener('click', async () => {
      // Use regular calendar selection logic for tattoo booking
      if (json1 && json2) {
        // If both calendars exist, let user choose
        renderChooser(st, btn, {json1, json2, cal1Label, cal2Label, chooserMode: 'dropdown'});
        showStepChooser(st);
      } else {
        // Go directly to the available calendar
        await proceedWithChosenCalendar(st, json1 || json2);
      }
    });
    
    const bookOther = document.createElement('button');
    bookOther.className = 'gift-card-btn';
    bookOther.textContent = 'Buy Tattoo Gift Card for Someone Else';
    // Disable if tattoo inventory is sold out based on server Liquid total
    try {
      const liquidTotalRaw = btn.getAttribute('data-bogo-tattoo-liquid-total');
      const liquidTotal = liquidTotalRaw ? parseInt(liquidTotalRaw, 10) : NaN;
      if (!isNaN(liquidTotal) && liquidTotal <= 0) {
        bookOther.disabled = true;
        bookOther.classList.add('disabled');
        bookOther.setAttribute('aria-disabled', 'true');
        bookOther.title = 'Sold Out';
      }
    } catch(e){}
    bookOther.addEventListener('click', () => {
      const bogoCategory = btn.getAttribute('data-bogo-category');
      console.log(LOG_PREFIX, 'Regular gift card button clicked:', {
        buttonId: btn.id,
        bogoCategory: bogoCategory,
        hasTrackingProducts: !!(
          btn.getAttribute('data-bogo-track-tattoo') ||
          btn.getAttribute('data-bogo-track-piercings') ||
          btn.getAttribute('data-bogo-track-tooth-gems') ||
          btn.getAttribute('data-bogo-track-teeth-whitening')
        )
      });
      
      // Use the proper gift flow to ensure tracking products are added
      if (bogoCategory && bogoCategory !== 'none') {
        // Use the gift flow which sets proper state for tracking
        startGiftFlow(st, btn, bogoCategory);
      } else {
        // Even without explicit BOGO category, try to determine category from tracking products
        const trackingCategory = getInferredTrackingCategory(btn);
        if (trackingCategory) {
          console.log(LOG_PREFIX, 'Inferred tracking category for regular gift card:', trackingCategory);
          startGiftFlow(st, btn, trackingCategory);
        } else {
          // Fallback to direct flow but set a flag to indicate this is a gift purchase
          st.isRegularGiftPurchase = true;
          showStepGiftPurchase(st);
          setupGiftPurchaseForm(st, btn);
        }
      }
    });
    
    const redeemGift = document.createElement('button');
    redeemGift.className = 'gift-card-btn secondary';
    redeemGift.textContent = 'I Already Have a Tattoo Gift Card';
    redeemGift.addEventListener('click', () => {
      showStepRedeem(st);
      setupExistingGiftCard(st, btn);
    });
    
    optionsContainer.append(bookMyself, bookOther, redeemGift);
    st.chooserRow.appendChild(optionsContainer);
  }

  /* Render BOGO Gift Card Chooser */
  function renderBogoGiftCardChooser(st, btn) {
    // Update the title for BOGO gift card mode
    const promoTitle = btn.getAttribute('data-promo-title') || 'BOGO Special - Choose Your Option';
    st.chooserTitle.textContent = promoTitle;
    st.chooserTitle.style.textAlign = 'center';
    
    // Add promotional paragraph for BOGO
    const promoDescription = btn.getAttribute('data-promo-description') || '💎 <strong>Buy One Get One FREE!</strong> Select two services and pay only for the higher-priced one. Perfect for piercings, tooth gems, and teeth whitening.';
    const promoText = document.createElement('p');
    promoText.style.cssText = 'margin: 8px 0 15px; font-size: 14px; color: #666; text-align: center; line-height: 1.4;';
    promoText.innerHTML = promoDescription;
    st.chooserRow.appendChild(promoText);
    
    // Add the promotional explanation
    st.chooserNote.textContent = 'Gift cards include both services in your BOGO deal.';
    st.chooserNote.style.textAlign = 'center';
    st.chooserNote.style.marginBottom = '15px';
    
    // BOGO Gift Card Mode: 3 options
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'gift-card-options';
    
    const bookMyself = document.createElement('button');
    bookMyself.className = 'gift-card-btn';
    bookMyself.textContent = 'Book BOGO Services for Myself';
    bookMyself.addEventListener('click', async () => {
      // Go directly to BOGO flow
      await setupBogoFlow(st, btn);
    });
    
    const bookOther = document.createElement('button');
    bookOther.className = 'gift-card-btn';
    bookOther.textContent = 'Buy BOGO Gift Card for Someone Else';
    bookOther.addEventListener('click', () => {
      showStepGiftPurchase(st);
      setupBogoGiftPurchaseForm(st, btn);
    });
    
    const redeemGift = document.createElement('button');
    redeemGift.className = 'gift-card-btn secondary';
    redeemGift.textContent = 'I Already Have a BOGO Gift Card';
    redeemGift.addEventListener('click', () => {
      showStepRedeem(st);
      setupExistingBogoGiftCard(st, btn);
    });
    
    optionsContainer.append(bookMyself, bookOther, redeemGift);
    st.chooserRow.appendChild(optionsContainer);
  }

  async function proceedWithChosenCalendar(st, btnData){
    console.log(LOG_PREFIX, 'proceedWithChosenCalendar: requested btnData', btnData);
    
    // Validate state and prevent wrong path navigation
    if (!st || !btnData) {
      console.error(LOG_PREFIX, 'proceedWithChosenCalendar: Invalid state or button data');
      return;
    }
    
    // Get button reference
    const btn = st.button;
    
    // Check if we're in a valid flow state
    const validFlowStates = ['booking', 'gift', 'redeem', 'bogo'];
    const currentFlow = st.serviceFlow || st.giftRedeemMode || (st.bogoDetails ? 'bogo' : 'booking');
    
    if (!validFlowStates.includes(currentFlow)) {
      console.warn(LOG_PREFIX, 'proceedWithChosenCalendar: Invalid flow state detected, resetting to booking');
      st.serviceFlow = 'booking';
    }
    
    // CRITICAL FIX: Mark redemption flows to prevent tracking products
    // When someone redeems a gift card, they shouldn't get new tracking products added
    const isRedemptionFlow = st.giftRedeemMode === true || st.giftExistingFlow === true;
    if (isRedemptionFlow && window.__meetyBogoContext) {
      console.log(LOG_PREFIX, '🎫 REDEMPTION FLOW DETECTED: Marking BOGO context as redemption to prevent tracking');
      window.__meetyBogoContext.isRedemption = true;
      window.__meetyBogoContext.isGiftPurchase = false;
    }
    
    // Prevent navigation to add-to-cart form unless we're in gift purchase mode
    const isGiftPurchaseFlow = st.serviceFlow === 'gift' && !st.giftRedeemMode;
    const hasGiftCardVariants = !!(st.giftCardVariants && st.giftCardVariants.length > 0);
    
    if (isGiftPurchaseFlow && !hasGiftCardVariants) {
      console.error(LOG_PREFIX, 'Gift purchase flow but no gift card variants configured');
      showStepService(st);
      return;
    }
    
    const isBogoFlow = !!(st.bogoDetails || st.bogoModifiedCalendar);
    console.log(LOG_PREFIX, 'proceedWithChosenCalendar: flow validation', {
      currentFlow,
      isBogoFlow,
      isGiftPurchaseFlow,
      hasGiftCardVariants,
      serviceFlow: st.serviceFlow,
      giftRedeemMode: st.giftRedeemMode
    });
    
    let match;
    
    // Enhanced widget matching with better error handling
    try {
      // For BOGO flows, try original calendar first for better widget matching
      if (isBogoFlow && st.bogoOriginalCalendar) {
        console.log(LOG_PREFIX, 'BOGO: Trying original calendar JSON first for widget matching');
        match = await findOrWaitMatchingWidget(st.bogoOriginalCalendar, 2000, true);
      }
      
      // If no match from original, try the modified calendar
      if (!match) {
        console.log(LOG_PREFIX, isBogoFlow ? 'BOGO: Trying modified calendar JSON' : 'Regular flow: Finding widget');
        // Use shorter timeout for regular flows since widgets should be readily available
        const timeout = isBogoFlow ? 2000 : 3000; // Reduced from 9000 to 3000 for primary calendars
        match = await findOrWaitMatchingWidget(btnData, timeout, isBogoFlow);
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'Widget matching failed with error:', error);
      match = null;
    }
    
    if (!match) { 
      console.warn(LOG_PREFIX, 'No matching widget found for btnData', btnData);
      // For BOGO, show a more helpful error
      if (isBogoFlow) {
        console.error(LOG_PREFIX, 'BOGO Calendar Match Failed. Check that a widget exists with matching template, assignedProduct, and productId');
      }
      
      // Navigate back to appropriate step based on flow
      if (isGiftPurchaseFlow) {
        console.log(LOG_PREFIX, 'Navigating to gift purchase form due to missing widget');
        showStepGiftPurchase(st);
      } else {
        showStepService(st);
      }
      return; 
    }
    
    console.log(LOG_PREFIX, 'Widget match found, moving widget into overlay');
    hideAllCalendarsOutsideOverlays(); 
    setTempDisplay(match, 'block');

    // For BOGO flows, temporarily update the widget's meety-data to match our modified calendar
    if (isBogoFlow && st.bogoModifiedCalendar) {
      const originalMeetyData = match.getAttribute('meety-data');
      match.setAttribute('meety-data', JSON.stringify(st.bogoModifiedCalendar));
      console.log(LOG_PREFIX, 'Updated widget meety-data for BOGO:', JSON.stringify(st.bogoModifiedCalendar));
      
      // Store original for restoration later
      st.originalMeetyData = originalMeetyData;
      
      // Store BOGO service info for dropdown selection
      // For tattoo BOGO, map hours to dropdown text; for others use charged service title
      if (st.bogoDetails.category === 'tattoo' && st.selectedTattooPaidHours) {
        st.bogoServiceToSelect = getTattooServiceTextFromHours(st.selectedTattooPaidHours, st.selectedTattooTotalHours);
        console.log(LOG_PREFIX, 'Tattoo BOGO: mapped service for dropdown:', {
          paidHours: st.selectedTattooPaidHours,
          totalHours: st.selectedTattooTotalHours,
          chargedServiceTitle: st.bogoDetails.chargedService.title,
          mappedServiceText: st.bogoServiceToSelect
        });
      } else {
        st.bogoServiceToSelect = st.bogoDetails.chargedService.title;
        console.log(LOG_PREFIX, 'Non-tattoo BOGO: using charged service title:', st.bogoServiceToSelect);
      }
    }

    const sectionEl = match.closest('.shopify-section, [id^="shopify-section-"]');
    if (!sectionEl) { 
      console.warn(LOG_PREFIX, 'Could not locate wrapping shopify-section for widget'); 
      
      // Navigate back based on flow instead of defaulting to service step
      if (isGiftPurchaseFlow) {
        showStepGiftPurchase(st);
      } else {
        showStepService(st);
      }
      return; 
    }
    
    const placeholder = document.createComment('meety-placeholder:' + (sectionEl.id || 'no-id'));
    sectionEl.parentNode.insertBefore(placeholder, sectionEl);

    st.stepCalendar.innerHTML = '';
    st.stepCalendar.appendChild(sectionEl);
    sectionEl.style.display = 'block';
    st.active = { sectionEl, placeholder, widgetEl: match };

    // For BOGO flows, auto-select the correct service and add free service
    if (isBogoFlow && st.bogoServiceToSelect) {
      // Try multiple times with quicker timing for better responsiveness
      setTimeout(() => autoSelectBogoService(st, match), 400);
      setTimeout(() => autoSelectBogoService(st, match), 800);
      setTimeout(() => autoSelectBogoService(st, match), 1200);
      
      // Add the free service as an inline item after main service is selected
      setTimeout(() => addFreeBogoServiceInline(st, match), 1500);
    }

    await runMirroredServiceStepRobust(st, match);
  }

  /* Map tattoo hours to service dropdown text */
  function getTattooServiceTextFromHours(paidHours, totalHours) {
    if (!paidHours || !totalHours) return null;
    
    // Map hours to the expected service dropdown text format
    // Handle both singular and plural forms
    const paidHourText = paidHours === 1 ? '1 Hour' : `${paidHours} Hours`;
    const totalHourText = totalHours === 1 ? '1 Hour' : `${totalHours} Hours`;
    
    // Primary format: "Pay for X Hour(s), get Y Hours"
    const primaryFormat = `Pay for ${paidHourText}, get ${totalHourText}`;
    
    console.log(LOG_PREFIX, 'Mapped tattoo hours to service text:', {
      paidHours,
      totalHours,
      paidHourText,
      totalHourText,
      serviceText: primaryFormat
    });
    
    return primaryFormat;
  }

  /* Find tattoo service by hours in dropdown (fuzzy matching) */
  function findTattooServiceInDropdown(items, paidHours, totalHours) {
    if (!paidHours || !totalHours || !Array.isArray(items)) return null;
    
    // Try exact mapping first
    const expectedText = getTattooServiceTextFromHours(paidHours, totalHours);
    let match = items.find(item => normalizeTxt(item.textContent) === normalizeTxt(expectedText));
    
    if (match) {
      console.log(LOG_PREFIX, 'Found exact tattoo service match:', match.textContent);
      return match;
    }
    
    // Fallback: fuzzy search for hours pattern
      match = items.find(item => {
        const text = item.textContent.toLowerCase();
        const hasPaidHours = text.includes(`${paidHours} hour`) || text.includes(`pay for ${paidHours}`) || text.includes(`pay ${paidHours}`);
        const hasTotalHours = text.includes(`${totalHours} hour`) || text.includes(`get ${totalHours}`) || text.includes(`${totalHours}hrs`);
        return hasPaidHours && hasTotalHours;
      });
    
    if (match) {
      console.log(LOG_PREFIX, 'Found fuzzy tattoo service match:', match.textContent);
      return match;
    }
    
    // Try numeric extraction: pick the option with the closest totalHours >= requested totalHours
    const parsed = items.map(item => {
      const txt = item.textContent || '';
      const nums = (txt.match(/(\d+(?:\.\d+)?)/g) || []).map(n => parseFloat(n));
      return { el: item, txt, nums };
    });

    // Prefer options that explicitly mention totalHours or 'get X'
    let candidate = parsed.find(p => {
      const t = p.txt.toLowerCase();
      return t.includes(`get ${totalHours}`) || t.includes(`${totalHours} hour`) || t.includes(`${totalHours}hrs`);
    });

    if (candidate) {
      console.log(LOG_PREFIX, 'Found candidate by explicit totalHours text:', candidate.txt);
      return candidate.el;
    }

    // Otherwise pick first option whose largest numeric value is >= requested totalHours
    const numericCandidate = parsed.find(p => {
      const maxNum = p.nums.length ? Math.max(...p.nums) : -Infinity;
      return maxNum >= totalHours;
    });

    if (numericCandidate) {
      console.log(LOG_PREFIX, 'Found numeric candidate for tattoo service:', numericCandidate.txt);
      return numericCandidate.el;
    }

    console.warn(LOG_PREFIX, 'No tattoo service match found for hours:', {
      paidHours,
      totalHours,
      availableOptions: items.map(item => item.textContent)
    });

    return null;
  }

  /* Silent auto-selection for tattoo redemption (no UI flash) */
  async function performSilentTattooAutoSelection(st, matchedWidgetEl) {
    try {
      // Find the service trigger without showing any UI
      const trigger = getServiceTriggerIn(matchedWidgetEl);
      if (!trigger) {
        console.warn(LOG_PREFIX, 'Silent auto-selection: no service trigger found');
        return false;
      }

      // Open dropdown silently
      trigger.click();
      const popupReady = await waitFor(() => getAnyOpenMeetyPopup(), 25, 80);
      if (!popupReady) {
        console.warn(LOG_PREFIX, 'Silent auto-selection: dropdown did not open');
        return false;
      }

      const popup = getAnyOpenMeetyPopup();
      if (!popup) return false;

      // Keep popup completely hidden during auto-selection
      popup.style.opacity = '0';
      popup.style.visibility = 'hidden';
      popup.style.pointerEvents = 'none';
      popup.style.position = 'absolute';
      popup.style.top = '-9999px';
      popup.style.left = '-9999px';

      // Find and click the correct service option
      const items = Array.from(popup.querySelectorAll('.meety-select-item'));
      const targetItem = findTattooServiceInDropdown(items, st.selectedTattooPaidHours, st.selectedTattooTotalHours);

      if (!targetItem) {
        console.warn(LOG_PREFIX, 'Silent auto-selection: could not find matching service');
        // Restore popup for fallback UI
        popup.style.opacity = '';
        popup.style.visibility = '';
        popup.style.pointerEvents = '';
        popup.style.position = '';
        popup.style.top = '';
        popup.style.left = '';
        return false;
      }

      console.log(LOG_PREFIX, 'Silent auto-selection: clicking service:', targetItem.textContent);
      targetItem.click();

      // Wait for selection to complete
      const selectionComplete = await waitFor(() => {
        const currentText = trigger.querySelector('.meety-text')?.textContent || '';
        return normalizeTxt(currentText) !== normalizeTxt('Select a service') && 
               normalizeTxt(currentText) !== '';
      }, 40, 50);

      // Ensure popup is closed
      await waitFor(() => !getAnyOpenMeetyPopup(), 20, 100);

      return selectionComplete;

    } catch (error) {
      console.error(LOG_PREFIX, 'Silent auto-selection error:', error);
      return false;
    }
  }

  /* Auto-select the correct BOGO service in Meety dropdown */
  async function autoSelectBogoService(st, widgetEl) {
    let serviceToSelect = st.bogoServiceToSelect;
    
    // For tattoo BOGO, map the selected hours to the correct service text
    if (!serviceToSelect && st.bogoDetails?.category === 'tattoo' && st.selectedTattooPaidHours) {
      serviceToSelect = getTattooServiceTextFromHours(st.selectedTattooPaidHours, st.selectedTattooTotalHours);
      if (serviceToSelect) {
        console.log(LOG_PREFIX, 'Auto-mapped tattoo hours to service:', serviceToSelect);
      }
    }
    
    if (!serviceToSelect) return;

    console.log(LOG_PREFIX, 'Auto-selecting BOGO service:', serviceToSelect);

    try {
      // Find the service trigger button in the widget
      const trigger = getServiceTriggerIn(widgetEl);
      if (!trigger) {
        console.warn(LOG_PREFIX, 'No service trigger found for auto-selection');
        return;
      }

      // Check if already selected correctly
      const currentText = trigger.querySelector('.meety-text')?.textContent || '';
      if (normalizeTxt(currentText) === normalizeTxt(serviceToSelect)) {
        console.log(LOG_PREFIX, 'Service already correctly selected:', currentText);
        return;
      }

      // Check if dropdown is already open
      let popup = getAnyOpenMeetyPopup();
      
      // If not open, click to open it
      if (!popup) {
        trigger.click();
        
        // Wait for dropdown to appear
        const dropdownReady = await waitFor(() => getAnyOpenMeetyPopup(), 25, 80);
        if (!dropdownReady) {
          console.warn(LOG_PREFIX, 'Service dropdown did not open for auto-selection');
          return;
        }
        popup = getAnyOpenMeetyPopup();
      }

      if (!popup) return;

      // Hide the popup visually while we work with it
      popup.style.opacity = '0';
      popup.style.visibility = 'hidden';
      popup.style.pointerEvents = 'none';

      // Find and click the correct service option
      const items = Array.from(popup.querySelectorAll('.meety-select-item'));
      let targetItem = null;
      
      // For tattoo BOGO, use fuzzy matching to handle variations in text format
      if (st.bogoDetails?.category === 'tattoo' && st.selectedTattooPaidHours) {
        targetItem = findTattooServiceInDropdown(items, st.selectedTattooPaidHours, st.selectedTattooTotalHours);
      }
      
      // Fallback to exact text matching for non-tattoo or if fuzzy match fails
      if (!targetItem) {
        targetItem = items.find(item => {
          const itemText = normalizeTxt(item.textContent);
          const targetText = normalizeTxt(serviceToSelect);
          return itemText === targetText;
        });
      }

      if (targetItem) {
        console.log(LOG_PREFIX, 'Found target service, clicking:', targetItem.textContent);
        targetItem.click();
        
        // Wait for selection to complete and dropdown to close
        await waitFor(() => !getAnyOpenMeetyPopup(), 20, 100);
        
        // Verify the selection updated
        const updatedText = trigger.querySelector('.meety-text')?.textContent || '';
        console.log(LOG_PREFIX, 'Service auto-selection completed. New text:', updatedText);
        
        // Mark as completed to avoid duplicate attempts
        st.bogoServiceToSelect = null;
      } else {
        console.warn(LOG_PREFIX, 'Could not find service option to select:', serviceToSelect);
        console.log(LOG_PREFIX, 'Available options:', items.map(item => item.textContent));
        
        // Restore popup visibility if we're leaving it open
        popup.style.opacity = '';
        popup.style.visibility = '';
        popup.style.pointerEvents = '';
      }

    } catch (error) {
      console.error(LOG_PREFIX, 'Error during auto-selection:', error);
    }
  }

  /* Add free BOGO service as inline item */
  async function addFreeBogoServiceInline(st, widgetEl) {
    if (!st.bogoDetails || !st.bogoDetails.freeService) {
      console.warn(LOG_PREFIX, 'No free service details available for inline addition');
      return;
    }
    // Avoid adding if overlay closed
    if (!st.overlay || st.overlay.style.display === 'none') return;

    const freeService = st.bogoDetails.freeService;
    console.log(LOG_PREFIX, 'Adding free BOGO service inline:', freeService.title);

    try {
      // Look for Meety's booking interface elements
      const bookingContainer = widgetEl.querySelector('.meety-booking-container, .meety-calendar-container, .meety-widget-container') || widgetEl;
      
      // Find where to inject the free service notice
      let injectionPoint = bookingContainer.querySelector('.meety-service-selection, .meety-selected-service, .meety-booking-details');
      
      if (!injectionPoint) {
        // Fallback: find any prominent container in the widget
        injectionPoint = bookingContainer.querySelector('.meety-content, .meety-body') || bookingContainer;
      }

      // Create the free service inline notice
      const freeServiceElement = document.createElement('div');
      freeServiceElement.className = 'meety-bogo-free-service-inline';
      freeServiceElement.style.cssText = `
        background: linear-gradient(135deg, #e8f5e8, #d4edda);
        border: 1px solid #4caf50;
        border-radius: 6px;
        padding: 12px;
        margin: 10px 0;
        font-size: 14px;
        color: #2e7d32;
        box-shadow: 0 2px 4px rgba(76, 175, 80, 0.1);
      `;

      freeServiceElement.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <span style="font-size: 16px;">🎁</span>
          <strong style="color: #1b5e20;">BONUS: Free Service Included!</strong>
        </div>
        <div style="font-size: 13px; line-height: 1.4;">
          <strong>${freeService.title}</strong> - <span style="text-decoration:line-through;color:#999;">$${(freeService.price / 100).toFixed(2)}</span> <span style="color: #4caf50; font-weight: 600;">FREE</span><br>
          <span style="opacity: 0.8;">This service will be added to your appointment at no extra cost</span>
        </div>
      `;

      // Remove any existing free service notices anywhere in this widget to avoid duplicates
      bookingContainer.querySelectorAll('.meety-bogo-free-service-inline').forEach(el=> el.remove());

      // Insert the free service notice
      if (injectionPoint.parentNode) {
        injectionPoint.parentNode.insertBefore(freeServiceElement, injectionPoint.nextSibling);
      } else {
        injectionPoint.appendChild(freeServiceElement);
      }

      console.log(LOG_PREFIX, 'Free BOGO service added inline successfully');

      // Also try to add it to any booking summary or cart preview that might exist
      const tid = setTimeout(() => addFreeServiceToBookingSummary(st, widgetEl), 1000);
      if (!st._timeouts) st._timeouts = [];
      st._timeouts.push(tid);

    } catch (error) {
      console.error(LOG_PREFIX, 'Error adding free service inline:', error);
    }
  }

  /* Add free service to booking summary/cart preview */
  function addFreeServiceToBookingSummary(st, widgetEl) {
    if (!st.bogoDetails || !st.bogoDetails.freeService) return;

    const freeService = st.bogoDetails.freeService;
    
    try {
      // Look for booking summary, cart preview, or order summary elements
      const summarySelectors = [
        '.meety-booking-summary',
        '.meety-cart-preview', 
        '.meety-order-summary',
        '.meety-selected-services',
        '.meety-line-items',
        '[class*="summary"]',
        '[class*="cart"]',
        '[class*="order"]'
      ];

      let summaryContainer = null;
      for (const selector of summarySelectors) {
        summaryContainer = widgetEl.querySelector(selector);
        if (summaryContainer) break;
      }

      if (summaryContainer && !summaryContainer.querySelector('.meety-bogo-summary-item')) {
        const freeItem = document.createElement('div');
        freeItem.className = 'meety-bogo-summary-item';
        freeItem.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #e0e0e0;
          color: #4caf50;
          font-weight: 500;
        `;

        freeItem.innerHTML = `
          <span>🎁 ${freeService.title}</span>
          <span style="font-weight: 600;">FREE</span>
        `;

        summaryContainer.appendChild(freeItem);
        console.log(LOG_PREFIX, 'Added free service to booking summary');
      }

    } catch (error) {
      console.error(LOG_PREFIX, 'Error adding to booking summary:', error);
    }
  }

  /* BOGO Gift Card Functions */
  function setupBogoGiftPurchaseForm(st, btn) {
    st.giftPurchaseContent.innerHTML = `
      <h3>Purchase BOGO Gift Card</h3>
      <p>This gift card includes a complete BOGO deal - two services for the price of one!</p>
      <div class="form-group">
        <label>Recipient's Name:</label>
        <input type="text" class="form-control" id="recipient-name" required>
      </div>
      <div class="form-group">
        <label>Recipient's Email:</label>
        <input type="email" class="form-control" id="recipient-email" required>
      </div>
      <div class="form-group">
        <label>Personal Message (optional):</label>
        <textarea class="form-control" id="gift-message" rows="3" placeholder="Happy Birthday! Enjoy your BOGO services!"></textarea>
      </div>
    `;
    
    // Update proceed button for BOGO flow
    const proceedBtn = st.giftPurchaseContent.querySelector('.proceed-gift-btn');
    if (proceedBtn) {
      proceedBtn.textContent = 'Select BOGO Services & Continue';
      proceedBtn.onclick = () => {
        // Validate form first
        const name = document.getElementById('recipient-name').value;
        const email = document.getElementById('recipient-email').value;
        if (!name || !email) {
          alert('Please fill in all required fields.');
          return;
        }
        // Then go to BOGO selection
        setupBogoFlow(st, btn);
      };
    }
  }

  function setupExistingBogoGiftCard(st, btn) {
    st.redeemContent.innerHTML = `
      <h3>Redeem Your BOGO Gift Card</h3>
      <p>Enter your BOGO gift card code to book your two services.</p>
      <div class="form-group">
        <label>Gift Card Code:</label>
        <input type="text" class="form-control" id="gift-code" placeholder="Enter your BOGO gift card code" required>
      </div>
      <div class="form-group">
        <button class="meety-btn primary" onclick="validateBogoGiftCard()">Validate & Continue to Service Selection</button>
      </div>
  <div style="font-size:11px;color:#666;margin-top:8px;text-align:center;"><u>Expiration date: January 31, 2026</u></div>
    `;
  }

  function validateBogoGiftCard() {
    const code = document.getElementById('gift-code').value;
    if (!code) {
      alert('Please enter your gift card code.');
      return;
    }
    // Here you would validate the gift card code
    // For now, we'll proceed to BOGO selection
    const st = document.querySelector('.meety-overlay').meetyState;
    const btn = st.button;
    
    // Mark as gift card redemption flow
    st.giftRedeemMode = true;
    st.giftExistingFlow = true;
    st.serviceFlow = 'redeem';
    
    // Set redemption flag to prevent tracking products
    if (!window.__meetyBogoContext) window.__meetyBogoContext = {};
    window.__meetyBogoContext.isRedemption = true;
    
    console.log(LOG_PREFIX, 'Gift card redemption flow started');
    
    setupBogoFlow(st, btn);
  }

  /* Gift Card Functions */
  function setupGiftPurchaseForm(st, btn) {
    const btnId = btn.id;
    
    // Get gift card variants and populate the dropdown
    const giftVariant1 = btn.getAttribute('data-gift-variant-1') || btn.getAttribute('data-gift-card-variant-1');
    const giftVariant2 = btn.getAttribute('data-gift-variant-2') || btn.getAttribute('data-gift-card-variant-2'); 
    const giftVariant3 = btn.getAttribute('data-gift-variant-3') || btn.getAttribute('data-gift-card-variant-3');
  const label1 = btn.getAttribute('data-gift-label-1') || btn.getAttribute('data-gift-duration-label-1') || '1 Hour Session';
  const label2 = btn.getAttribute('data-gift-label-2') || btn.getAttribute('data-gift-duration-label-2') || '2 Hour Session';
  const label3 = btn.getAttribute('data-gift-label-3') || btn.getAttribute('data-gift-duration-label-3') || '3 Hour Session';
    
  const giftTypeSelect = st.stepGiftPurchase.querySelector(`#gift-card-type-${btnId}`);
  const isGiftBogo = !!st.giftBogoMode;
  const bogoCategory = btn.getAttribute('data-bogo-category');
  const isTattoo = bogoCategory === 'tattoo';
  giftTypeSelect.innerHTML = isTattoo ? '<option value="">Select tattoo hours...</option>' : '<option value="">Select amount to pay for...</option>';
    
  if (!isGiftBogo && giftVariant1 && !(isTattoo && isTattoo1hDisabled())) {
      const option1 = document.createElement('option');
      option1.value = '1';
      option1.textContent = isTattoo ? `${label1}` : `Pay for ${label1} (Get 2 Hours)`;
      option1.dataset.variantId = giftVariant1;
      option1.dataset.durationLabel = label1;
      option1.dataset.doubledLabel = isTattoo ? label1 : '2 Hour Session';
      giftTypeSelect.appendChild(option1);
    }
    
  if (!isGiftBogo && giftVariant2) {
      const option2 = document.createElement('option');
      option2.value = '2';
      option2.textContent = isTattoo ? `${label2}` : `Pay for ${label2} (Get 4 Hours)`;
      option2.dataset.variantId = giftVariant2;
      option2.dataset.durationLabel = label2;
      option2.dataset.doubledLabel = isTattoo ? label2 : '4 Hour Session';
      giftTypeSelect.appendChild(option2);
    }
    
  if (!isGiftBogo && giftVariant3) {
      const option3 = document.createElement('option');
      option3.value = '3';
      option3.textContent = isTattoo ? `${label3}` : `Pay for ${label3} (Get 6 Hours)`;
      option3.dataset.variantId = giftVariant3;
      option3.dataset.durationLabel = label3;
      option3.dataset.doubledLabel = isTattoo ? label3 : '6 Hour Session';
      giftTypeSelect.appendChild(option3);
    }
    
  const addToCartBtn = st.stepGiftPurchase.querySelector('.add-to-cart-btn');
    
    // Remove any existing event listeners by cloning the button
    const newAddToCartBtn = addToCartBtn.cloneNode(true);
    addToCartBtn.parentNode.replaceChild(newAddToCartBtn, addToCartBtn);
    // Inject remaining inventory badge (async) for tracking-limited gifts
    (async()=>{
      try {
        // Enhanced tracking eligibility: check for any configured tracking products
        const hasTrackingProducts = !!(
          btn.getAttribute('data-bogo-track-tattoo') ||
          btn.getAttribute('data-bogo-track-piercings') ||
          btn.getAttribute('data-bogo-track-tooth-gems') ||
          btn.getAttribute('data-bogo-track-teeth-whitening')
        );
        
        const trackingEligible = st.giftBogoMode || st.piercingGiftMode || st.tattooGiftPurchase || st.giftSubtype || st.giftGems || st.giftWhitening || (bogoCategory && bogoCategory!=='') || hasTrackingProducts;
        
        console.log(LOG_PREFIX, '🎯 TRACKING ELIGIBILITY CHECK (Gift Card Form):', {
          giftBogoMode: st.giftBogoMode,
          piercingGiftMode: st.piercingGiftMode,
          tattooGiftPurchase: !!st.tattooGiftPurchase,
          giftSubtype: st.giftSubtype,
          giftGems: !!st.giftGems,
          giftWhitening: !!st.giftWhitening,
          bogoCategory: bogoCategory,
          hasTrackingProducts: hasTrackingProducts,
          trackingEligible: trackingEligible,
          buttonId: btn.id
        });
        
        if(!trackingEligible) {
          console.log(LOG_PREFIX, '❌ Gift card form tracking not eligible - no badge will be shown');
          return;
        }
  // If we previously saw zero, force a fresh pull to avoid stale cached 0.
  const remaining = await fetchTrackingRemaining(st, btn, { forceFresh: st.__trackingRemaining === 0 });
        if(remaining == null) return;
        let badge = st.stepGiftPurchase.querySelector('.gift-tracking-remaining');
        if(!badge){
          badge = document.createElement('div');
          badge.className='gift-tracking-remaining';
          badge.style.cssText='margin:8px 0 12px;font-size:12px;font-weight:600;';
          newAddToCartBtn.parentNode.insertBefore(badge, newAddToCartBtn);
        }
        if(remaining <= 0){
          badge.textContent = 'Sold Out';
          badge.style.color = '#c00';
          newAddToCartBtn.disabled = true;
          newAddToCartBtn.textContent = 'Sold Out';
          newAddToCartBtn.classList.add('disabled');
        } else {
          badge.textContent = `${remaining} Remaining`; badge.style.color='#0a0';
        }
      } catch(e){ console.warn(LOG_PREFIX,'Remaining badge render failed', e); }
    })();
    
    // If tattoo path came from hours chooser, hide the dropdown, show chip summary
    if (isTattoo && st.pendingTattooGiftVariant) {
      if (giftTypeSelect) giftTypeSelect.style.display = 'none';
      // Remove existing chip if present to avoid duplicates
      const existingChip = giftTypeSelect.parentNode.querySelector('.tattoo-hours-chip');
      if (existingChip) existingChip.remove();
      const variantLabelChip = document.createElement('div');
      variantLabelChip.className = 'tattoo-hours-chip';
      variantLabelChip.style.cssText='margin:6px 0 10px;font-size:12px;background:#111;color:#fff;display:inline-block;padding:5px 12px;border-radius:20px;';
      variantLabelChip.textContent = st.tattooGiftPurchaseLabel || 'Tattoo Gift Hours Selected';
      giftTypeSelect.parentNode.insertBefore(variantLabelChip, giftTypeSelect);
    }

  // Optional desired service selection for piercings / tooth gems gift purchase
    let desiredServiceValue = '';
  // bogoCategory already defined above
    
    // Handle gems-whitening chooser for gift purchase if needed
    if (bogoCategory === 'gems-whitening' && !st.__gemsWhiteningChosen && !st.stepGiftPurchase.querySelector('.gems-whitening-chooser')) {
      const chooserWrap = document.createElement('div');
      chooserWrap.className = 'gems-whitening-chooser';
      chooserWrap.style.cssText = 'margin-top:12px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;';
      chooserWrap.innerHTML = '<h4 style="margin:0 0 12px;font-size:14px;color:#333;">What type of services is this gift card for?</h4>';
      
      const btnGems = document.createElement('button');
      btnGems.className = 'gift-card-btn secondary';
      btnGems.style.cssText = 'margin:0 8px 8px 0;padding:8px 16px;font-size:13px;';
      btnGems.textContent = '💎 Tooth Gems';
      btnGems.addEventListener('click', () => {
        st.__gemsWhiteningChosen = 'tooth-gems';
        chooserWrap.remove();
        setupGiftPurchaseForm(st, btn); // Refresh to show appropriate service selector
      });
      
      const btnWhite = document.createElement('button');
      btnWhite.className = 'gift-card-btn secondary';
      btnWhite.style.cssText = 'margin:0 8px 8px 0;padding:8px 16px;font-size:13px;';
      btnWhite.textContent = '✨ Teeth Whitening';
      btnWhite.addEventListener('click', () => {
        st.__gemsWhiteningChosen = 'teeth-whitening';
        chooserWrap.remove();
        setupGiftPurchaseForm(st, btn); // Refresh to show appropriate service selector
      });
      
      chooserWrap.appendChild(btnGems);
      chooserWrap.appendChild(btnWhite);
      st.stepGiftPurchase.querySelector('.gift-form').appendChild(chooserWrap);
      return; // Don't continue with form setup until choice is made
    }
    
  if (!isGiftBogo && (bogoCategory === 'piercings' || bogoCategory === 'tooth-gems' || bogoCategory === 'teeth-whitening' || (bogoCategory === 'gems-whitening' && st.__gemsWhiteningChosen)) && !st.stepGiftPurchase.querySelector('.desired-service-select')) {
      const injectWrap = document.createElement('div');
      injectWrap.style.marginTop = '12px';
      injectWrap.innerHTML = '<label style="font-weight:600;font-size:13px;display:block;margin-bottom:6px;">Desired Service / Category (optional)</label>';
      const sel = document.createElement('select');
      sel.className = 'desired-service-select';
      sel.style.cssText = 'padding:10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:14px;';
      const effectiveCategory = (bogoCategory === 'gems-whitening' && st.__gemsWhiteningChosen) ? st.__gemsWhiteningChosen : bogoCategory;
      let options = '';
      if (effectiveCategory === 'piercings') {
        options = '<option value="ear">Ear Piercings</option><option value="nose">Nose Piercings</option><option value="oral">Oral Piercings</option><option value="body">Body Piercings</option>';
      } else if (effectiveCategory === 'tooth-gems') {
        options = '<option value="single">Single Gem</option><option value="sets">Gem Sets</option>';
      } else if (effectiveCategory === 'teeth-whitening') {
        options = '<option value="whitening">Teeth Whitening</option>';
      }
      sel.innerHTML = '<option value="">(Optional) Choose...</option>' + options;
      injectWrap.appendChild(sel);
      st.stepGiftPurchase.querySelector('.gift-form').appendChild(injectWrap);
    }

    // Gift BOGO mode: hide selector & insert summary chip
    if (isGiftBogo) {
      try {
        if (giftTypeSelect) {
          const lbl = st.stepGiftPurchase.querySelector(`label[for="gift-card-type-${btnId}"]`);
            if (lbl) lbl.style.display='none';
          giftTypeSelect.style.display='none';
        }
        if (!st.stepGiftPurchase.querySelector('.bogo-gift-chip') && st.bogoSelection) {
          const chip = document.createElement('div');
          chip.className = 'bogo-gift-chip';
          chip.style.cssText='background:#f4f9f4;border:1px solid #cfe7cf;padding:10px 14px;border-radius:10px;font-size:12px;margin:0 0 14px;line-height:1.5;';
          const charged = st.bogoSelection.chargedVariant;
          const free = st.bogoSelection.freeVariant;
          const extras = (st.bogoSelection.extraFreeVariants||[]).filter(Boolean);
          
          // Normalize variant titles for display (fix Triple -> Single for whitening)
          const category = st.bogoCategory || st.__gemsWhiteningChosen || st.giftSubtype;
          const chargedTitle = charged ? normalizeVariantTitleForDisplay(charged.title, category) : '—';
          const freeTitle = free ? normalizeVariantTitleForDisplay(free.title, category) : 'None';
          const extraTitles = extras.map(v => normalizeVariantTitleForDisplay(v.title, category));
          
          chip.innerHTML = `<strong>Gift Selection Summary</strong><br>Paying For: (Whitening) ${chargedTitle} ${charged?`($${(charged.price/100).toFixed(2)})`:''}<br>Free: (Whitening) ${(free?`${freeTitle} (<span style="text-decoration:line-through;color:#999;">$${(free.price/100).toFixed(2)}</span> FREE)`:' None')}${extras.length? (' + '+extraTitles.map((title,i)=>`${title} (<span style="text-decoration:line-through;color:#999;">$${(extras[i].price/100).toFixed(2)}</span> FREE)`).join(' + ')) : ''}`;
          const form = st.stepGiftPurchase.querySelector('.gift-form');
          if (form) form.prepend(chip);
        }
      } catch(e){ console.warn(LOG_PREFIX,'Gift BOGO chip render failed', e); }
    }

    newAddToCartBtn.addEventListener('click', async (e) => {
      // Prevent any default behavior and stop propagation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const clickedButton = e.currentTarget;
      const buttonId = clickedButton.id;
      
      // CRITICAL: Multi-layer spam prevention checks
      // 1. Check if button is already processing (DOM state)
      if (clickedButton.disabled || clickedButton.classList.contains('processing') || clickedButton.classList.contains('loading')) {
        console.log(LOG_PREFIX, '🚫 Button already processing (DOM check), ignoring click');
        return;
      }
      
      // 2. Check global processing state (prevents race conditions)
      if (window.__meetyBogo.processingButtons.has(buttonId)) {
        console.log(LOG_PREFIX, '🚫 Button already in global processing state, ignoring click');
        return;
      }
      
      // 3. Check if cart operation is currently in progress
      if (window.__meetyBogo.cartOperationLock) {
        console.log(LOG_PREFIX, '🚫 Cart operation in progress, ignoring click');
        return;
      }
      
      // 4. Debounce: Check if clicked too recently (< 500ms since last click)
      const now = Date.now();
      const lastClick = window.__meetyBogo.lastClickTimestamps.get(buttonId) || 0;
      if (now - lastClick < 500) {
        console.log(LOG_PREFIX, '🚫 Click too soon after previous click (debounced), ignoring');
        return;
      }
      
      // Update last click timestamp
      window.__meetyBogo.lastClickTimestamps.set(buttonId, now);
      
      // 5. Immediately mark as processing in global state (before any async operations)
      window.__meetyBogo.processingButtons.add(buttonId);
      console.log(LOG_PREFIX, '✅ Button processing state set globally for:', buttonId);
      
      const name = st.stepGiftPurchase.querySelector(`#recipient-name-${btnId}`).value.trim();
      const email = st.stepGiftPurchase.querySelector(`#recipient-email-${btnId}`).value.trim();
      const phone = st.stepGiftPurchase.querySelector(`#recipient-phone-${btnId}`).value.trim();
      const message = st.stepGiftPurchase.querySelector(`#gift-message-${btnId}`)?.value.trim() || '';
      
      // Validation
      if (!name || !email || !phone) {
        // Remove from processing state before returning
        window.__meetyBogo.processingButtons.delete(buttonId);
        alert('Please fill in all recipient fields.'); 
        return; 
      }
      
      // 6. Add multiple visual/DOM indicators to prevent spam clicking
      // Store original state
      clickedButton.dataset.originalText = clickedButton.innerHTML;
      clickedButton.dataset.originalDisabledState = clickedButton.disabled;
      
      // Disable the button
      clickedButton.disabled = true;
      clickedButton.classList.add('processing', 'loading');
      
      // Change button content to show loading
      clickedButton.textContent = '⏳ Processing...';
      
      // Apply CSS class for visual styling (simpler approach)
      const styleOverride = document.createElement('style');
      styleOverride.id = `loading-override-${buttonId}`;
      styleOverride.textContent = `
        #add-to-cart-${btnId}.loading {
          background: #999 !important;
          opacity: 0.6 !important;
          cursor: not-allowed !important;
          pointer-events: none !important;
          transform: none !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(styleOverride);
      
      clickedButton.setAttribute('aria-busy', 'true');
      clickedButton.setAttribute('aria-disabled', 'true');
      
      // Create loading overlay
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = `gift-card-loading-overlay-${buttonId}`;
      loadingOverlay.innerHTML = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease-out;
        ">
          <div style="
            background: white;
            padding: 40px 50px;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
            max-width: 400px;
            animation: slideUp 0.3s ease-out;
          ">
            <div style="
              width: 60px;
              height: 60px;
              margin: 0 auto 20px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #667eea;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            "></div>
            <h3 style="
              margin: 0 0 10px;
              font-size: 20px;
              font-weight: 600;
              color: #333;
            ">Adding Gift Card</h3>
            <p style="
              margin: 0 0 20px;
              font-size: 14px;
              color: #666;
            ">Please wait while we process your gift card...</p>
            <div style="
              width: 100%;
              height: 6px;
              background: #f0f0f0;
              border-radius: 3px;
              overflow: hidden;
              position: relative;
            ">
              <div style="
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                border-radius: 3px;
                animation: progressBar 2s ease-in-out infinite;
              "></div>
            </div>
          </div>
        </div>
        <style>
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes slideUp {
            from { 
              transform: translateY(30px);
              opacity: 0;
            }
            to { 
              transform: translateY(0);
              opacity: 1;
            }
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes progressBar {
            0% { 
              width: 0%;
              left: 0;
            }
            50% {
              width: 70%;
              left: 15%;
            }
            100% { 
              width: 100%;
              left: 0;
            }
          }
        </style>
      `;
      document.body.appendChild(loadingOverlay);
      
      console.log(LOG_PREFIX, '🔒 Button disabled and loading overlay displayed');
      
      try {
        if (isGiftBogo) {
          if (!st.giftChargedVariantId) { 
            alert('Missing gift variant. Please go back and reselect.'); 
            return; 
          }
          await addGiftCardToCart(
            st.giftChargedVariantId,
            name,
            email,
            phone,
            st.giftChargedVariantTitle || 'Gift Service',
            '',
          message
        );
        return;
      }
      // Tattoo fast path
      if (isTattoo && st.pendingTattooGiftVariant) {
        addGiftCardToCart(
          st.pendingTattooGiftVariant,
          name, email, phone,
          st.tattooGiftPurchaseLabel || 'Tattoo Gift',
          '',
          message
        );
        return;
      }
      // Piercing gift mode: auto variant & simplified
      if (st.piercingGiftMode) {
        // Determine variant automatically: prefer configured gift variants; fallback to first piercing selection variant
        let autoVariant = giftVariant1 || giftVariant2 || giftVariant3 || null;
        // If no dedicated gift variant IDs provided, choose the higher priced piercing selection variant to represent the paid portion
        if(!autoVariant){
          if(st.giftPiercingFirstSelection && st.giftPiercingSecondSelection && st.piercingGiftVariants){
            const vs = st.piercingGiftVariants;
            const lookup = (id)=> vs.find(v=> String(v.id) === String(id));
            const v1 = lookup(st.giftPiercingFirstSelection.variantId) || {}; const v2 = lookup(st.giftPiercingSecondSelection.variantId) || {};
            const p1 = (v1.price||0); const p2 = (v2.price||0); // still cents
            autoVariant = p2 > p1 ? st.giftPiercingSecondSelection.variantId : st.giftPiercingFirstSelection.variantId;
          } else if (st.giftPiercingFirstSelection) {
            autoVariant = st.giftPiercingFirstSelection.variantId;
          }
        }
        if (!autoVariant) { alert('No variant available to add for piercing gift.'); return; }
        // Build inline label including charged + free so free appears inline in cart theme
        let autoLabel = 'Piercing Gift (2 Services)';
        try {
          if (st.giftPiercingFirstSelection && st.giftPiercingSecondSelection && st.piercingGiftVariants){
            const vs = st.piercingGiftVariants;
            const lookup = (id)=> vs.find(v=> String(v.id) === String(id));
            const v1 = lookup(st.giftPiercingFirstSelection.variantId) || {}; const v2 = lookup(st.giftPiercingSecondSelection.variantId) || {};
            const p1 = (v1.price||0)/100; const p2 = (v2.price||0)/100;
            let charged = { title: st.giftPiercingFirstSelection.title, price: p1 };
            let free = { title: st.giftPiercingSecondSelection.title, price: p2 };
            if (p2 > p1){ charged = { title: st.giftPiercingSecondSelection.title, price: p2 }; free = { title: st.giftPiercingFirstSelection.title, price: p1 }; }
            autoLabel = `${charged.title} ($${charged.price.toFixed(2)}) + ${free.title} (FREE)`;
          }
        } catch(e){ console.warn(LOG_PREFIX, 'Could not build inline piercing gift label', e); }
        addGiftCardToCart(autoVariant, name, email, phone, autoLabel, '', message, btn);
        return;
      }

      // Standard flow (needs a selected gift type)
      const giftType = giftTypeSelect.value;
      const selectedOption = giftTypeSelect.selectedOptions[0];
      const variantId = selectedOption?.dataset.variantId;
      const doubledLabel = selectedOption?.dataset.doubledLabel || '';
      const desiredSel = st.stepGiftPurchase.querySelector('.desired-service-select');
      desiredServiceValue = desiredSel ? desiredSel.value : '';
      if (!giftType || !variantId) { alert('Please select a gift card type'); return; }
      
      console.log(LOG_PREFIX, '🎁 STANDARD GIFT CARD FLOW (Buy for Someone Else):', {
        giftType: giftType,
        variantId: variantId,
        doubledLabel: doubledLabel,
        desiredServiceValue: desiredServiceValue,
        buttonId: btn.id,
        bogoCategory: bogoCategory,
        hasTrackingProducts: !!(
          btn.getAttribute('data-bogo-track-tattoo') ||
          btn.getAttribute('data-bogo-track-piercings') ||
          btn.getAttribute('data-bogo-track-tooth-gems') ||
          btn.getAttribute('data-bogo-track-teeth-whitening')
        ),
        trackingHandles: {
          tattoo: btn.getAttribute('data-bogo-track-tattoo'),
          piercings: btn.getAttribute('data-bogo-track-piercings'),
          toothGems: btn.getAttribute('data-bogo-track-tooth-gems'),
          teethWhitening: btn.getAttribute('data-bogo-track-teeth-whitening')
        }
      });
      
      if (isTattoo) {
        // Store explicit tattoo gift info for attributes
        st.tattooGiftPurchase = {
          hours: giftType,
          label: selectedOption.dataset.durationLabel || doubledLabel
        };
      }
      
      // Set flag to ensure tracking products are considered for regular gift cards
      if (!st.isRegularGiftPurchase) {
        st.isRegularGiftPurchase = true;
        console.log(LOG_PREFIX, '✅ Set isRegularGiftPurchase flag for tracking');
      }
      
      addGiftCardToCart(variantId, name, email, phone, doubledLabel, desiredServiceValue, message, btn);
      } catch (error) {
        console.error(LOG_PREFIX, 'Gift card add to cart error:', error);
        try { 
          showTemporaryToast('Error adding gift card to cart. Please try again.'); 
        } catch(_) { 
          alert('Error adding gift card to cart. Please try again.'); 
        }
      } finally {
        // CRITICAL: Always remove from global processing state
        window.__meetyBogo.processingButtons.delete(buttonId);
        console.log(LOG_PREFIX, '🔓 Button removed from global processing state:', buttonId);
        
        // Always restore button state using the actual clicked button
        const buttonToRestore = document.getElementById(`add-to-cart-${btnId}`);
        
        // Remove loading overlay
        const loadingOverlay = document.getElementById(`gift-card-loading-overlay-${btnId}`);
        if (loadingOverlay) {
          // Fade out animation
          loadingOverlay.style.animation = 'fadeOut 0.2s ease-out';
          setTimeout(() => loadingOverlay.remove(), 200);
        }
        
        if (buttonToRestore) {
          // Remove loading class
          buttonToRestore.classList.remove('processing', 'loading');
          
          // Remove the style override
          const styleOverride = document.getElementById(`loading-override-${btnId}`);
          if (styleOverride) {
            styleOverride.remove();
          }
          
          // Restore original content
          if (buttonToRestore.dataset.originalText) {
            buttonToRestore.innerHTML = buttonToRestore.dataset.originalText;
            delete buttonToRestore.dataset.originalText;
          }
          
          // Restore disabled state
          if (buttonToRestore.dataset.originalDisabledState) {
            buttonToRestore.disabled = buttonToRestore.dataset.originalDisabledState === 'true';
            delete buttonToRestore.dataset.originalDisabledState;
          } else {
            buttonToRestore.disabled = false;
          }
          
          buttonToRestore.removeAttribute('aria-busy');
          buttonToRestore.removeAttribute('aria-disabled');
          console.log(LOG_PREFIX, '✅ Button fully restored to original state');
        } else {
          console.warn(LOG_PREFIX, '⚠️ Could not find button to restore:', `add-to-cart-${btnId}`);
        }
      }
    });

    // If in piercing gift mode, hide the gift type selector UI & optional desired service selector
    if (st.piercingGiftMode) {
      try {
        const giftTypeLabel = st.stepGiftPurchase.querySelector(`label[for="gift-card-type-${btnId}"]`);
        if (giftTypeLabel) giftTypeLabel.style.display = 'none';
        if (giftTypeSelect) giftTypeSelect.style.display = 'none';
        const optSel = st.stepGiftPurchase.querySelector('.desired-service-select');
        if (optSel) optSel.closest('div')?.remove();
        // Replace heading text to clarify
        const heading = st.stepGiftPurchase.querySelector('h3');
        if (heading) heading.textContent = 'Piercing Gift Card – Recipient Info';
        const introP = st.stepGiftPurchase.querySelector('p');
        if (introP) introP.textContent = 'Enter the recipient details. They will choose their appointment later when redeeming the gift card.';
        renderPiercingGiftSummary(st);
      } catch(e){ console.warn(LOG_PREFIX, 'Could not simplify piercing gift form', e); }
    }
  }

  function renderPiercingGiftSummary(st){
    if (!st.piercingGiftMode) return;
    const step = st.stepGiftPurchase;
    if (!step) return;
    // Clean old summaries
    step.querySelectorAll('.piercing-gift-summary').forEach(el=>el.remove());
    const first = st.giftPiercingFirstSelection;
    const second = st.giftPiercingSecondSelection;
    if(!first || !second) return; // Need both picks
    const variants = st.piercingGiftVariants || [];
    const lookup = (id)=> variants.find(v=> String(v.id) === String(id));
    const v1 = lookup(first.variantId) || {};
    const v2 = lookup(second.variantId) || {};
    const p1 = (v1.price||0)/100;
    const p2 = (v2.price||0)/100;
    let charged = {sel:first, variant:v1, price:p1};
    let free = {sel:second, variant:v2, price:p2};
    if (p2 > p1) { charged = {sel:second, variant:v2, price:p2}; free = {sel:first, variant:v1, price:p1}; }
    const savings = free.price.toFixed(2);
    const wrap = document.createElement('div');
    wrap.className = 'piercing-gift-summary';
    wrap.style.cssText = 'background:#f6f9f6;border:1px solid #d8e8d8;padding:14px 16px;border-radius:8px;margin:6px 0 18px;font-size:13px;line-height:1.45;';
    wrap.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;">Selected Piercings (Gift)</div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;">
        <span>${charged.sel.title}</span>
        <span>$${charged.price.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <span>${free.sel.title}</span>
        <span style="color:#4caf50;font-weight:600;">FREE (Save $${savings})</span>
      </div>`;
    const form = step.querySelector('.gift-form');
    if (form) step.insertBefore(wrap, form);
  }

  function setupExistingGiftCard(st, btn){
    const form = st.stepRedeem.querySelector('.redeem-form');
    form.innerHTML = '';
    // The intro paragraph is now part of the static HTML structure, so we don't need to create it here.

    const calendars = [
      { idx:1, raw: btn.getAttribute('data-gift-calendar-1'), label: btn.getAttribute('data-gift-label-1') || '1 Hour Session', doubledLabel: '2 Hour Session' },
      { idx:2, raw: btn.getAttribute('data-gift-calendar-2'), label: btn.getAttribute('data-gift-label-2') || '2 Hour Session', doubledLabel: '4 Hour Session' },
      { idx:3, raw: btn.getAttribute('data-gift-calendar-3'), label: btn.getAttribute('data-gift-label-3') || '3 Hour Session', doubledLabel: '6 Hour Session' }
    ];
    const variantMap = {
      1: btn.getAttribute('data-gift-variant-1') || null,
      2: btn.getAttribute('data-gift-variant-2') || null,
      3: btn.getAttribute('data-gift-variant-3') || null
    };

    let any = false;
    calendars.forEach(c => {
      if (!c.raw || c.raw === '#') return;
      const parsed = parseJSONSafe(decodeEntities(c.raw));
      if (!parsed) { console.warn(LOG_PREFIX, 'Gift calendar', c.idx, 'failed to parse'); return; }
      any = true;
      const btnEl = document.createElement('button');
      btnEl.type = 'button';
      btnEl.textContent = `Redeem ${c.doubledLabel}`;
      btnEl.className = 'gift-card-btn';
      btnEl.style.marginBottom = '6px';
      btnEl.addEventListener('click', async ()=>{
        console.log(LOG_PREFIX, 'Existing gift card selection', c.idx, parsed);
        st.giftExistingFlow = true; // mark flow for calendar note
        // Set redemption flag to exclude tracking
        if (window.__meetyBogoContext) {
          window.__meetyBogoContext.isRedemption = true;
          console.log(LOG_PREFIX, 'Marked as redemption flow - no inventory tracking');
        }
        st.giftExistingVariantId = variantMap[c.idx] || null;
        st.giftExistingDurationLabel = c.doubledLabel;
        // Skip the service selection step and proceed directly to calendar
        st.skipServiceStep = true;
        await proceedWithChosenCalendar(st, parsed);
      });
      form.appendChild(btnEl);
    });

    if (!any){
      const msg = document.createElement('div');
      msg.textContent = 'No gift card calendars configured.';
      msg.style.color = '#b00';
      form.appendChild(msg);
    }

    // Back button to return to chooser
    const backWrap = document.createElement('div');
    backWrap.style.textAlign = 'center';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'gift-card-btn secondary back-btn';
    backBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Back
    `;
    backBtn.addEventListener('click', ()=>{ 
      st.giftExistingFlow = false; 
      // Go back to gift card chooser (not main chooser)
      showStepChooser(st); 
    });
    backWrap.appendChild(backBtn);
    form.appendChild(backWrap);
  }

  /* === Error Boundary System === */
  const ErrorBoundary = {
    // Generic error handler with context
    handle: (error, context = 'Unknown operation', details = {}) => {
      const errorId = `${context}_${Date.now()}`;
      const errorInfo = {
        id: errorId,
        context,
        message: error?.message || String(error),
        stack: error?.stack,
        timestamp: new Date().toISOString(),
        details,
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      console.error(LOG_PREFIX, `❌ Error in ${context}:`, errorInfo);
      
      // Store error for debugging
      window.__meetyErrors = window.__meetyErrors || [];
      window.__meetyErrors.push(errorInfo);
      
      // Keep only last 50 errors to prevent memory leaks
      if (window.__meetyErrors.length > 50) {
        window.__meetyErrors = window.__meetyErrors.slice(-50);
      }
      
      return errorInfo;
    },
    
    // Wrapper for async operations with automatic error handling
    safeAsync: async (operation, context = 'Async operation', fallbackValue = null) => {
      try {
        return await operation();
      } catch (error) {
        ErrorBoundary.handle(error, context);
        return fallbackValue;
      }
    },
    
    // Wrapper for sync operations with automatic error handling
    safeSync: (operation, context = 'Sync operation', fallbackValue = null) => {
      try {
        return operation();
      } catch (error) {
        ErrorBoundary.handle(error, context);
        return fallbackValue;
      }
    },
    
    // User-friendly error notification
    notify: (userMessage, error = null, context = '') => {
      console.warn(LOG_PREFIX, 'User notification:', userMessage, error);
      
      // Show user-friendly message
      if (typeof userMessage === 'string' && userMessage.length > 0) {
        alert(userMessage);
      }
      
      // Log technical details
      if (error) {
        ErrorBoundary.handle(error, `User notification: ${context}`);
      }
    }
  };

  /* === State Validation System === */
  const StateValidator = {
    // Validate overlay state object
    validateOverlayState: (st, context = 'Unknown') => {
      const errors = [];
      const warnings = [];
      
      if (!st) {
        errors.push('State object is null or undefined');
        return { valid: false, errors, warnings };
      }
      
      // Check required properties
      const requiredProps = ['btnId', 'overlay', 'button'];
      for (const prop of requiredProps) {
        if (!st[prop]) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
      
      // Check button element validity
      if (st.button && !document.contains(st.button)) {
        warnings.push('Button element is not in the DOM');
      }
      
      // Check overlay element validity
      if (st.overlay && !document.contains(st.overlay)) {
        warnings.push('Overlay element is not in the DOM');
      }
      
      // Check for memory leaks in navigation history
      if (st.navigationHistory && st.navigationHistory.length > 20) {
        warnings.push(`Navigation history is growing large (${st.navigationHistory.length} entries)`);
      }
      
      // Check for orphaned event listeners
      if (st._escHandler && typeof st._escHandler !== 'function') {
        warnings.push('Invalid escape handler detected');
      }
      
      // Log validation results
      if (errors.length > 0) {
        console.error(LOG_PREFIX, `State validation failed for ${context}:`, errors);
      }
      if (warnings.length > 0) {
        console.warn(LOG_PREFIX, `State validation warnings for ${context}:`, warnings);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        context
      };
    },
    
    // Validate cart operation parameters
    validateCartOperation: (variantId, context = 'Cart operation') => {
      const errors = [];
      const warnings = [];
      
      if (!variantId) {
        errors.push('Missing variant ID');
      } else if (isNaN(parseInt(variantId))) {
        errors.push('Invalid variant ID format');
      }
      
      // Check if cart is in a valid state
      if (typeof window.Shopify === 'undefined') {
        warnings.push('Shopify global not available');
      }
      
      if (errors.length > 0) {
        console.error(LOG_PREFIX, `Cart operation validation failed for ${context}:`, errors);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        variantId: parseInt(variantId),
        context
      };
    },
    
    // Validate BOGO context
    validateBogoContext: (context = 'BOGO validation') => {
      const errors = [];
      const warnings = [];
      const ctx = window.__meetyBogoContext;
      
      if (!ctx) {
        warnings.push('No BOGO context available');
        return { valid: true, errors, warnings, context };
      }
      
      if (ctx.category && !['piercing', 'tattoo', 'gems', 'whitening', 'none'].includes(ctx.category)) {
        warnings.push(`Unknown BOGO category: ${ctx.category}`);
      }
      
      if (ctx.charged && typeof ctx.charged.priceCents !== 'number') {
        errors.push('Invalid price in BOGO context');
      }
      
      if (errors.length > 0) {
        console.error(LOG_PREFIX, `BOGO validation failed for ${context}:`, errors);
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        context,
        bogoContext: ctx
      };
    },
    
    // Comprehensive pre-operation validation
    validateBeforeOperation: (operation, st, additionalChecks = {}) => {
      const results = {
        overall: true,
        stateValidation: null,
        cartValidation: null,
        bogoValidation: null,
        additionalValidation: {}
      };
      
      // Always validate state if provided
      if (st) {
        results.stateValidation = StateValidator.validateOverlayState(st, operation);
        if (!results.stateValidation.valid) {
          results.overall = false;
        }
      }
      
      // Validate cart operations
      if (additionalChecks.variantId) {
        results.cartValidation = StateValidator.validateCartOperation(additionalChecks.variantId, operation);
        if (!results.cartValidation.valid) {
          results.overall = false;
        }
      }
      
      // Validate BOGO context if needed
      if (additionalChecks.validateBogo) {
        results.bogoValidation = StateValidator.validateBogoContext(operation);
        if (!results.bogoValidation.valid) {
          results.overall = false;
        }
      }
      
      // Custom validations
      for (const [checkName, checkFn] of Object.entries(additionalChecks.customChecks || {})) {
        try {
          results.additionalValidation[checkName] = checkFn();
          if (results.additionalValidation[checkName] && !results.additionalValidation[checkName].valid) {
            results.overall = false;
          }
        } catch (error) {
          console.error(LOG_PREFIX, `Custom validation ${checkName} failed:`, error);
          results.additionalValidation[checkName] = { valid: false, error: error.message };
          results.overall = false;
        }
      }
      
      return results;
    }
  }

  /* === Session Isolation Functions === */
  
  // Clean up cart attributes between different artist sessions
  function cleanupCartAttributesBetweenSessions() {
    const attributesToClear = [
      'Gift Recipient Name',
      'Gift Recipient Email', 
      'Gift Recipient Phone',
      'Gift Card Artist',
      'Gift Card Artist Name',
      'Gift Duration',
      'Gift Service Category',
      'Gift Piercing 1',
      'Gift Piercing 1 Variant',
      'Gift Piercing 2', 
      'Gift Piercing 2 Variant',
      'Gift Gems Category',
      'Gift Whitening Category',
      'Tattoo Paid Hours',
      'Tattoo Total Hours',
      'Tattoo Free Hours',
      'BOGO Service 1',
      'BOGO Service 2',
      'BOGO Free Service 1',
      'BOGO Free Service 2'
    ];
    
    const clearPayload = {};
    attributesToClear.forEach(attr => {
      clearPayload[attr] = '';
    });
    
    console.log(LOG_PREFIX, 'Clearing cart attributes between sessions:', attributesToClear);
    return updateCartAttributes(clearPayload);
  }

  // Clear tracking product cache to prevent stale inventory data
  function clearTrackingCache(category = null) {
    if (!window.__bogoTrackCache) return;
    
    if (category) {
      // Clear specific category cache
      Object.keys(window.__bogoTrackCache).forEach(handle => {
        if (handle.includes(category)) {
          console.log(LOG_PREFIX, 'Clearing tracking cache for category:', category, handle);
          delete window.__bogoTrackCache[handle];
        }
      });
    } else {
      // Clear all tracking cache
      console.log(LOG_PREFIX, 'Clearing all tracking cache');
      window.__bogoTrackCache = {};
    }
    
    // Also clear state-level cache
    const states = window.__meetyBogo?.states;
    if (states) {
      states.forEach(st => {
        if (st.__trackingRemaining !== undefined) delete st.__trackingRemaining;
        if (st.__trackingRemaining_tooth_gems !== undefined) delete st.__trackingRemaining_tooth_gems;
        if (st.__trackingRemaining_teeth_whitening !== undefined) delete st.__trackingRemaining_teeth_whitening;
      });
    }
  }

  // Validate cart state before adding new items to prevent conflicts
  function validateCartForNewSession(newArtistId, newCategory) {
    return ErrorBoundary.safeAsync(async () => {
      const cart = await getCartSnapshot();
      if (!cart || !cart.items) return { valid: true };
      
      const issues = [];
      const warnings = [];
      
      // Check for existing gift cards from different artists
      const existingGiftCards = cart.items.filter(item => 
        item.properties && 
        item.properties['Gift Card Artist'] && 
        item.properties['Gift Card Artist'] !== newArtistId
      );
      
      if (existingGiftCards.length > 0) {
        warnings.push(`Cart contains gift cards for different artist: ${existingGiftCards[0].properties['Gift Card Artist']}`);
      }
      
      // Check for tracking products that might conflict
      const trackingItems = cart.items.filter(item =>
        item.properties && item.properties['BOGO Inventory Tracker']
      );
      
      if (trackingItems.length > 0) {
        warnings.push(`Cart contains ${trackingItems.length} tracking products that may conflict`);
      }
      
      // Check for mixed categories that might not be compatible
      const existingCategories = new Set();
      cart.items.forEach(item => {
        if (item.properties && item.properties['Gift Service Category']) {
          existingCategories.add(item.properties['Gift Service Category']);
        }
      });
      
      if (existingCategories.size > 0 && newCategory && !existingCategories.has(newCategory)) {
        warnings.push(`Cart contains different service categories: ${Array.from(existingCategories).join(', ')}`);
      }
      
      return {
        valid: issues.length === 0,
        issues,
        warnings,
        existingGiftCards: existingGiftCards.length,
        trackingItems: trackingItems.length,
        categories: Array.from(existingCategories)
      };
    }, 'validateCartForNewSession', { valid: true, issues: [], warnings: [] });
  }

  // Detect and resolve BOGO context conflicts between different artist sessions
  function checkBogoContextConflicts(newButton, newCategory) {
    const currentContext = window.__meetyBogoContext;
    const issues = [];
    const warnings = [];
    
    if (currentContext) {
      const currentCategory = currentContext.category;
      const currentArtist = currentContext.artistId || 'unknown';
      const newArtist = newButton?.id || 'unknown';
      
      // Check for category conflicts
      if (currentCategory && newCategory && currentCategory !== newCategory) {
        warnings.push(`BOGO context category conflict: current="${currentCategory}", new="${newCategory}"`);
      }
      
      // Check for artist conflicts  
      if (currentArtist !== newArtist) {
        warnings.push(`BOGO context artist conflict: current="${currentArtist}", new="${newArtist}"`);
      }
      
      // Check for stale context (older than 10 minutes)
      const contextAge = Date.now() - (currentContext.timestamp || 0);
      if (contextAge > 600000) { // 10 minutes
        warnings.push(`BOGO context is stale (${Math.round(contextAge / 60000)} minutes old)`);
      }
    }
    
    return { issues, warnings };
  }

  // Clean BOGO context when switching artists
  function clearBogoContext(reason = 'Session change') {
    if (window.__meetyBogoContext) {
      console.log(LOG_PREFIX, 'Clearing BOGO context:', reason, window.__meetyBogoContext);
      window.__meetyBogoContext = null;
    }
  }

  /* === Timeout Wrapper Functions === */
  function createTimeoutPromise(timeoutMs, errorMessage = 'Operation timed out') {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
  }

  async function withTimeout(promise, timeoutMs = 10000, operation = 'Operation') {
    try {
      return await Promise.race([
        promise,
        createTimeoutPromise(timeoutMs, `${operation} timed out after ${timeoutMs}ms`)
      ]);
    } catch (error) {
      console.warn(LOG_PREFIX, `${operation} failed:`, error.message);
      throw error;
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Fetch request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000, operationName = 'Operation') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.log(LOG_PREFIX, `${operationName} attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          console.error(LOG_PREFIX, `${operationName} failed after ${maxRetries} attempts`);
          throw new Error(`${operationName} failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(LOG_PREFIX, `Retrying ${operationName} in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /* === Cart Verification System === */
  async function getCartSnapshot() {
    try {
      const response = await fetchWithTimeout('/cart.js', {}, 5000);
      if (!response.ok) throw new Error(`Cart fetch failed: ${response.status}`);
      return await response.json();
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to get cart snapshot:', e);
      return null;
    }
  }

  function compareCartStates(beforeCart, afterCart, expectedChanges = {}) {
    if (!beforeCart || !afterCart) return { valid: false, reason: 'Missing cart data' };
    
    const beforeItems = beforeCart.items || [];
    const afterItems = afterCart.items || [];
    
    // Check item count changes
    const itemCountDiff = afterItems.length - beforeItems.length;
    const expectedItemCountChange = expectedChanges.itemCountChange || 0;
    
    if (itemCountDiff !== expectedItemCountChange) {
      return {
        valid: false,
        reason: `Item count change mismatch. Expected: ${expectedItemCountChange}, Got: ${itemCountDiff}`,
        beforeCount: beforeItems.length,
        afterCount: afterItems.length
      };
    }
    
    // Check total amount changes (in cents to avoid floating point issues)
    const beforeTotal = beforeCart.total_price || 0;
    const afterTotal = afterCart.total_price || 0;
    const totalDiff = afterTotal - beforeTotal;
    
    if (expectedChanges.expectedTotalChange && Math.abs(totalDiff - expectedChanges.expectedTotalChange) > 1) {
      return {
        valid: false,
        reason: `Total change mismatch. Expected: ${expectedChanges.expectedTotalChange}, Got: ${totalDiff}`,
        beforeTotal,
        afterTotal,
        difference: totalDiff
      };
    }
    
    // Check for specific variant additions
    if (expectedChanges.expectedVariantIds) {
      const newVariantIds = afterItems
        .filter(item => !beforeItems.some(beforeItem => beforeItem.variant_id === item.variant_id))
        .map(item => item.variant_id);
      
      console.log(LOG_PREFIX, 'Cart verification - variant ID comparison:', {
        expectedVariantIds: expectedChanges.expectedVariantIds,
        newVariantIds: newVariantIds,
        allAfterVariantIds: afterItems.map(item => item.variant_id),
        allBeforeVariantIds: beforeItems.map(item => item.variant_id)
      });
      
      // Compare variant IDs as strings to handle type mismatches
      const expectedAsStrings = expectedChanges.expectedVariantIds.map(id => String(id));
      const newAsStrings = newVariantIds.map(id => String(id));
      
      const missingVariants = expectedAsStrings.filter(
        variantId => !newAsStrings.includes(variantId)
      );
      
      console.log(LOG_PREFIX, 'Cart verification - string comparison result:', {
        expectedAsStrings,
        newAsStrings,
        missingVariants
      });
      
      if (missingVariants.length > 0) {
        return {
          valid: false,
          reason: `Expected variants not found in cart: ${missingVariants.join(', ')}`,
          expectedVariants: expectedChanges.expectedVariantIds,
          addedVariants: newVariantIds,
          allCartVariants: afterItems.map(item => ({ id: item.variant_id, title: item.title }))
        };
      }
    }
    
    return { valid: true, beforeTotal, afterTotal, totalDiff, itemCountDiff };
  }

  async function verifyCartOperation(operation, expectedChanges = {}, maxRetries = 3) {
    console.log(LOG_PREFIX, 'Starting cart verification for operation:', operation, expectedChanges);
    
    // Get cart state before operation
    const beforeCart = await getCartSnapshot();
    if (!beforeCart) {
      console.warn(LOG_PREFIX, 'Could not get before cart state');
      return { success: false, reason: 'Failed to get initial cart state' };
    }
    
    try {
      // Execute the operation
      const operationResult = await operation();
      
      // Wait a bit for cart to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify cart state with retries
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const afterCart = await getCartSnapshot();
        if (!afterCart) {
          if (attempt === maxRetries) {
            return { success: false, reason: 'Failed to get final cart state' };
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        // Enhanced logging for debugging
        console.log(LOG_PREFIX, `Cart verification attempt ${attempt}:`, {
          beforeItemCount: beforeCart.items?.length || 0,
          afterItemCount: afterCart.items?.length || 0,
          afterItems: afterCart.items?.map(item => ({
            variant_id: item.variant_id,
            title: item.title,
            quantity: item.quantity,
            properties: item.properties
          })) || [],
          expectedChanges
        });
        
        const verification = compareCartStates(beforeCart, afterCart, expectedChanges);
        
        if (verification.valid) {
          console.log(LOG_PREFIX, '✅ Cart verification passed:', verification);
          return { 
            success: true, 
            operationResult, 
            verification,
            beforeCart: beforeCart.items.length,
            afterCart: afterCart.items.length
          };
        }
        
        if (attempt < maxRetries) {
          console.log(LOG_PREFIX, `Cart verification failed, retry ${attempt}/${maxRetries}:`, verification.reason);
          
          // Gift cards need more time to appear in Shopify's cart API
          const isGiftCardOperation = expectedChanges.expectedVariantIds?.some(id => 
            String(id).length > 10 // Gift card variant IDs are typically longer
          ) || expectedChanges.expectedVariantIds?.length > 1; // Multiple items suggest gift + tracking
          
          const retryDelay = isGiftCardOperation ? 2000 : 1000; // 2 seconds for gift cards, 1 for others
          console.log(LOG_PREFIX, `Using ${retryDelay}ms delay for ${isGiftCardOperation ? 'gift card' : 'regular'} operation`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.warn(LOG_PREFIX, '❌ Cart verification failed after all retries:', verification);
          return { 
            success: false, 
            reason: verification.reason, 
            verification,
            operationResult,
            beforeCart: beforeCart.items.length,
            afterCart: afterCart.items.length
          };
        }
      }
    } catch (error) {
      console.error(LOG_PREFIX, 'Cart operation failed with error:', error);
      return { 
        success: false, 
        reason: `Operation failed: ${error.message}`, 
        error,
        originalError: error
      };
    }
  }

  async function addGiftCardToCart(variantId, recipientName, recipientEmail, recipientPhone, giftDurationLabel, desiredService, personalMessage = '', buttonContext = null) {
    return await ErrorBoundary.safeAsync(async () => {
    console.log(LOG_PREFIX, 'addGiftCardToCart (consolidated) called', { variantId, recipientName, recipientEmail, recipientPhone, giftDurationLabel, desiredService, personalMessage, buttonContext: !!buttonContext });
    
    // Validate cart operation before proceeding
    const cartValidation = StateValidator.validateCartOperation(variantId, 'addGiftCardToCart');
    if (!cartValidation.valid) {
      console.error(LOG_PREFIX, 'Cart operation validation failed:', cartValidation.errors);
      alert('Invalid gift card configuration. Please try again.');
      return;
    }
    
    const st = document.querySelector('.meety-overlay')?.meetyState;
    let btn = buttonContext || st?.button;
    
    console.log(LOG_PREFIX, '🔍 INITIAL button context analysis:', {
      hasButtonContext: !!buttonContext,
      buttonContextId: buttonContext?.id,
      buttonContextCategory: buttonContext?.getAttribute?.('data-bogo-category'),
      buttonContextTattoo: buttonContext?.getAttribute?.('data-bogo-track-tattoo'),
      hasState: !!st,
      stateButtonId: st?.button?.id,
      stateButtonCategory: st?.button?.getAttribute?.('data-bogo-category'),
      stateButtonTattoo: st?.button?.getAttribute?.('data-bogo-track-tattoo'),
      stateBtnId: st?.btnId,
      finalButtonId: btn?.id,
      finalButtonCategory: btn?.getAttribute?.('data-bogo-category'),
      finalButtonTattoo: btn?.getAttribute?.('data-bogo-track-tattoo'),
      needsFallback: !btn
    });
    
    // CRITICAL FIX: Always verify the button is correct by checking if overlay is actually visible
    // If we have a button from state but its overlay isn't visible, we need fallback
    if (btn) {
      const expectedOverlayId = 'meety-popup-overlay-' + btn.id;
      const overlay = document.getElementById(expectedOverlayId);
      const isOverlayVisible = overlay && (
        overlay.style.display === 'flex' || 
        getComputedStyle(overlay).display === 'flex'
      );
      
      console.log(LOG_PREFIX, '🔍 Verifying button overlay visibility:', {
        buttonId: btn.id,
        expectedOverlayId,
        overlayExists: !!overlay,
        overlayDisplay: overlay?.style?.display,
        computedDisplay: overlay ? getComputedStyle(overlay).display : 'N/A',
        isVisible: isOverlayVisible
      });
      
      if (!isOverlayVisible) {
        console.warn(LOG_PREFIX, '⚠️ Button overlay not visible - forcing fallback search');
        btn = null; // Force fallback to find correct button
      }
    }
    
    // Fetch product name from variant ID
    let productName = '';
    let variantTitle = '';
    let artistName = '';
    try {
      const variantResponse = await fetch(`/cart/add.js?id=${variantId}&quantity=0`).catch(() => null);
      if (!variantResponse || !variantResponse.ok) {
        // Fallback: Try fetching product by searching in page or making API call
        const productResponse = await fetch(`/products.json?limit=250`);
        if (productResponse.ok) {
          const productsData = await productResponse.json();
          const allProducts = productsData.products || [];
          
          for (const product of allProducts) {
            const matchingVariant = product.variants?.find(v => String(v.id) === String(variantId));
            if (matchingVariant) {
              productName = product.title || '';
              variantTitle = matchingVariant.title || '';
              
              // Try to extract artist name from product title
              // Format: "Artist Name — Product Type" or "Artist Name - Product Type"
              const dashMatch = productName.match(/^([^—-]+)(?:—|-)(.+)$/);
              if (dashMatch) {
                artistName = dashMatch[1].trim();
              }
              
              console.log(LOG_PREFIX, 'Product info extracted:', { productName, variantTitle, artistName });
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to fetch product name:', e);
    }
    
    // Fallback: if we don't have button from state or passed context, try to find an active BOGO button
    if (!btn) {
      console.log(LOG_PREFIX, '🔍 Button fallback needed - searching for correct button...');
      
      // First try: find button from the currently open overlay
      const openOverlay = document.querySelector('[id^="meety-popup-overlay-"][style*="flex"], [id^="meety-popup-overlay-"]:not([style*="none"])');
      if (openOverlay) {
        const overlayId = openOverlay.id;
        const btnId = overlayId.replace('meety-popup-overlay-', '');
        btn = document.getElementById(btnId);
        console.log(LOG_PREFIX, '📍 Method 1 - Found button from overlay:', {
          overlayId,
          btnId,
          buttonFound: !!btn,
          buttonCategory: btn?.getAttribute('data-bogo-category'),
          tattooHandle: btn?.getAttribute('data-bogo-track-tattoo')
        });
      }
      
      // Second try: look for overlay with display flex (different selector)
      if (!btn) {
        const visibleOverlay = document.querySelector('[id^="meety-popup-overlay-"][style*="display: flex"], [id^="meety-popup-overlay-"][style*="display:flex"]');
        if (visibleOverlay) {
          const overlayId = visibleOverlay.id;
          const btnId = overlayId.replace('meety-popup-overlay-', '');
          btn = document.getElementById(btnId);
          console.log(LOG_PREFIX, '📍 Method 2 - Found button from visible overlay:', {
            overlayId,
            btnId,
            buttonFound: !!btn,
            buttonCategory: btn?.getAttribute('data-bogo-category'),
            tattooHandle: btn?.getAttribute('data-bogo-track-tattoo')
          });
        }
      }
      
      // Third try: look at the overlay's meetyState to find the correct button
      if (!btn && st) {
        const overlayEl = document.querySelector('.meety-overlay');
        if (overlayEl && overlayEl.meetyState && overlayEl.meetyState.btnId) {
          btn = document.getElementById(overlayEl.meetyState.btnId);
          console.log(LOG_PREFIX, '📍 Method 3 - Found button from overlay state:', {
            stateBtnId: overlayEl.meetyState.btnId,
            buttonFound: !!btn,
            buttonCategory: btn?.getAttribute('data-bogo-category'),
            tattooHandle: btn?.getAttribute('data-bogo-track-tattoo')
          });
        }
      }
      
      // Fourth try: examine step elements to extract button ID
      if (!btn) {
        const activeStep = document.querySelector('.meety-step[style*="block"], .meety-step:not([style*="none"]):not([style*="display: none"])');
        if (activeStep && activeStep.id) {
          // Step IDs are like "meety-step-gift-purchase-meety-open-btn-button_xyz"
          const stepId = activeStep.id;
          const btnIdMatch = stepId.match(/-(meety-open-btn-[^-]+)$/);
          if (btnIdMatch) {
            const btnId = btnIdMatch[1];
            btn = document.getElementById(btnId);
            console.log(LOG_PREFIX, '📍 Method 4 - Found button from step element:', {
              stepId,
              extractedBtnId: btnId,
              buttonFound: !!btn,
              buttonCategory: btn?.getAttribute('data-bogo-category'),
              tattooHandle: btn?.getAttribute('data-bogo-track-tattoo')
            });
          }
        }
      }
      
      // Fifth method (IMPROVED): match button by artist name from product title
      if (!btn && artistName) {
        const allBogoButtons = document.querySelectorAll('.meety-open-btn[data-bogo-category]:not([data-bogo-category="none"])');
        console.log(LOG_PREFIX, '📍 Method 5 - Searching by artist name:', {
          artistName,
          productName,
          availableButtons: Array.from(allBogoButtons).map(b => ({
            id: b.id,
            text: b.textContent?.trim(),
            category: b.getAttribute('data-bogo-category'),
            tattooHandle: b.getAttribute('data-bogo-track-tattoo')
          }))
        });
        
        // Try to find button by matching artist name to button text
        const artistLower = artistName.toLowerCase().trim();
        btn = Array.from(allBogoButtons).find(b => {
          const buttonText = (b.textContent || '').toLowerCase().trim();
          return buttonText === artistLower || buttonText.includes(artistLower);
        });
        
        if (btn) {
          console.log(LOG_PREFIX, '✅ Found matching button by artist name:', {
            artistName,
            buttonId: btn.id,
            buttonText: btn.textContent?.trim(),
            buttonCategory: btn.getAttribute('data-bogo-category'),
            tattooHandle: btn.getAttribute('data-bogo-track-tattoo')
          });
        }
      }
      
      // Sixth method (last resort): use the first BOGO button (but log a warning)
      if (!btn) {
        const allBogoButtons = document.querySelectorAll('.meety-open-btn[data-bogo-category]:not([data-bogo-category="none"])');
        console.log(LOG_PREFIX, '⚠️ All available BOGO buttons:', Array.from(allBogoButtons).map(b => ({
          id: b.id,
          category: b.getAttribute('data-bogo-category'),
          tattooHandle: b.getAttribute('data-bogo-track-tattoo')
        })));
        
        btn = allBogoButtons[0];
        console.warn(LOG_PREFIX, '⚠️ WARNING: Using first available BOGO button as fallback - this may be incorrect!', {
          buttonId: btn?.id,
          buttonCategory: btn?.getAttribute('data-bogo-category'),
          tattooHandle: btn?.getAttribute('data-bogo-track-tattoo')
        });
      }
    }
    
    console.log(LOG_PREFIX, 'Button context for tracking:', {
      buttonId: btn?.id,
      buttonSource: buttonContext ? 'passed-context' : (st?.button ? 'overlay-state' : 'fallback'),
      bogoCategory: btn?.getAttribute('data-bogo-category'),
      trackingHandles: {
        piercings: btn?.getAttribute('data-bogo-track-piercings'),
        toothGems: btn?.getAttribute('data-bogo-track-tooth-gems'),
        teethWhitening: btn?.getAttribute('data-bogo-track-teeth-whitening'),
        tattoo: btn?.getAttribute('data-bogo-track-tattoo')
      }
    });
    
    // Set gift purchase flag and ensure BOGO context is properly initialized
    if (!window.__meetyBogoContext) {
      window.__meetyBogoContext = {};
    }

    // CRITICAL: Set gift purchase flag BEFORE building payload to prevent interceptor conflicts
    window.__meetyBogoContext.isGiftPurchase = true;
    window.__meetyBogoContext.isRedemption = false;
    window.__meetyBogoContext.trackingAlreadyAdded = false; // Reset duplicate prevention flag
    
    // CRITICAL: Store button reference in context so sync tracking lookup uses correct button
    if (btn) {
      window.__meetyBogoContext.buttonElement = btn;
      console.log(LOG_PREFIX, '🎯 Stored button reference in context:', {
        buttonId: btn.id,
        buttonText: btn.textContent?.trim(),
        category: btn.getAttribute('data-bogo-category'),
        tattooHandle: btn.getAttribute('data-bogo-track-tattoo')
      });
    }
    
    console.log(LOG_PREFIX, '🎁 GIFT PURCHASE CONTEXT SET:', {
      isGiftPurchase: window.__meetyBogoContext.isGiftPurchase,
      isRedemption: window.__meetyBogoContext.isRedemption,
      category: window.__meetyBogoContext.category,
      hasButtonElement: !!window.__meetyBogoContext.buttonElement,
      preventInterceptorTracking: true
    });

    // Prevent immediate cleanup of tracking products we're about to add
    window.__meetyBogoContext.preventCleanup = true;
    setTimeout(() => {
      if (window.__meetyBogoContext) {
        window.__meetyBogoContext.preventCleanup = false;
      }
    }, 5000); // Prevent cleanup for 5 seconds after gift card purchase    // Ensure the category is set in context if we can determine it
    if (btn && !window.__meetyBogoContext.category) {
      let contextCategory = btn.getAttribute('data-bogo-category');
      
      // If no explicit BOGO category but tracking products are configured, infer category
      if (!contextCategory || contextCategory === 'none') {
        const trackingHints = {
          'tattoo': btn.getAttribute('data-bogo-track-tattoo'),
          'piercings': btn.getAttribute('data-bogo-track-piercings'), 
          'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
          'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
        };
        
        const availableCategories = Object.entries(trackingHints)
          .filter(([cat, handle]) => handle && handle.trim() !== '' && handle !== '#')
          .map(([cat]) => cat);
          
        if (availableCategories.length === 1) {
          contextCategory = availableCategories[0];
          console.log(LOG_PREFIX, 'Inferred BOGO context category from single tracking product:', contextCategory);
        } else if (availableCategories.length > 1) {
          // Multiple options - try to infer from product name or use first
          if (productName) {
            const productLower = productName.toLowerCase();
            if (productLower.includes('tattoo') && availableCategories.includes('tattoo')) {
              contextCategory = 'tattoo';
            } else if (productLower.includes('piercing') && availableCategories.includes('piercings')) {
              contextCategory = 'piercings';
            } else if (productLower.includes('gem') && availableCategories.includes('tooth-gems')) {
              contextCategory = 'tooth-gems';
            } else if (productLower.includes('whitening') && availableCategories.includes('teeth-whitening')) {
              contextCategory = 'teeth-whitening';
            } else {
              contextCategory = availableCategories[0]; // fallback to first
            }
            console.log(LOG_PREFIX, 'Inferred BOGO context category from product name and available tracking:', contextCategory);
          } else {
            contextCategory = availableCategories[0]; // fallback to first
            console.log(LOG_PREFIX, 'Multiple tracking options - defaulting BOGO context to first:', contextCategory);
          }
        }
      }
      
      if (contextCategory && contextCategory !== 'none') {
        window.__meetyBogoContext.category = contextCategory;
      }
    }
    
    console.log(LOG_PREFIX, 'Gift purchase context set:', {
      isGiftPurchase: window.__meetyBogoContext.isGiftPurchase,
      isRedemption: window.__meetyBogoContext.isRedemption,
      category: window.__meetyBogoContext.category,
      buttonId: btn?.id
    });
    
    // CRITICAL: Preload tracking product cache BEFORE proceeding with cart add
    // This ensures the cache is ready when transformBody intercepts the request
    if (btn && window.__meetyBogoContext.category) {
      const attrMap = {
        'tattoo': 'data-bogo-track-tattoo',
        'piercings': 'data-bogo-track-piercings',
        'tooth-gems': 'data-bogo-track-tooth-gems',
        'teeth-whitening': 'data-bogo-track-teeth-whitening',
        'gems-whitening': 'data-bogo-track-tooth-gems' // dual category uses tooth-gems for now
      };
      
      const attrName = attrMap[window.__meetyBogoContext.category];
      const trackingHandle = attrName ? btn.getAttribute(attrName) : null;
      
      console.log(LOG_PREFIX, '🔥 Preloading tracking product cache (BLOCKING):', {
        category: window.__meetyBogoContext.category,
        attrName: attrName,
        handle: trackingHandle,
        buttonId: btn.id
      });
      
      if (trackingHandle && trackingHandle !== '#' && trackingHandle.trim() !== '') {
        try {
          // AWAIT the cache warming to ensure it completes before cart add
          await fetchProductByHandleCached(trackingHandle);
          console.log(LOG_PREFIX, '✅ Successfully preloaded tracking product:', trackingHandle);
          
          // Verify cache is populated (inline check)
          window.__bogoTrackCache = window.__bogoTrackCache || {};
          const cacheEntry = window.__bogoTrackCache[trackingHandle];
          const cached = cacheEntry?.data;
          
          console.log(LOG_PREFIX, '🔍 Cache verification:', {
            handle: trackingHandle,
            cached: !!cached,
            title: cached?.title,
            variantCount: cached?.variants?.length,
            firstVariantId: cached?.variants?.[0]?.id
          });
        } catch (err) {
          console.warn(LOG_PREFIX, '❌ Failed to preload tracking product:', err);
        }
      } else {
        console.warn(LOG_PREFIX, '⚠️ No valid tracking handle found for category:', window.__meetyBogoContext.category);
      }
    }
    
    // Build primary gift line with Shopify's native recipient properties
    // CRITICAL: Shopify requires these EXACT property names (case-sensitive!)
    const giftLine = { 
      id: variantId, 
      quantity: 1, 
      properties: {}
    };
    
    // REQUIRED: This flag tells Shopify to send the gift card to the recipient
    giftLine.properties['__shopify_send_gift_card_to_recipient'] = 'true';
    
    // REQUIRED: Recipient email (Shopify will send the gift card code to this email)
    giftLine.properties['Recipient email'] = recipientEmail;
    
    // OPTIONAL: Recipient name (appears in Shopify's gift card email)
    if (recipientName) {
      giftLine.properties['Recipient name'] = recipientName;
    }
    
    // OPTIONAL: Personal message (included in Shopify's gift card email)
    // Enhanced: Include structured gift card type data in message for email parsing
    let enhancedMessage = personalMessage && personalMessage.trim() ? personalMessage.trim() : '';
    
    // Build structured suffix with gift card details (parseable in email)
    let structuredSuffix = '';
    if (productName || artistName || giftDurationLabel || desiredService) {
      structuredSuffix = '\n\n---\n'; // Separator for visual clarity
      
      // Add product name if available (e.g., "Angelo — Hourly Gift Card (Bonus Time)")
      if (productName) {
        structuredSuffix += `Gift Card Product: ${productName}\n`;
      }
      
      // Add artist name if extracted
      if (artistName && !productName.includes(artistName)) {
        structuredSuffix += `Artist: ${artistName}\n`;
      }
      
      // Add gift type with enhanced label for tattoos
      if (giftDurationLabel) {
        // Check if it's a tattoo time gift (contains hours notation)
        const isTattooTime = /\d+h/i.test(giftDurationLabel) || giftDurationLabel.toLowerCase().includes('hour');
        if (isTattooTime) {
          // Enhance tattoo time labels to be more descriptive
          structuredSuffix += `Tattoo Artist Time: ${giftDurationLabel}\n`;
        } else {
          structuredSuffix += `Gift Type: ${giftDurationLabel}\n`;
        }
      }
      
      if (desiredService) {
        structuredSuffix += `Service: ${desiredService}\n`;
      }
      
      // Add BOGO details if present
      if (st?.giftBogoMode && st?.bogoSelection?.chargedVariant) {
        structuredSuffix += `BOGO: ${st.bogoSelection.chargedVariant.title}`;
        if (st.bogoSelection.freeVariant) {
          structuredSuffix += ` + ${st.bogoSelection.freeVariant.title} (FREE)`;
        }
        if (st.bogoSelection.extraFreeVariants?.length) {
          st.bogoSelection.extraFreeVariants.forEach(v => {
            structuredSuffix += ` + ${v.title} (FREE)`;
          });
        }
        structuredSuffix += '\n';
      }
      
      // Add tattoo details if present
      if (st?.tattooGiftPurchase) {
        const hours = st.tattooGiftPurchase.hours || '';
        const label = st.tattooGiftPurchase.label || '';
        structuredSuffix += `Tattoo Hours Purchased: ${hours}`;
        if (label.toLowerCase().includes('double') || label.toLowerCase().includes('bonus')) {
          structuredSuffix += ` (Includes ${hours * 2}h total artist time with promotion)`;
        }
        structuredSuffix += `\n`;
      }
      
      // Add piercing details if present
      if (st?.piercingGiftMode && st?.giftPiercingFirstSelection && st?.giftPiercingSecondSelection) {
        structuredSuffix += `Piercings: ${st.giftPiercingFirstSelection.title}`;
        structuredSuffix += ` + ${st.giftPiercingSecondSelection.title} (BOGO)\n`;
      }
      
      // Add gems/whitening details if present
      if (st?.giftGems) {
        const style = st.giftGems.style || '';
        const placement = st.giftGems.placement || '';
        structuredSuffix += `Tooth Gems: ${style} gem - ${placement} placement`;
        
        // Check if it's Buy 1 Get 2 Free promo
        if (st.bogoSelection?.extraFreeVariants?.length) {
          structuredSuffix += ` (Buy 1 Get 2 Free)`;
        }
        structuredSuffix += '\n';
      }
      
      if (st?.giftWhitening?.variantTitle) {
        structuredSuffix += `Teeth Whitening: ${st.giftWhitening.variantTitle}\n`;
      }
    }
    
    // Combine personal message with structured data
    const finalMessage = enhancedMessage + structuredSuffix;
    
    if (finalMessage && finalMessage.trim()) {
      giftLine.properties['Message'] = finalMessage.trim();
    }
    
    // CRITICAL: Add product name and artist as separate properties for reliable email parsing
    // These will be available in gift_card.properties in the Liquid template
    if (productName) {
      giftLine.properties['_Gift_Card_Product'] = productName;
    }
    if (artistName) {
      giftLine.properties['_Artist_Name'] = artistName;
    }
    
    // DEBUG: Log the critical Shopify properties
    console.log(LOG_PREFIX, '🎁 SHOPIFY GIFT CARD PROPERTIES (v' + MEETYBUTTON_VERSION + '):', {
      '__shopify_send_gift_card_to_recipient': giftLine.properties['__shopify_send_gift_card_to_recipient'],
      'Recipient email': giftLine.properties['Recipient email'],
      'Recipient name': giftLine.properties['Recipient name'],
      'Message': giftLine.properties['Message'],
      'Gift Card Type': giftDurationLabel,
      'Gift Card Product': productName,
      'Artist': artistName,
      'Enhanced Message Length': finalMessage.length
    });
    
    // Store additional info for our own tracking and Netlify function
    // CRITICAL: Use different property names to avoid overwriting Shopify's required properties!
    // Shopify ONLY recognizes: "Recipient email" (lowercase e), "Recipient name" (lowercase n)
    // Our custom properties use capitals to distinguish them
    giftLine.properties['_Recipient Name'] = recipientName;        // Custom tracking (underscore prefix)
    giftLine.properties['_Recipient Email'] = recipientEmail;      // Custom tracking (underscore prefix)
    giftLine.properties['_Recipient Phone'] = recipientPhone;      // Custom tracking (our field only)
    if (personalMessage) giftLine.properties['_Personal Message'] = personalMessage; // Custom tracking
    if (giftDurationLabel) giftLine.properties['Gift Card Type'] = giftDurationLabel;
    if (desiredService) giftLine.properties['Desired Service Category'] = desiredService;
    
    // Enhanced gift card properties for robust tracking connection
    giftLine.properties['_Gift Card Session'] = Date.now().toString(); // Session timestamp for linking
    giftLine.properties['_Gift Card Button'] = btn?.id || 'unknown';     // Source button ID
    giftLine.properties['_Gift Card Artist'] = artistName || (btn?.id || '').replace('meety-open-btn-', '');
    if (btn?.getAttribute('data-bogo-category')) {
      giftLine.properties['_Expected Tracking Category'] = btn.getAttribute('data-bogo-category');
    }
    
    try {
      if(st?.giftSubtype) giftLine.properties['Gift Category'] = st.giftSubtype;
      if(st?.giftGems){
        if(st.giftGems.style) giftLine.properties['Gift Gems Style'] = st.giftGems.style;
        if(st.giftGems.placement) giftLine.properties['Gift Gems Placement'] = st.giftGems.placement;
        if(st.giftGems.variantId) giftLine.properties['Gift Gems Variant ID'] = st.giftGems.variantId;
        if(st.giftGems.variantTitle) giftLine.properties['Gift Gems Variant Title'] = st.giftGems.variantTitle;
      }
      if(st?.giftWhitening?.variantTitle) giftLine.properties['Gift Whitening Variant'] = st.giftWhitening.variantTitle;
      if(st?.giftBogoMode && st?.bogoSelection?.chargedVariant){
        giftLine.properties['Gift BOGO Charged Variant'] = st.bogoSelection.chargedVariant.title;
        if(st.bogoSelection.freeVariant) giftLine.properties['Gift BOGO Free Variant'] = st.bogoSelection.freeVariant.title + ' (FREE)';
        (st.bogoSelection.extraFreeVariants||[]).forEach((v,i)=>{ giftLine.properties[`Gift BOGO Extra Free ${i+1}`] = v.title + ' (FREE)'; });
      }
      if (st?.tattooGiftPurchase) {
        giftLine.properties['Tattoo Gift Hours'] = st.tattooGiftPurchase.hours || '';
        giftLine.properties['Tattoo Gift Label'] = st.tattooGiftPurchase.label || '';
      }
      if(st?.giftPiercingFirstSelection){
        giftLine.properties['Gift Piercing 1'] = st.giftPiercingFirstSelection.title || '';
        giftLine.properties['Gift Piercing 1 Variant'] = st.giftPiercingFirstSelection.variantId || '';
      }
      if(st?.giftPiercingSecondSelection){
        giftLine.properties['Gift Piercing 2'] = st.giftPiercingSecondSelection.title || '';
        giftLine.properties['Gift Piercing 2 Variant'] = st.giftPiercingSecondSelection.variantId || '';
      }
      if(st?.giftPiercingFirstSelection && st?.giftPiercingSecondSelection && st?.piercingGiftVariants){
        const vs = st.piercingGiftVariants;
        const lookup = (id)=> vs.find(v=> String(v.id) === String(id));
        const v1 = lookup(st.giftPiercingFirstSelection.variantId) || {}; const v2 = lookup(st.giftPiercingSecondSelection.variantId) || {};
        const p1 = (v1.price||0)/100; const p2 = (v2.price||0)/100;
        let charged = { title: st.giftPiercingFirstSelection.title, price: p1 };
        let free = { title: st.giftPiercingSecondSelection.title, price: p2 };
        if (p2 > p1){ charged = { title: st.giftPiercingSecondSelection.title, price: p2 }; free = { title: st.giftPiercingFirstSelection.title, price: p1 }; }
        const summary = `${charged.title} ($${charged.price.toFixed(2)}) + ${free.title} (FREE)`;
        giftLine.properties['Piercing Gift Summary'] = summary;
        giftLine.properties['Piercing Services'] = summary;
        giftLine.properties['Free Piercing'] = free.title + ' (FREE)';
        giftLine.properties['Charged Piercing'] = charged.title + ` ($${charged.price.toFixed(2)})`;
      }
    } catch(e){ console.warn(LOG_PREFIX,'Could not build gift line properties', e); }

    // Enhanced tracking variant inclusion for gift cards
    let trackingLine = null;
    try {
      console.log(LOG_PREFIX, '🎯 TRACKING ANALYSIS START - Gift Card Purchase:', {
        giftCardVariantId: variantId,
        buttonId: btn?.id,
        hasState: !!st,
        stateFlags: {
          giftBogoMode: st?.giftBogoMode,
          piercingGiftMode: st?.piercingGiftMode,
          tattooGiftPurchase: !!st?.tattooGiftPurchase,
          giftGems: !!st?.giftGems,
          giftWhitening: !!st?.giftWhitening,
          giftSubtype: st?.giftSubtype,
          isRegularGiftPurchase: st?.isRegularGiftPurchase
        },
        buttonAttributes: {
          bogoCategory: btn?.getAttribute('data-bogo-category'),
          trackingHandles: {
            tattoo: btn?.getAttribute('data-bogo-track-tattoo'),
            piercings: btn?.getAttribute('data-bogo-track-piercings'),
            toothGems: btn?.getAttribute('data-bogo-track-tooth-gems'),
            teethWhitening: btn?.getAttribute('data-bogo-track-teeth-whitening')
          }
        },
        globalContext: {
          bogoCategory: window.__meetyBogoContext?.category,
          isGiftPurchase: window.__meetyBogoContext?.isGiftPurchase
        },
        productInfo: {
          productName,
          artistName,
          variantTitle
        }
      });
      
      // CRITICAL: Skip tracking if Instagram mode already added it
      if (window.__meetyBogoContext?.isInstagramMode && window.__meetyBogoContext?.trackingAlreadyAdded) {
        console.log(LOG_PREFIX, '✅ Skipping tracking product - already added by Instagram mode');
        trackingLine = null; // Force skip
      } else {
        // Determine the appropriate tracking category
        let trackingCategory = null;
      
      // If state is available, use it first
      if (st) {
        // Check for gems-whitening subcategories first
        if (st.giftSubtype === 'tooth-gems' || st.__gemsWhiteningChosen === 'tooth-gems' || st.giftGems) {
          trackingCategory = 'tooth-gems';
        } else if (st.giftSubtype === 'teeth-whitening' || st.__gemsWhiteningChosen === 'teeth-whitening' || st.giftWhitening) {
          trackingCategory = 'teeth-whitening';
        } else if (st.tattooGiftPurchase) {
          trackingCategory = 'tattoo';
        } else if (st.piercingGiftMode) {
          trackingCategory = 'piercings';
        } else if (st.giftBogoMode) {
          // For BOGO mode, determine category from state or fallback to button
          if (st.giftSubtype && st.giftSubtype !== 'gems-whitening') {
            trackingCategory = st.giftSubtype;
          } else if (btn) {
            // Extract category from button's BOGO category attribute
            const buttonCategory = btn.getAttribute('data-bogo-category');
            if (buttonCategory && buttonCategory !== 'none') {
              trackingCategory = buttonCategory;
            }
          }
        } else if (st.giftSubtype) {
          // Fallback to the giftSubtype if it matches a known category
          trackingCategory = st.giftSubtype;
        } else if (st.isRegularGiftPurchase) {
          // For regular gift purchases without explicit category, try to infer
          trackingCategory = getInferredTrackingCategory(btn);
          console.log(LOG_PREFIX, 'Regular gift purchase - inferred category:', trackingCategory);
        }
      }
      
      // If we don't have a category from state, try the global BOGO context
      if (!trackingCategory && window.__meetyBogoContext?.category) {
        trackingCategory = window.__meetyBogoContext.category;
        console.log(LOG_PREFIX, 'Using BOGO context category for gift card tracking:', trackingCategory);
      }
      
      // If still no category, try to determine from button attributes (prioritize button with proper context)
      if (!trackingCategory && btn) {
        const bogoCategory = btn.getAttribute('data-bogo-category');
        if (bogoCategory && bogoCategory !== 'none') {
          trackingCategory = bogoCategory;
          console.log(LOG_PREFIX, 'Using button BOGO category for tracking:', trackingCategory);
        }
      }
      
      // NEW: If still no category but we have tracking products configured, infer category from available tracking handles
      // This ensures ALL gift card purchases get tracking, not just BOGO ones
      if (!trackingCategory && btn) {
        console.log(LOG_PREFIX, 'No explicit category found, checking available tracking handles...');
        
        const availableTracking = {
          'tattoo': btn.getAttribute('data-bogo-track-tattoo'),
          'piercings': btn.getAttribute('data-bogo-track-piercings'), 
          'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
          'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
        };
        
        // Remove empty/null handles
        const validTracking = Object.entries(availableTracking).filter(([cat, handle]) => handle && handle.trim() !== '' && handle !== '#');
        
        console.log(LOG_PREFIX, 'Available tracking handles:', validTracking);
        
        // If we only have one tracking handle configured, use that category
        if (validTracking.length === 1) {
          trackingCategory = validTracking[0][0];
          console.log(LOG_PREFIX, 'Inferred single category from tracking handle:', trackingCategory);
        } else if (validTracking.length > 1) {
          // Multiple tracking handles - try to infer from gift card product or context
          console.log(LOG_PREFIX, 'Multiple tracking handles available, trying to infer from context...');
          
          // Check if product name contains category hints
          if (productName) {
            const productLower = productName.toLowerCase();
            if (productLower.includes('tattoo')) {
              trackingCategory = 'tattoo';
            } else if (productLower.includes('piercing')) {
              trackingCategory = 'piercings';
            } else if (productLower.includes('gem')) {
              trackingCategory = 'tooth-gems';
            } else if (productLower.includes('whitening')) {
              trackingCategory = 'teeth-whitening';
            }
            
            if (trackingCategory) {
              console.log(LOG_PREFIX, 'Inferred category from product name:', trackingCategory, 'from product:', productName);
            }
          }
          
          // ENHANCED: If still no category and we have valid tracking, try button's default/primary category
          if (!trackingCategory) {
            // Look for a primary category hint in button class or data attributes
            const buttonClasses = btn.className || '';
            const buttonDataAttrs = Array.from(btn.attributes)
              .filter(attr => attr.name.startsWith('data-'))
              .map(attr => attr.name + '=' + attr.value)
              .join(' ');
            
            console.log(LOG_PREFIX, 'Checking button for category hints:', {
              classes: buttonClasses,
              dataAttrs: buttonDataAttrs
            });
            
            // Check for specific category hints in button context
            if (buttonClasses.includes('tattoo') || buttonDataAttrs.includes('tattoo')) {
              trackingCategory = 'tattoo';
            } else if (buttonClasses.includes('piercing') || buttonDataAttrs.includes('piercing')) {
              trackingCategory = 'piercings';
            } else if (buttonClasses.includes('gem') || buttonDataAttrs.includes('gem')) {
              trackingCategory = 'tooth-gems';
            } else if (buttonClasses.includes('whitening') || buttonDataAttrs.includes('whitening')) {
              trackingCategory = 'teeth-whitening';
            }
            
            // If still no specific category found, default to first available and log warning
            if (!trackingCategory) {
              trackingCategory = validTracking[0][0];
              console.warn(LOG_PREFIX, 'GIFT CARD TRACKING: Multiple tracking handles but unclear category - defaulting to first available:', trackingCategory, 'for button:', btn.id);
              console.warn(LOG_PREFIX, 'CONSIDER: Adding data-bogo-category="' + trackingCategory + '" to button to ensure proper tracking');
            } else {
              console.log(LOG_PREFIX, 'Inferred category from button context:', trackingCategory);
            }
          }
        }
      }
      
      // FALLBACK: If we still don't have a tracking category but gift cards need tracking,
      // force a default category based on any available tracking product
      if (!trackingCategory && btn) {
        const fallbackHandles = {
          'tattoo': btn.getAttribute('data-bogo-track-tattoo'),
          'piercings': btn.getAttribute('data-bogo-track-piercings'), 
          'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
          'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
        };
        
        const firstValidHandle = Object.entries(fallbackHandles).find(([cat, handle]) => 
          handle && handle.trim() !== '' && handle !== '#'
        );
        
        if (firstValidHandle) {
          trackingCategory = firstValidHandle[0];
          console.warn(LOG_PREFIX, 'FORCE FALLBACK: Using first available tracking category for gift card:', trackingCategory);
          console.warn(LOG_PREFIX, 'RECOMMENDATION: Set data-bogo-category="' + trackingCategory + '" on button', btn.id, 'to avoid this fallback');
        }
      }
      
      // Final logging with source attribution
      let categorySource = 'unknown';
      if (st?.tattooGiftPurchase) categorySource = 'tattoo-gift-state';
      else if (st?.piercingGiftMode) categorySource = 'piercing-gift-state';
      else if (st?.giftGems) categorySource = 'gems-state';
      else if (st?.giftWhitening) categorySource = 'whitening-state';
      else if (st?.giftBogoMode) categorySource = 'bogo-state';
      else if (window.__meetyBogoContext?.category) categorySource = 'bogo-context';
      else if (btn?.getAttribute('data-bogo-category') && btn?.getAttribute('data-bogo-category') !== 'none') categorySource = 'button-bogo-attribute';
      else if (trackingCategory) categorySource = 'inferred-from-tracking-handles';
      
      console.log(LOG_PREFIX, 'Final tracking category determination:', {
        category: trackingCategory,
        source: categorySource,
        buttonId: btn?.id
      });
      
      console.log(LOG_PREFIX, 'Gift card tracking category determination:', {
        hasState: !!st,
        hasButtonContext: !!buttonContext,
        buttonId: btn?.id,
        stateDetails: {
          giftSubtype: st?.giftSubtype,
          gemsWhiteningChosen: st?.__gemsWhiteningChosen,
          giftGems: !!st?.giftGems,
          giftWhitening: !!st?.giftWhitening,
          giftBogoMode: st?.giftBogoMode,
          piercingGiftMode: st?.piercingGiftMode,
          tattooGiftPurchase: !!st?.tattooGiftPurchase
        },
        contextSources: {
          bogoContextCategory: window.__meetyBogoContext?.category,
          buttonBogoCategory: btn?.getAttribute('data-bogo-category')
        },
        determinedCategory: trackingCategory,
        categorySource: trackingCategory ? 'state-based' : 'pending-fallback'
      });
      
      if (trackingCategory) {
        // For gems-whitening, we need to use the subcategory for tracking lookup
        let effectiveCategory = trackingCategory;
        if (trackingCategory === 'gems-whitening') {
          effectiveCategory = st?.__gemsWhiteningChosen || st?.giftSubtype;
          if (!effectiveCategory) {
            console.warn(LOG_PREFIX, 'gems-whitening category but no subcategory determined');
            effectiveCategory = trackingCategory; // fallback to original
          }
        }
        
        // Get tracking variant using helper function with button context
        // Create a temporary state with the effective category for lookup
        const tempState = st ? { ...st, giftSubtype: effectiveCategory, __gemsWhiteningChosen: effectiveCategory } : { giftSubtype: effectiveCategory, __gemsWhiteningChosen: effectiveCategory };
        
        console.log(LOG_PREFIX, '🎯 Tracking variant lookup starting:', {
          effectiveCategory,
          buttonId: btn?.id,
          buttonCategory: btn?.getAttribute('data-bogo-category'),
          availableHandles: {
            piercings: btn?.getAttribute('data-bogo-track-piercings'),
            toothGems: btn?.getAttribute('data-bogo-track-tooth-gems'),
            teethWhitening: btn?.getAttribute('data-bogo-track-teeth-whitening'),
            tattoo: btn?.getAttribute('data-bogo-track-tattoo')
          }
        });
        
        let trackVid = await getTrackingVariantIdForState(tempState, btn, { forceFresh: false });
        console.log(LOG_PREFIX, '🎯 State-based tracking lookup result:', { trackVid, effectiveCategory });
        
        // If state-based lookup fails, try direct button-based lookup
        if (!trackVid) {
          console.log(LOG_PREFIX, '🎯 State-based lookup failed, trying direct button lookup for category:', effectiveCategory);
          
          // Build handle map from button attributes
          const handleMap = {
            'piercings': btn?.getAttribute('data-bogo-track-piercings'),
            'tooth-gems': btn?.getAttribute('data-bogo-track-tooth-gems'),
            'teeth-whitening': btn?.getAttribute('data-bogo-track-teeth-whitening'),
            'tattoo': btn?.getAttribute('data-bogo-track-tattoo')
          };
          
          const handle = handleMap[effectiveCategory];
          console.log(LOG_PREFIX, 'Direct lookup handle for', effectiveCategory, ':', handle);
          
          if (handle) {
            try {
              const prod = await fetchProductByHandleCached(handle, { forceFresh: false });
              console.log(LOG_PREFIX, 'Fetched tracking product:', {
                handle,
                productTitle: prod?.title,
                variantCount: prod?.variants?.length,
                category: effectiveCategory
              });
              
              if (prod?.variants?.length) {
                // Prefer first variant with inventory management and quantity > 0; fallback to first
                const variant = prod.variants.find(v => 
                  v.inventory_management && 
                  typeof v.inventory_quantity === 'number' && 
                  v.inventory_quantity > 0
                ) || prod.variants[0];
                trackVid = variant?.id;
                console.log(LOG_PREFIX, 'Selected tracking variant:', {
                  variantId: trackVid,
                  variantTitle: variant?.title,
                  productTitle: prod?.title,
                  category: effectiveCategory
                });
              }
            } catch (e) {
              console.warn(LOG_PREFIX, 'Direct tracking product fetch failed:', e);
            }
          }
        }
        
        if (trackVid) {
          trackingLine = { 
            id: trackVid, 
            quantity: 1, 
            properties: { 
              'BOGO Inventory Tracker': 'true',
              'BOGO Gift Card Purchased': 'true',
              'BOGO Category': effectiveCategory,
              'Gift Card Tracking': `${effectiveCategory} Gift Card Tracking (Visible for Testing)`,
              'Tracking Source': categorySource,
              // Enhanced linking properties for robust gift card ↔ tracking connection
              '_Linked Gift Card Variant': variantId,
              '_Gift Card Artist': btn?.getAttribute('data-artist-name') || (btn?.id || '').replace('meety-open-btn-', ''),
              '_Gift Card Session': Date.now().toString(), // Timestamp for session-based linking
              '_Gift Card Button': btn?.id || 'unknown',
              // Redundant category storage for extra robustness
              '_Service Category': effectiveCategory,
              '_Original Category': trackingCategory
            } 
          };
          
          // Register the relationship for persistence
          const relationshipMetadata = {
            giftCardVariantId: variantId,
            trackingVariantId: trackVid,
            category: effectiveCategory,
            artist: trackingLine.properties['_Gift Card Artist'],
            session: trackingLine.properties['_Gift Card Session'],
            button: btn?.id
          };
          
          // We'll register this after cart addition succeeds
          window.__pendingTrackingRelationship = relationshipMetadata;
          
          console.log(LOG_PREFIX, '✅ GIFT CARD TRACKING ADDED SUCCESSFULLY:', { 
            originalCategory: trackingCategory, 
            effectiveCategory: effectiveCategory, 
            variantId: trackVid,
            categorySource: categorySource,
            buttonId: btn?.id,
            giftCardVariantId: variantId,
            enhancedProperties: trackingLine.properties,
            relationshipMetadata: relationshipMetadata
          });
          console.log(LOG_PREFIX, '🎯 TRACKING PRODUCT DETAILS:', {
            trackingVariantId: trackVid,
            trackingCategory: effectiveCategory,
            trackingProperties: trackingLine.properties
          });
        } else {
          console.warn(LOG_PREFIX, '❌ TRACKING PRODUCT MISSING: No tracking variant found for gift card category:', effectiveCategory, 'Button:', btn?.id);
          console.warn(LOG_PREFIX, '❌ GIFT CARD WILL BE ADDED WITHOUT TRACKING PRODUCT');
        }
      } else {
        console.log(LOG_PREFIX, 'No tracking category identified for this gift card');
        
        // FINAL ATTEMPT: If no category was determined but button has tracking configured,
        // try to add ANY available tracking product to ensure gift cards are tracked
        if (btn) {
          const emergencyTracking = {
            'tattoo': btn.getAttribute('data-bogo-track-tattoo'),
            'piercings': btn.getAttribute('data-bogo-track-piercings'), 
            'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'),
            'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening')
          };
          
          const emergencyOption = Object.entries(emergencyTracking).find(([cat, handle]) => 
            handle && handle.trim() !== '' && handle !== '#'
          );
          
          if (emergencyOption) {
            console.warn(LOG_PREFIX, '🚨 EMERGENCY TRACKING: No category determined, but tracking configured. Using emergency fallback:', emergencyOption[0]);
            
            try {
              const [emergencyCategory, emergencyHandle] = emergencyOption;
              const emergencyProd = await fetchProductByHandleCached(emergencyHandle, { forceFresh: false });
              
              if (emergencyProd?.variants?.length) {
                const emergencyVariant = emergencyProd.variants.find(v => 
                  v.inventory_management && 
                  typeof v.inventory_quantity === 'number' && 
                  v.inventory_quantity > 0
                ) || emergencyProd.variants[0];
                
                if (emergencyVariant?.id) {
                  trackingLine = { 
                    id: emergencyVariant.id, 
                    quantity: 1, 
                    properties: { 
                      'BOGO Inventory Tracker': 'true',
                      'BOGO Gift Card Purchased': 'true',
                      'BOGO Category': emergencyCategory,
                      'Gift Card Tracking': `Emergency ${emergencyCategory} Gift Card Tracking`,
                      'Tracking Source': 'emergency-fallback'
                    } 
                  };
                  
                  console.warn(LOG_PREFIX, '🚨 EMERGENCY TRACKING APPLIED:', {
                    category: emergencyCategory,
                    variantId: emergencyVariant.id,
                    buttonId: btn?.id,
                    reason: 'No category detected but tracking available'
                  });
                }
              }
            } catch (e) {
              console.error(LOG_PREFIX, '❌ Emergency tracking failed:', e);
            }
          } else {
            console.log(LOG_PREFIX, '🔍 No tracking products configured on button - gift card will be added without tracking');
          }
        }
      }
      } // End of Instagram mode tracking skip condition
    } catch(e){ console.warn(LOG_PREFIX,'Gift card tracking variant resolve failed', e); }

    // Build JSON payload (Shopify accepts {items:[...]})
    const payload = trackingLine ? { items: [giftLine, trackingLine] } : { items: [giftLine] };

    // Log recipient properties for verification
    console.log(LOG_PREFIX, 'Gift card recipient info:', {
      recipient_object: giftLine.recipient,
      recipient_email_prop: giftLine.properties['Recipient email'],
      recipient_name_prop: giftLine.properties['Recipient name'],
      message: giftLine.properties['Message'],
      hasMessage: !!personalMessage
    });

    // Pre-flight: if trackingLine present, ensure not sold out (re-fetch product to get fresh inventory if possible)
    if(trackingLine){
      try {
        // simple optimistic check: if previously we stored remaining count on st and it's <=0 block
        if(st.__trackingRemaining != null && st.__trackingRemaining <= 0){
          alert('Sorry, this gift promotion is sold out.');
          return;
        }
      } catch(e){}
    }

    // Create customer for gift recipient BEFORE adding to cart
    createGiftCardRecipientCustomer({
      name: recipientName,
      email: recipientEmail,
      phone: recipientPhone,
      giftType: giftDurationLabel,
      bogoCategory: window.__meetyBogoContext?.category || btn?.getAttribute('data-bogo-category'),
      giftDetails: st
    });

    console.log(LOG_PREFIX, 'Sending payload to cart:', JSON.stringify(payload, null, 2));
    console.log(LOG_PREFIX, '🔍 VERIFY SHOPIFY PROPERTIES IN PAYLOAD:', {
      firstItem: payload.items[0],
      hasShopifyFlag: payload.items[0]?.properties?.['__shopify_send_gift_card_to_recipient'],
      recipientEmail: payload.items[0]?.properties?.['Recipient email'],
      recipientName: payload.items[0]?.properties?.['Recipient name'],
      itemCount: payload.items.length,
      allVariantIds: payload.items.map(item => item.id)
    });
    
    // Enhanced payload validation with detailed logging
    console.log(LOG_PREFIX, '🧪 PAYLOAD DETAILED ANALYSIS:');
    payload.items.forEach((item, index) => {
      console.log(LOG_PREFIX, `  Item ${index + 1}:`, {
        id: item.id,
        quantity: item.quantity,
        propertyCount: Object.keys(item.properties || {}).length,
        isTrackingItem: item.properties?.['BOGO Inventory Tracker'] === 'true',
        isGiftCard: item.properties?.['__shopify_send_gift_card_to_recipient'] === 'true'
      });
    });
    
    // FINAL VALIDATION: Ensure we haven't accidentally overwritten Shopify's required properties
    const shopifyProps = payload.items[0]?.properties || {};
    const validationErrors = [];
    if (shopifyProps['__shopify_send_gift_card_to_recipient'] !== 'true') {
      validationErrors.push('Missing or invalid __shopify_send_gift_card_to_recipient');
    }
    if (!shopifyProps['Recipient email'] || shopifyProps['Recipient email'].trim() === '') {
      validationErrors.push('Missing Recipient email (lowercase e required!)');
    }
    if (shopifyProps['Recipient Email']) {
      validationErrors.push('WARNING: Found "Recipient Email" (capital E) - this will be ignored by Shopify!');
    }
    if (validationErrors.length > 0) {
      console.error(LOG_PREFIX, '❌ SHOPIFY GIFT CARD VALIDATION FAILED:', validationErrors);
    } else {
      console.log(LOG_PREFIX, '✅ Shopify gift card properties validated successfully');
    }
    
    // Use cart verification system for robust cart operations
    try {
      const cartOperation = async () => {
        console.log(LOG_PREFIX, '🚀 Executing cart add operation (queued)...');
        
        // Queue the operation to ensure sequential execution
        return await queueCartOperation(async () => {
          console.log(LOG_PREFIX, '🛒 Cart operation executing (lock acquired)...');
          
          // CRITICAL: Remove any existing gift cards before adding new one
          console.log(LOG_PREFIX, '🧹 Step 1: Cleanup existing gift cards...');
          const cleanupResult = await removeExistingGiftCards();
          
          if (cleanupResult.removed > 0) {
            console.log(LOG_PREFIX, `✅ Removed ${cleanupResult.removed} existing gift card(s) from cart`);
            
            // Show user notification if gift cards were removed
            try {
              const notification = document.createElement('div');
              notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff9800;
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 99999;
                font-size: 14px;
                font-weight: 600;
                animation: slideIn 0.3s ease-out;
              `;
              notification.innerHTML = `
                ℹ️ Previous gift card(s) removed<br>
                <small style="font-weight: 400;">Only one gift card allowed per checkout</small>
              `;
              document.body.appendChild(notification);
              
              setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
              }, 3000);
            } catch (e) {
              console.warn(LOG_PREFIX, 'Could not show cleanup notification:', e);
            }
          }
          
          if (cleanupResult.errors.length > 0 && cleanupResult.removed === 0) {
            console.error(LOG_PREFIX, '⚠️ Cleanup failed completely, but continuing with add. Errors:', cleanupResult.errors);
            // Don't block the add operation, but warn that there may be multiple gift cards
          } else if (cleanupResult.errors.length > 0) {
            console.warn(LOG_PREFIX, '⚠️ Some cleanup errors occurred, but continuing with add:', cleanupResult.errors);
          }
          
          console.log(LOG_PREFIX, '🛒 Step 2: Adding new gift card to cart...');
          const response = await fetchWithTimeout('/cart/add.js', {
            method:'POST',
            headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
            body: JSON.stringify(payload)
          }, 8000);
          
          console.log(LOG_PREFIX, '📡 Cart add response status:', response.status, response.statusText);
          
          if (!response.ok) {
            // Try to get error details from response
            let errorText = '';
            try {
              const errorData = await response.text();
              errorText = errorData;
              console.error(LOG_PREFIX, '❌ Cart add failed - response text:', errorText);
            } catch (e) {
              console.error(LOG_PREFIX, '❌ Cart add failed - could not read error response:', e);
            }
            
            throw new Error(`Cart add failed: ${response.status} ${response.statusText}. ${errorText ? `Details: ${errorText}` : ''}`);
          }
          
          const result = await response.json();
          console.log(LOG_PREFIX, '✅ Cart add successful, result:', result);
          return result;
        }, `gift-card-add-${variantId}-${Date.now()}`);
      };
        
    
    // Extract tracking variant ID for cart verification
    const trackingVariantId = trackingLine?.id || null;
    
    const expectedChanges = {
      itemCountChange: trackingVariantId ? 2 : 1, // Gift card + tracking item
      expectedVariantIds: trackingVariantId ? [variantId, trackingVariantId] : [variantId]
    };
    
    const cartResult = await verifyCartOperation(cartOperation, expectedChanges);
    
    if (!cartResult.success) {
      console.error(LOG_PREFIX, '❌ Cart operation failed verification:', cartResult.reason);
      console.log(LOG_PREFIX, '🔍 Detailed cart verification failure:', cartResult);
      
      // Check if the operation actually succeeded despite verification failure
      // This can happen if CSS rules hide tracking products or timing issues occur
      if (cartResult.operationResult && cartResult.operationResult.items) {
        const addedItems = cartResult.operationResult.items;
        const hasGiftCard = addedItems.some(item => 
          String(item.variant_id || item.id) === String(variantId)
        );
        const hasTrackingProduct = trackingVariantId ? addedItems.some(item => 
          String(item.variant_id || item.id) === String(trackingVariantId)
        ) : true; // If no tracking expected, consider it successful
        
        if (hasGiftCard && hasTrackingProduct) {
          console.warn(LOG_PREFIX, '⚠️ Cart verification failed but operation response shows success - proceeding');
          console.log(LOG_PREFIX, '✅ Operation response contained expected items:', {
            giftCardFound: hasGiftCard,
            trackingProductFound: hasTrackingProduct,
            addedItems: addedItems.map(item => ({
              id: item.variant_id || item.id,
              title: item.title,
              properties: item.properties
            }))
          });
          
          // Proceed as if successful since the items were actually added
          const data = cartResult.operationResult;
          console.log(LOG_PREFIX,'✅ Proceeding despite verification failure - items were added successfully');
          // Continue with the rest of the processing...
        } else {
          // Provide more specific error messages to the user
          let userMessage = 'There was an issue adding the gift card to your cart.';
          
          if (cartResult.reason && cartResult.reason.includes('Operation failed:')) {
            // Extract the actual error from Shopify
            const errorMatch = cartResult.reason.match(/Operation failed: (.+)/);
            if (errorMatch) {
              const shopifyError = errorMatch[1];
              
              // Common Shopify errors and user-friendly messages
              if (shopifyError.includes('404')) {
                userMessage = 'The gift card product could not be found. Please try again or contact support.';
              } else if (shopifyError.includes('422') || shopifyError.includes('Unprocessable')) {
                userMessage = 'Invalid gift card data. Please check your information and try again.';
              } else if (shopifyError.includes('inventory')) {
                userMessage = 'This gift card is currently out of stock. Please try a different option.';
              } else if (shopifyError.includes('variant')) {
                userMessage = 'The selected gift card option is not available. Please try a different option.';
              } else {
                userMessage = `Gift card could not be added: ${shopifyError}`;
              }
            }
          } else if (cartResult.reason && cartResult.reason.includes('Item count change mismatch')) {
            userMessage = 'The gift card was not added to your cart. This may be due to inventory issues or invalid product configuration.';
          } else if (cartResult.reason && cartResult.reason.includes('Expected variants not found')) {
            userMessage = 'The gift card was added but verification failed. Please check your cart to confirm.';
          }
          
          alert(userMessage);
          return;
        }
      } else {
        // No operation result to check - operation truly failed
        let userMessage = 'There was an issue adding the gift card to your cart.';
        
        if (cartResult.reason && cartResult.reason.includes('Operation failed:')) {
          // Extract the actual error from Shopify
          const errorMatch = cartResult.reason.match(/Operation failed: (.+)/);
          if (errorMatch) {
            const shopifyError = errorMatch[1];
            
            // Common Shopify errors and user-friendly messages
            if (shopifyError.includes('404')) {
              userMessage = 'The gift card product could not be found. Please try again or contact support.';
            } else if (shopifyError.includes('422') || shopifyError.includes('Unprocessable')) {
              userMessage = 'Invalid gift card data. Please check your information and try again.';
            } else if (shopifyError.includes('inventory')) {
              userMessage = 'This gift card is currently out of stock. Please try a different option.';
            } else if (shopifyError.includes('variant')) {
              userMessage = 'The selected gift card option is not available. Please try a different option.';
            } else {
              userMessage = `Gift card could not be added: ${shopifyError}`;
            }
          }
        } else if (cartResult.reason && cartResult.reason.includes('Item count change mismatch')) {
          userMessage = 'The gift card was not added to your cart. This may be due to inventory issues or invalid product configuration.';
        }
        
        alert(userMessage);
        return;
      }
    }
    
    const data = cartResult.operationResult;
    console.log(LOG_PREFIX,'✅ Verified gift + tracking add success', data);
    console.log(LOG_PREFIX,'Cart response items:', JSON.stringify(data.items || data, null, 2));
    
    // Watch for cart drawer to open, then show success modal
    const buttonId = btn?.id || 'unknown';
    const showSuccessModal = () => {
      console.log(LOG_PREFIX, '🎉 Showing success modal');
      
      // Remove the loading overlay first
      const loadingOverlay = document.getElementById(`gift-card-loading-overlay-${buttonId}`);
      if (loadingOverlay) {
        console.log(LOG_PREFIX, '🧹 Removing loading overlay');
        loadingOverlay.remove();
      }
      
      // Create a fresh overlay for the success modal
      const overlay = document.createElement('div');
      overlay.id = `gift-card-success-overlay-${buttonId}`;
      document.body.appendChild(overlay);
      
      if (overlay) {
        overlay.innerHTML = `
          <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999999; 
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
          ">
            <div style="
              background: white;
              padding: 40px 50px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              text-align: center;
              max-width: 400px;
              position: relative;
              animation: successPop 0.3s ease-out;
            ">
              <button onclick="document.getElementById('gift-card-success-overlay-${buttonId}').remove(); window.location.reload();" style="
                position: absolute;
                top: 15px;
                right: 15px;
                background: #f0f0f0;
                border: none;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                color: #666;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
              " onmouseover="this.style.background='#e0e0e0'; this.style.color='#333';" onmouseout="this.style.background='#f0f0f0'; this.style.color='#666';">×</button>
              
              <div style="
                width: 80px;
                height: 80px;
                margin: 0 auto 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
              ">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: checkmarkDraw 0.5s ease-out 0.2s both;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              
              <h3 style="
                margin: 0 0 10px;
                font-size: 22px;
                font-weight: 600;
                color: #333;
              ">✅ Added to Cart!</h3>
              
              <p style="
                margin: 0 0 20px;
                font-size: 14px;
                color: #666;
                line-height: 1.5;
              ">Your gift card has been successfully added to your cart.</p>
              
              <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="document.getElementById('gift-card-success-overlay-${buttonId}').remove(); window.location.reload();" style="
                  padding: 12px 24px;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  border: none;
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.3s ease;
                  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)';">
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
          <style>
            @keyframes successPop {
              0% { 
                transform: scale(0.8);
                opacity: 0;
              }
              50% {
                transform: scale(1.05);
              }
              100% { 
                transform: scale(1);
                opacity: 1;
              }
            }
            @keyframes checkmarkDraw {
              0% {
                stroke-dasharray: 0, 100;
                opacity: 0;
              }
              100% {
                stroke-dasharray: 100, 100;
                opacity: 1;
              }
            }
          </style>
        `;
      }
    };
    
    // Watch for cart drawer to open
    try {
      const cartDrawer = document.getElementById('CartDrawer');
      if (cartDrawer) {
        console.log(LOG_PREFIX, '👀 Setting up cart drawer observer');
        
        // Check if it's already open
        if (cartDrawer.classList.contains('js-drawer-open')) {
          console.log(LOG_PREFIX, '🛒 Cart drawer already open, showing success modal');
          showSuccessModal();
        } else {
          // Create observer to watch for class changes
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (cartDrawer.classList.contains('js-drawer-open')) {
                  console.log(LOG_PREFIX, '🛒 Cart drawer opened, showing success modal');
                  showSuccessModal();
                  observer.disconnect(); // Stop observing after success
                }
              }
            });
          });
          
          observer.observe(cartDrawer, {
            attributes: true,
            attributeFilter: ['class']
          });
          
          console.log(LOG_PREFIX, '✅ Cart drawer observer active');
          
          // Fallback: if cart drawer doesn't open within 2 seconds, show modal anyway
          setTimeout(() => {
            const successOverlay = document.getElementById(`gift-card-success-overlay-${buttonId}`);
            if (!successOverlay) {
              console.log(LOG_PREFIX, '⏱️ Cart drawer timeout, showing success modal');
              showSuccessModal();
              observer.disconnect();
            }
          }, 2000);
        }
      } else {
        console.warn(LOG_PREFIX, '⚠️ Cart drawer not found, showing success modal immediately');
        showSuccessModal();
      }
    } catch (e) {
      console.error(LOG_PREFIX, '❌ Error setting up cart drawer observer:', e);
      showSuccessModal(); // Fallback to immediate display
    }
    
    // Register the gift card ↔ tracking relationship for persistence
    if (window.__pendingTrackingRelationship && data.items) {
      try {
        const giftCardItem = data.items.find(item => 
          String(item.variant_id) === String(variantId) && !item.properties?.['BOGO Inventory Tracker']
        );
        const trackingItem = data.items.find(item => 
          item.properties?.['BOGO Inventory Tracker'] === 'true' && 
          item.properties?.['_Linked Gift Card Variant'] === String(variantId)
        );
        
        if (giftCardItem && trackingItem) {
          const metadata = window.__pendingTrackingRelationship;
          updateTrackingRelationship(giftCardItem.key, trackingItem.key, {
            ...metadata,
            giftCardKey: giftCardItem.key,
            trackingKey: trackingItem.key,
            giftCardTitle: giftCardItem.product_title,
            trackingTitle: trackingItem.product_title
          });
          
          console.log(LOG_PREFIX, '✅ Registered gift card ↔ tracking relationship:', {
            giftCard: giftCardItem.product_title,
            tracking: trackingItem.product_title,
            giftCardKey: giftCardItem.key,
            trackingKey: trackingItem.key
          });
        }
        
        delete window.__pendingTrackingRelationship;
      } catch (e) {
        console.warn(LOG_PREFIX, 'Failed to register tracking relationship:', e);
      }
    }
      
      // Apply fee split to gift card line item if enabled
      try {
        const cfg = window.__meetyDownpayConfig;
        if (cfg && cfg.enabled) {
          // Find the gift card item in the response (not the tracking item)
          const items = Array.isArray(data.items) ? data.items : (data.id ? [data] : []);
          const giftItem = items.find(item => {
            const props = item.properties || {};
            return String(item.variant_id) === String(variantId) && !props['BOGO Inventory Tracker'];
          });
          
          if (giftItem && giftItem.final_price) {
            const ctx = window.__meetyBogoContext;
            const isBogo = ctx && ctx.category && ctx.category !== 'none' && ctx.isGiftPurchase;
            const totalCents = giftItem.final_price; // Shopify returns price in cents
            let baseCents, feeCents;
            
            // For BOGO gift cards: Use the actual service price from context
            // The Shopify variant has fees with 3.9% + $0.30 buffer, so calculate fee as difference
            if (isBogo && ctx.charged && ctx.charged.priceCents) {
              baseCents = ctx.charged.priceCents; // The actual gift face value (e.g., $100, $374, $110)
              feeCents = Math.max(0, totalCents - baseCents); // Fee = Total - Base
              
              console.log(LOG_PREFIX, 'BOGO gift card - using service price from context (3.9% + $0.30 buffer):', {
                contextPriceCents: ctx.charged.priceCents,
                servicePrice: baseCents / 100,
                cartTotal: totalCents / 100,
                calculatedFee: feeCents / 100,
                effectiveRate: ((feeCents / baseCents) * 100).toFixed(2) + '%',
                bufferNote: 'Pricing uses 3.9% + $0.30 (2.9% base + 1% buffer + $0.30 fixed)',
                feeCheck: 'If base is wrong, check what price is in charged variant when BOGO context is created'
              });
            } else {
              // Regular gift cards: Calculate backwards using buffered 3.9% + $0.30 formula
              const flatC = Math.round(cfg.flat * 100); // $0.30 in cents
              const mult = 1 + cfg.percent / 100; // 1.039 (for 3.9%)
              
              baseCents = Math.max(0, Math.round((totalCents - flatC) / mult));
              if (cfg.floorBase) {
                baseCents = Math.floor(baseCents / 100) * 100;
                if (baseCents > totalCents) baseCents = totalCents;
              }
              feeCents = Math.max(0, totalCents - baseCents);
              
              // Log the breakdown for transparency
              const pct = cfg.percent / 100;
              const basePct = (cfg.basePercent || 2.9) / 100;
              const baseFeeCents = Math.round(baseCents * basePct); // 2.9% of base
              const bufferFeeCents = Math.round(baseCents * (pct - basePct)); // 1.0% of base
              
              console.log(LOG_PREFIX, 'Regular gift card - fee breakdown (3.9% + $0.30):', {
                total: totalCents / 100,
                base: baseCents / 100,
                totalFee: feeCents / 100,
                baseFee: baseFeeCents / 100, // 2.9% portion
                bufferFee: bufferFeeCents / 100, // 1.0% buffer portion
                fixedFee: flatC / 100, // $0.30
                formula: `Base = (Total - $${cfg.flat}) / ${mult.toFixed(3)}`
              });
            }
            
            const baseLabel = isBogo ? 'Promotion price' : cfg.baseLabel;
            
            // Update the line item properties via cart update
            const priceSymbol = '$'; // Default to USD
            giftItem.properties = giftItem.properties || {};
            giftItem.properties[baseLabel] = `${priceSymbol}${(baseCents / 100).toFixed(2)}`;
            giftItem.properties[cfg.feeLabel] = `${priceSymbol}${(feeCents / 100).toFixed(2)}`;
            
            console.log(LOG_PREFIX, 'Added fee split to gift card:', {
              isBogo: isBogo,
              label: baseLabel,
              total: totalCents / 100,
              base: baseCents / 100,
              fee: feeCents / 100,
              feeStructure: `${cfg.percent}% + $${cfg.flat} (${cfg.basePercent}% base + ${cfg.bufferPercent}% buffer + $${cfg.flat} fixed)`
            });
            
            // Update cart with new properties
            fetch('/cart/change.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: giftItem.key || giftItem.id,
                properties: giftItem.properties
              })
            }).catch(err => console.warn(LOG_PREFIX, 'Failed to update gift card properties with fee split:', err));
          }
        }
      } catch(feeErr) {
        console.warn(LOG_PREFIX, 'Failed to apply fee split to gift card:', feeErr);
      }
      
      // Mirror attributes at cart level (same logic as before)
      const attrPayload = {
        'Gift Recipient Name': recipientName,
        'Gift Recipient Email': recipientEmail,
        'Gift Recipient Phone': recipientPhone,
        'Gift Card Duration': giftDurationLabel || '',
        'Desired Service Category': desiredService || ''
      };
      try {
        if(st?.giftSubtype) attrPayload['Gift Category'] = st.giftSubtype;
        if(st?.giftGems){
          if(st.giftGems.style) attrPayload['Gift Gems Style'] = st.giftGems.style;
          if(st.giftGems.placement) attrPayload['Gift Gems Placement'] = st.giftGems.placement;
          if(st.giftGems.variantId) attrPayload['Gift Gems Variant ID'] = st.giftGems.variantId;
          if(st.giftGems.variantTitle) attrPayload['Gift Gems Variant Title'] = st.giftGems.variantTitle;
        }
        if(st?.giftWhitening?.variantTitle) attrPayload['Gift Whitening Variant'] = st.giftWhitening.variantTitle;
        if (st?.tattooGiftPurchase) {
          attrPayload['Tattoo Gift Hours'] = st.tattooGiftPurchase.hours || '';
          attrPayload['Tattoo Gift Label'] = st.tattooGiftPurchase.label || '';
        }
        if(st?.giftPiercingFirstSelection){
          attrPayload['Gift Piercing 1'] = st.giftPiercingFirstSelection.title || '';
          attrPayload['Gift Piercing 1 Variant'] = st.giftPiercingFirstSelection.variantId || '';
        }
        if(st?.giftPiercingSecondSelection){
          attrPayload['Gift Piercing 2'] = st.giftPiercingSecondSelection.title || '';
          attrPayload['Gift Piercing 2 Variant'] = st.giftPiercingSecondSelection.variantId || '';
        }
        if(st?.giftPiercingFirstSelection && st?.giftPiercingSecondSelection && st?.piercingGiftVariants){
          const vs = st.piercingGiftVariants;
          const lookup = (id)=> vs.find(v=> String(v.id) === String(id));
          const v1 = lookup(st.giftPiercingFirstSelection.variantId) || {}; const v2 = lookup(st.giftPiercingSecondSelection.variantId) || {};
          const p1 = (v1.price||0)/100; const p2 = (v2.price||0)/100;
          let charged = { title: st.giftPiercingFirstSelection.title, price: p1 };
          let free = { title: st.giftPiercingSecondSelection.title, price: p2 };
          if (p2 > p1){ charged = { title: st.giftPiercingSecondSelection.title, price: p2 }; free = { title: st.giftPiercingFirstSelection.title, price: p1 }; }
          attrPayload['Piercing Gift Summary'] = `${charged.title} ($${charged.price.toFixed(2)}) + ${free.title} (FREE)`;
          attrPayload['Piercing Services'] = attrPayload['Piercing Gift Summary'];
          attrPayload['Free Piercing'] = `${free.title} (FREE)`;
          attrPayload['Charged Piercing'] = `${charged.title} ($${charged.price.toFixed(2)})`;
        }
        if(st?.giftBogoMode && st?.bogoSelection?.chargedVariant){
          attrPayload['Gift BOGO Charged Variant'] = st.bogoSelection.chargedVariant.title;
          if(st.bogoSelection.freeVariant) attrPayload['Gift BOGO Free Variant'] = st.bogoSelection.freeVariant.title + ' (FREE)';
          (st.bogoSelection.extraFreeVariants||[]).forEach((v,i)=>{ attrPayload[`Gift BOGO Extra Free ${i+1}`] = v.title + ' (FREE)'; });
        }
      } catch(e){ console.warn(LOG_PREFIX,'Attr payload build failed', e); }
      updateCartAttributes(attrPayload).catch(err=> console.warn(LOG_PREFIX,'Cart attribute update failed (non-blocking)', err))
        .finally(()=>{
          try { document.dispatchEvent(new CustomEvent('giftcard:added', { detail: { variantId, giftDurationLabel, recipientName } })); } catch(evtErr){ console.warn(LOG_PREFIX,'Custom event dispatch failed', evtErr); }
          try {
            if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.update === 'function') {
              theme.ajaxCart.update(()=> openAjaxCartDrawer());
            } else if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.updateCart === 'function') {
              theme.ajaxCart.updateCart(()=>{ waitForCartDrawerReady(3000).finally(()=> openAjaxCartDrawer()); });
            } else {
              fetch('/cart.js').then(r=>r.json()).then(j=>{ try { document.dispatchEvent(new CustomEvent('cart:refreshed', { detail: j })); } catch(_e){} }).finally(()=> openAjaxCartDrawer());
            }
          } catch(err){ console.warn(LOG_PREFIX,'ajaxCart.update failed', err); openAjaxCartDrawer(); }
        }, 250);
      
    } catch (err) {
      console.error(LOG_PREFIX,'Consolidated add failed', err);
      alert('Error adding gift card to cart. Please try again.');
    }
    }, 'addGiftCardToCart');
  }

  /* Create Shopify Customer for Gift Card Recipient */
  function createGiftCardRecipientCustomer(recipientData) {
    console.log(LOG_PREFIX, 'Creating customer for gift recipient:', recipientData.name);
    
    // Prepare customer data payload
    const customerPayload = {
      firstName: recipientData.name.split(' ')[0] || '',
      lastName: recipientData.name.split(' ').slice(1).join(' ') || '',
      email: recipientData.email,
      phone: recipientData.phone,
      giftType: recipientData.giftType || '',
      bogoCategory: recipientData.bogoCategory || '',
      // Extract additional gift details if available
      giftGems: recipientData.giftDetails?.giftGems || null,
      giftWhitening: recipientData.giftDetails?.giftWhitening || null,
      giftSubtype: recipientData.giftDetails?.giftSubtype || null,
      piercingSelections: {
        first: recipientData.giftDetails?.giftPiercingFirstSelection || null,
        second: recipientData.giftDetails?.giftPiercingSecondSelection || null
      },
      tattooGift: recipientData.giftDetails?.tattooGiftPurchase || null
    };

    // Send to Netlify serverless function
    fetch('https://sideshow-gift.netlify.app/.netlify/functions/create-gift-recipient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(customerPayload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(LOG_PREFIX, 'Gift recipient customer created successfully:', data);
      
      // Optional: Store customer ID for later use
      if (data.customer?.id) {
        window.__giftRecipientCustomerId = data.customer.id;
      }
      
      // Dispatch custom event for other systems to listen to
      try {
        document.dispatchEvent(new CustomEvent('giftRecipient:created', {
          detail: {
            customer: data.customer,
            originalData: recipientData
          }
        }));
      } catch (e) {
        console.warn(LOG_PREFIX, 'Could not dispatch gift recipient event:', e);
      }
    })
    .catch(error => {
      // Silent failure - don't block the gift card purchase if customer creation fails
      // The gift card will still work, just won't have automatic reminders
      console.warn(LOG_PREFIX, 'Gift card customer creation failed (non-blocking):', error.message);
      
      // Only log the error, don't show user-facing alerts for this background process
      try {
        document.dispatchEvent(new CustomEvent('giftRecipientCreationFailed', { 
          detail: { 
            recipientData, 
            error: error.message,
            timestamp: Date.now()
          } 
        }));
      } catch(evtErr) { 
        // Even event dispatch failure should be silent
        console.warn(LOG_PREFIX, 'Failed to dispatch customer creation error event:', evtErr.message);
      }
    });
  }

  /* Update cart attributes (cart-level) */
  function updateCartAttributes(attrObj){
    const payload = { attributes: {} };
    Object.keys(attrObj||{}).forEach(k=>{ if (attrObj[k] != null && attrObj[k] !== '') payload.attributes[k] = String(attrObj[k]); });
    if (!Object.keys(payload.attributes).length) return Promise.resolve();
    return fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r=> r.json()).then(j=>{ console.log(LOG_PREFIX, 'Cart attributes updated', j.attributes); return j; });
  }

  /* Attempt to open AJAX cart drawer / mini cart without a full page redirect */
  function waitForCartDrawerReady(timeoutMs = 3000) {
    const startTime = Date.now();
    return new Promise(resolve => {
      const poll = () => {
        const drawer = document.getElementById('CartDrawer');
        if (!drawer) {
          if (Date.now() - startTime > timeoutMs) {
            console.warn(LOG_PREFIX, 'waitForCartDrawerReady timed out looking for CartDrawer element.');
            return resolve(false);
          }
          return setTimeout(poll, 100);
        }

        const isLoading = drawer.classList.contains('ajaxcart--loading');
        const isLoaded = drawer.classList.contains('ajaxcart--is-loaded');

        // Success condition: drawer is loaded and not in a loading state.
        if (isLoaded && !isLoading) {
          console.log(LOG_PREFIX, 'Cart drawer is in a ready state (loaded).');
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          console.warn(LOG_PREFIX, 'waitForCartDrawerReady timed out. Forcing loading class removal.');
          drawer.classList.remove('ajaxcart--is-loading'); // Force remove loading
          drawer.classList.add('ajaxcart--is-loaded');     // Force add loaded
          resolve(false); // Resolved, but indicating it timed out
        } else {
          setTimeout(poll, 100); // Check again shortly
        }
      };
      poll();
    }).then(ok=>{
      if (!ok){
        // Fallback: force remove loading class so UI isn't stuck
        const d = document.getElementById('CartDrawer');
        if (d){
          d.classList.remove('ajaxcart--is-loading');
        }
      }
      return ok;
    });
  }

  function openAjaxCartDrawer(){
    // Preferred: use theme drawer API so lifecycle + loading classes resolve correctly
    try {
      if (window.timber && timber.RightDrawer && typeof timber.RightDrawer.open === 'function') {
        // Ensure cart markup has been requested at least once
        if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.loadCart === 'function') {
          theme.ajaxCart.loadCart();
        }
        // Open only after ready (but don't block longer than 3s)
        waitForCartDrawerReady(3000).finally(()=>{
          try { timber.RightDrawer.open(); } catch(e) { console.warn(LOG_PREFIX, 'RightDrawer.open error after wait', e); }
          console.log(LOG_PREFIX, 'Opening ajax cart via timber.RightDrawer.open()');
        });
        return;
      }
    } catch(e){ console.warn(LOG_PREFIX, 'timber.RightDrawer.open failed', e); }

    // Secondary: click an existing open button (standard Debutify selector pattern)
    const autoBtn = document.querySelector('.js-drawer-open-button-right[aria-controls="CartDrawer"]');
    if (autoBtn){
      autoBtn.click();
      console.log(LOG_PREFIX, 'Opening ajax cart via right drawer button click');
      return;
    }

    // Direct manipulation fallback (last resort)
    const drawer = document.getElementById('CartDrawer');
    if (drawer){
      drawer.removeAttribute('aria-hidden');
      drawer.classList.add('js-drawer-open');
      // If still in loading state after 2s, remove loading class to avoid stuck spinner
      setTimeout(()=>{
        if (drawer.classList.contains('ajaxcart--is-loading')){
          drawer.classList.remove('ajaxcart--is-loading');
          drawer.classList.add('ajaxcart--is-loaded');
        }
      }, 2000);
      console.log(LOG_PREFIX, 'Opening ajax cart via direct drawer fallback');
      return;
    }

    // Final fallback: show toast
    console.log(LOG_PREFIX, 'No ajax cart mechanics found; showing toast fallback');
    showTemporaryToast('Gift card added to cart');
  }

  function showTemporaryToast(msg){
    if (document.querySelector('.meety-toast')) return; // avoid stacking
    const t = document.createElement('div');
    t.className = 'meety-toast';
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', bottom:'20px', right:'20px', background:'#111', color:'#fff', padding:'12px 16px', borderRadius:'6px', fontSize:'.9rem', zIndex:10001, boxShadow:'0 4px 14px rgba(0,0,0,.25)', opacity:'0', transition:'opacity .25s'
    });
    document.body.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity='1'; });
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=> t.remove(), 350); }, 3500);
  }

  /* Step 1 with parsed modes */
  function showLoadingSkeleton(st, label='Loading services…'){
    st.menuSlot.innerHTML = '';
    const r = document.createElement('div'); r.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const d = document.createElement('div'); d.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#ddd;animation:meetyPulse 1s infinite;';
    const t = document.createElement('div'); t.textContent = label; t.style.cssText = 'font-size:.95rem;color:#666;';
    const sk1 = document.createElement('div'); sk1.style.cssText = 'height:40px;border-radius:6px;background:#f4f4f4;margin-top:10px;';
    const sk2 = document.createElement('div'); sk2.style.cssText = 'height:40px;border-radius:6px;background:#f4f4f4;margin-top:8px;';
    r.append(d,t); st.menuSlot.append(r, sk1, sk2);
  }

  async function runMirroredServiceStepRobust(st, matchedWidgetEl){
    // Handle tattoo redemption auto-selection first
    const isTattooRedemption = st.giftExistingFlow && st.tattooRedemptionAutoSelect;
    
    // Skip service step when using gift card flow or BOGO flow and go straight to calendar
    // Exception: Don't skip for tattoo redemption as we need auto-selection
    if (st.skipServiceStep || (st.giftExistingFlow && !isTattooRedemption) || st.bogoDetails) {
      showStepCalendar(st); 
      return;
    }
    
    // For tattoo redemption, do silent auto-selection without showing service step UI
    if (isTattooRedemption) {
      console.log(LOG_PREFIX, 'Tattoo redemption: performing silent auto-selection');
      const autoSelected = await performSilentTattooAutoSelection(st, matchedWidgetEl);
      if (autoSelected) {
        console.log(LOG_PREFIX, 'Tattoo redemption: silent auto-selection successful, advancing to calendar');
        showStepCalendar(st);
        return;
      } else {
        console.warn(LOG_PREFIX, 'Tattoo redemption: silent auto-selection failed, falling back to UI');
        // Continue to show service UI as fallback
      }
    }
    
    showStepService(st); showLoadingSkeleton(st);

    const ok = await waitFor(()=>!!getServiceTriggerIn(matchedWidgetEl), 100, 100);
    if (!ok){ showStepCalendar(st); return; }

    const trigger = getServiceTriggerIn(matchedWidgetEl);
    trigger.click();
    const popupReady = await waitFor(()=>getAnyOpenMeetyPopup(), 25, 80);
    if (!popupReady){ showStepCalendar(st); return; }

    const popup = getAnyOpenMeetyPopup();
    popup.style.opacity = '0'; popup.style.visibility = 'hidden'; popup.style.pointerEvents = 'none';

    const collected = [];
    const pump = () => {
      const items = Array.from(popup.querySelectorAll('.meety-select-item'));
      let added = false;
      items.forEach((el, i) => {
        const text = normalizeTxt(el.textContent);
        if (text && !collected.some(o=>o.text===text)){
          collected.push({ text, index:i }); // preserve Meety order
          added = true;
        }
      });
      if (added) renderServiceUI(st, trigger, collected);
    };
    pump();
    const mo = new MutationObserver(pump);
    mo.observe(popup, { childList:true, subtree:true });
    await sleep(300);
    mo.disconnect();

    if (!collected.length){ 
      showStepCalendar(st); 
    } else {
      // Render normal service UI (tattoo redemption is handled silently earlier)
      renderServiceUI(st, trigger, collected);
    }
  }

  function renderServiceUI(st, trigger, options){
    st.menuSlot.innerHTML = '';
    const mode = (st.serviceUiMode || 'buttons');

    if (mode === 'piercings-categories') {
      const cats = parseCats(st.piercingCatsRaw);
      const parsed = analyzePiercings(options, cats, st);
      if (parsed.anyFound) return renderPiercingsUI(st, trigger, parsed, cats);
      // fallback if nothing matched
    }

    if (mode !== 'parsed-dropdown') {
      // Buttons UI (default)
      options.forEach(opt=>{
        const b = document.createElement('button');
        b.textContent = opt.text;
        b.style.cssText = 'padding:.6rem .9rem;border-radius:6px;border:1px solid #111;background:#111;color:#fff;cursor:pointer;text-align:left;';
        b.addEventListener('click', async () => {
          const ok = await chooseServiceByText(trigger, opt.text);
          if (ok) showStepCalendar(st);
        });
        st.menuSlot.appendChild(b);
      });
      return;
    }

    // ===== Parsed dropdown UI (generic parentheses groups) =====
    const parsed = options.map(o => ({ raw:o.text, groups: parseParentheticalGroups(o.text) })).filter(x=>x.groups.length);
    if (!parsed.length){
      st.serviceUiMode = 'buttons';
      return renderServiceUI(st, trigger, options);
    }
    const order = parsed[0].groups.map(g => g.key);
    const valueArrays = new Map();
    order.forEach(k => valueArrays.set(k, []));
    parsed.forEach(p => {
      p.groups.forEach(g => {
        if (!valueArrays.has(g.key)) valueArrays.set(g.key, []);
        const arr = valueArrays.get(g.key);
        if (!arr.includes(g.val)) arr.push(g.val);
      });
    });

    const controls = document.createElement('div'); controls.className = 'meety-row';
    const selects = [];

    order.forEach(key => {
      const label = document.createElement('label'); label.textContent = key + ':';
      const sel = document.createElement('select'); sel.className = 'meety-select'; sel.dataset.key = key;
      const vals = valueArrays.get(key) || [];
      vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
      controls.append(label, sel);
      selects.push(sel);
    });

    // Smart defaults
    (function setDropdownDefaults(){
      const toMap = (raw) => {
        const groups = parseParentheticalGroups(raw || '');
        return new Map(groups.map(g => [g.key, g.val]));
      };
      const currentRaw = normalizeTxt(trigger.querySelector('.meety-text')?.textContent || '');
      const firstRaw   = (options && options.length ? options[0].text : '') || '';
      const sourceMap  = (currentRaw && parseParentheticalGroups(currentRaw).length) ? toMap(currentRaw)
                        : (firstRaw && parseParentheticalGroups(firstRaw).length) ? toMap(firstRaw)
                        : null;
      if (sourceMap) {
        selects.forEach(sel => {
          const want = sourceMap.get(sel.dataset.key);
          if (!want) return;
          const opt = Array.from(sel.options).find(o => normalizeTxt(o.value) === normalizeTxt(want));
          if (opt) sel.value = opt.value;
        });
      }
    })();

    const go = document.createElement('button'); go.className = 'meety-continue-btn primary'; go.textContent = 'Continue';
    go.addEventListener('click', async ()=>{
      const pick = order.map(k => `(${k}) ${selects.find(s=>s.dataset.key===k).value}`).join(' / ');
      const ok = await chooseServiceByText(trigger, pick);
      if (ok) showStepCalendar(st);
    });

    st.menuSlot.append(controls, go);
  }

  /* ===== New: Piercings parsing mode ===== */
  function parseCats(raw){
    // Expect "Ear|Facial|Oral|Body|Vulvar|Penile"
    return raw.split('|').map(s => normalizeTxt(s)).filter(Boolean);
  }
  function buildCatRegex(cats){
    // Create regex to find "(Ear)" anywhere (case-insensitive)
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\((?:${cats.map(esc).join('|')})\\)`, 'i');
  }
  function findFirstCat(text, cats){
    // Return {cat, token, index} or null
    const re = buildCatRegex(cats);
    const m = re.exec(text);
    if (!m) return null;
    const token = m[0]; // like "(Ear)"
    const inner = token.slice(1,-1);
    // Map to canonical capitalization from cats (case-insensitive)
    const catCanon = cats.find(c => c.toLowerCase() === inner.toLowerCase()) || inner;
    return { cat: catCanon, token, index: m.index };
  }
  function stripToken(text, token){
    return normalizeTxt(text.replace(token, '').replace(/\s{2,}/g,' '));
  }
  function splitPromoKeys(raw){
    // comma-separated keywords, case-insensitive; '#' means none
    const arr = (raw||'').split(',').map(s => normalizeTxt(s)).filter(Boolean);
    return (arr.length && arr[0] !== '#') ? arr : [];
  }
  function hasPromo(text, keys){
    if (!keys.length) return false;
    const low = text.toLowerCase();
    return keys.some(k => low.includes(k.toLowerCase()));
  }

  function analyzePiercings(options, cats, st){
    const keys = splitPromoKeys(st.promoKeysRaw);
    const out = [];
    let anyFound = false;

    options.forEach(o => {
      const t = o.text;
      const hit = findFirstCat(t, cats);
      if (!hit){
        // keep non-matching in a special "All/Other" bucket if desired (we won't display unless user chooses All)
        out.push({ original: t, base: t, cat: 'Other', promo: hasPromo(t, keys) });
        return;
      }
      anyFound = true;
      const base = stripToken(t, hit.token);
      out.push({ original: t, base, cat: hit.cat, promo: hasPromo(t, keys) });
    });

    return { items: out, anyFound, promoKeys: keys };
  }

  function renderPiercingsUI(st, trigger, parsed, cats){
  st.menuSlot.innerHTML = '';

  // Unique categories present (respect configured order)
  const present = [];
  cats.forEach(c => {
    if (parsed.items.some(it => it.cat.toLowerCase() === c.toLowerCase())) present.push(c);
  });
  if (parsed.items.some(it => it.cat === 'Other')) present.push('Other');

  // Row 1: Piercing Type
  const row1 = document.createElement('div'); row1.className = 'meety-row';
  const lab1 = document.createElement('label'); lab1.textContent = 'Piercing Type:';
  const selType = document.createElement('select'); selType.className = 'meety-select'; selType.id = 'piercing-type';
  selType.innerHTML = '<option value="all">All</option>';
  present.forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; selType.appendChild(opt);
  });
  row1.append(lab1, selType);

  // Row 2: Piercing
  const row2 = document.createElement('div'); row2.className = 'meety-row';
  const lab2 = document.createElement('label'); lab2.textContent = 'Piercing:';
  const selOpt = document.createElement('select'); selOpt.className = 'meety-select'; selOpt.id = 'piercing-option';
  row2.append(lab2, selOpt);

  // Promo settings
  const promoMode = st.promoMode; // 'off' | 'include-only' | 'highlight'
  const keys = parsed.promoKeys;

  // Only show a note if promo is actually enabled + has keywords
  let note = null;
  if (promoMode !== 'off' && keys.length){
    note = document.createElement('div');
    note.className = 'meety-note';
    note.textContent = (promoMode === 'include-only')
      ? `Showing promo-eligible items (${keys.join(', ')})`
      : `Promo items highlighted (${keys.join(', ')})`;
  }

  function meetsPromo(it){
    if (promoMode !== 'include-only') return true;
    if (!keys.length) return true;
    return !!it.promo;
  }

  // NEW: when type = All, append "(Category)" to the display text
  function formatDisplay(it, isAll){
    let label = it.base;
    if (promoMode === 'highlight' && it.promo) label = `★ ${label}`;
    if (isAll) label = `${label} (${it.cat})`;
    return label;
  }

  function refreshOptions(){
    const type = selType.value;
    const isAll = type === 'all';
    const filtered = parsed.items.filter(it => (isAll || it.cat === type) && meetsPromo(it));

    selOpt.innerHTML = '';
    filtered.forEach(it => {
      const o = document.createElement('option');
      o.value = it.original;                  // exact Meety text for click-through
      o.textContent = formatDisplay(it, isAll);
      selOpt.appendChild(o);
    });

    if (!filtered.length){
      const o = document.createElement('option'); o.value = ''; o.textContent = 'No options';
      selOpt.appendChild(o);
    }
  }

  selType.addEventListener('change', refreshOptions);
  refreshOptions();

  const go = document.createElement('button'); go.className = 'meety-continue-btn primary'; go.textContent = 'Continue';
  go.addEventListener('click', async ()=>{
    const val = selOpt.value;
    if (!val) return;
    const ok = await chooseServiceByText(trigger, val);
    if (ok) showStepCalendar(st);
  });

  // Append everything (note only if applicable)
  if (note) {
    st.menuSlot.append(row1, row2, go, note);
  } else {
    st.menuSlot.append(row1, row2, go);
  }
}

  /* ===== Generic parentheses groups (existing mode) ===== */
  function parseParentheticalGroups(text){
    const groups = [];
    const re = /\(([^)]+)\)\s*([^/]+?)(?=\s*\/|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = normalizeTxt(m[1]);
      const val = normalizeTxt(m[2]);
      if (key && val) groups.push({key, val});
    }
    return groups;
  }

  async function chooseServiceByText(trigger, targetText){
    if (!getAnyOpenMeetyPopup()){
      trigger.click();
      const ok = await waitFor(()=>getAnyOpenMeetyPopup(), 10, 80);
      if(!ok) return false;
      const p = getAnyOpenMeetyPopup(); p.style.opacity = '0'; p.style.visibility='hidden'; p.style.pointerEvents='none';
    }
    const popup = getAnyOpenMeetyPopup();
    const items = Array.from(popup.querySelectorAll('.meety-select-item'));
    if (!items.length) return false;
    const item = items.find(el => normalizeTxt(el.textContent) === normalizeTxt(targetText)) || items[0];

    item.click();
    const closed = await waitFor(()=>!getAnyOpenMeetyPopup(), 12, 100);
    const labelUpdated = await waitFor(()=>{
      const txtEl = trigger.querySelector('.meety-text');
      return txtEl && normalizeTxt(txtEl.textContent) === normalizeTxt(targetText);
    }, 40, 50);
    return closed || labelUpdated;
  }

  /* Wire buttons + extra triggers */
  function splitHrefList(raw){
    if (!raw) return [];
    const div = document.createElement('div'); div.innerHTML = raw;
    const decoded = div.textContent || div.innerText || raw;
    return decoded.split(',').map(s => s.trim()).filter(Boolean);
  }
  const btns = Array.from(document.querySelectorAll('.meety-open-btn'));
  btns.forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.preventDefault(); handleOpenFromButton(btn); });

    const hrefs = splitHrefList(btn.getAttribute('data-extra-hrefs'));
    hrefs.forEach(hrefValue=>{
      const links = Array.from(document.querySelectorAll(`a[href="${hrefValue.replace(/"/g,'\\"')}"]`));
      links.forEach(link=>{
        if (link.dataset.meetyWired === '1') return;
        link.dataset.meetyWired = '1';
        link.addEventListener('click', (e)=>{
          e.preventDefault();
          handleOpenFromButton(btn);
        });
      });
    });
  });

  window.addEventListener('hashchange', ()=>{ const o=getMeetyOverlay(); o && o.click?.(); });
  window.addEventListener('scroll', ()=>{ const o=getMeetyOverlay(); o && o.click?.(); }, { passive:true });
});

/* Hide stray '#' notes anywhere in the Meety overlay */
document.addEventListener('DOMContentLoaded', () => {
  const hideHashNote = (el) => {
    if (!el) return;
    const t = (el.textContent || '').trim();
    if (!t || t === '#') { el.style.display = 'none'; el.textContent = ''; }
  };
  const sweep = (root = document) => root.querySelectorAll('.meety-note').forEach(hideHashNote);

  // initial
  sweep();

  // when a Meety button opens an overlay
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.meety-open-btn')) return;
    setTimeout(() => sweep(document.body), 0);
    setTimeout(() => sweep(document.body), 200);
  });

  // catch dynamically added notes
  new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('.meety-note')) hideHashNote(n);
        n.querySelectorAll?.('.meety-note').forEach(hideHashNote);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
});

/* =============================================================
 * Combined BOGO + Downpayment Line-Item Property Injection
 * Adds (configurable) Downpayment + Fee split AND BOGO free-service properties
 * to any /cart/add or /cart/add.js POST request.
 * ============================================================= */
(function(){
  const TAG = '[MeetyGiftDebug][BOGO-LINE]';
  if (window.__meetyBogoLinePatched) return; // idempotent
  window.__meetyBogoLinePatched = true;

  // Harvest downpayment config from first enabled button (implements enable toggle & labels)
  function harvestDownpay(){
    if (window.__meetyDownpayConfig && window.__meetyDownpayConfig.locked) return;
    const btn = document.querySelector('.meety-open-btn[data-downpay-enabled="true"]');
    if (!btn) return;
    let rawDisclaimer = btn.getAttribute('data-downpay-disclaimer') || '';
    if (rawDisclaimer === '#auto') rawDisclaimer = '';
    
    // Fee structure with +1% buffer applied
    // Base card rate: 2.9% + $0.30
    // Buffer: +1.0%
    // Total used for pricing: 3.9% + $0.30
    const basePercent = 2.9;  // Actual card processor rate
    const bufferPercent = 1.0; // Our protection buffer
    const totalPercent = parseFloat(btn.getAttribute('data-downpay-percent')||'3.9') || 3.9; // Default to buffered rate
    
    window.__meetyDownpayConfig = {
      enabled: true,
      baseLabel: btn.getAttribute('data-downpay-base-label') || 'Booking price',
      feeLabel: btn.getAttribute('data-downpay-fee-label') || 'Card Fee',
      percent: totalPercent, // Total fee % including buffer (default 3.9%)
      basePercent: basePercent, // Actual card rate (2.9%)
      bufferPercent: bufferPercent, // Buffer (1.0%)
      flat: parseFloat(btn.getAttribute('data-downpay-flat')||'0.30') || 0,
      floorBase: (btn.getAttribute('data-downpay-floor') === 'true'),
      disclaimer: rawDisclaimer,
      lastTotal: null
    };
    // Update any visible fees disclaimer text if provided
    try {
      if (window.__meetyDownpayConfig.disclaimer) {
        document.querySelectorAll('.meety-fees-disclaimer').forEach(el=>{ el.textContent = window.__meetyDownpayConfig.disclaimer; });
      } else if (document.querySelector('.meety-fees-disclaimer')) {
        document.querySelectorAll('.meety-fees-disclaimer').forEach(el=>{ if(!el.dataset.defaultSet){ el.dataset.defaultSet='1'; el.textContent = `Card rates starting at ${window.__meetyDownpayConfig.percent}% + $${window.__meetyDownpayConfig.flat.toFixed(2)}`; } });
      }
    } catch(e){ console.warn(TAG,'Fee disclaimer update failed', e); }
  }
  harvestDownpay();
  document.addEventListener('click', e=>{ if (e.target.closest('.meety-open-btn')) setTimeout(harvestDownpay, 50); });

  /* === FEE CALCULATION UTILITIES === 
   * Complete bidirectional fee conversion system
   * Uses buffered rate: 3.9% + $0.30 (2.9% base + 1% buffer + $0.30)
   */
  
  // Break down a sticker price into base fee, buffer fee, fixed fee, and net
  // Works BACKWARDS from total charged to calculate net and fees
  // MODEL: Fees are calculated as % of STICKER price (not net)
  // Base fee = Sticker × 2.9%, Buffer fee = Sticker × 1.0%, Fixed = $0.30
  function feeBreakdown(stickerDollars, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return null;
    
    // Use integer math to prevent rounding errors
    const stickerCents = Math.round(stickerDollars * 100);
    const basePct = Math.round((cfg.basePercent || 2.9) * 100); // 290 basis points
    const bufferPct = Math.round((cfg.bufferPercent || 1.0) * 100); // 100 basis points
    const fixedCents = Math.round((cfg.flat || 0.30) * 100); // 30 cents
    
    // Calculate fees as percentages of STICKER price using integer math
    const baseFeeCents = Math.round(stickerCents * basePct / 10000); // 2.9% of sticker
    const bufferFeeCents = Math.round(stickerCents * bufferPct / 10000); // 1.0% of sticker
    const totalFeesCalculatedCents = baseFeeCents + bufferFeeCents + fixedCents;
    
    // Calculate net BEFORE flooring
    const netBeforeFloorCents = stickerCents - totalFeesCalculatedCents;
    
    // Apply flooring if configured (round down to nearest dollar)
    const netCents = cfg.floorBase ? Math.floor(netBeforeFloorCents / 100) * 100 : netBeforeFloorCents;
    
    // Calculate the ACTUAL total fee (what was actually charged)
    const totalFeeCents = stickerCents - netCents;
    
    // The difference between actual and calculated fees is due to flooring
    const flooringAdjustmentCents = totalFeeCents - totalFeesCalculatedCents;
    
    // Convert back to dollars with proper rounding
    const result = {
      sticker: Math.round(stickerCents) / 100,
      baseFee: Math.round(baseFeeCents) / 100,
      bufferFee: Math.round(bufferFeeCents) / 100,
      fixedFee: Math.round(fixedCents) / 100,
      totalFee: Math.round(totalFeeCents) / 100,
      net: Math.round(netCents) / 100,
      netBeforeFloor: Math.round(netBeforeFloorCents) / 100,
      flooringAdjustment: Math.round(flooringAdjustmentCents) / 100
    };
    
    // Breakdown summary for logging
    result.breakdown = `Fee: $${result.totalFee.toFixed(2)} = $${result.baseFee.toFixed(2)} (2.9% of sticker) + $${result.bufferFee.toFixed(2)} (1% of sticker) + $${result.fixedFee.toFixed(2)} (fixed)${result.flooringAdjustment !== 0 ? ` + $${result.flooringAdjustment.toFixed(2)} (floor adj)` : ''} | Net: $${result.net.toFixed(2)}`;
    
    return result;
  }
  
  // Calculate sticker price from a target net (what you want to keep after fees)
  function stickerFromNet(netDollars, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return null;
    
    const pct = cfg.percent / 100; // e.g., 0.039
    const fixed = cfg.flat || 0.30;
    
    // Formula: Sticker = (Net + Fixed) / (1 - Percent)
    const sticker = (netDollars + fixed) / (1 - pct);
    
    return +sticker.toFixed(2);
  }
  
  // Round up to next .49 (for consistent pricing strategy)
  function roundUpTo49(dollars) {
    const floorDollars = Math.floor(dollars);
    const candidate = floorDollars + 0.49;
    
    // If candidate is >= original, use it; otherwise go to next dollar + 0.49
    return candidate >= dollars ? +candidate.toFixed(2) : +(floorDollars + 1 + 0.49).toFixed(2);
  }
  
  // Calculate full price from 20% deposit sticker (with fees already included)
  function fullPriceFromDeposit(depositSticker, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return null;
    
    const pct = cfg.percent / 100;
    const fixed = cfg.flat || 0.30;
    
    // Step 1: Extract net from deposit (deposit is 20% with fees already in)
    const depositNet = depositSticker - (depositSticker * pct) - fixed;
    
    // Step 2: Calculate full net (deposit net / 0.20)
    const fullNet = depositNet / 0.20;
    
    // Step 3: Calculate full sticker with fees
    const fullSticker = (fullNet + fixed) / (1 - pct);
    
    return {
      depositSticker: +depositSticker.toFixed(2),
      depositNet: +depositNet.toFixed(2),
      fullNet: +fullNet.toFixed(2),
      fullSticker: +fullSticker.toFixed(2)
    };
  }
  
  // Calculate deposit (20%) from full service price
  function depositFromFullPrice(fullNet, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return null;
    
    const pct = cfg.percent / 100;
    const fixed = cfg.flat || 0.30;
    
    // Step 1: Calculate 20% of full net
    const depositNet = fullNet * 0.20;
    
    // Step 2: Add fees to get deposit sticker
    const depositSticker = (depositNet + fixed) / (1 - pct);
    
    return {
      fullNet: +fullNet.toFixed(2),
      depositNet: +depositNet.toFixed(2),
      depositSticker: +depositSticker.toFixed(2)
    };
  }
  
  // Enhanced computeSplit with buffer breakdown
  function computeSplitEnhanced(totalCents, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return computeSplit(totalCents, cfg); // Fallback to legacy
    
    const totalDollars = totalCents / 100;
    const breakdown = feeBreakdown(totalDollars, cfg);
    
    if (!breakdown) return computeSplit(totalCents, cfg); // Fallback
    
    return {
      baseCents: Math.round(breakdown.net * 100),
      feeCents: Math.round(breakdown.totalFee * 100),
      // Additional breakdown details
      baseFeeCents: Math.round(breakdown.baseFee * 100), // 2.9% portion
      bufferFeeCents: Math.round(breakdown.bufferFee * 100), // 1.0% portion
      fixedFeeCents: Math.round(breakdown.fixedFee * 100), // $0.30 portion
      breakdown: breakdown.breakdown
    };
  }
  
  // Log fee calculation for debugging
  function logFeeCalculation(label, value, cfg) {
    cfg = cfg || window.__meetyDownpayConfig;
    if (!cfg) return;
    
    console.log(`%c[FEE CALC: ${label}]`, 'color:#4CAF50;font-weight:bold', {
      input: value,
      config: {
        totalRate: cfg.percent + '%',
        baseRate: cfg.basePercent + '%',
        bufferRate: cfg.bufferPercent + '%',
        fixed: '$' + cfg.flat
      },
      breakdown: typeof value === 'number' && value > 0 ? feeBreakdown(value, cfg) : 'N/A'
    });
  }

  function isCartAdd(url, method){
    if (!url) return false; const m = String(method||'GET').toUpperCase(); if (m !== 'POST') return false; 
    const result = /\/cart\/(add|add\.js)(\?|$)/i.test(url);
    if (result) {
      console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'Cart add detected:', m, url);
    }
    return result;
  }
  function ensureContextFresh(){ 
    const ctx = window.__meetyBogoContext; 
    console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'ensureContextFresh called. Context exists:', !!ctx, ctx ? 'Category: ' + ctx.category : 'No context');
    if (!ctx) return null; 
    if (Date.now() - (ctx.at||0) > 10*60*1000) {
      console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'Context expired, returning null');
      return null; 
    }
    return ctx; 
  }
  function parseCurrencySimple(text){ if (!text) return null; const m=text.replace(/\s+/g,' ').match(/([$€£])\s*([\d.,]+)\b/); if(!m) return null; let num=m[2]; const lastDot=num.lastIndexOf('.'); const lastComma=num.lastIndexOf(','); if(lastComma>lastDot){ num=num.replace(/\./g,'').replace(',', '.'); } else { num=num.replace(/,/g,''); } const val=Number(num); if(!isFinite(val)) return null; return { symbol:m[1], value:val }; }
  function toCents(n){ return Math.round((Number(n)||0)*100 + Number.EPSILON); }
  function readPopupTotalNode(){ const pr=document.getElementById('popup-root'); if(!pr) return null; const labs=Array.from(pr.querySelectorAll('.meety-text')).filter(el=>{ const t=(el.textContent||'').trim().toLowerCase(); return t==='total:'||t==='total'; }); for(const l of labs){ let sib=l.parentElement && l.parentElement.nextElementSibling ? l.parentElement.nextElementSibling : l.nextElementSibling; const roots=[sib,l.parentElement,l.closest('.meety-inline-grid')].filter(Boolean); for(const r of roots){ const cands=r.querySelectorAll('.meety-text'); for(const c of cands){ if(c.closest('svg')) continue; const p=parseCurrencySimple(c.textContent); if(p) return { symbol:p.symbol, cents: toCents(p.value) }; } } } const all=Array.from(pr.querySelectorAll('.meety-text')); for(let i=all.length-1;i>=0;i--){ const p=parseCurrencySimple(all[i].textContent); if(p) return { symbol:p.symbol, cents: toCents(p.value) }; } return null; }
  
  // Legacy computeSplit - kept for compatibility but updated to use buffered 3.9% rate
  // Formula: Base = (Total - Fixed) / (1 + Percent)
  // With 3.9% + $0.30: Base = (Total - $0.30) / 1.039
  function computeSplit(totalCents, cfg){ 
    const flatC=Math.round(cfg.flat*100); 
    const mult=1+cfg.percent/100; // Now 1.039 instead of 1.029
    let base=Math.max(0, Math.round((totalCents - flatC)/mult)); 
    if(cfg.floorBase){ 
      base=Math.floor(base/100)*100; 
      if(base>totalCents) base=totalCents; 
    } 
    const fee=Math.max(0, totalCents-base); 
    return { baseCents:base, feeCents:fee }; 
  }
  function refreshTotal(){ const cfg=window.__meetyDownpayConfig; if(!cfg?.enabled) return; const hit=readPopupTotalNode(); if(hit) cfg.lastTotal=hit; }
  if (window.__meetyDownpayConfig?.enabled){ const moTarget=document.getElementById('popup-root'); if(moTarget){ const mo=new MutationObserver(()=>refreshTotal()); mo.observe(moTarget,{childList:true,subtree:true,characterData:true}); refreshTotal(); } }

  function injectBogoPropsIntoFormData(fd, ctx){ if(!fd||!ctx) return fd; try { fd.set('properties[BOGO Charged Service]', ctx.charged.title); if(ctx.free) fd.set('properties[BOGO Free Service]', ctx.free.title+' (FREE)'); if(ctx.free2) fd.set('properties[BOGO Free Service 2]', ctx.free2.title+' (FREE)'); fd.set('properties[BOGO Total Savings]', `$${(ctx.savingsCents/100).toFixed(2)}`); if(ctx.category) fd.set('properties[BOGO Category]', ctx.category); ctx.injected=true; console.log(TAG,'Injected BOGO props (FormData) multiFree?', !!ctx.free2); } catch(e){ console.warn(TAG,'FormData inject failed', e); } return fd; }
  function injectBogoPropsIntoJson(obj, ctx){
    if(!obj||!ctx) return obj;
    const shouldSkip = (t)=>{
      if(!t) return true;
      const p=t.properties||{};
      // Skip hidden tracking / inventory lines
      if(p['BOGO Inventory Tracker']==='true' || p['Hidden']==='true') return true;
      return false;
    };
    const add=(t)=>{
      if(shouldSkip(t)) return; // do not decorate tracking variants
      const base={
        'BOGO Charged Service': ctx.charged.title,
        'BOGO Total Savings': `$${(ctx.savingsCents/100).toFixed(2)}`,
        'BOGO Category': ctx.category||''
      };
      if(ctx.free) base['BOGO Free Service'] = ctx.free.title+' (FREE)';
      if(ctx.free2) base['BOGO Free Service 2']=ctx.free2.title+' (FREE)';
      t.properties=Object.assign({}, t.properties||{}, base);
    };
    if(Array.isArray(obj.items)) obj.items.forEach(add); else add(obj);
    ctx.injected=true;
    console.log(TAG,'Injected BOGO props (JSON) multiFree?', !!ctx.free2);
    return obj;
  }

  function addDownpayProps(target, cfg){
    if(!cfg?.enabled) return;
    if(!target) return;
    const p=target.properties||{};
    // Skip tracking / hidden inventory line items
    if(p['BOGO Inventory Tracker']==='true' || p['Hidden']==='true') return;
    
    refreshTotal();
    const t=cfg.lastTotal; if(!t) return;
    
    // Check if this is a BOGO flow
    const ctx = window.__meetyBogoContext;
    const isBogo = ctx && ctx.category && ctx.category !== 'none';
    
    let baseCents, feeCents;
    
    // ALWAYS calculate backwards from total using the enhanced 3.9% + $0.30 formula
    // This ensures consistent fee calculation regardless of flow type
    const split = computeSplitEnhanced(t.cents, cfg);
    baseCents = split.baseCents;
    feeCents = split.feeCents;
    
    console.log('[addDownpayProps] Fee breakdown:', {
      flowType: isBogo ? 'BOGO' : 'Regular',
      isGiftPurchase: ctx?.isGiftPurchase || false,
      isRedemption: ctx?.isRedemption || false,
      total: t.cents / 100,
      base: baseCents / 100,
      totalFee: feeCents / 100,
      baseFee: (split.baseFeeCents || 0) / 100, // 2.9% portion
      bufferFee: (split.bufferFeeCents || 0) / 100, // 1.0% portion
      fixedFee: (split.fixedFeeCents || 0) / 100, // $0.30
      breakdown: split.breakdown || 'N/A'
    });
    
    const baseLabel = isBogo ? 'Promotion price' : cfg.baseLabel;
    
    target.properties = Object.assign({}, target.properties||{}, {
      [baseLabel]: `${t.symbol}${(baseCents/100).toFixed(2)}`,
      [cfg.feeLabel]: `${t.symbol}${(feeCents/100).toFixed(2)}`
    });
  }

  // NEW: Add tracking line item functions for BOGO bookings
  function addBogoTrackingToFormData(fd, ctx) {
    try {
      console.log(TAG, 'addBogoTrackingToFormData called with category:', ctx.category);
      
      // DUPLICATE PREVENTION: Check if tracking already being added elsewhere
      if (ctx.trackingAlreadyAdded) {
        console.log(TAG, '⚠️ PREVENTING DUPLICATE: Tracking already added for this context');
        return;
      }
      
      // Mark that we're adding tracking to prevent duplicates
      ctx.trackingAlreadyAdded = true;
      
      // Handle gems-whitening dual tracking
      if (ctx.category === 'gems-whitening') {
        // For gems-whitening, we need to add tracking for the specific subcategory chosen
        const btn = document.querySelector('.meety-open-btn[data-bogo-category*="gems-whitening"]');
        if (!btn) {
          console.warn(TAG, 'No gems-whitening button found for dual tracking');
          return;
        }
        
        // Determine which subcategory was actually selected
        const st = document.querySelector('.meety-overlay')?.meetyState;
        const subcategory = st?.__gemsWhiteningChosen;
        
        if (subcategory === 'tooth-gems') {
          const trackingVariantId = getTrackingVariantSync('tooth-gems');
          if (trackingVariantId) {
            fd.append('items[][id]', trackingVariantId);
            fd.append('items[][quantity]', '1');
            fd.append('items[][properties][BOGO Inventory Tracker]', 'true');
            fd.append('items[][properties][BOGO Booking Completed]', 'true');
            fd.append('items[][properties][BOGO Category]', 'tooth-gems');
            fd.append('items[][properties][Tracking Item]', 'Tooth Gems BOGO Booking Tracking (Visible for Testing)');
            console.log(TAG, 'Added tooth-gems tracking variant:', trackingVariantId);
          }
        } else if (subcategory === 'teeth-whitening') {
          const trackingVariantId = getTrackingVariantSync('teeth-whitening');
          if (trackingVariantId) {
            fd.append('items[][id]', trackingVariantId);
            fd.append('items[][quantity]', '1');
            fd.append('items[][properties][BOGO Inventory Tracker]', 'true');
            fd.append('items[][properties][BOGO Booking Completed]', 'true');
            fd.append('items[][properties][BOGO Category]', 'teeth-whitening');
            fd.append('items[][properties][Tracking Item]', 'Teeth Whitening BOGO Booking Tracking (Visible for Testing)');
            console.log(TAG, 'Added teeth-whitening tracking variant:', trackingVariantId);
          }
        } else {
          console.warn(TAG, 'Unknown gems-whitening subcategory for tracking:', subcategory);
        }
        return;
      }
      
      // Standard single-category tracking (existing logic)
      const trackingVariantId = getTrackingVariantSync(ctx.category);
      console.log(TAG, 'Got tracking variant ID (sync):', trackingVariantId);
      if (!trackingVariantId) {
        console.warn(TAG, 'No tracking variant ID found for category:', ctx.category);
        return;
      }
      
      // Add as a separate line item in the same request
      fd.append('items[][id]', trackingVariantId);
      fd.append('items[][quantity]', '1');
      fd.append('items[][properties][BOGO Inventory Tracker]', 'true');
      fd.append('items[][properties][BOGO Booking Completed]', 'true');
      fd.append('items[][properties][BOGO Category]', ctx.category || '');
      // TESTING: Make visible to verify tracking works
      fd.append('items[][properties][Tracking Item]', 'BOGO Booking Tracking (Visible for Testing)');
      
      console.log(TAG, 'Successfully added BOGO tracking line item to FormData with variant ID:', trackingVariantId);
    } catch (e) {
      console.warn(TAG, 'Failed to add BOGO tracking to FormData:', e);
    }
  }

  function addBogoTrackingToJson(obj, ctx) {
    try {
      console.log(TAG, 'addBogoTrackingToJson called with category:', ctx.category);
      
      // DUPLICATE PREVENTION: Check if tracking already being added elsewhere
      if (ctx.trackingAlreadyAdded) {
        console.log(TAG, '⚠️ PREVENTING DUPLICATE: Tracking already added for this context');
        return;
      }
      
      // Mark that we're adding tracking to prevent duplicates
      ctx.trackingAlreadyAdded = true;
      
      // Handle gems-whitening dual tracking
      if (ctx.category === 'gems-whitening') {
        const btn = document.querySelector('.meety-open-btn[data-bogo-category*="gems-whitening"]');
        if (!btn) {
          console.warn(TAG, 'No gems-whitening button found for dual tracking');
          return;
        }
        
        // Determine which subcategory was actually selected
        const st = document.querySelector('.meety-overlay')?.meetyState;
        const subcategory = st?.__gemsWhiteningChosen;
        
        if (subcategory === 'tooth-gems') {
          const trackingVariantId = getTrackingVariantSync('tooth-gems');
          if (trackingVariantId) {
            const trackingItem = {
              id: trackingVariantId,
              quantity: 1,
              properties: {
                'BOGO Inventory Tracker': 'true',
                'BOGO Booking Completed': 'true',
                'BOGO Category': 'tooth-gems',
                'Tracking Item': 'Tooth Gems BOGO Booking Tracking (Visible for Testing)'
              }
            };
            
            if (!obj.items) obj.items = [];
            if (!Array.isArray(obj.items)) obj.items = [obj.items];
            obj.items.push(trackingItem);
            console.log(TAG, 'Added tooth-gems tracking variant:', trackingVariantId);
          }
        } else if (subcategory === 'teeth-whitening') {
          const trackingVariantId = getTrackingVariantSync('teeth-whitening');
          if (trackingVariantId) {
            const trackingItem = {
              id: trackingVariantId,
              quantity: 1,
              properties: {
                'BOGO Inventory Tracker': 'true',
                'BOGO Booking Completed': 'true',
                'BOGO Category': 'teeth-whitening',
                'Tracking Item': 'Teeth Whitening BOGO Booking Tracking (Visible for Testing)'
              }
            };
            
            if (!obj.items) obj.items = [];
            if (!Array.isArray(obj.items)) obj.items = [obj.items];
            obj.items.push(trackingItem);
            console.log(TAG, 'Added teeth-whitening tracking variant:', trackingVariantId);
          }
        } else {
          console.warn(TAG, 'Unknown gems-whitening subcategory for tracking:', subcategory);
        }
        return;
      }
      
      // Standard single-category tracking (existing logic)
      const trackingVariantId = getTrackingVariantSync(ctx.category);
      console.log(TAG, 'Got tracking variant ID (sync):', trackingVariantId);
      if (!trackingVariantId) {
        console.warn(TAG, 'No tracking variant ID found for category:', ctx.category);
        return;
      }
      
      const trackingItem = {
        id: trackingVariantId,
        quantity: 1,
        properties: {
          'BOGO Inventory Tracker': 'true',
          'BOGO Booking Completed': 'true',
          'BOGO Category': ctx.category || '',
          // TESTING: Make visible to verify tracking works
          'Tracking Item': 'BOGO Booking Tracking (Visible for Testing)'
        }
      };
      
      // Ensure items array exists and add tracking item
      if (!obj.items) obj.items = [];
      if (!Array.isArray(obj.items)) obj.items = [obj.items];
      
      obj.items.push(trackingItem);
      
      console.log(TAG, 'Successfully added BOGO tracking line item to JSON with variant ID:', trackingVariantId, 'Items array now has:', obj.items.length, 'items');
    } catch (e) {
      console.warn(TAG, 'Failed to add BOGO tracking to JSON:', e);
    }
  }

  async function getTrackingVariantForCategory(category) {
    console.log(TAG, 'getTrackingVariantForCategory called with category:', category);
    // Find button with matching BOGO category
    const btn = document.querySelector('.meety-open-btn[data-bogo-category*="' + category + '"]');
    console.log(TAG, 'Found button with BOGO category:', !!btn, 'Button:', btn);
    if (!btn) {
      console.warn(TAG, 'No button found with BOGO category:', category);
      // Try alternative selector
      const allBtns = document.querySelectorAll('.meety-open-btn');
      console.log(TAG, 'All meety buttons found:', allBtns.length);
      allBtns.forEach((b, i) => {
        console.log(TAG, `Button ${i}:`, b.getAttribute('data-bogo-category'));
      });
      return null;
    }
    
    const handleMap = {
      'piercings': btn.getAttribute('data-bogo-track-piercings'),
      'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'), 
      'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening'),
      'tattoo': btn.getAttribute('data-bogo-track-tattoo')
    };
    
    console.log(TAG, 'Handle map for category', category, ':', handleMap);
    const handle = handleMap[category];
    console.log(TAG, 'Selected handle for', category, ':', handle);
    if (!handle) {
      console.warn(TAG, 'No tracking handle found for category:', category);
      return null;
    }
    
    console.log(TAG, 'Fetching product with handle:', handle);
    const prod = await fetchProductByHandleCached(handle);
    console.log(TAG, 'Product fetched:', !!prod, prod ? `${prod.variants?.length} variants` : 'null');
    
    if (!prod?.variants?.length) {
      console.warn(TAG, 'No product or variants found for handle:', handle);
      return null;
    }
    
    // Return first available variant with inventory management
    const variant = prod.variants.find(v => 
      v.inventory_management && 
      typeof v.inventory_quantity === 'number' && 
      v.inventory_quantity > 0
    ) || prod.variants[0];
    
    console.log(TAG, 'Selected variant:', variant ? `ID: ${variant.id}, Qty: ${variant.inventory_quantity}` : 'null');
    return variant?.id;
  }

  // Synchronous version for use in transformBody (uses cached data)
  function getTrackingVariantSync(category) {
    console.log(TAG, 'getTrackingVariantSync called with category:', category);
    
    // PRIORITY 1: Use button stored in context (most accurate for gift purchases)
    let btn = window.__meetyBogoContext?.buttonElement;
    if (btn) {
      console.log(TAG, '✅ Using button from context:', {
        buttonId: btn.id,
        buttonText: btn.textContent?.trim(),
        storedCategory: btn.getAttribute('data-bogo-category'),
        requestedCategory: category
      });
    } else {
      // FALLBACK: Find button with matching BOGO category (may be incorrect for multiple buttons)
      btn = document.querySelector('.meety-open-btn[data-bogo-category*="' + category + '"]');
      
      // For gems-whitening subcategories, look for the parent gems-whitening button
      if (!btn && (category === 'tooth-gems' || category === 'teeth-whitening')) {
        btn = document.querySelector('.meety-open-btn[data-bogo-category*="gems-whitening"]');
      }
      
      if (btn) {
        console.warn(TAG, '⚠️ Using DOM fallback button (may be incorrect for multiple artists):', {
          buttonId: btn.id,
          buttonText: btn.textContent?.trim()
        });
      }
    }
    
    if (!btn) {
      console.warn(TAG, 'No button found for sync lookup, category:', category);
      return null;
    }

    const handleMap = {
      'piercings': btn.getAttribute('data-bogo-track-piercings'),
      'tooth-gems': btn.getAttribute('data-bogo-track-tooth-gems'), 
      'teeth-whitening': btn.getAttribute('data-bogo-track-teeth-whitening'),
      'tattoo': btn.getAttribute('data-bogo-track-tattoo')
    };
    
    const handle = handleMap[category];
    console.log(TAG, 'Sync handle for', category, ':', handle);
    if (!handle) return null;
    
    // Try to get from cache first
    const cached = getProductCacheSync(handle);
    if (cached?.variants?.length) {
      const variant = cached.variants.find(v => 
        v.inventory_management && 
        typeof v.inventory_quantity === 'number' && 
        v.inventory_quantity > 0
      ) || cached.variants[0];
      
      console.log(TAG, 'Using cached variant for', category, ':', variant ? `ID: ${variant.id}` : 'null');
      return variant?.id;
    }
    
    console.warn(TAG, 'No cached product data for handle:', handle);
    return null;
  }

  // Helper to get product from cache synchronously
  function getProductCacheSync(handle) {
    // Use the same cache as fetchProductByHandleCached
    window.__bogoTrackCache = window.__bogoTrackCache || {};
    const entry = window.__bogoTrackCache[handle];
    
    if (entry && entry.data) {
      console.log(TAG, 'Found cached product for', handle, ':', entry.data.title);
      return entry.data;
    }
    
    console.warn(TAG, 'No cached product found for handle:', handle);
    return null;
  }

  function transformBody(body){ const ctx=ensureContextFresh(); const cfg=window.__meetyDownpayConfig && window.__meetyDownpayConfig.enabled ? window.__meetyDownpayConfig : null; try { 
    // Check if this is a BOGO "Book for Myself" flow (not redemption, not gift purchase)
    const isBogoBooking = ctx && ctx.category && !ctx.isGiftPurchase && !ctx.isRedemption;
    
    console.log(TAG, 'transformBody called:', {
      hasContext: !!ctx,
      contextCategory: ctx?.category,
      isGiftPurchase: ctx?.isGiftPurchase,
      isRedemption: ctx?.isRedemption,
      isBogoBooking: isBogoBooking,
      trackingAlreadyAdded: ctx?.trackingAlreadyAdded,
      bodyType: typeof body
    });
    
    // REDEMPTION FIX VALIDATION: Log when tracking would be skipped for redemptions
    if (ctx && ctx.category && ctx.isRedemption) {
      console.log('%c🎫 REDEMPTION DETECTED', 'color:#00ff00;font-weight:bold', 
        'Skipping gift card tracking for redemption flow - category:', ctx.category);
    }
    
    // GIFT PURCHASE VALIDATION: Log when tracking would be skipped for gift purchases
    if (ctx && ctx.category && ctx.isGiftPurchase) {
      console.log('%c🎁 GIFT PURCHASE DETECTED', 'color:#2196F3;font-weight:bold', 
        'Skipping interceptor tracking for gift purchase - category:', ctx.category, 
        '(Gift purchase flow handles its own tracking)');
    }
    
    // DUPLICATE PREVENTION: Log when tracking already added
    if (ctx && ctx.category && ctx.trackingAlreadyAdded) {
      console.log('%c🚫 DUPLICATE PREVENTION', 'color:#FF9800;font-weight:bold', 
        'Tracking already added for this context - category:', ctx.category);
    }
    
    if(body instanceof FormData){ if(ctx) injectBogoPropsIntoFormData(body, ctx); 
      // NEW: Add tracking line item for BOGO bookings
      if(isBogoBooking) {
        console.log(TAG, 'Adding BOGO tracking to FormData');
        addBogoTrackingToFormData(body, ctx);
      }
      if(cfg){ refreshTotal(); const t=cfg.lastTotal; if(t){ const split=computeSplitEnhanced(t.cents, cfg); body.set(`properties[${cfg.baseLabel}]`, `${t.symbol}${(split.baseCents/100).toFixed(2)}`); body.set(`properties[${cfg.feeLabel}]`, `${t.symbol}${(split.feeCents/100).toFixed(2)}`); console.log(TAG,'FormData booking fee props:', {total: t.cents/100, base: split.baseCents/100, fee: split.feeCents/100, breakdown: split.breakdown}); } } return body; } if(typeof URLSearchParams!=='undefined' && body instanceof URLSearchParams){ if(ctx){ body.set('properties[BOGO Charged Service]', ctx.charged.title); if(ctx.free) body.set('properties[BOGO Free Service]', ctx.free.title+' (FREE)'); if(ctx.free2) body.set('properties[BOGO Free Service 2]', ctx.free2.title+' (FREE)'); body.set('properties[BOGO Total Savings]', `$${(ctx.savingsCents/100).toFixed(2)}`); if(ctx.category) body.set('properties[BOGO Category]', ctx.category); ctx.injected=true; console.log(TAG,'Injected BOGO props (URLSearchParams) multiFree?', !!ctx.free2); } if(cfg){ refreshTotal(); const t=cfg.lastTotal; if(t){ const split=computeSplitEnhanced(t.cents, cfg); body.set(`properties[${cfg.baseLabel}]`, `${t.symbol}${(split.baseCents/100).toFixed(2)}`); body.set(`properties[${cfg.feeLabel}]`, `${t.symbol}${(split.feeCents/100).toFixed(2)}`); console.log(TAG,'URLSearchParams booking fee props:', {total: t.cents/100, base: split.baseCents/100, fee: split.feeCents/100, breakdown: split.breakdown}); } } return body; } if(typeof body==='string'){ const s=body.trim(); const isJSON=(s.startsWith('{')&&s.endsWith('}'))||(s.startsWith('[')&&s.endsWith(']')); if(isJSON){ const parsed=JSON.parse(s||'{}'); if(ctx) injectBogoPropsIntoJson(parsed, ctx); 
          // NEW: Add tracking line item for BOGO bookings (async handled internally)
          if(isBogoBooking) {
            console.log(TAG, 'Adding BOGO tracking to JSON');
            addBogoTrackingToJson(parsed, ctx);
          }
          if(cfg){ if(Array.isArray(parsed.items)) parsed.items.forEach(it=>addDownpayProps(it, cfg)); else addDownpayProps(parsed, cfg); } return JSON.stringify(parsed); } else { const usp=new URLSearchParams(s); transformBody(usp); return usp.toString(); } } if(body && typeof body==='object' && !(body instanceof Blob)){ if(ctx) injectBogoPropsIntoJson(body, ctx); 
        // NEW: Add tracking line item for BOGO bookings
        if(isBogoBooking) addBogoTrackingToJson(body, ctx);
        if(cfg){ if(Array.isArray(body.items)) body.items.forEach(it=>addDownpayProps(it, cfg)); else addDownpayProps(body, cfg); } return body; } } catch(e){ console.warn(TAG,'transformBody error', e); } return body; }

  // Patch fetch
  const _fetch = window.fetch;
  window.fetch = function(resource, init){ try { const url=(typeof resource==='string')?resource:(resource&&resource.url); const method=(init&&init.method)||(resource&&resource.method)||'GET'; if(isCartAdd(url, method)){ if(resource instanceof Request){ return (async()=>{ const cloned=resource.clone(); let bodyTxt=(init && 'body' in init)?init.body:await cloned.text(); const newInit=Object.assign({}, init||{}); newInit.method=cloned.method||method; newInit.headers=new Headers(newInit.headers||cloned.headers||{}); newInit.body=transformBody(bodyTxt); console.log(TAG,'fetch injection applied (Request)'); return _fetch(new Request(url, newInit)); })(); } else if (init && 'body' in init){ init.body=transformBody(init.body); console.log(TAG,'fetch injection applied (init.body)'); } } } catch(e){ console.warn(TAG,'fetch patch error', e); } return _fetch.apply(this, arguments); };

  // Patch XHR
  const _open = XMLHttpRequest.prototype.open; const _send = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.open = function(method, url){ this.__bogoHook = isCartAdd(url, method); this.__bogoUrl=url; return _open.apply(this, arguments); }; XMLHttpRequest.prototype.send = function(body){ try { if (this.__bogoHook){ body = transformBody(body); console.log(TAG,'XHR injection applied', this.__bogoUrl); } } catch(e){ console.warn(TAG,'XHR patch error', e); } return _send.call(this, body); };

  console.log('%c[BOGO-TRACKING]', 'color:#ff6b6b;font-weight:bold', 'BOGO tracking system ready and waiting for cart adds...');
  console.log(TAG,'Combined BOGO + Downpayment injector ready');
  
  // REDEMPTION FIX: Global debug helper to check if redemption protection is working
  window.__debugRedemptionTracking = function() {
    const ctx = window.__meetyBogoContext;
    console.log('%c[REDEMPTION DEBUG]', 'color:#00ff00;font-weight:bold', 'Current BOGO context:', {
      hasContext: !!ctx,
      category: ctx?.category,
      isRedemption: ctx?.isRedemption,
      isGiftPurchase: ctx?.isGiftPurchase,
      wouldAddTracking: !!(ctx && ctx.category && !ctx.isGiftPurchase && !ctx.isRedemption),
      contextDetails: ctx
    });
    
    if (ctx && ctx.category && ctx.isRedemption) {
      console.log('%c✅ REDEMPTION PROTECTION ACTIVE', 'color:#00ff00;font-weight:bold', 
        'Tracking will be skipped for category:', ctx.category);
    } else if (ctx && ctx.category && !ctx.isRedemption && !ctx.isGiftPurchase) {
      console.log('%c⚠️ TRACKING WILL BE ADDED', 'color:#ff9800;font-weight:bold', 
        'This appears to be a booking flow for category:', ctx.category);
    } else if (!ctx || !ctx.category) {
      console.log('%c📋 NO TRACKING CONTEXT', 'color:#666;font-weight:bold', 
        'No BOGO context found - no tracking will be added');
    }
    
    return ctx;
  };
  
  // DUPLICATE FIX: Manual duplicate cleanup function  
  window.__fixDuplicateTracking = async function() {
    console.log('%c[DUPLICATE FIX]', 'color:#FF9800;font-weight:bold', 'Starting manual duplicate cleanup...');
    
    try {
      const result = await removeDuplicateTrackingProducts();
      
      if (result.removed > 0) {
        console.log('%c✅ DUPLICATES FIXED!', 'color:#00ff00;font-weight:bold', 
          `Removed ${result.removed} duplicate tracking products. ${result.kept} tracking products remain.`);
        
        // Force cart refresh
        setTimeout(() => {
          if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.loadCart === 'function') {
            theme.ajaxCart.loadCart();
          }
          document.dispatchEvent(new CustomEvent('cart:refresh'));
        }, 500);
        
        return { success: true, removed: result.removed, kept: result.kept };
      } else {
        console.log('%c✅ NO DUPLICATES FOUND', 'color:#00ff00;font-weight:bold', 
          `Cart is clean - ${result.kept} tracking products found with no duplicates.`);
        return { success: true, removed: 0, kept: result.kept };
      }
    } catch (e) {
      console.error('%c❌ DUPLICATE FIX FAILED', 'color:#f44336;font-weight:bold', e);
      return { success: false, error: e.message };
    }
  };
})();

// Close outer init wrapper
})();

/* =============================================================
 * Cart Tracking Product Management
 * Automatically removes tracking products when gift cards are deleted
 * and hides tracking product animations
 * ============================================================= */
(function(){
  const LOG_PREFIX = '[CART-TRACKING]';
  
  // Enhanced persistence for gift card to tracking product relationships
  const STORAGE_KEY = 'meetyGiftCardTracking';
  const STORAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  // Function to save gift card ↔ tracking relationships to localStorage
  function saveTrackingRelationships(relationships) {
    try {
      const data = {
        timestamp: Date.now(),
        relationships: relationships,
        version: '2.0'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log(LOG_PREFIX, 'Saved tracking relationships to localStorage:', relationships.length, 'items');
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to save tracking relationships:', e);
    }
  }
  
  // Function to load gift card ↔ tracking relationships from localStorage
  function loadTrackingRelationships() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      const data = JSON.parse(stored);
      if (!data.timestamp || (Date.now() - data.timestamp) > STORAGE_TTL) {
        localStorage.removeItem(STORAGE_KEY);
        return [];
      }
      
      console.log(LOG_PREFIX, 'Loaded tracking relationships from localStorage:', data.relationships?.length || 0, 'items');
      return data.relationships || [];
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to load tracking relationships:', e);
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }
  
  // Function to update a single relationship in storage
  function updateTrackingRelationship(giftCardKey, trackingKey, metadata) {
    try {
      const relationships = loadTrackingRelationships();
      const existing = relationships.find(r => r.giftCardKey === giftCardKey);
      
      if (existing) {
        existing.trackingKey = trackingKey;
        existing.metadata = { ...existing.metadata, ...metadata };
        existing.lastUpdated = Date.now();
      } else {
        relationships.push({
          giftCardKey,
          trackingKey,
          metadata,
          created: Date.now(),
          lastUpdated: Date.now()
        });
      }
      
      saveTrackingRelationships(relationships);
    } catch (e) {
      console.warn(LOG_PREFIX, 'Failed to update tracking relationship:', e);
    }
  }
  
  // Track gift card to tracking product relationships
  const giftCardTrackingMap = new Map();
  
  // Function to hide tracking products in the cart UI
  function hideTrackingProducts() {
    // Hide by properties content
    const trackingItems = document.querySelectorAll('*');
    trackingItems.forEach(item => {
      const textContent = item.textContent || '';
      if (textContent.includes('BOGO Inventory Tracker') || 
          textContent.includes('Gift Card Counter') ||
          textContent.includes('COUNTER-')) {
        let cartItem = item.closest('[data-cart-item], .cart-item, .cart__item, .line-item');
        if (cartItem) {
          cartItem.style.display = 'none';
          cartItem.style.visibility = 'hidden';
          cartItem.style.opacity = '0';
          cartItem.style.height = '0';
          cartItem.style.overflow = 'hidden';
          cartItem.style.margin = '0';
          cartItem.style.padding = '0';
        }
      }
    });
  }
  
  // Function to disable quantity controls for gift cards
  function disableGiftCardQuantityControls() {
    // Find all cart items that contain gift cards
    const cartItems = document.querySelectorAll('[data-cart-item], .cart-item, .cart__item, .line-item');
    
    cartItems.forEach(item => {
      const titleElements = item.querySelectorAll('[class*="title"], .product-title, .cart-item__title, .cart__item-title');
      const isGiftCard = Array.from(titleElements).some(el => 
        el.textContent && el.textContent.includes('Gift Card')
      );
      
      if (isGiftCard) {
        // Disable quantity controls
        const quantityControls = item.querySelectorAll(`
          [class*="quantity-selector"],
          [class*="quantity-controls"],
          .cart-item__quantity-controls,
          .quantity-controls,
          .cart__quantity-controls,
          [class*="qty"],
          .qty-controls,
          .quantity-wrapper,
          .js-qty
        `);
        
        quantityControls.forEach(control => {
          control.style.display = 'none';
          control.style.visibility = 'hidden';
          control.style.opacity = '0';
        });
        
        // Disable individual buttons
        const buttons = item.querySelectorAll(`
          button[class*="plus"],
          button[class*="minus"],
          button[class*="increment"],
          button[class*="decrement"],
          .btn--plus,
          .btn--minus,
          .qty-btn,
          [data-quantity-plus],
          [data-quantity-minus]
        `);
        
        buttons.forEach(btn => {
          btn.style.display = 'none';
          btn.style.visibility = 'hidden';
          btn.style.opacity = '0';
          btn.style.pointerEvents = 'none';
          btn.disabled = true;
        });
        
        // Make quantity inputs readonly
        const quantityInputs = item.querySelectorAll(`
          input[name*="quantity"],
          input[class*="quantity"],
          input[class*="qty"],
          .quantity-input
        `);
        
        quantityInputs.forEach(input => {
          input.readOnly = true;
          input.style.pointerEvents = 'none';
          input.style.background = '#f5f5f5';
          input.style.color = '#666';
          input.style.cursor = 'not-allowed';
          
          // Prevent manual editing
          input.addEventListener('keydown', (e) => e.preventDefault());
          input.addEventListener('paste', (e) => e.preventDefault());
          input.addEventListener('input', (e) => {
            // Reset to 1 if someone manages to change it
            if (e.target.value !== '1') {
              e.target.value = '1';
            }
          });
        });
        
        console.log(LOG_PREFIX, 'Disabled quantity controls for gift card item');
      }
    });
  }
  
  // Enhanced function to find and remove tracking products when gift cards are removed
  async function cleanupOrphanedTrackingProducts() {
    try {
      // Check if cleanup is temporarily disabled (e.g., after adding gift cards)
      if (window.__meetyBogoContext?.preventCleanup) {
        console.log(LOG_PREFIX, 'Cleanup temporarily disabled - skipping');
        return;
      }
      
      // Shorter delay for more responsive cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get current cart
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      // Find all gift cards and tracking products
      const giftCards = cart.items.filter(item => item.gift_card === true);
      const trackingProducts = cart.items.filter(item => 
        item.properties && (
          item.properties['BOGO Inventory Tracker'] === 'true' ||
          item.properties['Gift Card Tracking'] ||
          (item.product_title && item.product_title.includes('Gift Card Counter'))
        )
      );
      
      console.log(LOG_PREFIX, 'Enhanced cart cleanup check:', {
        giftCards: giftCards.length,
        trackingProducts: trackingProducts.length,
        giftCardTitles: giftCards.map(gc => gc.product_title),
        trackingTitles: trackingProducts.map(tp => tp.product_title)
      });
      
      // Load stored relationships for additional matching robustness
      const storedRelationships = loadTrackingRelationships();
      console.log(LOG_PREFIX, 'Loaded stored relationships for cleanup:', storedRelationships.length);
      
      // Create robust linking between gift cards and tracking products
      const giftCardTrackingPairs = new Map();
      
      // First, create links based on multiple criteria for robustness
      giftCards.forEach(gc => {
        const gcProductTitle = gc.product_title || '';
        const gcVariantId = gc.variant_id;
        const gcKey = gc.key;
        const gcCategory = gc.properties['Gift Category'] || 
                         gc.properties['Desired Service Category'] ||
                         gc.properties['BOGO Category'];
        const giftCardType = gc.properties['Gift Card Type'] || '';
        
        // Extract artist name from gift card (e.g., "Angelo — Hourly Gift Card")
        const gcArtist = gcProductTitle.includes('—') ? 
          gcProductTitle.split('—')[0]?.trim() : '';
        
        const gcMetadata = {
          key: gcKey,
          variantId: gcVariantId,
          title: gcProductTitle,
          artist: gcArtist,
          category: gcCategory,
          type: giftCardType,
          // Include enhanced properties if available
          session: gc.properties?.['_Gift Card Session'],
          button: gc.properties?.['_Gift Card Button'],
          expectedCategory: gc.properties?.['_Expected Tracking Category']
        };
        
        // Store multiple linking strategies for this gift card
        giftCardTrackingPairs.set(gcKey, {
          giftCard: gcMetadata,
          matchingStrategies: []
        });
        
        console.log(LOG_PREFIX, 'Registered gift card for matching:', gcMetadata);
      });
      
      // Now find tracking products and create robust links
      for (const tracking of trackingProducts) {
        const trackingCategory = tracking.properties['BOGO Category'];
        const trackingProductTitle = tracking.product_title || '';
        const trackingKey = tracking.key;
        const trackingVariantId = tracking.variant_id;
        
        // Extract artist name from tracking product (e.g., "Gift Card Counter — Angelo")
        const trackingArtist = trackingProductTitle.includes('—') ? 
          trackingProductTitle.split('—')[1]?.trim() : 
          trackingProductTitle.replace('Gift Card Counter', '').trim();
        
        console.log(LOG_PREFIX, 'Processing tracking product:', {
          key: trackingKey,
          variantId: trackingVariantId,
          title: trackingProductTitle,
          category: trackingCategory,
          extractedArtist: trackingArtist
        });
        
        let foundMatch = false;
        
        // Try to find matching gift cards using multiple strategies
        for (const [gcKey, pairData] of giftCardTrackingPairs) {
          const gc = pairData.giftCard;
          
          // PRIORITY Strategy: Stored relationship matching (highest confidence)
          const storedMatch = storedRelationships.find(rel => 
            (rel.giftCardKey === gcKey && rel.trackingKey === trackingKey) ||
            (String(rel.giftCardVariantId) === String(gc.variantId) && String(rel.trackingVariantId) === String(trackingVariantId))
          );
          
          if (storedMatch) {
            pairData.matchingStrategies.push({
              strategy: 'stored-relationship',
              confidence: 'maximum',
              trackingKey: trackingKey,
              details: `Stored relationship from localStorage: ${storedMatch.created ? new Date(storedMatch.created).toLocaleString() : 'unknown time'}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'PRIORITY - Stored relationship match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              storedAt: new Date(storedMatch.created || Date.now()).toLocaleString()
            });
          }
          
          // NEW Strategy 0: Direct linking via enhanced properties (highest priority)
          const gcSession = cart.items.find(item => item.key === gcKey)?.properties?.['_Gift Card Session'];
          const trackingSession = tracking.properties['_Gift Card Session'];
          const gcLinkedVariant = cart.items.find(item => item.key === gcKey)?.properties?.['_Linked Gift Card Variant'];
          const trackingLinkedVariant = tracking.properties['_Linked Gift Card Variant'];
          
          if (gcSession && trackingSession && gcSession === trackingSession) {
            pairData.matchingStrategies.push({
              strategy: 'session-link',
              confidence: 'very-high',
              trackingKey: trackingKey,
              details: `Session timestamp match: ${gcSession}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 0a - Session timestamp match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              session: gcSession
            });
          }
          
          if (String(gc.variantId) === String(trackingLinkedVariant)) {
            pairData.matchingStrategies.push({
              strategy: 'variant-link',
              confidence: 'very-high',
              trackingKey: trackingKey,
              details: `Linked variant match: ${gc.variantId} = ${trackingLinkedVariant}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 0b - Linked variant match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              linkedVariant: trackingLinkedVariant
            });
          }
          
          // NEW Strategy 0c: Button source matching
          const gcButton = cart.items.find(item => item.key === gcKey)?.properties?.['_Gift Card Button'];
          const trackingButton = tracking.properties['_Gift Card Button'];
          
          if (gcButton && trackingButton && gcButton === trackingButton) {
            pairData.matchingStrategies.push({
              strategy: 'button-source',
              confidence: 'very-high',
              trackingKey: trackingKey,
              details: `Button source match: ${gcButton}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 0c - Button source match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              button: gcButton
            });
          }
          
          // Strategy 1: Direct category match (high priority)
          if (gc.category && gc.category === trackingCategory) {
            pairData.matchingStrategies.push({
              strategy: 'direct-category',
              confidence: 'high',
              trackingKey: trackingKey,
              details: `Category match: ${gc.category} = ${trackingCategory}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 1 - Direct category match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              category: trackingCategory
            });
          }
          
          // Strategy 2: Artist-specific matching (very high priority for multi-artist setups)
          if (trackingArtist && gc.artist && trackingArtist.toLowerCase() === gc.artist.toLowerCase()) {
            pairData.matchingStrategies.push({
              strategy: 'artist-match',
              confidence: 'very-high',
              trackingKey: trackingKey,
              details: `Artist match: ${gc.artist} = ${trackingArtist}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 2 - Artist match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              artist: trackingArtist
            });
          }
          
          // Strategy 3: Variant ID proximity check (for same-session additions)
          const variantIdDistance = Math.abs(parseInt(gc.variantId) - parseInt(trackingVariantId));
          if (variantIdDistance < 100) { // Variants created close together
            pairData.matchingStrategies.push({
              strategy: 'variant-proximity',
              confidence: 'medium',
              trackingKey: trackingKey,
              details: `Variant IDs close: ${gc.variantId} ↔ ${trackingVariantId} (distance: ${variantIdDistance})`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 3 - Variant proximity match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              distance: variantIdDistance
            });
          }
          
          // Strategy 4: Service type pattern matching
          const serviceMatches = {
            'tattoo': () => {
              return (
                gc.title.toLowerCase().includes('tattoo') ||
                gc.title.toLowerCase().includes('hour') ||
                gc.type.toLowerCase().includes('hour') ||
                gc.type.toLowerCase().includes('tattoo') ||
                gc.type.match(/\d+h/i) ||
                gc.type.toLowerCase().includes('pay')
              );
            },
            'piercings': () => {
              return (
                gc.title.toLowerCase().includes('piercing') ||
                gc.type.toLowerCase().includes('piercing')
              );
            },
            'tooth-gems': () => {
              return (
                gc.title.toLowerCase().includes('gem') ||
                gc.title.toLowerCase().includes('tooth') ||
                gc.type.toLowerCase().includes('gem')
              );
            },
            'teeth-whitening': () => {
              return (
                gc.title.toLowerCase().includes('whitening') ||
                gc.title.toLowerCase().includes('teeth') ||
                gc.type.toLowerCase().includes('whitening')
              );
            }
          };
          
          if (trackingCategory && serviceMatches[trackingCategory] && serviceMatches[trackingCategory]()) {
            pairData.matchingStrategies.push({
              strategy: 'service-pattern',
              confidence: 'high',
              trackingKey: trackingKey,
              details: `Service pattern match for ${trackingCategory}`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 4 - Service pattern match:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              serviceType: trackingCategory
            });
          }
          
          // Strategy 5: Cart position correlation (added around same time)
          const gcIndex = cart.items.findIndex(item => item.key === gc.key);
          const trackingIndex = cart.items.findIndex(item => item.key === trackingKey);
          const positionDistance = Math.abs(gcIndex - trackingIndex);
          
          if (positionDistance <= 2) { // Close positions in cart
            pairData.matchingStrategies.push({
              strategy: 'cart-position',
              confidence: 'medium',
              trackingKey: trackingKey,
              details: `Cart positions close: ${gcIndex} ↔ ${trackingIndex} (distance: ${positionDistance})`
            });
            foundMatch = true;
            console.log(LOG_PREFIX, 'Strategy 5 - Cart position correlation:', {
              giftCard: gc.title,
              tracking: trackingProductTitle,
              positionDistance: positionDistance
            });
          }
        }
        
        // If no match found for this tracking product, mark it for removal
        if (!foundMatch) {
          console.warn(LOG_PREFIX, 'ORPHANED TRACKING PRODUCT - removing:', {
            key: trackingKey,
            title: trackingProductTitle,
            category: trackingCategory,
            artist: trackingArtist,
            reason: 'No matching gift card found using any strategy'
          });
          
          // Remove from stored relationships if present
          const storedRelationships = loadTrackingRelationships();
          const updatedRelationships = storedRelationships.filter(rel => rel.trackingKey !== trackingKey);
          if (updatedRelationships.length !== storedRelationships.length) {
            saveTrackingRelationships(updatedRelationships);
            console.log(LOG_PREFIX, 'Removed orphaned tracking product from stored relationships');
          }
          
          // Remove the orphaned tracking product
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: trackingKey,
              quantity: 0
            })
          });
        }
      }
      
      // Log the final state of gift card ↔ tracking relationships
      console.log(LOG_PREFIX, 'Final gift card ↔ tracking relationships:');
      for (const [gcKey, pairData] of giftCardTrackingPairs) {
        if (pairData.matchingStrategies.length > 0) {
          console.log(LOG_PREFIX, `✅ ${pairData.giftCard.title}:`, {
            strategies: pairData.matchingStrategies.length,
            details: pairData.matchingStrategies.map(s => `${s.strategy} (${s.confidence}): ${s.details}`)
          });
        } else {
          console.warn(LOG_PREFIX, `⚠️ ${pairData.giftCard.title}: No tracking product linked`);
        }
      }
      
    } catch (e) {
      console.warn(LOG_PREFIX, 'Enhanced cleanup failed:', e);
    }
  }
  
  // Global diagnostic function for stress testing
  window.__debugMeetyCart = async function() {
    try {
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      const giftCards = cart.items.filter(item => item.gift_card === true);
      const trackingProducts = cart.items.filter(item => 
        item.properties && (
          item.properties['BOGO Inventory Tracker'] === 'true' ||
          item.properties['Gift Card Tracking'] ||
          (item.product_title && item.product_title.includes('Gift Card Counter'))
        )
      );
      
      console.group('🔍 MEETY CART DIAGNOSTIC');
      
      console.log('📊 Cart Overview:', {
        totalItems: cart.items.length,
        giftCards: giftCards.length,
        trackingProducts: trackingProducts.length,
        totalPrice: cart.total_price / 100
      });
      
      console.log('🎁 Gift Cards:');
      giftCards.forEach((gc, index) => {
        const artist = gc.product_title.includes('—') ? gc.product_title.split('—')[0]?.trim() : 'Unknown';
        console.log(`  ${index + 1}. ${gc.product_title}`, {
          variantId: gc.variant_id,
          key: gc.key,
          artist: artist,
          category: gc.properties['Gift Category'] || gc.properties['Desired Service Category'] || 'Not set',
          giftCardType: gc.properties['Gift Card Type'] || 'Not set',
          recipientEmail: gc.properties['Recipient email'] || 'Not set'
        });
      });
      
      console.log('📈 Tracking Products:');
      trackingProducts.forEach((tp, index) => {
        const artist = tp.product_title.includes('—') ? tp.product_title.split('—')[1]?.trim() : 'Unknown';
        console.log(`  ${index + 1}. ${tp.product_title}`, {
          variantId: tp.variant_id,
          key: tp.key,
          artist: artist,
          category: tp.properties['BOGO Category'] || 'Not set'
        });
      });
      
      console.log('🔗 Gift Card ↔ Tracking Matches:');
      trackingProducts.forEach(tp => {
        const tpArtist = tp.product_title.includes('—') ? tp.product_title.split('—')[1]?.trim() : '';
        const tpCategory = tp.properties['BOGO Category'];
        
        const matchingGiftCards = giftCards.filter(gc => {
          const gcArtist = gc.product_title.includes('—') ? gc.product_title.split('—')[0]?.trim() : '';
          const gcCategory = gc.properties['Gift Category'] || gc.properties['Desired Service Category'];
          
          return (
            (tpArtist && gcArtist && tpArtist.toLowerCase() === gcArtist.toLowerCase()) ||
            (gcCategory && gcCategory === tpCategory) ||
            (tpCategory === 'tattoo' && (gc.product_title.toLowerCase().includes('hour') || gc.product_title.toLowerCase().includes('tattoo')))
          );
        });
        
        console.log(`  Tracking "${tp.product_title}" → ${matchingGiftCards.length} matches:`, 
          matchingGiftCards.map(gc => gc.product_title)
        );
      });
      
      console.log('⚠️ Potential Issues:');
      const orphanedTracking = trackingProducts.filter(tp => {
        const tpArtist = tp.product_title.includes('—') ? tp.product_title.split('—')[1]?.trim() : '';
        const tpCategory = tp.properties['BOGO Category'];
        
        return !giftCards.some(gc => {
          const gcArtist = gc.product_title.includes('—') ? gc.product_title.split('—')[0]?.trim() : '';
          const gcCategory = gc.properties['Gift Category'] || gc.properties['Desired Service Category'];
          
          return (
            (tpArtist && gcArtist && tpArtist.toLowerCase() === gcArtist.toLowerCase()) ||
            (gcCategory && gcCategory === tpCategory) ||
            (tpCategory === 'tattoo' && (gc.product_title.toLowerCase().includes('hour') || gc.product_title.toLowerCase().includes('tattoo')))
          );
        });
      });
      
      if (orphanedTracking.length > 0) {
        console.warn('  🚨 Orphaned tracking products:', orphanedTracking.map(tp => ({ 
          key: tp.key, 
          title: tp.product_title,
          artist: tp.product_title.includes('—') ? tp.product_title.split('—')[1]?.trim() : 'Unknown'
        })));
      } else {
        console.log('  ✅ All tracking products have matching gift cards');
      }
      
      const giftCardsWithoutTracking = giftCards.filter(gc => {
        const gcArtist = gc.product_title.includes('—') ? gc.product_title.split('—')[0]?.trim() : '';
        
        return !trackingProducts.some(tp => {
          const tpArtist = tp.product_title.includes('—') ? tp.product_title.split('—')[1]?.trim() : '';
          return tpArtist && gcArtist && tpArtist.toLowerCase() === gcArtist.toLowerCase();
        });
      });
      
      if (giftCardsWithoutTracking.length > 0) {
        console.warn('  ⚠️ Gift cards without tracking:', giftCardsWithoutTracking.map(gc => gc.product_title));
      } else {
        console.log('  ✅ All gift cards have tracking products');
      }
      
      console.groupEnd();
      
      return {
        cart,
        giftCards,
        trackingProducts,
        orphanedTracking,
        giftCardsWithoutTracking
      };
      
    } catch (e) {
      console.error('Cart diagnostic failed:', e);
      return null;
    }
  };
  
  // Enhanced manual cleanup function with immediate execution
  window.__cleanupMeetyCart = async function(force = false) {
    console.log(LOG_PREFIX, 'Manual cart cleanup triggered', { force });
    
    if (force) {
      console.log(LOG_PREFIX, 'Force mode: temporarily disabling preventCleanup');
      const originalPreventCleanup = window.__meetyBogoContext?.preventCleanup;
      if (window.__meetyBogoContext) {
        window.__meetyBogoContext.preventCleanup = false;
      }
      
      // Use immediate cleanup instead of the slower one
      await performImmediateCleanup('manual-force');
      
      // Restore original state
      if (window.__meetyBogoContext && originalPreventCleanup !== undefined) {
        window.__meetyBogoContext.preventCleanup = originalPreventCleanup;
      }
    } else {
      await performImmediateCleanup('manual');
    }
    
    // Run diagnostic after cleanup
    return await window.__debugMeetyCart();
  };
  
  // SUPER AGGRESSIVE: Add a global cleanup function that runs on ANY page activity
  window.__forceCleanupOrphans = function() {
    console.log(LOG_PREFIX, '🚨 FORCE CLEANUP: Running emergency orphan removal');
    performImmediateCleanup('force-emergency');
  };
  
  // Piercing BOGO diagnostic function
  window.__debugPiercingBogo = function() {
    console.group('🔍 PIERCING BOGO DIAGNOSTIC');
    
    // Check button configuration
    const buttons = document.querySelectorAll('[data-bogo-track-piercings]');
    console.log('🔧 Buttons with piercing tracking:', buttons.length);
    
    buttons.forEach((btn, index) => {
      console.log(`  Button ${index + 1}:`, {
        id: btn.id,
        'data-bogo-track-piercings': btn.getAttribute('data-bogo-track-piercings'),
        'data-bogo-track-piercings-raw': btn.getAttribute('data-bogo-track-piercings-raw'),
        'data-bogo-category': btn.getAttribute('data-bogo-category'),
        'data-bogo-product-handle': btn.getAttribute('data-bogo-product-handle'),
        'data-bogo-product-id': btn.getAttribute('data-bogo-product-id')
      });
    });
    
    // Check global BOGO context
    console.log('🌍 Global BOGO context:', window.__meetyBogoContext);
    
    // Check cart for piercing-related items
    fetch('/cart.js')
      .then(response => response.json())
      .then(cart => {
        const piercingItems = cart.items.filter(item => 
          item.product_title.toLowerCase().includes('piercing') ||
          item.properties?.['BOGO Category'] === 'piercings' ||
          item.properties?.['Gift Card Tracking']?.includes('piercing')
        );
        
        console.log('🎯 Piercing-related items in cart:', piercingItems.length);
        piercingItems.forEach((item, index) => {
          console.log(`  Piercing Item ${index + 1}:`, {
            title: item.product_title,
            isGiftCard: item.gift_card,
            properties: item.properties,
            key: item.key,
            variantId: item.variant_id
          });
        });
        
        // Check if tracking product exists for piercings
        const button = document.querySelector('[data-bogo-track-piercings]');
        if (button) {
          const trackingHandle = button.getAttribute('data-bogo-track-piercings');
          console.log('🔍 Checking tracking product availability for handle:', trackingHandle);
          
          if (trackingHandle && trackingHandle !== '#') {
            fetch(`/products/${trackingHandle}.js`)
              .then(response => response.json())
              .then(product => {
                console.log('✅ Piercing tracking product found:', {
                  title: product.title,
                  handle: product.handle,
                  variants: product.variants.length,
                  availableVariants: product.variants.filter(v => v.available)
                });
              })
              .catch(error => {
                console.error('❌ Piercing tracking product not found:', error);
              });
          } else {
            console.warn('⚠️ No piercing tracking handle configured');
          }
        }
        
        console.groupEnd();
      });
  };
  
  // Run cleanup on hash changes (navigation within single page apps)
  window.addEventListener('hashchange', () => {
    console.log(LOG_PREFIX, 'Hash change detected - running cleanup');
    setTimeout(() => performImmediateCleanup('hash-change'), 500);
  });
  
  // Run cleanup on popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    console.log(LOG_PREFIX, 'Popstate detected - running cleanup');
    setTimeout(() => performImmediateCleanup('popstate'), 500);
  });
  
  // Track the last cart state to determine if items were removed
  let lastCartItemCount = 0;
  let lastCartState = null;
  
  /********************************************
   * CART REQUEST QUEUE (Serialize Updates)
   ********************************************/
  const giftCardRequestQueue = [];
  let isProcessingGiftCardQueue = false;
  let lastLogTime = 0;
  let consecutiveCleanRuns = 0;
  
  function enqueueGiftCardRequest(fn) {
    return new Promise((resolve, reject) => {
      giftCardRequestQueue.push({ fn, resolve, reject });
      if (!isProcessingGiftCardQueue) processGiftCardRequestQueue();
    });
  }
  
  async function processGiftCardRequestQueue() {
    if (isProcessingGiftCardQueue) return;
    isProcessingGiftCardQueue = true;
    while (giftCardRequestQueue.length) {
      const { fn, resolve, reject } = giftCardRequestQueue.shift();
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }
    isProcessingGiftCardQueue = false;
  }

  // Smart logging function to reduce console spam
  function smartLog(level, message, data = null, forceLog = false) {
    const now = Date.now();
    const timeSinceLastLog = now - lastLogTime;
    
    // Always log warnings, errors, and forced logs
    if (level === 'warn' || level === 'error' || forceLog) {
      console[level](LOG_PREFIX, message, data || '');
      lastLogTime = now;
      return;
    }
    
    // For regular logs, only log every 5 seconds to reduce spam
    if (timeSinceLastLog > 5000 || forceLog) {
      console[level](LOG_PREFIX, message, data || '');
      lastLogTime = now;
    }
  }

  // Enhanced immediate cleanup function that runs on any cart change
  function performImmediateCleanup(reason = 'cart-change') {
    return enqueueGiftCardRequest(() => performImmediateCleanupInternal(reason));
  }
  
  // NEW: Enhanced cleanup function to remove duplicate tracking products
  async function removeDuplicateTrackingProducts() {
    try {
      console.log(LOG_PREFIX, '🔍 DUPLICATE CLEANUP: Checking for duplicate tracking products...');
      
      const response = await fetch('/cart.js');
      const cart = await response.json();
      
      // Group tracking products by their key characteristics
      const trackingProducts = cart.items.filter(item => 
        item.properties && (
          item.properties['BOGO Inventory Tracker'] === 'true' ||
          item.properties['Gift Card Tracking'] ||
          (item.product_title && item.product_title.includes('Gift Card Counter'))
        )
      );
      
      if (trackingProducts.length <= 1) {
        console.log(LOG_PREFIX, '✅ DUPLICATE CLEANUP: No duplicates found');
        return { removed: 0, kept: trackingProducts.length };
      }
      
      console.log(LOG_PREFIX, '🔍 DUPLICATE CLEANUP: Found tracking products:', trackingProducts.length);
      
      // Group by category and artist to identify duplicates
      const groups = {};
      trackingProducts.forEach(item => {
        const category = item.properties['BOGO Category'] || 'unknown';
        const artist = item.properties['_Gift Card Artist'] || 'unknown';
        const key = `${category}-${artist}`;
        
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
      });
      
      let removedCount = 0;
      
      // For each group, keep the first one and remove duplicates
      for (const [key, items] of Object.entries(groups)) {
        if (items.length > 1) {
          console.log(LOG_PREFIX, `🗑️ DUPLICATE CLEANUP: Found ${items.length} duplicates for ${key}`);
          
          // Keep the first item, remove the rest
          for (let i = 1; i < items.length; i++) {
            const duplicateItem = items[i];
            console.log(LOG_PREFIX, '🗑️ DUPLICATE CLEANUP: Removing duplicate:', duplicateItem.key);
            
            try {
              await fetch('/cart/change.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: duplicateItem.key,
                  quantity: 0
                })
              });
              removedCount++;
              
              // Small delay between removals to prevent race conditions
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
              console.error(LOG_PREFIX, '❌ DUPLICATE CLEANUP: Failed to remove duplicate:', e);
            }
          }
        }
      }
      
      console.log(LOG_PREFIX, `✅ DUPLICATE CLEANUP: Removed ${removedCount} duplicate tracking products`);
      
      return { removed: removedCount, kept: trackingProducts.length - removedCount };
      
    } catch (e) {
      console.error(LOG_PREFIX, '❌ DUPLICATE CLEANUP: Failed:', e);
      return { removed: 0, kept: 0, error: e.message };
    }
  }
  
  async function performImmediateCleanupInternal(reason = 'cart-change') {
    try {
      // Short delay to let cart operations complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Only log cleanup start for important reasons or every 5 seconds
      const isImportantReason = reason.includes('manual') || reason.includes('checkout') || reason.includes('orphan');
      smartLog('log', `🔄 CLEANUP: ${reason}`, null, isImportantReason);
      
      // Get current cart state
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      // Store current state for comparison
      const currentCartState = {
        itemCount: cart.items.length,
        giftCardKeys: cart.items.filter(item => item.gift_card === true).map(item => item.key),
        trackingKeys: cart.items.filter(item => 
          item.properties && (
            item.properties['BOGO Inventory Tracker'] === 'true' ||
            item.properties['Gift Card Tracking'] ||
            (item.product_title && item.product_title.includes('Gift Card Counter'))
          )
        ).map(item => item.key)
      };
      
      // Only log cart state if it's changed or it's an important reason
      const stateChanged = !lastCartState || 
        currentCartState.itemCount !== lastCartState.itemCount ||
        currentCartState.trackingKeys.length !== lastCartState.trackingKeys.length;
      
      if (stateChanged || isImportantReason) {
        smartLog('log', 'Cart state:', {
          totalItems: currentCartState.itemCount,
          giftCards: currentCartState.giftCardKeys.length,
          trackingProducts: currentCartState.trackingKeys.length,
          lastCount: lastCartItemCount
        }, isImportantReason);
      }
      
      // Always run cleanup - don't wait for size changes
      const giftCards = cart.items.filter(item => item.gift_card === true);
      const trackingProducts = cart.items.filter(item => 
        item.properties && (
          item.properties['BOGO Inventory Tracker'] === 'true' ||
          item.properties['Gift Card Tracking'] ||
          (item.product_title && item.product_title.includes('Gift Card Counter'))
        )
      );
      
      // Only log detailed analysis if there are tracking products
      if (trackingProducts.length > 0) {
        smartLog('log', '🔍 ANALYZING CART FOR ORPHANS:', {
          giftCards: giftCards.map(gc => ({
            key: gc.key,
            title: gc.product_title,
            artist: gc.product_title?.includes('—') ? gc.product_title.split('—')[0]?.trim() : 'Unknown'
          })),
          trackingProducts: trackingProducts.map(tp => ({
            key: tp.key,
            title: tp.product_title,
            artist: tp.product_title?.includes('—') ? tp.product_title.split('—')[1]?.trim() : 'Unknown',
            category: tp.properties['BOGO Category']
          }))
        }, isImportantReason);
      }
      
      let orphansFound = false;
      
      // Check each tracking product for orphan status
      for (const tracking of trackingProducts) {
        const trackingTitle = tracking.product_title || '';
        const trackingArtist = trackingTitle.includes('—') ? 
          trackingTitle.split('—')[1]?.trim() : '';
        const trackingCategory = tracking.properties['BOGO Category'];
        
        // Use our comprehensive matching logic
        const hasMatchingGiftCard = giftCards.some(gc => {
          const gcTitle = gc.product_title || '';
          const gcArtist = gcTitle.includes('—') ? gcTitle.split('—')[0]?.trim() : '';
          const gcCategory = gc.properties['Gift Category'] || 
                           gc.properties['Desired Service Category'] ||
                           gc.properties['BOGO Category'];
          
          // CRITICAL: Artist matching (most important for multi-artist setups)
          if (trackingArtist && gcArtist && trackingArtist.toLowerCase() === gcArtist.toLowerCase()) {
            smartLog('log', `✅ Artist match found: ${trackingArtist} ↔ ${gcArtist}`, null, orphansFound);
            return true;
          }
          
          // Category matching
          if (gcCategory && gcCategory === trackingCategory) {
            smartLog('log', `✅ Category match found: ${gcCategory} ↔ ${trackingCategory}`, null, orphansFound);
            return true;
          }
          
          // Service type pattern matching for tattoos
          if (trackingCategory === 'tattoo') {
            const isTattooGift = (
              gcTitle.toLowerCase().includes('tattoo') ||
              gcTitle.toLowerCase().includes('hour') ||
              gc.properties?.['Gift Card Type']?.toLowerCase().includes('hour') ||
              gc.properties?.['Gift Card Type']?.toLowerCase().includes('tattoo') ||
              gc.properties?.['Gift Card Type']?.match(/\d+h/i) ||
              gc.properties?.['Gift Card Type']?.toLowerCase().includes('pay')
            );
            
            if (isTattooGift) {
              smartLog('log', `✅ Tattoo pattern match found for: ${gcTitle}`, null, orphansFound);
              return true;
            }
          }
          
          // Enhanced property matching
          if (gc.properties?.['_Gift Card Session'] && tracking.properties?.['_Gift Card Session'] &&
              gc.properties['_Gift Card Session'] === tracking.properties['_Gift Card Session']) {
            smartLog('log', `✅ Session match found: ${gc.properties['_Gift Card Session']}`, null, orphansFound);
            return true;
          }
          
          if (String(gc.variant_id) === String(tracking.properties?.['_Linked Gift Card Variant'])) {
            smartLog('log', `✅ Variant link match found: ${gc.variant_id}`, null, orphansFound);
            return true;
          }
          
          return false;
        });
        
        if (!hasMatchingGiftCard) {
          console.warn(LOG_PREFIX, `🚨 ORPHAN DETECTED: ${trackingTitle}`, {
            key: tracking.key,
            artist: trackingArtist,
            category: trackingCategory,
            reason: 'No matching gift card found'
          });
          
          orphansFound = true;
          
          // Remove the orphaned tracking product immediately using batch update
          try {
            console.log(LOG_PREFIX, `🗑️ REMOVING ORPHAN: ${trackingTitle} (${tracking.key})`);
            
            // Use cart/update.js for more reliable removal
            const updateResponse = await fetch('/cart/update.js', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: JSON.stringify({
                updates: { [tracking.key]: 0 }
              })
            });
            
            if (!updateResponse.ok) {
              console.error(LOG_PREFIX, `❌ Update failed for ${tracking.key}: ${updateResponse.status}`);
              // Fallback to cart/change.js
              await fetch('/cart/change.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: tracking.key,
                  quantity: 0
                })
              });
            }
            
            console.log(LOG_PREFIX, `✅ REMOVED ORPHAN: ${trackingTitle} (${tracking.key})`);
            
            // Small delay to ensure cart state updates
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (e) {
            console.error(LOG_PREFIX, `❌ Failed to remove orphan ${tracking.key}:`, e);
            
            // Emergency fallback - try direct cart API
            try {
              await fetch('/cart/change.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: tracking.key,
                  quantity: 0
                })
              });
              console.log(LOG_PREFIX, `✅ Fallback removal successful for ${tracking.key}`);
            } catch (e2) {
              console.error(LOG_PREFIX, `❌ Emergency fallback failed for ${tracking.key}:`, e2);
            }
          }
        } else {
          // Only log this occasionally to reduce spam
          smartLog('log', `✅ KEEPING: ${trackingTitle} - has matching gift card`);
        }
      }
      
      if (orphansFound) {
        consecutiveCleanRuns = 0; // Reset counter when orphans found
        console.log(LOG_PREFIX, '🔄 Orphans removed, forcing cart refresh...');
        
        // Get updated cart state to confirm removal
        const updatedCartResponse = await fetch('/cart.js');
        const updatedCart = await updatedCartResponse.json();
        
        console.log(LOG_PREFIX, '📊 Cart state after cleanup:', {
          totalItems: updatedCart.items.length,
          remainingTrackers: updatedCart.items.filter(item => 
            item.product_title && item.product_title.includes('Gift Card Counter')
          ).length
        });
        
        // Force UI refresh using multiple strategies
        setTimeout(() => {
          try {
            // Strategy 1: Theme ajax cart update
            if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.loadCart === 'function') {
              theme.ajaxCart.loadCart();
              console.log(LOG_PREFIX, '✅ Theme cart refresh triggered');
            }
            
            // Strategy 2: Theme cart update function
            if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.update === 'function') {
              theme.ajaxCart.update(function(cart) {
                console.log(LOG_PREFIX, '✅ Theme cart update completed:', cart.item_count);
              });
            }
            
            // Strategy 3: Custom events
            document.dispatchEvent(new CustomEvent('cart:refresh', { 
              detail: { source: 'orphan-cleanup', reason: reason }
            }));
            document.dispatchEvent(new CustomEvent('cart:update', {
              detail: { source: 'orphan-cleanup', reason: reason }
            }));
            
            // Strategy 4: Force drawer refresh if visible
            const cartDrawer = document.getElementById('CartDrawer');
            if (cartDrawer && !cartDrawer.classList.contains('ajaxcart--is-hidden')) {
              setTimeout(() => {
                if (window.theme && theme.ajaxCart) {
                  theme.ajaxCart.open();
                }
              }, 100);
            }
            
            console.log(LOG_PREFIX, '✅ All refresh strategies triggered');
            
          } catch (e) {
            console.warn(LOG_PREFIX, 'Cart refresh failed:', e);
          }
        }, 200);
      } else {
        consecutiveCleanRuns++; // Increment counter for clean runs
        // Only log "no orphans" occasionally to reduce spam
        if (consecutiveCleanRuns <= 3 || consecutiveCleanRuns % 10 === 0) {
          smartLog('log', `✅ No orphans found (${consecutiveCleanRuns} consecutive clean runs)`);
        }
      }
      
      // Run duplicate cleanup occasionally (every 5 clean runs or when manual/important)
      if (orphansFound || isImportantReason || consecutiveCleanRuns % 5 === 0) {
        try {
          const duplicateResult = await removeDuplicateTrackingProducts();
          if (duplicateResult.removed > 0) {
            console.log(LOG_PREFIX, `🗑️ DUPLICATES REMOVED: ${duplicateResult.removed} duplicate tracking products cleaned up`);
            
            // Force cart refresh after duplicate removal
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('cart:refresh', { 
                detail: { source: 'duplicate-cleanup', removed: duplicateResult.removed }
              }));
            }, 300);
          }
        } catch (e) {
          console.warn(LOG_PREFIX, 'Duplicate cleanup failed:', e);
        }
      }
      
      // Update tracking state
      lastCartItemCount = currentCartState.itemCount;
      lastCartState = currentCartState;
      
    } catch (e) {
      console.error(LOG_PREFIX, 'Immediate cleanup failed:', e);
    }
  }

  // Critical: Checkout protection - validate cart before allowing checkout
  async function validateCartBeforeCheckout() {
    return enqueueGiftCardRequest(validateCartBeforeCheckoutInternal);
  }
  
  async function validateCartBeforeCheckoutInternal() {
    console.log(LOG_PREFIX, '🛡️ CHECKOUT VALIDATION: Checking for orphaned trackers...');
    
    try {
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      
      const trackingProducts = cart.items.filter(item => 
        item.product_title && item.product_title.includes('Gift Card Counter')
      );
      
      const giftCards = cart.items.filter(item => item.gift_card === true);
      
      if (trackingProducts.length === 0) {
        console.log(LOG_PREFIX, '✅ No tracking products found - checkout safe');
        return true;
      }
      
      console.log(LOG_PREFIX, `🔍 Found ${trackingProducts.length} trackers, ${giftCards.length} gift cards`);
      
      // Check each tracker for valid parent
      const orphanedTrackers = [];
      
      for (const tracking of trackingProducts) {
        const trackingTitle = tracking.product_title || '';
        const trackingArtist = trackingTitle.includes('—') ? 
          trackingTitle.split('—')[1]?.trim() : '';
        
        // Strategy 1: Artist name matching (for tattoo artists like Rigo, Angelo)
        const hasMatchingArtist = giftCards.some(gc => {
          const gcTitle = gc.product_title || '';
          const gcArtist = gcTitle.includes('—') ? gcTitle.split('—')[0]?.trim() : '';
          
          return trackingArtist && gcArtist && 
                 trackingArtist.toLowerCase() === gcArtist.toLowerCase();
        });
        
        // Strategy 2: Category-based matching (for service categories like piercings)
        const trackingCategory = tracking.properties?.['BOGO Category'];
        const hasMatchingCategory = giftCards.some(gc => {
          const gcCategory = gc.properties?.['_Expected Tracking Category'] || 
                           gc.properties?.['BOGO Category'] ||
                           gc.properties?.['Gift Category'];
          
          // Direct category match
          if (trackingCategory && gcCategory === trackingCategory) {
            return true;
          }
          
          // Special category inference for piercings
          if (trackingCategory === 'piercings' || trackingArtist === 'Piercings') {
            const gcTitle = gc.product_title.toLowerCase();
            return gcTitle.includes('piercing');
          }
          
          // Special category inference for other services
          if (trackingCategory === 'tooth-gems' || trackingArtist === 'Tooth Gems') {
            const gcTitle = gc.product_title.toLowerCase();
            return gcTitle.includes('gem') || gcTitle.includes('tooth');
          }
          
          if (trackingCategory === 'teeth-whitening' || trackingArtist === 'Teeth Whitening') {
            const gcTitle = gc.product_title.toLowerCase();
            return gcTitle.includes('whitening') || gcTitle.includes('teeth');
          }
          
          return false;
        });
        
        if (!hasMatchingArtist && !hasMatchingCategory) {
          console.warn(LOG_PREFIX, `🚨 CHECKOUT BLOCKER: Orphaned ${trackingTitle}`, {
            trackingArtist,
            trackingCategory,
            checkedArtistMatch: hasMatchingArtist,
            checkedCategoryMatch: hasMatchingCategory
          });
          orphanedTrackers.push(tracking);
        } else {
          console.log(LOG_PREFIX, `✅ KEEPING ${trackingTitle}`, {
            hasMatchingArtist,
            hasMatchingCategory,
            trackingArtist,
            trackingCategory
          });
        }
      }
      
      // Remove any orphaned trackers before checkout
      if (orphanedTrackers.length > 0) {
        console.log(LOG_PREFIX, `🗑️ CHECKOUT CLEANUP: Removing ${orphanedTrackers.length} orphans`);
        
        const updates = {};
        orphanedTrackers.forEach(tracker => {
          updates[tracker.key] = 0;
        });
        
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ updates })
        });
        
        console.log(LOG_PREFIX, '✅ CHECKOUT CLEANUP: Orphans removed, proceeding to checkout');
        
        // Small delay to ensure cart updates
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      return true;
      
    } catch (error) {
      console.error(LOG_PREFIX, '❌ Checkout validation failed:', error);
      return false;
    }
  }

  // Monitor cart changes
  function setupCartMonitoring() {
    // Override cart update functions
    const originalFetch = window.fetch;
    window.fetch = function(resource, init) {
      const result = originalFetch.apply(this, arguments);
      
      // Check if this is a cart operation
      if (typeof resource === 'string' && resource.includes('/cart/')) {
        result.then(async (response) => {
          // Run immediate cleanup on ANY cart operation
          setTimeout(() => {
            hideTrackingProducts();
            disableGiftCardQuantityControls();
            
            // Run cleanup on all cart operations, not just removals
            if (resource.includes('/cart/change.js') || 
                resource.includes('/cart/clear.js') || 
                resource.includes('/cart/add.js') ||
                resource.includes('/cart/update.js')) {
              
              console.log(LOG_PREFIX, 'Cart operation detected:', resource);
              performImmediateCleanup(`cart-fetch-${resource}`);
            }
          }, 100);
        });
      }
      
      return result;
    };
    
    // Monitor DOM changes for cart updates
    const observer = new MutationObserver(() => {
      hideTrackingProducts();
      disableGiftCardQuantityControls();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Initial hide
    setTimeout(() => {
      hideTrackingProducts();
      disableGiftCardQuantityControls();
    }, 500);
    
    // SMART cleanup - frequent when needed, less when cart is clean
    setInterval(() => {
      hideTrackingProducts();
      disableGiftCardQuantityControls();
      
      // Only run orphan cleanup if page is visible and user is active
      if (!document.hidden && document.visibilityState === 'visible') {
        // Run cleanup more frequently if we recently found orphans
        if (consecutiveCleanRuns < 5) {
          performImmediateCleanup('high-frequency-scan');
        } else if (consecutiveCleanRuns % 3 === 0) {
          // Less frequent when cart has been clean for a while
          performImmediateCleanup('low-frequency-scan');
        }
      }
    }, 2000); // Every 2 seconds - reduced from 1 second
  }
  
  // Enhanced cart change monitoring
  function monitorCartChanges() {
    // Listen for cart drawer events
    document.addEventListener('cartDrawer:open', () => {
      console.log(LOG_PREFIX, 'Cart drawer opened - running cleanup');
      hideTrackingProducts();
      disableGiftCardQuantityControls();
      performImmediateCleanup('cart-drawer-open');
    });
    document.addEventListener('cartDrawer:update', () => {
      console.log(LOG_PREFIX, 'Cart drawer updated - running cleanup');
      hideTrackingProducts();
      disableGiftCardQuantityControls();
      performImmediateCleanup('cart-drawer-update');
    });
    
    // Listen for AJAX cart events
    document.addEventListener('cart:update', () => {
      console.log(LOG_PREFIX, 'Cart updated - running cleanup');
      hideTrackingProducts();
      disableGiftCardQuantityControls();
      performImmediateCleanup('cart-update-event');
    });
    document.addEventListener('cart:refresh', () => {
      console.log(LOG_PREFIX, 'Cart refreshed - running cleanup');
      hideTrackingProducts();
      disableGiftCardQuantityControls();
      performImmediateCleanup('cart-refresh-event');
    });
    
    // Monitor for cart drawer visibility changes
    const cartDrawer = document.getElementById('CartDrawer');
    if (cartDrawer) {
      const drawerObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const isOpen = cartDrawer.classList.contains('js-drawer-open') || 
                          cartDrawer.classList.contains('is-open') ||
                          !cartDrawer.hasAttribute('aria-hidden');
            
            if (isOpen) {
              console.log(LOG_PREFIX, 'Cart drawer became visible - running cleanup');
              setTimeout(() => {
                hideTrackingProducts();
                disableGiftCardQuantityControls();
                performImmediateCleanup('cart-drawer-visible');
              }, 200);
            }
          }
        });
      });
      
      drawerObserver.observe(cartDrawer, { 
        attributes: true, 
        attributeFilter: ['class', 'aria-hidden', 'style'] 
      });
    }
    
    // Monitor cart page changes
    if (window.location.pathname.includes('/cart')) {
      console.log(LOG_PREFIX, 'On cart page - setting up enhanced monitoring');
      const cartObserver = new MutationObserver(() => {
        hideTrackingProducts();
        disableGiftCardQuantityControls();
        performImmediateCleanup('cart-page-change');
      });
      cartObserver.observe(document.body, { childList: true, subtree: true });
      
      // Run cleanup when cart page loads
      setTimeout(() => {
        performImmediateCleanup('cart-page-load');
      }, 1000);
    }
    
    // Flag to prevent checkout validation loop
    let checkoutValidationInProgress = false;
    
    // Checkout button protection - validate cart before any checkout attempt
    document.addEventListener('click', async function(e) {
      // Check if clicking checkout button
      const checkoutButton = e.target.closest('button[name="checkout"], button[name^="button-route-"], .btn--checkout, .checkout-button, [href*="checkout"]');
      
      if (checkoutButton && !checkoutValidationInProgress) {
        // Check if this is a validation bypass (already validated)
        if (checkoutButton.dataset.meetyValidated === 'true') {
          console.log(LOG_PREFIX, '✅ Checkout already validated - proceeding');
          checkoutButton.dataset.meetyValidated = 'false'; // Reset flag
          return; // Allow normal checkout
        }
        
        console.log(LOG_PREFIX, '🛡️ CHECKOUT ATTEMPT: Validating cart...');
        
        // Prevent default checkout temporarily
        e.preventDefault();
        e.stopPropagation();
        
        checkoutValidationInProgress = true;
        
        // Disable button to prevent double-clicks
        checkoutButton.disabled = true;
        const originalText = checkoutButton.innerHTML;
        checkoutButton.innerHTML = '🔄 Validating...';
        
        try {
          // Validate cart before checkout
          const isValid = await validateCartBeforeCheckout();
          
          if (isValid) {
            console.log(LOG_PREFIX, '✅ Cart validated - proceeding to checkout');
            
            // Mark as validated and re-enable
            checkoutButton.dataset.meetyValidated = 'true';
            checkoutButton.disabled = false;
            checkoutButton.innerHTML = originalText;
            
            // Allow checkout to proceed with bypass flag
            setTimeout(() => {
              checkoutValidationInProgress = false;
              if (checkoutButton.href) {
                window.location.href = checkoutButton.href;
              } else {
                // Trigger click programmatically with bypass
                checkoutButton.click();
              }
            }, 100);
          } else {
            console.error(LOG_PREFIX, '❌ Cart validation failed');
            checkoutButton.disabled = false;
            checkoutButton.innerHTML = originalText;
            checkoutValidationInProgress = false;
          }
        } catch (error) {
          console.error(LOG_PREFIX, '❌ Checkout validation error:', error);
          checkoutButton.disabled = false;
          checkoutButton.innerHTML = originalText;
          checkoutValidationInProgress = false;
        }
        
        return false; // Prevent event propagation
      }
    }, true); // Use capture phase to intercept early
    
    // Monitor for clicks on cart-related elements
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target && (
        target.closest('.cart-item') ||
        target.closest('.cart__item') ||
        target.closest('[data-cart-item]') ||
        target.closest('.line-item') ||
        target.matches('[class*="cart"]') ||
        target.matches('[data-cart]') ||
        target.matches('.qty-remove') ||
        target.matches('.remove') ||
        target.matches('[onclick*="remove"]')
      )) {
        console.log(LOG_PREFIX, 'Cart-related click detected - scheduling cleanup');
        setTimeout(() => {
          performImmediateCleanup('cart-element-click');
        }, 500);
      }
    });
  }
  
  // Critical checkout-time safety check to catch any orphaned counters
  function setupCheckoutProtection() {
    // Monitor for checkout attempts
    const checkoutSelectors = [
      'button[name="add"][value="checkout"]',
      'button[type="submit"][name="add"]',
      'input[name="add"][value="checkout"]',
      '.btn--checkout',
      '.checkout-button',
      '[href="/checkout"]',
      '[href*="checkout"]',
      'button:contains("checkout")',
      'button:contains("Check Out")',
      'input[type="submit"][value*="checkout"]',
      'form[action="/cart"] button[type="submit"]',
      'form[action="/cart"] input[type="submit"]'
    ];
    
    // Function to perform final cleanup before checkout
    async function performCheckoutCleanup(event) {
      console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Pre-checkout cleanup triggered');
      
      try {
        // Get current cart state
        const cartResponse = await fetch('/cart.js');
        const cart = await cartResponse.json();
        
        const giftCards = cart.items.filter(item => item.gift_card === true);
        const trackingProducts = cart.items.filter(item => 
          item.properties && (
            item.properties['BOGO Inventory Tracker'] === 'true' ||
            item.properties['Gift Card Tracking'] ||
            (item.product_title && item.product_title.includes('Gift Card Counter'))
          )
        );
        
        console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Cart analysis:', {
          giftCards: giftCards.length,
          trackingProducts: trackingProducts.length,
          giftCardArtists: giftCards.map(gc => {
            const title = gc.product_title || '';
            return title.includes('—') ? title.split('—')[0]?.trim() : 'Unknown';
          }),
          trackingArtists: trackingProducts.map(tp => {
            const title = tp.product_title || '';
            return title.includes('—') ? title.split('—')[1]?.trim() : 'Unknown';
          })
        });
        
        let foundOrphans = false;
        
        // Check each tracking product for a matching gift card
        for (const tracking of trackingProducts) {
          const trackingTitle = tracking.product_title || '';
          const trackingArtist = trackingTitle.includes('—') ? 
            trackingTitle.split('—')[1]?.trim() : '';
          const trackingCategory = tracking.properties['BOGO Category'];
          
          // Try to find ANY matching gift card using all our strategies
          const hasMatch = giftCards.some(gc => {
            const gcTitle = gc.product_title || '';
            const gcArtist = gcTitle.includes('—') ? gcTitle.split('—')[0]?.trim() : '';
            const gcCategory = gc.properties['Gift Category'] || 
                             gc.properties['Desired Service Category'] ||
                             gc.properties['BOGO Category'];
            
            // Check all matching strategies
            const strategies = [
              // Artist matching (most important for multi-artist)
              trackingArtist && gcArtist && trackingArtist.toLowerCase() === gcArtist.toLowerCase(),
              
              // Category matching
              gcCategory && gcCategory === trackingCategory,
              
              // Service type pattern matching
              trackingCategory === 'tattoo' && (
                gcTitle.toLowerCase().includes('tattoo') ||
                gcTitle.toLowerCase().includes('hour') ||
                gc.properties?.['Gift Card Type']?.toLowerCase().includes('hour') ||
                gc.properties?.['Gift Card Type']?.toLowerCase().includes('tattoo')
              ),
              
              trackingCategory === 'piercings' && (
                gcTitle.toLowerCase().includes('piercing') ||
                gc.properties?.['Gift Card Type']?.toLowerCase().includes('piercing')
              ),
              
              trackingCategory === 'tooth-gems' && (
                gcTitle.toLowerCase().includes('gem') ||
                gcTitle.toLowerCase().includes('tooth') ||
                gc.properties?.['Gift Card Type']?.toLowerCase().includes('gem')
              ),
              
              trackingCategory === 'teeth-whitening' && (
                gcTitle.toLowerCase().includes('whitening') ||
                gcTitle.toLowerCase().includes('teeth') ||
                gc.properties?.['Gift Card Type']?.toLowerCase().includes('whitening')
              ),
              
              // Enhanced property matching
              gc.properties?.['_Gift Card Session'] && tracking.properties?.['_Gift Card Session'] &&
              gc.properties['_Gift Card Session'] === tracking.properties['_Gift Card Session'],
              
              gc.properties?.['_Gift Card Button'] && tracking.properties?.['_Gift Card Button'] &&
              gc.properties['_Gift Card Button'] === tracking.properties['_Gift Card Button'],
              
              String(gc.variant_id) === String(tracking.properties?.['_Linked Gift Card Variant'])
            ];
            
            return strategies.some(Boolean);
          });
          
          if (!hasMatch) {
            console.warn(LOG_PREFIX, '🚨 CHECKOUT PROTECTION: Found orphaned tracking product:', {
              key: tracking.key,
              title: trackingTitle,
              artist: trackingArtist,
              category: trackingCategory,
              reason: 'No matching gift card found at checkout time'
            });
            
            foundOrphans = true;
            
            // Remove the orphaned tracking product immediately
            await fetch('/cart/change.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: tracking.key,
                quantity: 0
              })
            });
            
            console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Removed orphaned tracking product:', tracking.key);
          }
        }
        
        if (foundOrphans) {
          console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Orphaned tracking products removed, refreshing cart...');
          
          // Small delay to let the cart updates process
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Refresh the cart drawer or page to show updated state
          try {
            if (window.theme && theme.ajaxCart && typeof theme.ajaxCart.loadCart === 'function') {
              theme.ajaxCart.loadCart();
            } else {
              // Trigger a cart refresh event
              document.dispatchEvent(new CustomEvent('cart:refresh'));
            }
          } catch (e) {
            console.warn(LOG_PREFIX, 'Cart refresh failed, but cleanup was successful');
          }
        } else {
          console.log(LOG_PREFIX, '✅ CHECKOUT PROTECTION: No orphaned tracking products found');
        }
        
      } catch (e) {
        console.error(LOG_PREFIX, '❌ CHECKOUT PROTECTION: Cleanup failed:', e);
        // Don't block checkout if cleanup fails
      }
    }
    
    // Add event listeners to all possible checkout buttons/links
    function attachCheckoutListeners() {
      checkoutSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (element.dataset.meetyCheckoutProtected) return; // Already protected
            element.dataset.meetyCheckoutProtected = 'true';
            
            element.addEventListener('click', async (event) => {
              console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Checkout button clicked, running cleanup...');
              
              // Run cleanup but don't block the checkout
              performCheckoutCleanup(event).catch(e => {
                console.warn(LOG_PREFIX, 'Checkout cleanup failed but proceeding:', e);
              });
            }, { capture: true, passive: true });
          });
        } catch (e) {
          // Ignore selector errors for invalid selectors
        }
      });
    }
    
    // Initial attachment
    attachCheckoutListeners();
    
    // Re-attach when new elements are added to the page
    const observer = new MutationObserver(() => {
      attachCheckoutListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Also monitor form submissions that might be checkout
    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (form && (
        form.action?.includes('checkout') ||
        form.action?.includes('/cart') ||
        form.querySelector('button[name="add"][value="checkout"]') ||
        form.querySelector('input[name="add"][value="checkout"]')
      )) {
        console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Form submission detected, running cleanup...');
        performCheckoutCleanup(event).catch(e => {
          console.warn(LOG_PREFIX, 'Form submission cleanup failed but proceeding:', e);
        });
      }
    }, { capture: true, passive: true });
    
    console.log(LOG_PREFIX, '🛒 CHECKOUT PROTECTION: Initialized with', checkoutSelectors.length, 'selector patterns');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupCartMonitoring();
      monitorCartChanges();
      setupCheckoutProtection(); // Add checkout protection
      // Run immediate cleanup on page load for any orphaned counters
      setTimeout(() => {
        console.log(LOG_PREFIX, 'Running initial cleanup on page load...');
        cleanupOrphanedTrackingProducts();
      }, 2000);
    });
  } else {
    setupCartMonitoring();
    monitorCartChanges();
    setupCheckoutProtection(); // Add checkout protection
    // Run immediate cleanup for any orphaned counters
    setTimeout(() => {
      console.log(LOG_PREFIX, 'Running initial cleanup on page ready...');
      cleanupOrphanedTrackingProducts();
    }, 2000);
  }
  
  // Additional robustness: cleanup on page visibility change (handles tab switching/focus)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log(LOG_PREFIX, 'Page became visible - running cleanup check');
      setTimeout(cleanupOrphanedTrackingProducts, 1000);
    }
  });
  
  // Additional robustness: cleanup on window focus (handles window switching)
  window.addEventListener('focus', () => {
    console.log(LOG_PREFIX, 'Window focused - running cleanup check');
    setTimeout(cleanupOrphanedTrackingProducts, 1000);
  });
  
  console.log(LOG_PREFIX, 'Cart tracking product management initialized');
})();

/* Instagram Post-Checkout Redirect Handler */
(function() {
  // Check if we should show Instagram redirect after checkout
  if (window.location.pathname.includes('/thank') || 
      window.location.pathname.includes('/order') ||
      window.location.search.includes('thank') ||
      document.querySelector('.os-order-number') ||
      document.querySelector('[data-checkout-confirmation]')) {
    
    const shouldRedirect = sessionStorage.getItem('meetyInstagramRedirect');
    const instagramUrl = sessionStorage.getItem('meetyInstagramUrl');
    
    if (shouldRedirect === 'true' && instagramUrl) {
      console.log('[MEETY] Post-checkout Instagram redirect active');
      
      // Clear flags
      sessionStorage.removeItem('meetyInstagramRedirect');
      sessionStorage.removeItem('meetyInstagramUrl');
      
      // Create Instagram reminder banner
      const banner = document.createElement('div');
      banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #E4405F, #C13584);
        color: #fff;
        padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 999999;
        max-width: 500px;
        text-align: center;
        animation: slideDown 0.3s ease-out;
      `;
      
      banner.innerHTML = `
        <style>
          @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
          }
        </style>
        <h3 style="margin:0 0 12px;font-size:18px;font-weight:600;">📱 Next Step: Schedule on Instagram</h3>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Your order is complete! Now visit Instagram to check availability and schedule your appointment.</p>
        <a href="${instagramUrl}" 
           target="_blank" 
           rel="noopener noreferrer"
           style="display:inline-block;background:#fff;color:#E4405F;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;"
           onmouseover="this.style.background='#f8f9fa'"
           onmouseout="this.style.background='#fff'">
          Open Instagram →
        </a>
      `;
      
      document.body.appendChild(banner);
      
      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        banner.style.animation = 'slideDown 0.3s ease-out reverse';
        setTimeout(() => banner.remove(), 300);
      }, 10000);
    }
  }
})();
