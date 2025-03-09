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
  console.log('Context menu clicked, tab:', tab);
  
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
      }).then(() => {
        console.log('Notification message sent successfully');
      }).catch((error) => {
        console.error('Failed to send notification message:', error);
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

      // Send single notification with copy button
      browser.tabs.sendMessage(tab.id, {
        type: "showNotification",
        message: "URL shortened successfully!",
        shortUrl: data.furlUrl,
        isError: false
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

// Message listener
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
});
