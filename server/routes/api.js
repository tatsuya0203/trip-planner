// server/routes/api.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

// --- ヘルパー関数 ---
const readJson = (filePath) => { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return []; } };
const writeJson = (filePath, data) => { try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); return true; } catch (e) { return false; } };
const isAdmin = (email) => { const admins = readJson(ADMINS_FILE); return Array.isArray(admins) && admins.includes(email); };

// --- マスタデータ ---
router.get('/prefectures', (req, res) => {
    try {
        const files = fs.readdirSync(path.join(DATA_DIR, 'prefecture')).filter(f => f.endsWith('.json'));
        const prefs = files.map(f => { const data = readJson(path.join(DATA_DIR, 'prefecture', f)); return { id: data.id, name: data.name }; });
        res.json(prefs);
    } catch(e) { res.json([]); }
});

router.get('/data/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, 'prefecture', `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
    res.json(readJson(filePath));
});

// --- プラン保存・取得 ---
router.get('/users/:uid/plans', (req, res) => {
    const { slot } = req.query;
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.uid === req.params.uid);
    const slotKey = slot ? `plans_${slot}` : 'plans';
    res.json(user?.[slotKey] || []);
});

router.post('/users/:uid/plans', (req, res) => {
    const { plans, slot } = req.body;
    const users = readJson(USERS_FILE);
    const index = users.findIndex(u => u.uid === req.params.uid);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    const slotKey = slot ? `plans_${slot}` : 'plans';
    users[index][slotKey] = plans;
    writeJson(USERS_FILE, users);
    res.json({ success: true, plans: users[index][slotKey] });
});

// --- 設定保存 ---
router.post('/user/plan-settings', (req, res) => {
    const { uid, settings, slot } = req.body;
    const users = readJson(USERS_FILE);
    const index = users.findIndex(u => u.uid === uid);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    const key = slot ? `settings_${slot}` : 'planSettings';
    users[index][key] = settings;
    writeJson(USERS_FILE, users);
    res.json({ success: true });
});

router.get('/user/plan-settings/:uid', (req, res) => {
    const { slot } = req.query;
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.uid === req.params.uid);
    const key = slot ? `settings_${slot}` : 'planSettings';
    res.json({ success: true, settings: user?.[key] || {} });
});

// --- お気に入り ---
router.get('/users/:uid/favorites', (req, res) => {
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.uid === req.params.uid);
    res.json(user?.favorites || []);
});

router.post('/users/:uid/favorites', (req, res) => {
    const { spotName, action } = req.body;
    const users = readJson(USERS_FILE);
    const index = users.findIndex(u => u.uid === req.params.uid);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    if (!users[index].favorites) users[index].favorites = [];
    if (action === 'add') { if (!users[index].favorites.includes(spotName)) users[index].favorites.push(spotName); } 
    else { users[index].favorites = users[index].favorites.filter(f => f !== spotName); }
    writeJson(USERS_FILE, users);
    res.json({ success: true, favorites: users[index].favorites });
});

// --- 履歴 ---
router.get('/users/:uid/history', (req, res) => {
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.uid === req.params.uid);
    res.json(user?.history || []);
});

router.post('/users/:uid/history', (req, res) => {
    const { spot } = req.body;
    const users = readJson(USERS_FILE);
    const index = users.findIndex(u => u.uid === req.params.uid);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    if (!users[index].history) users[index].history = [];
    users[index].history = users[index].history.filter(h => h.name !== spot.name);
    users[index].history.unshift(spot);
    if (users[index].history.length > 10) users[index].history = users[index].history.slice(0, 10);
    writeJson(USERS_FILE, users);
    res.json({ success: true, history: users[index].history });
});

router.post('/suggest', (req, res) => { res.json({ message: "受信しました" }); });

// --- 天気 ---
router.get('/weather', async (req, res) => {
    const { lat, lon, date } = req.query;
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: "No API Key" });
    try {
        const target = new Date(date); const today = new Date();
        const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
        let data = null, isForecast = false;
        if (diffDays >= 0 && diffDays <= 5) {
            const r = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=ja&appid=${API_KEY}`);
            data = r.data.list.find(i => i.dt_txt.startsWith(date) && i.dt_txt.includes("12:00"));
            if (data) isForecast = true;
        }
        if (!data) {
            const r = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=ja&appid=${API_KEY}`);
            data = r.data; data.weather = r.data.weather; data.main = r.data.main;
        }
        res.json({ success: true, isForecast, temp: Math.round(data.main.temp), description: data.weather[0].description, icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`, cityName: data.name });
    } catch (e) { res.json({ success: false }); }
});

// --- ホテル検索 (日本語・日本限定) ---
router.post('/search-hotels', async (req, res) => {
    const targetLocation = req.body.locationName || req.body.spotName;
    const { people, budget } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_KEY) return res.status(500).json({ error: "Gemini Key missing" });
    if (!targetLocation) return res.status(400).json({ error: "場所が指定されていません" });

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_KEY);
        // 安定版モデル
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        const prompt = `
        場所「${targetLocation}」の周辺にあるホテルを3つ提案してください。
        
        重要条件:
        1. 検索対象は**日本国内**の施設を優先してください。
        2. 名称や説明はすべて**日本語**で出力してください。
        3. 条件: 大人${people}人、1泊予算${budget}円以内。
        
        出力は以下のJSON配列形式のみにしてください。Markdown記法(code block)は含めないでください。
        [{"name":"ホテル名","price":"約○○円","description":"説明(50文字)","url":"https://www.google.com/search?q=ホテル名"}]`;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json({ success: true, hotels: JSON.parse(text) });
    } catch (e) { 
        console.error("Gemini Error:", e);
        res.status(500).json({ error: "検索失敗" }); 
    }
});

// --- ★修正: ルート計算 (座標対応版) ---
router.post('/calculate-route', async (req, res) => {
    try {
        const { uid, spots } = req.body;
        const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
        if (!API_KEY) return res.status(500).json({ error: "API Key missing" });
        if (!spots || spots.length < 2) return res.status(400).json({ error: "スポット不足" });

        const users = readJson(USERS_FILE);
        const user = users.find(u => u.uid === uid);
        const isUserAdmin = isAdmin(user?.email);
        const today = new Date().toISOString().split('T')[0];
        
        if (!user.apiUsage || user.apiUsage.date !== today) user.apiUsage = { date: today, count: 0 };
        if (!isUserAdmin && user.apiUsage.count >= 10) return res.status(429).json({ error: "制限超過" });

        // ★座標があれば座標を、なければ住所を使うヘルパー
        const getLoc = (s) => {
            if (s.lat && s.lng) return `${s.lat},${s.lng}`;
            return encodeURIComponent(`${s.spotName} ${s.prefecture || ''}`);
        };

        const origin = getLoc(spots[0]);
        const destination = getLoc(spots[spots.length - 1]);
        
        let waypoints = "";
        if (spots.length > 2) {
            const list = spots.slice(1, -1).map(s => getLoc(s));
            // Google Maps APIのwaypoints形式 (座標ならそのままパイプ結合)
            waypoints = `&waypoints=${list.join('|')}`;
        }

        // ※座標を使う場合、encodeURIComponentは不要な場合もあるが、安全のためURL全体としては注意
        // ここではgetLocが既に必要な形式を返している前提
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypoints}&mode=driving&language=ja&key=${API_KEY}`;
        
        const gRes = await axios.get(url);
        
        if (gRes.data.status === 'ZERO_RESULTS') return res.json({ success: false, message: "ルート計算不可 (海路等)" });
        if (gRes.data.status !== 'OK') throw new Error(gRes.data.status);

        const results = gRes.data.routes[0].legs.map(leg => ({ minutes: Math.round(leg.duration.value/60), mode: 'car' }));
        if (!isUserAdmin) { user.apiUsage.count++; writeJson(USERS_FILE, users); }
        res.json({ success: true, routes: results, message: "計算完了" });
    } catch(e) { 
        console.error("Route Calc Error:", e);
        res.status(500).json({ error: "計算エラー" }); 
    }
});

module.exports = router;