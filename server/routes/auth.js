const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const UserModel = require('../models/userModel');

// ディレクトリ設定 (画像保存用)
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/avatars');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 画像の保存設定 (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uid = req.body.uid || 'unknown';
        cb(null, `${uid}_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage: storage });

// --- API ルート ---

// ログイン
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findByEmail(email);

        if (!user) {
            return res.status(401).json({ error: "メールアドレスまたはパスワードが間違っています" });
        }

        const isValid = await UserModel.verifyPassword(user, password);
        if (isValid) {
            const { password_hash, ...safeUser } = user;
            safeUser.isAdmin = !!safeUser.isAdmin;
            safeUser.lastLoginAt = new Date().toISOString(); // DBには保存していないがレスポンスには含める
            res.json({ success: true, user: safeUser });
        } else {
            res.status(401).json({ error: "メールアドレスまたはパスワードが間違っています" });
        }
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: "ログイン処理中にエラーが発生しました" });
    }
});

// 新規登録
router.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        
        const existing = await UserModel.findByEmail(email);
        if (existing) {
            return res.status(400).json({ error: "このメールアドレスは既に登録されています" });
        }

        const newUser = await UserModel.create(email, password, displayName);
        res.json({ success: true, user: newUser });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ error: "登録処理中にエラーが発生しました" });
    }
});

// プロフィール更新 (画像対応)
router.post('/update', upload.single('avatarFile'), async (req, res) => {
    try {
        const { uid, displayName, email } = req.body;
        
        const updateData = {};
        if (displayName) updateData.displayName = displayName;
        if (email) updateData.email = email;
        
        // 画像が送られてきた場合、パスを保存
        if (req.file) {
            updateData.photoURL = `/uploads/avatars/${req.file.filename}`;
        }

        const updatedUser = await UserModel.update(uid, updateData);
        
        if (updatedUser) {
            const { password_hash, ...safeUser } = updatedUser;
            safeUser.isAdmin = !!safeUser.isAdmin;
            res.json({ success: true, user: safeUser });
        } else {
            res.status(500).json({ error: "ユーザー情報の更新に失敗しました" });
        }
    } catch (e) {
        console.error("Update Error:", e);
        res.status(500).json({ error: "更新処理中にエラーが発生しました" });
    }
});

module.exports = router;