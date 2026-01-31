const db = require('../db');
const bcrypt = require('bcrypt');

class UserModel {
    static async create(email, password, displayName) {
        const hash = await bcrypt.hash(password, 10);
        const uid = email.replace(/[@.]/g, '_');
        const isAdmin = email.startsWith('admin') ? 1 : 0;
        
        const stmt = db.prepare('INSERT INTO users (uid, email, displayName, password_hash, isAdmin, photoURL) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(uid, email, displayName || '名無し', hash, isAdmin, '');
        
        return { uid, email, displayName, isAdmin: !!isAdmin, photoURL: '' };
    }

    static async findByEmail(email) {
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email);
    }
    
    static async findByUid(uid) {
        const stmt = db.prepare('SELECT * FROM users WHERE uid = ?');
        return stmt.get(uid);
    }

    static async update(uid, data) {
        // data: { displayName, email, photoURL }
        // 存在するフィールドだけ更新する動的クエリ
        const fields = [];
        const values = [];
        
        if (data.displayName !== undefined) {
            fields.push('displayName = ?');
            values.push(data.displayName);
        }
        if (data.email !== undefined) {
            fields.push('email = ?');
            values.push(data.email);
        }
        if (data.photoURL !== undefined) {
            fields.push('photoURL = ?');
            values.push(data.photoURL);
        }
        
        if (fields.length === 0) return null;
        
        values.push(uid);
        const sql = `UPDATE users SET ${fields.join(', ')} WHERE uid = ?`;
        
        const stmt = db.prepare(sql);
        const info = stmt.run(...values);
        
        if (info.changes > 0) {
             return await this.findByUid(uid);
        }
        return null;
    }

    static async verifyPassword(user, password) {
        return await bcrypt.compare(password, user.password_hash);
    }
}

module.exports = UserModel;