// public/js/modules/utils.js
import { PREF_CENTERS, SPEED } from '../core/constants.js';

/** 直線距離計算 (km) - ハバーシン公式 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/** プラン全体の移動時間を計算 */
export function calculateTravelTimes(planSpots, allSpots, travelModes = {}) {
    const times = [];
    for (let i = 0; i < planSpots.length - 1; i++) {
        const s1 = planSpots[i], s2 = planSpots[i+1];
        const d1 = allSpots.find(s => s.name === s1.spotName), d2 = allSpots.find(s => s.name === s2.spotName);
        
        let p1 = (s1.lat && s1.lng) ? s1 : (d1?.lat ? d1 : (PREF_CENTERS[s1.prefecture] || null));
        let p2 = (s2.lat && s2.lng) ? s2 : (d2?.lat ? d2 : (PREF_CENTERS[s2.prefecture] || null));

        const mode = travelModes[i] || 'car';
        const currentSpeed = (mode === 'walk') ? SPEED.WALK : SPEED.CAR;

        if (p1 && p2) {
            const dist = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            let min = Math.round((dist * 1.4 / currentSpeed) * 60);
            times.push({ minutes: min < 5 ? 5 : min, mode: mode });
        } else {
            times.push({ minutes: (s1.prefecture === s2.prefecture ? 15 : 60), mode: mode });
        }
    }
    return times;
}