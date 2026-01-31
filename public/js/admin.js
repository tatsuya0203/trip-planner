import { Api } from './modules/services/api.js';
import { Auth } from './modules/features/auth.js';
import { AdminUI } from './modules/ui/admin_ui.js';

const auth = new Auth();
// ★ログにあったメールアドレスを追加済み
const ALLOWED_ADMINS = ["test@example.com", "tatsuyangkorn@outlook.jp2"];

let currentTab = 'dashboard';
let pendingSpots = [], allSpots = [], allReports = [];
let activeReportId = null;

document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        const user = auth.currentUser;
        if (!user || !ALLOWED_ADMINS.includes(user.email)) {
            alert("アクセス権限がありません"); window.location.href = "index.html"; return;
        }
        initAdmin();
    }, 1000);
    setupEventListeners();
});

async function initAdmin() { await loadDashboard(); switchTab('dashboard'); }

function setupEventListeners() {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.closest('button').dataset.tab));
    });
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => { if(confirm("ログアウト?")) { auth.logout(); window.location.href = "index.html"; }});
    document.getElementById('refresh-pending-btn')?.addEventListener('click', loadPendingSpots);
    
    // イベント委譲 (動的要素対応)
    document.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('approve-btn')) await handleApprove(target.dataset.id);
        if (target.classList.contains('reject-btn')) await handleReject(target.dataset.id);
        if (target.classList.contains('edit-spot-btn')) AdminUI.toggleEditModal(true, JSON.parse(target.dataset.json));
        if (target.classList.contains('ban-user-btn')) await handleBanUser(target.dataset.uid);
        
        // ★追加: 画像レポート関連
        if (target.id === 'run-image-check-btn') await runImageCheck();
        if (target.classList.contains('find-image-btn')) {
            const reportData = JSON.parse(target.dataset.json);
            openImageSearch(reportData);
        }
        if (target.classList.contains('dismiss-report-btn')) await dismissReport(target.dataset.id);
    });

    document.getElementById('close-admin-edit-btn')?.addEventListener('click', () => AdminUI.toggleEditModal(false));
    document.getElementById('admin-edit-form')?.addEventListener('submit', async (e) => { e.preventDefault(); await handleUpdateSpot(); });
    document.getElementById('delete-spot-btn')?.addEventListener('click', () => handleDeleteSpot(document.getElementById('edit-spot-id').value));

    // ★追加: 画像候補モーダル
    document.getElementById('image-candidate-cancel-btn')?.addEventListener('click', () => AdminUI.toggleImageModal(false));
    document.getElementById('image-candidate-confirm-btn')?.addEventListener('click', async (e) => {
        if(e.target.disabled) return;
        await resolveImageReport(activeReportId, e.target.dataset.url);
    });
}

async function switchTab(tabId) {
    currentTab = tabId;
    AdminUI.switchTab(tabId);
    if (tabId === 'dashboard') await loadDashboard();
    if (tabId === 'pending') await loadPendingSpots();
    if (tabId === 'spots') await loadAllSpots();
    if (tabId === 'reports') await loadReports(); // ★追加
}

// --- API Loaders ---
async function loadDashboard() { try { const s = await Api.get('/api/admin/stats'); AdminUI.updateStats(s || {}); } catch(e){} }
async function loadPendingSpots() { try { pendingSpots = await Api.get('/api/admin/spots/pending'); AdminUI.renderPendingList(pendingSpots); } catch(e){} }
async function loadAllSpots() { try { allSpots = await Api.get('/api/admin/spots/all'); AdminUI.renderSpotsTable(allSpots); } catch(e){} }
async function loadUsers() { try { const u = await Api.get('/api/admin/users'); AdminUI.renderUsersTable(u); } catch(e){} }
async function loadReports() { try { allReports = await Api.get('/api/admin/reports'); AdminUI.renderReportsList(allReports); } catch(e){} } // ★追加

// --- Actions ---
async function handleApprove(id) { if(confirm("承認しますか？")) { await Api.post(`/api/admin/spots/${id}/approve`); loadPendingSpots(); } }
async function handleReject(id) { if(confirm("却下しますか？")) { await Api.delete(`/api/admin/spots/${id}/reject`); loadPendingSpots(); } }

async function handleUpdateSpot() {
    const id = document.getElementById('edit-spot-id').value;
    if (!id || id === 'undefined') { alert("エラー: スポットIDが見つかりません。"); return; }

    const data = {
        name: document.getElementById('edit-spot-name').value,
        prefecture: document.getElementById('edit-spot-pref').value,
        area: document.getElementById('edit-spot-area').value,
        category: document.getElementById('edit-spot-category').value,
        image: document.getElementById('edit-spot-image').value,
        description: document.getElementById('edit-spot-desc').value,
    };
    try { await Api.put(`/api/admin/spots/${id}`, data); alert("更新しました"); AdminUI.toggleEditModal(false); loadAllSpots(); } 
    catch (e) { alert("更新失敗: " + e.message); }
}

async function handleDeleteSpot(id) { if(confirm("削除しますか？")) { await Api.delete(`/api/admin/spots/${id}`); AdminUI.toggleEditModal(false); loadAllSpots(); } }

// --- ★追加: 画像関連アクション ---
async function runImageCheck() {
    if(!confirm("全スポットの画像リンクをチェックします。数秒〜数分かかる場合があります。")) return;
    const btn = document.getElementById('run-image-check-btn');
    const originalText = btn.textContent;
    btn.textContent = 'チェック中...'; btn.disabled = true;
    try {
        const res = await Api.post('/api/admin/utils/check-images');
        alert(res.message);
        loadReports();
    } catch(e) { alert("チェック失敗: " + e.message); }
    finally { btn.textContent = originalText; btn.disabled = false; }
}

async function openImageSearch(report) {
    activeReportId = report.id;
    AdminUI.toggleImageModal(true);
    const list = document.getElementById('image-candidate-list');
    list.innerHTML = '<div class="col-span-3 text-center py-10"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div><p class="mt-2 text-gray-500">画像を検索中...</p></div>';
    
    const confirmBtn = document.getElementById('image-candidate-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
    
    try {
        // 検索クエリ: スポット名 + 都道府県
        const query = `${report.spotName} ${report.prefecture} 観光`;
        const candidates = await Api.get(`/api/admin/utils/search-images?query=${encodeURIComponent(query)}`);
        AdminUI.renderImageCandidates(candidates);
    } catch(e) {
        list.innerHTML = '<p class="text-red-500 col-span-3 text-center">検索エラーが発生しました。</p>';
    }
}

async function resolveImageReport(reportId, newImageUrl) {
    if(!newImageUrl) return;
    try {
        const res = await Api.post(`/api/admin/reports/${reportId}/resolve`, { newImageUrl });
        alert(res.message);
        AdminUI.toggleImageModal(false);
        loadReports();
    } catch(e) { alert("更新失敗: " + e.message); }
}

async function dismissReport(id) {
    if(confirm("このレポートを無視（削除）しますか？")) { await Api.delete(`/api/admin/reports/${id}`); loadReports(); }
}