let authToken = null;
let preventAutoLogin = false;

// Add these constants at the top
const TOKEN_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const TOKEN_CHECK_KEY = 'lastTokenCheck';

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated - Creating context menu items...');
  
  // Create parent menu item
  chrome.contextMenus.create({
    id: "unfurlyMenu",
    title: "Unfur.ly - URL Shortener",
    contexts: ["all"]
  });

  // Context menu for links - show in both link and page contexts
  chrome.contextMenus.create({
    id: "furlLink",
    parentId: "unfurlyMenu",
    title: "Furl This Link",
    contexts: ["link"]
  });

  // Context menu for pages - show in all contexts
  chrome.contextMenus.create({
    id: "furlPage",
    parentId: "unfurlyMenu",
    title: "Furl This Page",
    contexts: ["all"]
  });

  // Add separator
  chrome.contextMenus.create({
    id: "separator",
    parentId: "unfurlyMenu",
    type: "separator",
    contexts: ["all"]
  });

  // Add "Go to App" menu item
  chrome.contextMenus.create({
    id: "goToApp",
    parentId: "unfurlyMenu",
    title: "Go to App",
    contexts: ["all"]
  });
});


// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "goToApp") {
    chrome.tabs.create({ url: 'https://unfur.ly/app/main' });
    return;
  }

  console.log('Context menu clicked:', { info, tab });
  const urlToShorten = info.menuItemId === "furlLink" ? info.linkUrl : tab.url;
  const pageTitle = info.menuItemId === "furlLink" ? urlToShorten : tab.title;
  
  chrome.storage.local.get(["authToken"]).then(async (result) => {
    if (!result.authToken) {
      console.log('No auth token found, showing login notification');
      // Send notification to content script
      chrome.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "Please log in to create a short URL",
        isError: true
      });
      // Set flag to show login prompt when popup opens
      await chrome.storage.local.set({ "showLoginPrompt": true });
      return;
    }

    try {
      console.log('Attempting to create short URL for:', urlToShorten);
      const response = await fetch('https://unfur.ly/api/ui/v1/redirects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          redirectTo: urlToShorten,
          title: pageTitle,
          // vanity: '',
          private: true,
          type: 'STD',
          domain: 'unfur.ly'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create short URL');
      }

      const data = await response.json();
      console.log('Short URL created successfully:', data);
      
      // Notify all open popups to refresh their lists
      chrome.runtime.sendMessage({ 
        type: "refreshFurlsList" 
      });

      // Inject content script if not already injected
      try {
        console.log('Attempting to inject content script into tab:', tab.id);
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Content script injection successful');
      } catch (e) {
        console.error('Content script injection error:', e);
      }

      // Send message to copy URL to clipboard
      console.log('Sending copyToClipboard message to tab:', tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: "copyToClipboard",
        shortUrl: data.furlUrl
      }).catch(e => console.error('Copy message failed:', e));

      // Send message to show success notification
      console.log('Sending showNotification message to tab:', tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "URL shortened successfully! Copied to clipboard.",
        shortUrl: data.furlUrl
      }).catch(e => console.error('Notification message failed:', e));

    } catch (error) {
      console.error('Error in shortening process:', error);
      try {
        // Attempt to show error notification
        console.log('Attempting to send error notification to tab:', tab.id);
        await chrome.tabs.sendMessage(tab.id, {
          type: "showNotification",
          message: "Failed to create shortened URL. Please try again. " + error,
          isError: true
        }).catch(e => console.error('Error notification failed:', e));
      } catch (e) {
        console.error('Failed to send error notification:', e);
      }
    }
  });
});

// Handle browser action click (toolbar icon)
chrome.action.onClicked.addListener((tab) => {
  console.log('Browser action clicked for tab:', tab);
  handleFurl(tab.url, tab.id);
});

async function handleFurl(url, tabId) {
  console.log('handleFurl called with:', { url, tabId });

  // First verify the tab exists
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      throw new Error('Tab not found');
    }
  } catch (e) {
    console.error('Tab verification failed:', e);
    return;
  }

  // Check authentication
  const auth = await chrome.storage.local.get("authToken");
  console.log('Auth token status:', auth.authToken ? 'Present' : 'Missing');

  if (!auth.authToken) {
    console.log('No auth token found - showing login required message');
    try {
      await chrome.tabs.sendMessage(tabId, { 
        type: "showNotification",
        message: "Please log in to shorten URLs",
        isError: true
      });
    } catch (e) {
      console.error('Failed to send login required message:', e);
    }
    return;
  }

  try {
    // Get the page title for the URL
    let title = '';
    try {
      console.log('Attempting to get tab title for tabId:', tabId);
      const tab = await chrome.tabs.get(tabId);
      title = tab.title || '';
      console.log('Retrieved tab title:', title);
    } catch (e) {
      console.warn('Could not get page title:', e);
    }

    console.log('Sending API request with payload:', {
      redirectTo: url,
      type: 'STD',
      private: false,
      title: title,
      domain: 'unfur.ly'
    });

    const response = await fetch('https://unfur.ly/api/ui/v1/redirects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.authToken}`
      },
      body: JSON.stringify({ 
        redirectTo: url,
        type: 'STD',
        private: false,
        title: title,
        domain: 'unfur.ly'
      })
    });

    console.log('API response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('API response data:', data);

    if (data.furlUrl) {
      try {
        // Use Chrome's clipboard API directly
        // await chrome.clipboard.writeText(data.furlUrl);
        // console.log('Copied to clipboard:', data.furlUrl);

        // Tell the content script to copy
        await chrome.tabs.sendMessage(tabId, {
          type: "copyToClipboard",
          shortUrl: data.furlUrl
        });

      } catch (copyError) {
        console.error('Failed to copy to clipboard:', copyError);
        // Continue with notification even if copy fails
      }
      
      // Show notification
      try {
        await chrome.tabs.sendMessage(tabId, { 
          type: "showNotification",
          message: "URL shortened and copied to clipboard!",
          shortUrl: data.furlUrl
        });
        console.log('Success notification sent');
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }
    } else {
      throw new Error('No shortened URL in response');
    }
  } catch (error) {
    console.error('Error in handleFurl:', error);
    console.error('Full error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    try {
      await chrome.tabs.sendMessage(tabId, { 
        type: "showNotification",
        message: "Failed to shorten URL. Please try again.",
        isError: true
      });
    } catch (notifyError) {
      console.error('Failed to send error notification:', notifyError);
    }

  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background:', message);
  console.log('Sender:', sender);

  if (message.type === 'login_request') {
    console.log('Processing login request');
    
    fetch('https://unfur.ly/api/ui/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(message.data)
    })
    .then(response => {
      console.log('Login response status:', response.status);
      return response.json();
    })
    .then(data => {
      console.log('Login response data:', data);
      if (data.token) {
        console.log('Login successful');
        sendResponse({data});
      } else {
        console.log('Login failed - no token in response');
        sendResponse({error: 'Login failed'});
      }
    })
    .catch(error => {
      console.error('Login error:', error);
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      sendResponse({error: error.message});
    });

    return true;
  } else if (message.type === "login") {
    console.log('Setting auth token');
    authToken = message.token;
    executeTokenInjection(message.token);
  } else if (message.type === "logout") {
    handleLogout();
  } else if (message.type === "executeTokenInjection") {
    if (sender.tab?.id) {
      executeTokenInjection(message.token);
    }
  } else if (message.type === "siteLogout") {
    console.log('Site logout detected');
    
    // Show confirmation dialog via popup
    chrome.windows.create({
      url: 'popup/logout-confirm.html',
      type: 'popup',
      width: 400,
      height: 250
    });
  } else if (message.type === "preventAutoLogin") {
    preventAutoLogin = message.value;
    console.log('Auto login prevention set to:', preventAutoLogin);
  }
});

// Check for stored auth token on startup
chrome.storage.local.get("authToken", (result) => {
  console.log('Checking stored auth token on startup:', result.authToken ? 'Present' : 'Missing');
  if (result.authToken) {
    authToken = result.authToken;
  }
});

// Add this function to handle token refresh
async function refreshToken() {
  console.log('Checking if token refresh is needed');
  
  try {
    const storage = await chrome.storage.local.get(["authToken", "savedCredentials", TOKEN_CHECK_KEY]);
    const lastCheck = storage[TOKEN_CHECK_KEY] || 0;
    const now = Date.now();

    // Check if enough time has passed since last check
    if (now - lastCheck < TOKEN_CHECK_INTERVAL) {
      console.log('Not time to check token yet');
      return;
    }

    // Update last check time
    await chrome.storage.local.set({ [TOKEN_CHECK_KEY]: now });

    // If we have a token, test if it's still valid
    if (storage.authToken) {
      const response = await fetch('https://unfur.ly/api/ui/v1/redirects', {
        headers: {
          'Authorization': `Bearer ${storage.authToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        console.log('Token still valid');
        return;
      }
      
      console.log('Token expired, attempting to refresh');
    }

    // If we have saved credentials, try to log in again
    if (storage.savedCredentials) {
      console.log('Attempting to refresh login with saved credentials');
      
      const response = await fetch('https://unfur.ly/api/ui/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: storage.savedCredentials.email,
          password: storage.savedCredentials.password
        })
      });

      const data = await response.json();
      
      if (data.token) {
        console.log('Successfully refreshed token');
        await chrome.storage.local.set({ 
          authToken: data.token,
          userProfile: {
            email: storage.savedCredentials.email
          }
        });
        
        // Notify any open popups to refresh
        chrome.runtime.sendMessage({ 
          type: "tokenRefreshed",
          token: data.token 
        });

        // Inject token into any open unfur.ly tabs
        const tabs = await chrome.tabs.query({url: "https://unfur.ly/*"});
        for (const tab of tabs) {
          await executeTokenInjection(data.token);
        }
      } else {
        console.log('Failed to refresh token');
        // Clear the auth token but keep saved credentials
        await chrome.storage.local.remove("authToken");
      }
    }
  } catch (error) {
    console.error('Error in token refresh:', error);
  }
}

// Add periodic token check
setInterval(refreshToken, 30 * 60 * 1000); // Check every 30 minutes

// Also check on startup
chrome.runtime.onStartup.addListener(refreshToken);

// Add check when extension is installed or updated
chrome.runtime.onInstalled.addListener(refreshToken);

// Add this function after the existing functions
async function executeTokenInjection(token) {
  console.log('Injecting token into unfur.ly localStorage');
  try {
    // Create a temporary tab to execute the script
    const tab = await chrome.tabs.create({ 
      url: 'https://unfur.ly/storage-update',
      active: false 
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (token) => {
        if (token) {
          localStorage.setItem('token', token);
          console.log('Token injected into localStorage');
        } else {
          localStorage.removeItem('token');
          console.log('Token removed from localStorage');
        }
      },
      args: [token]
    });

    // Close the temporary tab
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.error('Token injection failed:', error);
  }
}

// Update the handleLogout function
async function handleLogout() {
  console.log('Logging out of extension');
  
  try {
    // Clear auth token but keep saved credentials
    await chrome.storage.local.remove(["authToken", "userProfile"]);
    authToken = null;
    
    // Clear token from localStorage
    await executeTokenInjection(null);

  } catch (error) {
    console.error('Error in handleLogout:', error);
  }
} 