// server/routes/admin.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // ※Node 18以上なら不要ですが、エラーが出る場合は npm install node-fetch が必要

// ★ .env の変数名に合わせています
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_ID;

// パス設定
const DATA_DIR = path.join(__dirname, '../../data');
const PREF_DIR = path.join(DATA_DIR, 'prefecture');
const PENDING_FILE = path.join(DATA_DIR, 'pending_spots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json'); // レポート保存用

// 初期化
if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, '[]');

// ヘルパー関数
const readJson = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
};
const writeJson = (filePath, data) => {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); return true; } catch (e) { return false; }
};

const getPrefectureFilePath = (prefName) => {
    if (!fs.existsSync(PREF_DIR)) return null;
    const files = fs.readdirSync(PREF_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const filePath = path.join(PREF_DIR, file);
        const data = readJson(filePath);
        if (data && data.name === prefName) return filePath;
    }
    return null;
};

const getAllSpots = () => {
    if (!fs.existsSync(PREF_DIR)) return [];
    const files = fs.readdirSync(PREF_DIR).filter(f => f.endsWith('.json'));
    let allSpots = [];
    files.forEach(file => {
        const data = readJson(path.join(PREF_DIR, file));
        if (data && data.spots) {
            allSpots = allSpots.concat(data.spots.map(s => ({ ...s, prefecture: s.prefecture || data.name })));
        }
    });
    return allSpots;
};

// --- API ---

router.get('/stats', (req, res) => {
    const allSpots = getAllSpots();
    const pendingSpots = readJson(PENDING_FILE) || [];
    const reports = readJson(REPORTS_FILE) || [];
    const users = readJson(USERS_FILE) || [];
    res.json({ totalSpots: allSpots.length, pendingSpots: pendingSpots.length, totalUsers: users.length, reports: reports.length });
});

router.get('/spots/pending', (req, res) => { res.json(readJson(PENDING_FILE) || []); });
router.get('/spots/all', (req, res) => { res.json(getAllSpots()); });
router.get('/users', (req, res) => { res.json(readJson(USERS_FILE) || []); });
router.get('/reports', (req, res) => { res.json(readJson(REPORTS_FILE) || []); });

// --- ★追加機能: 画像リンク切れチェック ---
router.post('/utils/check-images', async (req, res) => {
    const allSpots = getAllSpots();
    let brokenSpots = [];
    console.log(`Checking images for ${allSpots.length} spots...`);

    // 全部チェックすると時間がかかるので、Node.jsでは非同期で並列処理しつつ、多すぎないように制御
    // ここでは簡易的に直列チェックに近い形にします
    for (const spot of allSpots) {
        if (!spot.image) continue;
        try {
            // HEADリクエストで存在確認
            const response = await fetch(spot.image, { method: 'HEAD', timeout: 5000 });
            if (!response.ok) {
                brokenSpots.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(7),
                    spotId: spot.id,
                    spotName: spot.name,
                    prefecture: spot.prefecture,
                    imageUrl: spot.image,
                    status: response.status
                });
            }
        } catch (e) {
            brokenSpots.push({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                spotId: spot.id,
                spotName: spot.name,
                prefecture: spot.prefecture,
                imageUrl: spot.image,
                status: 'ERROR'
            });
        }
    }
    
    // 既存のレポートに追記ではなく、今回は「洗い替え」にします（重複防止のため）
    writeJson(REPORTS_FILE, brokenSpots);
    res.json({ message: `${brokenSpots.length} 件のリンク切れが見つかりました`, count: brokenSpots.length });
});

// --- ★追加機能: Google画像検索 ---
router.get('/utils/search-images', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "Query is required" });
    
    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        return res.json([{ link: "https://placehold.co/600x400?text=API+Key+Missing" }]);
    }

    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=6`;
        const googleRes = await fetch(url);
        const data = await googleRes.json();
        
        if (data.items) {
            res.json(data.items);
        } else {
            console.log("No items found", data);
            res.json([]);
        }
    } catch (e) {
        console.error("Google Search Error:", e);
        res.status(500).json({ error: "Search failed" });
    }
});

// --- ★追加機能: レポート解決（画像更新） ---
router.post('/reports/:id/resolve', (req, res) => {
    const { newImageUrl } = req.body;
    const reports = readJson(REPORTS_FILE) || [];
    const reportIndex = reports.findIndex(r => r.id === req.params.id);
    
    if (reportIndex === -1) return res.status(404).json({ error: "Report not found" });
    const report = reports[reportIndex];

    const prefPath = getPrefectureFilePath(report.prefecture);
    if (!prefPath) return res.status(400).json({ error: "Prefecture file not found" });

    const prefData = readJson(prefPath);
    const spotIndex = prefData.spots.findIndex(s => s.name === report.spotName);

    if (spotIndex !== -1) {
        prefData.spots[spotIndex].image = newImageUrl;
        writeJson(prefPath, prefData);
        
        reports.splice(reportIndex, 1); // レポート削除
        writeJson(REPORTS_FILE, reports);
        
        res.json({ success: true, message: "画像を更新しました" });
    } else {
        res.status(404).json({ error: "Spot not found" });
    }
});

router.delete('/reports/:id', (req, res) => {
    let reports = readJson(REPORTS_FILE) || [];
    reports = reports.filter(r => r.id !== req.params.id);
    writeJson(REPORTS_FILE, reports);
    res.json({ success: true });
});

// --- 既存アクション ---
router.post('/spots/:id/approve', (req, res) => {
    const pendingList = readJson(PENDING_FILE) || [];
    const idx = pendingList.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const spot = pendingList[idx];
    const prefPath = getPrefectureFilePath(spot.prefecture);
    if (!prefPath) return res.status(400).json({ error: "Invalid prefecture" });
    const prefData = readJson(prefPath);
    if (!prefData.spots) prefData.spots = [];
    prefData.spots.push(spot);
    writeJson(prefPath, prefData);
    pendingList.splice(idx, 1);
    writeJson(PENDING_FILE, pendingList);
    res.json({ success: true });
});

router.delete('/spots/:id/reject', (req, res) => {
    let list = readJson(PENDING_FILE) || [];
    list = list.filter(s => s.id !== req.params.id);
    writeJson(PENDING_FILE, list);
    res.json({ success: true });
});

router.put('/spots/:id', (req, res) => {
    const id = req.params.id;
    const updateData = req.body;
    const prefPath = getPrefectureFilePath(updateData.prefecture);
    if (!prefPath) return res.status(400).json({ error: "Invalid prefecture" });
    const prefData = readJson(prefPath);
    
    // IDまたは名前で検索
    let idx = prefData.spots.findIndex(s => s.id === id);
    if (idx === -1) idx = prefData.spots.findIndex(s => s.name === updateData.name);

    if (idx !== -1) {
        prefData.spots[idx] = { ...prefData.spots[idx], ...updateData };
        writeJson(prefPath, prefData);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Spot not found" });
    }
});

router.delete('/spots/:id', (req, res) => {
    const files = fs.readdirSync(PREF_DIR).filter(f => f.endsWith('.json'));
    let deleted = false;
    files.forEach(file => {
        if(deleted) return;
        const p = path.join(PREF_DIR, file);
        const d = readJson(p);
        if(d && d.spots) {
            const len = d.spots.length;
            d.spots = d.spots.filter(s => s.id !== req.params.id);
            if(d.spots.length !== len) { writeJson(p, d); deleted = true; }
        }
    });
    if(deleted) res.json({ success: true }); else res.status(404).json({ error: "Not found" });
});

router.delete('/users/:uid', (req, res) => {
    let users = readJson(USERS_FILE) || [];
    const newUsers = users.filter(u => u.uid !== req.params.uid);
    writeJson(USERS_FILE, newUsers);
    res.json({ success: true });
});

module.exports = router;