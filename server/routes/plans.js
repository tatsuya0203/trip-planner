// server/routes/plans.js
const express = require('express');
const router = express.Router();
const PlanModel = require('../models/planModel');

// プラン保存
router.post('/', (req, res) => {
    try {
        const { uid, spotName, prefecture } = req.body;
        if (!uid || !spotName) return res.status(400).json({ error: "情報不足" });
        PlanModel.create(uid, spotName, prefecture);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// プラン取得
router.get('/:uid', (req, res) => {
    try {
        const plans = PlanModel.findByUid(req.params.uid);
        res.json({ spots: plans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1つ削除
router.delete('/:uid/:spotName', (req, res) => {
    try {
        PlanModel.remove(req.params.uid, req.params.spotName);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 全削除
router.delete('/:uid', (req, res) => {
    try {
        PlanModel.removeAll(req.params.uid);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ★追加: 並び替え保存 (PUTメソッド)
router.put('/:uid', (req, res) => {
    try {
        const { plans } = req.body; // 新しい順序のリスト
        if (!Array.isArray(plans)) return res.status(400).json({ error: "データ形式が不正です" });
        
        PlanModel.overwrite(req.params.uid, plans);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;