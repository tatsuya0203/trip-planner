// public/js/modules/auth.js
import { Api } from '../services/api.js'; 

export class Auth {
    constructor() {
        this.currentUser = null;
        this.isLoginMode = true;
    }

    // 初期化: ブラウザに保存されたログイン情報を復元
    init(callback) {
        console.log("Auth module initialized");
        const savedUser = localStorage.getItem('trip_planner_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                console.log("Restored session:", this.currentUser.email);
            } catch (e) {
                console.error("Session restore failed", e);
                localStorage.removeItem('trip_planner_user');
            }
        }
        if (callback) callback(this.currentUser);
    }

    isLoggedIn() { return !!this.currentUser; }

    toggleMode() {
        this.isLoginMode = !this.isLoginMode;
        return this.isLoginMode;
    }

    // 自作サーバーへログイン
    async login(email, password) {
        try {
            const res = await Api.post('/api/auth/login', { email, password });
            this._setUser(res.user);
            return res.user;
        } catch (e) {
            throw new Error(e.message || "ログインに失敗しました");
        }
    }

    // 自作サーバーへ登録
    async register(email, password, displayName) {
        try {
            const res = await Api.post('/api/auth/register', { email, password, displayName });
            this._setUser(res.user);
            return res.user;
        } catch (e) {
            throw new Error(e.message || "登録に失敗しました");
        }
    }
    
    // ゲストログイン (簡易)
    async loginAsGuest() {
        const guestUser = {
            uid: 'guest_' + Date.now(),
            displayName: 'ゲストユーザー',
            email: 'guest@example.com',
            isGuest: true,
            favorites: []
        };
        this._setUser(guestUser);
        return guestUser;
    }

    async logout() {
        this.currentUser = null;
        localStorage.removeItem('trip_planner_user');
        location.reload(); 
    }

    // 内部用: ユーザー情報を保存
    _setUser(user) {
        this.currentUser = user;
        localStorage.setItem('trip_planner_user', JSON.stringify(user));
    }
}