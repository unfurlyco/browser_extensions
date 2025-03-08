document.addEventListener('DOMContentLoaded', () => {
  // Debug check for QRCode library
  if (typeof QRCode === 'undefined') {
    console.error('QRCode library not loaded!');
    return;
  }
  console.log('QRCode library loaded successfully');

  const loginSection = document.getElementById('login-section');
  const loggedInSection = document.getElementById('logged-in-section');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const urlsList = document.getElementById('urls-list');
  const rememberMeCheckbox = document.getElementById('remember-me');

  // Check for login prompt flag
  browser.storage.local.get(["authToken", "userProfile", "savedCredentials", "showLoginPrompt"])
    .then((result) => {
      if (result.authToken && result.userProfile) {
        showLoggedInState(result.userProfile);
        fetchRecentUrls(result.authToken);
      } else {
        if (result.savedCredentials) {
          // Auto-fill saved credentials
          emailInput.value = result.savedCredentials.email;
          passwordInput.value = result.savedCredentials.password;
          rememberMeCheckbox.checked = true;
        }
        
        // Show login prompt if flag is set
        if (result.showLoginPrompt) {
          showError("Please login to create a furl");
          // Clear the flag
          browser.storage.local.remove("showLoginPrompt");
        }
      }
    });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
      const response = await fetch('https://unfur.ly/api/ui/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: emailInput.value,
          password: passwordInput.value
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      console.log('Login successful:', data);
      if (data.token) {
        // Store auth token and profile
        await browser.storage.local.set({ 
          authToken: data.token,
          userProfile: {
            email: emailInput.value
          }
        });

        // Save credentials if "Remember Me" is checked
        if (rememberMeCheckbox.checked) {
          await browser.storage.local.set({
            savedCredentials: {
              email: emailInput.value,
              password: passwordInput.value
            }
          });
        } else {
          // Clear saved credentials if "Remember Me" is unchecked
          await browser.storage.local.remove("savedCredentials");
        }

        // Send message to background script
        try {
          await browser.runtime.sendMessage({ 
            type: "login", 
            token: data.token 
          });
        } catch (error) {
          console.log('Background script notification failed:', error);
          // Continue anyway since we have the token stored
        }

        showLoggedInState({email: emailInput.value});
        fetchRecentUrls(data.token);

        // Only clear inputs if "Remember Me" is unchecked
        if (!rememberMeCheckbox.checked) {
          emailInput.value = '';
          passwordInput.value = '';
        }
      }
    } catch (error) {
      console.error('Login failed:', error);
      showError(error.message || 'Failed to connect to the server. Please try again.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    // Clear auth token and profile
    await browser.storage.local.remove(["authToken", "userProfile"]);
    await browser.runtime.sendMessage({ type: "logout" });
    showLoginState();

    // Add this to auto-fill credentials if they were saved
    const { savedCredentials } = await browser.storage.local.get("savedCredentials");
    if (savedCredentials) {
      emailInput.value = savedCredentials.email;
      passwordInput.value = savedCredentials.password;
      rememberMeCheckbox.checked = true;
    }
  });

  function showLoggedInState(profile) {
    loginSection.style.display = 'none';
    loggedInSection.style.display = 'block';
    
    // Update logo click handler for logged-in state
    document.querySelectorAll('.logo').forEach(logo => {
      logo.addEventListener('click', () => {
        browser.tabs.create({ url: 'https://unfur.ly/app/main' });
      });
    });
  }

  function showLoginState() {
    loginSection.style.display = 'block';
    loggedInSection.style.display = 'none';
    
    // Update logo click handler for logged-out state
    document.querySelectorAll('.logo').forEach(logo => {
      logo.addEventListener('click', () => {
        browser.tabs.create({ url: 'https://unfur.ly/app/login' });
      });
    });
  }

  function showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    loginForm.insertBefore(errorDiv, loginBtn);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  async function fetchRecentUrls(token) {
    try {
      const response = await fetch('https://unfur.ly/api/ui/v1/redirects', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch URLs');
      }

      const data = await response.json();
      urlsList.innerHTML = '';
      
      // Sort items by creation date (newest first)
      const sortedItems = data.items.sort((a, b) => 
        new Date(b.createdOn) - new Date(a.createdOn)
      );

      // Create table structure
      const table = document.createElement('table');
      table.className = 'urls-table';
      
      table.innerHTML = `
        <thead>
          <tr>
            <th>Short URL</th>
            <th>Original URL</th>
            <th>Title</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      `;

      const tbody = table.querySelector('tbody');
      
      function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
      }

      sortedItems.slice(0, 10).forEach(url => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <a href="${url.furlUrl}" target="_blank" class="short-url">
              ${url.furlUrl.replace('https://', '')}
            </a>
          </td>
          <td>
            <div class="original-url" title="${url.redirectTo}">
              ${url.redirectTo}
            </div>
          </td>
          <td>
            <div class="title-cell" title="${url.title || '-'}">
              ${url.title || '-'}
            </div>
          </td>
          <td class="actions">
            <button class="action-btn copy-btn" data-tooltip="Copy to Clipboard" data-url="${url.furlUrl}">
              <i class="pi pi-copy"></i>
            </button>
            <button class="action-btn qr-btn" data-tooltip="Generate QR Furl">
              <i class="pi pi-qrcode"></i>
            </button>
            <button class="action-btn analytics-btn" data-tooltip="View Analytics">
              <i class="pi pi-chart-line"></i>
            </button>
            <button class="action-btn snapshot-btn" data-tooltip="Open Snap dashboard">
              <i class="pi pi-camera"></i>
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });

      // Add event listeners for copy buttons
      table.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
          const url = e.currentTarget.dataset.url;
          try {
            await navigator.clipboard.writeText(url);
            
            const icon = e.currentTarget.querySelector('.pi');
            icon.classList.remove('pi-copy');
            icon.classList.add('pi-check');
            e.currentTarget.classList.add('success');
            
            setTimeout(() => {
              icon.classList.remove('pi-check');
              icon.classList.add('pi-copy');
              e.currentTarget.classList.remove('success');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        });
      });

      // QR code button handlers
      table.querySelectorAll('.qr-btn').forEach(button => {
        button.addEventListener('click', (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          const modal = document.getElementById('qr-modal');
          const modalTitle = modal.querySelector('h3');
          modalTitle.innerHTML = `QR Code for:<br><a href="${url}" target="_blank" class="modal-furl-link">${url.replace('https://', '')}</a>`;
          modal.style.display = 'block';
          generateQRCode(url);
        });
      });

      // Analytics button handlers
      table.querySelectorAll('.analytics-btn').forEach(button => {
        button.addEventListener('click', (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          const urlParts = parseUnfurlUrl(url);
          
          if (urlParts) {
            const analyticsUrl = `https://unfur.ly/app/analytics?domain=${urlParts.domain}&key=${urlParts.key}`;
            browser.tabs.create({ url: analyticsUrl });
          }
        });
      });

      // Snapshot button handlers
      table.querySelectorAll('.snapshot-btn').forEach(button => {
        button.addEventListener('click', (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          const snapshotUrl = `${url}.snap`;
          browser.tabs.create({ url: snapshotUrl });
        });
      });

      urlsList.innerHTML = '';
      urlsList.appendChild(table);

      if (sortedItems.length === 0) {
        urlsList.innerHTML = '<div class="no-urls">No shortened URLs yet</div>';
      }
    } catch (error) {
      console.error('Error fetching recent URLs:', error);
      urlsList.innerHTML = '<div class="error">Failed to load recent URLs</div>';
    }
  }

  function generateQRCode(url) {
    console.log('Generating QR code for:', url);
    
    try {
      const qrcodeDiv = document.getElementById('qrcode');
      if (!qrcodeDiv) {
        throw new Error('QR code container not found');
      }
      qrcodeDiv.innerHTML = '';
      
      const qr = new QRCode(qrcodeDiv, {
        text: url,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
      
      setTimeout(() => {
        const canvas = qrcodeDiv.querySelector('canvas');
        if (!canvas) {
          console.error('Canvas not found in QR code div');
          return;
        }
        
        const ctx = canvas.getContext('2d');
        const logo = new Image();
        
        logo.onload = () => {
          const size = canvas.width;
          const logoSize = size * 0.2;
          const logoX = (size - logoSize) / 2;
          const logoY = (size - logoSize) / 2;
          
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          
          const img = qrcodeDiv.querySelector('img');
          if (img) {
            img.src = canvas.toDataURL('image/png');
          }
        };
        
        logo.src = browser.runtime.getURL('icons/icon128.png');
      }, 100);
      
    } catch (error) {
      console.error('Error generating QR code:', error);
      const qrcodeDiv = document.getElementById('qrcode');
      if (qrcodeDiv) {
        qrcodeDiv.innerHTML = `<div style="color: red; text-align: center;">Error generating QR code</div>`;
      }
    }
  }

  // Add modal close functionality
  document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('qr-modal').style.display = 'none';
  });

  // Update download functionality
  document.getElementById('download-qr').addEventListener('click', () => {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas) {
      console.error('No canvas found for download');
      return;
    }
    
    const link = document.createElement('a');
    link.download = 'qr-code.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  function parseUnfurlUrl(furlUrl) {
    try {
      const url = new URL(furlUrl);
      return {
        domain: url.hostname,
        key: url.pathname.substring(1)
      };
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  }

  // Listen for refresh requests from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "refreshFurlsList") {
      browser.storage.local.get(["authToken"]).then((result) => {
        if (result.authToken) {
          fetchRecentUrls(result.authToken);
        }
      });
    } else if (message.type === "tokenRefreshed") {
      showLoggedInState({email: emailInput.value});
      fetchRecentUrls(message.token);
    }
  });
}); 