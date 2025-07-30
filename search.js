// ==UserScript==
// @name         Lionwheel - Enhanced Search with JSON
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Match barcode or SKU from JSON and integrate with Select2 dropdown directly with Fuse.js advanced search
// @author       Adam Lee
// @match        https://members.lionwheel.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @require      https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/AdamLee9186/anipet/main/search.js
// @downloadURL  https://raw.githubusercontent.com/AdamLee9186/anipet/main/search.js
// ==/UserScript==

(function () {
  'use strict';

  const JSON_URL = 'https://raw.githubusercontent.com/AdamLee9186/anipet/main/product_data.json';
  
  // Advanced search configuration
  const SEARCH_CONFIG = {
    threshold: 0.4, // Lower = more strict matching
    minMatchCharLength: 2,
    ignoreLocation: true,
    useExtendedSearch: true,
    findAllMatches: true
  };

  let productList = [];
  let fuse = null; // Fuse.js instance for advanced search
  let alreadyEnhanced = false;
  let observerActive = false;
  let selectedProduct = null; // Store the selected product

  // UX/UI State Management
  let scriptState = {
    isLoading: false,
    isLoaded: false,
    hasError: false,
    errorMessage: '',
    productsCount: 0,
    lastUpdate: null
  };

  // Loading Indicator System
  const LoadingIndicator = {
    create(container) {
      const indicator = document.createElement('div');
      indicator.className = 'lw-loading-indicator';
      indicator.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: #666;
        font-size: 14px;
        gap: 8px;
      `;
      
      const spinner = document.createElement('div');
      spinner.className = 'lw-spinner';
      spinner.style.cssText = `
        width: 16px;
        height: 16px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #3498db;
        border-radius: 50%;
        animation: lw-spin 1s linear infinite;
      `;
      
      const text = document.createElement('span');
      text.textContent = 'טוען מוצרים...';
      
      indicator.appendChild(spinner);
      indicator.appendChild(text);
      
      return indicator;
    }
  };

  // Error Display System
  const ErrorDisplay = {
    create(container, error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'lw-error-display';
      errorDiv.style.cssText = `
        padding: 16px;
        margin: 8px 0;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        color: #721c24;
        font-size: 14px;
        text-align: center;
      `;
      
      const icon = document.createElement('div');
      icon.innerHTML = '⚠️';
      icon.style.cssText = 'font-size: 20px; margin-bottom: 8px;';
      
      const message = document.createElement('div');
      message.textContent = error.message || 'שגיאה בטעינת הנתונים';
      
      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'נסה שוב';
      retryBtn.style.cssText = `
        background: #dc3545;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        margin-top: 8px;
        cursor: pointer;
        font-size: 12px;
      `;
      retryBtn.onclick = () => {
        errorDiv.remove();
        loadJSON();
      };
      
      errorDiv.appendChild(icon);
      errorDiv.appendChild(message);
      errorDiv.appendChild(retryBtn);
      
      return errorDiv;
    }
  };

  // Add CSS for animations
  function addLoadingCSS() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes lw-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .lw-loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
    `;
    document.head.appendChild(style);
  }

  // Update script state and show notifications
  function updateScriptState(newState) {
    scriptState = { ...scriptState, ...newState };
    
    // Only log critical state changes
    if (newState.hasError) {
      console.error('Script error state:', newState.errorMessage);
    }
  }

  // Status badge removed - no visual feedback

  // Show detailed status information
  function showStatusDetails() {
    const details = {
      isLoading: scriptState.isLoading,
      isLoaded: scriptState.isLoaded,
      hasError: scriptState.hasError,
      errorMessage: scriptState.errorMessage,
      productsCount: scriptState.productsCount,
      lastUpdate: scriptState.lastUpdate
    };
    
    // Only log in development mode
    if (scriptState.hasError) {
      console.error('Script error details:', details);
    }
  }

  // Global error handler
  function setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error caught:', event.error);
      
      // Only log script-related errors to console
      if (event.filename && event.filename.includes('user.js')) {
        console.error('Script error:', event.message);
      }
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
    });
  }

  // Performance monitoring
  function setupPerformanceMonitoring() {
    const startTime = performance.now();
    
    // Monitor script performance
    setInterval(() => {
      const currentTime = performance.now();
      const runtime = Math.round((currentTime - startTime) / 1000);
      
      // Log performance every 5 minutes
      if (runtime % 300 === 0 && runtime > 0) {
        log(`🕐 Script running for ${runtime} seconds`);
      }
    }, 1000);
  }

  // Health check function
  function performHealthCheck() {
    const health = {
      scriptLoaded: true,
      productsLoaded: scriptState.isLoaded,
      productsCount: scriptState.productsCount,
      hasError: scriptState.hasError,
      fuseInitialized: !!fuse,
      observerActive: observerActive,
      timestamp: new Date().toISOString()
    };
    
    if (health.hasError) {
      console.warn('Health check: Script has errors');
    }
    
    return health;
  }

  // Auto-retry mechanism for failed loads
  function setupAutoRetry() {
    let retryCount = 0;
    const maxRetries = 3;
    
    const retryLoad = () => {
      retryCount++;
      if (retryCount <= maxRetries) {
        loadJSON();
      }
    };
    
    // Auto-retry on error
    if (scriptState.hasError) {
      setTimeout(retryLoad, 5000);
    }
  }

  // Enhanced Loading State Manager
  const LoadingStateManager = {
    states: {
      INITIALIZING: 'initializing',
      LOADING_DATA: 'loading_data',
      PROCESSING_DATA: 'processing_data',
      READY: 'ready',
      ERROR: 'error'
    },
    
    currentState: 'initializing',
    progress: 0,
    
    setState(newState, progress = null) {
      this.currentState = newState;
      this.progress = progress;
    },
    
    showProgress(progress) {
      this.progress = progress;
    }
  };

  // Enhanced error recovery
  function enhanceErrorRecovery() {
    // Listen for network status changes
    window.addEventListener('online', () => {
      if (scriptState.hasError) {
        loadJSON();
      }
    });
    
    window.addEventListener('offline', () => {
      console.warn('Network connection lost');
    });
    
    // Listen for visibility changes to refresh data when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && scriptState.hasError) {
        loadJSON();
      }
    });
  }

  // Keyboard shortcuts removed - completely silent operation

  // Enhanced accessibility features
  function setupAccessibility() {
    // Add screen reader announcements
    const announceToScreenReader = (message) => {
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.style.cssText = 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
      announcement.textContent = message;
      document.body.appendChild(announcement);
      
      setTimeout(() => {
        if (announcement.parentNode) {
          announcement.parentNode.removeChild(announcement);
        }
      }, 1000);
    };
    
    // Announce important state changes
    window.announceToScreenReader = announceToScreenReader;
  }

  // Help system
  function showHelp() {
    const helpMessage = `
      🎯 **חיפוש חכם מופעל!**
      
      **איך להשתמש:**
      • לחץ על שדה החיפוש כדי לפתוח את הדרופדאון
      • חפש לפי שם מוצר, ברקוד או מק"ט
      • התוצאות יודגשו אוטומטית
      
      **מצב נוכחי:**
      • מוצרים נטענו: ${scriptState.productsCount}
      • מצב: ${scriptState.isLoaded ? 'מוכן' : scriptState.isLoading ? 'טוען' : 'שגיאה'}
      
      **תמיכה:**
      אם יש בעיות, בדוק את הקונסול לפרטים
    `;
    
    // Silent in production - only show if explicitly requested
  }

  function log(...args) {
    // Only log critical errors and important status messages
    const isCritical = args[0]?.includes('❌') || 
                       args[0]?.includes('🎯') ||
                       args[0]?.includes('🔄') ||
                       args[0]?.includes('👁️') ||
                       args[0]?.includes('🔍');
   
    if (isCritical) {
      console.log('[LW-Search]', ...args);
    }
  }

  // Initialize Fuse.js for advanced search
  function initializeFuse() {
    if (!window.Fuse) {
      return false;
    }
    
    const fuseOptions = {
      keys: ['name', 'sku', 'barcode'],
      includeScore: true,
      findAllMatches: true,
      ...SEARCH_CONFIG
    };
    
    fuse = new Fuse(productList, fuseOptions);
    return true;
  }

  // Build extended search pattern for Fuse.js
  function buildExtendedSearchPattern(searchText) {
    return searchText
      .trim()
      .split(/\s+/)
      .map(word => word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"")) // Clean special characters
      .filter(word => word.length > 0) // Remove empty words after cleaning
      .map(word => `'${word}`)
      .join(' ');
  }

  // Debounce utility function
  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Smart highlighting function that safely handles HTML content
  function smartHighlightMatchingTerms(text, searchTerms) {
    if (!searchTerms || searchTerms.length === 0) {
      return text;
    }
    
    // Handle Hebrew text properly - split by spaces and filter empty terms
    const terms = searchTerms.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      return text;
    }
    
    // Create a temporary element to safely work with HTML content
    const tempElement = document.createElement('div');
    tempElement.innerHTML = text;
    
    // Get the text content for comparison (without HTML tags)
    const textContent = tempElement.innerText || tempElement.textContent || '';
    
    // Find all text nodes and highlight them
    function highlightTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent;
        let highlightedText = nodeText;
        
        // Escape special regex characters in each term and support partial matches
        const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
        
        // Replace matches with highlighted version
        highlightedText = nodeText.replace(pattern, '<mark>$1</mark>');
        
        // If we found matches, replace the text node with HTML
        if (highlightedText !== nodeText) {
          const span = document.createElement('span');
          span.innerHTML = highlightedText;
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Recursively process child nodes
        const childNodes = Array.from(node.childNodes);
        childNodes.forEach(childNode => highlightTextNodes(childNode));
      }
    }
    
    // Process all nodes in the temporary element
    highlightTextNodes(tempElement);
    
    return tempElement.innerHTML;
  }

  // Keyboard navigation handler for Select2
  function setupSelect2KeyboardNavigation(select2Container) {
    const searchInput = select2Container.querySelector('.select2-search__field');
    if (!searchInput) return;
    
    searchInput.addEventListener('keydown', function(e) {
      const dropdown = document.querySelector('.select2-dropdown');
      if (!dropdown) return;
      
      const options = dropdown.querySelectorAll('.select2-results__option');
      let currentIndex = -1;
      
      // Find currently highlighted option
      options.forEach((option, index) => {
        if (option.classList.contains('select2-results__option--highlighted')) {
          currentIndex = index;
        }
      });
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          currentIndex = Math.min(currentIndex + 1, options.length - 1);
          updateSelect2Highlight(options, currentIndex);
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          currentIndex = Math.max(currentIndex - 1, 0);
          updateSelect2Highlight(options, currentIndex);
          break;
          
        case 'Enter':
          e.preventDefault();
          if (currentIndex >= 0 && currentIndex < options.length) {
            options[currentIndex].click();
          }
          break;
          
        case 'Escape':
          e.preventDefault();
          // Close Select2 dropdown
          const select2Instance = window.jQuery && window.jQuery(select2Container).data('select2');
          if (select2Instance) {
            select2Instance.close();
          }
          break;
      }
    });
  }
  
  // Update Select2 highlight
  function updateSelect2Highlight(options, index) {
    options.forEach((option, i) => {
      if (i === index) {
        option.classList.add('select2-results__option--highlighted');
        option.style.backgroundColor = '#007bff';
        option.style.color = 'white';
        
        // Update all child elements to white color
        const childElements = option.querySelectorAll('*');
        childElements.forEach(child => {
          if (child.tagName !== 'MARK') { // Don't change mark elements
            child.style.color = 'white';
          }
        });
        
        option.scrollIntoView({ block: 'nearest' });
      } else {
        option.classList.remove('select2-results__option--highlighted');
        option.style.backgroundColor = '';
        option.style.color = '';
        
        // Reset all child elements to default color
        const childElements = option.querySelectorAll('*');
        childElements.forEach(child => {
          if (child.tagName !== 'MARK') { // Don't change mark elements
            child.style.color = '';
          }
        });
      }
    });
  }

  // Debounced search for Select2
  function setupSelect2DebouncedSearch(select2Container) {
    const searchInput = select2Container.querySelector('.select2-search__field');
    if (!searchInput) return;
    
    // Create debounced search function
    const debouncedSelect2Search = debounce((searchTerm) => {
      // Trigger Select2's internal search
      const select2Instance = window.jQuery && window.jQuery(select2Container).data('select2');
      if (select2Instance && select2Instance.dataAdapter) {
        // Use Select2's internal search mechanism
        select2Instance.dataAdapter.query({
          term: searchTerm,
          callback: function(data) {
            // The results will be automatically updated by Select2
          }
        });
      }
    }, 300);
    
    // Add input listener
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value;
      debouncedSelect2Search(searchTerm);
    });
  }

  // Enhance Select2 results with smart highlighting
  function enhanceSelect2Results() {
    // Watch for Select2 dropdown updates
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('select2-results__option')) {
              // Apply smart highlighting to new options
              const optionText = node.textContent || node.innerText;
              const searchInput = document.querySelector('.select2-search__field');
              const currentTerm = searchInput ? searchInput.value : '';
              
              if (currentTerm && optionText) {
                const highlightedText = smartHighlightMatchingTerms(optionText, currentTerm);
                if (highlightedText !== optionText) {
                  node.innerHTML = highlightedText;
                }
              }
            }
          });
        }
      });
    });
    
    // Observe Select2 dropdown
    const select2Dropdown = document.querySelector('.select2-dropdown');
    if (select2Dropdown) {
      observer.observe(select2Dropdown, {
        childList: true,
        subtree: true
      });
    }
  }

  // Watch for Select2 dropdown opening and apply enhancements
  function watchSelect2Dropdown() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const dropdown = mutation.target;
          if (dropdown.classList.contains('select2-dropdown') && 
              dropdown.style.display !== 'none' && 
              dropdown.style.visibility !== 'hidden') {
            
            // Apply keyboard navigation to the search input
            const searchInput = dropdown.querySelector('.select2-search__field');
            if (searchInput) {
              setupSelect2KeyboardNavigation(dropdown.closest('.select2-container'));
              setupSelect2DebouncedSearch(dropdown.closest('.select2-container'));
            }
            
            // Apply smart highlighting to results
            enhanceSelect2Results();
          }
        }
      });
    });
    
    // Observe all Select2 dropdowns
    document.addEventListener('DOMContentLoaded', () => {
      const select2Dropdowns = document.querySelectorAll('.select2-dropdown');
      select2Dropdowns.forEach(dropdown => {
        observer.observe(dropdown, {
          attributes: true,
          attributeFilter: ['style']
        });
      });
    });
    
    // Also watch for new Select2 dropdowns being added
    const bodyObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('select2-dropdown')) {
              observer.observe(node, {
                attributes: true,
                attributeFilter: ['style']
              });
            }
          });
        }
      });
    });
    
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Highlight matching terms in text
  function highlightMatchingTerms(text, searchTerms) {
    if (!searchTerms || searchTerms.length === 0) {
      return text;
    }
    
    // Handle Hebrew text properly - split by spaces and filter empty terms
    const terms = searchTerms.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      return text;
    }
    
    // Escape special regex characters in each term and support partial matches
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const result = text.replace(pattern, '<mark>$1</mark>');
    
    return result;
  }

  // Decorate Select2 element with smart search UI
  function decorateSmartSearchUI(selectionElement) {
    if (!selectionElement || selectionElement.classList.contains('smart-enhanced')) {
      return;
    }
    
    // Add smart-enhanced class to prevent duplicate decoration
    selectionElement.classList.add('smart-enhanced');
    
    // Add glow effect with animation end listener
    selectionElement.classList.add('smart-boost-glow');
    selectionElement.addEventListener('animationend', () => {
      selectionElement.classList.remove('smart-boost-glow');
    }, { once: true });
    
    // Add badge with lightning icon
    if (!selectionElement.querySelector('.smart-boost-badge')) {
      const badge = document.createElement('span');
      badge.className = 'smart-boost-badge';
      badge.innerHTML = '';
      selectionElement.appendChild(badge);
    }
    
    // Add smart tooltip
    selectionElement.title = 'חיפוש חכם מופעל – בחר מוצר בלחיצה';
    
  }

  // Find Select2 selection element (supports both single and multiple)
  function findSelect2SelectionElement(container) {
    // Try single selection first
    let selectionEl = container.querySelector('.select2-selection.select2-selection--single');
    
    // If not found, try multiple selection
    if (!selectionEl) {
      selectionEl = container.querySelector('.select2-selection.select2-selection--multiple');
    }
    
    // If still not found, try any selection element
    if (!selectionEl) {
      selectionEl = container.querySelector('.select2-selection');
    }
    
    return selectionEl;
  }

  // Advanced search function using Fuse.js
  function advancedSearch(queryText) {
    if (!fuse) {
      return basicSearch(queryText);
    }
    
    const query = queryText.trim();
    if (!query) {
      return productList;
    }
    
    // Use the unified pattern builder
    const searchPattern = buildExtendedSearchPattern(query);
    
    const results = fuse.search(searchPattern);
    
    // Convert Fuse results to product objects and sort by score
    const sortedResults = results
      .map(result => ({
        ...result.item,
        score: result.score
      }))
      .filter(result => result.score < 0.5) // Filter out low-relevance results
      .sort((a, b) => (a.score || 1) - (b.score || 1));
    
    return sortedResults;
  }

  // Basic search function as fallback
  function basicSearch(queryText) {
    const searchTerm = queryText.toLowerCase().trim();
    if (!searchTerm) {
      return productList;
    }
    
    // Split query into terms for non-adjacent word support
    const terms = searchTerm.split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) {
      return productList;
    }
    
    return productList.filter(product => {
      const name = product.name.toLowerCase();
      const barcode = product.barcode.toLowerCase();
      const sku = product.sku.toLowerCase();
      
      // Check if all terms are found in any field
      return terms.every(term =>
        name.includes(term) ||
        barcode.includes(term) ||
        sku.includes(term)
      );
    });
  }

  // Add custom CSS for tooltips and dropdown


  function addCustomCSS() {
    // Add loading CSS first
    addLoadingCSS();
    
    const style = document.createElement('style');
    style.textContent = `
      /* Tooltip styles for disabled inputs */
      input[data-tooltip] {
        position: relative;
      }
      
      input[data-tooltip]:hover::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 5px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 100000;
        pointer-events: none;
      }
      
      input[data-tooltip]:hover::before {
        content: '';
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: #333;
        z-index: 100000;
        pointer-events: none;
      }
      
      /* Tooltip wrapper styles for disabled inputs */
      .lw-tooltip-wrapper {
        position: relative;
        display: inline-block;
        width: 100%;
        cursor: help;
      }
      
      .lw-tooltip-wrapper:hover::after {
        content: attr(title);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 5px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 100000;
        pointer-events: none;
        margin-bottom: 5px;
      }
      
      .lw-tooltip-wrapper:hover::before {
        content: '';
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: #333;
        z-index: 100000;
        pointer-events: none;
        margin-bottom: -5px;
      }
      
      /* Custom dropdown styles - ONLY our specific dropdown */
      #lw-custom-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ccc;
        border-top: none;
        max-height: 300px;
        overflow-y: auto;
        z-index: 99999;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        display: none;
      }
      #lw-custom-dropdown .search-input {
        width: 100%;
        padding: 8px;
        border: none;
        border-bottom: 1px solid #eee;
        outline: none;
      }
      #lw-custom-dropdown .results-container {
        max-height: 250px;
        overflow-y: auto;
      }
      #lw-custom-dropdown .product-item {
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        display: block;
      }
      #lw-custom-dropdown .product-item:hover {
        background-color: #f5f5f5;
      }
      #lw-custom-dropdown .product-name {
        flex: 1;
        text-align: right;
      }
      #lw-custom-dropdown .product-sku {
        color: #666;
        font-size: 0.9em;
        margin-right: 10px;
      }
      #lw-custom-dropdown .show-more-btn {
        padding: 8px 12px;
        background: #007bff;
        color: white;
        border: none;
        cursor: pointer;
        width: 100%;
        text-align: center;
      }
      #lw-custom-dropdown .show-more-btn:hover {
        background: #007bff;
      }
      
      /* Smart Search Highlight Styles */
      .smart-boost-badge {
        position: absolute;
        top: 50%;
        right: -25px;
        transform: translateY(-50%);
        color: #ff8c00;
        font-size: 16px;
        z-index: 999999 !important;
        pointer-events: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
      }
      .smart-boost-badge i {
        color: #ff8c00 !important;
        font-size: 16px;
      }
      /* Mark highlighting - ONLY in our enhanced elements */
      #lw-custom-dropdown mark,
      .select2-container.smart-enhanced mark,
      .select2-container.smart-enhanced .select2-results__option mark,
      .select2-container.smart-enhanced .select2-dropdown mark {
        background: #ffeb3b !important;
        color: #000 !important;
        padding: 0 2px !important;
        border-radius: 2px !important;
        font-weight: bold !important;
        text-shadow: none !important;
        box-shadow: 0 0 2px rgba(0,0,0,0.3) !important;
      }
      
      /* Custom dropdown highlighting - ONLY in our custom dropdown */
      #lw-custom-dropdown mark {
        background: #ffeb3b !important;
        color: #000 !important;
        padding: 0 2px !important;
        border-radius: 2px !important;
        font-weight: bold !important;
        text-shadow: none !important;
        box-shadow: 0 0 2px rgba(0,0,0,0.3) !important;
      }
      
      /* Ensure highlighting works in all contexts - ONLY in our custom dropdown */
      #lw-custom-dropdown mark,
      #lw-custom-dropdown .product-item mark,
      #lw-custom-dropdown div mark {
        background: #ffeb3b !important;
        color: #000 !important;
        padding: 0 2px !important;
        border-radius: 2px !important;
        font-weight: bold !important;
        text-shadow: none !important;
        box-shadow: 0 0 2px rgba(0,0,0,0.3) !important;
      }
      
      /* Keyboard navigation styles - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item.highlighted {
        background-color: #007bff !important;
        color: white !important;
        border: 2px solid #007bff !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted:hover {
        background-color: #007bff !important;
      }
      
      /* Ensure all text elements turn white when highlighted - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item.highlighted * {
        color: white !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      /* Hover styles for product items - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item:hover {
        background-color: #007bff !important;
        color: white !important;
      }
      
      #lw-custom-dropdown .product-item:hover * {
        color: white !important;
      }
      
      #lw-custom-dropdown .product-item:hover mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      /* Ensure product items are properly styled - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item {
        border: 1px solid transparent !important;
        cursor: pointer !important;
        display: block !important;
        /* Remove transition for instant hover feedback */
      }
      
      /* Ensure proper spacing for product content */
      #lw-custom-dropdown .product-item > div {
        display: block !important;
        margin-bottom: 4px !important;
      }
      
      #lw-custom-dropdown .product-item > div:last-child {
        margin-bottom: 0 !important;
      }
      
      /* Instant hover styles for product items - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item:hover {
        background-color: #007bff !important;
        color: white !important;
        border-color: #007bff !important;
      }
      
      #lw-custom-dropdown .product-item:hover * {
        color: white !important;
      }
      
      #lw-custom-dropdown .product-item:hover mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      /* Highlighted state (keyboard navigation) - ONLY in our custom dropdown */
      #lw-custom-dropdown .product-item.highlighted {
        background-color: #007bff !important;
        color: white !important;
        border: 2px solid #007bff !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted * {
        color: white !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      #lw-custom-dropdown .product-item.highlighted:hover {
        background-color: #007bff !important;
        border-color: #003d82 !important;
      }
      
      /* Select2 keyboard navigation styles - ONLY for our enhanced Select2 */
      .select2-container.smart-enhanced .select2-results__option--highlighted {
        background-color: #007bff !important;
        color: white !important;
      }
      
      .select2-container.smart-enhanced .select2-results__option--highlighted * {
        color: white !important;
      }
      
      .select2-container.smart-enhanced .select2-results__option--highlighted mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      /* Select2 hover styles - ONLY for our enhanced Select2 */
      .select2-container.smart-enhanced .select2-results__option:hover {
        background-color: #007bff !important;
        color: white !important;
      }
      
      .select2-container.smart-enhanced .select2-results__option:hover * {
        color: white !important;
      }
      
      .select2-container.smart-enhanced .select2-results__option:hover mark {
        background: #ffeb3b !important;
        color: #000 !important;
      }
      
      /* Enhanced loading and error states */
      .lw-dropdown-loading {
        padding: 20px;
        text-align: center;
        color: #666;
        font-style: italic;
      }
      
      .lw-dropdown-error {
        padding: 16px;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        color: #721c24;
        text-align: center;
        margin: 8px;
      }
      
      .lw-dropdown-error button {
        background: #dc3545;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        margin-top: 8px;
        cursor: pointer;
        font-size: 12px;
      }
      
      .lw-dropdown-error button:hover {
        background: #c82333;
      }
      
      /* Show more button styles - ONLY in our custom dropdown */
      #lw-custom-dropdown div[style*="הצג עוד מוצרים"] {
        transition: none !important;
      }
      
      #lw-custom-dropdown div[style*="הצג עוד מוצרים"]:hover {
        background-color: #e9ecef !important;
      }
    `;
    document.head.appendChild(style);
  }

  function loadJSON() {
    LoadingStateManager.setState(LoadingStateManager.states.LOADING_DATA, 0);
    updateScriptState({ isLoading: true, hasError: false, errorMessage: '' });
    
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      const currentProgress = LoadingStateManager.progress;
      if (currentProgress < 90) {
        LoadingStateManager.showProgress(currentProgress + 10);
      }
    }, 500);
    
    GM_xmlhttpRequest({
      method: 'GET',
      url: JSON_URL,
      timeout: 30000, // 30 second timeout
      onload: function (response) {
        clearInterval(progressInterval);
        LoadingStateManager.showProgress(95);
        
        try {
          if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          LoadingStateManager.setState(LoadingStateManager.states.PROCESSING_DATA, 95);
          
          const json = JSON.parse(response.responseText);
          productList = Object.entries(json).map(([barcode, entry]) => ({
            barcode,
            sku: entry.sku,
            name: entry.name
          }));
          
          LoadingStateManager.showProgress(100);
          
          updateScriptState({ 
            isLoading: false, 
            isLoaded: true, 
            productsCount: productList.length, 
            lastUpdate: new Date() 
          });
          
          LoadingStateManager.setState(LoadingStateManager.states.READY);
          
          // Initialize Fuse.js after loading products
          if (window.Fuse) {
            initializeFuse();
          } else {
            // Wait for Fuse.js to be available
            const checkFuse = setInterval(() => {
              if (window.Fuse) {
                clearInterval(checkFuse);
                initializeFuse();
              }
            }, 100);
          }
          
          addCustomCSS(); // Add CSS before starting observer
          startObserver(); // Start observing only after JSON is loaded
        } catch (err) {
          clearInterval(progressInterval);
          console.warn(`❌ Failed to parse JSON`, err);
          LoadingStateManager.setState(LoadingStateManager.states.ERROR);
          updateScriptState({ 
            isLoading: false, 
            hasError: true, 
            errorMessage: `שגיאה בניתוח הנתונים: ${err.message}` 
          });
        }
      },
      onerror: function (err) {
        clearInterval(progressInterval);
        console.warn(`❌ Failed to fetch JSON`, err);
        LoadingStateManager.setState(LoadingStateManager.states.ERROR);
        updateScriptState({ 
          isLoading: false, 
          hasError: true, 
          errorMessage: `שגיאה בטעינת הנתונים מהשרת: ${err.message || 'בעיית תקשורת'}` 
        });
      },
      ontimeout: function () {
        clearInterval(progressInterval);
        console.warn(`❌ Request timeout`);
        LoadingStateManager.setState(LoadingStateManager.states.ERROR);
        updateScriptState({ 
          isLoading: false, 
          hasError: true, 
          errorMessage: 'פג תוקף הבקשה - בדוק את חיבור האינטרנט' 
        });
      }
    });
  }

  function findSearchFields() {
    // Look for Select2 containers first (this is what Lionwheel uses)
    const select2Containers = document.querySelectorAll('.select2-container');
    if (select2Containers.length > 0) {
      // For each Select2 container, find the hidden select element
      const hiddenSelects = [];
      select2Containers.forEach((container, index) => {
        // Look for the hidden select element within the container
        const hiddenSelect = container.querySelector('select.select2-hidden-accessible');
        if (hiddenSelect) {
          if (index === 0) { // Only log first one to avoid spam
          }
          hiddenSelects.push(hiddenSelect);
        }
      });
      
      if (hiddenSelects.length > 0) {
        return hiddenSelects;
      }
    }

    // Fallback: look for various possible search field selectors
    const selectors = [
      'select[name="product"]',
      'select[name="barcode"]',
      'select[name="sku"]',
      'select[name="products-select"]',
      'select[data-placeholder*="מוצר"]',
      'select[data-placeholder*="product"]',
      'select[placeholder*="מוצר"]',
      'select[placeholder*="product"]',
      'select.select2-hidden-accessible',
      'input[type="search"]',
      'input[placeholder*="חיפוש"]',
      'input[placeholder*="search"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {

        return Array.from(elements);
      }
    }

    return [];
  }

  function waitForJQuery(callback, maxAttempts = 300) { // Increased to 60 seconds
    let attempts = 0;
    
    function checkJQuery() {
      attempts++;
      
      // Check if jQuery exists at all
      if (!window.jQuery) {
        if (attempts === 1) {
        }
        
        // Even without jQuery, check if Select2 containers exist
        const select2Containers = document.querySelectorAll('.select2-container');
        if (select2Containers.length > 0) {
          callback();
          return;
        }
        
        if (attempts >= maxAttempts) {
          return;
        }
        setTimeout(checkJQuery, 200);
        return;
      }
      
      // Check if Select2 plugin is available
      if (typeof window.jQuery.fn.select2 !== 'function' && !window.Select2) {
        if (attempts === 1) {
        }
        
        // Even without Select2 plugin, check if containers exist
        const select2Containers = document.querySelectorAll('.select2-container');
        if (select2Containers.length > 0) {
          callback();
          return;
        }
        
        if (attempts >= maxAttempts) {
          return;
        }
        setTimeout(checkJQuery, 200);
        return;
      }
      
      callback();
    }
    
    checkJQuery();
  }

  function enhanceSelect2Vanilla(field) {
    try {
      
      // Explicitly destroy any existing jQuery Select2 instance to prevent conflicts
      if (window.jQuery && window.jQuery(field).data('select2')) {
        try {
          window.jQuery(field).select2('destroy');
        } catch (destroyError) {
          // Silent fail
        }
      }
      
      // Check if the field has Select2 data attribute
      const select2Data = field.getAttribute('data-select2-id');
      
      // Look for the Select2 container
      const container = field.closest('.select2-container') || 
                       document.querySelector(`[data-select2-id="${select2Data}"]`);
      
      if (container) {
        
        // Check if we already created a custom dropdown for this container
        const existingDropdown = container.querySelector('#lw-custom-dropdown');
        if (existingDropdown) {
          return true;
        }
        
        // Instead of creating dropdown immediately, wait for the field to be clicked
        setupClickListeners(container, field);
        
        // Add smart search highlight effect
        const selectionEl = findSelect2SelectionElement(container);
        if (selectionEl) {
          decorateSmartSearchUI(selectionEl);
        }
        
        // Add keyboard navigation support
        setupSelect2KeyboardNavigation(container);
        setupSelect2DebouncedSearch(container);
        enhanceSelect2Results();
        
        return true;
      }
      
    } catch (error) {
      // Silent fail
    }
    
    return false;
  }

  function setupClickListeners(container, field) {
    
    // Add a global click listener that watches for when Select2 opens
    document.addEventListener('click', (e) => {
      // Check if the click was on our container or its children
      if (container.contains(e.target)) {
        
        // Check if Select2 dropdown is now visible
        const select2Dropdown = document.querySelector('.select2-dropdown');
        if (select2Dropdown && select2Dropdown.style.display !== 'none') {
          
          // Prevent the default Select2 dropdown from showing
          select2Dropdown.style.display = 'none';
          
          // Create and show our custom dropdown
          createCustomDropdownOverlay(container, field);
          showCustomDropdown(container, field);
        }
      }
    });
    
    // Also add a mutation observer to watch for when Select2 elements are added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              // Check if this is a Select2 selection element
              if (node.classList && (
                node.classList.contains('select2-selection') ||
                node.classList.contains('select2-selection__rendered') ||
                node.classList.contains('selection')
              )) {
                node.addEventListener('click', (e) => {
                  e.stopPropagation();
                  createCustomDropdownOverlay(container, field);
                  showCustomDropdown(container, field);
                });
              }
            }
          });
        }
      });
    });
    
    observer.observe(container, {
      childList: true,
      subtree: true
    });
    
  }

  function createCustomDropdownOverlay(container, field) {
    
    // Check if dropdown already exists
    const existingDropdown = container.querySelector('#lw-custom-dropdown');
    if (existingDropdown) {
      return;
    }
    
    // Create our custom dropdown
    const customDropdown = document.createElement('div');
    customDropdown.id = 'lw-custom-dropdown';
    customDropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 99999;
      max-height: 300px;
      overflow-y: auto;
      display: none;
      width: 100%;
    `;
    
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'חפש מוצר לפי שם, ברקוד או מק"ט...';
    searchInput.style.cssText = `
      width: 100%;
      padding: 8px;
      border: none;
      border-bottom: 1px solid #eee;
      outline: none;
      font-size: 14px;
    `;
    
    
    // Create results container
    const resultsContainer = document.createElement('div');
    resultsContainer.style.cssText = `
      max-height: 250px;
      overflow-y: auto;
    `;
    
    
    // Add search and results to dropdown
    customDropdown.appendChild(searchInput);
    customDropdown.appendChild(resultsContainer);
    
    // Add dropdown to container
    container.style.position = 'relative';
    container.appendChild(customDropdown);
    
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!customDropdown.contains(e.target) && !container.contains(e.target)) {
        customDropdown.style.display = 'none';
        
        // Show the native Select2 dropdown again when our custom dropdown is closed
        const nativeDropdowns = document.querySelectorAll('.select2-dropdown');
        nativeDropdowns.forEach(dropdown => {
          dropdown.style.display = '';
          dropdown.style.visibility = '';
          dropdown.style.opacity = '';
          dropdown.style.zIndex = '';
        });
      }
    });
    
  }

  function showCustomDropdown(container, field) {
    
    // Find or create the custom dropdown
    let customDropdown = container.querySelector('#lw-custom-dropdown');
    if (!customDropdown) {
      createCustomDropdownOverlay(container, field);
      customDropdown = container.querySelector('#lw-custom-dropdown');
    }
    
    if (!customDropdown) {
      return;
    }
    
    // Hide the native Select2 dropdown first
    const nativeDropdown = document.querySelector('.select2-dropdown');
    if (nativeDropdown) {
      nativeDropdown.style.display = 'none';
      nativeDropdown.style.visibility = 'hidden';
      nativeDropdown.style.opacity = '0';
      nativeDropdown.style.zIndex = '-1';
    }
    
    // Also hide any other Select2 dropdowns that might be open
    const allSelect2Dropdowns = document.querySelectorAll('.select2-dropdown');
    allSelect2Dropdowns.forEach(dropdown => {
      dropdown.style.display = 'none';
      dropdown.style.visibility = 'hidden';
      dropdown.style.opacity = '0';
      dropdown.style.zIndex = '-1';
    });
    
    // Show dropdown
    customDropdown.style.display = 'block';
    
    // Get the results container and search input
    const resultsContainer = customDropdown.querySelector('div:last-child');
    const searchInput = customDropdown.querySelector('input');
    
    if (!resultsContainer || !searchInput) {
      return;
    }
    
    // Populate with all products initially
    populateResults(resultsContainer, productList, container, field);
    
    // Focus on search input
    searchInput.focus();
    
    // Verify product items exist for keyboard navigation
    setTimeout(() => {
      const productItems = resultsContainer.querySelectorAll('.product-item');
      if (productItems.length === 0) {
        console.warn(`⚠️ [LW-Search] No product items found for keyboard navigation!`);
      }
    }, 100);
    
    // Keyboard navigation state
    let currentHighlightIndex = -1;
    let currentProducts = [];
    
    // Initialize keyboard navigation
    function initializeKeyboardNavigation() {
      const productItems = resultsContainer.querySelectorAll('.product-item');
      
      // Reset highlight index
      currentHighlightIndex = -1;
      
      // Clear any existing highlights
      productItems.forEach(item => {
        item.classList.remove('highlighted');
        item.style.backgroundColor = 'white';
        item.style.color = 'black';
      });
      
      // Set focus on search input
      searchInput.focus();
    }
    
    // Initialize when dropdown opens
    initializeKeyboardNavigation();
    
    // Debounced search function
    const debouncedSearch = debounce((searchTerm) => {
      try {
        // Use advanced search with Fuse.js
        const filteredProducts = advancedSearch(searchTerm);
        currentProducts = filteredProducts;
        currentHighlightIndex = -1; // Reset highlight when search changes
        populateResults(resultsContainer, filteredProducts, container, field);
        
        // Reset isSearching flag
        isSearching = false;
        
        // Re-initialize keyboard navigation after results update
        setTimeout(() => {
          initializeKeyboardNavigation();
        }, 50);
      } catch (error) {
        console.error('Search error:', error);
        isSearching = false;
        
        const errorDiv = DropdownLoadingStates.createErrorState(
          resultsContainer, 
          error.message, 
          '() => { populateResults(resultsContainer, productList, container, field); }'
        );
        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(errorDiv);
      }
    }, 300);
    
    // Add search functionality with debouncing and loading states
    let isSearching = false;
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value;
      
      // Show loading state immediately for better UX
      if (searchTerm.length > 0 && !isSearching) {
        isSearching = true;
        const loadingDiv = DropdownLoadingStates.createLoadingState(resultsContainer, 'מחפש מוצרים...');
        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(loadingDiv);
      }
      
      // Use debounced search
      debouncedSearch(searchTerm);
    });
    
    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
      const productItems = resultsContainer.querySelectorAll('.product-item');
      
      // Check if we have product items to navigate
      if (productItems.length === 0) {
        return;
      }
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          currentHighlightIndex = Math.min(currentHighlightIndex + 1, productItems.length - 1);
          updateHighlight(productItems);
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          currentHighlightIndex = Math.max(currentHighlightIndex - 1, -1);
          updateHighlight(productItems);
          break;
          
        case 'Enter':
          e.preventDefault();
          if (currentHighlightIndex >= 0 && currentHighlightIndex < productItems.length) {
            productItems[currentHighlightIndex].click();
          }
          break;
          
        case 'Escape':
          e.preventDefault();
          customDropdown.style.display = 'none';
          break;
      }
    });
    
    // Function to update highlight
    function updateHighlight(productItems) {
      if (productItems.length === 0) {
        return;
      }
      
      productItems.forEach((item, index) => {
        if (index === currentHighlightIndex) {
          item.classList.add('highlighted');
          item.style.backgroundColor = '#007bff';
          item.style.color = 'white';
          
          // Update all child elements to white color
          const childElements = item.querySelectorAll('*');
          childElements.forEach(child => {
            if (child.tagName !== 'MARK') { // Don't change mark elements
              child.style.color = 'white';
            }
          });
          
          // Scroll into view if needed
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('highlighted');
          item.style.backgroundColor = 'white';
          item.style.color = 'black';
          
          // Reset all child elements to default color
          const childElements = item.querySelectorAll('*');
          childElements.forEach(child => {
            if (child.tagName !== 'MARK') { // Don't change mark elements
              child.style.color = '';
            }
          });
        }
      });
    }
    
    // Mouse hover should update highlight index
    resultsContainer.addEventListener('mouseover', (e) => {
      const productItem = e.target.closest('.product-item');
      if (productItem) {
        const productItems = resultsContainer.querySelectorAll('.product-item');
        currentHighlightIndex = Array.from(productItems).indexOf(productItem);
        updateHighlight(productItems);
      }
    });
    
    // Reset highlight when dropdown is closed
    const resetHighlight = () => {
      currentHighlightIndex = -1;
      const productItems = resultsContainer.querySelectorAll('.product-item');
      productItems.forEach(item => item.classList.remove('highlighted'));
    };
    
    // Listen for dropdown close events
    document.addEventListener('click', (e) => {
      if (!customDropdown.contains(e.target) && !container.contains(e.target)) {
        resetHighlight();
      }
    });
  }

  function populateResults(resultsContainer, products, container, field) {
    
    // Clear existing results
    resultsContainer.innerHTML = '';
    
    // Check if we're still loading
    if (scriptState.isLoading) {
      const loadingDiv = DropdownLoadingStates.createLoadingState(resultsContainer, 'טוען מוצרים...');
      resultsContainer.appendChild(loadingDiv);
      return;
    }
    
    // Check if there's an error
    if (scriptState.hasError) {
      const errorDiv = DropdownLoadingStates.createErrorState(
        resultsContainer, 
        scriptState.errorMessage, 
        'loadJSON'
      );
      resultsContainer.appendChild(errorDiv);
      return;
    }
    
    // Check if no products loaded
    if (!scriptState.isLoaded || products.length === 0) {
      const noDataDiv = DropdownLoadingStates.createEmptyState(
        resultsContainer, 
        'לא נטענו מוצרים'
      );
      resultsContainer.appendChild(noDataDiv);
      return;
    }
    
    // Show success state briefly if we have results
    if (products.length > 0 && products.length < productList.length) {
      const successDiv = DropdownLoadingStates.createSuccessState(resultsContainer, products.length);
      resultsContainer.appendChild(successDiv);
      
      // Remove success message after 2 seconds
      setTimeout(() => {
        if (successDiv.parentNode) {
          successDiv.remove();
        }
      }, 2000);
    }
    
    // Pagination state
    let page = 0;
    const pageSize = 15;
    
    function renderPage() {
      // Always hide the native Select2 dropdown
      const allSelect2Dropdowns = document.querySelectorAll('.select2-dropdown');
      allSelect2Dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
        dropdown.style.visibility = 'hidden';
        dropdown.style.opacity = '0';
        dropdown.style.zIndex = '-1';
      });
      
      // Remove previous results (but keep success message if it exists)
      const successMessage = resultsContainer.querySelector('.lw-dropdown-loading');
      resultsContainer.innerHTML = '';
      if (successMessage) {
        resultsContainer.appendChild(successMessage);
      }
      
      const start = page * pageSize;
      const end = Math.min(start + pageSize, products.length);
      const productsToShow = products.slice(0, end);
      const hasMore = end < products.length;
      
      
      // Add products
      productsToShow.slice(start).forEach((product, index) => {
        const option = document.createElement('div');
        option.className = 'product-item';
        option.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f0f0f0;
          font-size: 14px;
        `;
        
        // Get current search term for highlighting
        const searchInput = document.querySelector('#lw-custom-dropdown input');
        const currentTerm = searchInput ? searchInput.value : '';
        
        // Highlight matching terms using smart highlighting
        const highlightedName = smartHighlightMatchingTerms(product.name, currentTerm);
        const highlightedSku = smartHighlightMatchingTerms(product.sku, currentTerm);
        const highlightedBarcode = smartHighlightMatchingTerms(product.barcode, currentTerm);
        
        

        
        option.innerHTML = `
          <div style="font-weight: bold; display: block; margin-bottom: 8px; line-height: 1.4;">${highlightedName}</div>
          <div style="font-size: 12px; color: #666; display: block; margin-bottom: 4px; line-height: 1.2;">מק\"ט: ${highlightedSku}</div>
          <div style="font-size: 12px; color: #666; display: block; line-height: 1.2;">ברקוד: ${highlightedBarcode}</div>
        `;
        
        // Add click handler
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Store the selected product globally
          selectedProduct = product;
          
          // Update the Select2 selection
          const selection = container.querySelector('.select2-selection__rendered');
          if (selection) {
            selection.textContent = `${product.name} (${product.sku})`;
          }
          
          // Update the hidden field value
          field.value = product.barcode;
          
          // Trigger change event on the field
          field.dispatchEvent(new Event('change', { bubbles: true }));
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('select', { bubbles: true }));
          
          // Also try to update the main Select2 field in the modal
          const modal = document.querySelector('#order-items-edit-modal');
          if (modal) {
            const modalSelect2Field = modal.querySelector('select[name="product"]');
            const modalSelection = modal.querySelector('.select2-selection__rendered');
            
            if (modalSelect2Field) {
              modalSelect2Field.value = product.barcode;
            }
            
            if (modalSelection) {
              modalSelection.textContent = `${product.name} (${product.sku})`;
            }
          }
          
          // Hide our custom dropdown
          const customDropdown = document.getElementById('lw-custom-dropdown');
          if (customDropdown) {
            customDropdown.style.display = 'none';
          }
          
        });
        
        resultsContainer.appendChild(option);
      });
      
      console.log(`✅ [LW-Search] Added ${productsToShow.slice(start).length} product items to results container`);
      
      // Add "show more" button if there are more products
      if (hasMore) {
        const showMoreButton = document.createElement('div');
        showMoreButton.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          background-color: #f8f9fa;
          border-top: 1px solid #dee2e6;
          text-align: center;
          font-weight: bold;
          color: #007bff;
        `;
        showMoreButton.textContent = `הצג עוד מוצרים... (${products.length - end} נשארו)`;
        
        showMoreButton.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          page++;
          renderPage();
        });
        
        resultsContainer.appendChild(showMoreButton);
      }
      
      if (products.length === 0) {
        const noResults = DropdownLoadingStates.createEmptyState(resultsContainer, 'לא נמצאו תוצאות');
        resultsContainer.appendChild(noResults);
      }
      
    }
    
    // Render the first page
    renderPage();
  }

  function enhanceSelect2() {
    if (alreadyEnhanced) {
      return;
    }

    
    const searchFields = findSearchFields();
    if (searchFields.length === 0) {
      return; // No fields found, don't log anything
    }


    searchFields.forEach((field, index) => {
      
      
      try {
        // Try jQuery approach first
        const $field = window.jQuery && window.jQuery(field);
        if ($field && $field.length) {
          
          const select2Instance = $field.data('select2');
          if (select2Instance) {

            // Destroy existing Select2
            $field.select2('destroy');

            // Wait a bit then reinitialize
    setTimeout(() => {
      const select2Data = productList.map(p => ({
        id: p.barcode,
                text: `${p.name} (${p.sku})`,
                barcode: p.barcode,
                sku: p.sku,
                name: p.name
      }));

              $field.select2({
                placeholder: 'בחר מוצר או חפש לפי ברקוד/מק"ט...',
        minimumInputLength: 0,
                allowClear: true,
        data: select2Data,
        matcher: function (params, data) {
          const term = params.term?.trim() || '';
          if (!term) return data;

          // Use advanced search for better matching
          const searchPattern = buildExtendedSearchPattern(term);
          const searchResults = advancedSearch(searchPattern);
          const matchingProduct = searchResults.find(product => 
            product.barcode === data.barcode || 
            product.sku === data.sku || 
            product.name === data.name
          );

          return matchingProduct ? data : null;
        },
                templateResult: function(data, params) {
                  if (!data.id) {
                    return data.text;
                  }
                  
                  // Get the current search term from params
                  const currentTerm = params.term || '';
                  
                  // Highlight matching terms using smart highlighting
                  const highlightedName = smartHighlightMatchingTerms(data.name, currentTerm);
                  const highlightedSku = smartHighlightMatchingTerms(data.sku, currentTerm);
                  const highlightedBarcode = smartHighlightMatchingTerms(data.barcode, currentTerm);
                  
                  const result = window.jQuery(`<div>
                    <strong style="display: block; margin-bottom: 8px; line-height: 1.4;">${highlightedName}</strong>
                    <small style="display: block; margin-bottom: 4px; line-height: 1.2;">מק"ט: ${highlightedSku}</small>
                    <small style="display: block; line-height: 1.2;">ברקוד: ${highlightedBarcode}</small>
                  </div>`);
                  
                  return result;
                },
                templateSelection: function(data) {
                  if (!data.id) return data.text;
                  return `${data.name} (${data.sku})`;
                },
                escapeMarkup: function(markup) { 
                  return markup; 
                }
              });

              
              // Add smart search highlight effect
              setTimeout(() => {
                const select2Container = $field.next('.select2-container');
                if (select2Container.length) {
                  const selectionEl = findSelect2SelectionElement(select2Container[0]);
                  if (selectionEl) {
                    decorateSmartSearchUI(selectionEl);
                  }
                  
                  // Add keyboard navigation to Select2 search input
                  const select2SearchInput = select2Container.find('.select2-search__field');
                  if (select2SearchInput.length) {
                    setupSelect2KeyboardNavigation(select2Container[0]);
                    setupSelect2DebouncedSearch(select2Container[0]);
                    enhanceSelect2Results();
                  }
                }
              }, 300);
            }, 200);
            
            return;
          }
        } else {
          // Removed verbose log
          if (enhanceSelect2Vanilla(field)) {
            // Field enhanced successfully
          } else {
            // Field enhancement failed
          }
        }
      } catch (error) {
        // Silent fail
      }
    });

      alreadyEnhanced = true;
  }

  function checkAndEnhance() {
    
    const searchFields = findSearchFields();
    const hasSelect2 = window.jQuery && typeof window.jQuery.fn.select2 === 'function';
    const hasData = productList.length > 0;



    if (searchFields.length > 0 && hasData) {
      // Check if any field has Select2 initialized (jQuery approach)
      if (hasSelect2) {
        const hasInitializedSelect2 = searchFields.some(field => {
          const $field = window.jQuery && window.jQuery(field);
          const hasSelect2 = $field && $field.data('select2');
          return hasSelect2;
        });

        if (hasInitializedSelect2) {
          enhanceSelect2();
          return true;
        }
      }
      
      // Check if there are Select2 containers on the page (vanilla approach)
      const select2Containers = document.querySelectorAll('.select2-container');
      if (select2Containers.length > 0) {
        enhanceSelect2();
        return true;
      }
    }

    return false;
  }

  function startObserver() {
    if (observerActive) return;
    
    
    // Check if Select2 is available in any form
    if (typeof window.Select2 === 'function') {
      // Select2 is available
    } else if (window.jQuery && typeof window.jQuery.fn.select2 === 'function') {
      // jQuery Select2 is available
    } else {
      // No Select2 available, will use vanilla approach
    }
    
    observerActive = true;

    const observer = new MutationObserver((mutations) => {
      if (alreadyEnhanced) return;

      // Check if any mutation added nodes that might contain search fields
      const hasRelevantChanges = mutations.some(mutation => {
        return mutation.type === 'childList' && 
               (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
      });

      if (hasRelevantChanges) {
        // Small delay to let the DOM settle
        setTimeout(() => {
          if (!alreadyEnhanced) {
            // Check if new Select2 containers were added
            const newSelect2Containers = document.querySelectorAll('.select2-container');
            if (newSelect2Containers.length > 0) {
              waitForJQuery(() => {
                if (!alreadyEnhanced) {
                  checkAndEnhance();
                }
              });
            }
          }
        }, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

    // Also check immediately in case fields already exist
    setTimeout(() => {
      if (!alreadyEnhanced) {
        waitForJQuery(() => {
          if (!alreadyEnhanced) {
            checkAndEnhance();
          }
        });
    }
  }, 500);
    
    // Additional check after page is fully loaded
    setTimeout(() => {
      if (!alreadyEnhanced) {
        waitForJQuery(() => {
          if (!alreadyEnhanced) {
            checkAndEnhance();
          }
        });
      }
    }, 2000);
    
    // Continuous monitoring for new Select2 elements
    setInterval(() => {
      if (!alreadyEnhanced) {
        const select2Containers = document.querySelectorAll('.select2-container');
        if (select2Containers.length > 0) {
          waitForJQuery(() => {
            if (!alreadyEnhanced) {
              checkAndEnhance();
            }
          });
        }
        
        // Also check if modal is open
        const modal = document.querySelector('#order-items-edit-modal');
        if (modal && modal.classList.contains('show')) {
          const modalSelect2 = modal.querySelector('.select2-container');
          if (modalSelect2 && !alreadyEnhanced) {
            waitForJQuery(() => {
              if (!alreadyEnhanced) {
                checkAndEnhance();
              }
            });
          }
        }
      }
    }, 1000); // Check every second
    
    // Also watch for "עריכת פריטים" button clicks
    document.addEventListener('click', (e) => {
      
      
      if (e.target && (
        e.target.textContent?.includes('עריכת פריטים') ||
        e.target.textContent?.includes('Edit Items') ||
        e.target.closest('button')?.textContent?.includes('עריכת פריטים') ||
        e.target.closest('button')?.textContent?.includes('Edit Items') ||
        e.target.closest('span')?.textContent?.includes('עריכת פריטים') ||
        e.target.closest('span')?.textContent?.includes('Edit Items')
      )) {
        alreadyEnhanced = false; // Reset when button is clicked
        selectedProduct = null; // Reset selected product
        // Wait for the modal to open and then check for Select2
        setTimeout(() => {
          waitForModalAndSelect2();
        }, 500);
      }
    });
    
    // Also watch for modal opening events
    document.addEventListener('shown.bs.modal', (e) => {
      if (e.target && e.target.id === 'order-items-edit-modal') {
        alreadyEnhanced = false; // Reset when modal opens
        selectedProduct = null; // Reset selected product
        setTimeout(() => {
          waitForModalAndSelect2();
          // Ensure image header exists when modal opens
          ensureImageHeaderExists();
          // Set up row watcher (images will be injected by Toolbox after Enhanced is ready)
          setTimeout(() => {
            waitForToolboxFunctions(() => {
              watchForNewRows();
            });
          }, 1000);
        }, 100);
      }
    });
    
    // Also watch for modal closing events
    document.addEventListener('hidden.bs.modal', (e) => {
      if (e.target && e.target.id === 'order-items-edit-modal') {
        alreadyEnhanced = false; // Reset when modal closes
        selectedProduct = null; // Reset selected product
      }
    });
    
    // Watch for save button clicks
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-primary') && 
          (e.target.textContent?.includes('שמור') || e.target.textContent?.includes('Save'))) {
        alreadyEnhanced = false;
        selectedProduct = null;
      }
    });
    
    // Also watch for any clicks inside the modal
    document.addEventListener('click', (e) => {
      const modal = document.querySelector('#order-items-edit-modal');
      if (modal && modal.contains(e.target)) {

        
        // Check if click was on Select2 elements
        if (e.target.closest('.select2-selection') || 
            e.target.closest('.select2-selection__arrow') ||
            e.target.closest('.selection')) {
          
          // Hide any existing native Select2 dropdowns immediately
          const nativeDropdowns = document.querySelectorAll('.select2-dropdown');
          nativeDropdowns.forEach(dropdown => {
            dropdown.style.display = 'none';
            dropdown.style.visibility = 'hidden';
            dropdown.style.opacity = '0';
            dropdown.style.zIndex = '-1';
          });
          
          setTimeout(() => {
            
            // Find the Select2 container and field
            const modal = document.querySelector('#order-items-edit-modal');
            if (modal) {
              const select2Container = modal.querySelector('.select2-container');
              const select2Field = modal.querySelector('select[name="product"]');
              
              if (select2Container && select2Field) {
                createCustomDropdownOverlay(select2Container, select2Field);
                showCustomDropdown(select2Container, select2Field);
              }
            }
          }, 100);
        }
        
        // Check if click was on "הוסף מוצר" button
        if (e.target.closest('.add-product-btn') || 
            e.target.textContent?.includes('הוסף מוצר') ||
            e.target.textContent?.includes('Add Product')) {
          
          if (selectedProduct) {
            
            // Try to find the "add fields" link and click it
            const addFieldsLink = modal.querySelector('.add_fields');
            if (addFieldsLink) {
              
              // Count current rows before adding
              const currentRows = modal.querySelectorAll('.order-item-row').length;
              
              addFieldsLink.click();
              
              // Wait for a new row to be added
              const checkForNewRow = () => {
                const newRowCount = modal.querySelectorAll('.order-item-row').length;
                
                if (newRowCount > currentRows) {
                  // Ensure image header exists before filling
                  ensureImageHeaderExists();
                  fillNewProductFields(selectedProduct);
                } else {
                  setTimeout(checkForNewRow, 200);
                }
              };
              
              // Start checking after a short delay
              setTimeout(checkForNewRow, 300);
            } else {
              
              // Try different selectors for the add fields link
              const alternativeSelectors = [
                'a.add_fields',
                'a[data-association="order_items"]',
                'a[data-association*="order"]',
                'a[href*="add"]',
                'a.btn-success',
                'a[class*="add"]'
              ];
              
              let foundLink = null;
              for (const selector of alternativeSelectors) {
                foundLink = modal.querySelector(selector);
                if (foundLink) {
                  break;
                }
              }
              
              if (foundLink) {
                
                // Count current rows before adding
                const currentRows = modal.querySelectorAll('.order-item-row').length;
                
                foundLink.click();
                
                // Wait for a new row to be added
                const checkForNewRow = () => {
                  const newRowCount = modal.querySelectorAll('.order-item-row').length;
                  
                  if (newRowCount > currentRows) {
                    // Ensure image header exists before filling
                    ensureImageHeaderExists();
                    fillNewProductFields(selectedProduct);
                  } else {
                    setTimeout(checkForNewRow, 200);
                  }
                };
                
                // Start checking after a short delay
                setTimeout(checkForNewRow, 300);
              } else {
                // Try to find an empty row and fill it
                // Ensure image header exists before filling
                ensureImageHeaderExists();
                // Wait for toolbox functions before filling
                waitForToolboxFunctions(() => {
                  fillNewProductFields(selectedProduct);
                });
              }
            }
          }
        }
      }
    });
  }
  
  function waitForModalAndSelect2() {
    
    // Check if modal is visible
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal || !modal.classList.contains('show')) {
      setTimeout(waitForModalAndSelect2, 200);
      return;
    }
    
    
    // Look for Select2 inside the modal
    const modalSelect2 = modal.querySelector('.select2-container');
    if (modalSelect2) {
      waitForJQuery(() => {
        if (!alreadyEnhanced) {
          checkAndEnhance();
          // פלוט אירוע שהמודל מוכן
          window.dispatchEvent(new Event('enhanced-modal-ready'));
        }
      });
    } else {
      setTimeout(waitForModalAndSelect2, 200);
    }
    
    // Also intercept the fetch request to know when Select2 is about to open
    if (!window.fetchIntercepted) {
      window.fetchIntercepted = true;
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('/products/select_search')) {
          setTimeout(() => {
            if (!alreadyEnhanced) {
              waitForJQuery(() => {
                if (!alreadyEnhanced) {
                  checkAndEnhance();
                  // פלוט אירוע שהמודל מוכן
                  window.dispatchEvent(new Event('enhanced-modal-ready'));
                }
              });
            }
          }, 100);
        }
        return originalFetch.apply(this, args);
      };
    }
  }

  function fillNewProductFields(product) {
    
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal) {
      return;
    }
    
    // Ensure image header exists
    ensureImageHeaderExists();
    
    // Find all order item rows
    const orderItemRows = modal.querySelectorAll('.order-item-row');
    if (orderItemRows.length === 0) {
      return;
    }
    
    
    // Look for an empty row (no name, SKU, or product_id filled)
    let emptyRow = null;
    for (let i = orderItemRows.length - 1; i >= 0; i--) {
      const row = orderItemRows[i];
      if (isRowTrulyEmpty(row)) {
        emptyRow = row;
        break;
      }
    }
    
    if (emptyRow) {
      fillRowWithProduct(emptyRow, product);
    } else {
      // If no empty row found, try to find a row with minimal data
      let bestRow = null;
      let minDataCount = Infinity;
      
      for (let i = orderItemRows.length - 1; i >= 0; i--) {
        const row = orderItemRows[i];
        const dataCount = countRowData(row);
        
        if (dataCount < minDataCount) {
          minDataCount = dataCount;
          bestRow = row;
        }
      }
      
      if (bestRow && minDataCount <= 1) {
        fillRowWithProduct(bestRow, product);
      } else {
        // If all rows have data, use the last row
        const lastRow = orderItemRows[orderItemRows.length - 1];
        fillRowWithProduct(lastRow, product);
      }
    }
    
    // Trigger toolbox functions to process the new row (images will be injected by Toolbox after Enhanced is ready)
    setTimeout(() => {
      
      // Wait for toolbox functions to be available
      waitForToolboxFunctions(() => {
        if (window.replaceBarcodesInViews) {
          try {
            window.replaceBarcodesInViews(modal);
          } catch (error) {
            // Silent fail
          }
        }
        
        if (window.replaceBarcodesInDOM) {
          try {
            window.replaceBarcodesInDOM(modal);
          } catch (error) {
            // Silent fail
          }
        }
        
        if (window.tagColumnsForHiding) {
          try {
            window.tagColumnsForHiding(modal);
          } catch (error) {
            // Silent fail
          }
        }
      });
    }, 500); // Wait a bit for the DOM to settle
  }
  
  // Helper function to check if a row is truly empty
  function isRowTrulyEmpty(row) {
    const nameField = row.querySelector('input[name*="name"]');
    const skuField = row.querySelector('input[name*="sku"]');
    const productIdField = row.querySelector('input[name*="product_id"]');
    const productSelect = row.querySelector('select[name*="product"]');
    const quantityField = row.querySelector('input[name*="quantity"]');
    
    // Check if any of the main product fields have values
    const hasName = nameField && nameField.value && nameField.value.trim() !== '';
    const hasSku = skuField && skuField.value && skuField.value.trim() !== '';
    const hasProductId = productIdField && productIdField.value && productIdField.value.trim() !== '';
    const hasProductSelect = productSelect && productSelect.value && productSelect.value.trim() !== '';
    
    // Row is empty if none of the product-related fields have values
    return !hasName && !hasSku && !hasProductId && !hasProductSelect;
  }
  
  // Helper function to count how much data a row has
  function countRowData(row) {
    const nameField = row.querySelector('input[name*="name"]');
    const skuField = row.querySelector('input[name*="sku"]');
    const productIdField = row.querySelector('input[name*="product_id"]');
    const productSelect = row.querySelector('select[name*="product"]');
    const quantityField = row.querySelector('input[name*="quantity"]');
    
    let dataCount = 0;
    if (nameField && nameField.value && nameField.value.trim() !== '') dataCount++;
    if (skuField && skuField.value && skuField.value.trim() !== '') dataCount++;
    if (productIdField && productIdField.value && productIdField.value.trim() !== '') dataCount++;
    if (productSelect && productSelect.value && productSelect.value.trim() !== '') dataCount++;
    if (quantityField && quantityField.value && quantityField.value.trim() !== '' && quantityField.value !== '0') dataCount++;
    
    return dataCount;
  }

  function fillRowWithProduct(row, product) {
    
    // First, try to find a select field for product in this row and fill it properly
    const productSelect = row.querySelector('select[name*="product"]');
    if (productSelect) {
      productSelect.value = product.barcode;
      productSelect.dispatchEvent(new Event('change', { bubbles: true }));
      productSelect.dispatchEvent(new Event('input', { bubbles: true }));
      productSelect.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    // Find and fill hidden product_id input (this is what gets sent to server)
    const productIdInput = row.querySelector('input[name*="product_id"]');
    if (productIdInput) {
      productIdInput.value = product.barcode;
      productIdInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Fill the visible SKU field and ensure there's a hidden field for server submission
    const visibleSkuField = row.querySelector('input[type="text"][name*="[sku]"]');
    if (visibleSkuField) {
      
      // Get the name attribute for the hidden field
      const skuName = visibleSkuField.getAttribute('name');
      
      // Check if there's already a hidden input with the same name
      let hiddenInput = row.querySelector(`input[type="hidden"][name="${skuName}"]`);
      
      // If no hidden input exists, create one
      if (!hiddenInput && skuName) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = skuName;
        visibleSkuField.parentElement.appendChild(hiddenInput);
      }
      
      // Fill the hidden input with the barcode value (this is what gets sent to server)
      if (hiddenInput) {
        hiddenInput.value = product.barcode;
        ['change', 'input', 'blur'].forEach(eventName =>
          hiddenInput.dispatchEvent(new Event(eventName, { bubbles: true }))
        );
      }
      
      // Create tooltip wrapper for disabled input
      const tooltipWrapper = document.createElement('div');
      tooltipWrapper.className = 'lw-tooltip-wrapper';
      tooltipWrapper.title = `מק״ט: ${product.sku}`;
      
      // Insert wrapper before the input and move input inside it
      visibleSkuField.parentElement.insertBefore(tooltipWrapper, visibleSkuField);
      tooltipWrapper.appendChild(visibleSkuField);
      
      // Also fill the visible field for user display with barcode
      visibleSkuField.value = product.barcode;
      visibleSkuField.setAttribute('value', product.barcode);
      visibleSkuField.defaultValue = product.barcode;
      
      // Try to temporarily enable the field, set value, then disable again
      const wasDisabled = visibleSkuField.disabled;
      if (wasDisabled) {
        visibleSkuField.disabled = false;
        visibleSkuField.value = product.barcode;
        visibleSkuField.disabled = true;
      }
      
      // Dispatch multiple events to the visible field
      ['input', 'change', 'blur'].forEach(eventName =>
        visibleSkuField.dispatchEvent(new Event(eventName, { bubbles: true }))
      );
      
    }
    
    // Fill the name field (this one is editable)
    const nameField = row.querySelector('input[name*="name"]');
    if (nameField) {
      nameField.value = product.name;
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      nameField.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    // Try to fill any other hidden inputs that might be related to the product
    const allHiddenInputs = row.querySelectorAll('input[type="hidden"]');
    allHiddenInputs.forEach(input => {
      const inputName = input.name.toLowerCase();
      if (inputName.includes('barcode') || inputName.includes('product_id')) {
        input.value = product.barcode;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Set default quantity to 1 if empty
    const quantityField = row.querySelector('input[name*="quantity"]');
    if (quantityField && (!quantityField.value || quantityField.value.trim() === '')) {
      quantityField.value = '1';
      quantityField.dispatchEvent(new Event('change', { bubbles: true }));
      quantityField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Also try to fill any other product-related fields
    const allInputs = row.querySelectorAll('input');
    allInputs.forEach(input => {
      const inputName = input.name.toLowerCase();
      if (inputName.includes('sku') && !input.value) {
        input.value = product.sku;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    // Use the new ensureFieldsFilled function as a backup
    setTimeout(() => {
      ensureFieldsFilled(row, product);
    }, 50);
    
    // Verify that the fields were filled correctly
    setTimeout(() => {
      verifyRowFilled(row, product);
    }, 100);
    
    // Clear the selected product
    selectedProduct = null;
    
    // Clear the main Select2 field
    const modal = document.querySelector('#order-items-edit-modal');
    if (modal) {
      const select2Field = modal.querySelector('select[name="product"]');
      if (select2Field) {
        select2Field.value = '';
        const selection = modal.querySelector('.select2-selection__rendered');
        if (selection) {
          selection.textContent = '';
        }
      }
    }
    
    // Image will be added by Toolbox after Enhanced is ready
    
  }
  
  // Function to verify that a row was filled correctly
  function verifyRowFilled(row, product) {
    const nameField = row.querySelector('input[name*="name"]');
    const skuField = row.querySelector('input[name*="sku"]');
    const productIdField = row.querySelector('input[name*="product_id"]');
    const productSelect = row.querySelector('select[name*="product"]');
    
    let issues = [];
    
    // Check if name field is filled
    if (nameField && (!nameField.value || nameField.value.trim() === '')) {
      issues.push('name field is empty');
      // Try to fill it again
      nameField.value = product.name;
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Check if product_id field is filled
    if (productIdField && (!productIdField.value || productIdField.value.trim() === '')) {
      issues.push('product_id field is empty');
      // Try to fill it again
      productIdField.value = product.barcode;
      productIdField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Check if product select is filled
    if (productSelect && (!productSelect.value || productSelect.value.trim() === '')) {
      issues.push('product select is empty');
      // Try to fill it again
      productSelect.value = product.barcode;
      productSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // If there were issues, log them
    if (issues.length > 0) {
      console.warn(`⚠️ [LW-Search] Row verification found issues: ${issues.join(', ')}`);
    }
  }
  
  // Function to ensure all necessary fields are filled
  function ensureFieldsFilled(row, product) {
    // Force fill all necessary fields
    const fieldsToFill = [
      { selector: 'input[name*="name"]', value: product.name },
      { selector: 'input[name*="product_id"]', value: product.barcode },
      { selector: 'select[name*="product"]', value: product.barcode },
      { selector: 'input[name*="sku"]', value: product.barcode }
    ];
    
    fieldsToFill.forEach(fieldConfig => {
      const field = row.querySelector(fieldConfig.selector);
      if (field) {
        field.value = fieldConfig.value;
        ['change', 'input', 'blur'].forEach(eventName =>
          field.dispatchEvent(new Event(eventName, { bubbles: true }))
        );
      }
    });
    
    // Also set quantity to 1 if empty
    const quantityField = row.querySelector('input[name*="quantity"]');
    if (quantityField && (!quantityField.value || quantityField.value.trim() === '' || quantityField.value === '0')) {
      quantityField.value = '1';
      ['change', 'input', 'blur'].forEach(eventName =>
        quantityField.dispatchEvent(new Event(eventName, { bubbles: true }))
      );
    }
  }
  
  // Wait for toolbox functions to be available
  function waitForToolboxFunctions(callback, maxAttempts = 50) {
    let attempts = 0;
    
    function checkToolbox() {
      attempts++;
      
      // Check if toolbox functions are available
      if (window.replaceBarcodesInViews || window.replaceBarcodesInDOM || window.tagColumnsForHiding) {
        callback();
        return;
      }
      
      if (attempts >= maxAttempts) {
        // Timeout - proceed anyway
        callback();
        return;
      }
      
      setTimeout(checkToolbox, 100);
    }
    
    checkToolbox();
  }
  
  // Ensure image header exists
  function ensureImageHeaderExists() {
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal) return;
    
    // Look for image header in the table
    const table = modal.querySelector('table');
    if (!table) return;
    
    const headers = table.querySelectorAll('th');
    let hasImageHeader = false;
    
    headers.forEach(header => {
      if (header.textContent && header.textContent.includes('תמונה')) {
        hasImageHeader = true;
      }
    });
    
    // If no image header found, add one
    if (!hasImageHeader) {
      const headerRow = table.querySelector('thead tr');
      if (headerRow) {
        const imageHeader = document.createElement('th');
        imageHeader.textContent = 'תמונה';
        imageHeader.style.cssText = 'width: 80px; text-align: center;';
        headerRow.appendChild(imageHeader);
      }
    }
  }
  
  // Watch for new rows being added
  function watchForNewRows() {
    const modal = document.querySelector('#order-items-edit-modal');
    if (!modal) return;
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('order-item-row')) {
              // New row added - ensure it has proper structure
              ensureRowStructure(node);
            }
          });
        }
      });
    });
    
    observer.observe(modal, {
      childList: true,
      subtree: true
    });
  }
  
  // Ensure row has proper structure
  function ensureRowStructure(row) {
    // Add image cell if missing
    const cells = row.querySelectorAll('td');
    let hasImageCell = false;
    
    cells.forEach(cell => {
      if (cell.querySelector('img') || cell.textContent.includes('תמונה')) {
        hasImageCell = true;
      }
    });
    
    if (!hasImageCell) {
      const imageCell = document.createElement('td');
      imageCell.style.cssText = 'width: 80px; text-align: center; vertical-align: middle;';
      imageCell.innerHTML = '<div style="width: 60px; height: 60px; background: #f8f9fa; border: 1px solid #dee2e6; display: flex; align-items: center; justify-content: center; color: #6c757d; font-size: 12px;">תמונה</div>';
      row.appendChild(imageCell);
    }
  }

  // Main initialization
  function initialize() {
    // Load JSON data first
    loadJSON();
  }

  // Start the process
  initialize();
  
  // Initialize UX/UI systems
  setupGlobalErrorHandling();
  setupPerformanceMonitoring();
  setupAccessibility();
  
  // Initialize loading state manager
  LoadingStateManager.setState(LoadingStateManager.states.INITIALIZING);
  
  // Setup auto-retry after a delay
  setTimeout(setupAutoRetry, 10000);
  
  // Periodic health checks
  setInterval(performHealthCheck, 60000); // Every minute
  
  // Watch for Select2 dropdown enhancements
  watchSelect2Dropdown();
  
  // Enhanced dropdown loading states
  const DropdownLoadingStates = {
    createLoadingState(container, message = 'טוען...') {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'lw-dropdown-loading';
      loadingDiv.innerHTML = `
        <div style="margin-bottom: 8px;">
          <div style="width: 20px; height: 20px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: lw-spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
        <div>${message}</div>
        <div style="font-size: 11px; color: #999; margin-top: 4px;">אנא המתן...</div>
      `;
      return loadingDiv;
    },
    
    createErrorState(container, error, retryCallback) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'lw-dropdown-error';
      errorDiv.innerHTML = `
        <div style="margin-bottom: 8px;">⚠️</div>
        <div>שגיאה בטעינת הנתונים</div>
        <div style="font-size: 12px; margin-top: 4px; color: #721c24;">${error}</div>
        <button style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; margin-top: 8px; cursor: pointer; font-size: 12px;" onclick="this.parentElement.remove(); ${retryCallback}()">נסה שוב</button>
      `;
      return errorDiv;
    },
    
    createEmptyState(container, message = 'לא נמצאו תוצאות') {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'lw-dropdown-loading';
      emptyDiv.innerHTML = `
        <div style="margin-bottom: 8px;">ℹ️</div>
        <div>${message}</div>
        <div style="font-size: 11px; color: #999; margin-top: 4px;">נסה לחפש משהו אחר</div>
      `;
      return emptyDiv;
    },
    
    createSuccessState(container, count) {
      const successDiv = document.createElement('div');
      successDiv.style.cssText = `
        padding: 8px 12px;
        background: #d4edda;
        border: 1px solid #c3e6cb;
        border-radius: 4px;
        color: #155724;
        font-size: 12px;
        text-align: center;
        margin: 4px;
      `;
      successDiv.innerHTML = `
        <div style="margin-bottom: 4px;">✅</div>
        <div>נמצאו ${count} מוצרים</div>
      `;
      return successDiv;
    }
  };

})();
