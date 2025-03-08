let authToken = null;
let preventAutoLogin = false;

// Add these constants at the top
const TOKEN_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const TOKEN_CHECK_KEY = 'lastTokenCheck';

// Create context menu items
browser.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated - Creating context menu items...');
  
  // Create parent menu item
  browser.contextMenus.create({
    id: "unfurlyMenu",
    title: "Unfur.ly - URL Shortener",
    contexts: ["all"]
  });

  // Context menu for links
  browser.contextMenus.create({
    id: "furlLink",
    parentId: "unfurlyMenu",
    title: "Furl This Link",
    contexts: ["link"]
  });

  // Context menu for pages
  browser.contextMenus.create({
    id: "furlPage",
    parentId: "unfurlyMenu",
    title: "Furl This Page",
    contexts: ["all"]
  });

  // Add separator
  browser.contextMenus.create({
    id: "separator",
    parentId: "unfurlyMenu",
    type: "separator",
    contexts: ["all"]
  });

  // Add "Go to App" menu item
  browser.contextMenus.create({
    id: "goToApp",
    parentId: "unfurlyMenu",
    title: "Go to App",
    contexts: ["all"]
  });
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "goToApp") {
    browser.tabs.create({ url: 'https://unfur.ly/app/main' });
    return;
  }

  console.log('Context menu clicked:', { info, tab });
  const urlToShorten = info.menuItemId === "furlLink" ? info.linkUrl : tab.url;
  const pageTitle = info.menuItemId === "furlLink" ? urlToShorten : tab.title;
  
  browser.storage.local.get(["authToken"]).then(async (result) => {
    if (!result.authToken) {
      console.log('No auth token found, showing message');
      browser.tabs.sendMessage(tab.id, {
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
          'Authorization': `Bearer ${result.authToken}`,
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
      browser.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "URL shortened successfully!",
        shortUrl: data.furlUrl,
        isError: false
      });

      // Copy to clipboard
      browser.tabs.sendMessage(tab.id, {
        type: "copyToClipboard",
        shortUrl: data.furlUrl
      });

    } catch (error) {
      console.error('Error creating short URL:', error);
      browser.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "Failed to create short URL: " + error.message,
        isError: true
      });
    }
  });
});

// Add notification click listener
browser.notifications.onClicked.addListener(() => {
  browser.browserAction.openPopup();
});

// Add this function to handle token injection
async function executeTokenInjection(token) {
  console.log('Injecting token into unfur.ly localStorage');
  try {
    // First try to find any existing unfur.ly tabs
    const tabs = await browser.tabs.query({ url: "*://unfur.ly/*" });
    
    if (tabs.length > 0) {
      // If we have an unfur.ly tab, inject into it
      await browser.tabs.executeScript(tabs[0].id, {
        code: `
          if ("${token}") {
            localStorage.setItem('token', "${token}");
            console.log('Token injected into localStorage');
          } else {
            localStorage.removeItem('token');
            console.log('Token removed from localStorage');
          }
        `
      });
    } else {
      // If no unfur.ly tab exists, store the token in extension's storage
      // The content script will handle injecting it when unfur.ly loads
      await browser.storage.local.set({ 
        unfurlyToken: token 
      });
    }
  } catch (error) {
    console.error('Token injection failed:', error);
  }
}

// Add this function to handle logout
async function handleLogout() {
  console.log('Logging out of extension');
  
  try {
    // Clear auth token but keep saved credentials
    await browser.storage.local.remove(["authToken", "userProfile"]);
    authToken = null;
    
    // Clear token from localStorage
    await executeTokenInjection(null);

  } catch (error) {
    console.error('Error in handleLogout:', error);
  }
}

// Update the message listener to ensure it's before any function calls
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received in background:', message);

  if (message.type === "login") {
    console.log('Setting auth token');
    authToken = message.token;
    executeTokenInjection(message.token);
  } 
  else if (message.type === "logout") {
    handleLogout();
  }
  // Add other message handlers as needed...
});

// Rest of your background.js code...
// Replace all chrome. with browser. 