// ============================================================================
// Transit Tracker Config UI
// Injected into ESPHome web_server via js_include
// ============================================================================

(function () {
  'use strict';

  const API_BASE = 'https://tt.horner.tj';

  // ============================================================================
  // STATE
  // ============================================================================

  let currentRoutes = [];       // [{routeId, stopId, offset, routeName, headsign}, ...]
  let sortOrder = [];           // [routeId|stopId, ...]
  let abbreviations = [];       // [{from, to}, ...]
  let routeStyles = [];         // [{routeId, displayName, color}, ...]
  let selectedRoutes = new Set();
  let stopCache = {};           // stopId -> {name, routes: [...]}
  let foundStops = [];
  let foundRoutes = [];
  let isDirty = false;          // Track if text fields need saving

  // ============================================================================
  // INIT (called at end of file)
  // ============================================================================

  function init() {
    // Load SortableJS from CDN
    loadSortableJS().then(() => {
      const panel = createConfigPanel();
      document.body.insertBefore(panel, document.body.firstChild);
      attachEventListeners();
      loadAllConfig();
      subscribeToEvents();
      observeThemeToggle();
    });
  }

  function loadSortableJS() {
    return new Promise((resolve, reject) => {
      if (window.Sortable) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
      script.onload = resolve;
      script.onerror = () => {
        console.warn('SortableJS failed to load, drag and drop may not work on mobile');
        resolve(); // Continue anyway
      };
      document.head.appendChild(script);
    });
  }

  // ============================================================================
  // THEME OBSERVER
  // ============================================================================

  function observeThemeToggle() {
    const panel = document.getElementById('transit-config-panel');

    // Function to check and apply theme
    function applyTheme() {
      const html = document.documentElement;
      const colorScheme = html.style.colorScheme || getComputedStyle(html).colorScheme;
      const isLight = colorScheme === 'light';

      panel.classList.toggle('light-mode', isLight);

      // Also update any open modals
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.toggle('light-mode', isLight);
      });
    }

    // Apply theme immediately
    applyTheme();

    // Watch for changes to the html element's style attribute
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          applyTheme();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });
  }

  // Helper to create modal with correct theme
  function createModalOverlay(id) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = id;

    // Inherit theme from panel
    const panel = document.getElementById('transit-config-panel');
    if (panel && panel.classList.contains('light-mode')) {
      overlay.classList.add('light-mode');
    }

    return overlay;
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  const STYLES = `
    /* Theme variables - dark mode default */
    #transit-config-panel {
      --bg-primary: #1a1a1a;
      --bg-secondary: #252525;
      --bg-tertiary: #333;
      --bg-hover: #3a3a3a;
      --bg-input: #222;
      --text-primary: #e0e0e0;
      --text-heading: #fff;
      --text-muted: #888;
      --text-dimmed: #666;
      --border-color: #333;
      --border-input: #444;
      --accent-blue: #2196F3;
      --accent-blue-hover: #1976D2;
      --accent-green: #4CAF50;
      --accent-red: #d32f2f;
      --accent-red-hover: #b71c1c;
      --toggle-off: #555;
      --btn-secondary: #555;
      --btn-secondary-hover: #666;
      --success-bg: #2e5a2e;
      --success-text: #8f8;
      --error-bg: #5a2e2e;
      --error-text: #f88;
      --info-bg: #2e4a5a;
      --info-text: #8cf;
    }
    
    /* Light mode - applied via class */
    #transit-config-panel.light-mode {
      --bg-primary: #d8d8d8;
      --bg-secondary: #ffffff;
      --bg-tertiary: #f0f0f0;
      --bg-hover: #e8e8e8;
      --bg-input: #fff;
      --text-primary: #333;
      --text-heading: #111;
      --text-muted: #666;
      --text-dimmed: #999;
      --border-color: #bbb;
      --border-input: #ccc;
      --toggle-off: #ccc;
      --btn-secondary: #757575;
      --btn-secondary-hover: #616161;
      --accent-blue-hover: #1565C0;
      --success-bg: #e8f5e9;
      --success-text: #2e7d32;
      --error-bg: #ffebee;
      --error-text: #c62828;
      --info-bg: #e3f2fd;
      --info-text: #1565c0;
    }
    
    #transit-config-panel {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 600px;
      margin: 0 auto 20px;
      padding: 16px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border-radius: 8px;
    }
    #transit-config-panel h2 {
      margin: 0 0 16px 0;
      padding: 0 0 12px 0;
      color: var(--text-heading);
      font-size: 1.4em;
      border-bottom: 1px solid var(--border-color);
    }
    #transit-config-panel h3 {
      margin: 16px 0 8px;
      color: var(--text-heading);
      font-size: 1.1em;
    }
    #transit-config-panel h4 {
      margin: 12px 0 6px;
      color: var(--text-muted);
      font-size: 0.95em;
    }
    .config-section {
      margin-bottom: 20px;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
    }
    .config-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-color);
    }
    .config-row:last-child {
      border-bottom: none;
    }
    .config-label {
      font-weight: 500;
    }
    
    /* Tabs */
    .tab-container {
      display: flex;
      border-bottom: 1px solid var(--border-input);
      margin-bottom: 16px;
    }
    .tab-btn {
      flex: 1;
      padding: 12px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 14px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text-primary);
      background: var(--bg-secondary);
    }
    .tab-btn.active {
      color: var(--text-heading);
      border-bottom-color: var(--accent-blue);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    
    /* Toggle Switch */
    .toggle-switch {
      position: relative;
      width: 48px;
      height: 26px;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: var(--toggle-off);
      transition: .3s;
      border-radius: 26px;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    .toggle-switch input:checked + .toggle-slider {
      background-color: var(--accent-blue);
    }
    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(22px);
    }
    
    /* Radio Groups */
    .radio-group {
      margin: 8px 0;
    }
    .radio-option {
      display: flex;
      align-items: center;
      padding: 8px;
      margin: 4px 0;
      background: var(--bg-tertiary);
      border-radius: 4px;
      cursor: pointer;
    }
    .radio-option:hover {
      background: var(--bg-hover);
    }
    .radio-option input[type="radio"] {
      margin-right: 10px;
    }
    .radio-option .radio-label {
      flex: 1;
    }
    .radio-option .radio-desc {
      color: var(--text-muted);
      font-size: 0.85em;
    }
    
    /* Buttons */
    .btn {
      padding: 10px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .btn-primary,
    #transit-config-panel .btn-primary,
    .modal-overlay .btn-primary {
      background: var(--accent-blue) !important;
      color: white !important;
    }
    .btn-primary:hover,
    #transit-config-panel .btn-primary:hover,
    .modal-overlay .btn-primary:hover {
      background: var(--accent-blue-hover) !important;
      color: white !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .btn-secondary,
    #transit-config-panel .btn-secondary,
    .modal-overlay .btn-secondary {
      background: var(--btn-secondary) !important;
      color: white !important;
    }
    .btn-secondary:hover,
    #transit-config-panel .btn-secondary:hover,
    .modal-overlay .btn-secondary:hover {
      background: var(--btn-secondary-hover) !important;
      color: white !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .btn-danger,
    #transit-config-panel .btn-danger,
    .modal-overlay .btn-danger {
      background: var(--accent-red) !important;
      color: white !important;
    }
    .btn-danger:hover,
    #transit-config-panel .btn-danger:hover,
    .modal-overlay .btn-danger:hover {
      background: var(--accent-red-hover) !important;
      color: white !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    /* Route List */
    .route-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .route-item {
      display: flex;
      align-items: center;
      padding: 10px;
      margin: 4px 0;
      background: var(--bg-tertiary);
      border-radius: 4px;
      cursor: grab;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      border: 2px solid transparent;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .route-item:hover {
      background: var(--bg-hover);
    }
    .route-item:active {
      cursor: grabbing;
    }
    .route-item.dragging {
      opacity: 0.4;
      background: var(--bg-tertiary);
    }
    .route-item.drag-chosen {
      background: var(--bg-hover);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .route-item.drag-active {
      cursor: grabbing;
    }
    .route-item.drag-over-top {
      border-top-color: var(--accent-blue);
      transform: translateY(2px);
    }
    .route-item.drag-over-bottom {
      border-bottom-color: var(--accent-blue);
      transform: translateY(-2px);
    }
    .route-item .drag-handle {
      padding: 8px;
      margin-right: 6px;
      margin-left: -8px;
      color: var(--text-dimmed);
      cursor: grab;
      font-size: 16px;
      user-select: none;
      touch-action: none;
      -webkit-touch-callout: none;
    }
    .route-item .drag-handle:hover {
      color: var(--text-muted);
    }
    .route-item .drag-handle:active {
      cursor: grabbing;
    }
    .route-item .route-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .route-item .route-name {
      font-weight: bold;
    }
    .route-item .route-stop {
      color: var(--text-muted);
      font-size: 0.85em;
    }
    .route-item .route-stop-id {
      color: var(--text-dimmed);
      font-size: 0.8em;
      font-family: monospace;
    }
    .route-item .route-headsign {
      color: var(--text-dimmed);
      font-size: 0.85em;
    }
    .route-item .remove-btn {
      background: var(--accent-red);
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .route-item .remove-btn:hover {
      background: var(--accent-red-hover);
    }
    
    /* Search */
    .search-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .search-input, .text-input {
      flex: 1;
      padding: 10px;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 14px;
    }
    .search-input::placeholder, .text-input::placeholder {
      color: var(--text-muted);
    }
    .stop-list, .route-results-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .route-option {
      padding: 10px;
      margin: 4px 0;
      background: var(--bg-tertiary);
      border-radius: 4px;
      cursor: pointer;
    }
    .route-option:hover {
      background: var(--bg-hover);
    }
    .route-option.selected {
      background: var(--success-bg);
      border: 1px solid var(--accent-green);
    }
    
    /* Abbreviations & Route Styles */
    .list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      margin: 4px 0;
      background: var(--bg-tertiary);
      border-radius: 4px;
    }
    .list-item input[type="text"] {
      flex: 1;
      padding: 6px;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      background: var(--bg-input);
      color: var(--text-primary);
      font-size: 13px;
    }
    .list-item select {
      padding: 6px;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      background: var(--bg-input);
      color: var(--text-primary);
      font-size: 13px;
    }
    .list-item input[type="color"] {
      width: 36px;
      height: 30px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .list-item .arrow {
      color: var(--text-dimmed);
    }
    .list-item .btn-remove {
      background: var(--accent-red);
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    /* Status Messages */
    .status-msg {
      padding: 8px;
      border-radius: 4px;
      margin-top: 8px;
      font-size: 0.9em;
    }
    .status-msg.success {
      background: var(--success-bg);
      color: var(--success-text);
    }
    .status-msg.error {
      background: var(--error-bg);
      color: var(--error-text);
    }
    .status-msg.info {
      background: var(--info-bg);
      color: var(--info-text);
    }
    
    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      /* Inherit theme variables from panel */
      --bg-primary: #1a1a1a;
      --bg-secondary: #252525;
      --bg-tertiary: #333;
      --bg-hover: #3a3a3a;
      --bg-input: #222;
      --text-primary: #e0e0e0;
      --text-heading: #fff;
      --text-muted: #888;
      --text-dimmed: #666;
      --border-color: #333;
      --border-input: #444;
      --accent-blue: #2196F3;
      --accent-green: #4CAF50;
      --accent-red: #d32f2f;
      --btn-secondary: #555;
      --btn-secondary-hover: #666;
      --success-bg: #2e5a2e;
      --success-text: #8f8;
      --error-bg: #5a2e2e;
      --error-text: #f88;
      --info-bg: #2e4a5a;
      --info-text: #8cf;
    }
    .modal-overlay.light-mode {
      --bg-primary: #ffffff;
      --bg-secondary: #f5f5f5;
      --bg-tertiary: #e8e8e8;
      --bg-hover: #ddd;
      --bg-input: #fff;
      --text-primary: #333;
      --text-heading: #111;
      --text-muted: #666;
      --text-dimmed: #999;
      --border-color: #ddd;
      --border-input: #ccc;
      --btn-secondary: #757575;
      --btn-secondary-hover: #616161;
      --accent-blue-hover: #1565C0;
      --success-bg: #e8f5e9;
      --success-text: #2e7d32;
      --error-bg: #ffebee;
      --error-text: #c62828;
      --info-bg: #e3f2fd;
      --info-text: #1565c0;
    }
    .modal {
      background-color: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      padding: 20px;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .modal-header h3 {
      margin: 0;
    }
    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 24px;
      cursor: pointer;
    }
    .modal-close:hover {
      color: var(--text-heading);
    }
    
    /* Helpers */
    .hidden {
      display: none !important;
    }
    .loading {
      text-align: center;
      padding: 20px;
      color: var(--text-muted);
    }
    .helper-text {
      color: var(--text-muted);
      font-size: 0.85em;
      margin: 4px 0 12px;
    }
    .input-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 8px 0;
    }
    .input-group label {
      display: block;
      color: var(--text-muted);
      font-size: 0.9em;
      margin-bottom: 4px;
    }
    .input-group input {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      box-sizing: border-box;
    }
  `;

  // ============================================================================
  // HTML TEMPLATE
  // ============================================================================

  const HTML_TEMPLATE = `
    <style>${STYLES}</style>
    
    <h2>🚇 Transit Tracker Config</h2>
    
    <!-- Display Settings (always visible) -->
    <div class="config-section">
      <h3>Display Settings</h3>
      <p class="helper-text" title="These settings save immediately">These settings always auto-save</p>
      <div class="config-row">
        <span class="config-label">Show Line Icons (1/2)</span>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-line-icons">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="config-row">
        <span class="config-label">Auto Save</span>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-auto-save" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="tab-container">
      <button class="tab-btn active" data-tab="routes">🚌 Routes</button>
      <button class="tab-btn" data-tab="customize">🎨 Customize</button>
      <button class="tab-btn" data-tab="advanced">⚙️ Advanced</button>
    </div>
    
    <!-- Routes Tab -->
    <div id="tab-routes" class="tab-content active">
      <!-- Selected Routes Summary -->
      <div class="config-section">
        <h3>Selected Routes</h3>
        <p class="helper-text" id="routes-summary">Loading...</p>
        <button class="btn btn-secondary" id="btn-edit-routes">✏️ Edit routes</button>
      </div>
      
      <!-- Time Display -->
      <div class="config-section">
        <h3>Time Display</h3>
        <div class="radio-group" id="time-display-group">
          <label class="radio-option">
            <input type="radio" name="time-display" value="arrival">
            <span class="radio-label">Arrival time</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="time-display" value="departure">
            <span class="radio-label">Departure time</span>
          </label>
        </div>
      </div>
      
      <!-- Time Units -->
      <div class="config-section">
        <h3>Time Units</h3>
        <div class="radio-group" id="time-units-group">
          <label class="radio-option">
            <input type="radio" name="time-units" value="long">
            <span class="radio-label">Long <span class="radio-desc">(e.g., "5min" / "1h15m")</span></span>
          </label>
          <label class="radio-option">
            <input type="radio" name="time-units" value="short">
            <span class="radio-label">Short <span class="radio-desc">(e.g., "5m" / "1h15m")</span></span>
          </label>
          <label class="radio-option">
            <input type="radio" name="time-units" value="none">
            <span class="radio-label">None <span class="radio-desc">(e.g., "5" / "1:15")</span></span>
          </label>
        </div>
      </div>
      
      <!-- Schedule Mode -->
      <div class="config-section">
        <h3>Schedule Mode</h3>
        <div class="radio-group" id="schedule-mode-group">
          <label class="radio-option">
            <input type="radio" name="schedule-mode" value="sequential">
            <span class="radio-label">Show arrivals from all routes sequentially</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="schedule-mode" value="nextPerRoute">
            <span class="radio-label">Show only the next arrival for each route</span>
          </label>
        </div>
      </div>
      
      <!-- Headsign Overflow -->
      <div class="config-section">
        <h3>Headsign Overflow</h3>
        <p class="helper-text">Change how headsign text is displayed when it exceeds the available space.</p>
        <div class="radio-group" id="headsign-overflow-group">
          <label class="radio-option">
            <input type="radio" name="headsign-overflow" value="hidden">
            <span class="radio-label">Hidden — excess text will be cut off</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="headsign-overflow" value="scroll">
            <span class="radio-label">Scroll — headsigns will scroll back and forth</span>
          </label>
        </div>
      </div>
    </div>
    
    <!-- Customize Tab -->
    <div id="tab-customize" class="tab-content">
      <!-- Abbreviations -->
      <div class="config-section">
        <h3>Abbreviations <span style="color:var(--error-text);font-size:0.8em;">*</span></h3>
        <p class="helper-text">Shorten route headsigns so they fit better on the screen.</p>
        <div id="abbrev-list"></div>
        <button class="btn btn-secondary" id="btn-add-abbrev" style="margin-top:8px;">+ Add abbreviation</button>
      </div>
      
      <!-- Route Styles -->
      <div class="config-section">
        <h3>Route Styles <span style="color:var(--error-text);font-size:0.8em;">*</span></h3>
        <p class="helper-text">Customize the names and colors of routes.</p>
        <div id="route-styles-list"></div>
        <button class="btn btn-secondary" id="btn-add-route-style" style="margin-top:8px;">+ Add route style</button>
      </div>
      
      <p style="color:var(--text-muted);font-size:0.8em;margin-top:12px;"><span style="color:var(--error-text);">*</span> Requires manual save</p>
    </div>
    
    <!-- Advanced Tab -->
    <div id="tab-advanced" class="tab-content">
      <!-- API Server -->
      <div class="config-section">
        <h3>API Server</h3>
        <p class="helper-text">Change the API server for different transit agencies.</p>
        <button class="btn btn-secondary" id="btn-change-api">✏️ Change API server</button>
        <input type="hidden" id="api-server" value="">
      </div>
      
      <!-- Display Orientation -->
      <div class="config-section">
        <h3>Display Orientation</h3>
        <div class="radio-group" id="orientation-group">
          <label class="radio-option">
            <input type="radio" name="orientation" value="normal">
            <span class="radio-label">Normal — USB port on the right</span>
          </label>
          <label class="radio-option">
            <input type="radio" name="orientation" value="flipped">
            <span class="radio-label">Flipped — USB port on the left</span>
          </label>
        </div>
      </div>
      
      <!-- Localization -->
      <div class="config-section">
        <h3>Localization <span style="color:var(--error-text);font-size:0.8em;">*</span></h3>
        <p class="helper-text">Change the text used for time units and "Now" on the display.</p>
        <div class="input-group">
          <div>
            <label>Now Label</label>
            <input type="text" id="loc-now" placeholder="Now">
          </div>
          <div>
            <label>Hours Short Label</label>
            <input type="text" id="loc-hours-short" placeholder="h">
          </div>
          <div>
            <label>Minutes Long Label</label>
            <input type="text" id="loc-min-long" placeholder="min">
          </div>
          <div>
            <label>Minutes Short Label</label>
            <input type="text" id="loc-min-short" placeholder="m">
          </div>
        </div>
      </div>
      
      <p style="color:var(--text-muted);font-size:0.8em;margin-top:12px;"><span style="color:var(--error-text);">*</span> Requires manual save</p>
    </div>
    
    <!-- Save Button -->
    <div style="text-align:center;margin-top:16px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
      <button class="btn btn-primary" id="btn-save-all" style="padding:12px 32px;font-size:1.1em;opacity:0.7;">💾 Save Text Fields</button>
      <button class="btn btn-secondary" id="btn-yaml" style="padding:12px 24px;font-size:1.1em;">📄 YAML</button>
    </div>
    <div id="save-status" style="text-align:center;"></div>
  `;

  // ============================================================================
  // CREATE PANEL
  // ============================================================================

  function createConfigPanel() {
    const panel = document.createElement('div');
    panel.id = 'transit-config-panel';
    panel.innerHTML = HTML_TEMPLATE;
    return panel;
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  function attachEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Display Settings (always auto-save)
    document.getElementById('toggle-line-icons').addEventListener('change', (e) => {
      setSwitch('show_line_icons', e.target.checked);
    });

    document.getElementById('toggle-auto-save').addEventListener('change', (e) => {
      updateSaveButtonState();
    });

    // Routes Tab
    document.getElementById('btn-edit-routes').addEventListener('click', openRoutesModal);

    document.querySelectorAll('input[name="time-display"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        setSelect('time_display_config', e.target.value);
      });
    });

    document.querySelectorAll('input[name="time-units"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        setSelect('time_units_config', e.target.value);
      });
    });

    document.querySelectorAll('input[name="schedule-mode"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        await setSelect('list_mode_config', e.target.value);
        // List mode requires reconnect to take effect (it's sent in WebSocket subscription)
        console.log('Schedule mode changed, triggering reload...');
        await fetch('/button/reload_tracker/press', { method: 'POST' });
      });
    });

    document.querySelectorAll('input[name="headsign-overflow"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        setSwitch('scroll_headsigns', e.target.value === 'scroll');
      });
    });

    // Customize Tab
    document.getElementById('btn-add-abbrev').addEventListener('click', () => {
      abbreviations.push({ from: '', to: '' });
      renderAbbreviations();
      markDirty();
    });

    document.getElementById('btn-add-route-style').addEventListener('click', () => {
      routeStyles.push({ routeId: '', displayName: '', color: '#ffffff' });
      renderRouteStyles();
      markDirty();
    });

    // Advanced Tab
    document.getElementById('btn-change-api').addEventListener('click', openApiServerModal);

    document.querySelectorAll('input[name="orientation"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        setSwitch('flip_display', e.target.value === 'flipped');
      });
    });

    // Localization text fields - highlight save button on change
    ['loc-now', 'loc-min-long', 'loc-min-short', 'loc-hours-short'].forEach(id => {
      document.getElementById(id).addEventListener('input', markDirty);
    });

    // Save Button
    document.getElementById('btn-save-all').addEventListener('click', saveAllConfig);

    // YAML Button
    document.getElementById('btn-yaml').addEventListener('click', openYamlModal);
  }

  // ============================================================================
  // TAB SWITCHING
  // ============================================================================

  function switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
  }

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function fetchSwitch(entityId) {
    try {
      const resp = await fetch(`/switch/${entityId}`);
      if (!resp.ok) return false;
      const data = await resp.json();
      return data.state === 'ON';
    } catch {
      return false;
    }
  }

  async function setSwitch(entityId, state) {
    try {
      await fetch(`/switch/${entityId}/${state ? 'turn_on' : 'turn_off'}`, { method: 'POST' });
    } catch (err) {
      console.error('Error setting switch:', err);
    }
  }

  async function fetchSelect(entityId) {
    try {
      const resp = await fetch(`/select/${entityId}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.value;
    } catch {
      return null;
    }
  }

  async function setSelect(entityId, value) {
    try {
      const url = `/select/${entityId}/set?option=${encodeURIComponent(value)}`;
      console.log('Setting select:', entityId, '=', value, 'url:', url);
      const resp = await fetch(url, { method: 'POST' });
      console.log('Select response:', entityId, resp.status, resp.statusText);
      if (!resp.ok) {
        console.error('Failed to set select:', entityId, resp.status);
      }
    } catch (err) {
      console.error('Error setting select:', entityId, err);
    }
  }

  async function fetchText(entityId) {
    try {
      const resp = await fetch(`/text/${entityId}`);
      if (!resp.ok) {
        console.log('fetchText failed for', entityId, ':', resp.status);
        return '';
      }
      const data = await resp.json();
      console.log('fetchText', entityId, ':', data.value);
      return data.value || '';
    } catch (err) {
      console.error('Error fetching text', entityId, ':', err);
      return '';
    }
  }

  async function saveText(entityId, value) {
    try {
      const url = `/text/${entityId}/set?value=${encodeURIComponent(value)}`;
      console.log('Saving text:', entityId, 'value length:', value.length, 'url:', url);
      const resp = await fetch(url, { method: 'POST' });
      console.log('Save response:', entityId, resp.status, resp.statusText);
      if (!resp.ok) {
        console.error('Failed to save text:', entityId, resp.status);
      }
    } catch (err) {
      console.error('Error saving text:', entityId, err);
    }
  }

  // ============================================================================
  // LOAD CONFIG
  // ============================================================================

  async function loadAllConfig() {
    try {
      const [
        lineIcons,
        timeDisplay,
        timeUnits,
        listMode,
        scrollHeadsigns,
        flipDisplay,
        scheduleConfig,
        sortOrderConfig,
        abbreviationsConfig,
        routeStylesConfig,
        baseUrl,
        nowStr,
        minLongStr,
        minShortStr,
        hoursShortStr
      ] = await Promise.all([
        fetchSwitch('show_line_icons'),
        fetchSelect('time_display_config'),
        fetchSelect('time_units_config'),
        fetchSelect('list_mode_config'),
        fetchSwitch('scroll_headsigns'),
        fetchSwitch('flip_display'),
        fetchText('schedule_config'),
        fetchText('sort_order_config'),
        fetchText('abbreviations_config'),
        fetchText('route_styles_config'),
        fetchText('base_url_config'),
        fetchText('now_str_config'),
        fetchText('min_long_str_config'),
        fetchText('min_short_str_config'),
        fetchText('hours_short_str_config')
      ]);

      // Display Settings
      document.getElementById('toggle-line-icons').checked = lineIcons;

      // Routes Tab
      if (timeDisplay) {
        const radio = document.querySelector(`input[name="time-display"][value="${timeDisplay}"]`);
        if (radio) radio.checked = true;
      }

      if (timeUnits) {
        const radio = document.querySelector(`input[name="time-units"][value="${timeUnits}"]`);
        if (radio) radio.checked = true;
      }

      if (listMode) {
        const radio = document.querySelector(`input[name="schedule-mode"][value="${listMode}"]`);
        if (radio) radio.checked = true;
      }

      const headsignValue = scrollHeadsigns ? 'scroll' : 'hidden';
      const headsignRadio = document.querySelector(`input[name="headsign-overflow"][value="${headsignValue}"]`);
      if (headsignRadio) headsignRadio.checked = true;

      // Parse schedule config
      parseScheduleConfig(scheduleConfig);
      parseSortOrderConfig(sortOrderConfig);

      // Fetch route names from API for existing routes
      await fetchRouteNames();

      updateRoutesSummary();

      // Customize Tab
      parseAbbreviationsConfig(abbreviationsConfig);
      renderAbbreviations();

      parseRouteStylesConfig(routeStylesConfig);
      renderRouteStyles();

      // Advanced Tab
      const orientationValue = flipDisplay ? 'flipped' : 'normal';
      const orientationRadio = document.querySelector(`input[name="orientation"][value="${orientationValue}"]`);
      if (orientationRadio) orientationRadio.checked = true;

      document.getElementById('api-server').value = baseUrl || 'wss://tt.horner.tj/';
      document.getElementById('api-server').dataset.originalValue = baseUrl || 'wss://tt.horner.tj/';
      document.getElementById('loc-now').value = nowStr || 'Now';
      document.getElementById('loc-min-long').value = minLongStr || 'min';
      document.getElementById('loc-min-short').value = minShortStr || 'm';
      document.getElementById('loc-hours-short').value = hoursShortStr || 'h';

      // Update save button state
      updateSaveButtonState();

    } catch (err) {
      console.error('Error loading config:', err);
    }
  }

  // ============================================================================
  // PARSE CONFIGS
  // ============================================================================

  function parseScheduleConfig(config) {
    console.log('Parsing schedule config:', config);
    currentRoutes = [];
    if (!config || !config.trim()) {
      console.log('Empty schedule config');
      return;
    }

    const pairs = config.split(';');
    for (const pair of pairs) {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        currentRoutes.push({
          routeId: parts[0],
          stopId: parts[1],
          offset: parts[2] || '0',
          routeName: '',
          headsign: ''
        });
      }
    }
    console.log('Parsed routes:', currentRoutes);
  }

  function parseSortOrderConfig(config) {
    sortOrder = [];
    if (!config || !config.trim()) return;
    sortOrder = config.split(';').filter(s => s.trim());
  }

  function parseAbbreviationsConfig(config) {
    abbreviations = [];
    if (!config || !config.trim()) return;

    for (const line of config.split('\n')) {
      const parts = line.split(';');
      if (parts.length >= 1 && parts[0].trim()) {
        abbreviations.push({
          from: parts[0],
          to: parts[1] || ''
        });
      }
    }
  }

  function parseRouteStylesConfig(config) {
    routeStyles = [];
    if (!config || !config.trim()) return;

    for (const line of config.split('\n')) {
      const parts = line.split(';');
      if (parts.length >= 3) {
        routeStyles.push({
          routeId: parts[0],
          displayName: parts[1],
          color: '#' + parts[2]
        });
      }
    }
  }

  // ============================================================================
  // ROUTES SUMMARY
  // ============================================================================

  async function fetchRouteNames() {
    // Fetch route info for all unique stopIds
    const stopIds = [...new Set(currentRoutes.map(r => r.stopId))];

    for (const stopId of stopIds) {
      if (stopCache[stopId]) continue; // Already cached

      try {
        const resp = await fetch(`${API_BASE}/stops/${stopId}/routes`);
        if (resp.ok) {
          const routes = await resp.json();

          // Store in cache (stop name only available if added via search)
          stopCache[stopId] = { name: stopCache[stopId]?.name || null, routes };

          // Update route names in currentRoutes
          for (const route of currentRoutes) {
            if (route.stopId === stopId) {
              const routeInfo = routes.find(r => r.routeId === route.routeId);
              if (routeInfo) {
                route.routeName = routeInfo.name || route.routeId;
                route.routeColor = routeInfo.color || null;
                route.headsign = routeInfo.headsigns?.[0] || '';
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching routes for stop ${stopId}:`, err);
      }
    }
  }

  function updateRoutesSummary() {
    const count = currentRoutes.length;
    const stops = new Set(currentRoutes.map(r => r.stopId)).size;
    document.getElementById('routes-summary').textContent =
      count > 0
        ? `Displaying ${count} route${count !== 1 ? 's' : ''} at ${stops} stop${stops !== 1 ? 's' : ''}.`
        : 'No routes configured.';
  }

  // ============================================================================
  // ROUTES MODAL
  // ============================================================================

  function openRoutesModal() {
    const overlay = createModalOverlay('routes-modal');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Edit Routes</h3>
          <button class="modal-close" id="modal-close">&times;</button>
        </div>
        
        <p class="helper-text">Drag to reorder. Top routes display first.</p>
        <ul class="route-list" id="modal-route-list"></ul>
        
        <h4 style="margin-top:16px;">Add Route</h4>
        <div class="search-row">
          <input type="text" id="search-location" class="search-input" placeholder="Address or lat,lng">
          <button class="btn btn-primary" id="btn-search-stops">Search</button>
        </div>
        <div class="radius-row" style="margin-top:8px;display:flex;align-items:center;gap:12px;">
          <label style="color:var(--text-primary);font-size:0.9em;">Radius:</label>
          <input type="range" id="search-radius" min="0.05" max="0.5" step="0.05" value="0.125" style="flex:1;max-width:120px;">
          <span id="radius-display" style="color:var(--text-heading);font-size:0.9em;">0.13 mi</span>
        </div>
        
        <div id="stop-results" class="hidden" style="margin-top:12px;"></div>
        <div id="route-results" class="hidden" style="margin-top:12px;"></div>
        <div id="search-status" style="margin-top:8px;"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Render current routes
    renderModalRouteList();

    // Attach modal event listeners
    document.getElementById('modal-close').addEventListener('click', closeRoutesModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeRoutesModal();
    });

    document.getElementById('btn-search-stops').addEventListener('click', searchStops);
    document.getElementById('search-location').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchStops();
    });
    document.getElementById('search-radius').addEventListener('input', updateRadiusDisplay);
  }

  function closeRoutesModal() {
    const modal = document.getElementById('routes-modal');
    if (modal) modal.remove();
    updateRoutesSummary();
  }

  // ============================================================================
  // API SERVER MODAL
  // ============================================================================

  function openApiServerModal() {
    const currentUrl = document.getElementById('api-server').value || 'wss://tt.horner.tj/';

    const overlay = createModalOverlay('api-modal');
    overlay.innerHTML = `
      <div class="modal" style="max-width:450px;">
        <div class="modal-header">
          <h3>Change API server</h3>
          <button class="modal-close" id="api-modal-close">&times;</button>
        </div>
        
        <p style="color:var(--error-text);margin:0 0 16px;"><strong>Warning</strong>: Changing the API server will clear selected stops and routes.</p>
        
        <div style="margin-bottom:16px;">
          <label style="display:block;color:var(--text-muted);font-size:0.9em;margin-bottom:6px;">🌐 API Base URL</label>
          <input type="text" id="api-url-input" class="text-input" style="width:100%;box-sizing:border-box;" value="${escapeHtml(currentUrl)}" placeholder="wss://tt.horner.tj/">
          <p class="helper-text" style="margin-top:6px;">The base URL for the Transit Tracker API to use</p>
        </div>
        
        <div style="display:flex;gap:12px;">
          <button class="btn btn-primary" id="btn-save-api" style="flex:1;">Save API URL</button>
          <button class="btn btn-secondary" id="btn-reset-api">Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Focus input
    document.getElementById('api-url-input').focus();

    // Close handlers
    document.getElementById('api-modal-close').addEventListener('click', closeApiServerModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeApiServerModal();
    });

    // Save handler
    document.getElementById('btn-save-api').addEventListener('click', async () => {
      const newUrl = document.getElementById('api-url-input').value.trim();
      if (!newUrl) {
        alert('Please enter a valid URL');
        return;
      }

      // Update hidden field
      document.getElementById('api-server').value = newUrl;

      // Clear routes if URL changed
      const oldUrl = document.getElementById('api-server').dataset.originalValue;
      if (oldUrl && oldUrl !== newUrl) {
        currentRoutes = [];
        sortOrder = [];
        updateRoutesSummary();
      }

      // Save
      await saveText('base_url_config', newUrl);

      // Store as original for comparison
      document.getElementById('api-server').dataset.originalValue = newUrl;

      closeApiServerModal();
      showStatus('save-status', 'API server updated!', 'success');
      setTimeout(() => clearStatus('save-status'), 3000);
    });

    // Reset handler
    document.getElementById('btn-reset-api').addEventListener('click', () => {
      document.getElementById('api-url-input').value = 'wss://tt.horner.tj/';
    });
  }

  function closeApiServerModal() {
    const modal = document.getElementById('api-modal');
    if (modal) modal.remove();
  }

  function renderModalRouteList() {
    const list = document.getElementById('modal-route-list');
    if (!list) return;

    // Sort routes according to sort order
    const sortedRoutes = [...currentRoutes].sort((a, b) => {
      const keyA = `${a.routeId}|${a.stopId}`;
      const keyB = `${b.routeId}|${b.stopId}`;
      const idxA = sortOrder.indexOf(keyA);
      const idxB = sortOrder.indexOf(keyB);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    if (sortedRoutes.length === 0) {
      list.innerHTML = '<li style="color:var(--text-muted);padding:12px;">No routes configured. Add some below!</li>';
      return;
    }

    list.innerHTML = sortedRoutes.map((route, index) => {
      // Get display name - prefer routeName, fall back to extracting from routeId
      const displayName = route.routeName || extractRouteName(route.routeId);
      const stopName = route.stopName || getStopName(route.stopId);
      const hasRealStopName = stopName && !stopName.startsWith('st:');
      const headsign = route.headsign || '';
      const routeColor = route.routeColor || getRouteColor(route.routeId);

      return `
        <li class="route-item" draggable="true" data-route-key="${route.routeId}|${route.stopId}" data-index="${index}">
          <span class="drag-handle">☰</span>
          <div class="route-info">
            <span class="route-name" style="color:${routeColor ? '#' + routeColor : 'var(--text-heading)'};">${escapeHtml(displayName)}</span>
            ${hasRealStopName ? `<span class="route-stop">@ ${escapeHtml(stopName)}</span>` : `<span class="route-stop-id">${escapeHtml(route.stopId)}</span>`}
            ${headsign ? `<span class="route-headsign">→ ${escapeHtml(headsign)}</span>` : ''}
          </div>
          <button class="remove-btn" data-route-key="${route.routeId}|${route.stopId}">Remove</button>
        </li>
      `;
    }).join('');

    // Initialize SortableJS for drag and drop
    initSortable(list);

    // Attach remove handlers
    list.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.target.dataset.routeKey;
        const [routeId, stopId] = key.split('|');
        removeRoute(routeId, stopId);
      });
    });
  }

  let sortableInstance = null;

  function initSortable(list) {
    // Destroy previous instance if exists
    if (sortableInstance) {
      sortableInstance.destroy();
    }

    // Check if SortableJS is loaded
    if (!window.Sortable) {
      console.warn('SortableJS not loaded, falling back to HTML5 drag and drop');
      // Fallback to old drag handlers
      list.querySelectorAll('.route-item').forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
      });
      return;
    }

    sortableInstance = new Sortable(list, {
      animation: 150,
      filter: '.remove-btn',
      preventOnFilter: false,
      ghostClass: 'dragging',
      chosenClass: 'drag-chosen',
      dragClass: 'drag-active',
      onEnd: function (evt) {
        const items = list.querySelectorAll('.route-item');
        const newOrder = [];
        items.forEach(item => {
          newOrder.push(item.dataset.routeKey);
        });

        // Update sortOrder
        sortOrder = newOrder;

        // Reorder currentRoutes to match
        const newRoutes = [];
        for (const key of newOrder) {
          const [routeId, stopId] = key.split('|');
          const route = currentRoutes.find(r => r.routeId === routeId && r.stopId === stopId);
          if (route) newRoutes.push(route);
        }
        currentRoutes = newRoutes;

        // Trigger save
        if (isAutoSaveEnabled()) {
          queueSave();
        }
      }
    });
  }

  // Helper to extract route name from routeId
  function extractRouteName(routeId) {
    // routeId format: st:40_100479 -> try to find in cache or return last part
    for (const stopId in stopCache) {
      const stop = stopCache[stopId];
      if (stop.routes) {
        const route = stop.routes.find(r => r.routeId === routeId);
        if (route) return route.name || routeId;
      }
    }
    return routeId;
  }

  // Helper to get stop name from cache
  function getStopName(stopId) {
    return stopCache[stopId]?.name || null;
  }

  // Helper to get route color from cache
  function getRouteColor(routeId) {
    for (const stopId in stopCache) {
      const stop = stopCache[stopId];
      if (stop.routes) {
        const route = stop.routes.find(r => r.routeId === routeId);
        if (route && route.color) return route.color;
      }
    }
    return null;
  }

  // ============================================================================
  // DRAG AND DROP
  // ============================================================================

  let draggedItem = null;

  function handleDragStart(e) {
    draggedItem = e.target.closest('.route-item');
    draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItem.dataset.routeKey);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = e.target.closest('.route-item');
    if (!target || target === draggedItem) return;

    // Clear previous drag-over classes
    document.querySelectorAll('.route-item').forEach(item => {
      if (item !== target) {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    // Determine if dropping above or below based on mouse position
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      target.classList.add('drag-over-top');
      target.classList.remove('drag-over-bottom');
    } else {
      target.classList.add('drag-over-bottom');
      target.classList.remove('drag-over-top');
    }
  }

  function handleDragLeave(e) {
    const target = e.target.closest('.route-item');
    if (target) {
      target.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const target = e.target.closest('.route-item');
    if (!target || !draggedItem || target === draggedItem) {
      clearDragStyles();
      return;
    }

    const draggedKey = draggedItem.dataset.routeKey;
    const targetKey = target.dataset.routeKey;

    if (draggedKey === targetKey) {
      clearDragStyles();
      return;
    }

    // Remove dragged from sort order
    const draggedIdx = sortOrder.indexOf(draggedKey);
    if (draggedIdx > -1) {
      sortOrder.splice(draggedIdx, 1);
    }

    // Find where to insert based on which half of target we're over
    let targetIdx = sortOrder.indexOf(targetKey);
    const isAbove = target.classList.contains('drag-over-top');
    const insertIdx = isAbove ? targetIdx : targetIdx + 1;

    sortOrder.splice(insertIdx, 0, draggedKey);

    clearDragStyles();
    renderModalRouteList();

    if (isAutoSaveEnabled()) {
      queueSave();
    }
  }

  function handleDragEnd() {
    clearDragStyles();
  }

  function clearDragStyles() {
    document.querySelectorAll('.route-item').forEach(item => {
      item.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
    });
    draggedItem = null;
  }

  // ============================================================================
  // ROUTE MANAGEMENT
  // ============================================================================

  function removeRoute(routeId, stopId) {
    console.log('Removing route:', routeId, stopId);
    currentRoutes = currentRoutes.filter(r => !(r.routeId === routeId && r.stopId === stopId));
    const key = `${routeId}|${stopId}`;
    sortOrder = sortOrder.filter(k => k !== key);

    renderModalRouteList();

    if (isAutoSaveEnabled()) {
      console.log('Auto-save enabled, queuing save...');
      queueSave();
    } else {
      console.log('Auto-save disabled, manual save required');
    }
  }

  function addRoute(routeId, stopId, routeName, headsign, routeColor, stopName) {
    console.log('Adding route:', routeId, stopId, routeName);
    if (currentRoutes.some(r => r.routeId === routeId && r.stopId === stopId)) {
      console.log('Route already exists, skipping');
      return; // Already exists
    }

    currentRoutes.push({
      routeId,
      stopId,
      offset: '0',
      routeName,
      headsign,
      routeColor,
      stopName: stopName || getStopName(stopId) || stopId
    });

    const key = `${routeId}|${stopId}`;
    if (!sortOrder.includes(key)) {
      sortOrder.push(key);
    }

    renderModalRouteList();

    if (isAutoSaveEnabled()) {
      console.log('Auto-save enabled, queuing save...');
      queueSave();
    } else {
      console.log('Auto-save disabled, manual save required');
    }
  }

  // ============================================================================
  // SEARCH STOPS & ROUTES
  // ============================================================================

  function updateRadiusDisplay() {
    const miles = parseFloat(document.getElementById('search-radius').value);
    const blocks = Math.round(miles / 0.0625);
    document.getElementById('radius-display').textContent = `${miles.toFixed(2)} mi (~${blocks} blks)`;
  }

  async function searchStops() {
    const input = document.getElementById('search-location').value.trim();
    if (!input) {
      showStatus('search-status', 'Enter an address or coordinates', 'error');
      return;
    }

    showStatus('search-status', 'Searching...', 'info');

    document.getElementById('stop-results').classList.add('hidden');
    document.getElementById('route-results').classList.add('hidden');

    let lat, lng;
    const coordMatch = input.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);

    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    } else {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}`);
        const results = await resp.json();
        if (results.length === 0) {
          showStatus('search-status', 'Address not found', 'error');
          return;
        }
        lat = parseFloat(results[0].lat);
        lng = parseFloat(results[0].lon);
      } catch (err) {
        showStatus('search-status', 'Geocoding failed', 'error');
        return;
      }
    }

    const radiusMiles = parseFloat(document.getElementById('search-radius').value);
    const offset = radiusMiles / 69;

    try {
      const resp = await fetch(`${API_BASE}/stops/within/${lng - offset},${lat - offset},${lng + offset},${lat + offset}`);
      if (!resp.ok) throw new Error('API error');

      const stops = await resp.json();

      if (stops.length === 0) {
        showStatus('search-status', 'No stops found. Try increasing radius.', 'info');
        return;
      }

      foundStops = stops;
      clearStatus('search-status');
      renderStopResults(stops);

    } catch (err) {
      showStatus('search-status', 'Search failed', 'error');
    }
  }

  function renderStopResults(stops) {
    const container = document.getElementById('stop-results');
    container.classList.remove('hidden');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <button class="btn btn-secondary" id="select-all-stops" style="padding:6px 12px;font-size:0.9em;">Select All</button>
        <span style="color:var(--text-muted);font-size:0.85em;">${stops.length} stop${stops.length !== 1 ? 's' : ''}</span>
      </div>
      <ul class="stop-list" id="stop-list" style="max-height:150px;overflow-y:auto;list-style:none;padding:0;margin:0;">
        ${stops.map(stop => `
          <li class="route-option" data-stop-id="${stop.stopId}">
            <div style="color:var(--text-heading);font-weight:500;">${escapeHtml(stop.name)}</div>
            <div style="color:var(--text-dimmed);font-size:0.85em;">${stop.stopCode || stop.stopId}</div>
          </li>
        `).join('')}
      </ul>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button class="btn btn-primary" id="btn-search-selected">Search Selected</button>
        <button class="btn btn-secondary" id="btn-search-all">Search All</button>
      </div>
    `;

    // Track selected stops
    const selectedStopIds = new Set();

    // Stop click to toggle selection
    container.querySelectorAll('#stop-list .route-option').forEach(item => {
      item.addEventListener('click', () => {
        const stopId = item.dataset.stopId;
        if (selectedStopIds.has(stopId)) {
          selectedStopIds.delete(stopId);
          item.classList.remove('selected');
        } else {
          selectedStopIds.add(stopId);
          item.classList.add('selected');
        }
      });
    });

    // Select All button
    document.getElementById('select-all-stops').addEventListener('click', () => {
      const allSelected = selectedStopIds.size === stops.length;
      container.querySelectorAll('#stop-list .route-option').forEach(item => {
        const stopId = item.dataset.stopId;
        if (allSelected) {
          selectedStopIds.delete(stopId);
          item.classList.remove('selected');
        } else {
          selectedStopIds.add(stopId);
          item.classList.add('selected');
        }
      });
    });

    // Store selected stops getter for search functions
    container.getSelectedStops = () => stops.filter(s => selectedStopIds.has(s.stopId));

    document.getElementById('btn-search-selected').addEventListener('click', () => {
      const selected = container.getSelectedStops();
      if (selected.length === 0) {
        showStatus('search-status', 'Select at least one stop', 'error');
        return;
      }
      searchRoutesForStops(selected);
    });
    document.getElementById('btn-search-all').addEventListener('click', () => searchRoutesForStops(stops));
  }

  async function searchRoutesForStops(selectedStops) {
    showStatus('search-status', `Loading routes for ${selectedStops.length} stop${selectedStops.length !== 1 ? 's' : ''}...`, 'info');

    foundRoutes = [];

    for (const stop of selectedStops) {
      try {
        const resp = await fetch(`${API_BASE}/stops/${stop.stopId}/routes`);
        if (resp.ok) {
          const routes = await resp.json();
          stopCache[stop.stopId] = { name: stop.name, routes };
          for (const route of routes) {
            foundRoutes.push({
              stopId: stop.stopId,
              stopName: stop.name,
              routeId: route.routeId,
              routeName: route.name || route.routeId,
              routeColor: route.color,
              headsigns: route.headsigns || []
            });
          }
        }
      } catch (err) {
        console.error('Error fetching routes:', err);
      }
    }

    if (foundRoutes.length === 0) {
      showStatus('search-status', 'No routes found', 'info');
      return;
    }

    clearStatus('search-status');
    renderRouteResults();
  }

  function renderRouteResults() {
    const container = document.getElementById('route-results');
    container.classList.remove('hidden');
    selectedRoutes.clear();

    container.innerHTML = `
      <input type="text" id="filter-routes" placeholder="Filter routes..." class="search-input" style="margin-bottom:8px;">
      <ul class="route-results-list" id="route-results-list" style="max-height:200px;overflow-y:auto;"></ul>
      <button class="btn btn-primary" id="btn-add-routes" style="margin-top:8px;">Add Selected Routes</button>
    `;

    renderFilteredRoutes(foundRoutes);

    document.getElementById('filter-routes').addEventListener('input', (e) => {
      const filter = e.target.value.toLowerCase();
      const filtered = foundRoutes.filter(r =>
        r.routeName.toLowerCase().includes(filter) ||
        r.headsigns.some(h => h.toLowerCase().includes(filter)) ||
        r.stopName.toLowerCase().includes(filter)
      );
      renderFilteredRoutes(filtered);
    });

    document.getElementById('btn-add-routes').addEventListener('click', addSelectedRoutes);
  }

  function renderFilteredRoutes(routes) {
    const list = document.getElementById('route-results-list');

    list.innerHTML = routes.map(r => {
      const key = `${r.routeId}|${r.stopId}`;
      const alreadyAdded = currentRoutes.some(cr => cr.routeId === r.routeId && cr.stopId === r.stopId);
      return `
        <li class="route-option ${selectedRoutes.has(key) ? 'selected' : ''}" 
            data-key="${key}" 
            data-route-id="${r.routeId}" 
            data-stop-id="${r.stopId}"
            data-route-name="${escapeHtml(r.routeName)}"
            data-stop-name="${escapeHtml(r.stopName)}"
            data-headsign="${escapeHtml(r.headsigns[0] || '')}">
          <div>
            <strong style="color:${r.routeColor ? '#' + r.routeColor : 'var(--text-heading)'}">${escapeHtml(r.routeName)}</strong>
            <span style="color:var(--text-muted);margin-left:8px;">@ ${escapeHtml(r.stopName)}</span>
            ${alreadyAdded ? '<span style="color:var(--accent-green);margin-left:8px;">✓</span>' : ''}
          </div>
          ${r.headsigns.length ? `<div style="color:var(--text-dimmed);font-size:0.85em;margin-top:4px;">→ ${escapeHtml(r.headsigns.join(', '))}</div>` : ''}
        </li>
      `;
    }).join('');

    list.querySelectorAll('.route-option').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.dataset.key;
        if (selectedRoutes.has(key)) {
          selectedRoutes.delete(key);
          item.classList.remove('selected');
        } else {
          selectedRoutes.add(key);
          item.classList.add('selected');
        }
      });
    });
  }

  function addSelectedRoutes() {
    for (const key of selectedRoutes) {
      const item = document.querySelector(`.route-option[data-key="${key}"]`);
      if (item) {
        // Find the route in foundRoutes to get color
        const route = foundRoutes.find(r => `${r.routeId}|${r.stopId}` === key);
        addRoute(
          item.dataset.routeId,
          item.dataset.stopId,
          item.dataset.routeName,
          item.dataset.headsign,
          route?.routeColor || null,
          item.dataset.stopName
        );
      }
    }

    selectedRoutes.clear();
    document.getElementById('stop-results').classList.add('hidden');
    document.getElementById('route-results').classList.add('hidden');
  }

  // ============================================================================
  // ABBREVIATIONS
  // ============================================================================

  function renderAbbreviations() {
    const container = document.getElementById('abbrev-list');

    if (abbreviations.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9em;">No abbreviations configured.</p>';
      return;
    }

    container.innerHTML = abbreviations.map((abbr, index) => `
      <div class="list-item" data-index="${index}">
        <input type="text" value="${escapeHtml(abbr.from)}" placeholder="Find..." data-field="from">
        <span class="arrow">→</span>
        <input type="text" value="${escapeHtml(abbr.to)}" placeholder="Replace with..." data-field="to">
        <button class="btn-remove" data-index="${index}">🗑</button>
      </div>
    `).join('');

    container.querySelectorAll('.list-item input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('.list-item').dataset.index);
        const field = e.target.dataset.field;
        abbreviations[idx][field] = e.target.value;
        markDirty();
      });
    });

    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        abbreviations.splice(idx, 1);
        renderAbbreviations();
        markDirty();
      });
    });
  }

  // ============================================================================
  // ROUTE STYLES
  // ============================================================================

  function renderRouteStyles() {
    const container = document.getElementById('route-styles-list');

    if (routeStyles.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9em;">No route styles configured.</p>';
      return;
    }

    // Build route options from current routes with display names and colors
    const routeOptions = [];
    const seenRouteIds = new Set();
    for (const r of currentRoutes) {
      if (!seenRouteIds.has(r.routeId)) {
        seenRouteIds.add(r.routeId);
        const displayName = r.routeName || extractRouteName(r.routeId);
        const color = r.routeColor || getRouteColor(r.routeId);
        routeOptions.push({ routeId: r.routeId, displayName, color });
      }
    }

    container.innerHTML = routeStyles.map((style, index) => {
      const currentRoute = routeOptions.find(r => r.routeId === style.routeId);

      return `
        <div class="list-item" data-index="${index}">
          <select data-field="routeId" style="min-width:120px;">
            <option value="">Select route...</option>
            ${routeOptions.map(opt => `<option value="${opt.routeId}" data-color="${opt.color || ''}" data-name="${escapeHtml(opt.displayName)}" ${style.routeId === opt.routeId ? 'selected' : ''}>${escapeHtml(opt.displayName)}</option>`).join('')}
          </select>
          <span class="arrow">→</span>
          <input type="text" value="${escapeHtml(style.displayName)}" placeholder="Display name" data-field="displayName" style="flex:1;">
          <input type="color" value="${style.color}" data-field="color" title="Route color">
          <button class="btn-remove" data-index="${index}">🗑</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.list-item select[data-field="routeId"]').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('.list-item').dataset.index);
        const selectedOption = e.target.selectedOptions[0];

        routeStyles[idx].routeId = e.target.value;

        // Auto-populate display name and color from selected route
        if (selectedOption && selectedOption.value) {
          const name = selectedOption.dataset.name || '';
          const color = selectedOption.dataset.color || '';

          const listItem = e.target.closest('.list-item');
          const nameInput = listItem.querySelector('input[data-field="displayName"]');
          const colorInput = listItem.querySelector('input[data-field="color"]');

          if (nameInput && !nameInput.value) {
            nameInput.value = name;
            routeStyles[idx].displayName = name;
          }
          if (colorInput && color) {
            colorInput.value = '#' + color;
            routeStyles[idx].color = '#' + color;
          }
        }
        markDirty();
      });
    });

    container.querySelectorAll('.list-item input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.closest('.list-item').dataset.index);
        const field = e.target.dataset.field;
        routeStyles[idx][field] = e.target.value;
        markDirty();
      });
    });

    container.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        routeStyles.splice(idx, 1);
        renderRouteStyles();
        markDirty();
      });
    });
  }

  // ============================================================================
  // SAVE CONFIG (with debounce)
  // ============================================================================

  let saveTimeout = null;
  let isSaving = false;

  function queueSave() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveAllConfig();
    }, 300); // Wait 300ms after last change before saving
  }

  async function saveAllConfig() {
    if (isSaving) {
      console.log('Save already in progress, queuing...');
      queueSave();
      return;
    }

    isSaving = true;
    const btn = document.getElementById('btn-save-all');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      // Build configs
      const scheduleConfig = currentRoutes
        .map(r => `${r.routeId},${r.stopId},${r.offset}`)
        .join(';');

      const sortOrderConfig = sortOrder.join(';');

      const abbreviationsConfig = abbreviations
        .filter(a => a.from.trim())
        .map(a => a.to ? `${a.from};${a.to}` : a.from)
        .join('\n');

      const routeStylesConfig = routeStyles
        .filter(s => s.routeId && s.displayName)
        .map(s => `${s.routeId};${s.displayName};${s.color.replace('#', '')}`)
        .join('\n');

      console.log('Saving config:', {
        scheduleConfig,
        sortOrderConfig,
        abbreviationsConfig,
        routeStylesConfig
      });

      // Save all (API server is saved separately via its modal)
      await Promise.all([
        saveText('schedule_config', scheduleConfig),
        saveText('sort_order_config', sortOrderConfig),
        saveText('abbreviations_config', abbreviationsConfig),
        saveText('route_styles_config', routeStylesConfig),
        saveText('now_str_config', document.getElementById('loc-now').value),
        saveText('min_long_str_config', document.getElementById('loc-min-long').value),
        saveText('min_short_str_config', document.getElementById('loc-min-short').value),
        saveText('hours_short_str_config', document.getElementById('loc-hours-short').value)
      ]);

      console.log('Config saved, waiting before reload...');

      // Wait a bit for text values to be processed by the tracker
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Triggering reload...');

      // Trigger reconnect - try the name-based endpoint (ESPHome uses slugified name)
      let reloadResp = await fetch('/button/reload_tracker/press', { method: 'POST' });
      console.log('Reload response (reload_tracker):', reloadResp.status, reloadResp.statusText);

      // If that failed, the button might not exist or have a different name
      if (!reloadResp.ok) {
        console.log('Trying alternative button name...');
        reloadResp = await fetch('/button/reload%20tracker/press', { method: 'POST' });
        console.log('Reload response (reload%20tracker):', reloadResp.status, reloadResp.statusText);
      }

      showStatus('save-status', 'Configuration saved!', 'success');
      setTimeout(() => clearStatus('save-status'), 3000);

      // Reset dirty flag after successful save
      isDirty = false;
      updateSaveButtonState();

    } catch (err) {
      console.error('Save failed:', err);
      showStatus('save-status', 'Save failed: ' + err.message, 'error');
    } finally {
      isSaving = false;
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  // ============================================================================
  // GENERATE YAML
  // ============================================================================

  function closeYamlModal() {
    const modal = document.getElementById('yaml-modal');
    if (modal) modal.remove();
  }

  function openYamlModal() {
    const overlay = createModalOverlay('yaml-modal');
    overlay.innerHTML = `
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h3>📄 YAML Configuration</h3>
          <button class="modal-close" id="yaml-modal-close">&times;</button>
        </div>
        
        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <button class="btn btn-primary" id="btn-yaml-export" style="flex:1;">📋 Export</button>
          <button class="btn btn-secondary" id="btn-yaml-import" style="flex:1;">📥 Import</button>
        </div>
        
        <div id="yaml-export-section">
          <p class="helper-text">Copy this YAML to use in your ESPHome configuration or share with others.</p>
          <textarea id="yaml-output" style="width:100%;height:250px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-input);border-radius:4px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;" readonly></textarea>
          <button class="btn btn-primary" id="btn-copy-yaml" style="margin-top:12px;width:100%;">📋 Copy to Clipboard</button>
        </div>
        
        <div id="yaml-import-section" style="display:none;">
          <p class="helper-text">Paste a tjhorner-format transit tracker YAML configuration below.</p>
          <textarea id="yaml-input" style="width:100%;height:250px;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border-input);border-radius:4px;padding:12px;font-family:monospace;font-size:13px;resize:vertical;box-sizing:border-box;" placeholder="color:
  - id: &quot;c_28813F&quot;
    hex: &quot;28813F&quot;
transit_tracker:
  stops:
    - stop_id: &quot;st:1_12345&quot;
      routes:
        - &quot;st:1_100&quot;
  ..."></textarea>
          <button class="btn btn-primary" id="btn-do-import" style="margin-top:12px;width:100%;">📥 Import Configuration</button>
        </div>
        
        <div id="yaml-status" style="text-align:center;margin-top:8px;"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Generate and show export YAML immediately
    const yaml = generateYamlString();
    document.getElementById('yaml-output').value = yaml;

    // Tab switching
    const exportBtn = document.getElementById('btn-yaml-export');
    const importBtn = document.getElementById('btn-yaml-import');
    const exportSection = document.getElementById('yaml-export-section');
    const importSection = document.getElementById('yaml-import-section');

    exportBtn.addEventListener('click', () => {
      exportBtn.className = 'btn btn-primary';
      importBtn.className = 'btn btn-secondary';
      exportSection.style.display = 'block';
      importSection.style.display = 'none';
      clearStatus('yaml-status');
    });

    importBtn.addEventListener('click', () => {
      importBtn.className = 'btn btn-primary';
      exportBtn.className = 'btn btn-secondary';
      importSection.style.display = 'block';
      exportSection.style.display = 'none';
      clearStatus('yaml-status');
    });

    // Close handlers
    document.getElementById('yaml-modal-close').addEventListener('click', closeYamlModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeYamlModal();
    });

    // Copy handler
    document.getElementById('btn-copy-yaml').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(yaml);
        showStatus('yaml-status', 'Copied to clipboard!', 'success');
        setTimeout(() => clearStatus('yaml-status'), 2000);
      } catch (err) {
        document.getElementById('yaml-output').select();
        document.execCommand('copy');
        showStatus('yaml-status', 'Copied to clipboard!', 'success');
        setTimeout(() => clearStatus('yaml-status'), 2000);
      }
    });

    // Import handler
    document.getElementById('btn-do-import').addEventListener('click', async () => {
      const yamlText = document.getElementById('yaml-input').value.trim();
      if (!yamlText) {
        showStatus('yaml-status', 'Please paste YAML configuration', 'error');
        return;
      }

      try {
        const config = parseYaml(yamlText);
        await applyImportedConfig(config);
        showStatus('yaml-status', 'Configuration imported successfully!', 'success');
        setTimeout(() => {
          closeYamlModal();
          location.reload();
        }, 1500);
      } catch (err) {
        showStatus('yaml-status', 'Error parsing YAML: ' + err.message, 'error');
        console.error('YAML parse error:', err);
      }
    });
  }

  function generateYamlString() {
    // Get current settings
    const timeDisplay = document.querySelector('input[name="time-display"]:checked')?.value || 'arrival';
    const timeUnits = document.querySelector('input[name="time-units"]:checked')?.value || 'short';
    const listMode = document.querySelector('input[name="schedule-mode"]:checked')?.value || 'nextPerRoute';
    const baseUrl = document.getElementById('api-server').value || 'wss://tt.horner.tj/';

    // Group routes by stop
    const stopMap = {};

    // Sort routes according to sortOrder
    const sortedRoutes = [...currentRoutes].sort((a, b) => {
      const keyA = `${a.routeId}|${a.stopId}`;
      const keyB = `${b.routeId}|${b.stopId}`;
      const idxA = sortOrder.indexOf(keyA);
      const idxB = sortOrder.indexOf(keyB);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    for (const route of sortedRoutes) {
      if (!stopMap[route.stopId]) {
        stopMap[route.stopId] = [];
      }
      stopMap[route.stopId].push(route.routeId);
    }

    // Collect unique colors for the color section
    const colorSet = new Set();
    for (const style of routeStyles) {
      if (style.color) {
        const hex = style.color.replace('#', '').toUpperCase();
        colorSet.add(hex);
      }
    }

    // Build YAML
    let yaml = '';

    // Color section (if we have route styles with colors)
    if (colorSet.size > 0) {
      yaml += 'color:\n';
      for (const hex of colorSet) {
        yaml += `  - id: "c_${hex}"\n`;
        yaml += `    hex: "${hex}"\n`;
      }
      yaml += '\n';
    }

    // Transit tracker section
    yaml += 'transit_tracker:\n';
    yaml += `  base_url: "${baseUrl}"\n`;
    yaml += `  time_display: "${timeDisplay}"\n`;
    yaml += `  show_units: "${timeUnits}"\n`;
    yaml += `  list_mode: "${listMode}"\n`;

    // Stops
    yaml += '  stops:\n';
    for (const [stopId, routes] of Object.entries(stopMap)) {
      yaml += `    - stop_id: "${stopId}"\n`;
      yaml += '      routes:\n';
      for (const routeId of routes) {
        yaml += `        - "${routeId}"\n`;
      }
    }

    // Styles (if any)
    if (routeStyles.length > 0) {
      yaml += '  styles:\n';
      for (const style of routeStyles) {
        yaml += `    - route_id: "${style.routeId}"\n`;
        if (style.name) {
          yaml += `      name: "${style.name}"\n`;
        }
        if (style.color) {
          const hex = style.color.replace('#', '').toUpperCase();
          yaml += `      color: "c_${hex}"\n`;
        }
      }
    }

    // Abbreviations (if any)
    if (abbreviations.length > 0) {
      yaml += '  abbreviations:\n';
      for (const abbr of abbreviations) {
        yaml += `    - from: "${abbr.from}"\n`;
        yaml += `      to: "${abbr.to}"\n`;
      }
    }

    return yaml;
  }

  // ============================================================================
  // YAML PARSING
  // ============================================================================

  function parseYaml(yamlText) {
    const config = {
      stops: [],
      colors: {},
      styles: [],
      abbreviations: {},
      base_url: '',
      time_display: '',
      show_units: '',
      list_mode: ''
    };

    const lines = yamlText.split('\n');
    let inTransitTracker = false;
    let inStops = false;
    let inStyles = false;
    let inColors = false;
    let inRoutes = false;
    let inAbbreviations = false;
    let currentStop = null;
    let currentStyle = null;
    let currentColor = null;
    let currentAbbr = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.search(/\S/);

      // Top-level color section
      if (trimmed === 'color:' && indent === 0) {
        inColors = true;
        inTransitTracker = false;
        inStops = false;
        inStyles = false;
        inAbbreviations = false;
        continue;
      }

      // Top-level transit_tracker section
      if (trimmed === 'transit_tracker:' && indent === 0) {
        inTransitTracker = true;
        inColors = false;
        inStops = false;
        inStyles = false;
        inAbbreviations = false;
        continue;
      }

      // Nested sections under transit_tracker
      if (inTransitTracker && trimmed === 'stops:') {
        inStops = true;
        inStyles = false;
        inAbbreviations = false;
        inRoutes = false;
        currentStop = null;
        continue;
      }

      if (inTransitTracker && trimmed === 'styles:') {
        inStyles = true;
        inStops = false;
        inAbbreviations = false;
        currentStyle = null;
        continue;
      }

      if (inTransitTracker && trimmed === 'abbreviations:') {
        inAbbreviations = true;
        inStops = false;
        inStyles = false;
        continue;
      }

      // routes: under a stop
      if (inStops && trimmed === 'routes:') {
        inRoutes = true;
        continue;
      }

      // Parse color definitions
      if (inColors) {
        const listKvMatch = trimmed.match(/^-\s*([a-z_]+):\s*"?([^"]*)"?$/i);
        const kvMatch = trimmed.match(/^([a-z_]+):\s*"?([^"]*)"?$/i);

        if (listKvMatch && listKvMatch[1] === 'id') {
          currentColor = { id: listKvMatch[2], hex: '' };
        } else if (kvMatch && kvMatch[1] === 'hex' && currentColor) {
          currentColor.hex = kvMatch[2];
          config.colors[currentColor.id] = currentColor;
        }
      }

      // Parse transit_tracker properties
      if (inTransitTracker && !inStops && !inStyles && !inAbbreviations) {
        const kvMatch = trimmed.match(/^([a-z_]+):\s*"?([^"]*)"?$/i);
        if (kvMatch) {
          if (kvMatch[1] === 'base_url') config.base_url = kvMatch[2];
          if (kvMatch[1] === 'time_display') config.time_display = kvMatch[2];
          if (kvMatch[1] === 'show_units') config.show_units = kvMatch[2];
          if (kvMatch[1] === 'list_mode') config.list_mode = kvMatch[2];
        }
      }

      // Parse stops
      if (inStops) {
        const listKvMatch = trimmed.match(/^-\s*([a-z_]+):\s*"?([^"]*)"?$/i);
        const listItemMatch = trimmed.match(/^-\s*"([^"]+)"$/);

        if (listKvMatch && listKvMatch[1] === 'stop_id') {
          currentStop = { stop_id: listKvMatch[2], routes: [] };
          config.stops.push(currentStop);
          inRoutes = false;
        } else if (listItemMatch && inRoutes && currentStop) {
          // Route as simple string: - "st:1_100"
          currentStop.routes.push(listItemMatch[1]);
        }
      }

      // Parse styles
      if (inStyles) {
        const listKvMatch = trimmed.match(/^-\s*([a-z_]+):\s*"?([^"]*)"?$/i);
        const kvMatch = trimmed.match(/^([a-z_]+):\s*"?([^"]*)"?$/i);

        if (listKvMatch && listKvMatch[1] === 'route_id') {
          currentStyle = { route_id: listKvMatch[2], name: '', color: '' };
          config.styles.push(currentStyle);
        } else if (kvMatch && currentStyle) {
          if (kvMatch[1] === 'name') currentStyle.name = kvMatch[2];
          if (kvMatch[1] === 'color') currentStyle.color = kvMatch[2];
        }
      }

      // Parse abbreviations
      if (inAbbreviations) {
        const listKvMatch = trimmed.match(/^-\s*([a-z_]+):\s*"?([^"]*)"?$/i);
        const kvMatch = trimmed.match(/^([a-z_]+):\s*"?([^"]*)"?$/i);

        if (listKvMatch && listKvMatch[1] === 'from') {
          // Start new abbreviation
          currentAbbr = { from: listKvMatch[2], to: '' };
          config.abbreviations[currentAbbr.from] = '';
        } else if (kvMatch && kvMatch[1] === 'to' && currentAbbr) {
          currentAbbr.to = kvMatch[2];
          config.abbreviations[currentAbbr.from] = currentAbbr.to;
        }
      }
    }

    console.log('Parsed config:', config);
    return config;
  }

  async function applyImportedConfig(config) {
    // Build schedule_config: routeId,stopId,offset;...
    const scheduleEntries = [];
    const sortOrderEntries = [];

    for (const stop of config.stops) {
      for (const routeId of stop.routes) {
        // Routes are now strings directly
        scheduleEntries.push(`${routeId},${stop.stop_id},0`);
        sortOrderEntries.push(`${routeId}|${stop.stop_id}`);
      }
    }

    // Build route_styles_config: routeId;name;color
    // Styles is now an array, and color may reference a color ID
    const styleEntries = [];
    for (const style of config.styles) {
      const routeId = style.route_id;
      const name = style.name || routeId;
      // Resolve color reference (e.g., "c_28813F" -> get hex from colors)
      let colorHex = '028e51'; // default
      if (style.color) {
        if (config.colors[style.color]) {
          colorHex = config.colors[style.color].hex;
        } else {
          // Direct hex value
          colorHex = style.color.replace('#', '').replace('c_', '');
        }
      }
      styleEntries.push(`${routeId};${name};${colorHex}`);
    }

    // Build abbreviations_config: from;to
    const abbrEntries = [];
    for (const [from, to] of Object.entries(config.abbreviations)) {
      abbrEntries.push(`${from};${to}`);
    }

    // Apply configuration via REST API
    const updates = [];

    if (scheduleEntries.length > 0) {
      updates.push(saveText('schedule_config', scheduleEntries.join(';')));
      updates.push(saveText('sort_order_config', sortOrderEntries.join(';')));
    }

    if (styleEntries.length > 0) {
      updates.push(saveText('route_styles_config', styleEntries.join('\n')));
    }

    if (abbrEntries.length > 0) {
      updates.push(saveText('abbreviations_config', abbrEntries.join('\n')));
    }

    if (config.base_url) {
      updates.push(saveText('base_url_config', config.base_url));
    }

    if (config.time_display) {
      updates.push(setSelect('time_display_config', config.time_display));
    }

    if (config.show_units) {
      updates.push(setSelect('time_units_config', config.show_units));
    }

    if (config.list_mode) {
      updates.push(setSelect('list_mode_config', config.list_mode));
    }

    await Promise.all(updates);

    // Trigger reload
    try {
      await fetch('/button/reload_tracker/press', { method: 'POST' });
    } catch (e) {
      console.log('Reload trigger:', e);
    }
  }

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  function subscribeToEvents() {
    const eventSource = new EventSource('/events');

    eventSource.addEventListener('state', (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.id === 'switch-show_line_icons') {
          document.getElementById('toggle-line-icons').checked = data.state === 'ON';
        }
        if (data.id === 'switch-scroll_headsigns') {
          const radio = document.querySelector(`input[name="headsign-overflow"][value="${data.state === 'ON' ? 'scroll' : 'hidden'}"]`);
          if (radio) radio.checked = true;
        }
        if (data.id === 'switch-flip_display') {
          const radio = document.querySelector(`input[name="orientation"][value="${data.state === 'ON' ? 'flipped' : 'normal'}"]`);
          if (radio) radio.checked = true;
        }
      } catch (err) {
        console.error('Error parsing event:', err);
      }
    });

    eventSource.onerror = () => {
      console.warn('EventSource connection lost, will auto-reconnect');
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  function markDirty() {
    isDirty = true;
    updateSaveButtonState();
  }

  function isAutoSaveEnabled() {
    return document.getElementById('toggle-auto-save').checked;
  }

  function updateSaveButtonState() {
    const saveBtn = document.getElementById('btn-save-all');
    if (isDirty) {
      saveBtn.style.opacity = '1';
      saveBtn.style.background = '#4CAF50';
      saveBtn.textContent = '💾 Save Changes *';
    } else if (isAutoSaveEnabled()) {
      saveBtn.style.opacity = '0.7';
      saveBtn.style.background = '#2196F3';
      saveBtn.textContent = '💾 Save Text Fields';
    } else {
      saveBtn.style.opacity = '1';
      saveBtn.style.background = '#2196F3';
      saveBtn.textContent = '💾 Save All Changes';
    }
    saveBtn.disabled = false;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showStatus(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<div class="status-msg ${type}">${message}</div>`;
    }
  }

  function clearStatus(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }
  }

  // ============================================================================
  // STARTUP
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();