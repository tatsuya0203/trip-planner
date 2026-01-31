// public/js/modules/handlers.js
import { Api } from '../services/api.js';
import { UI } from './ui.js';

export function togglePlanSidebar(btn) {
    const sb = document.getElementById('plan-sidebar');
    if(sb) {
        sb.classList.toggle('translate-x-full');
        const isOpen = !sb.classList.contains('translate-x-full');
        btn.className = isOpen ? "bg-orange-600 text-white px-3 py-1.5 rounded-full font-bold text-xs" : "bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full font-bold text-xs border border-orange-100 hover:bg-orange-100 transition";
    }
}

export function closePlanSidebar() {
    document.getElementById('plan-sidebar')?.classList.add('translate-x-full');
    const toggleBtn = document.getElementById('plan-toggle-btn');
    if(toggleBtn) toggleBtn.className = "bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full font-bold text-xs border border-orange-100 hover:bg-orange-100 transition";
}

export async function handleAddToPlan(name, pref, allSpotsData, auth, planManager, applyFilters, refreshPlanDisplay) {
    if(!auth.currentUser) return alert("ログインしてください");
    const spot = allSpotsData.find(s => s.name === name);
    const res = await planManager.add(auth.currentUser.uid, name, pref, 1, spot);
    if (res.status === 'cross_prefecture') {
        UI.showCrossPrefectureModal(name, res.lastPref, res.newPref, async () => {
            await planManager._executeAdd(auth.currentUser.uid, name, pref, 1, spot);
            await refreshPlanDisplay(); applyFilters();
        });
    } else if (res.status === 'exists') {
        alert("既にプランに含まれています");
    } else {
        await refreshPlanDisplay(); applyFilters();
    }
}

export async function handleRemoveFromPlan(name, auth, planManager, refreshPlanDisplay, applyFilters) {
    if(confirm(`${name} を削除しますか？`)) { 
        await planManager.remove(auth.currentUser.uid, name); 
        await refreshPlanDisplay(); applyFilters(); 
    }
}

export async function handleToggleFavorite(btn, allSpotsData, auth, applyFilters) {
    const name = btn.dataset.name, spot = allSpotsData.find(s => s.name === name);
    if(!spot || !auth.currentUser || auth.currentUser.isGuest) return alert("お気に入り登録にはログインが必要です");
    const old = spot.isFavorite; spot.isFavorite = !old;
    try { 
        const res = await Api.post(`/api/users/${auth.currentUser.uid}/favorites`, { spotName:name, action:spot.isFavorite?'add':'remove' }); 
        if(!res.success) throw new Error();
        applyFilters(); 
    } catch { spot.isFavorite = old; alert("お気に入りの同期に失敗しました"); applyFilters(); }
}

export function openProfileModal(auth) {
    if(!auth.currentUser || auth.currentUser.isGuest) return alert("ゲストはプロフィールを編集できません");
    document.getElementById('profile-name').value = auth.currentUser.displayName || "";
    document.getElementById('profile-email').value = auth.currentUser.email || "";
    const img = document.getElementById('profile-edit-icon');
    if(img && auth.currentUser.photoURL) img.src = auth.currentUser.photoURL;
    document.getElementById('profile-modal-overlay').classList.remove('hidden');
}

export function setupDragAndDrop(planManager, auth, refreshPlanDisplay) {
    const list = document.getElementById('plan-items-list'); if (!list) return;
    let draggedItem = null;
    list.addEventListener('dragstart', e => { 
        draggedItem = e.target.closest('.plan-item-wrapper'); 
        if(draggedItem) { e.dataTransfer.setData('text/plain', ''); setTimeout(()=>draggedItem.classList.add('opacity-50'),0); }
    });
    list.addEventListener('dragend', async () => { 
        if(draggedItem) { 
            draggedItem.classList.remove('opacity-50'); draggedItem=null; 
            const items = [...list.querySelectorAll('.plan-item-wrapper')];
            await planManager.reorder(auth.currentUser.uid, items.map(i=>({ spotName:i.dataset.spotName, prefecture:i.dataset.prefecture })));
            await refreshPlanDisplay(); 
        }
    });
    list.addEventListener('dragover', e => { 
        e.preventDefault(); const dragging = list.querySelector('.opacity-50'); 
        if(dragging) { 
            const after = [...list.querySelectorAll('.plan-item-wrapper:not(.opacity-50)')].find(el => e.clientY < el.getBoundingClientRect().top + el.offsetHeight/2);
            if(!after) list.appendChild(dragging); else list.insertBefore(dragging, after); 
        }
    });
}

export function setupProfileFeature(auth, updateHeaderProfile) {
    let cropper; const fileIn = document.getElementById('file-input'), saveBtn = document.getElementById('save-profile-btn');
    fileIn?.addEventListener('change', e => {
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = ev => { 
            document.getElementById('current-icon-view').classList.add('hidden'); document.getElementById('crop-container').classList.remove('hidden');
            if(cropper) cropper.destroy(); 
            const target = document.getElementById('crop-image-target');
            target.src = ev.target.result;
            cropper = new Cropper(target, { aspectRatio: 1, viewMode: 1, minContainerHeight: 200 });
        }; reader.readAsDataURL(file);
    });
    saveBtn?.addEventListener('click', async () => {
        saveBtn.disabled = true; saveBtn.textContent = "保存中...";
        const fd = new FormData(); fd.append('uid', auth.currentUser.uid); fd.append('displayName', document.getElementById('profile-name').value);
        const upload = async (data) => {
            try { 
                const r = await fetch('/api/auth/update', { method: 'POST', body: data }); 
                const res = await r.json(); 
                if (res.success) { alert("プロフィールを更新しました"); location.reload(); }
            } catch { alert("更新に失敗しました"); } finally { saveBtn.disabled = false; saveBtn.textContent = "保存"; }
        };
        if (cropper) { cropper.getCroppedCanvas().toBlob(blob => { fd.append('avatarFile', blob, 'avatar.png'); upload(fd); }); } 
        else upload(fd);
    });
}

export async function handleAuthSubmit(auth) {
    const m = document.getElementById('email-input').value, p = document.getElementById('password-input').value, n = document.getElementById('display-name-input').value;
    if(!m || !p) return alert("必須項目を入力してください");
    try { auth.isLoginMode ? await auth.login(m,p) : await auth.register(m,p,n); location.reload(); } catch(e){ alert(e.message); }
}

export function openGoogleMaps(planManager) {
    const plans = planManager.getPlans(); if (!plans.length) return alert("プランが空です");
    const getLoc = (p) => (p.lat && p.lng) ? `${p.lat},${p.lng}` : encodeURIComponent(p.spotName + ' ' + p.prefecture);
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${getLoc(plans[0])}&destination=${getLoc(plans[plans.length-1])}&waypoints=${plans.slice(1, -1).map(p=>getLoc(p)).join('|')}&travelmode=driving`, '_blank');
}

export function setupSuggestFeature() {
    document.getElementById('submit-suggest-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('suggest-spot-name').value, loc = document.getElementById('suggest-spot-location').value;
        if(!name || !loc) return alert("名前と場所を入力してください");
        try { await Api.post('/api/suggest', { spotName: name, location: loc }); alert("ご提案ありがとうございました！"); UI.toggleSuggestModal(false); } catch { alert("送信エラーが発生しました"); }
    });
}