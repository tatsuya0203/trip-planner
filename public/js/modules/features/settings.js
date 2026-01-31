// public/js/modules/settings.js
import { Api } from '../services/api.js';
import { UI } from '../ui/ui.js';
import { CalendarExporter } from './calendar.js';

export class SettingsManager {
    constructor(planManager, auth, refreshCallback) {
        this.planManager = planManager;
        this.auth = auth;
        this.refreshCallback = refreshCallback;
        this.currentSourceTab = 'plan'; 
        this.favorites = [];
        this.history = [];
        this.allSpotsMap = new Map();
        this.currentRouteTimes = []; 
        this.mapInstance = null;
        this.setupEventListeners();
    }

    setAllSpots(spots) {
        spots.forEach(s => this.allSpotsMap.set(s.name, s));
    }

    setupEventListeners() {
        document.getElementById('go-settings-btn')?.addEventListener('click', () => this.openSettings());
        document.getElementById('back-to-main-btn')?.addEventListener('click', () => UI.switchView('main'));
        document.getElementById('calc-confirm-btn')?.addEventListener('click', () => this.calculateAndConfirm());
        
        document.getElementById('do-save-plan-btn')?.addEventListener('click', () => this.executeSave());
        document.getElementById('cancel-save-plan-btn')?.addEventListener('click', () => document.getElementById('confirm-plan-modal').classList.add('hidden'));

        document.getElementById('modal-google-calendar')?.addEventListener('click', () => {
            const plans = this.planManager.getPlans();
            const date = document.getElementById('full-date-input').value;
            CalendarExporter.openGoogleCalendar(plans, date, "");
        });
        document.getElementById('modal-ical-calendar')?.addEventListener('click', () => {
            const plans = this.planManager.getPlans();
            const date = document.getElementById('full-date-input').value;
            CalendarExporter.downloadIcs(plans, date, "");
        });

        document.getElementById('open-google-maps-btn')?.addEventListener('click', () => this.openInGoogleMaps());

        document.getElementById('tab-map-btn')?.addEventListener('click', () => this.switchMobileModalTab('map'));
        document.getElementById('tab-list-btn')?.addEventListener('click', () => this.switchMobileModalTab('list'));

        document.querySelectorAll('.slot-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.changeSlot(e.target.dataset.slot));
        });

        document.querySelectorAll('.source-tab').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchSourceTab(e.target));
        });

        document.getElementById('full-days-input')?.addEventListener('change', () => this.renderTimeline());
    }

    switchMobileModalTab(mode) {
        const mapSec = document.getElementById('map-section');
        const listSec = document.getElementById('list-section');
        const mapBtn = document.getElementById('tab-map-btn');
        const listBtn = document.getElementById('tab-list-btn');

        if (mode === 'map') {
            mapSec.classList.remove('hidden');
            listSec.classList.add('hidden');
            mapBtn.classList.add('tab-active'); mapBtn.classList.remove('tab-inactive');
            listBtn.classList.remove('tab-active'); listBtn.classList.add('tab-inactive');
            if (this.mapInstance) setTimeout(() => this.mapInstance.invalidateSize(), 100);
        } else {
            mapSec.classList.add('hidden');
            listSec.classList.remove('hidden');
            listSec.classList.add('flex');
            mapBtn.classList.remove('tab-active'); mapBtn.classList.add('tab-inactive');
            listBtn.classList.add('tab-active'); listBtn.classList.remove('tab-inactive');
        }
    }

    openInGoogleMaps() {
        const plans = this.planManager.getPlans();
        if (plans.length < 2) return alert("スポットが2つ以上必要です");
        const getLoc = (p) => (p.lat && p.lng) ? `${p.lat},${p.lng}` : encodeURIComponent(`${p.spotName} ${p.prefecture||''}`);
        const origin = getLoc(plans[0]);
        const dest = getLoc(plans[plans.length-1]);
        const waypoints = plans.slice(1, -1).map(p => getLoc(p)).join('|');
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}&travelmode=driving`, '_blank');
    }

    async openSettings() {
        if (!this.auth.currentUser) return alert("ログインしてください");
        const uid = this.auth.currentUser.uid;
        const slot = this.planManager.currentSlot;
        try {
            const res = await Api.get(`/api/user/plan-settings/${uid}?slot=${slot}`);
            const settings = res.success ? res.settings : {};
            document.getElementById('full-date-input').value = settings.date || '';
            document.getElementById('full-days-input').value = settings.days || 1;
        } catch(e) { console.error(e); }
        this.updateSlotUI(slot);
        await this.loadSourceData();
        this.currentRouteTimes = []; 
        this.renderTimeline();
        UI.switchView('settings');
    }

    async loadSourceData() {
        const uid = this.auth.currentUser.uid;
        try {
            this.favorites = await Api.get(`/api/users/${uid}/favorites`);
            this.history = await Api.get(`/api/users/${uid}/history`);
        } catch (e) { console.error(e); }
        this.renderSourceList();
    }

    switchSourceTab(targetBtn) {
        document.querySelectorAll('.source-tab').forEach(b => {
            b.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
            b.classList.add('text-gray-500');
        });
        targetBtn.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
        targetBtn.classList.remove('text-gray-500');
        this.currentSourceTab = targetBtn.dataset.target;
        this.renderSourceList();
    }

    renderSourceList() {
        const list = document.getElementById('source-list');
        list.innerHTML = '';
        let items = [];
        if (this.currentSourceTab === 'favorites') items = this.favorites;
        else if (this.currentSourceTab === 'history') items = this.history;
        else if (this.currentSourceTab === 'plan') {
            items = this.planManager.getPlans().filter(p => p.category !== 'hotel' && !p.spotName.includes('ホテル'));
        }
        if (!items || items.length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-center text-xs py-4">データがありません</p>';
            return;
        }
        items.forEach(item => {
            const name = typeof item === 'string' ? item : item.name || item.spotName;
            const pref = (typeof item === 'object' && item.prefecture) ? item.prefecture : '';
            const lat = item.lat; const lng = item.lng; const image = item.image; 
            const div = document.createElement('div');
            div.className = "bg-white border rounded p-2 flex justify-between items-center text-sm shadow-sm hover:bg-gray-50 cursor-pointer group draggable-source";
            div.draggable = true;
            div.dataset.name = name;
            div.innerHTML = `
                <div class="flex items-center gap-2">
                    ${image ? `<img src="${image}" class="w-8 h-8 rounded object-cover">` : ''}
                    <div><div class="font-bold text-gray-700">${name}</div>${pref ? `<div class="text-[10px] text-gray-400">${pref}</div>` : ''}</div>
                </div>
                <button type="button" class="bg-orange-500 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition add-to-timeline-btn">追加</button>
            `;
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ name, pref, lat, lng, image, type: 'new' }));
                e.dataTransfer.effectAllowed = 'copy';
            });
            div.querySelector('.add-to-timeline-btn').addEventListener('click', () => this.addItemToTimeline(name, pref, { lat, lng, image }));
            list.appendChild(div);
        });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        if(!lat1 || !lon1 || !lat2 || !lon2) return null;
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return Math.round((R * c * 1.4 / 60) * 60); 
    }

    renderTimeline() {
        const container = document.getElementById('timeline-container');
        container.innerHTML = '';
        const days = parseInt(document.getElementById('full-days-input').value) || 1;
        const plans = this.planManager.getPlans();
        let globalRouteIndex = 0;

        for (let d = 1; d <= days; d++) {
            const dayWrapper = document.createElement('div');
            dayWrapper.className = "mb-8";
            dayWrapper.innerHTML = `<h4 class="font-bold text-gray-600 mb-2 flex items-center gap-2"><span class="bg-gray-200 px-2 py-1 rounded text-xs">Day ${d}</span></h4>`;
            
            const dropZone = document.createElement('div');
            dropZone.className = "drop-zone min-h-[80px] bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-2 space-y-4 relative";
            dropZone.dataset.day = d;

            const dayPlans = plans.filter(p => (p.day || 1) == d);
            
            dayPlans.forEach((p, idx) => {
                const item = document.createElement('div');
                const isHotel = p.category === 'hotel' || p.spotName.includes('ホテル');
                item.className = `draggable-item bg-white p-3 rounded shadow-sm border flex justify-between items-center cursor-move relative z-10 ${isHotel ? 'border-blue-400 bg-blue-50' : ''}`;
                item.draggable = true;
                item.dataset.index = plans.indexOf(p);

                const imgSrc = p.image || (isHotel ? 'https://placehold.co/100x100?text=Hotel' : 'https://placehold.co/100x100?text=No+Image');

                item.innerHTML = `
                    <div class="flex items-center gap-3 pointer-events-none">
                        <div class="flex-shrink-0 w-6 text-center text-gray-400 font-bold text-xs">${isHotel ? '🏨' : idx + 1}</div>
                        <img src="${imgSrc}" class="w-10 h-10 rounded object-cover bg-gray-200" onerror="this.src='https://placehold.co/100x100?text=No+Image';">
                        <div>
                            <div class="font-bold text-sm ${isHotel ? 'text-blue-800' : 'text-gray-700'}">${p.spotName}</div>
                            ${p.url ? `<a href="${p.url}" target="_blank" class="pointer-events-auto text-[10px] text-blue-500 bg-blue-50 px-1 rounded">Map</a>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 pointer-events-auto">
                        <div class="cursor-grab text-gray-300 hover:text-gray-500 text-lg px-2">☰</div>
                        <button type="button" class="text-gray-300 hover:text-red-500 remove-item-btn font-bold px-2">×</button>
                    </div>
                `;
                
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({ index: plans.indexOf(p), type: 'move' }));
                    setTimeout(() => item.classList.add('opacity-50'), 0);
                });
                item.addEventListener('dragend', () => item.classList.remove('opacity-50'));

                item.querySelector('.remove-item-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if(confirm("削除しますか？")) { await this.planManager.remove(this.auth.currentUser.uid, p.spotName); this.renderTimeline(); }
                });
                dropZone.appendChild(item);

                if (idx < dayPlans.length - 1) {
                    let timeText = '---';
                    if (this.currentRouteTimes[globalRouteIndex]) {
                        timeText = UI.formatTime(this.currentRouteTimes[globalRouteIndex].minutes);
                    } else {
                        const nextP = dayPlans[idx+1];
                        if (p.lat && p.lng && nextP.lat && nextP.lng) {
                            const min = this.calculateDistance(p.lat, p.lng, nextP.lat, nextP.lng);
                            timeText = `約${UI.formatTime(min)}`;
                        } else {
                            timeText = (p.prefecture === nextP.prefecture) ? '約15分' : '約60分';
                        }
                    }
                    globalRouteIndex++; 
                    const timeDiv = document.createElement('div');
                    timeDiv.className = "pl-12 py-1 text-xs font-bold text-indigo-600 flex items-center relative z-0";
                    timeDiv.innerHTML = `<div class="timeline-connector"></div><span class="bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">🚗 ${timeText}</span>`;
                    dropZone.appendChild(timeDiv);
                }
            });
            if (dayPlans.length > 0) globalRouteIndex++; 

            this.setupDropZone(dropZone, d);
            dayWrapper.appendChild(dropZone);

            if (d < days) {
                const hotelArea = this.createHotelSearchArea(d, dayPlans);
                dayWrapper.appendChild(hotelArea);
            }
            container.appendChild(dayWrapper);
        }
    }

    createHotelSearchArea(day, currentDayPlans) {
        if (currentDayPlans.find(p => p.category === 'hotel')) return document.createElement('div');
        const wrapper = document.createElement('div');
        wrapper.className = "mt-4 ml-4 pl-4 border-l-2 border-indigo-200";
        wrapper.innerHTML = `
            <div class="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-sm relative transition-all" id="hotel-box-${day}">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-indigo-700 text-xs">🛏️ ${day}日目の宿泊</span>
                    <button type="button" class="text-gray-400 hover:text-gray-600 font-bold toggle-hotel-btn text-xs bg-white px-2 py-1 rounded border">開閉</button>
                </div>
                <div class="space-y-2" id="hotel-content-${day}">
                    <div class="flex flex-col gap-1">
                        <label class="flex items-center gap-2"><input type="radio" name="hotel-loc-${day}" value="end" checked> ${day}日目の終了地点付近</label>
                        <label class="flex items-center gap-2"><input type="radio" name="hotel-loc-${day}" value="start"> ${day+1}日目の開始地点付近</label>
                        <label class="flex items-center gap-2"><input type="radio" name="hotel-loc-${day}" value="manual"> 手動入力</label>
                        <label class="flex items-center gap-2 text-gray-500"><input type="radio" name="hotel-loc-${day}" value="none"> 泊まらない (最小化)</label>
                    </div>
                    <div id="hotel-manual-input-${day}" class="hidden mt-1"><input class="w-full border rounded px-2 py-1 mb-1" placeholder="場所 (例: 博多駅)"></div>
                    <div class="flex gap-2 items-center"><span class="text-xs text-gray-500">人数:</span><select id="hotel-people-day-${day}" class="border rounded px-2 py-1 bg-white text-xs"><option value="2">2人</option><option value="1">1人</option><option value="3">3人</option><option value="4">4人</option></select></div>
                    <button type="button" class="w-full bg-indigo-600 text-white font-bold py-2 rounded shadow hover:bg-indigo-700 mt-1" id="search-hotel-btn-${day}">候補を検索</button>
                    <div class="mt-2 pt-2 border-t border-indigo-200 text-xs"><p class="text-gray-500 mb-1 cursor-pointer underline" id="toggle-manual-add-${day}">または手動で追加</p><div id="manual-add-area-${day}" class="hidden space-y-1"><input id="custom-hotel-name-${day}" class="w-full border rounded px-2 py-1" placeholder="ホテル名 (必須)"><button type="button" class="bg-gray-600 text-white px-3 py-1 rounded w-full" id="add-custom-hotel-${day}">手動追加</button></div></div>
                </div>
                <div id="hotel-results-${day}" class="mt-2 space-y-1"></div>
            </div>
        `;
        
        wrapper.querySelector('.toggle-hotel-btn').addEventListener('click', () => { wrapper.querySelector(`#hotel-content-${day}`).classList.toggle('hidden'); });
        wrapper.querySelectorAll(`input[name="hotel-loc-${day}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                const content = wrapper.querySelector(`#hotel-content-${day}`); const manualInput = wrapper.querySelector(`#hotel-manual-input-${day}`);
                if (e.target.value === 'none') { content.classList.add('hidden'); wrapper.querySelector(`#hotel-box-${day}`).classList.add('opacity-50'); } else { content.classList.remove('hidden'); wrapper.querySelector(`#hotel-box-${day}`).classList.remove('opacity-50'); if (e.target.value === 'manual') manualInput.classList.remove('hidden'); else manualInput.classList.add('hidden'); }
            });
        });
        wrapper.querySelector(`#toggle-manual-add-${day}`).addEventListener('click', () => { wrapper.querySelector(`#manual-add-area-${day}`).classList.toggle('hidden'); });
        
        wrapper.querySelector(`#search-hotel-btn-${day}`).addEventListener('click', async () => {
            const mode = wrapper.querySelector(`input[name="hotel-loc-${day}"]:checked`).value;
            let location = '', prefecture = '';
            const plans = this.planManager.getPlans();
            if (mode === 'manual') { location = wrapper.querySelector(`#hotel-manual-input-${day} input`).value; } 
            else if (mode === 'end') {
                const currentDayPlans = plans.filter(p => (p.day || 1) == day); const lastSpot = currentDayPlans[currentDayPlans.length - 1];
                if(lastSpot) { location = lastSpot.spotName; prefecture = lastSpot.prefecture || ''; }
            } else if (mode === 'start') {
                const nextDayPlans = plans.filter(p => (p.day || 1) == day + 1); const firstSpot = nextDayPlans[0];
                if(firstSpot) { location = firstSpot.spotName; prefecture = firstSpot.prefecture || ''; }
            }
            if (!location) return alert("場所を特定できませんでした。");
            const searchQuery = prefecture ? `${location} ${prefecture}` : location;
            const people = wrapper.querySelector(`#hotel-people-day-${day}`).value;
            await this.executeHotelSearch(day, searchQuery, people, wrapper.querySelector(`#hotel-results-${day}`));
        });
        
        wrapper.querySelector(`#add-custom-hotel-${day}`).addEventListener('click', async () => {
            const name = wrapper.querySelector(`#custom-hotel-name-${day}`).value;
            if(!name) return alert("名前は必須です");
            await this.planManager.add(this.auth.currentUser.uid, name, "宿泊", day, { name: name, category: 'hotel' });
            this.renderTimeline();
        });
        return wrapper;
    }

    async executeHotelSearch(day, location, people, resultContainer) {
        resultContainer.innerHTML = '<p class="text-xs text-gray-500">検索中...</p>';
        try {
            const res = await Api.post('/api/search-hotels', { locationName: location, people: people, budget: 20000 });
            resultContainer.innerHTML = '';
            if (res.success && res.hotels.length > 0) {
                res.hotels.forEach(h => {
                    const row = document.createElement('div');
                    row.className = "bg-white p-2 rounded border text-xs flex justify-between items-center";
                    row.innerHTML = `<div><div class="font-bold text-indigo-700">${h.name}</div><div class="text-gray-500">${h.price}</div></div><button type="button" class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200">選択</button>`;
                    row.querySelector('button').addEventListener('click', async () => {
                        await this.planManager.add(this.auth.currentUser.uid, h.name, "宿泊", day, { name: h.name, category: 'hotel' });
                        this.renderTimeline();
                    });
                    resultContainer.appendChild(row);
                });
            } else { resultContainer.innerHTML = '<p class="text-xs text-red-500">見つかりませんでした</p>'; }
        } catch(e) { resultContainer.innerHTML = '<p class="text-xs text-red-500">エラー発生</p>'; }
    }

    setupDropZone(dropZone, day) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const dataStr = e.dataTransfer.getData('application/json'); if (!dataStr) return;
            const data = JSON.parse(dataStr);
            let allPlans = [...this.planManager.getPlans()];

            const afterElement = this.getDragAfterElement(dropZone, e.clientY);
            let targetIndex;
            
            if (afterElement == null) {
                const dayPlans = allPlans.filter(p => (p.day || 1) == day);
                if (dayPlans.length > 0) {
                    const lastItem = dayPlans[dayPlans.length - 1];
                    targetIndex = allPlans.indexOf(lastItem) + 1;
                } else {
                    targetIndex = allPlans.length; 
                }
            } else {
                targetIndex = parseInt(afterElement.dataset.index);
            }

            if (data.type === 'move') {
                const oldIndex = data.index;
                const movingItem = allPlans[oldIndex];
                if (oldIndex < targetIndex) targetIndex--; 
                allPlans.splice(oldIndex, 1);
                movingItem.day = day;
                allPlans.splice(targetIndex, 0, movingItem);
            } else if (data.type === 'new') {
                const newItem = { spotName: data.name, prefecture: data.pref || '', day: day, lat: data.lat, lng: data.lng, image: data.image };
                if (allPlans.some(p => p.spotName === newItem.spotName)) return alert("既に追加されています");
                allPlans.splice(targetIndex, 0, newItem);
            }
            await this.planManager.updateAll(this.auth.currentUser.uid, allPlans);
            this.renderTimeline();
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.draggable-item:not(.opacity-50)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async addItemToTimeline(name, pref, coords = {}) {
        const days = document.getElementById('full-days-input').value;
        const day = prompt(`「${name}」を何日目に追加しますか？ (1〜${days})`, "1");
        if (!day || day < 1 || day > days) return;
        await this.planManager.add(this.auth.currentUser.uid, name, pref || '', parseInt(day), { name: name, lat: coords.lat, lng: coords.lng, image: coords.image });
        this.renderTimeline();
    }

    async calculateAndConfirm() {
        if (!this.auth.currentUser) return;
        const btn = document.getElementById('calc-confirm-btn');
        btn.disabled = true; btn.innerHTML = '<span>⏳ 計算中...</span>';
        try {
            const uid = this.auth.currentUser.uid;
            
            // ★重要: 表示前にデータを日付順・順序順にソートする
            let plans = this.planManager.getPlans();
            plans.sort((a, b) => {
                if ((a.day || 1) !== (b.day || 1)) return (a.day || 1) - (b.day || 1);
                return 0; // 同じ日の中での順序は配列の順序通り
            });
            // ソート結果を保存
            await this.planManager.updateAll(this.auth.currentUser.uid, plans);

            const res = await Api.post('/api/calculate-route', { uid, spots: plans });
            
            if (res.success) {
                this.currentRouteTimes = res.routes;
                this.renderTimeline(); 

                let totalMinutes = 0; res.routes.forEach(r => totalMinutes += r.minutes);
                
                const modal = document.getElementById('confirm-plan-modal');
                modal.classList.remove('hidden');
                
                this.switchMobileModalTab('map');
                document.getElementById('confirm-total-time').textContent = UI.formatTime(totalMinutes);
                
                // 詳細リスト生成 (ホテルを含める)
                let detailsHtml = '';
                let currentDay = 0;
                
                plans.forEach((p, i) => {
                    const isHotel = p.category === 'hotel' || p.spotName.includes('ホテル');
                    
                    if ((p.day || 1) !== currentDay) {
                        currentDay = p.day || 1;
                        detailsHtml += `<div class="font-bold text-gray-800 bg-gray-100 p-2 mt-2 rounded text-xs border-b border-gray-200">📅 Day ${currentDay}</div>`;
                    }
                    
                    const itemClass = isHotel ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-white border-gray-100";
                    
                    detailsHtml += `
                        <div class="flex items-center gap-2 p-2 border rounded mb-1 ml-2 ${itemClass}">
                            <span class="text-xs font-bold ${isHotel ? 'text-blue-600' : 'text-gray-500'}">${isHotel ? '🏨' : '📍'}</span>
                            <span class="text-sm font-bold">${p.spotName}</span>
                        </div>
                    `;

                    if (i < plans.length - 1 && res.routes[i]) {
                        detailsHtml += `<div class="pl-6 text-indigo-500 text-[10px] py-1 border-l-2 border-dashed border-indigo-100 ml-4">⬇ 🚗 ${UI.formatTime(res.routes[i].minutes)}</div>`;
                    }
                });
                document.getElementById('confirm-route-details').innerHTML = detailsHtml;

                // 地図描画
                if (!this.mapInstance) {
                    this.mapInstance = L.map('confirmation-map');
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.mapInstance);
                }
                
                this.mapInstance.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline) this.mapInstance.removeLayer(l); });
                
                const latlngs = [];
                plans.forEach((p, i) => {
                    // ★重要: 文字列かもしれないlat/lngを数値変換
                    const lat = parseFloat(p.lat);
                    const lng = parseFloat(p.lng);

                    if (!isNaN(lat) && !isNaN(lng)) {
                        const loc = [lat, lng];
                        const isHotel = p.category === 'hotel' || p.spotName.includes('ホテル');
                        const color = isHotel ? '#f59e0b' : '#4f46e5'; 
                        
                        const iconHtml = `<div class="pin-inner ${isHotel ? 'hotel-pin' : ''}">${i+1}</div>`;
                        const icon = L.divIcon({ className: 'custom-div-icon', html: iconHtml, iconSize: [24, 24], iconAnchor: [12, 12] });
                        
                        L.marker(loc, { icon }).addTo(this.mapInstance).bindPopup(p.spotName);
                        latlngs.push(loc);
                    }
                });

                if (latlngs.length > 0) {
                    L.polyline(latlngs, { color: '#6366f1', weight: 4, opacity: 0.7 }).addTo(this.mapInstance);
                    this.mapInstance.fitBounds(latlngs, { padding: [50, 50] });
                } else {
                    this.mapInstance.setView([35.689, 139.691], 5);
                }
                setTimeout(() => this.mapInstance.invalidateSize(), 200);

            } else { alert("ルート計算失敗: " + res.message); }
        } catch(e) { console.error(e); alert("エラー発生"); } 
        finally { btn.disabled = false; btn.innerHTML = '<span>⚡ 確定計算</span>'; }
    }

    async executeSave() {
        const uid = this.auth.currentUser.uid;
        const slot = this.planManager.currentSlot;
        const settings = { date: document.getElementById('full-date-input').value, days: document.getElementById('full-days-input').value };
        try { await Api.post('/api/user/plan-settings', { uid, settings, slot }); document.getElementById('confirm-plan-modal').classList.add('hidden'); alert("保存しました！"); if (this.refreshCallback) await this.refreshCallback(); UI.switchView('main'); } catch(e) { alert("保存失敗"); }
    }

    async changeSlot(newSlot) { if (this.planManager.currentSlot == newSlot) return; if (confirm("スロットを切り替えますか？")) { this.planManager.setSlot(newSlot); await this.planManager.load(this.auth.currentUser.uid); this.updateSlotUI(newSlot); await this.openSettings(); if (this.refreshCallback) await this.refreshCallback(); } }
    
    updateSlotUI(slot) { 
        document.querySelectorAll('.slot-btn').forEach(btn => { 
            if (btn.dataset.slot == slot) { btn.classList.add('bg-orange-500', 'text-white', 'border-transparent'); btn.classList.remove('bg-white', 'text-orange-600', 'border-orange-200'); } 
            else { btn.classList.remove('bg-orange-500', 'text-white', 'border-transparent'); btn.classList.add('bg-white', 'text-orange-600', 'border-orange-200'); } 
        });
        const display = document.getElementById('current-slot-display');
        if(display) display.textContent = `現在: プラン${slot}`;
    }
}