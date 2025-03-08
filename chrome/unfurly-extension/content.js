// Listen for messages from background script
console.log('Content script loaded and listening for messages');

// Message listener
chrome.runtime.onMessage.addListener((message) => {
  console.log('Content script received message:', message);
  
  if (message.type === "showNotification") {
    console.log('Showing notification:', message);
    showNotification(message.message, message.isError, message.shortUrl);
  }
  
  if (message.type === "copyToClipboard") {
    console.log('Copying to clipboard:', message.shortUrl);
    navigator.clipboard.writeText(message.shortUrl)
      .then(() => {
        console.log("Clipboard copy successful");
      })
      .catch(err => {
        console.error("Clipboard copy failed:", err);
      });
  }
});

function showNotification(message, isError = false, shortUrl = null) {
  // Remove any existing notifications
  const existingNotification = document.querySelector('.unfurly-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'unfurly-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px;
    border-radius: 8px;
    z-index: 999999;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 300px;
    background-color: ${isError ? '#FEE2E2' : '#ECFDF5'};
    color: ${isError ? '#991B1B' : '#065F46'};
    border: 1px solid ${isError ? '#FCA5A5' : '#6EE7B7'};
  `;

  const messageDiv = document.createElement('div');
  messageDiv.textContent = message;
  notification.appendChild(messageDiv);

  if (shortUrl) {
    const urlDiv = document.createElement('div');
    urlDiv.style.cssText = `
      font-family: monospace;
      padding: 8px;
      background: ${isError ? '#FEF2F2' : '#F0FDF4'};
      border-radius: 4px;
      word-break: break-all;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    urlDiv.innerHTML = `<a href="${shortUrl}" target="_blank" style="color: inherit; text-decoration: none;">${shortUrl}</a>`;
    urlDiv.addEventListener('mouseover', () => {
      urlDiv.style.backgroundColor = isError ? '#FEE2E2' : '#DCFCE7';
    });
    urlDiv.addEventListener('mouseout', () => {
      urlDiv.style.backgroundColor = isError ? '#FEF2F2' : '#F0FDF4';
    });
    notification.appendChild(urlDiv);
  }

  document.body.appendChild(notification);

  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s ease-in-out';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}