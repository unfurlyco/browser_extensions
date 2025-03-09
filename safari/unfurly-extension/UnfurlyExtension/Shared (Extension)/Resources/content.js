// Add this at the very start of content.js
console.log('%c Unfurly Content Script Loaded ', 'background: #222; color: #bada55; font-size: 16px;');

// Add this at the start of content.js
if (window.location.hostname === 'unfur.ly') {
  console.log('On unfur.ly domain, checking for token');
  browser.storage.local.get('token').then(result => {
    if (result.token && !localStorage.getItem('tokenInjected')) {
      console.log('Found token to inject');
      injectToken(result.token);
    }
  });
}

// Add notification styles
const style = document.createElement('style');
style.textContent = `
  .unfurly-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 999999;
    transition: opacity 0.3s ease;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    background-color: #4caf50;
  }
  .unfurly-notification.error {
    background-color: #f44336;
  }
  .unfurly-notification .copy-button {
    background: rgba(255,255,255,0.3);
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  .unfurly-notification .copy-button:hover {
    background: rgba(255,255,255,0.4);
  }
  .unfurly-notification .copy-button:active {
    background: rgba(255,255,255,0.5);
  }
`;
document.head.appendChild(style);

function showNotification(message, isError = false, shortUrl = null) {
  console.log('Showing notification:', { message, isError, shortUrl });
  
  // Remove any existing notifications
  const existingNotification = document.querySelector('.unfurly-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = `unfurly-notification ${isError ? 'error' : 'success'}`;
  
  let notificationContent = message;
  if (shortUrl && !isError) {
    notificationContent += `
      <button class="copy-button" data-url="${shortUrl}">
        Copy URL
      </button>`;
  }
  
  notification.innerHTML = notificationContent;
  document.body.appendChild(notification);

  // Add click handler for copy button if it exists
  const copyButton = notification.querySelector('.copy-button');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      try {
        await copyToClipboard(shortUrl);
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy URL';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        copyButton.textContent = 'Copy failed';
      }
    });
  }

  // Auto-remove notification after 5 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

function copyToClipboard(text) {
  // Try multiple approaches to copy
  const copyMethods = [
    // Method 1: execCommand with user interaction
    () => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Make the textarea visible but minimal
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = 0;
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        document.body.removeChild(textArea);
        throw err;
      }
    },
    // Method 2: Clipboard API
    async () => {
      await navigator.clipboard.writeText(text);
      return true;
    }
  ];

  return new Promise(async (resolve, reject) => {
    for (const method of copyMethods) {
      try {
        const result = await method();
        if (result) {
          resolve(true);
          return;
        }
      } catch (e) {
        console.log('Copy method failed, trying next...', e);
      }
    }
    reject(new Error('All copy methods failed'));
  });
}

// At the start of content.js
function injectToken(token) {
  console.log('Injecting token into localStorage');
  try {
    localStorage.setItem('token', token);
    // Also set a flag to indicate we've injected the token
    localStorage.setItem('tokenInjected', 'true');
    console.log('Token injection successful');
  } catch (error) {
    console.error('Failed to inject token:', error);
  }
}

// Update the message listener
browser.runtime.onMessage.addListener((message) => {
  console.log('Content script received message:', message);
  
  if (message.type === "showNotification") {
    console.log('Showing notification:', message);
    showNotification(message.message, message.isError, message.shortUrl);
  }
  
  if (message.type === "copyToClipboard") {
    console.log('Showing notification with copy button:', message.shortUrl);
    // Instead of trying to auto-copy, just show the notification with copy button
    showNotification("URL created successfully!", false, message.shortUrl);
  }

  if (message.type === "injectToken") {
    console.log('Received token injection request');
    injectToken(message.token);
  }
});

browser.runtime.sendMessage({ greeting: "hello" }).then((response) => {
    console.log("Received response: ", response);
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received request: ", request);
});
