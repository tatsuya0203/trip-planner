// public/js/modules/admin_ui.js
export class AdminUI {
    static switchTab(tabId) {
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) btn.classList.add('bg-gray-700', 'active-tab');
            else btn.classList.remove('bg-gray-700', 'active-tab');
        });
        document.querySelectorAll('.admin-section').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');
    }

    static updateStats(stats) {
        document.getElementById('stat-total-spots').textContent = stats.totalSpots || 0;
        document.getElementById('stat-pending-spots').textContent = stats.pendingSpots || 0;
        document.getElementById('stat-total-users').textContent = stats.totalUsers || 0;
        
        // レポート件数バッジ
        const badge = document.getElementById('reports-badge');
        if (badge) {
            badge.textContent = stats.reports || 0;
            badge.classList.toggle('hidden', !stats.reports);
        }
    }

    static renderPendingList(list) {
        const container = document.getElementById('pending-list-container');
        if (!container) return;
        container.innerHTML = '';
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-gray-500 p-4 bg-white rounded shadow-sm">承認待ちのスポットはありません。</p>';
            return;
        }
        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'bg-white p-4 rounded-lg shadow border border-gray-200 flex flex-col md:flex-row gap-4 items-start';
            div.innerHTML = `
                <img src="${item.image || 'https://placehold.co/300x200'}" class="w-full md:w-48 h-32 object-cover rounded bg-gray-100">
                <div class="flex-grow">
                    <div class="flex gap-2 mb-1"><span class="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-bold">${item.prefecture || '不明'}</span><span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">${item.category || '未分類'}</span></div>
                    <h3 class="font-bold text-lg text-gray-800">${item.name || '名称なし'}</h3>
                    <p class="text-sm text-gray-600 mt-1 line-clamp-2">${item.description || ''}</p>
                </div>
                <div class="flex flex-col gap-2 min-w-[120px]">
                    <button class="approve-btn bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 font-bold text-sm" data-id="${item.id}">承認</button>
                    <button class="reject-btn bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 font-bold text-sm" data-id="${item.id}">却下</button>
                </div>`;
            container.appendChild(div);
        });
    }

    static renderSpotsTable(spots) {
        const tbody = document.getElementById('admin-spots-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!spots || spots.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">なし</td></tr>'; return; }
        spots.forEach(spot => {
            const tr = document.createElement('tr');
            const jsonString = JSON.stringify(spot).replace(/'/g, "&apos;");
            tr.innerHTML = `
                <td class="p-4 text-xs text-gray-500">${spot.id ? spot.id.substring(0,8) : 'IDなし'}</td>
                <td class="p-4"><img src="${spot.image||''}" class="w-12 h-12 object-cover rounded" onerror="this.src='https://placehold.co/40'"></td>
                <td class="p-4 font-bold">${spot.name}</td>
                <td class="p-4">${spot.prefecture}</td>
                <td class="p-4">${spot.category}</td>
                <td class="p-4 text-right"><button class="edit-spot-btn text-blue-600 font-bold text-sm" data-json='${jsonString}'>編集</button></td>`;
            tbody.appendChild(tr);
        });
    }

    static renderUsersTable(users) {
        const tbody = document.getElementById('admin-users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!users || users.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">なし</td></tr>'; return; }
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="p-4 text-xs">${user.uid}</td><td class="p-4 font-bold">${user.displayName}</td><td class="p-4">${user.email}</td><td class="p-4">${user.role}</td><td class="p-4 text-right"><button class="ban-user-btn text-red-500 font-bold text-sm" data-uid="${user.uid}">削除</button></td>`;
            tbody.appendChild(tr);
        });
    }

    // --- ★追加: レポート（リンク切れ）一覧 ---
    static renderReportsList(reports) {
        const container = document.getElementById('reports-list-container');
        if(!container) return;
        container.innerHTML = '';
        if(!reports || reports.length === 0) {
            container.innerHTML = '<p class="text-gray-500 p-4">問題のある画像はありません。</p>';
            return;
        }
        reports.forEach(report => {
            const div = document.createElement('div');
            // JSON文字列にする際にクォートをエスケープ
            const reportJson = JSON.stringify(report).replace(/"/g, '&quot;');
            
            div.className = 'bg-white p-4 rounded shadow border-l-4 border-red-500 flex flex-col md:flex-row items-center justify-between gap-4';
            div.innerHTML = `
                <div class="flex-grow">
                    <p class="font-bold text-red-600 flex items-center gap-2">
                        <span class="text-xl">⚠️</span> リンク切れ (Status: ${report.status})
                    </p>
                    <p class="font-bold text-lg">${report.spotName} <span class="text-sm font-normal text-gray-500">(${report.prefecture})</span></p>
                    <a href="${report.imageUrl}" target="_blank" class="text-xs text-blue-500 underline truncate max-w-xs block mt-1">${report.imageUrl}</a>
                </div>
                <div class="flex gap-2">
                    <button class="find-image-btn bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 font-bold text-sm" data-json="${reportJson}">画像を探す</button>
                    <button class="dismiss-report-btn bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 font-bold text-sm" data-id="${report.id}">無視</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // --- ★追加: 画像候補リスト ---
    static renderImageCandidates(candidates) {
        const list = document.getElementById('image-candidate-list');
        if(!list) return;
        list.innerHTML = '';
        if(candidates.length === 0) {
            list.innerHTML = '<p class="text-center w-full col-span-3 text-gray-500 py-4">候補が見つかりませんでした。</p>';
            return;
        }
        candidates.forEach(img => {
            const div = document.createElement('div');
            div.className = 'candidate-image cursor-pointer border-4 border-transparent hover:border-blue-500 rounded overflow-hidden relative group';
            div.innerHTML = `
                <img src="${img.link}" class="w-full h-40 object-cover bg-gray-100">
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition"></div>
            `;
            div.onclick = () => {
                document.querySelectorAll('.candidate-image').forEach(el => el.classList.remove('border-blue-500'));
                div.classList.add('border-blue-500');
                const confirmBtn = document.getElementById('image-candidate-confirm-btn');
                confirmBtn.dataset.url = img.link;
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            };
            list.appendChild(div);
        });
    }

    static toggleEditModal(isVisible, spotData=null) {
        const modal = document.getElementById('admin-edit-modal');
        if(isVisible && spotData) {
            document.getElementById('edit-spot-id').value = spotData.id || '';
            document.getElementById('edit-spot-name').value = spotData.name;
            document.getElementById('edit-spot-pref').innerHTML = `<option value="${spotData.prefecture}">${spotData.prefecture}</option>`;
            document.getElementById('edit-spot-area').value = spotData.area || '';
            document.getElementById('edit-spot-category').value = spotData.category;
            document.getElementById('edit-spot-image').value = spotData.image || '';
            document.getElementById('edit-spot-desc').value = spotData.description || '';
        }
        if(modal) {
            modal.classList.toggle('visible', isVisible);
            modal.style.display = isVisible ? 'flex' : 'none';
        }
    }

    // ★追加: 画像候補モーダル
    static toggleImageModal(isVisible) {
        const modal = document.getElementById('image-candidate-overlay');
        if(modal) modal.style.display = isVisible ? 'flex' : 'none';
    }
}