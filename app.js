import { API_BASE, firebaseConfig } from './config.js';
import { TRANSLATIONS, ALLOWED_URL_PATTERNS } from './content.js';

// =============================================
// STATE & INIT
// =============================================
let currentUser = null;
let currentVideoData = null;
let isPreviewPlaying = false;
let authMode = 'login';
let firebaseAuth = null;
let currentLang = localStorage.getItem('vidgrab_lang') || 'en';

window.addEventListener('load', function () {
  const loader = document.getElementById('pageLoader');
  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 500);
});

try {
  const firebaseApp = firebase.initializeApp(firebaseConfig);
  firebaseAuth = firebase.auth();
} catch (e) {
  console.warn('Firebase not configured:', e.message);
}

// =============================================
// TRANSLATIONS
// =============================================
function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
    || TRANSLATIONS['en'][key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][k])
      el.textContent = TRANSLATIONS[currentLang][k];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][k])
      el.placeholder = TRANSLATIONS[currentLang][k];
  });
  document.getElementById('langSwitcher').value = currentLang;
}

window.changeLanguage = function(lang) {
  currentLang = lang;
  localStorage.setItem('vidgrab_lang', lang);
  applyTranslations();
}

// =============================================
// CORE LOGIC
// =============================================
function validateURL(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(trimmed));
}

window.showPage = function(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(page + 'Page').classList.remove('hidden');
  if (page === 'history') loadHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.analyzeVideo = async function() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    showToast('Please enter a video URL', 'error');
    return;
  }
  if (!validateURL(url)) {
    showToast(t('error_invalid_url'), 'error');
    return;
  }

  const loadingState = document.getElementById('loadingState');
  const resultSection = document.getElementById('resultSection');
  const analyzeBtn = document.getElementById('analyzeBtn');

  loadingState.classList.remove('hidden');
  resultSection.classList.add('hidden');
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = `<div class="loading-spinner"></div>`;

  try {
    const response = await fetch(`${API_BASE}/api/analyze?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    const platform = detectPlatform(url);
    const aspectRatio = detectAspectRatio(url);

    currentVideoData = {
      dbId: data.dbId,
      title: data.title,
      thumbnail: data.thumbnail,
      url,
      platform,
      aspectRatio,
      formats: data.formats
    };

    document.getElementById('videoThumbnail').src = data.thumbnail || '';
    document.getElementById('videoTitle').textContent = data.title;
    document.getElementById('videoAuthor').textContent = '';

    const badge = document.getElementById('platformBadge');
    const colorClass = platform.color === 'red' ? 'text-red-400'
                     : platform.color === 'blue' ? 'text-blue-400'
                     : platform.color === 'pink' ? 'text-pink-400'
                     : 'text-purple-400';
    badge.innerHTML = `<span class="${colorClass}">${platform.icon}</span> ${platform.name}`;
    
    const preview = document.getElementById('videoPreview');
    if (aspectRatio === 'short') preview.classList.add('short');
    else preview.classList.remove('short');

    saveToHistory(currentVideoData);
    loadingState.classList.add('hidden');
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.message || t('error_analyze'), 'error');
    loadingState.classList.add('hidden');
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = `<span>${t('btn_analyze')}</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>`;
  }
}

window.startDownload = function(formatId) {
  hideModal('qualityModal');
  if (!currentVideoData || !currentVideoData.dbId) {
    showToast(t('error_download'), 'error');
    return;
  }
  const downloadUrl = `${API_BASE}/api/download?dbId=${currentVideoData.dbId}&formatId=${encodeURIComponent(formatId)}`;
  window.open(downloadUrl, '_blank');
  showToast(t('toast_download_started'));
}

window.downloadAudio = function() {
  if (!currentVideoData || !currentVideoData.dbId) {
    showToast(t('error_download'), 'error');
    return;
  }
  const audioFormat = currentVideoData.formats.find(f => f.resolution === 'Audio Only' || f.resolution?.toLowerCase().includes('audio'));
  if (audioFormat) startDownload(audioFormat.id);
  else if (currentVideoData.formats.length > 0) startDownload(currentVideoData.formats[currentVideoData.formats.length - 1].id);
  else showToast(t('error_download'), 'error');
}

// =============================================
// UI HELPERS
// =============================================
window.showModal = function(type) {
  const id = type === 'privacy' ? 'privacyModal' : type === 'terms' ? 'termsModal' : type === 'quality' ? 'qualityModal' : 'authModal';
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

window.hideModal = function(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

window.showQualityModal = function() {
  renderQualityOptions();
  showModal('quality');
}

window.showAuthModal = function() {
  toggleAuthTab('login');
  showModal('auth');
}

window.clearUrl = function() {
  const input = document.getElementById('urlInput');
  input.value = '';
  document.getElementById('clearUrlBtn').classList.add('hidden');
  input.focus();
}

window.togglePreview = function() {
  isPreviewPlaying = !isPreviewPlaying;
  document.getElementById('playIcon').innerHTML = isPreviewPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  const iconPath = type === 'success' ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12';
  toast.innerHTML = `<div class="w-6 h-6 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} rounded-full flex items-center justify-center flex-shrink-0"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/></svg></div><span class="text-sm">${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3500);
}

function renderQualityOptions() {
  const container = document.getElementById('qualityOptions');
  if (!currentVideoData || !currentVideoData.formats) return;
  const videoFormats = currentVideoData.formats.filter(f => f.resolution && f.resolution !== 'Audio Only');
  container.innerHTML = videoFormats.map(fmt => `<button onclick="startDownload('${fmt.id}')" class="res-btn w-full flex items-center justify-between"><div class="text-left"><div class="quality">${fmt.resolution}</div><div class="size">${fmt.ext.toUpperCase()}</div></div><div class="text-right"><div class="text-blue-400 font-medium">${fmt.size}</div><div class="size text-gray-500">Download</div></div></button>`).join('');
}

// =============================================
// AUTH
// =============================================
window.toggleAuthTab = function(mode) {
  authMode = mode;
  const nameField = document.getElementById('nameField');
  const submitBtn = document.getElementById('authSubmitBtn');
  const authTitle = document.getElementById('authTitle');
  if (mode === 'login') {
    nameField.classList.add('hidden');
    submitBtn.textContent = t('auth_login_btn');
    authTitle.textContent = t('auth_title_login');
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabSignup').classList.remove('active');
  } else {
    nameField.classList.remove('hidden');
    submitBtn.textContent = t('auth_signup_btn');
    authTitle.textContent = t('auth_title_signup');
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('tabSignup').classList.add('active');
  }
}

window.handleAuth = async function(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value || email.split('@')[0];
  if (firebaseAuth) {
    try {
      if (authMode === 'signup') {
        let uc = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        await uc.user.updateProfile({ displayName: name });
      } else await firebaseAuth.signInWithEmailAndPassword(email, password);
      hideModal('authModal');
      showToast(authMode === 'signup' ? t('toast_signup_success') : t('toast_login_success'));
    } catch (err) { showToast(err.message, 'error'); }
  } else {
    currentUser = { name, email, uid: 'demo_' + Date.now() };
    localStorage.setItem('vidgrab_user', JSON.stringify(currentUser));
    updateUIForAuth();
    hideModal('authModal');
    showToast(authMode === 'signup' ? t('toast_signup_success') : t('toast_login_success'));
  }
}

window.logout = async function() {
  if (firebaseAuth) await firebaseAuth.signOut();
  currentUser = null;
  localStorage.removeItem('vidgrab_user');
  updateUIForAuth();
  showToast(t('toast_logout'));
  showPage('home');
}

function updateUIForAuth() {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  if (currentUser) {
    authButtons.classList.add('hidden');
    userMenu.classList.remove('hidden');
    const dn = currentUser.displayName || currentUser.name || currentUser.email;
    document.getElementById('userName').textContent = dn;
    document.getElementById('userAvatar').textContent = dn.charAt(0).toUpperCase();
  } else {
    authButtons.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

window.toggleUserDropdown = () => document.getElementById('userDropdown').classList.toggle('hidden');

// =============================================
// UTILS
// =============================================
function detectPlatform(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return { name: 'YouTube', color: 'red', icon: '▶' };
  if (url.includes('facebook.com') || url.includes('fb.watch')) return { name: 'Facebook', color: 'blue', icon: 'f' };
  if (url.includes('instagram.com')) return { name: 'Instagram', color: 'pink', icon: '📷' };
  if (url.includes('tiktok.com')) return { name: 'TikTok', color: 'purple', icon: '♪' };
  if (url.includes('pinterest.com') || url.includes('pin.it')) return { name: 'Pinterest', color: 'red', icon: 'P' };
  return { name: 'Video', color: 'gray', icon: '🔗' };
}

function detectAspectRatio(url) {
  if (url.includes('/shorts/') || url.includes('/reel/') || url.includes('/reels/') || url.includes('tiktok.com')) return 'short';
  return 'normal';
}

function saveToHistory(videoData) {
  let h = JSON.parse(localStorage.getItem('vidgrab_history') || '[]');
  h.unshift({ id: Date.now(), title: videoData.title, thumbnail: videoData.thumbnail, platform: videoData.platform.name, date: new Date().toISOString(), url: videoData.url, dbId: videoData.dbId });
  localStorage.setItem('vidgrab_history', JSON.stringify(h.slice(0, 50)));
}

function loadHistory() {
  const h = JSON.parse(localStorage.getItem('vidgrab_history') || '[]');
  const list = document.getElementById('historyList');
  const empty = document.getElementById('emptyHistory');
  if (h.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.innerHTML = h.map(item => `
    <div class="history-item rounded-xl p-4 flex items-center gap-4 animate-fade-in">
      <div class="w-20 h-14 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0"><img src="${item.thumbnail}" class="w-full h-full object-cover"></div>
      <div class="flex-1 min-w-0"><h4 class="font-medium text-sm truncate">${item.title}</h4><p class="text-xs text-gray-500 mt-1">${item.platform} • ${new Date(item.date).toLocaleDateString()}</p></div>
      <button onclick="deleteHistoryItem(${item.id})" class="w-8 h-8 rounded-full hover:bg-red-500/20 text-gray-500 hover:text-red-400 flex items-center justify-center transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
    </div>`).join('');
}

window.deleteHistoryItem = (id) => {
  let h = JSON.parse(localStorage.getItem('vidgrab_history') || '[]').filter(i => i.id !== id);
  localStorage.setItem('vidgrab_history', JSON.stringify(h));
  loadHistory(); showToast(t('toast_deleted'));
}

window.clearAllHistory = () => {
  if (confirm('Are you sure?')) { localStorage.setItem('vidgrab_history', '[]'); loadHistory(); showToast(t('toast_cleared')); }
}

window.setFormat = (f, b) => {
  document.querySelectorAll('#settingsPage .tab-btn').forEach(btn => btn.classList.remove('active'));
  b.classList.add('active');
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  if (firebaseAuth) {
    firebaseAuth.onAuthStateChanged(user => { currentUser = user; updateUIForAuth(); });
  } else {
    const savedUser = localStorage.getItem('vidgrab_user');
    if (savedUser) { currentUser = JSON.parse(savedUser); updateUIForAuth(); }
  }
  applyTranslations();
  const ui = document.getElementById('urlInput');
  ui.addEventListener('input', (e) => document.getElementById('clearUrlBtn').classList.toggle('hidden', e.target.value.length === 0));
  ui.addEventListener('keypress', (e) => { if (e.key === 'Enter') analyzeVideo(); });
});
