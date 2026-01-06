/**
 * Actionstep Client - Communicates with parent Actionstep page via postMessage
 */

class ActionstepClient {
    constructor() {
        this.parentOrigin = 'https://ap-southeast-2.actionstep.com';
        this.pendingRequests = new Map();
        this.connected = false;
        this.init();
    }

    init() {
        // Listen for messages from parent
        window.addEventListener('message', this.handleMessage.bind(this));
        
        // Wait a bit then request connection
        setTimeout(() => {
            this.requestConnection();
        }, 500);
    }

    handleMessage(event) {
        // Security: Only accept messages from Actionstep
        if (!event.origin.includes('actionstep.com')) {
            console.warn('Rejected message from unknown origin:', event.origin);
            return;
        }

        const { type, requestId, data, error } = event.data;

        if (type === 'CONNECTION_READY') {
            this.connected = true;
            this.onConnectionReady();
        } else if (type === 'API_RESPONSE') {
            const resolver = this.pendingRequests.get(requestId);
            if (resolver) {
                if (error) {
                    resolver.reject(new Error(error));
                } else {
                    resolver.resolve(data);
                }
                this.pendingRequests.delete(requestId);
            }
        }
    }

    requestConnection() {
        console.log('Requesting connection to Actionstep...');
        window.parent.postMessage({
            type: 'IFRAME_READY'
        }, this.parentOrigin);
    }

    onConnectionReady() {
        console.log('✅ Connected to Actionstep');
        updateStatus('connected', 'Connected to Actionstep');
        
        // Enable buttons
        document.getElementById('testConnection').disabled = false;
        document.getElementById('loadMatters').disabled = false;
        document.getElementById('loadContacts').disabled = false;
        document.getElementById('lookupMatter').disabled = false;
        document.getElementById('matterIdInput').disabled = false;
    }

    /**
     * Make an API request through the parent Actionstep page
     * @param {string} endpoint - API endpoint (e.g., 'rest/actions')
     * @param {object} options - Fetch options
     */
    async apiRequest(endpoint, options = {}) {
        if (!this.connected) {
            throw new Error('Not connected to Actionstep');
        }

        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            // Store resolver for this request
            this.pendingRequests.set(requestId, { resolve, reject });

            // Set timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, 30000); // 30 second timeout

            // Override reject to clear timeout
            const originalReject = reject;
            const wrappedReject = (error) => {
                clearTimeout(timeout);
                originalReject(error);
            };
            this.pendingRequests.set(requestId, { 
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                }, 
                reject: wrappedReject 
            });

            // Send request to parent
            window.parent.postMessage({
                type: 'API_REQUEST',
                requestId,
                endpoint,
                options
            }, this.parentOrigin);
        });
    }

    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Convenience methods
    async getMatters(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `api/rest/actions?${queryString}` : 'api/rest/actions';
        return this.apiRequest(endpoint, { method: 'GET' });
    }

    async getContacts(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const endpoint = queryString ? `api/rest/participants?${queryString}` : 'api/rest/participants';
        return this.apiRequest(endpoint, { method: 'GET' });
    }

    async getMatterById(matterId) {
        return this.apiRequest(`api/rest/actions/${matterId}`, { method: 'GET' });
    }
}

// Initialize client
const client = new ActionstepClient();

// UI Helper Functions
function updateStatus(type, message) {
    const statusEl = document.getElementById('status');
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
}

function showLoading(message = 'Loading...') {
    const output = document.getElementById('dataOutput');
    output.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div>${message}</div>
        </div>
    `;
}

function showError(message) {
    const output = document.getElementById('dataOutput');
    output.innerHTML = `<div class="error">${message}</div>`;
}

function displayMatters(mattersData) {
    const output = document.getElementById('dataOutput');
    
    if (!mattersData || !mattersData.actions || mattersData.actions.length === 0) {
        output.innerHTML = '<p style="color: #666;">No matters found.</p>';
        return;
    }

    const matters = mattersData.actions;
    const html = `
        <ul class="matter-list">
            ${matters.map(matter => `
                <li class="matter-item">
                    <div class="matter-name">${matter.name || 'Untitled Matter'}</div>
                    <div class="matter-details">
                        ID: ${matter.id} | 
                        Reference: ${matter.reference || 'N/A'} | 
                        Status: ${matter.status || 'N/A'}
                    </div>
                </li>
            `).join('')}
        </ul>
    `;
    output.innerHTML = html;
}

function displayContacts(contactsData) {
    const output = document.getElementById('dataOutput');
    
    if (!contactsData || !contactsData.participants || contactsData.participants.length === 0) {
        output.innerHTML = '<p style="color: #666;">No contacts found.</p>';
        return;
    }

    const contacts = contactsData.participants;
    const html = `
        <ul class="matter-list">
            ${contacts.map(contact => `
                <li class="matter-item">
                    <div class="matter-name">
                        ${contact.firstName || ''} ${contact.lastName || ''} 
                        ${contact.companyName || ''}
                    </div>
                    <div class="matter-details">
                        ID: ${contact.id} | 
                        Email: ${contact.email || 'N/A'} | 
                        Type: ${contact.isIndividual ? 'Individual' : 'Company'}
                    </div>
                </li>
            `).join('')}
        </ul>
    `;
    output.innerHTML = html;
}

function displayRawData(data) {
    const output = document.getElementById('dataOutput');
    output.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

function displayMatterDetails(matter) {
    const output = document.getElementById('dataOutput');
    
    if (!matter) {
        output.innerHTML = '<div class="error">Matter not found.</div>';
        return;
    }

    const html = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
            <h3 style="margin: 0 0 20px 0; color: #007bff; font-size: 20px;">
                ${matter.name || 'Untitled Matter'}
            </h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Matter ID</div>
                    <div style="font-size: 16px; font-weight: 600; color: #333;">${matter.id}</div>
                </div>
                
                <div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">File Reference</div>
                    <div style="font-size: 16px; font-weight: 600; color: #333;">${matter.reference || 'N/A'}</div>
                </div>
                
                <div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Status</div>
                    <div style="font-size: 16px; font-weight: 600; color: ${matter.status === 'open' ? '#28a745' : '#6c757d'};">
                        ${matter.status || 'N/A'}
                    </div>
                </div>
                
                <div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Priority</div>
                    <div style="font-size: 16px; font-weight: 600; color: #333;">${matter.priority || 'N/A'}</div>
                </div>
            </div>
            
            ${matter.links && matter.links.assignedTo ? `
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Assigned To</div>
                    <div style="font-size: 14px; color: #333;">Participant ID: ${matter.links.assignedTo}</div>
                </div>
            ` : ''}
            
            <details style="margin-top: 20px;">
                <summary style="cursor: pointer; color: #007bff; font-weight: 600;">Show Full JSON</summary>
                <pre style="margin-top: 10px; background: white; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto;">${JSON.stringify(matter, null, 2)}</pre>
            </details>
        </div>
    `;
    
    output.innerHTML = html;
}

// Button Event Handlers
document.getElementById('testConnection').addEventListener('click', async () => {
    try {
        updateStatus('loading', 'Testing connection...');
        showLoading('Testing API connection...');
        
        // Try to fetch a single matter
        const data = await client.apiRequest('api/rest/actions?page[size]=1', { method: 'GET' });
        
        updateStatus('connected', 'Connection test successful!');
        displayRawData(data);
        
        setTimeout(() => {
            updateStatus('connected', 'Connected to Actionstep');
        }, 2000);
    } catch (error) {
        console.error('Connection test failed:', error);
        updateStatus('disconnected', 'Connection test failed');
        showError(`Connection test failed: ${error.message}`);
    }
});

document.getElementById('loadMatters').addEventListener('click', async () => {
    try {
        updateStatus('loading', 'Loading matters...');
        showLoading('Loading your matters...');
        
        const data = await client.getMatters({
            'page[size]': 10,
            'sort': '-id'
        });
        
        updateStatus('connected', 'Connected to Actionstep');
        displayMatters(data);
    } catch (error) {
        console.error('Failed to load matters:', error);
        updateStatus('disconnected', 'Failed to load matters');
        showError(`Failed to load matters: ${error.message}`);
    }
});

document.getElementById('loadContacts').addEventListener('click', async () => {
    try {
        updateStatus('loading', 'Loading contacts...');
        showLoading('Loading contacts...');
        
        const data = await client.getContacts({
            'page[size]': 10,
            'sort': '-id'
        });
        
        updateStatus('connected', 'Connected to Actionstep');
        displayContacts(data);
    } catch (error) {
        console.error('Failed to load contacts:', error);
        updateStatus('disconnected', 'Failed to load contacts');
        showError(`Failed to load contacts: ${error.message}`);
    }
});

document.getElementById('lookupMatter').addEventListener('click', async () => {
    const matterId = document.getElementById('matterIdInput').value.trim();
    
    if (!matterId) {
        showError('Please enter a Matter ID');
        return;
    }
    
    if (!/^\d+$/.test(matterId)) {
        showError('Matter ID must be a number');
        return;
    }
    
    try {
        updateStatus('loading', 'Looking up matter...');
        showLoading(`Loading matter ${matterId}...`);
        
        const data = await client.getMatterById(matterId);
        
        updateStatus('connected', 'Connected to Actionstep');
        
        // The response contains an 'actions' array with the matter
        if (data.actions && data.actions.length > 0) {
            displayMatterDetails(data.actions[0]);
        } else {
            showError(`Matter ID ${matterId} not found`);
        }
    } catch (error) {
        console.error('Failed to lookup matter:', error);
        updateStatus('disconnected', 'Failed to lookup matter');
        showError(`Failed to lookup matter: ${error.message}`);
    }
});

// Allow Enter key to trigger lookup
document.getElementById('matterIdInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        document.getElementById('lookupMatter').click();
    }
});

// Make client globally available for debugging
window.actionstepClient = client;

console.log('Actionstep Client initialized');
