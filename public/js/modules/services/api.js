// public/js/modules/api.js
export class Api {
    static async get(endpoint) {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`GET Error: ${res.status}`);
        return await res.json();
    }

    static async post(endpoint, body) {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "POST Error");
        return data;
    }

    // ★追加: 上書き保存用 (PUT)
    static async put(endpoint, body) {
        const res = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "PUT Error");
        return data;
    }

    static async delete(endpoint) {
        const res = await fetch(endpoint, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "DELETE Error");
        return data;
    }
}