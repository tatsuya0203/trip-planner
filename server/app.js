const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // 画像アップロード用

// アプリケーション作成
const app = express();
const PORT = 3010;

// ミドルウェア設定
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 画像アップロード設定 (プロフィール用) ---
// public/uploads フォルダがない場合は作成
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // ファイル名をユニークにする (uid_timestamp.png)
        const uid = req.body.uid || 'unknown';
        cb(null, `${uid}_${Date.now()}.png`);
    }
});
const upload = multer({ storage: storage });

// --- ルーティングの読み込み ---
// APIルート
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// Auth用ルート
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// 管理者用ルート (もしあれば)
// const adminRouter = require('./routes/admin');
// app.use('/api/admin', adminRouter);

// 静的ファイルの配信 (publicフォルダ)
app.use(express.static(path.join(__dirname, '../public')));

// その他のリクエストはindex.htmlを返す (SPA対応)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// サーバー起動
app.listen(PORT, () => {
    console.log("=========================================");
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`✅ API routes loaded: /api`);
    console.log("=========================================");
});