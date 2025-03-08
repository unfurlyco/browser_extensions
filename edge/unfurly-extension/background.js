let token = null;
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

  // Context menu for links
  chrome.contextMenus.create({
    id: "furlLink",
    parentId: "unfurlyMenu",
    title: "Furl This Link",
    contexts: ["link"]
  });

  // Context menu for pages
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
  
  chrome.storage.local.get(["token"]).then(async (result) => {
    if (!result.token) {
      console.log('No token found, showing message');
      chrome.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "✨ Hey there! Click the Unfur.ly icon in your toolbar and log in to start creating magical short URLs! 🚀",
        isError: true
      });
      return;
    }

    try {
      // Make API call to create short URL
      const response = await fetch('https://unfur.ly/api/ui/v1/redirects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          redirectTo: urlToShorten,
          title: pageTitle
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create short URL');
      }

      const data = await response.json();
      console.log('Short URL created:', data);

      // Send message to content script to show notification
      chrome.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "URL shortened successfully!",
        shortUrl: data.furlUrl,
        isError: false
      });

      // Copy to clipboard
      chrome.tabs.sendMessage(tab.id, {
        type: "copyToClipboard",
        shortUrl: data.furlUrl
      });

    } catch (error) {
      console.error('Error creating short URL:', error);
      chrome.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "Failed to create short URL: " + error.message,
        isError: true
      });
    }
  });
});

// Simplify token injection function
async function executeTokenInjection(token) {
  console.log('Storing token for unfur.ly');
  try {
    // Store the token in extension storage
    // Content script will handle injecting it into localStorage when on unfur.ly
    await chrome.storage.local.set({ 
      token: token 
    });
  } catch (error) {
    console.error('Token storage failed:', error);
  }
}

// Update the logout function
async function handleLogout() {
  console.log('Logging out of extension');
  
  try {
    await chrome.storage.local.remove(["token", "userProfile"]);
    token = null;
  } catch (error) {
    console.error('Error in handleLogout:', error);
  }
}

// Update the message listener to ensure it's before any function calls
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background:', message);

  if (message.type === "login") {
    console.log('Setting token');
    token = message.token;
    executeTokenInjection(message.token);
  } 
  else if (message.type === "logout") {
    handleLogout();
  }
  // Add other message handlers as needed...
});

// Add this to background.js
chrome.webNavigation.onBeforeNavigate.addListener(
  function(details) {
    // Get the token and inject it before page load
    chrome.storage.local.get(['token'], function(result) {
      if (result.token) {
        chrome.tabs.executeScript(details.tabId, {
          code: `
            localStorage.setItem('token', '${result.token}');
            console.log('Token injected before page load');
          `,
          runAt: 'document_start'
        });
      }
    });
  },
  {
    url: [
      { hostContains: 'unfur.ly' }
    ]
  }
);

// Rest of your background.js code...
// Replace all chrome. with browser. 