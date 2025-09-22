/**
 * LoadingIndicator class for displaying download progress
 */
export class LoadingIndicator {
    /**
     * Create a new LoadingIndicator
     */
    constructor() {
        this.indicator = null;
        this.progressBar = null;
        this.progressText = null;
        this.activeRequests = new Map(); // Map to track multiple concurrent requests
        this.initialize();
    }

    /**
     * Initialize the loading indicator elements
     */
    initialize() {
        // Check if the indicator already exists
        if (document.getElementById('loading-indicator')) {
            this.indicator = document.getElementById('loading-indicator');
            this.progressBar = document.getElementById('loading-progress-bar');
            this.progressText = document.getElementById('loading-progress-text');
            return;
        }

        // Create the loading indicator container
        this.indicator = document.createElement('div');
        this.indicator.id = 'loading-indicator';
        this.indicator.className = 'loading-indicator';
        this.indicator.style.display = 'none';

        // Create the progress bar
        this.progressBar = document.createElement('div');
        this.progressBar.id = 'loading-progress-bar';
        this.progressBar.className = 'loading-progress-bar';

        // Create the progress text
        this.progressText = document.createElement('div');
        this.progressText.id = 'loading-progress-text';
        this.progressText.className = 'loading-progress-text';
        this.progressText.textContent = 'Loading...';

        // Assemble the elements
        this.indicator.appendChild(this.progressBar);
        this.indicator.appendChild(this.progressText);

        // Add to the document body
        document.body.appendChild(this.indicator);

        // Add CSS styles
        this.addStyles();
    }

    /**
     * Add CSS styles for the loading indicator
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .loading-indicator {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 8px;
                text-align: center;
                z-index: 9999;
                font-family: Arial, sans-serif;
                font-size: 14px;
                display: flex;
                flex-direction: column;
                align-items: center;
                transition: opacity 0.3s ease;
            }
            
            .loading-progress-bar {
                height: 4px;
                background-color: #4CAF50;
                width: 0%;
                transition: width 0.2s ease;
                margin-bottom: 4px;
                align-self: flex-start;
            }
            
            .loading-progress-text {
                font-size: 12px;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Start tracking a new request
     * @param {string} requestId - Unique identifier for this request
     * @param {string} label - Label to display for this request
     * @returns {string} The request ID
     */
    startRequest(requestId = null, label = 'Loading...') {
        // Generate a request ID if not provided
        if (!requestId) {
            requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        // Add to active requests
        this.activeRequests.set(requestId, {
            loaded: 0,
            total: 0,
            label
        });

        // Show the indicator
        this.indicator.style.display = 'flex';
        this.updateProgress();

        return requestId;
    }

    /**
     * Update the progress for a specific request
     * @param {string} requestId - The request ID
     * @param {number} loaded - Bytes loaded
     * @param {number} total - Total bytes
     */
    updateRequest(requestId, loaded, total) {
        if (!this.activeRequests.has(requestId)) return;

        const request = this.activeRequests.get(requestId);
        request.loaded = loaded;
        request.total = total || request.total;

        this.updateProgress();
    }

    /**
     * Complete a request
     * @param {string} requestId - The request ID
     */
    completeRequest(requestId) {
        if (!this.activeRequests.has(requestId)) return;
        
        this.activeRequests.delete(requestId);
        
        if (this.activeRequests.size === 0) {
            // Hide the indicator if no active requests
            this.indicator.style.display = 'none';
        } else {
            this.updateProgress();
        }
    }

    /**
     * Update the overall progress display
     */
    updateProgress() {
        if (this.activeRequests.size === 0) {
            return;
        }

        // Calculate total progress across all active requests
        let totalLoaded = 0;
        let totalSize = 0;
        let labels = [];

        for (const [id, request] of this.activeRequests.entries()) {
            totalLoaded += request.loaded;
            totalSize += request.total || 0;
            labels.push(request.label);
        }

        // Update the progress bar
        const percent = totalSize > 0 ? (totalLoaded / totalSize) * 100 : 0;
        this.progressBar.style.width = `${Math.min(100, percent)}%`;

        // Format the loaded/total size
        const formattedLoaded = this.formatBytes(totalLoaded);
        const formattedTotal = totalSize > 0 ? this.formatBytes(totalSize) : 'Unknown';
        
        // Update the text
        if (this.activeRequests.size === 1) {
            // Single request
            const label = labels[0];
            this.progressText.textContent = `${label}: ${formattedLoaded} / ${formattedTotal}`;
        } else {
            // Multiple requests
            this.progressText.textContent = `Loading ${this.activeRequests.size} files: ${formattedLoaded} / ${formattedTotal}`;
        }
    }

    /**
     * Format bytes to human-readable format
     * @param {number} bytes - The number of bytes
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Create a fetch wrapper that tracks download progress
     * @param {string} url - The URL to fetch
     * @param {Object} options - Fetch options
     * @param {string} label - Label for this download
     * @returns {Promise<Response>} The fetch response
     */
    async fetchWithProgress(url, options = {}, label = 'Loading...') {
        const requestId = this.startRequest(null, label);
        
        try {
            // Create a response reader
            const response = await fetch(url, options);
            
            // Get the total size if available
            const total = parseInt(response.headers.get('content-length'), 10) || 0;
            
            // Create a clone to read the body
            const reader = response.clone().body.getReader();
            let loaded = 0;
            
            // Update the request with the total size
            this.updateRequest(requestId, loaded, total);
            
            // Create a new ReadableStream to read and track progress
            const stream = new ReadableStream({
                async start(controller) {
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) {
                            controller.close();
                            break;
                        }
                        
                        loaded += value.byteLength;
                        controller.enqueue(value);
                        
                        // Update progress
                        loadingIndicator.updateRequest(requestId, loaded, total);
                    }
                }
            });
            
            // Create a new response with the tracked body
            const trackedResponse = new Response(stream, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
            
            // Mark the request as complete when the response is consumed
            const originalClone = trackedResponse.clone;
            trackedResponse.clone = () => {
                const clonedResponse = originalClone.call(trackedResponse);
                return clonedResponse;
            };
            
            // Return the tracked response
            return trackedResponse;
        } catch (error) {
            // Complete the request in case of error
            this.completeRequest(requestId);
            throw error;
        } finally {
            // Ensure the request is completed
            setTimeout(() => this.completeRequest(requestId), 500);
        }
    }
}

// Create a singleton instance
export const loadingIndicator = new LoadingIndicator();
