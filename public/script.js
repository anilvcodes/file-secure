// =====================================================
// File Secure System — Frontend JavaScript
// This single file powers ALL pages. Each section first
// checks whether the elements for that page exist.
// =====================================================

const API_BASE = '/api';

// ---------------------------------------------------
// Shared helpers
// ---------------------------------------------------

function getToken() {
  return localStorage.getItem('token');
}

// Small wrapper around fetch that automatically adds the
// JWT token and handles "session expired" for us.
async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const response = await fetch(API_BASE + url, { ...options, headers });

  // Token invalid/expired → go back to the login page
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
    throw new Error('Session expired. Please log in again.');
  }
  return response;
}

function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('message-error', isError);
  element.classList.toggle('message-success', !isError);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

// ---------------------------------------------------
// Register page
// ---------------------------------------------------

const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const messageEl = document.getElementById('registerMessage');

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const response = await fetch(API_BASE + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed.');

      showMessage(messageEl, 'Account created! Redirecting to login…');
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    } catch (error) {
      showMessage(messageEl, error.message, true);
    }
  });
}

// ---------------------------------------------------
// Login page
// ---------------------------------------------------

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const messageEl = document.getElementById('loginMessage');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const response = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed.');

      // Save the token — it's our "identity bracelet" for later requests
      localStorage.setItem('token', data.token);
      window.location.href = 'dashboard.html';
    } catch (error) {
      showMessage(messageEl, error.message, true);
    }
  });
}

// ---------------------------------------------------
// Dashboard page
// ---------------------------------------------------

let filesTableBody = null;
let dashboardMessage = null;
let uploadButton = null;

async function initDashboard() {
  filesTableBody = document.getElementById('filesTableBody');
  dashboardMessage = document.getElementById('dashboardMessage');
  uploadButton = document.getElementById('uploadButton');
  const userNameEl = document.getElementById('userName');
  const logoutButton = document.getElementById('logoutButton');
  const blockchainStatusEl = document.getElementById('blockchainStatus');

  // No token? You shouldn't be here — go log in.
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  });

  uploadButton.addEventListener('click', uploadFile);

  // Show the logged-in user's name
  try {
    const response = await apiFetch('/auth/me');
    const data = await response.json();
    userNameEl.textContent = data.user.name;
  } catch (error) {
    // apiFetch already redirects to login on 401
  }

  await loadFiles();

  // Show blockchain info (bonus feature)
  try {
    const response = await apiFetch('/files/blockchain/status');
    const data = await response.json();
    blockchainStatusEl.textContent = data.isValid
      ? `⛓️ Blockchain: ${data.blocks} block(s) — chain valid ✅`
      : `⛓️ Blockchain: ${data.blocks} block(s) — chain INVALID ❌`;
  } catch (error) {
    blockchainStatusEl.textContent = 'Blockchain status unavailable';
  }
}

async function loadFiles() {
  try {
    const response = await apiFetch('/files');
    const data = await response.json();
    renderFiles(data.files || []);
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
  }
}

function renderFiles(files) {
  filesTableBody.innerHTML = '';

  if (files.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-row';
    cell.textContent = 'No files uploaded yet. Upload your first file above!';
    row.appendChild(cell);
    filesTableBody.appendChild(row);
    return;
  }

  files.forEach((file) => {
    const row = document.createElement('tr');

    // Name — using textContent (not innerHTML) protects against XSS
    const nameCell = document.createElement('td');
    nameCell.textContent = file.originalName;
    row.appendChild(nameCell);

    const sizeCell = document.createElement('td');
    sizeCell.textContent = formatFileSize(file.fileSize);
    row.appendChild(sizeCell);

    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(file.createdAt);
    row.appendChild(dateCell);

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge badge-pending';
    badge.textContent = 'Checking…';
    statusCell.appendChild(badge);
    row.appendChild(statusCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';
    actionsCell.appendChild(makeButton('Verify', 'btn-verify', () => verifyFile(file._id, badge)));
    actionsCell.appendChild(makeButton('Download', 'btn-download', () => downloadFile(file)));
    actionsCell.appendChild(makeButton('Delete', 'btn-delete', () => deleteFile(file)));
    row.appendChild(actionsCell);

    filesTableBody.appendChild(row);

    // Automatically check each file's status when the page loads
    verifyFile(file._id, badge, true);
  });
}

function makeButton(text, cssClass, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.className = 'btn btn-small ' + cssClass;
  button.addEventListener('click', onClick);
  return button;
}

async function uploadFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];

  if (!file) {
    showMessage(dashboardMessage, 'Please choose a file first.', true);
    return;
  }

  // FormData is how browsers send files (multipart/form-data)
  const formData = new FormData();
  formData.append('file', file);

  uploadButton.disabled = true;
  try {
    const response = await apiFetch('/files/upload', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Upload failed.');

    showMessage(dashboardMessage, `File "${data.file.originalName}" uploaded and secured!`);
    fileInput.value = '';
    await loadFiles(); // refresh the table
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
  } finally {
    uploadButton.disabled = false;
  }
}

async function verifyFile(fileId, badge, silent = false) {
  try {
    const response = await apiFetch(`/files/${fileId}/verify`);
    const data = await response.json();

    if (data.verified) {
      badge.textContent = '✅ Verified';
      badge.className = 'badge badge-verified';
    } else {
      badge.textContent = '❌ Modified';
      badge.className = 'badge badge-modified';
    }
    if (!silent) showMessage(dashboardMessage, data.message, !data.verified);
  } catch (error) {
    badge.textContent = '⚠️ Error';
    badge.className = 'badge badge-modified';
    if (!silent) showMessage(dashboardMessage, error.message, true);
  }
}

async function downloadFile(file) {
  try {
    const response = await apiFetch(`/files/${file._id}/download`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Download failed.');
    }

    // The download endpoint needs our JWT header, so we can't just
    // open a link — we fetch the file as a "blob" and save it.
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.originalName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
  }
}

async function deleteFile(file) {
  if (!window.confirm(`Delete "${file.originalName}"? This cannot be undone.`)) return;

  try {
    const response = await apiFetch(`/files/${file._id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Delete failed.');

    showMessage(dashboardMessage, `"${file.originalName}" was deleted.`);
    await loadFiles();
  } catch (error) {
    showMessage(dashboardMessage, error.message, true);
  }
}

// Run the dashboard logic only if we are on the dashboard page
if (document.getElementById('filesTableBody')) {
  initDashboard();
}