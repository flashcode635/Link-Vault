/**
 * Brain Vault Client-Side Controller
 * Interfaces with Django 5.2 Asynchronous PyMongo API endpoints.
 */

// Global Application State
let appState = {
  token: localStorage.getItem('bv_token') || null,
  user: null,
  allContent: [],    // Master collection: maintains original actual counts
  content: [],       // Filtered slice: currently displayed in the view
  folders: [],
  tags: [],
  activeFolderId: null,
  activeType: null,
  activeTag: null,
  searchQuery: '',
  sortOption: 'recent',
  viewMode: 'grid',
  isShared: false,
  shareHash: null,
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthAndBootstrap();
  await refreshDashboard();
});

// Authentication Bootstrapping
async function checkAuthAndBootstrap() {
  if (appState.token) {
    try {
      const res = await fetch('/api/v1/auth/me', {
        headers: { 'Authorization': `Bearer ${appState.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        appState.user = data.data;
        updateNavAuthUI();
        return;
      }
    } catch (e) {
      console.warn('Auth check failed:', e);
    }
  }

  // Auto sign in as demo curator for seamless exploration
  try {
    const res = await fetch('/api/v1/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'notion_curator', password: 'demo123' })
    });
    if (res.ok) {
      const data = await res.json();
      appState.token = data.token;
      appState.user = data.user;
      localStorage.setItem('bv_token', data.token);
      localStorage.setItem('bv_user', JSON.stringify(data.user));
      updateNavAuthUI();
    }
  } catch (err) {
    console.error('Demo auth failed:', err);
  }
}

function updateNavAuthUI() {
  const container = document.getElementById('nav-auth-container');
  if (!container) return;

  if (appState.user) {
    container.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xs text-[#5a5855] font-medium hidden sm:inline">
          ${appState.user.username}
        </span>
        <button onclick="handleLogout()" class="px-2.5 py-1.5 text-xs text-[#787774] hover:text-[#18181b] hover:bg-[#f7f6f3] rounded-md transition-colors" title="Log out">
          Sign Out
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <a href="/login/" class="px-3 py-1.5 text-xs font-medium text-[#18181b] hover:bg-[#f7f6f3] border border-[#e5e5e3] rounded-md transition-all flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        <span>Sign In</span>
      </a>
    `;
  }
  if (window.lucide) window.lucide.createIcons();
}

function handleLogout() {
  localStorage.removeItem('bv_token');
  localStorage.removeItem('bv_user');
  appState.token = null;
  appState.user = null;
  window.location.reload();
}

// Data Fetching & State Refreshing
async function refreshDashboard() {
  await Promise.all([
    fetchFolders(),
    fetchTags(),
    fetchAllContent(),
    fetchShareStatus()
  ]);
  applyFilters();
  updateBadgeCounts();
  renderSidebarFolders();
  renderSidebarTags();
  renderContent();
  updateScopeLabel();
  updateSidebarActiveStyles();
}

async function fetchFolders() {
  try {
    const res = await fetch('/api/v1/folders', {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      appState.folders = data.data || [];
      populateFolderDropdown();
    }
  } catch (e) {
    console.error('Failed to fetch folders:', e);
  }
}

async function fetchTags() {
  try {
    const res = await fetch('/api/v1/tags', {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      appState.tags = data.data || [];
    }
  } catch (e) {
    console.error('Failed to fetch tags:', e);
  }
}

/**
 * Fetch ALL content items for the authenticated user without scope filtering.
 * This guarantees that counts across All Content, YouTube, Twitter / X, Articles,
 * and Documents remain permanent and accurate, fixing the issue where clicking
 * a specific type caused other counts to reset to 0.
 */
async function fetchAllContent() {
  try {
    const res = await fetch('/api/v1/content', {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      appState.allContent = data.data || [];
    }
  } catch (e) {
    console.error('Failed to fetch all content:', e);
  }
}

/**
 * Client-side filter: extracts the subset of content to display in the feed
 * based on activeType, activeFolderId, activeTag, and searchQuery, while
 * preserving the full appState.allContent counts.
 */
function applyFilters() {
  let list = [...appState.allContent];

  if (appState.activeFolderId) {
    list = list.filter(item => item.folder_id === appState.activeFolderId);
  }
  if (appState.activeType) {
    list = list.filter(item => item.type === appState.activeType);
  }
  if (appState.activeTag) {
    list = list.filter(item => Array.isArray(item.tags) && item.tags.includes(appState.activeTag));
  }
  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(item =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.link && item.link.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      (Array.isArray(item.tags) && item.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Sorting
  if (appState.sortOption === 'recent') {
    list.sort((a, b) => new Date(b.created_at || b._id_time || 0) - new Date(a.created_at || a._id_time || 0));
  } else if (appState.sortOption === 'oldest') {
    list.sort((a, b) => new Date(a.created_at || a._id_time || 0) - new Date(b.created_at || b._id_time || 0));
  } else if (appState.sortOption === 'title_asc') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (appState.sortOption === 'title_desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  }

  appState.content = list;
}

async function fetchShareStatus() {
  try {
    const res = await fetch('/api/v1/brain/share', {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      appState.isShared = data.data.shared;
      appState.shareHash = data.data.hash;
      updateShareModalUI();
    }
  } catch (e) {
    console.warn('Share status error:', e);
  }
}

/**
 * Update Sidebar Badge Counts
 * ALWAYS derived from appState.allContent so counts never drop to 0 when
 * filtering by a specific platform or folder.
 */
function updateBadgeCounts() {
  const allEl = document.getElementById('badge-count-all');
  if (allEl) allEl.innerText = appState.allContent.length;

  const types = ['youtube', 'twitter', 'article', 'document'];
  types.forEach(t => {
    const el = document.getElementById(`badge-count-${t}`);
    if (el) {
      const actualTotalCount = appState.allContent.filter(c => c.type === t).length;
      el.innerText = actualTotalCount;
    }
  });

  const countDisplay = document.getElementById('items-count-display');
  if (countDisplay) {
    countDisplay.innerText = `Showing ${appState.content.length} of ${appState.allContent.length} items`;
  }
}

function renderSidebarFolders() {
  const container = document.getElementById('sidebar-folders-list');
  if (!container) return;

  if (appState.folders.length === 0) {
    container.innerHTML = `
      <div class="px-2 py-1 text-[11px] text-[#9b9a97]">No folders created</div>
    `;
    return;
  }

  container.innerHTML = appState.folders.map(f => {
    const isActive = appState.activeFolderId === f._id;
    // Calculate folder items count from master allContent
    const folderCount = appState.allContent.filter(c => c.folder_id === f._id).length;
    return `
      <div class="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
        isActive ? 'bg-[#efeeea] text-[#18181b]' : 'text-[#787774] hover:text-[#18181b] hover:bg-[#f0f0ef]'
      }" onclick="filterByFolder('${f._id}')">
        <div class="flex items-center gap-2 truncate">
          <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${f.color || '#3b82f6'};"></span>
          <span class="truncate">${f.name}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-mono text-[#9b9a97]">${folderCount}</span>
          <button onclick="event.stopPropagation(); handleDeleteFolder('${f._id}')" class="opacity-0 group-hover:opacity-100 hover:text-red-600 p-0.5 rounded transition-opacity" title="Delete Folder">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSidebarTags() {
  const container = document.getElementById('sidebar-tags-list');
  if (!container) return;

  if (appState.tags.length === 0) {
    container.innerHTML = `<span class="text-[11px] text-[#9b9a97]">No tags</span>`;
    return;
  }

  container.innerHTML = appState.tags.map(tag => {
    const isActive = appState.activeTag === tag;
    return `
      <button onclick="filterByTag('${tag}')" class="px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
        isActive
          ? 'bg-[#18181b] text-white font-medium shadow-2xs'
          : 'bg-[#f0f0ef] text-[#5a5855] hover:bg-[#e5e5e3] hover:text-[#18181b]'
      }">
        #${tag}
      </button>
    `;
  }).join('');
}

function renderContent() {
  const container = document.getElementById('content-container');
  const emptyState = document.getElementById('empty-state');
  if (!container || !emptyState) return;

  if (appState.content.length === 0) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  emptyState.classList.add('hidden');

  container.className = appState.viewMode === 'grid'
    ? 'grid grid-cols-1 md:grid-cols-2 gap-4.5'
    : 'space-y-3';

  container.innerHTML = appState.content.map(item => {
    const folder = appState.folders.find(f => f._id === item.folder_id);

    // Platform badges with pristine SVGs matching reference image
    let typeBadgeHtml = '';
    if (item.type === 'youtube') {
      typeBadgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-red-50 text-red-700 border border-red-200">
          <svg class="w-3 h-3 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2.18"></rect>
            <polygon points="10 8 16 12 10 16 10 8"></polygon>
          </svg>
          <span>YOUTUBE</span>
        </span>
      `;
    } else if (item.type === 'twitter') {
      typeBadgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-black text-white">
          <svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          <span>TWITTER / X</span>
        </span>
      `;
    } else if (item.type === 'article') {
      typeBadgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
          <svg class="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>ARTICLE</span>
        </span>
      `;
    } else {
      typeBadgeHtml = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-amber-50 text-amber-700 border border-amber-200">
          <svg class="w-3 h-3 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
            <path d="M6 6h10"></path>
            <path d="M6 10h10"></path>
          </svg>
          <span>DOCUMENT</span>
        </span>
      `;
    }

    // YouTube embed helper
    let ytEmbedHtml = '';
    if (item.type === 'youtube' && item.link) {
      const ytMatch = item.link.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      if (ytMatch && ytMatch[1]) {
        ytEmbedHtml = `
          <div class="mt-3 rounded-lg overflow-hidden aspect-video bg-black/5 relative group border border-[#ecece9]">
            <iframe 
              src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}" 
              title="${item.title}" 
              class="w-full h-full border-0"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowfullscreen>
            </iframe>
          </div>
        `;
      }
    }

    // Domain display
    let domainStr = '';
    if (item.link) {
      try {
        const u = new URL(item.link);
        domainStr = u.hostname.replace('www.', '');
      } catch (err) {
        domainStr = 'external link';
      }
    }

    return `
      <div class="content-card bg-white border border-[#ecece9] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow">
        <div>
          <!-- Header Bar: Type, Folder & Actions -->
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <div class="flex items-center gap-2 truncate">
              ${typeBadgeHtml}

              ${folder ? `
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f5f5f4] text-[#5a5855] truncate max-w-[130px]">
                  <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${folder.color || '#3b82f6'};"></span>
                  <span class="truncate">${folder.name}</span>
                </span>
              ` : ''}
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1 shrink-0">
              ${item.link ? `
                <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="p-1 text-[#9b9a97] hover:text-[#18181b] rounded transition-colors" title="Open Link">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
              ` : ''}
              <button onclick="openEditModal('${item._id}')" class="p-1 text-[#9b9a97] hover:text-[#18181b] rounded transition-colors" title="Edit Item">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button onclick="handleDeleteContent('${item._id}')" class="p-1 text-[#9b9a97] hover:text-red-600 rounded transition-colors" title="Delete Item">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Title in Serif font matching reference image -->
          <h3 class="text-[15px] font-serif font-semibold text-[#18181b] leading-snug line-clamp-2 mb-1">
            ${item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="hover:underline">${item.title}</a>` : item.title}
          </h3>

          <!-- Domain / Source Indicator -->
          ${domainStr ? `
            <div class="text-[11px] text-[#9b9a97] mb-2 font-mono flex items-center gap-1">
              <span>${domainStr}</span>
            </div>
          ` : ''}

          <!-- Quote / Notes callout block -->
          ${item.notes ? `
            <blockquote class="text-xs text-[#52525b] leading-relaxed line-clamp-4 my-2.5 bg-[#fbfbfa] p-3 rounded-lg border-l-2 border-[#18181b] font-normal">
              ${item.notes}
            </blockquote>
          ` : ''}

          <!-- Embed -->
          ${ytEmbedHtml}
        </div>

        <!-- Tags at bottom -->
        <div class="pt-3 mt-2 border-t border-[#f5f5f4] flex flex-wrap items-center gap-1.5">
          ${(item.tags || []).map(t => `
            <button onclick="filterByTag('${t}')" class="px-2 py-0.5 rounded text-[10px] font-mono bg-[#f0f0ef] text-[#5a5855] hover:bg-[#e5e5e3] hover:text-[#18181b] transition-colors">
              #${t}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// Scope & Filter Switching
function filterByType(type) {
  appState.activeType = type;
  appState.activeFolderId = null;
  appState.activeTag = null;
  if (window.toggleMobileSidebar) window.toggleMobileSidebar(false);
  applyFilters();
  updateBadgeCounts();
  renderContent();
  updateScopeLabel();
  updateSidebarActiveStyles();
}

function filterByFolder(folderId) {
  appState.activeFolderId = folderId;
  appState.activeType = null;
  appState.activeTag = null;
  if (window.toggleMobileSidebar) window.toggleMobileSidebar(false);
  applyFilters();
  updateBadgeCounts();
  renderContent();
  updateScopeLabel();
  updateSidebarActiveStyles();
}

function filterByTag(tag) {
  appState.activeTag = tag;
  if (window.toggleMobileSidebar) window.toggleMobileSidebar(false);
  applyFilters();
  updateBadgeCounts();
  renderContent();
  updateScopeLabel();
  updateSidebarActiveStyles();
}

function resetFilters() {
  appState.activeFolderId = null;
  appState.activeType = null;
  appState.activeTag = null;
  appState.searchQuery = '';
  const searchInput = document.getElementById('dashboard-search-input');
  if (searchInput) searchInput.value = '';
  document.getElementById('search-clear-btn')?.classList.add('hidden');
  const mainSearch = document.getElementById('main-nav-search');
  if (mainSearch) mainSearch.value = '';
  if (window.toggleMobileSidebar) window.toggleMobileSidebar(false);
  applyFilters();
  updateBadgeCounts();
  renderContent();
  updateScopeLabel();
  updateSidebarActiveStyles();
}

function handleSortChange(val) {
  appState.sortOption = val;
  applyFilters();
  renderContent();
  updateBadgeCounts();
}

function updateSidebarActiveStyles() {
  const types = [null, 'youtube', 'twitter', 'article', 'document'];
  types.forEach(t => {
    const btn = document.getElementById(t ? `filter-${t}-btn` : 'filter-all-btn');
    if (!btn) return;
    if (appState.activeType === t && !appState.activeFolderId && !appState.activeTag) {
      btn.className = "sidebar-item w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#18181b] bg-[#efeeea]";
    } else {
      btn.className = "sidebar-item w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#787774] hover:text-[#18181b] hover:bg-[#f0f0ef] transition-colors";
    }
  });

  // Mobile bottom nav active states
  const mobileAllBtn = document.getElementById('mobile-nav-all');
  if (mobileAllBtn) {
    if (!appState.activeType && !appState.activeFolderId && !appState.activeTag) {
      mobileAllBtn.className = "flex flex-col items-center justify-center py-1.5 px-3 text-[#18181b] rounded-lg transition-colors";
    } else {
      mobileAllBtn.className = "flex flex-col items-center justify-center py-1.5 px-3 text-[#787774] hover:text-[#18181b] rounded-lg transition-colors";
    }
  }
}

function updateScopeLabel() {
  const scopeCat = document.getElementById('scope-category-name');
  const scopeText = document.getElementById('active-scope-text');
  const dismissBtn = document.getElementById('active-scope-dismiss');
  if (!scopeCat || !scopeText) return;

  if (appState.activeFolderId) {
    const f = appState.folders.find(x => x._id === appState.activeFolderId);
    scopeCat.innerText = 'Folder';
    scopeText.innerText = f ? f.name : 'Folder';
    dismissBtn?.classList.remove('hidden');
  } else if (appState.activeType) {
    scopeCat.innerText = 'Platform';
    const map = { youtube: 'YouTube', twitter: 'Twitter / X', article: 'Articles', document: 'Documents' };
    scopeText.innerText = map[appState.activeType] || appState.activeType.toUpperCase();
    dismissBtn?.classList.remove('hidden');
  } else if (appState.activeTag) {
    scopeCat.innerText = 'Tag';
    scopeText.innerText = '#' + appState.activeTag;
    dismissBtn?.classList.remove('hidden');
  } else if (appState.searchQuery) {
    scopeCat.innerText = 'Search';
    scopeText.innerText = `"${appState.searchQuery}"`;
    dismissBtn?.classList.remove('hidden');
  } else {
    scopeCat.innerText = 'Workspace';
    scopeText.innerText = 'All Content';
    dismissBtn?.classList.add('hidden');
  }
}

// Search with Debounce
let searchTimeout = null;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  const clearBtn = document.getElementById('search-clear-btn');
  if (val.trim()) {
    clearBtn?.classList.remove('hidden');
  } else {
    clearBtn?.classList.add('hidden');
  }

  searchTimeout = setTimeout(() => {
    appState.searchQuery = val.trim();
    applyFilters();
    renderContent();
    updateScopeLabel();
    updateBadgeCounts();
  }, 200);
}

function clearSearch() {
  const el = document.getElementById('dashboard-search-input');
  if (el) el.value = '';
  const mainSearch = document.getElementById('main-nav-search');
  if (mainSearch) mainSearch.value = '';
  document.getElementById('search-clear-btn')?.classList.add('hidden');
  appState.searchQuery = '';
  applyFilters();
  renderContent();
  updateScopeLabel();
  updateBadgeCounts();
}

function setViewMode(mode) {
  appState.viewMode = mode;
  const gridBtn = document.getElementById('view-grid-btn');
  const listBtn = document.getElementById('view-list-btn');

  if (mode === 'grid') {
    gridBtn?.classList.add('bg-white', 'shadow-xs', 'text-[#18181b]');
    gridBtn?.classList.remove('text-[#9b9a97]');
    listBtn?.classList.remove('bg-white', 'shadow-xs', 'text-[#18181b]');
    listBtn?.classList.add('text-[#9b9a97]');
  } else {
    listBtn?.classList.add('bg-white', 'shadow-xs', 'text-[#18181b]');
    listBtn?.classList.remove('text-[#9b9a97]');
    gridBtn?.classList.remove('bg-white', 'shadow-xs', 'text-[#18181b]');
    gridBtn?.classList.add('text-[#9b9a97]');
  }
  renderContent();
}

// Instant Quick Capture (Bottom Bar from Reference Image)
async function handleQuickCapture(e) {
  e.preventDefault();
  const input = document.getElementById('quick-capture-input');
  if (!input) return;
  const rawText = input.value.trim();
  if (!rawText) return;

  let type = 'document';
  let link = '';
  let title = rawText;
  let notes = '';

  if (rawText.startsWith('http://') || rawText.startsWith('https://')) {
    link = rawText;
    if (rawText.includes('youtube.com') || rawText.includes('youtu.be')) {
      type = 'youtube';
      title = 'YouTube Video: ' + (rawText.split('v=')[1]?.slice(0, 11) || 'Saved Video');
    } else if (rawText.includes('twitter.com') || rawText.includes('x.com')) {
      type = 'twitter';
      title = 'Twitter / X Post';
    } else {
      type = 'article';
      try {
        const u = new URL(rawText);
        title = `Web Article from ${u.hostname.replace('www.', '')}`;
      } catch (err) {
        title = 'Web Article';
      }
    }
  } else {
    // Note or thought snippet
    type = 'document';
    title = rawText.length > 60 ? rawText.substring(0, 57) + '...' : rawText;
    notes = rawText;
  }

  try {
    const res = await fetch('/api/v1/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({
        title,
        link,
        type,
        folder_id: appState.activeFolderId || null,
        notes,
        tags: [type]
      })
    });

    if (res.ok) {
      input.value = '';
      window.showToast('Captured directly into Brain Vault', 'success');
      await refreshDashboard();
    } else {
      const data = await res.json();
      window.showToast(data.error || 'Failed to capture item', 'error');
    }
  } catch (err) {
    console.error('Quick capture error:', err);
    window.showToast('Failed to capture link', 'error');
  }
}

// Folder dropdown helper
function populateFolderDropdown(selectedFolderId = '') {
  const sel = document.getElementById('content-folder');
  if (!sel) return;

  sel.innerHTML = `<option value="">No Folder (Root)</option>` +
    appState.folders.map(f => `
      <option value="${f._id}" ${f._id === selectedFolderId ? 'selected' : ''}>${f.name}</option>
    `).join('');
}

// Content Modal Handlers
function openAddModal() {
  document.getElementById('modal-content-title').innerText = 'Add Knowledge Item';
  document.getElementById('content-edit-id').value = '';
  document.getElementById('content-title').value = '';
  document.getElementById('content-link').value = '';
  document.getElementById('content-type').value = appState.activeType || 'article';
  document.getElementById('content-tags').value = '';
  document.getElementById('content-notes').value = '';
  populateFolderDropdown(appState.activeFolderId || '');

  document.getElementById('modal-add-content')?.classList.remove('hidden');
}

function openEditModal(itemId) {
  const item = appState.allContent.find(c => c._id === itemId) || appState.content.find(c => c._id === itemId);
  if (!item) return;

  document.getElementById('modal-content-title').innerText = 'Edit Knowledge Item';
  document.getElementById('content-edit-id').value = item._id;
  document.getElementById('content-title').value = item.title;
  document.getElementById('content-link').value = item.link || '';
  document.getElementById('content-type').value = item.type;
  document.getElementById('content-tags').value = (item.tags || []).join(', ');
  document.getElementById('content-notes').value = item.notes || '';
  populateFolderDropdown(item.folder_id || '');

  document.getElementById('modal-add-content')?.classList.remove('hidden');
}

function closeAddModal() {
  document.getElementById('modal-add-content')?.classList.add('hidden');
}

async function handleSaveContent(e) {
  e.preventDefault();
  const editId = document.getElementById('content-edit-id').value;
  const title = document.getElementById('content-title').value.trim();
  const link = document.getElementById('content-link').value.trim();
  const type = document.getElementById('content-type').value;
  const folder_id = document.getElementById('content-folder').value || null;
  const tagsStr = document.getElementById('content-tags').value;
  const notes = document.getElementById('content-notes').value.trim();

  const payload = {
    title,
    link,
    type,
    folder_id,
    notes,
    tags: tagsStr.split(',').map(s => s.trim()).filter(Boolean)
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/v1/content/${editId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appState.token}`
        },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/v1/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appState.token}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save item');
    }

    closeAddModal();
    window.showToast(editId ? 'Item updated in Brain Vault' : 'Item saved asynchronously to Brain Vault', 'success');
    await refreshDashboard();
  } catch (err) {
    window.showToast(err.message, 'error');
  }
}

async function handleDeleteContent(itemId) {
  if (!confirm('Are you sure you want to delete this item from Brain Vault?')) return;
  try {
    const res = await fetch(`/api/v1/content/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      window.showToast('Item deleted from Brain Vault', 'info');
      await refreshDashboard();
    }
  } catch (err) {
    console.error('Delete error:', err);
  }
}

// Folder Modal Handlers
function openNewFolderModal() {
  document.getElementById('new-folder-name').value = '';
  document.getElementById('modal-new-folder')?.classList.remove('hidden');
}

function closeNewFolderModal() {
  document.getElementById('modal-new-folder')?.classList.add('hidden');
}

async function handleCreateFolder(e) {
  e.preventDefault();
  const name = document.getElementById('new-folder-name').value.trim();
  const color = document.querySelector('input[name="folder-color"]:checked')?.value || '#3b82f6';

  try {
    const res = await fetch('/api/v1/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({ name, color })
    });
    if (res.ok) {
      closeNewFolderModal();
      window.showToast(`Folder '${name}' created`, 'success');
      await refreshDashboard();
    }
  } catch (err) {
    window.showToast('Failed to create folder', 'error');
  }
}

async function handleDeleteFolder(folderId) {
  if (!confirm('Delete this folder? (Items will remain safe in root)')) return;
  try {
    const res = await fetch(`/api/v1/folders/${folderId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (res.ok) {
      if (appState.activeFolderId === folderId) appState.activeFolderId = null;
      window.showToast('Folder removed', 'info');
      await refreshDashboard();
    }
  } catch (err) {
    console.error('Failed to delete folder:', err);
  }
}

// Share Modal Handlers
function openShareModal() {
  updateShareModalUI();
  document.getElementById('modal-share')?.classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('modal-share')?.classList.add('hidden');
}

function updateShareModalUI() {
  const toggle = document.getElementById('toggle-public-share');
  const group = document.getElementById('share-link-group');
  const input = document.getElementById('share-link-input');
  const preview = document.getElementById('share-preview-link');

  if (toggle) toggle.checked = appState.isShared;

  if (appState.isShared && appState.shareHash) {
    group?.classList.remove('hidden');
    const fullUrl = `${window.location.origin}/share/${appState.shareHash}/`;
    if (input) input.value = fullUrl;
    if (preview) preview.href = `/share/${appState.shareHash}/`;
  } else {
    group?.classList.add('hidden');
  }
}

async function handleToggleShare(enabled) {
  try {
    const res = await fetch('/api/v1/brain/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appState.token}`
      },
      body: JSON.stringify({ share: enabled })
    });
    if (res.ok) {
      const data = await res.json();
      appState.isShared = data.data.shared;
      appState.shareHash = data.data.hash;
      updateShareModalUI();
      window.showToast(enabled ? 'Brain Vault is now publicly accessible' : 'Public sharing disabled', 'info');
    }
  } catch (err) {
    window.showToast('Failed to update share setting', 'error');
  }
}

function copyShareLink() {
  const input = document.getElementById('share-link-input');
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  window.showToast('Share link copied to clipboard', 'success');
}

// Global window bindings for interactive elements
Object.assign(window, {
  openAddModal,
  openEditModal,
  closeAddModal,
  openNewFolderModal,
  closeNewFolderModal,
  openShareModal,
  closeShareModal,
  copyShareLink,
  handleToggleShare,
  filterByType,
  filterByFolder,
  filterByTag,
  clearSearch,
  handleSearch,
  resetFilters,
  setViewMode,
  handleDeleteContent,
  handleDeleteFolder,
  handleSaveContent,
  handleCreateFolder,
  handleQuickCapture,
  handleSortChange,
  handleLogout,
  refreshDashboard
});
