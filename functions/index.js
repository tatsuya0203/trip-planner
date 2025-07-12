/**
 * VLOG旅プランナー バックエンド処理 (Firebase Cloud Functions)
 * 第2世代 (V2) 完全対応版
 */

// V2用のモジュールをインポート
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineString } = require('firebase-functions/params');

const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cors = require('cors')({origin: true});
const crypto = require("crypto");
const Papa = require("papaparse");

// 全ての関数のデフォルトリージョンを設定
setGlobalOptions({ region: "asia-northeast1" });

admin.initializeApp();

// --- 環境変数の読み込み (V2の正しい方法) ---
const GEMINI_API_KEY = defineString("GEMINI_KEY");
const GOOGLE_SEARCH_KEY = defineString("GOOGLE_SEARCH_KEY");
const GOOGLE_SEARCH_ID = defineString("GOOGLE_SEARCH_ID");
const GITHUB_TOKEN = defineString("GITHUB_TOKEN");
const GITHUB_OWNER = defineString("GITHUB_OWNER");
const GITHUB_REPO = defineString("GITHUB_REPO");
const GITHUB_BRANCH = defineString("GITHUB_BRANCH");
const OPENWEATHER_KEY = defineString("OPENWEATHER_KEY");


// --- GitHub API ヘルパー関数 ---
async function getGitHubFile(filePath) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER.value()}/${GITHUB_REPO.value()}/contents/${filePath}?ref=${GITHUB_BRANCH.value()}`;
    const response = await fetch(url, {
        headers: {
            "Authorization": `token ${GITHUB_TOKEN.value()}`,
            "Accept": "application/vnd.github.v3+json",
        },
    });
    if (!response.ok) {
        throw new HttpsError("not-found", `GitHubからファイルを取得できませんでした: ${filePath}`);
    }
    const data = await response.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content: JSON.parse(content), sha: data.sha };
}

async function updateGitHubFile(filePath, newContent, sha, commitMessage) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER.value()}/${GITHUB_REPO.value()}/contents/${filePath}`;
    const contentEncoded = Buffer.from(JSON.stringify(newContent, null, 2)).toString("base64");

    const response = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `token ${GITHUB_TOKEN.value()}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: commitMessage,
            content: contentEncoded,
            sha: sha,
            branch: GITHUB_BRANCH.value(),
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("GitHub File Update Error:", errorData);
        throw new HttpsError("internal", "GitHubファイルの更新に失敗しました。");
    }
    return await response.json();
}

async function getPrefectureIdMap() {
    const url = `https://api.github.com/repos/${GITHUB_OWNER.value()}/${GITHUB_REPO.value()}/contents/data?ref=${GITHUB_BRANCH.value()}`;
    try {
        const response = await fetch(url, {
            headers: { "Authorization": `token ${GITHUB_TOKEN.value()}`, "Accept": "application/vnd.github.v3+json" },
        });
        if (!response.ok) {
            console.error("Failed to get prefecture list from GitHub for map creation. Falling back to default.");
            return { '東京都': 'tokyo', '大阪府': 'osaka' };
        }
        const files = await response.json();
        const jsonFiles = Array.isArray(files) ? files.filter(file => file.name.endsWith('.json')) : [];

        const map = {};
        await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const fileData = await getGitHubFile(`data/${file.name}`);
                    const id = file.name.replace('.json', '');
                    const name = fileData.content.name;
                    if (name && id) {
                        map[name] = id;
                    }
                } catch (e) {
                    console.error(`Error processing file ${file.name} for map:`, e);
                }
            })
        );
        return Object.keys(map).length > 0 ? map : { '東京都': 'tokyo', '大阪府': 'osaka' };
    } catch (error) {
        console.error("Error in getPrefectureIdMap:", error);
        return { '東京都': 'tokyo', '大阪府': 'osaka' };
    }
}

// --- AI関数 (V2形式) ---
exports.analyzeSpotSuggestion = onCall(async (request) => {
    const { spotName, spotUrl, areaPositions, standardTags } = request.data;
    if (!spotName || !spotUrl) {
        throw new HttpsError("invalid-argument", "スポット名とURLは必須です。");
    }

    const settingsDoc = await admin.firestore().collection('app_settings').doc('prompts').get();
    const prompts = settingsDoc.exists() ? settingsDoc.data() : {};

    const prefectureIdMap = await getPrefectureIdMap();
    const supportedPrefectureNames = Object.keys(prefectureIdMap);

    const prompt = prompts.analyzeSpot || `あなたは旅行情報サイトの優秀な編集者です。以下の情報を基に、VLOG旅プランナーに追加するスポット情報をJSON形式で生成してください。
# コンテキスト：
- 既存のエリアマップ情報: ${JSON.stringify(areaPositions, null, 2)}
- 現在対応している都道府県リスト: ${supportedPrefectureNames.join(', ')}
# 入力情報
- スポット名: ${spotName}
- 参考URL: ${spotUrl}
# 生成ルール
1. 参考URLの内容を分析し、以下の項目を埋めてください。
2. **都道府県とエリア**: スポットの所在地から、最も適切と思われる「prefecture」と「area」を決定してください。「prefecture」は必ず「現在対応している都道府県リスト」の中から選んでください。
3. **エリアの判定**:
   * もし決定した「area」が、コンテキスト内の該当都道府県の「areaPositions」に**既に存在する場合**は、「isNewArea」を \`false\` にし、「newAreaPosition」と「newTransitData」は \`null\` にしてください。
   * もし決定した「area」が**存在しない場合**は、「isNewArea」を \`true\` にし、コンテキストの既存エリアとの地理的関係を考慮して、新しいエリアのマップ上の位置（topとleftのパーセンテージ文字列）と、既存エリアとの「transitData」（移動時間）を**必ず計算**してください。
4. **名称の一致確認**: 参考URLの内容がスポット名と関連している場合は「isNameConsistent」を \`true\` に、全く関係ない場合は \`false\` にしてください。
5. **タグと分類**: 「subCategory」と「tags」は、必ず利用可能なタグリストの中から選んでください。リストにない単語は使用しないでください。
6. **推奨**: ターゲットユーザー（専門学生、VLOGクリエイター）の視点で、このスポットをアプリに追加すべきか「recommendation」を「yes」か「no」で判断し、その理由を「reasoning」に記述してください。
# 利用可能なタグリスト
${standardTags.join(', ')}
# 出力フォーマット (JSONのみを出力)
{
  "prefecture": "（都道府県名）",
  "name": "${spotName}",
  "area": "（AIが決定したエリア名）",
  "isNewArea": false,
  "newAreaPosition": null,
  "newTransitData": null,
  "category": "（観光かグルメ）",
  "subCategory": "（具体的な分類名）",
  "description": "（AIが生成した紹介文）",
  "website": "${spotUrl}",
  "gmaps": "https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spotName)}",
  "stayTime": "（目安の滞在時間、例：約60分）",
  "tags": ["（タグ1）", "（タグ2）"],
  "isNameConsistent": true,
  "recommendation": "（yesかno）",
  "reasoning": "（判断理由）"
}`;
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY.value()}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error Response:", errorText);
            throw new HttpsError("internal", `Gemini APIエラー: ${response.status}`);
        }

        const result = await response.json();

        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
             console.error("Invalid Gemini Response Structure:", JSON.stringify(result, null, 2));
             throw new HttpsError("internal", "AIからの応答が無効な形式です。");
        }

        const aiResponseText = result.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
        
        try {
            return JSON.parse(aiResponseText);
        } catch (parseError) {
            console.error("AIの応答がJSONではありませんでした。解析に失敗しました。", parseError);
            console.error("AI Raw Response:", aiResponseText);
            throw new HttpsError("internal", "AIの応答を解析できませんでした。形式が正しくない可能性があります。");
        }

    } catch (error) {
        console.error("Cloud Function内でエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "AIによる分析中にサーバーでエラーが発生しました。");
    }
});

exports.reAnalyzeSpotSuggestion = onCall(async (request) => {
    const { originalName, originalUrl, gmapsUrl, areaPositions } = request.data;
    if (!gmapsUrl) throw new HttpsError("invalid-argument", "GoogleマップのURLは必須です。");

    const settingsDoc = await admin.firestore().collection('app_settings').doc('prompts').get();
    const prompts = settingsDoc.exists() ? settingsDoc.data() : {};

    const prompt = prompts.reAnalyzeSpot || `あなたは地理情報の専門家です。以下の情報を基に、スポットの正しい都道府県とエリアを特定してください。GoogleマップのURLを最優先の情報源としてください。
# 入力情報
- スポット名: ${originalName}
- 公式サイトURL: ${originalUrl}
- GoogleマップURL: ${gmapsUrl}
# コンテキスト：既存のエリアマップ情報
${JSON.stringify(areaPositions, null, 2)}
# 生成ルール
1.  **都道府県とエリア**: GoogleマップURLを最優先に分析し、最も適切と思われる「prefecture」と「area」を決定してください。
2.  **エリアの判定**:
    * もし決定した「area」が、コンテキスト内の該当都道府県の「areaPositions」に**既に存在する場合**は、「isNewArea」を \`false\` にし、「newAreaPosition」と「newTransitData」は \`null\` にしてください。
    * もし決定した「area」が**存在しない場合**は、「isNewArea」を \`true\` にし、新しいエリアのマップ上の位置（topとleft）と、既存エリアとの「transitData」（移動時間）を**必ず計算**してください。
# 出力フォーマット (JSONのみを出力)
{
  "prefecture": "（都道府県名）",
  "area": "（AIが決定したエリア名）",
  "isNewArea": false,
  "newAreaPosition": null,
  "newTransitData": null
}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY.value()}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!response.ok) {
            const errorText = await response.text(); console.error("Gemini API Error Response (reAnalyze):", errorText); throw new HttpsError("internal", `Gemini APIエラー: ${response.status}`);
        }
        const result = await response.json();
        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
             console.error("Invalid Gemini Response (reAnalyze):", JSON.stringify(result, null, 2)); throw new HttpsError("internal", "AIからの応答が無効です。");
        }
        const aiResponseText = result.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
        return JSON.parse(aiResponseText);
    } catch (error) {
        console.error("Cloud Function (reAnalyze)内でエラー:", error); throw new HttpsError("internal", "AIによる再分析中にサーバーでエラーが発生しました。");
    }
});

const _fetchImageForSpotLogic = async ({ spot, reportedImageUrl = null }) => {
    if (!GOOGLE_SEARCH_KEY.value() || !GOOGLE_SEARCH_ID.value()) {
        console.error("Google Search APIキーが設定されていません。");
        return [];
    }
    
    const query = `${spot.name} ${spot.prefecture} 公式画像`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY.value()}&cx=${GOOGLE_SEARCH_ID.value()}&q=${encodeURIComponent(query)}&searchType=image&num=3`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Google Search API Request Failed: ${response.status}`, errorBody);
            return [];
        }
        const result = await response.json();
        
        if (result.items && result.items.length > 0) {
            const candidates = result.items
                .filter(item => item.link !== reportedImageUrl)
                .map(item => ({
                    url: item.link,
                    sourceLink: item.image.contextLink,
                    displayLink: item.displayLink
                }));
            return candidates;
        }
        return [];
    } catch (error) {
        console.error(`「${spot.name}」の画像取得エラー:`, error);
        return [];
    }
};

exports.fetchImageForSpot = onRequest(async (req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        const { spot, reportedImageUrl } = req.body;
        if (!spot || !spot.name || !spot.prefecture) {
             return res.status(400).send('Spot data (name, prefecture) is required.');
        }

        try {
            const candidates = await _fetchImageForSpotLogic({ spot, reportedImageUrl });
            res.status(200).json(candidates);
        } catch (error) {
            console.error('Error in fetchImageForSpot onRequest:', error);
            res.status(500).send('Internal Server Error');
        }
    });
});

// --- Settings Management Functions ---
exports.getAppSettings = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    try {
        const doc = await admin.firestore().collection('app_settings').doc('prompts').get();
        if (doc.exists && doc.data().analyzeSpot && doc.data().reAnalyzeSpot) {
            return doc.data();
        }
        
        return {
            analyzeSpot: `あなたは旅行情報サイトの優秀な編集者です。以下の情報を基に、VLOG旅プランナーに追加するスポット情報をJSON形式で生成してください。
# コンテキスト：
- 既存のエリアマップ情報: \${JSON.stringify(areaPositions, null, 2)}
- 現在対応している都道府県リスト: \${supportedPrefectureNames.join(', ')}
# 入力情報
- スポット名: \${spotName}
- 参考URL: \${spotUrl}
# 生成ルール
1. 参考URLの内容を分析し、以下の項目を埋めてください。
2. **都道府県とエリア**: スポットの所在地から、最も適切と思われる「prefecture」と「area」を決定してください。「prefecture」は必ず「現在対応している都道府県リスト」の中から選んでください。
3. **エリアの判定**:
   * もし決定した「area」が、コンテキスト内の該当都道府県の「areaPositions」に**既に存在する場合**は、「isNewArea」を \`false\` にし、「newAreaPosition」と「newTransitData」は \`null\` にしてください。
   * もし決定した「area」が**存在しない場合**は、「isNewArea」を \`true\` にし、コンテキストの既存エリアとの地理的関係を考慮して、新しいエリアのマップ上の位置（topとleftのパーセンテージ文字列）と、既存エリアとの「transitData」（移動時間）を**必ず計算**してください。
4. **名称の一致確認**: 参考URLの内容がスポット名と関連している場合は「isNameConsistent」を \`true\` に、全く関係ない場合は \`false\` にしてください。
5. **タグと分類**: 「subCategory」と「tags」は、必ず利用可能なタグリストの中から選んでください。リストにない単語は使用しないでください。
6. **推奨**: ターゲットユーザー（専門学生、VLOGクリエイター）の視点で、このスポットをアプリに追加すべきか「recommendation」を「yes」か「no」で判断し、その理由を「reasoning」に記述してください。
# 利用可能なタグリスト
\${standardTags.join(', ')}
# 出力フォーマット (JSONのみを出力)
{
  "prefecture": "（都道府県名）",
  "name": "\${spotName}",
  "area": "（AIが決定したエリア名）",
  "isNewArea": false,
  "newAreaPosition": null,
  "newTransitData": null,
  "category": "（観光かグルメ）",
  "subCategory": "（具体的な分類名）",
  "description": "（AIが生成した紹介文）",
  "website": "\${spotUrl}",
  "gmaps": "https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(spotName)}",
  "stayTime": "（目安の滞在時間、例：約60分）",
  "tags": ["（タグ1）", "（タグ2）"],
  "isNameConsistent": true,
  "recommendation": "（yesかno）",
  "reasoning": "（判断理由）"
}`,
            reAnalyzeSpot: `あなたは地理情報の専門家です。以下の情報を基に、スポットの正しい都道府県とエリアを特定してください。GoogleマップのURLを最優先の情報源としてください。
# 入力情報
- スポット名: \${originalName}
- 公式サイトURL: \${originalUrl}
- GoogleマップURL: \${gmapsUrl}
# コンテキスト：既存のエリアマップ情報
\${JSON.stringify(areaPositions, null, 2)}
# 生成ルール
1.  **都道府県とエリア**: GoogleマップURLを最優先に分析し、最も適切と思われる「prefecture」と「area」を決定してください。
2.  **エリアの判定**:
    * もし決定した「area」が、コンテキスト内の該当都道府県の「areaPositions」に**既に存在する場合**は、「isNewArea」を \`false\` にし、「newAreaPosition」と「newTransitData」は \`null\` にしてください。
    * もし決定した「area」が**存在しない場合**は、「isNewArea」を \`true\` にし、新しいエリアのマップ上の位置（topとleft）と、既存エリアとの「transitData」（移動時間）を**必ず計算**してください。
# 出力フォーマット (JSONのみを出力)
{
  "prefecture": "（都道府県名）",
  "area": "（AIが決定したエリア名）",
  "isNewArea": false,
  "newAreaPosition": null,
  "newTransitData": null
}`
        };
    } catch (error) {
        console.error("Error getting app settings:", error);
        throw new HttpsError("internal", "設定の取得に失敗しました。");
    }
});

exports.updateAppSettings = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { analyzeSpot, reAnalyzeSpot } = request.data;
    if (typeof analyzeSpot !== 'string' || typeof reAnalyzeSpot !== 'string') {
        throw new HttpsError("invalid-argument", "プロンプトの形式が正しくありません。");
    }

    try {
        await admin.firestore().collection('app_settings').doc('prompts').set({
            analyzeSpot,
            reAnalyzeSpot,
        }, { merge: true });
        return { success: true, message: "設定を保存しました。" };
    } catch (error) {
        console.error("Error updating app settings:", error);
        throw new HttpsError("internal", "設定の保存に失敗しました。");
    }
});


// --- GitHub連携関数 (V2形式) ---
exports.approveSubmission = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { submissionId, submissionData, approveNewArea } = request.data;
    const db = admin.firestore();
    
    const prefectureIdMap = await getPrefectureIdMap();
    const prefId = prefectureIdMap[submissionData.prefecture];
    if (!prefId) {
        throw new HttpsError("invalid-argument", `未対応の都道府県です: ${submissionData.prefecture}`);
    }
    const filePath = `data/${prefId}.json`;

    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);
        
        const imageCandidates = await _fetchImageForSpotLogic({ spot: submissionData });
        const firstCandidate = imageCandidates.length > 0 ? imageCandidates[0] : null;
        
        const newSpotData = {
            prefecture: submissionData.prefecture,
            name: submissionData.name,
            area: submissionData.area,
            category: submissionData.category,
            subCategory: submissionData.subCategory,
            description: submissionData.description,
            website: submissionData.website,
            gmaps: submissionData.gmaps,
            stayTime: submissionData.stayTime,
            tags: submissionData.tags,
            image: firstCandidate ? firstCandidate.url : `https://placehold.co/600x400/E57373/FFF?text=${encodeURIComponent(submissionData.name)}`,
            imageSource: firstCandidate ? firstCandidate.displayLink : "ユーザー提案",
            imageSourceUrl: firstCandidate ? firstCandidate.sourceLink : submissionData.website,
        };

        currentJson.spots.push(newSpotData);
        let announcementTitle = "新しいスポットが追加されました！";
        let announcementMessage = `「${newSpotData.name}」（${newSpotData.prefecture}）が新しく追加されました。`;

        if (submissionData.isNewArea && approveNewArea) {
            const newArea = {
                name: submissionData.area,
                top: submissionData.newAreaPosition.top,
                left: submissionData.newAreaPosition.left,
            };
            currentJson.areaPositions.push(newArea);

            if (submissionData.newTransitData) {
                 if (!currentJson.transitData) currentJson.transitData = {};
                 currentJson.transitData[newArea.name] = submissionData.newTransitData;
                 for (const [existingArea, time] of Object.entries(submissionData.newTransitData)) {
                    if (!currentJson.transitData[existingArea]) currentJson.transitData[existingArea] = {};
                    currentJson.transitData[existingArea][newArea.name] = time;
                 }
            }
            announcementTitle = "新しいエリアが追加されました！";
            announcementMessage = `新しいエリア「${newArea.name}」が${newSpotData.prefecture}に追加され、スポット「${newSpotData.name}」が登録されました。`;
        }
        
        const commitMessage = `feat: Add new spot "${newSpotData.name}" via VLOG Planner`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);

        const batch = db.batch();
        const submissionRef = db.collection("spot_submissions").doc(submissionId);
        batch.delete(submissionRef);

        const announcementRef = db.collection("announcements").doc();
        batch.set(announcementRef, {
            title: announcementTitle,
            message: announcementMessage,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
        return { success: true, message: "スポットが承認され、GitHubファイルが更新されました。" };
    } catch (error) {
        console.error("承認処理中にエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "スポットの承認処理に失敗しました。");
    }
});

exports.resolveImageReport = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { reportId, spotName, newImageUrl, prefecture } = request.data;
    if (!reportId || !spotName || !newImageUrl || !prefecture) {
        throw new HttpsError("invalid-argument", "必要な情報（レポートID, スポット名, 新URL, 都道府県）が不足しています。");
    }
    const db = admin.firestore();

    const prefectureIdMap = await getPrefectureIdMap();
    const prefId = prefectureIdMap[prefecture];
    if (!prefId) {
        throw new HttpsError("invalid-argument", `未対応の都道府県です: ${prefecture}`);
    }
    const filePath = `data/${prefId}.json`;

    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);
        const spotIndex = currentJson.spots.findIndex(s => s.name === spotName);
        if (spotIndex === -1) {
            throw new HttpsError("not-found", `JSONデータ内でスポット「${spotName}」が見つかりませんでした。`);
        }

        currentJson.spots[spotIndex].image = newImageUrl;
        currentJson.spots[spotIndex].imageSource = "管理者更新";
        currentJson.spots[spotIndex].imageSourceUrl = newImageUrl;

        const commitMessage = `fix: Update image for "${spotName}" based on report`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);

        await db.collection("image_reports").doc(reportId).delete();
        return { success: true, message: "画像が更新されました。" };
    } catch(error) {
        console.error("画像レポートの解決中にエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "画像レポートの解決に失敗しました。");
    }
});

async function _getPrefectureListLogic() {
    const url = `https://api.github.com/repos/${GITHUB_OWNER.value()}/${GITHUB_REPO.value()}/contents/data?ref=${GITHUB_BRANCH.value()}`;
    try {
        const directoryResponse = await fetch(url, {
            headers: {
                "Authorization": `token ${GITHUB_TOKEN.value()}`,
                "Accept": "application/vnd.github.v3+json",
            },
        });

        if (!directoryResponse.ok) {
            const errorText = await directoryResponse.text();
            console.error("GitHub API error (directory):", errorText);
            throw new Error("GitHubのdataディレクトリの取得に失敗しました。");
        }

        const files = await directoryResponse.json();
        const jsonFiles = Array.isArray(files) ? files.filter(file => file.name.endsWith('.json')) : [];

        const prefectureList = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const fileData = await getGitHubFile(`data/${file.name}`);
                    const id = file.name.replace('.json', '');
                    const name = fileData.content.name;
                    if (id && name) {
                        return { id, name };
                    }
                    return null;
                } catch (error) {
                    console.error(`Error fetching or parsing ${file.name}:`, error);
                    return null;
                }
            })
        );
        
        const validPrefectures = prefectureList.filter(Boolean);
        validPrefectures.sort((a, b) => a.id.localeCompare(b.id));

        return validPrefectures;

    } catch (error) {
        console.error("_getPrefectureListLogic関数でエラー:", error);
        throw new Error("都道府県リストの取得中にサーバーでエラーが発生しました。");
    }
}

exports.getPrefectureList = onCall(async (request) => {
    try {
        return await _getPrefectureListLogic();
    } catch (error) {
        console.error("getPrefectureList HttpsCallable Error:", error);
        throw new HttpsError("internal", error.message);
    }
});

// ▼▼▼ ADD THIS NEW FUNCTION ▼▼▼
exports.updatePrefectureData = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { prefectureId, areaPositions, transitData } = request.data;
    if (!prefectureId || !areaPositions || !transitData) {
        throw new HttpsError("invalid-argument", "必要な情報が不足しています。");
    }

    const filePath = `data/${prefectureId}.json`;

    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);

        // Update the specific keys
        currentJson.areaPositions = areaPositions;
        currentJson.transitData = transitData;

        const commitMessage = `feat(admin): Update area and transit data for ${prefectureId}`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);

        return { success: true, message: "エリアと移動時間データを更新しました。" };

    } catch (error) {
        console.error(`Error updating ${prefectureId}.json:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "データの更新中にエラーが発生しました。");
    }
});
// ▲▲▲ END OF NEW FUNCTION ▲▲▲

exports.setAdminClaim = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError( "permission-denied", "この機能は管理者のみが実行できます。");
    }
    const email = request.data.email;
    if (!email) {
        throw new HttpsError("invalid-argument", "メールアドレスが指定されていません。");
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        return { message: `成功！ ${email} さんを管理者に設定しました。` };
    } catch (error) {
        console.error("管理者権限の設定中にエラー:", error);
        throw new HttpsError("internal", "ユーザーが見つからないか、内部的なエラーが発生しました。");
    }
});

exports.inviteAdmin = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この機能は管理者のみが実行できます。");
    }
    const email = request.data.email;
    if (!email) {
        throw new HttpsError("invalid-argument", "メールアドレスが指定されていません。");
    }
    try {
        const user = await admin.auth().getUserByEmail(email);
        if (user.customClaims && user.customClaims.admin) {
            throw new HttpsError("already-exists", "このユーザーは既に管理者です。");
        }
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000; // 24時間後に失効
        await admin.firestore().collection('admin_invitations').doc(token).set({
            email: user.email,
            uid: user.uid,
            expires: expires,
        });
        const inviteLink = `https://studio-gqqbe.web.app/?token=${token}`;
        const notificationMessage = `管理者から招待が届きました。24時間以内に以下のリンクをクリックして管理者権限を有効にしてください。 ${inviteLink}`;
        await admin.firestore().collection("users").doc(user.uid).collection("mailbox").add({
            title: "管理者への招待",
            message: notificationMessage,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { message: `成功！ ${email} さんに管理者への招待を送信しました。` };
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
             throw new HttpsError("not-found", "そのメールアドレスのユーザーは見つかりませんでした。");
        }
        console.error("管理者招待中にエラー:", error);
        throw new HttpsError("internal", error.message || "招待の送信に失敗しました。");
    }
});

exports.verifyAdminInvitation = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "この操作にはログインが必要です。");
    }
    const token = request.data.token;
    if (!token) {
        throw new HttpsError("invalid-argument", "トークンが必要です。");
    }
    const db = admin.firestore();
    const tokenRef = db.collection('admin_invitations').doc(token);
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) {
        throw new HttpsError("not-found", "無効な招待トークンです。");
    }
    const tokenData = tokenDoc.data();
    if (tokenData.expires < Date.now()) {
        await tokenRef.delete();
        throw new HttpsError("deadline-exceeded", "この招待は期限切れです。");
    }
    if (tokenData.email !== request.auth.token.email) {
        throw new HttpsError("permission-denied", "この招待はあなた宛てのものではありません。");
    }
    try {
        await admin.auth().setCustomUserClaims(request.auth.uid, { admin: true });
        await tokenRef.delete();
        return { message: "成功！管理者として承認されました。ページを更新してください。" };
    } catch (error) {
        console.error("管理者権限の付与中にエラー:", error);
        throw new HttpsError("internal", "権限の付与に失敗しました。");
    }
});

exports.getAdminUsers = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この機能は管理者のみが実行できます。");
    }
    const adminUsers = [];
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        listUsersResult.users.forEach(user => {
            if (user.customClaims && user.customClaims.admin === true) {
                adminUsers.push({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || '（表示名なし）',
                });
            }
        });
        return adminUsers;
    } catch (error) {
        console.error("管理者リストの取得中にエラー:", error);
        throw new HttpsError("internal", "管理者リストの取得に失敗しました。");
    }
});

exports.removeAdminClaim = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この機能は管理者のみが実行できます。");
    }
    const targetUid = request.data.uid;
    if (!targetUid) {
        throw new HttpsError("invalid-argument", "ユーザーIDが指定されていません。");
    }
    if (request.auth.uid === targetUid) {
        throw new HttpsError("failed-precondition", "自分自身の管理者権限は削除できません。");
    }
    try {
        const userToRemove = await admin.auth().getUser(targetUid);
        if (userToRemove.email === "tatsuyangkorn@outlook.jp") {
            throw new HttpsError("permission-denied", "最高管理者の権限は削除できません。");
        }
        await admin.auth().setCustomUserClaims(targetUid, { admin: null });
        return { message: "管理者権限を削除しました。" };
    } catch (error) {
        if (error instanceof HttpsError) {
            throw error;
        }
        console.error("管理者権限の削除中にエラー:", error);
        throw new HttpsError("internal", "権限の削除に失敗しました。");
    }
});

exports.sendAnnouncement = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この機能は管理者のみが実行できます。");
    }
    const { title, message } = request.data;
    if (!title || !message) {
        throw new HttpsError("invalid-argument", "タイトルとメッセージの両方が必要です。");
    }
    try {
        await admin.firestore().collection("announcements").add({
            title: title,
            message: message,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { message: "お知らせを全ユーザーに送信しました。" };
    } catch (error) {
        console.error("お知らせの作成中にエラー:", error);
        throw new HttpsError("internal", "お知らせの作成に失敗しました。");
    }
});

exports.updateSpot = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { prefectureId, originalSpotName, updatedSpotData } = request.data;
    if (!prefectureId || !originalSpotName || !updatedSpotData) {
        throw new HttpsError("invalid-argument", "更新に必要な情報（都道府県ID, 元のスポット名, 更新データ）が不足しています。");
    }
    const filePath = `data/${prefectureId}.json`;
    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);
        const spotIndex = currentJson.spots.findIndex((spot) => spot.name === originalSpotName);
        if (spotIndex === -1) {
            throw new HttpsError("not-found", `スポット「${originalSpotName}」が見つかりませんでした。`);
        }
        currentJson.spots[spotIndex] = { ...currentJson.spots[spotIndex], ...updatedSpotData };
        const commitMessage = `feat(admin): Update spot "${updatedSpotData.name || originalSpotName}"`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);
        return {
            success: true,
            message: `スポット「${updatedSpotData.name || originalSpotName}」の情報を更新しました。`,
        };
    } catch (error) {
        console.error("スポットの更新処理中にエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "スポットの更新に失敗しました。");
    }
});

exports.exportSpotsToCSV = onRequest(async (req, res) => {
    cors(req, res, async () => {
        const prefectureId = req.query.prefectureId;
        if (!prefectureId) {
            res.status(400).send("prefectureId is required.");
            return;
        }
        try {
            const filePath = `data/${prefectureId}.json`;
            const { content:jsonData } = await getGitHubFile(filePath);
            const csv = Papa.unparse(jsonData.spots);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="spots_${prefectureId}.csv"`);
            res.status(200).send(csv);
        } catch (error) {
            console.error("CSVのエクスポート中にエラー:", error);
            res.status(500).send("Export failed.");
        }
    });
});

exports.importSpotsFromCSV = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "管理者権限が必要です。");
    }
    const { prefectureId, spotsToImport } = request.data;
    if (!prefectureId || !spotsToImport || !Array.isArray(spotsToImport)) {
        throw new HttpsError("invalid-argument", "必要な情報が不足しています。");
    }
    const filePath = `data/${prefectureId}.json`;
    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);
        let addedCount = 0;
        let updatedCount = 0;
        spotsToImport.forEach(newSpot => {
            const existingIndex = currentJson.spots.findIndex(s => s.name === newSpot.name);
            if (existingIndex > -1) {
                currentJson.spots[existingIndex] = { ...currentJson.spots[existingIndex], ...newSpot };
                updatedCount++;
            } else {
                currentJson.spots.push(newSpot);
                addedCount++;
            }
        });
        const commitMessage = `feat(data): Batch import ${addedCount} new, ${updatedCount} updated spots to ${prefectureId}`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);
        return { success: true, message: `${addedCount}件のスポットを追加、${updatedCount}件を更新しました。` };
    } catch (error) {
        console.error("CSVのインポート中にエラー:", error);
        throw new HttpsError("internal", "インポート処理に失敗しました。");
    }
});


exports.triggerLinkCheck = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "管理者権限が必要です。");
    }
    const { prefectureId } = request.data;
    const db = admin.firestore();

    const oldReports = await db.collection('link_reports').get();
    const batchDelete = db.batch();
    oldReports.docs.forEach(doc => batchDelete.delete(doc.ref));
    await batchDelete.commit();

    const allPrefectures = await _getPrefectureListLogic();
    let prefecturesToProcess = [];

    if (prefectureId && prefectureId !== 'all') {
        const singlePref = allPrefectures.find(p => p.id === prefectureId);
        if (singlePref) {
            prefecturesToProcess.push(singlePref);
        } else {
            throw new HttpsError("not-found", "指定された都道府県が見つかりません。");
        }
    } else {
        prefecturesToProcess = allPrefectures;
    }

    const allSpots = [];
    for (const pref of prefecturesToProcess) {
        try {
            const { content: jsonData } = await getGitHubFile(`data/${pref.id}.json`);
            jsonData.spots.forEach(spot => {
                allSpots.push({
                    prefectureId: pref.id,
                    spotName: spot.name,
                    website: spot.website,
                    gmaps: spot.gmaps,
                });
            });
        } catch (e) {
            console.error(`Error processing ${pref.id}.json`, e);
        }
    }

    const checkUrl = async (spot, urlType) => {
        const url = spot[urlType];
        if (!url || !url.startsWith('http')) {
            return { status: 'skipped' };
        }
        try {
            const response = await fetch(url, { method: 'HEAD', timeout: 15000 });
            return { status: response.status, url, urlType, spot };
        } catch (error) {
            console.error(`Fetch error for ${url}:`, error.name);
            return { status: 'FETCH_ERROR', url, urlType, spot };
        }
    };

    const checkPromises = allSpots.flatMap(spot => [
        checkUrl(spot, 'website'),
        checkUrl(spot, 'gmaps')
    ]);
    
    const results = await Promise.all(checkPromises);

    const brokenLinks = [];
    results.forEach(result => {
        if (result.status >= 400 || result.status === 'FETCH_ERROR') {
            brokenLinks.push({
                prefectureId: result.spot.prefectureId,
                spotName: result.spot.spotName,
                urlType: result.urlType,
                url: result.url,
                status: String(result.status),
                checkedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    });

    if (brokenLinks.length > 0) {
        const batch = db.batch();
        brokenLinks.forEach(report => {
            const docRef = db.collection('link_reports').doc();
            batch.set(docRef, report);
        });
        await batch.commit();
    }

    return { success: true, message: `チェックが完了しました。${brokenLinks.length}件のリンク切れの可能性があります。` };
});

exports.findUrlCandidates = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }

    const { spotName, prefecture, urlType } = request.data;
    if (!spotName || !prefecture || !urlType) {
        throw new HttpsError("invalid-argument", "スポット名、都道府県、URLタイプは必須です。");
    }

    if (!GOOGLE_SEARCH_KEY .value() || !GOOGLE_SEARCH_ID.value()) {
        console.error("Google Search APIキーが設定されていません。");
        throw new HttpsError("internal", "Google Search APIキーが設定されていません。");
    }

    const searchTarget = urlType === 'website' ? '公式サイト' : 'Googleマップ';
    const query = `${spotName} ${prefecture} ${searchTarget}`;
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY.value()}&cx=${GOOGLE_SEARCH_ID.value()}&q=${encodeURIComponent(query)}&num=5`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Google Search API Request Failed: ${response.status}`, errorBody);
            throw new HttpsError("internal", "Google検索でエラーが発生しました。");
        }
        const result = await response.json();
        
        if (result.items && result.items.length > 0) {
            const candidates = result.items.map(item => ({
                link: item.link,
                title: item.title,
                snippet: item.snippet
            }));
            return { candidates };
        }
        
        return { candidates: [] };

    } catch (error) {
        console.error(`「${spotName}」のURL候補検索エラー:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "URL候補の検索中にサーバーエラーが発生しました。");
    }
});

exports.reportSpot = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "この操作には認証が必要です。");
    }
    const { spotName, prefecture, area, reason, details } = request.data;
    if (!spotName || !prefecture || !reason) {
        throw new HttpsError("invalid-argument", "スポット名、都道府県、報告理由は必須です。");
    }

    const db = admin.firestore();
    const report = {
        spotName,
        prefecture,
        area: area || 'N/A',
        reason: reason,
        details: details || null,
        status: "pending",
        reportedBy: request.auth.uid,
        reportedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
        await db.collection("spot_reports").add(report);
        return { success: true, message: "報告が送信されました。" };
    } catch (error) {
        console.error("スポット報告の保存中にエラー:", error);
        throw new HttpsError("internal", "報告の保存に失敗しました。");
    }
});

exports.deleteSpot = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError("permission-denied", "この操作には管理者権限が必要です。");
    }
    const { reportId, spotName, prefecture } = request.data;
     if (!reportId || !spotName || !prefecture) {
        throw new HttpsError("invalid-argument", "必要な情報が不足しています。");
    }

    const db = admin.firestore();
    const prefectureIdMap = await getPrefectureIdMap();
    const prefId = prefectureIdMap[prefecture];

    if (!prefId) {
        throw new HttpsError("not-found", `指定された都道府県が見つかりません: ${prefecture}`);
    }
    const filePath = `data/${prefId}.json`;

    try {
        const { content: currentJson, sha } = await getGitHubFile(filePath);
        const initialCount = currentJson.spots.length;
        currentJson.spots = currentJson.spots.filter(spot => spot.name !== spotName);

        if (initialCount === currentJson.spots.length) {
             await db.collection("spot_reports").doc(reportId).delete();
            return { success: true, message: `スポット「${spotName}」はデータ内に見つかりませんでしたが、レポートは削除されました。` };
        }

        const commitMessage = `fix: Remove spot "${spotName}" based on user report`;
        await updateGitHubFile(filePath, currentJson, sha, commitMessage);

        await db.collection("spot_reports").doc(reportId).delete();

        return { success: true, message: `スポット「${spotName}」が削除されました。` };

    } catch (error) {
        console.error("スポットの削除処理中にエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "スポットの削除処理に失敗しました。");
    }
});

exports.getWeatherForecast = onCall(async (request) => {
    const apiKey = OPENWEATHER_KEY.value();
    if (!apiKey) {
        console.error("OpenWeatherMap APIキーが設定されていません。");
        throw new HttpsError("internal", "サーバーの設定エラーです。");
    }

    const { lat, lng, date } = request.data;
    if (!lat || !lng || !date) {
        throw new HttpsError("invalid-argument", "緯度、経度、日付は必須です。");
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ja`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`OpenWeatherMap API Request Failed: ${response.status}`, errorBody);
            throw new HttpsError("internal", `OpenWeatherMap APIエラー: ${response.status}`);
        }
        const data = await response.json();

        if (!data.list || data.list.length === 0) {
            return { daily: [] };
        }

        const dailyForecasts = {};

        data.list.forEach(forecast => {
            const forecastDate = new Date(forecast.dt * 1000);
            forecastDate.setHours(0, 0, 0, 0);

            const dateString = forecastDate.toISOString().split('T')[0];

            if (!dailyForecasts[dateString]) {
                dailyForecasts[dateString] = {
                    temp_min: Infinity,
                    temp_max: -Infinity,
                    weather: [],
                    dt: forecast.dt
                };
            }

            dailyForecasts[dateString].temp_min = Math.min(dailyForecasts[dateString].temp_min, forecast.main.temp_min);
            dailyForecasts[dateString].temp_max = Math.max(dailyForecasts[dateString].temp_max, forecast.main.temp_max);

            if (dailyForecasts[dateString].weather.length === 0) {
                 dailyForecasts[dateString].weather.push(forecast.weather[0]);
            }
        });

        const simplifiedDailyForecasts = Object.keys(dailyForecasts).map(dateKey => {
            const daily = dailyForecasts[dateKey];
            return {
                dt: daily.dt,
                temp: {
                    min: daily.temp_min,
                    max: daily.temp_max,
                    day: (daily.temp_min + daily.temp_max) / 2
                },
                weather: daily.weather
            };
        }).sort((a,b) => a.dt - b.dt);

        return { daily: simplifiedDailyForecasts };

    } catch (error) {
        console.error("getWeatherForecast関数でエラー:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "天気情報の取得中に予期せぬエラーが発生しました。");
    }
});
