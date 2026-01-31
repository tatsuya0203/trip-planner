const Database = require('better-sqlite3');
const path = require('path');

// プロジェクトのルートにある plans.db を参照するようにパスを調整
const dbPath = path.join(__dirname, '../plans.db');
const db = new Database(dbPath);

// テーブル初期化
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY, 
    email TEXT UNIQUE, 
    displayName TEXT, 
    password_hash TEXT,
    isAdmin INTEGER,
    photoURL TEXT
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT, 
    spotName TEXT,
    prefecture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 既存のusersテーブルにphotoURLカラムがない場合のマイグレーション
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasPhotoURL = tableInfo.some(col => col.name === 'photoURL');
  if (!hasPhotoURL) {
    db.exec("ALTER TABLE users ADD COLUMN photoURL TEXT");
  }
} catch (e) {
  console.error("Migration error:", e);
}

module.exports = db;