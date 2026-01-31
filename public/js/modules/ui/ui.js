// public/js/modules/ui.js

export class UI {
    // --- 1. アプリ画面の基本制御 ---
    static showAppScreen(user) {
        const authModal = document.getElementById('auth-modal');
        const appContainer = document.getElementById('app-container');
        if (authModal) authModal.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
        
        const display = document.getElementById('user-display');
        if (display) display.textContent = user.isGuest ? "ゲスト" : user.displayName;
        
        const icon = document.getElementById('header-user-icon');
        if (icon && user.photoURL) icon.src = user.photoURL;
    }

    static toggleAuthModal(show) {
        const modal = document.getElementById('auth-modal');
        const app = document.getElementById('app-container');
        if (show) {
            if(modal) modal.classList.remove('hidden');
            if(app) app.classList.add('hidden');
        } else {
            if(modal) modal.classList.add('hidden');
            if(app) app.classList.remove('hidden');
        }
    }

    static updateAuthForm(isLoginMode) {
        const title = document.getElementById('auth-title');
        const btn = document.getElementById('auth-btn');
        const nameInput = document.getElementById('display-name-input');
        const switchLink = document.getElementById('auth-switch-link');
        if(title) title.textContent = isLoginMode ? 'ログイン' : '新規登録';
        if(btn) btn.textContent = isLoginMode ? 'ログイン' : '登録';
        if(nameInput) nameInput.style.display = isLoginMode ? 'none' : 'block';
        if(switchLink) switchLink.textContent = isLoginMode ? '新規登録' : 'ログイン';
    }

    static updateFilterButtons(activeCategory) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.dataset.filter === activeCategory) {
                btn.classList.add('active-filter', 'bg-orange-500', 'text-white');
                btn.classList.remove('bg-white', 'text-gray-600');
            } else {
                btn.classList.remove('active-filter', 'bg-orange-500', 'text-white');
                btn.classList.add('bg-white', 'text-gray-600');
            }
        });
    }

    static formatTime(minutes) {
        if (!minutes || minutes < 0) return "0分";
        if (minutes < 60) return `${Math.round(minutes)}分`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m === 0 ? `${h}時間` : `${h}時間${m}分`;
    }

    static switchView(viewName) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        if (viewName === 'settings') {
            const el = document.getElementById('settings-view');
            if(el) el.classList.add('active');
        } else {
            const el = document.getElementById('main-view');
            if(el) el.classList.add('active');
        }
    }

    // --- 2. メイン一覧の描画 ---
    static renderSpots(spots, currentPlan = []) {
        const container = document.getElementById('spots-list');
        if (!container) return;
        container.innerHTML = '';

        if (!spots || spots.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10 font-bold">スポットが見つかりませんでした。</div>';
            return;
        }

        spots.forEach(spot => {
            const isFavorite = spot.isFavorite;
            const isInPlan = currentPlan.some(p => p.spotName === spot.name);
            const safeJson = encodeURIComponent(JSON.stringify(spot));
            let imgSrc = spot.image || 'https://placehold.co/600x400?text=No+Image';

            const card = document.createElement('div');
            card.className = 'spot-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition group relative cursor-pointer';
            card.dataset.json = safeJson;

            card.innerHTML = `
                <div class="relative h-48 overflow-hidden pointer-events-none">
                    <img src="${imgSrc}" alt="${spot.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" onerror="this.src='https://placehold.co/600x400?text=No+Image';">
                    <div class="absolute top-2 right-2 flex gap-2 z-10 pointer-events-auto">
                        <button class="favorite-btn p-2 rounded-full bg-white/90 shadow-sm hover:bg-white transition ${isFavorite ? 'text-pink-500' : 'text-gray-300'}" data-name="${spot.name}">
                            <svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        </button>
                    </div>
                    <div class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">${spot.prefecture}</div>
                </div>
                <div class="p-4 pointer-events-auto">
                    <h3 class="font-bold text-gray-800 text-lg leading-tight line-clamp-1 mb-2">${spot.name}</h3>
                    <div class="flex flex-wrap gap-1 mb-3">
                        ${(spot.tags || []).slice(0, 3).map(tag => `<span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded">${tag}</span>`).join('')}
                    </div>
                    ${isInPlan 
                        ? `<button class="w-full bg-green-50 text-green-600 border border-green-200 py-2 rounded-lg font-bold text-sm cursor-default flex items-center justify-center gap-1" disabled>追加済み</button>`
                        : `<button class="add-btn w-full bg-orange-500 text-white py-2 rounded-lg font-bold text-sm hover:bg-orange-600 transition shadow-sm" data-name="${spot.name}" data-pref="${spot.prefecture}">＋ プランに追加</button>`
                    }
                </div>
            `;
            container.appendChild(card);
        });
    }

    // --- 3. クイック確認（サイドバー）の描画 ---
    static renderUserPlan(planSpots, allSpotsData, travelTimes = [], settings = {}, weatherData = null) {
        const list = document.getElementById('plan-items-list');
        const badgeHeader = document.getElementById('plan-badge-header');
        const totalDisplay = document.getElementById('plan-total-time');
        const summary = document.getElementById('plan-summary-area');
        
        if (!list) return;
        list.innerHTML = '';

        if (badgeHeader) {
            badgeHeader.textContent = planSpots.length;
            badgeHeader.classList.toggle('hidden', planSpots.length === 0);
        }

        let totalMin = 0;
        travelTimes.forEach(t => totalMin += (t.minutes || 0));
        if (totalDisplay) totalDisplay.textContent = this.formatTime(totalMin);

        // 天気・日付表示
        if (summary) {
            summary.innerHTML = '';
            if (settings && settings.date) {
                summary.classList.remove('hidden');
                let weatherHtml = '';
                if (weatherData) {
                    const warn = weatherData.isWarning ? '<span class="text-red-500 text-[10px] ml-1">(予想)</span>' : '';
                    weatherHtml = `
                        <div class="flex items-center gap-1 mt-1">
                            <img src="${weatherData.icon}" class="w-5 h-5">
                            <span class="font-bold text-gray-700">${weatherData.temp}℃</span>
                            <span class="text-gray-500 text-xs">${weatherData.description}</span>
                            ${warn}
                        </div>
                    `;
                }
                summary.innerHTML = `<div class="font-bold text-sm text-gray-800">📅 ${settings.date}</div>${weatherHtml}`;
            } else {
                summary.innerHTML = `<h2 class="font-bold text-lg text-orange-700">クイック確認</h2>`;
            }
        }

        if (planSpots.length === 0) {
            list.innerHTML = `<div class="text-center text-gray-400 py-10 text-sm font-bold">スポットを追加してください</div>`;
            return;
        }

        // プランアイテムのループ
        planSpots.forEach((spot, index) => {
            const isLast = index === planSpots.length - 1;
            const spotDetail = allSpotsData.find(s => s.name === spot.spotName) || {};
            const isHotel = spot.category === 'hotel' || spot.spotName.includes('ホテル');
            let imageUrl = spotDetail.image || (isHotel ? 'https://placehold.co/100x100?text=Hotel' : 'https://placehold.co/100x100?text=No+Image');

            // 移動時間の表示
            let transitHtml = '';
            if (!isLast && travelTimes[index]) {
                const t = travelTimes[index];
                const isCar = t.mode === 'car';
                transitHtml = `
                    <div class="relative py-3 ml-12 flex items-center">
                        <div class="absolute left-[-1.5rem] top-0 bottom-0 w-0.5 bg-gray-200"></div>
                        <div class="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full px-3 py-1 shadow-sm">
                            <span class="text-[10px] font-bold text-indigo-600">${isCar ? '🚗' : '🚶'} ${this.formatTime(t.minutes)}</span>
                        </div>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = 'plan-item-wrapper relative';
            div.setAttribute('draggable', 'true');
            div.dataset.spotName = spot.spotName;
            div.dataset.prefecture = spot.prefecture;
            
            const bgClass = isHotel ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-200';
            const iconHtml = isHotel ? '🏨' : index + 1;

            div.innerHTML = `
                <div class="plan-item ${bgClass} p-2 rounded-lg border flex items-center gap-3 relative z-10 hover:border-orange-300 transition group">
                    <div class="w-6 text-center font-bold text-xs text-gray-400 flex-shrink-0">${iconHtml}</div>
                    <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                        <img src="${imageUrl}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/100x100?text=No+Image';">
                    </div>
                    <div class="flex-grow min-w-0">
                        <div class="font-bold text-gray-800 text-sm truncate">${spot.spotName}</div>
                        <div class="text-[10px] text-gray-400">${spot.prefecture || ''}</div>
                    </div>
                    <button class="remove-from-plan-btn text-gray-300 hover:text-red-500 font-bold px-2 transition" data-name="${spot.spotName}">×</button>
                </div>
                ${transitHtml}
            `;
            list.appendChild(div);
        });
    }

    // --- 4. モーダル操作 ---
    static openSpotDetailModal(spot) {
        if (!spot) return;
        const titleEl = document.getElementById('modal-title');
        const imgEl = document.getElementById('modal-image');
        const descEl = document.getElementById('modal-description');
        const tagsContainer = document.getElementById('modal-tags');
        const mapLink = document.getElementById('modal-map');
        const webLink = document.getElementById('modal-website');

        if(titleEl) titleEl.textContent = spot.name;
        if(imgEl) {
            imgEl.src = spot.image || 'https://placehold.co/600x400?text=No+Image';
            imgEl.onerror = () => { imgEl.src = 'https://placehold.co/600x400?text=No+Image'; };
        }
        if(descEl) descEl.textContent = spot.description || '説明がありません。';
        
        if(tagsContainer) {
            tagsContainer.innerHTML = '';
            (spot.tags || []).forEach(tag => {
                const s = document.createElement('span');
                s.className = 'bg-orange-100 text-orange-600 px-2 py-1 rounded text-xs font-bold';
                s.textContent = tag;
                tagsContainer.appendChild(s);
            });
        }
        if(mapLink) mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ' ' + (spot.prefecture||''))}`;
        if(webLink) {
            if (spot.url) { webLink.href = spot.url; webLink.style.display = 'flex'; } 
            else { webLink.style.display = 'none'; }
        }
        document.getElementById('modal').classList.remove('hidden');
    }

    static toggleSuggestModal(show) {
        const modal = document.getElementById('suggest-modal-overlay');
        if (show) {
            if(modal) modal.classList.remove('hidden');
            const input = document.getElementById('suggest-spot-name');
            if(input) input.value = '';
        } else {
            if(modal) modal.classList.add('hidden');
        }
    }

    static togglePrefectureModal(show, prefectures) {
        const modal = document.getElementById('prefecture-map-overlay');
        if (!show) { if(modal) modal.classList.add('hidden'); return; }
        if(modal) modal.classList.remove('hidden');
        const container = document.getElementById('prefecture-map-container');
        if(!container) return;
        container.innerHTML = '';
        
        const regions = {
            "北海道・東北": ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
            "関東": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
            "中部": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
            "近畿": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
            "中国・四国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
            "九州・沖縄": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
        };

        for (const [region, prefNames] of Object.entries(regions)) {
            const group = document.createElement('div');
            group.className = "mb-4";
            group.innerHTML = `<h3 class="font-bold text-gray-500 text-sm mb-2 border-b pb-1">${region}</h3>`;
            const grid = document.createElement('div');
            grid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2";
            
            prefectures.filter(p => prefNames.includes(p.name)).forEach(p => {
                const btn = document.createElement('button');
                btn.className = "pref-btn bg-white border border-gray-200 rounded p-2 text-xs font-bold hover:border-orange-500 hover:text-orange-500 transition";
                btn.textContent = p.name;
                btn.dataset.pref = p.name;
                grid.appendChild(btn);
            });
            group.appendChild(grid);
            container.appendChild(group);
        }
    }

    static showCrossPrefectureModal(spotName, lastPref, newPref, onConfirm) {
        const modal = document.getElementById('cross-prefecture-overlay');
        const msg = document.getElementById('cross-prefecture-message');
        if(msg) msg.innerHTML = `<strong>${lastPref}</strong> から <strong>${newPref}</strong> への移動が含まれますが、追加しますか？`;
        if(modal) modal.classList.remove('hidden');
        
        document.getElementById('cross-prefecture-add-btn').onclick = () => { if(modal) modal.classList.add('hidden'); onConfirm(); };
        document.getElementById('cross-prefecture-cancel-btn').onclick = () => { if(modal) modal.classList.add('hidden'); };
    }
}