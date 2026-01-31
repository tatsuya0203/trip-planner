// server/models/planModel.js
const db = require('../db');

class PlanModel {
    static create(uid, spotName, prefecture) {
        const check = db.prepare('SELECT id FROM plans WHERE uid = ? AND spotName = ?');
        if (check.get(uid, spotName)) return;

        const stmt = db.prepare('INSERT INTO plans (uid, spotName, prefecture) VALUES (?, ?, ?)');
        return stmt.run(uid, spotName, prefecture || '不明');
    }

    static findByUid(uid) {
        // id順（登録順）に取得
        const stmt = db.prepare('SELECT * FROM plans WHERE uid = ? ORDER BY id ASC');
        return stmt.all(uid);
    }

    static remove(uid, spotName) {
        const stmt = db.prepare('DELETE FROM plans WHERE uid = ? AND spotName = ?');
        return stmt.run(uid, spotName);
    }

    static removeAll(uid) {
        const stmt = db.prepare('DELETE FROM plans WHERE uid = ?');
        return stmt.run(uid);
    }

    // ★追加: プランの上書き（並び替え保存用）
    static overwrite(uid, newPlans) {
        // トランザクション（全部消して全部入れるのを一気にやる）
        const transaction = db.transaction((targetUid, plans) => {
            // 1. 全部消す
            db.prepare('DELETE FROM plans WHERE uid = ?').run(targetUid);
            
            // 2. 新しい順序で入れ直す
            const insert = db.prepare('INSERT INTO plans (uid, spotName, prefecture) VALUES (?, ?, ?)');
            for (const plan of plans) {
                insert.run(targetUid, plan.spotName, plan.prefecture);
            }
        });
        
        return transaction(uid, newPlans);
    }
}

module.exports = PlanModel;