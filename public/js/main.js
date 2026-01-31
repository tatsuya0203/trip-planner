// public/js/main.js
import { Api } from './modules/services/api.js';
import { UI } from './modules/ui/ui.js';
import { PlanManager } from './modules/features/plan_manager.js';
import { Auth } from './modules/features/auth.js';
import { SettingsManager } from './modules/features/settings.js';
import * as Handlers from './modules/ui/handlers.js';
import { calculateTravelTimes } from './modules/services/utils.js';

// 状態管理
export const auth = new Auth();
export const planManager = new PlanManager(); 
export let settingsManager = null;
export let allSpotsData = [], currentTravelModes = {}; 
export let filterState = { prefecture: 'all', category: 'all', search: '' };
export let currentSettings = { date: '' }; 

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Trip Planner Initializing...");
    auth.init(async (user) => {
        if (user) {
            UI.showAppScreen(user);
            updateHeaderProfile(user);
            await initAppData();
            settingsManager = new SettingsManager(planManager, auth, async () => { await refreshPlanDisplay(); });
            if (settingsManager && allSpotsData.length > 0) settingsManager.setAllSpots(allSpotsData);
        } else {
            UI.toggleAuthModal(true);
        }
    });
    setupEventListeners();
    Handlers.setupDragAndDrop(planManager, auth, refreshPlanDisplay);
    Handlers.setupProfileFeature(auth, updateHeaderProfile);
});

async function initAppData() {
    try {
        const prefectures = await Api.get('/api/prefectures');
        const filter = document.getElementById('prefecture-filter');
        if (filter) {
            filter.innerHTML = '<option value="all">全国</option>';
            prefectures.forEach(p => { filter.innerHTML += `<option value="${p.name}">${p.name}</option>`; });
        }
        allSpotsData = [];
        await Promise.all(prefectures.map(async (pref) => {
            const data = await Api.get(`/api/data/${pref.id}`);
            if (data?.spots) {
                data.spots.forEach(s => { s.prefecture = data.name; });
                allSpotsData.push(...data.spots);
            }
        }));
        await refreshPlanDisplay(); applyFilters();
    } catch (e) { console.error("Data Initialization Failed:", e); }
}

export async function refreshPlanDisplay() {
    if (!auth.currentUser) return;
    const plans = await planManager.load(auth.currentUser.uid);
    try { 
        const res = await Api.get(`/api/user/plan-settings/${auth.currentUser.uid}?slot=${planManager.currentSlot}`);
        if(res.success) currentSettings = res.settings;
    } catch (err) {}
    const times = calculateTravelTimes(plans, allSpotsData, currentTravelModes);
    
    let weatherData = null;
    if (currentSettings.date && plans.length > 0) {
        const spot = allSpotsData.find(s => s.name === plans[0].spotName);
        const lat = spot?.lat || 35.689, lon = spot?.lng || 139.691;
        try { const wRes = await Api.get(`/api/weather?lat=${lat}&lon=${lon}&date=${currentSettings.date}`); if (wRes.success) weatherData = wRes; } catch { weatherData = false; }
    }
    UI.renderUserPlan(plans, allSpotsData, times, currentSettings, weatherData);
}

export function applyFilters() {
    let res = allSpotsData.filter(s => (filterState.prefecture === 'all' || s.prefecture === filterState.prefecture) && (filterState.category === 'all' || s.category === filterState.category) && (!filterState.search || s.name.toLowerCase().includes(filterState.search.toLowerCase())));
    UI.renderSpots(res, planManager.getPlans());
}

function updateHeaderProfile(user) {
    const icon = document.getElementById('header-user-icon'), name = document.getElementById('user-display');
    if(user.photoURL && icon) icon.src = user.photoURL;
    if(name) name.textContent = user.displayName || "ユーザー";
}

function setupEventListeners() {
    document.getElementById('category-filters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn) { filterState.category = btn.dataset.filter; UI.updateFilterButtons(filterState.category); applyFilters(); }
    });
    document.getElementById('search-input')?.addEventListener('input', (e) => { filterState.search = e.target.value; applyFilters(); });
    document.getElementById('prefecture-filter')?.addEventListener('change', (e) => { filterState.prefecture = e.target.value; applyFilters(); });

    document.addEventListener('click', async (e) => {
        // アイコン枠
        const profileTrigger = e.target.closest('#user-profile-trigger');
        if (profileTrigger) { Handlers.openProfileModal(auth); return; }

        const btn = e.target.closest('button') || e.target.closest('#auth-switch-link');
        if (btn) {
            console.log("Button clicked:", btn.id || btn.className);
            
            // --- ★修正: 全ての「閉じる」系ボタンの処理 ---
            if (btn.id === 'modal-close') { 
                document.getElementById('modal')?.classList.add('hidden'); 
                return; 
            }
            if (btn.id === 'close-profile-modal') { 
                document.getElementById('profile-modal-overlay')?.classList.add('hidden'); 
                return; 
            }
            if (btn.id === 'close-plan-sidebar') { 
                Handlers.closePlanSidebar(); 
                return; 
            }
            if (btn.id === 'close-suggest-modal') { 
                UI.toggleSuggestModal(false); 
                return; 
            }

            // メイン機能
            if (btn.id === 'plan-toggle-btn') { Handlers.togglePlanSidebar(btn); return; }
            if (btn.classList.contains('add-btn')) { Handlers.handleAddToPlan(btn.dataset.name, btn.dataset.pref, allSpotsData, auth, planManager, applyFilters, refreshPlanDisplay); return; }
            if (btn.classList.contains('remove-from-plan-btn')) { Handlers.handleRemoveFromPlan(btn.dataset.name, auth, planManager, refreshPlanDisplay, applyFilters); return; }
            if (btn.classList.contains('favorite-btn')) { Handlers.handleToggleFavorite(btn, allSpotsData, auth, applyFilters); return; }
            if (btn.classList.contains('transit-mode-btn')) { currentTravelModes[btn.dataset.index] = btn.dataset.mode; await refreshPlanDisplay(); return; }
            
            if (btn.id === 'add-spot-btn') UI.toggleSuggestModal(true);
            if (btn.id === 'auth-btn') Handlers.handleAuthSubmit(auth);
            if (btn.id === 'logout-btn') { if(confirm("ログアウトしますか？")) auth.logout(); }
            if (btn.id === 'go-settings-btn') UI.switchView('settings');
            if (btn.id === 'route-map-btn') Handlers.openGoogleMaps(planManager);
            if (btn.id === 'auth-switch-link') UI.updateAuthForm(auth.toggleMode());
            if (btn.id === 'guest-login-btn') { await auth.loginAsGuest(); location.reload(); }
            
            return;
        }

        // カードクリック
        const card = e.target.closest('.spot-card');
        if (card && !e.target.closest('button')) {
            try { 
                const jsonStr = decodeURIComponent(card.dataset.json);
                UI.openSpotDetailModal(JSON.parse(jsonStr)); 
            } catch(err) { console.error("Detail modal load error:", err); }
        }
    });
}