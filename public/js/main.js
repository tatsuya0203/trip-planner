// Firebase SDKのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInAnonymously,
    signOut, 
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc,
    addDoc,
    collection,
    getDocs,
    onSnapshot,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";


// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDe8piUl7dbuR_FAn1pQkUfVtugh5HF4FU",
  authDomain: "studio-gqqbe.firebaseapp.com",
  projectId: "studio-gqqbe",
  storageBucket: "studio-gqqbe.appspot.com",
  messagingSenderId: "369252587708",
  appId: "1:369252587708:web:86f2413bd89967e2a858b9"
};

// Firebaseサービスの初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'asia-northeast1');

// Cloud Functions
const recordAnalyticsEvent = httpsCallable(functions, 'recordAnalyticsEvent');
const getPrefectureList = httpsCallable(functions, 'getPrefectureList');
const verifyAdminInvitation = httpsCallable(functions, 'verifyAdminInvitation');
const analyzeSpotSuggestion = httpsCallable(functions, 'analyzeSpotSuggestion');
const reAnalyzeSpotSuggestion = httpsCallable(functions, 'reAnalyzeSpotSuggestion');
const reportSpot = httpsCallable(functions, 'reportSpot');


// --- DATA (Will be loaded) ---
let allSpotsData = {};
let areaPositions = {};
let allTransitData = {};
let combinedSpots = [];
let availablePrefectures = []; 
let supportedPrefectureNames = [];
let originalJsonData = {};
let prefectureMapPositions = {};

const standardTags = [ "絶景", "インスタ映え", "レトロ", "おしゃれ", "カワイイ", "ユニーク", "自然・癒し", "食べ歩き", "ショッピング", "体験", "アート・建築", "夜景", "定番スポット", "カフェ・喫茶店", "スイーツ", "ご当地グルメ", "B級グルメ", "ランチ", "ディナー", "雨の日OK", "予約推奨", "コスパ", "無料" ];
const subCategories = { "観光": ["定番スポット", "絶景", "夜景", "自然・癒し", "アート・建築", "レトロ", "体験"], "グルメ": ["カフェ・喫茶店", "スイーツ", "ご当地グルメ", "B級グルメ", "ランチ", "ディナー", "食べ歩き"] };

let prefectureIdToNameMap = {}; 
let prefectureNameToIdMap = {};

const _createPrefectureMaps = () => {
    prefectureIdToNameMap = {};
    prefectureNameToIdMap = {};
    availablePrefectures.forEach(p => {
        prefectureIdToNameMap[p.id] = p.name;
        prefectureNameToIdMap[p.name] = p.id;
    });
};

async function loadAllData() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const prefectureFilter = document.getElementById('prefecture-filter');
    loadingIndicator.classList.remove('hidden');
    
    try {
        const result = await getPrefectureList();
        availablePrefectures = result.data;
    } catch (error) {
        console.error("都道府県リストの取得に失敗しました:", error);
        loadingIndicator.innerHTML = `<p class="text-red-500">都道府県リストの取得に失敗しました。ページを再読み込みしてください。</p>`;
        return false;
    }

    prefectureFilter.innerHTML = '<option value="all">すべての都道府県</option>';
    availablePrefectures.forEach(pref => {
        const option = document.createElement('option');
        option.value = pref.id;
        option.textContent = pref.name;
        prefectureFilter.appendChild(option);
    });

    const prefectureFiles = availablePrefectures.map(p => `data/${p.id}.json`);
    
    const localSpots = [];
    supportedPrefectureNames = [];
    try {
        const owner = 'tatsuya0203';
        const repo = 'trip-planner';
        const branch = 'main';

        const responses = await Promise.all([
            ...prefectureFiles.map(file => fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}?v=${new Date().getTime()}`)),
            fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/prefecture_positions.json?v=${new Date().getTime()}`)
        ]);

        const positionResponse = responses.pop();
        if (positionResponse.ok) {
            prefectureMapPositions = await positionResponse.json();
        } else {
            console.warn('prefecture_positions.jsonの読み込みに失敗しました。');
        }

        const jsonDataArray = await Promise.all(responses.map(res => {
            if (!res.ok) throw new Error(`Failed to fetch ${res.url}: ${res.statusText}`);
            return res.json();
        }));
        
        jsonDataArray.forEach((data, index) => {
            const prefectureId = prefectureFiles[index].split('/')[1].replace('.json', '');
            originalJsonData[prefectureId] = data; 
            allSpotsData[prefectureId] = data.spots;
            areaPositions[prefectureId] = data.areaPositions;
            allTransitData[prefectureId] = data.transitData;
            localSpots.push(...data.spots);
            if (data.name) {
                supportedPrefectureNames.push(data.name);
            }
        });
    } catch (error) {
        console.error("GitHubからのデータ読み込みに失敗しました:", error);
        loadingIndicator.innerHTML = `<p class="text-red-500">データの読み込みに失敗しました。ページを再読み込みしてください。</p>`;
        return false;
    }

    combinedSpots = [...localSpots];
    loadingIndicator.classList.add('hidden');
    return true;
}

function katakanaToHiragana(src) {
    if (!src) return '';
    return src.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    const dataLoaded = await loadAllData();
    if (!dataLoaded) return;
    
    _createPrefectureMaps();

    // Get all DOM elements
    const appContainer = document.getElementById('app-container');
    const authModal = document.getElementById('auth-modal');
    const authTitle = document.getElementById('auth-title');
    const authBtn = document.getElementById('auth-btn');
    const guestLoginBtn = document.getElementById('guest-login-btn');
    const emailInput = document.getElementById('email-input');
    const displayNameInput = document.getElementById('display-name-input');
    const passwordInput = document.getElementById('password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');
    const passwordToggle = document.getElementById('password-toggle');
    const confirmPasswordWrapper = document.getElementById('confirm-password-wrapper');
    const confirmPasswordToggle = document.getElementById('confirm-password-toggle');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const authSwitchText = document.getElementById('auth-switch-text');
    const authError = document.getElementById('auth-error');
    const userDisplay = document.getElementById('user-display');
    const userSettingsBtn = document.getElementById('user-settings-btn');
    const myPlanTitle = document.getElementById('my-plan-title');
    const spotsList = document.getElementById('spots-list');
    const categoryFilters = document.getElementById('category-filters');
    const listTitle = document.getElementById('list-title');
    const openAreaFilterBtn = document.getElementById('open-area-filter-btn');
    const areaFilterOverlay = document.getElementById('area-filter-overlay');
    const closeAreaFilterBtn = document.getElementById('close-area-filter-btn');
    const mapContainer = document.getElementById('map-container');
    const openTagFilterBtn = document.getElementById('open-tag-filter-btn');
    const tagFilterOverlay = document.getElementById('tag-filter-overlay');
    const closeTagFilterBtn = document.getElementById('close-tag-filter-btn');
    const tagFilters = document.getElementById('tag-filters');
    const userSettingsOverlay = document.getElementById('user-settings-overlay');
    const closeUserSettingsBtn = document.getElementById('close-user-settings-btn');
    const settingsIconSection = document.getElementById('settings-icon-section');
    const settingsUsernameSection = document.getElementById('settings-username-section');
    const settingsEmailSection = document.getElementById('settings-email-section');
    const settingsIconPreview = document.getElementById('settings-icon-preview');
    const iconUploadInput = document.getElementById('icon-upload-input');
    const iconUploadBtn = document.getElementById('icon-upload-btn');
    const settingsUsernameInput = document.getElementById('settings-username-input');
    const settingsEmail = document.getElementById('settings-email');
    const logoutBtnSettings = document.getElementById('logout-btn-settings');
    const adminControls = document.getElementById('admin-controls');
    const userSwitcher = document.getElementById('user-switcher');
    const cropperOverlay = document.getElementById('cropper-overlay');
    const cropperImage = document.getElementById('cropper-image');
    const cropperCancelBtn = document.getElementById('cropper-cancel-btn');
    const cropperSaveBtn = document.getElementById('cropper-save-btn');
    const iconUploadSpinner = document.getElementById('icon-upload-spinner');
    const confirmationOverlay = document.getElementById('confirmation-overlay');
    const confirmationMessage = document.getElementById('confirmation-message');
    const confirmActionBtn = document.getElementById('confirm-action-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const infoOverlay = document.getElementById('info-overlay');
    const infoMessage = document.getElementById('info-message');
    const infoOkBtn = document.getElementById('info-ok-btn');
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modal-close');
    const modalContent = document.getElementById('modal-content');
    const myPlanBtn = document.getElementById('my-plan-btn');
    const planCountBadge = document.getElementById('plan-count');
    const myPlanPanel = document.getElementById('my-plan-panel');
    const myPlanPanelOverlay = document.getElementById('my-plan-panel-overlay');
    const myPlanCloseBtn = document.getElementById('my-plan-close-btn');
    const planItemsList = document.getElementById('plan-items-list');
    const planControls = document.getElementById('plan-controls');
    const planTotalTimeEl = document.getElementById('plan-total-time');
    const copyPlanBtn = document.getElementById('copy-plan-btn');
    const clearPlanBtn = document.getElementById('clear-plan-btn');
    const copyTextarea = document.getElementById('copy-textarea');
    const routeMapBtn = document.getElementById('route-map-btn');
    const routeMapFromCurrentBtn = document.getElementById('route-map-from-current-btn');
    const prefectureFilter = document.getElementById('prefecture-filter');
    const crossPrefectureOverlay = document.getElementById('cross-prefecture-overlay');
    const crossPrefectureMessage = document.getElementById('cross-prefecture-message');
    const crossPrefectureAddBtn = document.getElementById('cross-prefecture-add-btn');
    const crossPrefectureFavoriteBtn = document.getElementById('cross-prefecture-favorite-btn');
    const crossPrefectureCancelBtn = document.getElementById('cross-prefecture-cancel-btn');
    const areaViewSwitcher = document.getElementById('area-view-switcher');
    const areaListContainer = document.getElementById('area-list-container');
    const addSpotBtn = document.getElementById('add-spot-btn');
    const addSpotOverlay = document.getElementById('add-spot-overlay');
    const closeAddSpotBtn = document.getElementById('close-add-spot-btn');
    const submitSpotBtn = document.getElementById('submit-spot-btn');
    const newSpotName = document.getElementById('new-spot-name');
    const newSpotUrl = document.getElementById('new-spot-url');
    const submitSpotSpinner = document.getElementById('submit-spot-spinner');
    const modalImageSpinner = document.getElementById('modal-image-spinner');
    const reAnalysisOverlay = document.getElementById('re-analysis-overlay');
    const closeReAnalysisBtn = document.getElementById('close-re-analysis-btn');
    const reAnalysisGmapsUrl = document.getElementById('re-analysis-gmaps-url');
    const reSubmitSpotBtn = document.getElementById('re-submit-spot-btn');
    const reSubmitSpotSpinner = document.getElementById('re-submit-spot-spinner');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const mailboxBtn = document.getElementById('mailbox-btn');
    const mailboxBadge = document.getElementById('mailbox-badge');
    const mailboxPanel = document.getElementById('mailbox-panel');
    const mailboxPanelOverlay = document.getElementById('my-plan-panel-overlay');
    const mailboxCloseBtn = document.getElementById('mailbox-close-btn');
    const mailboxList = document.getElementById('mailbox-list');
    const markAllAsReadBtn = document.getElementById('mark-all-as-read-btn');
    const prefectureSelectOverlay = document.getElementById('prefecture-select-overlay');
    const prefectureSelectTitle = document.getElementById('prefecture-select-title');
    const prefectureSelectMessage = document.getElementById('prefecture-select-message');
    const prefectureSelectButtons = document.getElementById('prefecture-select-buttons');
    const prefectureSelectCancelBtn = document.getElementById('prefecture-select-cancel-btn');
    const reportImageBtn = document.getElementById('report-image-btn');
    const reportSpotBtn = document.getElementById('report-spot-btn');
    const searchInput = document.getElementById('search-input');
    const sortOrder = document.getElementById('sort-order');
    const imageViewerOverlay = document.getElementById('image-viewer-overlay');
    const imageViewerImg = document.getElementById('image-viewer-img');
    const mobileFilterToggle = document.getElementById('mobile-filter-toggle');
    const navContentWrapper = document.getElementById('nav-content-wrapper');
    const mobileFilterToggleText = document.getElementById('mobile-filter-toggle-text');
    const japanMapContainer = document.getElementById('japan-map-container');
    const openJapanMapBtn = document.getElementById('open-japan-map-btn');
    // ▼▼▼ NEW DOM ELEMENTS ▼▼▼
    const reportSpotOverlay = document.getElementById('report-spot-overlay');
    const reportSpotTitle = document.getElementById('report-spot-title');
    const cancelReportBtn = document.getElementById('cancel-report-btn');
    const submitReportBtn = document.getElementById('submit-report-btn');
    const reportReasonSelect = document.getElementById('report-reason-select');
    const reportDetailsTextarea = document.getElementById('report-details-textarea');
    // ▲▲▲ END OF NEW DOM ELEMENTS ▲▲▲

    let currentPrefecture = 'all';
    let currentFilters = { category: 'all', area: 'all', tag: 'all' };
    let currentSearchTerm = '';
    let currentSortOrder = 'default';
    let onPrefectureSelectCallback = null;

    let currentUser = null;
    let localFavorites = [];
    let localPlan = [];
    let unsubscribePlan = null;
    let unsubscribeFavorites = null;
    let unsubscribeMailbox = null;
    let unsubscribeAnnouncements = null;
    let localAnnouncements = [];
    
    let isLoginMode = true;
    let viewedUserId = null;
    let cropper = null;
    let areaFilterView = 'map';
    let pendingReAnalysisData = null;

    function toggleBodyScroll(lock) {
        document.body.classList.toggle('overflow-hidden', lock);
    }

    function showOverlay(overlayElement) {
        overlayElement.classList.add('visible');
        toggleBodyScroll(true);
    }

    function hideOverlay(overlayElement) {
        overlayElement.classList.remove('visible');
        const isAnyOverlayVisible = document.querySelector('.overlay-base.visible');
        if (!isAnyOverlayVisible) {
            toggleBodyScroll(false);
        }
    }
    
    function showInfoModal(message) {
        infoMessage.textContent = message;
        showOverlay(infoOverlay);
    }
    infoOkBtn.addEventListener('click', () => hideOverlay(infoOverlay));
    infoOverlay.addEventListener('click', (e) => {
        if (e.target === infoOverlay) hideOverlay(infoOverlay);
    });
    
    async function reloadDataAndRefreshUI(successMessage) {
        hideOverlay(modal);
        showInfoModal("データを更新しています...");
        await loadAllData(); 
        renderAll(); 
        setTimeout(() => {
            showInfoModal(successMessage);
        }, 300);
    }

    onAuthStateChanged(auth, user => {
        if (user) {
            if (sessionStorage.getItem('isNewUser') === 'true') {
                recordAnalyticsEvent({ eventType: 'userSignup' }).catch(console.error);
                sessionStorage.removeItem('isNewUser');
            }
            currentUser = user;
            viewedUserId = user.uid;
            hideOverlay(authModal);
            appContainer.classList.remove('hidden');
            initAppForUser(user);
             const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (token) {
                console.log("招待トークンを検出しました。承認処理を開始します。");
                verifyAdminInvitationWithToken(token);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } else {
            currentUser = null;
            showOverlay(authModal);
            appContainer.classList.add('hidden');
            if (unsubscribeMailbox) unsubscribeMailbox();
            if (unsubscribeAnnouncements) unsubscribeAnnouncements();
        }
    });

    async function verifyAdminInvitationWithToken(token) {
        try {
            const result = await verifyAdminInvitation({ token: token });
            alert(result.data.message); 
            location.reload(); 
        } catch (error) {
            console.error("管理者権限の有効化に失敗しました:", error);
            alert(`管理者権限の有効化に失敗しました: ${error.message}`);
        }
    }

    function handleAuth() {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const displayName = displayNameInput.value.trim();
        authError.textContent = '';

        if (!email || !password) {
            authError.textContent = 'メールアドレスとパスワードを入力してください。';
            return;
        }
        if (!isLoginMode && !displayName) {
            authError.textContent = 'ユーザー名を入力してください。';
            return;
        }

        if (isLoginMode) {
            signInWithEmailAndPassword(auth, email, password)
                .catch(error => {
                    authError.textContent = "メールアドレスまたはパスワードが違います。";
                    console.error("Login error:", error);
                });
        } else {
            const confirmPassword = confirmPasswordInput.value.trim();
            if (password !== confirmPassword) {
                authError.textContent = 'パスワードが一致しません。';
                return;
            }
            createUserWithEmailAndPassword(auth, email, password)
                .then(async (userCredential) => {
                    const user = userCredential.user;
                    await updateProfile(user, { displayName });
                    await setDoc(doc(db, "users", user.uid), {
                        displayName: displayName,
                        email: user.email,
                        photoURL: null,
                        createdAt: serverTimestamp()
                    });
                    sessionStorage.setItem('isNewUser', 'true');
                    showInfoModal('アカウントを作成しました！ログインしてください。');
                    toggleAuthMode();
                })
                .catch(error => {
                    if (error.code === 'auth/email-already-in-use') {
                        authError.textContent = "このメールアドレスは既に使用されています。";
                    } else {
                        authError.textContent = "アカウント作成に失敗しました。";
                    }
                    console.error("Signup error:", error);
                });
        }
    }
    
    function handleGuestLogin() {
        signInAnonymously(auth).catch(error => {
            authError.textContent = "ゲストログインに失敗しました。";
            console.error("Anonymous sign-in error:", error);
        });
    }

    function toggleAuthMode() {
        isLoginMode = !isLoginMode;
        authError.textContent = '';
        displayNameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
        confirmPasswordInput.value = '';
        if (isLoginMode) {
            authTitle.textContent = 'ログイン';
            authBtn.textContent = 'ログイン';
            displayNameInput.classList.add('hidden');
            confirmPasswordWrapper.classList.add('hidden');
            authSwitchText.textContent = 'アカウントをお持ちでないですか？';
            authSwitchLink.textContent = '新規登録はこちら';
        } else {
            authTitle.textContent = '新規登録';
            authBtn.textContent = '登録する';
            displayNameInput.classList.remove('hidden');
            confirmPasswordWrapper.classList.remove('hidden');
            authSwitchText.textContent = 'すでにアカウントをお持ちですか？';
            authSwitchLink.textContent = 'ログインはこちら';
        }
    }

    function handleLogout() {
        signOut(auth).then(() => {
            location.reload();
        });
    }

    async function initAppForUser(user) {
        await user.getIdToken(true);
        
        userDisplay.innerHTML = ''; 

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const userData = userDocSnap.exists() ? userDocSnap.data() : {};

        const photoURL = userData.photoURL || user.photoURL || 'https://placehold.co/40x40/D35400/FFF?text=';
        
        const icon = document.createElement('img');
        icon.src = photoURL;
        icon.alt = 'プロフィールアイコン';
        icon.className = 'profile-icon';
        
        const nameContainer = document.createElement('div');
        nameContainer.className = 'flex flex-col items-start';

        const nameEl = document.createElement('span');
        nameEl.className = 'text-sm font-semibold text-gray-700';
        nameEl.textContent = user.isAnonymous ? 'ゲスト' : (userData.displayName || user.displayName || '名無しさん');
        
        nameContainer.appendChild(nameEl);
        userDisplay.appendChild(icon);
        userDisplay.appendChild(nameContainer);

        user.getIdTokenResult()
            .then(async (idTokenResult) => {
                const isAdmin = !!idTokenResult.claims.admin;
                
                const roleBadge = document.createElement('span');
                roleBadge.className = 'role-badge';
                if (isAdmin) {
                    roleBadge.textContent = '管理者';
                    roleBadge.classList.add('bg-purple-200', 'text-purple-800');
                    adminControls.classList.remove('hidden');
                    
                    const usersCol = collection(db, 'users');
                    const userSnapshot = await getDocs(usersCol);
                    userSwitcher.innerHTML = '<option value="">他のユーザーのプランを見る</option>';
                    userSnapshot.forEach(doc => {
                        const uData = doc.data();
                        const option = document.createElement('option');
                        option.value = doc.id;
                        option.textContent = uData.displayName || uData.email || doc.id;
                        userSwitcher.appendChild(option);
                    });
                    
                } else {
                    roleBadge.textContent = '一般';
                    roleBadge.classList.add('bg-green-200', 'text-green-800');
                    adminControls.classList.add('hidden');
                }
                nameContainer.appendChild(roleBadge);
            })
            .catch((error) => {
                console.log("カスタムクレームの確認中にエラー（一般ユーザーの場合は正常）:", error.message);
                adminControls.classList.add('hidden');
            });
        
        if (unsubscribeMailbox) unsubscribeMailbox();
        if (unsubscribeAnnouncements) unsubscribeAnnouncements();
        
        let personalNotifications = [];
        
        const updateAndRenderMailbox = () => {
            const allNotifications = [...personalNotifications, ...localAnnouncements];
            allNotifications.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

            let unreadCount = 0;
            const lastReadTimestamp = parseInt(localStorage.getItem('lastReadAnnouncementTimestamp') || '0', 10);

            personalNotifications.forEach(n => {
                if (!n.read) unreadCount++;
            });
            
            localAnnouncements.forEach(n => {
                if (n.createdAt && n.createdAt.toMillis() > lastReadTimestamp) {
                    unreadCount++;
                }
            });

            mailboxBadge.textContent = unreadCount;
            mailboxBadge.classList.toggle('hidden', unreadCount === 0);
            renderMailbox(allNotifications, lastReadTimestamp);
        };
        
        if (!user.isAnonymous) {
            const mailboxQuery = query(collection(db, "users", user.uid, "mailbox"));
            unsubscribeMailbox = onSnapshot(mailboxQuery, (snapshot) => {
                personalNotifications = snapshot.docs.map(d => ({...d.data(), id: d.id, type: 'personal'}));
                updateAndRenderMailbox();
            });
        } else {
             mailboxBtn.classList.add('hidden');
        }

        const announcementsQuery = query(collection(db, "announcements"));
        unsubscribeAnnouncements = onSnapshot(announcementsQuery, (snapshot) => {
            localAnnouncements = snapshot.docs.map(d => ({...d.data(), id: d.id, type: 'public'}));
            updateAndRenderMailbox();
        });

        viewUserPlan(user.uid, user.displayName || 'ゲスト');
    }

    async function viewUserPlan(userId, userName) {
        if (unsubscribePlan) unsubscribePlan();
        if (unsubscribeFavorites) unsubscribeFavorites();

        viewedUserId = userId;
        
        const isViewingOwnPlan = currentUser.uid === viewedUserId;
        myPlanTitle.textContent = isViewingOwnPlan ? 'マイプラン' : `${userName}のプラン`;
        planControls.style.display = isViewingOwnPlan ? 'block' : 'none';

        const planDocRef = doc(db, "plans", viewedUserId);
        unsubscribePlan = onSnapshot(planDocRef, (docSnap) => {
            localPlan = docSnap.exists() ? docSnap.data().spots || [] : [];
            renderAll();
        }, (error) => {
            console.error("プランの読み込みエラー:", error);
            if (error.code === 'permission-denied') {
                 planItemsList.innerHTML = `<p class="text-red-500 text-center py-10">このユーザーのプランを閲覧する権限がありません。</p>`;
            }
        });

        const favDocRef = doc(db, "favorites", viewedUserId);
        unsubscribeFavorites = onSnapshot(favDocRef, (docSnap) => {
            localFavorites = docSnap.exists() ? docSnap.data().spots || [] : [];
            renderAll();
        }, (error) => {
            console.error("お気に入りの読み込みエラー:", error);
            localFavorites = [];
            renderAll();
        });
    }
    
    async function toggleFavorite(spotName) {
        if (!currentUser || currentUser.uid !== viewedUserId) {
            showInfoModal("他のユーザーのお気に入りは変更できません。");
            return;
        };

        const isFavorited = localFavorites.includes(spotName);
        if (!isFavorited) {
            const spot = combinedSpots.find(s => s.name === spotName);
            if (spot) {
                recordAnalyticsEvent({
                    eventType: 'favoriteSpot',
                    payload: { spotName: spot.name, prefecture: spot.prefecture }
                }).catch(console.error);
            }
        }

        const favDocRef = doc(db, "favorites", currentUser.uid);
        const newFavorites = isFavorited
            ? localFavorites.filter(name => name !== spotName)
            : [...localFavorites, spotName];
        await setDoc(favDocRef, { spots: newFavorites }, { merge: true });
    }
    
    async function _addSpotToPlan(spotName) {
        if (!currentUser || viewedUserId !== currentUser.uid) return;
        if (localPlan.includes(spotName)) return;

        const spot = combinedSpots.find(s => s.name === spotName);
        if (spot) {
            recordAnalyticsEvent({
                eventType: 'addToPlan',
                payload: { spotName: spot.name, prefecture: spot.prefecture }
            }).catch(console.error);
        }

        const planDocRef = doc(db, "plans", currentUser.uid);
        const newPlan = [...localPlan, spotName];
        await setDoc(planDocRef, { spots: newPlan }, { merge: true });
    }

    async function addToPlan(spotName) {
        if (!currentUser || viewedUserId !== currentUser.uid) {
            showInfoModal("他のユーザーのプランには追加できません。");
            return;
        }
        if (localPlan.includes(spotName)) return;

        const spotToAdd = combinedSpots.find(s => s.name === spotName);

        if (!spotToAdd) return;

        if (localPlan.length > 0) {
            const firstSpotInPlan = combinedSpots.find(s => s.name === localPlan[0]);
            if (firstSpotInPlan && firstSpotInPlan.prefecture !== spotToAdd.prefecture) {
                showCrossPrefectureConfirmation(spotToAdd, firstSpotInPlan);
            } else {
                _addSpotToPlan(spotName);
            }
        } else {
            _addSpotToPlan(spotName);
        }
    };

    async function removeFromPlan(spotName) {
        if (!currentUser || viewedUserId !== currentUser.uid) return;
        const planDocRef = doc(db, "plans", currentUser.uid);
        const newPlan = localPlan.filter(name => name !== spotName);
        await setDoc(planDocRef, { spots: newPlan });
    };
    
    async function savePlanOrder(newPlanOrder) {
        if (!currentUser || viewedUserId !== currentUser.uid) return;
        const planDocRef = doc(db, "plans", currentUser.uid);
        await setDoc(planDocRef, { spots: newPlanOrder });
    }

    async function clearPlan() {
        if (!currentUser || viewedUserId !== currentUser.uid) return;
        const planDocRef = doc(db, "plans", currentUser.uid);
        await setDoc(planDocRef, { spots: [] });
    }

    function createCard(spot) {
        const card = document.createElement('div');
        card.className = 'card bg-white rounded-xl shadow-md overflow-hidden flex flex-col relative';
        
        const isFavorited = localFavorites.includes(spot.name);
        const isInPlan = localPlan.includes(spot.name);
        
        card.innerHTML = `
            <div class="favorite-btn ${isFavorited ? 'favorited' : ''}" title="お気に入りに追加">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </div>
            <div class="card-content p-5 pt-3 flex flex-col flex-grow">
                <div class="flex-grow">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full ${spot.category === '観光' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}">${spot.category}</span>
                        <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">${spot.subCategory}</span>
                    </div>
                    <p class="text-sm font-semibold text-gray-500 mb-1">${spot.prefecture}・${spot.area}</p>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">${spot.name}</h3>
                    <div class="flex flex-wrap gap-1 mb-3">
                        ${spot.tags ? spot.tags.map(tag => `<span class="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">#${tag}</span>`).join('') : ''}
                    </div>
                    <p class="text-gray-600 text-sm line-clamp-3">${spot.description}</p>
                </div>
                <div class="mt-4 flex-shrink-0">
                    <button class="add-to-plan-btn w-full py-2 px-4 rounded-lg font-semibold text-sm transition-colors duration-200 ${isInPlan ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'}">
                        ${isInPlan ? '✓ プランに追加済み' : '+ プランに追加'}
                    </button>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.closest('.favorite-btn') || e.target.closest('.add-to-plan-btn')) {
                return;
            }
            openModal(spot);
        });

        card.querySelector('.favorite-btn').addEventListener('click', () => toggleFavorite(spot.name));
        
        const addToPlanBtn = card.querySelector('.add-to-plan-btn');
        if (!isInPlan) {
            addToPlanBtn.addEventListener('click', () => addToPlan(spot.name));
        }
        
        return card;
    }
    
    function renderSpots() {
        spotsList.innerHTML = '';
        let sourceSpots = combinedSpots;

        if (currentPrefecture !== 'all') {
            const selectedPrefectureName = prefectureFilter.options[prefectureFilter.selectedIndex].text;
            sourceSpots = sourceSpots.filter(spot => spot.prefecture === selectedPrefectureName);
        }
        
        if (currentFilters.category === 'favorites') {
            sourceSpots = sourceSpots.filter(spot => localFavorites.includes(spot.name));
        }

        let filteredSpots = sourceSpots.filter(spot => {
            const categoryMatch = currentFilters.category === 'all' || currentFilters.category === 'favorites' || spot.category === currentFilters.category;
            const areaMatch = currentFilters.area === 'all' || spot.area === currentFilters.area;
            const tagMatch = currentFilters.tag === 'all' || (spot.tags && spot.tags.includes(currentFilters.tag));
            return categoryMatch && areaMatch && tagMatch;
        });

        if (currentSearchTerm) {
            const searchTermLower = currentSearchTerm.toLowerCase();
            const searchTermHiragana = katakanaToHiragana(searchTermLower);
    
            filteredSpots = filteredSpots.filter(spot => {
                const spotNameLower = spot.name.toLowerCase();
                const spotYomigana = (spot.yomigana && typeof spot.yomigana === 'string') ? katakanaToHiragana(spot.yomigana.toLowerCase()) : '';
    
                return spotNameLower.includes(searchTermLower) || (spotYomigana && spotYomigana.includes(searchTermHiragana));
            });
        }

        switch (currentSortOrder) {
            case 'name-asc':
                filteredSpots.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
                break;
            case 'name-desc':
                filteredSpots.sort((a, b) => b.name.localeCompare(a.name, 'ja'));
                break;
            case 'default-desc':
                filteredSpots.reverse();
                break;
            case 'default':
            default:
                break;
        }

        if (filteredSpots.length > 0) {
            filteredSpots.forEach(spot => spotsList.appendChild(createCard(spot)));
        } else {
            spotsList.innerHTML = `<p class="col-span-full text-center text-gray-500 py-10">該当するスポットはありません。</p>`;
        }
        updateListTitle();
    }

    function updateListTitle() {
        let titleText = '';
        if (currentFilters.area !== 'all') titleText += `${currentFilters.area}の`;
        
        if (currentFilters.category === 'favorites') titleText += 'お気に入り';
        else if (currentFilters.category !== 'all') titleText += `${currentFilters.category}`;
        else titleText += 'すべての';

        if (currentFilters.tag !== 'all') titleText += ` #${currentFilters.tag}`;

        titleText += 'スポット';
        listTitle.textContent = titleText;
    }

    function renderAreaMap() {
        const positions = areaPositions[currentPrefecture];
        mapContainer.innerHTML = '';

        if (!positions || positions.length === 0) {
            mapContainer.innerHTML = `<p class="text-center text-gray-500 py-10">この都道府県のエリアマップは<br>現在準備中です。</p>`;
            return;
        }

        const allBtn = document.createElement('button');
        allBtn.dataset.area = 'all';
        allBtn.textContent = '全エリア';
        allBtn.className = `map-area-button ${currentPrefecture}`;
        allBtn.style.top = '90%';
        allBtn.style.left = '90%';
        if (currentFilters.area === 'all') allBtn.classList.add('active');
        mapContainer.appendChild(allBtn);

        positions.forEach(area => {
            const button = document.createElement('button');
            button.dataset.area = area.name;
            button.textContent = area.name;
            button.className = 'map-area-button';
            button.style.top = area.top;
            button.style.left = area.left;
            if (currentFilters.area === area.name) button.classList.add('active');
            mapContainer.appendChild(button);
        });
    }

    function renderAreaList() {
        const positions = areaPositions[currentPrefecture];
        areaListContainer.innerHTML = '';

        if (!positions || positions.length === 0) {
            areaListContainer.innerHTML = `<p class="text-center text-gray-500 py-10">この都道府県のエリアリストは<br>現在準備中です。</p>`;
            return;
        }

        const allBtn = document.createElement('button');
        allBtn.dataset.area = 'all';
        allBtn.textContent = '全エリア';
        allBtn.className = 'tag-btn';
        if (currentFilters.area === 'all') allBtn.classList.add('active');
        areaListContainer.appendChild(allBtn);

        positions.forEach(area => {
            const button = document.createElement('button');
            button.dataset.area = area.name;
            button.textContent = area.name;
            button.className = 'tag-btn';
            if (currentFilters.area === area.name) button.classList.add('active');
            areaListContainer.appendChild(button);
        });
    }

    function renderAreaFilterContent() {
        areaViewSwitcher.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === areaFilterView);
        });

        if (areaFilterView === 'map') {
            mapContainer.classList.remove('hidden');
            areaListContainer.classList.add('hidden');
            renderAreaMap();
        } else {
            mapContainer.classList.add('hidden');
            areaListContainer.classList.remove('hidden');
            renderAreaList();
        }
    }

    function renderTags() {
        tagFilters.innerHTML = `<button data-filter="all" class="tag-btn">すべてのタグ</button>`;
        standardTags.forEach(tag => {
            const button = document.createElement('button');
            button.dataset.filter = tag;
            button.textContent = `#${tag}`;
            button.className = 'tag-btn';
            if (currentFilters.tag === tag) button.classList.add('active');
            tagFilters.appendChild(button);
        });
    }

    function getTransitTime(area1, area2, prefecture) {
        if (area1 === area2) return 0;
        const transitMatrix = allTransitData[prefecture];
        if (!transitMatrix) return null; 

        if (transitMatrix[area1] && transitMatrix[area1][area2] !== undefined) {
            return transitMatrix[area1][area2];
        }
        if (transitMatrix[area2] && transitMatrix[area2][area1] !== undefined) {
            return transitMatrix[area2][area1];
        }
        return null;
    }

    function parseStayTime(timeString) {
        if (!timeString) return 0;
        if (timeString.includes('1日')) return 8 * 60;
        const numbers = timeString.match(/\d+/g)?.map(Number) || [];
        if (numbers.length === 0) return 0;
        
        let totalMinutes = 0;
        if (timeString.includes('時間')) {
            totalMinutes = numbers[0] * 60;
            if (numbers.length > 1 && timeString.includes('分')) {
                totalMinutes += numbers[1];
            }
        } else if (timeString.includes('-')) {
            totalMinutes = (numbers[0] + numbers[1]) / 2;
        } else if (timeString.includes('分')) {
            totalMinutes = numbers[0];
        }
        return totalMinutes;
    }

    function generateGoogleMapsRouteUrl() {
        const plan = localPlan;
        if (plan.length === 1) {
            const spot = combinedSpots.find(s => s.name === plan[0]);
            return spot ? spot.gmaps : '#';
        }
        if (plan.length < 2) return '#';
        const baseUrl = 'https://www.google.com/maps/dir/';
        const waypoints = plan.map(spotName => {
            const spot = combinedSpots.find(s => s.name === spotName);
            if (!spot) return null;
            try {
                const url = new URL(spot.gmaps);
                const query = url.searchParams.get('query');
                return encodeURIComponent(query || spot.name);
            } catch (e) {
                return encodeURIComponent(spot.name);
            }
        }).filter(Boolean);
        return baseUrl + waypoints.join('/');
    }

    function renderPlan() {
        const plan = localPlan;
        planItemsList.innerHTML = '';
        let totalMinutes = 0;
        const isViewingOwnPlan = currentUser && currentUser.uid === viewedUserId;

        if (plan.length === 0) {
            planItemsList.innerHTML = `<p class="text-gray-500 text-center py-10">${isViewingOwnPlan ? 'プランは空です。<br>気になるスポットを追加してみましょう！' : 'このユーザーのプランは空です。'}</p>`;
        } else {
            plan.forEach((spotName, index) => {
                const spot = combinedSpots.find(s => s.name === spotName);
                if (!spot) return;
                
                totalMinutes += parseStayTime(spot.stayTime);
                
                const item = document.createElement('div');
                item.className = 'plan-item flex items-center bg-gray-50 p-3 rounded-lg shadow-sm';
                item.dataset.spotName = spot.name;
                
                item.innerHTML = `
                    <span class="move-handle text-gray-400" ${isViewingOwnPlan ? 'draggable="true"': ''}>☰</span>
                    <div class="flex-grow ml-2">
                        <p class="font-bold text-gray-800">${spot.name}</p>
                        <p class="text-sm text-gray-500">${spot.area} | ${spot.stayTime}</p>
                    </div>
                    <button class="remove-from-plan-btn text-red-500 hover:text-red-700 ml-4 p-1 rounded-full ${isViewingOwnPlan ? '' : 'hidden'}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                `;
                planItemsList.appendChild(item);
                if (isViewingOwnPlan) {
                   item.querySelector('.remove-from-plan-btn').addEventListener('click', () => removeFromPlan(spot.name));
                }

                if (index < plan.length - 1) {
                    const nextSpotName = plan[index + 1];
                    const nextSpot = combinedSpots.find(s => s.name === nextSpotName);
                    const transitEl = document.createElement('div');
                    transitEl.className = 'transit-time';

                    if (nextSpot && spot.prefecture === nextSpot.prefecture) {
                        const transitTime = getTransitTime(spot.area, nextSpot.area, spot.prefecture.replace(/[都府県]/, ''));
                        if (transitTime !== null) {
                            totalMinutes += transitTime;
                            transitEl.innerHTML = `
                                <div class="transit-time-icon">
                                    <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v1.333a1 1 0 01-1.333 1.334h-1.334A2.667 2.667 0 006 8v5.333a2.667 2.667 0 002.667 2.667h1.334a1.333 1.333 0 110 2.666H8A5.333 5.333 0 012.667 13.333V8a5.333 5.333 0 015.333-5.333h.001zm4.667 1.333a1 1 0 10-1.334-1.333A2.667 2.667 0 0010.667 4v1.333a2.667 2.667 0 002.666 2.667h1.334a1.333 1.333 0 100-2.667h-1.334A1 1 0 0114.667 4.333z" clip-rule="evenodd" /></svg>
                                </div>
                                <span class="text-sm font-semibold text-gray-600">移動: 約${transitTime}分</span>
                            `;
                        } else {
                            transitEl.innerHTML = `
                                <div class="transit-time-icon">
                                    <svg class="w-5 h-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <span class="text-xs font-semibold text-yellow-600">エリア間の移動時間は未設定です</span>
                            `;
                        }
                    } else {
                         transitEl.innerHTML = `
                            <div class="transit-time-icon">
                                <svg class="w-5 h-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <span class="text-xs font-semibold text-yellow-600">他県のため移動時間は計算されません</span>
                         `;
                    }
                    planItemsList.appendChild(transitEl);
                }
            });
        }
        
        planCountBadge.textContent = plan.length;
        planCountBadge.classList.toggle('hidden', plan.length === 0);

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        planTotalTimeEl.textContent = `${hours > 0 ? hours + '時間' : ''} ${minutes}分`;

        const mapButtonsEnabled = plan.length > 0;
        routeMapBtn.classList.toggle('opacity-50', !mapButtonsEnabled);
        routeMapBtn.classList.toggle('cursor-not-allowed', !mapButtonsEnabled);
        routeMapFromCurrentBtn.classList.toggle('opacity-50', !mapButtonsEnabled);
        routeMapFromCurrentBtn.classList.toggle('cursor-not-allowed', !mapButtonsEnabled);

        if (mapButtonsEnabled) {
            routeMapBtn.href = generateGoogleMapsRouteUrl();
        } else {
            routeMapBtn.href = '#';
        }
    }

    let draggedItem = null;
    
    function handleDragStart(e) {
        if (!e.target.classList.contains('move-handle')) {
            e.preventDefault();
            return;
        }
        draggedItem = e.target.closest('.plan-item');
        setTimeout(() => {
            if(draggedItem) draggedItem.classList.add('dragging');
        }, 0);
    }

    function handleDragOver(e) {
        if (viewedUserId !== currentUser.uid) return;
        e.preventDefault();
        const afterElement = getDragAfterElement(planItemsList, e.clientY);
        const currentDragged = document.querySelector('.dragging');
        if (!currentDragged) return;
        if (afterElement == null) {
            planItemsList.appendChild(currentDragged);
        } else {
            planItemsList.insertBefore(currentDragged, afterElement);
        }
    }
    
    function handleDrop(e) {
        e.preventDefault();
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        const newPlanOrder = [...planItemsList.querySelectorAll('.plan-item')].map(item => item.dataset.spotName);
        
        localPlan = newPlanOrder;
        renderPlan();
        
        savePlanOrder(newPlanOrder);
        draggedItem = null;
    }

    function handleTouchStart(e) {
        if (viewedUserId !== currentUser.uid || !e.target.classList.contains('move-handle')) {
            return;
        }
        e.preventDefault();
        draggedItem = e.target.closest('.plan-item');
        if (draggedItem) {
            draggedItem.classList.add('dragging');
        }
    }

    function handleTouchMove(e) {
        if (!draggedItem) return;
        e.preventDefault();
        const touch = e.touches[0];
        const afterElement = getDragAfterElement(planItemsList, touch.clientY);
        if (afterElement == null) {
            planItemsList.appendChild(draggedItem);
        } else {
            planItemsList.insertBefore(draggedItem, afterElement);
        }
    }

    function handleTouchEnd(e) {
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        const newPlanOrder = [...planItemsList.querySelectorAll('.plan-item')].map(item => item.dataset.spotName);
        
        localPlan = newPlanOrder;
        renderPlan();

        savePlanOrder(newPlanOrder);
        draggedItem = null;
    }

    planItemsList.addEventListener('dragstart', handleDragStart);
    planItemsList.addEventListener('dragover', handleDragOver);
    planItemsList.addEventListener('drop', handleDrop);
    planItemsList.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
        }
        draggedItem = null;
    });
    planItemsList.addEventListener('touchstart', handleTouchStart, { passive: false });
    planItemsList.addEventListener('touchmove', handleTouchMove, { passive: false });
    planItemsList.addEventListener('touchend', handleTouchEnd);


    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.plan-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async function openModal(spot) {
        modal.dataset.spotName = spot.name;
        document.getElementById('modal-title').textContent = spot.name;
        document.getElementById('modal-description').innerHTML = spot.description;
        document.getElementById('modal-stay-time').textContent = `平均滞在時間: ${spot.stayTime}`;
        const modalImage = document.getElementById('modal-image');
        const modalImageSource = document.getElementById('modal-image-source');

        modalImage.src = spot.image || 'https://placehold.co/600x400/E57373/FFF?text=Image+Not+Found';
        
        if (spot.imageSourceUrl && spot.imageSource) {
            modalImageSource.href = spot.imageSourceUrl;
            modalImageSource.textContent = `画像引用元: ${spot.imageSource}`;
            modalImageSource.classList.remove('hidden');
        } else {
            modalImageSource.classList.add('hidden');
        }

        modalImage.onload = () => {
            modalImageSpinner.classList.add('hidden');
            modalImage.classList.remove('hidden');
        };
        modalImage.onerror = () => {
            modalImage.src = 'https://placehold.co/600x400/E57373/FFF?text=Image+Not+Found';
            modalImageSpinner.classList.add('hidden');
            modalImage.classList.remove('hidden');
        };

        const modalTagsContainer = document.getElementById('modal-tags');
        modalTagsContainer.innerHTML = '';
         if (spot.tags) {
                spot.tags.forEach(tag => {
                    const tagEl = document.createElement('span');
                    tagEl.className = 'text-sm bg-teal-100 text-teal-800 px-3 py-1 rounded-full';
                    tagEl.textContent = `#${tag}`;
                    modalTagsContainer.appendChild(tagEl);
                });
       }

        const modalWebsite = document.getElementById('modal-website');
        const modalMap = document.getElementById('modal-map');
        modalMap.href = spot.gmaps;

        if (spot.website && spot.website !== '#') {
            modalWebsite.href = spot.website;
            modalWebsite.classList.remove('hidden');
        } else {
            modalWebsite.classList.add('hidden');
        }

        showOverlay(modal);
    }
    
    function closeModal() {
        hideOverlay(modal);
    }

    function showConfirmationModal(message, actionButtonText, buttonClass, onConfirm) {
        confirmationMessage.innerHTML = message.replace(/\n/g, '<br>');
        confirmActionBtn.textContent = actionButtonText;

        confirmActionBtn.className = `py-2 px-6 text-white rounded-lg font-semibold transition-colors ${buttonClass} hover:${buttonClass.replace('500', '600')}`;

        showOverlay(confirmationOverlay);

        confirmActionBtn.onclick = () => {
            onConfirm();
            hideOverlay(confirmationOverlay);
        };
    }

    function showCrossPrefectureConfirmation(spotToAdd, firstSpotInPlan) {
        crossPrefectureMessage.innerHTML = `「${firstSpotInPlan.prefecture}」のプランに「${spotToAdd.prefecture}」のスポットを追加しようとしています。<br>移動時間が正しく計算されませんが、よろしいですか？`;
        showOverlay(crossPrefectureOverlay);

        const closeOverlay = () => {
            hideOverlay(crossPrefectureOverlay);
            crossPrefectureAddBtn.onclick = null;
            crossPrefectureFavoriteBtn.onclick = null;
            crossPrefectureCancelBtn.onclick = null;
        }

        crossPrefectureAddBtn.onclick = () => {
            _addSpotToPlan(spotToAdd.name);
            closeOverlay();
        };
        crossPrefectureFavoriteBtn.onclick = () => {
            toggleFavorite(spotToAdd.name);
            showInfoModal(`「${spotToAdd.name}」をお気に入りに追加しました。`);
            closeOverlay();
        };
        crossPrefectureCancelBtn.onclick = closeOverlay;
    }

    authBtn.addEventListener('click', handleAuth);
    guestLoginBtn.addEventListener('click', handleGuestLogin);
    emailInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') authBtn.click(); });
    passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') authBtn.click(); });
    confirmPasswordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') authBtn.click(); });
    authSwitchLink.addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
    logoutBtnSettings.addEventListener('click', handleLogout);

    prefectureFilter.addEventListener('change', (e) => {
        currentPrefecture = e.target.value;
        currentFilters.area = 'all'; 
        
        if (currentPrefecture === 'all' || !areaPositions[currentPrefecture] || areaPositions[currentPrefecture].length === 0) {
            openAreaFilterBtn.disabled = true;
        } else {
            openAreaFilterBtn.disabled = false;
        }
        
        renderSpots();
    });

    categoryFilters.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-btn');
        if (button) {
            currentFilters.category = button.dataset.filter;
            categoryFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active-filter'));
            button.classList.add('active-filter');
            renderSpots();
        }
    });
    
    openAreaFilterBtn.addEventListener('click', () => {
        renderAreaFilterContent();
        showOverlay(areaFilterOverlay);
    });
    closeAreaFilterBtn.addEventListener('click', () => hideOverlay(areaFilterOverlay));
    
    areaViewSwitcher.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.view) {
            areaFilterView = button.dataset.view;
            renderAreaFilterContent();
        }
    });

    areaListContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.tag-btn');
        if (button) {
            currentFilters.area = button.dataset.area;
            renderSpots();
            hideOverlay(areaFilterOverlay);
        }
    });

    mapContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.map-area-button');
        if (button) {
            currentFilters.area = button.dataset.area;
            renderSpots();
            hideOverlay(areaFilterOverlay);
        }
    });
    
    openTagFilterBtn.addEventListener('click', () => {
        renderTags();
        showOverlay(tagFilterOverlay);
    });
    closeTagFilterBtn.addEventListener('click', () => hideOverlay(tagFilterOverlay));

    tagFilters.addEventListener('click', (e) => {
        const button = e.target.closest('.tag-btn');
        if (button) {
            currentFilters.tag = button.dataset.filter;
            renderSpots();
            hideOverlay(tagFilterOverlay);
        }
    });

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
    
    myPlanBtn.addEventListener('click', () => {
        myPlanPanelOverlay.classList.remove('hidden');
        myPlanPanel.classList.remove('translate-x-full');
        toggleBodyScroll(true);
    });
    const closePlanPanel = () => {
        myPlanPanel.classList.add('translate-x-full');
        myPlanPanelOverlay.classList.add('hidden');
        toggleBodyScroll(false);
    };
    myPlanCloseBtn.addEventListener('click', closePlanPanel);
    myPlanPanelOverlay.addEventListener('click', closePlanPanel);

    clearPlanBtn.addEventListener('click', () => {
        showConfirmationModal('本当にすべてのプランを削除しますか？', '削除', 'bg-red-500', clearPlan);
    });

    confirmCancelBtn.addEventListener('click', () => hideOverlay(confirmationOverlay));
    confirmationOverlay.addEventListener('click', (e) => {
        if (e.target === confirmationOverlay) hideOverlay(confirmationOverlay);
    });

    copyPlanBtn.addEventListener('click', () => {
        const plan = localPlan;
        if (plan.length === 0) return;

        let planText = `【${currentUser.isAnonymous ? 'ゲスト' : currentUser.displayName}さんのVLOG旅プラン】\n`;
        let totalMinutes = 0;
        
        plan.forEach((spotName, index) => {
            const spot = combinedSpots.find(s => s.name === spotName);
            if (!spot) return;

            const stayTime = parseStayTime(spot.stayTime);
            totalMinutes += stayTime;
            planText += `\n📍 ${index + 1}. ${spot.name}\n`;
            planText += `   (滞在: ${spot.stayTime})\n`;

            if (index < plan.length - 1) {
                const nextSpot = combinedSpots.find(s => s.name === plan[index + 1]);
                if (nextSpot && spot.prefecture === nextSpot.prefecture) {
                    const transitTime = getTransitTime(spot.area, nextSpot.area, spot.prefecture.replace(/[都府県]/, ''));
                    if (transitTime !== null) {
                        totalMinutes += transitTime;
                        planText += `   ⬇️\n   (移動: 約${transitTime}分)\n`;
                    } else {
                        planText += `   ⬇️\n   (移動: 時間未設定)\n`;
                    }
                } else {
                    planText += `   ⬇️\n   (他県への移動)\n`;
                }
            }
        });

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const totalTimeText = `${hours > 0 ? hours + '時間' : ''}${minutes}分`;

        planText += `\n--------------------\n`;
        planText += `合計目安時間: ${totalTimeText} (移動時間込み)`;

        copyTextarea.value = planText;
        copyTextarea.select();
        document.execCommand('copy');

        const originalText = copyPlanBtn.textContent;
        copyPlanBtn.textContent = 'コピーしました！';
        copyPlanBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        copyPlanBtn.classList.remove('bg-teal-500', 'hover:bg-teal-600');
        
        setTimeout(() => {
            copyPlanBtn.textContent = originalText;
            copyPlanBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
            copyPlanBtn.classList.add('bg-teal-500', 'hover:bg-teal-600');
        }, 2000);
    });
    
    routeMapFromCurrentBtn.addEventListener('click', () => {
        if (localPlan.length === 0) {
            showInfoModal("プランにスポットがありません。");
            return;
        }
        if (!navigator.geolocation) {
            showInfoModal("お使いのブラウザは位置情報機能に対応していません。");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const baseUrl = 'https://www.google.com/maps/dir/';
                const origin = `${latitude},${longitude}`;
                const waypoints = localPlan.map(spotName => {
                    const spot = combinedSpots.find(s => s.name === spotName);
                    if (!spot) return null;
                    try {
                        const url = new URL(spot.gmaps);
                        const queryParam = url.searchParams.get('q');
                        if (queryParam) {
                            return encodeURIComponent(queryParam);
                        }
                        const placeIdMatch = url.pathname.match(/\/place\/([^/]+)/);
                        if (placeIdMatch && placeIdMatch[1]) {
                            return 'place_id:' + decodeURIComponent(placeIdMatch[1]);
                        }
                        const latLngMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
                        if (latLngMatch) {
                            return `${latLngMatch[1]},${latLngMatch[2]}`;
                        }
                        return encodeURIComponent(spot.name);
                    } catch (e) {
                        return encodeURIComponent(spot.name);
                    }
                }).filter(Boolean);

                const finalUrl = baseUrl + origin + '/' + waypoints.join('/');
                window.open(finalUrl, '_blank');
            },
            (error) => {
                showInfoModal("位置情報を取得できませんでした。ブラウザの設定を確認してください。");
                console.error("Geolocation error:", error);
            }
        );
    });

    const eyeIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z"></path></svg>`;
    const eyeSlashIcon = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;
    
    passwordToggle.innerHTML = eyeIcon;
    confirmPasswordToggle.innerHTML = eyeIcon;

    function setupPasswordToggle(toggleBtn, inputEl) {
         toggleBtn.addEventListener('click', () => {
             const type = inputEl.getAttribute('type') === 'password' ? 'text' : 'password';
             inputEl.setAttribute('type', type);
             toggleBtn.innerHTML = type === 'password' ? eyeIcon : eyeSlashIcon;
         });
    }
    
    setupPasswordToggle(passwordToggle, passwordInput);
    setupPasswordToggle(confirmPasswordToggle, confirmPasswordInput);

    userSettingsBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        
        if (currentUser.isAnonymous) {
            settingsIconSection.classList.add('hidden');
            settingsUsernameSection.classList.add('hidden');
            settingsEmailSection.classList.add('hidden');
            saveSettingsBtn.classList.add('hidden');
        } else {
            const userDocRef = doc(db, "users", currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            const userData = userDocSnap.exists() ? userDocSnap.data() : {};

            settingsIconSection.classList.remove('hidden');
            settingsUsernameSection.classList.remove('hidden');
            settingsEmailSection.classList.remove('hidden');
            saveSettingsBtn.classList.remove('hidden');

            settingsUsernameInput.value = currentUser.displayName || '';
            settingsEmail.textContent = currentUser.email || 'N/A';
            settingsIconPreview.src = currentUser.photoURL || 'https://placehold.co/40x40/D35400/FFF?text=';
        }
        showOverlay(userSettingsOverlay);
    });
    closeUserSettingsBtn.addEventListener('click', () => hideOverlay(userSettingsOverlay));
    
    saveSettingsBtn.addEventListener('click', async () => {
        const newDisplayName = settingsUsernameInput.value.trim();

        try {
            if (newDisplayName && newDisplayName !== currentUser.displayName) {
                await updateProfile(currentUser, { displayName: newDisplayName });
                const userDocRef = doc(db, "users", currentUser.uid);
                await updateDoc(userDocRef, { displayName: newDisplayName });
            }
            
            showInfoModal("設定を保存しました。");
            hideOverlay(userSettingsOverlay);
            initAppForUser(currentUser); 
        } catch (error) {
            showInfoModal("設定の保存に失敗しました。");
            console.error("Settings save error:", error);
        }
    });
    
    iconUploadBtn.addEventListener('click', () => iconUploadInput.click());
    
    iconUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            cropperImage.src = event.target.result;
            showOverlay(cropperOverlay);
            
            if (cropper) {
                cropper.destroy();
            }
            
            cropper = new Cropper(cropperImage, {
                aspectRatio: 1,
                viewMode: 1,
                background: false,
                autoCropArea: 0.8,
            });
        };
        reader.readAsDataURL(file);
        iconUploadInput.value = ''; 
    });

    cropperCancelBtn.addEventListener('click', () => {
        hideOverlay(cropperOverlay);
        if(cropper) cropper.destroy();
    });

    cropperSaveBtn.addEventListener('click', async () => {
        if (!cropper || !currentUser) return;

        iconUploadSpinner.classList.remove('hidden');
        cropperSaveBtn.disabled = true;

        cropper.getCroppedCanvas({
            width: 256,
            height: 256,
            imageSmoothingQuality: 'high',
        }).toBlob(async (blob) => {
            const storageRef = ref(storage, `profile_icons/${currentUser.uid}`);
            
            try {
                const snapshot = await uploadBytes(storageRef, blob);
                const downloadURL = await getDownloadURL(snapshot.ref);

                await updateProfile(currentUser, { photoURL: downloadURL });
                await updateDoc(doc(db, "users", currentUser.uid), { photoURL: downloadURL });

                showInfoModal("アイコンを更新しました。");
                initAppForUser(currentUser); 
            } catch (error) {
                console.error("Icon upload error: ", error);
                showInfoModal("アイコンのアップロードに失敗しました。");
            } finally {
                iconUploadSpinner.classList.add('hidden');
                cropperSaveBtn.disabled = false;
                hideOverlay(cropperOverlay);
                if(cropper) cropper.destroy();
            }
        }, 'image/png');
    });
    
    function renderJapanMapButtons() {
        const existingButtons = japanMapContainer.querySelectorAll('.prefecture-map-button');
        existingButtons.forEach(btn => btn.remove());

        const availablePrefectureIds = availablePrefectures.map(p => p.id);

        Object.entries(prefectureMapPositions).forEach(([id, pos]) => {
            if (availablePrefectureIds.includes(id)) {
                const button = document.createElement('button');
                button.className = 'prefecture-map-button'; 
                button.style.top = pos.top;
                button.style.left = pos.left;
                
                const prefectureName = prefectureIdToNameMap[id] || id;
                button.textContent = prefectureName;
                button.dataset.prefectureId = id;

                button.addEventListener('click', () => {
                    if (onPrefectureSelectCallback) {
                        onPrefectureSelectCallback(prefectureName);
                        hideOverlay(prefectureSelectOverlay);
                    }
                });
                japanMapContainer.appendChild(button);
            }
        });
    }

    function showPrefectureSelectOverlay(title, message, callback) {
        prefectureSelectTitle.textContent = title;
        prefectureSelectMessage.textContent = message;
        prefectureSelectButtons.innerHTML = ''; 
        onPrefectureSelectCallback = callback;

        if (Object.keys(prefectureMapPositions).length > 0) {
            renderJapanMapButtons(); 
        } else {
            japanMapContainer.innerHTML = '<p class="text-gray-500">地図データの読み込みに失敗しました。</p>';
        }
        
        showOverlay(prefectureSelectOverlay);
    }
    
    userSwitcher.addEventListener('change', (e) => {
        const selectedUserId = e.target.value;
        if (selectedUserId) {
            const selectedUserName = e.target.options[e.target.selectedIndex].text;
            viewUserPlan(selectedUserId, selectedUserName);
        } else {
            viewUserPlan(currentUser.uid, currentUser.displayName || 'ゲスト');
        }
    });

    addSpotBtn.addEventListener('click', () => {
        showOverlay(addSpotOverlay);
    });
    closeAddSpotBtn.addEventListener('click', () => {
        hideOverlay(addSpotOverlay);
    });
    submitSpotBtn.addEventListener('click', async () => {
        const spotName = newSpotName.value.trim();
        const spotUrl = newSpotUrl.value.trim();

        if (!spotName || !spotUrl) {
            showInfoModal("スポット名とURLの両方を入力してください。");
            return;
        }
        if (spotName.length < 3) {
            showInfoModal("スポット名は3文字以上で入力してください。");
            return;
        }
        try {
            new URL(spotUrl);
        } catch (_) {
            showInfoModal("有効なURLを入力してください。");
            return;
        }
        if (!currentUser) {
            showInfoModal("ログインが必要です。");
            return;
        }
        if (combinedSpots.some(spot => spot.name === spotName)) {
            showInfoModal("このスポットは既に登録されています。");
            return;
        }

        submitSpotSpinner.classList.remove('hidden');
        submitSpotBtn.disabled = true;
        
        try {
            const result = await analyzeSpotSuggestion({
                spotName: spotName,
                spotUrl: spotUrl,
                areaPositions: areaPositions,
                standardTags: standardTags
            });
            
            const aiData = result.data;

            if (!aiData.isNameConsistent) {
                showInfoModal("提案されたスポット名と公式サイトの内容が一致しないようです。");
                submitSpotSpinner.classList.add('hidden');
                submitSpotBtn.disabled = false;
                return;
            }
            if (!aiData.prefecture || !supportedPrefectureNames.includes(aiData.prefecture)) {
                pendingReAnalysisData = { ...aiData, originalName: spotName, originalUrl: spotUrl };
                showOverlay(reAnalysisOverlay);
                submitSpotSpinner.classList.add('hidden');
                submitSpotBtn.disabled = false;
                return; 
            }

            await addDoc(collection(db, "spot_submissions"), {
                ...aiData,
                originalName: spotName,
                originalUrl: spotUrl,
                submittedBy: currentUser.uid,
                submittedAt: serverTimestamp(),
                status: "pending"
            });

            showInfoModal("スポットの提案を送信しました。管理者の承認をお待ちください。");
            newSpotName.value = '';
            newSpotUrl.value = '';
            hideOverlay(addSpotOverlay);

        } catch (error) {
            console.error("AI分析または提案の送信に失敗しました:", error);
            showInfoModal(`エラーが発生しました: ${error.message}`);
        } finally {
            submitSpotSpinner.classList.add('hidden');
            submitSpotBtn.disabled = false;
        }
    });
    
    closeReAnalysisBtn.addEventListener('click', () => hideOverlay(reAnalysisOverlay));
    
    reSubmitSpotBtn.addEventListener('click', async () => {
         const gmapsUrl = reAnalysisGmapsUrl.value.trim();
         if (!gmapsUrl) {
             showInfoModal("GoogleマップのURLを入力してください。");
             return;
         }
         reSubmitSpotSpinner.classList.remove('hidden');
         reSubmitSpotBtn.disabled = true;

         try {
             const result = await reAnalyzeSpotSuggestion({
                 ...pendingReAnalysisData,
                 gmapsUrl: gmapsUrl,
                 areaPositions: areaPositions
             });

             const reAnalyzedData = result.data;
             const finalData = { ...pendingReAnalysisData, ...reAnalyzedData };

             if (!finalData.prefecture || !supportedPrefectureNames.includes(finalData.prefecture)) {
                 showInfoModal(`再分析しましたが、対応していない都道府県のようです。現在、${supportedPrefectureNames.join('、')}のスポットのみ提案を受け付けています。`);
                 return; 
             }

             await addDoc(collection(db, "spot_submissions"), {
                 ...finalData,
                 submittedBy: currentUser.uid,
                 submittedAt: serverTimestamp(),
                 status: "pending"
             });

             showInfoModal("スポットの提案を送信しました。管理者の承認をお待ちください。");
             newSpotName.value = '';
             newSpotUrl.value = '';
             hideOverlay(addSpotOverlay);
             hideOverlay(reAnalysisOverlay);

         } catch(error) {
              console.error("AI再分析または提案の送信に失敗しました:", error);
              showInfoModal(`エラーが発生しました: ${error.message}`);
         } finally {
              reSubmitSpotSpinner.classList.add('hidden');
              reSubmitSpotBtn.disabled = false;
         }
    });

    mailboxBtn.addEventListener('click', () => {
        myPlanPanelOverlay.classList.remove('hidden');
        mailboxPanel.classList.remove('translate-x-full');
        toggleBodyScroll(true);
    });

    const closeMailboxPanel = async () => {
        mailboxPanel.classList.add('translate-x-full');
        myPlanPanelOverlay.classList.add('hidden');
        toggleBodyScroll(false);

        if (currentUser && !currentUser.isAnonymous) {
            const unreadQuery = query(collection(db, "users", currentUser.uid, "mailbox"), where("read", "==", false));
            try {
                const unreadSnapshot = await getDocs(unreadQuery);
                if (!unreadSnapshot.empty) {
                    const batch = writeBatch(db);
                    unreadSnapshot.forEach(doc => {
                        batch.update(doc.ref, { read: true });
                    });
                    await batch.commit();
                }
            } catch (error) {
                console.error("Error marking personal notifications as read:", error);
            }
        }

        const latestTimestamp = Math.max(0, ...localAnnouncements.map(n => n.createdAt?.toMillis() || 0));
        localStorage.setItem('lastReadAnnouncementTimestamp', latestTimestamp);
        
        mailboxBadge.classList.add('hidden');
    };
    mailboxCloseBtn.addEventListener('click', closeMailboxPanel);
    mailboxPanelOverlay.addEventListener('click', closeMailboxPanel);

   function renderMailbox(docs, lastReadTimestamp) {
        mailboxList.innerHTML = '';
        if (docs.length === 0) {
            mailboxList.innerHTML = '<p class="text-center text-gray-500 py-10">お知らせはありません。</p>';
            return;
        }

        docs.forEach(docData => {
            const isRead = docData.type === 'personal' ? docData.read : (docData.createdAt?.toMillis() || 0) <= lastReadTimestamp;
            const item = document.createElement('div');
            item.className = `p-4 border-b ${!isRead ? 'bg-orange-50 font-bold' : 'bg-white'}`;
            
            const date = docData.createdAt ? docData.createdAt.toDate().toLocaleString('ja-JP') : '日付不明';
            const rawMessage = docData.message || '';
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const formattedMessage = rawMessage.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all">$1</a>');

            item.innerHTML = `
                <h4 class="text-md ${!isRead ? 'text-orange-800' : 'text-gray-800'}">${docData.title}</h4>
                <p class="text-sm mt-1 ${!isRead ? 'text-orange-700' : 'text-gray-600'}">${formattedMessage}</p>
                <p class="text-xs text-gray-400 mt-2 text-right">${date}</p>
            `;
            mailboxList.appendChild(item);
        });
    }
    markAllAsReadBtn.addEventListener('click', async () => {
        if (!currentUser || currentUser.isAnonymous) return;
        
        const unreadQuery = query(collection(db, "users", currentUser.uid, "mailbox"), where("read", "==", false));
        try {
            const unreadSnapshot = await getDocs(unreadQuery);
            if (!unreadSnapshot.empty) {
                const batch = writeBatch(db);
                unreadSnapshot.forEach(doc => {
                    batch.update(doc.ref, { read: true });
                });
                await batch.commit();
            }
        } catch (error) {
            console.error("Error in markAllAsReadBtn for personal notifications:", error);
        }

        const latestTimestamp = Math.max(0, ...localAnnouncements.map(n => n.createdAt?.toMillis() || 0));
        localStorage.setItem('lastReadAnnouncementTimestamp', latestTimestamp);
    });
    
    reportImageBtn.addEventListener('click', async () => {
        try {
            const spotName = modal.dataset.spotName;
            const spot = combinedSpots.find(s => s.name === spotName);
            if (!spot || !currentUser) return;

            const reportsRef = collection(db, "image_reports");
            const q = query(reportsRef, where("spotName", "==", spotName), where("status", "==", "pending"));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                showInfoModal("このスポットの画像は既に報告されています。");
                return;
            }

            showConfirmationModal(
                `「${spotName}」の画像がスポットと無関係、または不適切であると報告しますか？`,
                "報告する",
                "bg-red-500",
                async () => {
                    try {
                        await addDoc(collection(db, "image_reports"), {
                            spotName: spot.name,
                            prefecture: spot.prefecture,
                            currentImageUrl: spot.image,
                            submittedBy: currentUser.uid,
                            submittedAt: serverTimestamp(),
                            status: "pending"
                        });
                        showInfoModal("ご報告ありがとうございます。管理者が確認します。");
                        closeModal();
                    } catch (error) {
                        console.error("Error submitting image report:", error);
                        showInfoModal("報告の送信に失敗しました。");
                    }
                }
            );
        } catch (error) {
            console.error("Image report button error:", error);
            showInfoModal("報告処理中にエラーが発生しました。コンソールで詳細を確認してください。");
        }
    });

    // ▼▼▼ MODIFIED EVENT LISTENER ▼▼▼
    reportSpotBtn.addEventListener('click', () => {
        const spotName = modal.dataset.spotName;
        if (!spotName || !currentUser) return;

        reportSpotTitle.textContent = `「${spotName}」の問題を報告`;
        reportReasonSelect.value = '閉業している';
        reportDetailsTextarea.value = '';
        showOverlay(reportSpotOverlay);
    });

    cancelReportBtn.addEventListener('click', () => {
        hideOverlay(reportSpotOverlay);
    });

    submitReportBtn.addEventListener('click', async () => {
        const spotName = modal.dataset.spotName;
        const spot = combinedSpots.find(s => s.name === spotName);
        if (!spot || !currentUser) return;

        const reason = reportReasonSelect.value;
        const details = reportDetailsTextarea.value.trim();

        try {
            await reportSpot({ 
                spotName: spot.name, 
                prefecture: spot.prefecture,
                area: spot.area,
                reason: reason,
                details: details || null
            });
            showInfoModal("ご報告ありがとうございます。管理者が内容を確認します。");
            hideOverlay(reportSpotOverlay);
            closeModal();
        } catch (error) {
            console.error("Error submitting spot report:", error);
            showInfoModal("報告の送信に失敗しました。");
        }
    });
    // ▲▲▲ END OF MODIFICATION ▲▲▲
    
    let searchDebounceTimer;
    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.trim();
        renderSpots();
    
        clearTimeout(searchDebounceTimer);
        if (currentSearchTerm) {
            searchDebounceTimer = setTimeout(() => {
                recordAnalyticsEvent({
                    eventType: 'search',
                    payload: { term: currentSearchTerm }
                }).catch(console.error);
            }, 1000);
        }
    });

    sortOrder.addEventListener('change', (e) => {
        currentSortOrder = e.target.value;
        renderSpots();
    });

    function showImageViewer(imageUrl) {
        imageViewerImg.src = imageUrl;
        showOverlay(imageViewerOverlay);
    }

    userDisplay.addEventListener('click', (e) => {
        if(e.target.classList.contains('profile-icon')) {
            showImageViewer(e.target.src);
        }
    });

    modalContent.addEventListener('click', (e) => {
        if(e.target.id === 'modal-image') {
            showImageViewer(e.target.src);
        }
    });

    imageViewerOverlay.addEventListener('click', () => {
        hideOverlay(imageViewerOverlay);
    });
    
    mobileFilterToggle.addEventListener('click', () => {
        const isOpen = !navContentWrapper.classList.contains('hidden');
        navContentWrapper.classList.toggle('hidden');
        mobileFilterToggle.classList.toggle('open', !isOpen);
        mobileFilterToggleText.textContent = isOpen ? 'フィルターと検索を開く' : 'フィルターと検索を閉じる';
    });
    
    openJapanMapBtn.addEventListener('click', () => {
        showPrefectureSelectOverlay(
            '都道府県を選択',
            '地図から行きたい都道府県を選んでください。',
            (selectedPrefectureName) => {
                const selectedPrefectureId = prefectureNameToIdMap[selectedPrefectureName] || 'all';
                prefectureFilter.value = selectedPrefectureId;
                prefectureFilter.dispatchEvent(new Event('change'));
            }
        );
    });

    prefectureSelectCancelBtn.addEventListener('click', () => {
        hideOverlay(prefectureSelectOverlay);
    });

    prefectureSelectOverlay.addEventListener('click', (e) => {
        if (e.target === prefectureSelectOverlay) {
            hideOverlay(prefectureSelectOverlay);
        }
    });

    function renderAll() {
        renderSpots();
        renderPlan();
    }
    
    renderAll();

});
