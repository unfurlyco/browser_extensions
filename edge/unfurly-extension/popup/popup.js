console.log('Popup script starting');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  
  // Get form elements
  const form = document.getElementById('login-form');
  const button = document.getElementById('login-btn');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const urlsList = document.getElementById('urls-list');

  // Check if already logged in
  chrome.storage.local.get(['authToken', 'userProfile'], (result) => {
    if (result.authToken && result.userProfile) {
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('logged-in-section').style.display = 'block';
      fetchRecentUrls(result.authToken);
    }
  });

  // Add direct click handler to button
  button.onclick = async (e) => {
    e.preventDefault();
    console.log('Button clicked directly');
    
    try {
      button.disabled = true;
      button.textContent = 'Logging in...';

      console.log('Attempting login with:', {
        username: email.value,
        password: '***'
      });

      const response = await fetch('https://unfur.ly/api/ui/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: email.value,
          password: password.value
        })
      });

      console.log('Login response status:', response.status);
      const data = await response.json();
      console.log('Login response data:', data);

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (data.token) {
        console.log('Login successful, storing token');
        await chrome.storage.local.set({ 
          authToken: data.token,
          userProfile: {
            email: email.value
          }
        });

        // Send message to background script
        console.log('Sending message to background');
        await chrome.runtime.sendMessage({ 
          type: "login", 
          token: data.token 
        });

        // Hide login form and show logged in section
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('logged-in-section').style.display = 'block';

        // Fetch recent URLs
        fetchRecentUrls(data.token);
      }

    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + (error.message || 'Unknown error'));
    } finally {
      button.disabled = false;
      button.textContent = 'Login';
    }
  };

  // Add logout handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await chrome.runtime.sendMessage({ type: "logout" });
      document.getElementById('login-section').style.display = 'block';
      document.getElementById('logged-in-section').style.display = 'none';
    };
  }

  async function fetchRecentUrls(token) {
    try {
      console.log('Fetching recent URLs');
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
      console.log('Fetched URLs:', data);
      
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
        button.onclick = async (e) => {
          const url = e.currentTarget.dataset.url;
          try {
            await navigator.clipboard.writeText(url);
            const icon = e.currentTarget.querySelector('.pi');
            icon.classList.remove('pi-copy');
            icon.classList.add('pi-check');
            setTimeout(() => {
              icon.classList.remove('pi-check');
              icon.classList.add('pi-copy');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        };
      });

      // QR code button handlers
      table.querySelectorAll('.qr-btn').forEach(button => {
        button.onclick = (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          const modal = document.getElementById('qr-modal');
          const modalTitle = modal.querySelector('h3');
          modalTitle.innerHTML = `QR Code for:<br><a href="${url}" target="_blank" class="modal-furl-link">${url.replace('https://', '')}</a>`;
          modal.style.display = 'block';
          generateQRCode(url);
        };
      });

      // Analytics button handlers
      table.querySelectorAll('.analytics-btn').forEach(button => {
        button.onclick = (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const key = urlObj.pathname.substring(1); // Remove leading slash
            const analyticsUrl = `https://unfur.ly/app/analytics?domain=${domain}&key=${key}`;
            chrome.tabs.create({ url: analyticsUrl });
          } catch (error) {
            console.error('Error parsing URL for analytics:', error);
          }
        };
      });

      // Add event listeners for snapshot buttons
      table.querySelectorAll('.snapshot-btn').forEach(button => {
        button.onclick = (e) => {
          const url = e.currentTarget.closest('tr').querySelector('.short-url').href;
          const snapshotUrl = `${url}.snap`;
          chrome.tabs.create({ url: snapshotUrl });
        };
      });

      // Clear and update the URLs list
      if (urlsList) {
        urlsList.innerHTML = '';
        urlsList.appendChild(table);
      }

    } catch (error) {
      console.error('Error fetching recent URLs:', error);
      if (urlsList) {
        urlsList.innerHTML = '<div class="error">Failed to load recent URLs</div>';
      }
    }
  }

  // Log when inputs change
  email.onchange = () => console.log('Email changed:', email.value);
  password.onchange = () => console.log('Password changed:', password.value);

  // Log initial state
  console.log('Elements found:', {
    form: !!form,
    button: !!button,
    email: !!email,
    password: !!password,
    urlsList: !!urlsList
  });

  // Add modal close functionality
  const closeModal = document.querySelector('.close-modal');
  if (closeModal) {
    closeModal.onclick = () => {
      document.getElementById('qr-modal').style.display = 'none';
    };
  }

  // Add QR download functionality
  const downloadQR = document.getElementById('download-qr');
  if (downloadQR) {
    downloadQR.onclick = () => {
      const canvas = document.querySelector('#qrcode canvas');
      if (!canvas) {
        console.error('No canvas found for download');
        return;
      }
      
      const link = document.createElement('a');
      link.download = 'qr-code.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
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
        
        logo.src = chrome.runtime.getURL('icons/icon128.png');
      }, 100);
      
    } catch (error) {
      console.error('Error generating QR code:', error);
      const qrcodeDiv = document.getElementById('qrcode');
      if (qrcodeDiv) {
        qrcodeDiv.innerHTML = `<div style="color: red; text-align: center;">Error generating QR code</div>`;
      }
    }
  }
}); 