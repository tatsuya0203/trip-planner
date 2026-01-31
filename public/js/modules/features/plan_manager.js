// public/js/modules/plan_manager.js
import { Api } from '../services/api.js';

export class PlanManager {
    constructor() {
        this.plans = [];
        this.currentSlot = 1; 
        this.history = [];
    }

    setSlot(slot) {
        this.currentSlot = slot;
    }

    async load(uid) {
        try {
            this.plans = await Api.get(`/api/users/${uid}/plans?slot=${this.currentSlot}`);
            if (!Array.isArray(this.plans)) this.plans = [];
            
            this.history = await Api.get(`/api/users/${uid}/history`);
            if (!Array.isArray(this.history)) this.history = [];

            return this.plans;
        } catch (e) {
            console.error("Plan load error:", e);
            this.plans = [];
            return [];
        }
    }

    getPlans() {
        return this.plans;
    }

    getHistory() {
        return this.history;
    }

    // スポット追加（座標などの詳細データも保存するよう改良）
    async add(uid, spotName, prefecture, day = 1, spotData = null) {
        // 重複チェック
        if (this.plans.some(p => p.spotName === spotName)) {
            return { status: 'exists' }; 
        }

        if (spotData) {
            await this.addToHistory(uid, spotData);
        }

        // 県またぎチェック
        const lastSpot = this.plans[this.plans.length - 1];
        if (lastSpot && lastSpot.prefecture !== prefecture) {
            return { 
                status: 'cross_prefecture', 
                lastPref: lastSpot.prefecture, 
                newPref: prefecture,
                day: day
            };
        }

        return await this._executeAdd(uid, spotName, prefecture, day, spotData);
    }

    async addToHistory(uid, spotData) {
        try {
            const minimalData = {
                name: spotData.name || spotData.spotName,
                prefecture: spotData.prefecture || '',
                image: spotData.image,
                lat: spotData.lat, // 座標も履歴に残す
                lng: spotData.lng,
                url: spotData.url,
                tags: spotData.tags || []
            };
            const res = await Api.post(`/api/users/${uid}/history`, { spot: minimalData });
            if (res.success) this.history = res.history;
        } catch (e) { console.error("History save error", e); }
    }

    // ★修正: 詳細データ(spotData)があれば、それもプランに統合して保存
    async _executeAdd(uid, spotName, prefecture, day = 1, spotData = null) {
        const newSpot = { 
            spotName, 
            prefecture, 
            day: day,
            // 座標やURLがあれば保存（ルート計算の精度向上）
            lat: spotData?.lat,
            lng: spotData?.lng,
            url: spotData?.url,
            category: spotData?.category
        };
        
        this.plans.push(newSpot);
        await this.save(uid);
        return { status: 'success' };
    }

    async updateAll(uid, newPlans) {
        this.plans = newPlans;
        await this.save(uid);
    }

    async remove(uid, spotName) {
        this.plans = this.plans.filter(p => p.spotName !== spotName);
        await this.save(uid);
    }

    async reorder(uid, newOrder) {
        // 並び替え時も既存の詳細データを維持する
        this.plans = newOrder.map(p => {
            const original = this.plans.find(old => old.spotName === p.spotName);
            return { ...original, ...p }; // dayや順序は新しいもの、詳細は元のもの
        });
        await this.save(uid);
    }

    async clear(uid) {
        this.plans = [];
        await this.save(uid);
    }

    async save(uid) {
        try {
            await Api.post(`/api/users/${uid}/plans`, { 
                plans: this.plans,
                slot: this.currentSlot 
            });
        } catch (e) {
            console.error("Save failed:", e);
        }
    }
}