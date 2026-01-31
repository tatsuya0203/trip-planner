// check_models.js
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ APIキーが .env にありません");
    process.exit(1);
}

async function listModels() {
    console.log("Googleのサーバーに問い合わせ中...");
    
    // SDKを使わず直接Web APIを叩く
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ APIエラー:", data.error.message);
            return;
        }

        if (!data.models) {
            console.log("モデルが見つかりませんでした。");
            return;
        }

        console.log("\n=== あなたが使えるモデル一覧 ===");
        let found = false;
        data.models.forEach(model => {
            // 文章生成(generateContent)に対応しているモデルのみ表示
            if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes("generateContent")) {
                // "models/gemini-pro" -> "gemini-pro"
                console.log(`✅ ${model.name.replace("models/", "")}`);
                found = true;
            }
        });
        
        if (!found) {
            console.log("（generateContentに対応したモデルがありませんでした）");
        }
        console.log("===========================\n");
        console.log("↑このリストにある名前を api.js の 'gemini-1.5-flash' の部分に書き込んでください。");

    } catch (error) {
        console.error("通信エラー:", error);
    }
}

listModels();