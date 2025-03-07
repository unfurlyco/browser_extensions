// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "showNotification") {
    showNotification(message.message, message.isError, message.shortUrl);
  }
  if (message.type === "copyToClipboard") {
    // const input = document.createElement('input');
    // input.style.position = 'fixed';
    // input.style.opacity = '0';
    // input.value = message.text;
    // document.body.appendChild(input);
    // input.select();
    // document.execCommand('copy');
    // document.body.removeChild(input);
    // sendResponse({ success: true });

    console.log("Copying to clipboard:", message.shortUrl);
    navigator.clipboard.writeText(message.shortUrl)
      .then(() => {
        console.log("Copied!");
        sendResponse({ status: "success" });
      })
      .catch(err => {
        console.error("Copy failed", err);
        sendResponse({ status: "error", error: err });
      });
    // Return true to indicate asynchronous sendResponse
    return true;

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
    `;
    urlDiv.textContent = shortUrl;
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