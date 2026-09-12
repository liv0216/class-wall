// ===================================================
// 우리 반 담벼락 - 시작점
// ===================================================

// Gemini API 키 및 관련 로컬 데이터 정리
try {
  localStorage.removeItem("local_gemini_api_key");
} catch (e) {}


// Firebase SDK 모듈 불러오기 (CDN ES Module 방식)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyC02tB4Cpc0ulT4udfDWtsQ5GZe4eBsfz4",
  authDomain: "calss-wall.firebaseapp.com",
  projectId: "calss-wall",
  storageBucket: "calss-wall.firebasestorage.app",
  messagingSenderId: "420622218957",
  appId: "1:420622218957:web:5da15822a79b2961955b84"
};

// Firebase, Firestore, Auth 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 현재 로그인한 사용자 정보 (로그인 안 됨: null)
let currentUser = null;

// ===================================================
// 사용자 역할(teacher / student) 관리
// ===================================================

// 교사(teacher)로 지정할 이메일 및 UID 목록
const TEACHER_EMAILS = [
  "liv0216@gmail.com"
];

const TEACHER_UIDS = [
  // 추가 교사 UID가 필요하면 여기에 등록합니다.
];

// 현재 사용자의 역할을 반환합니다 ("teacher" 또는 "student")
function getUserRole(user) {
  if (!user) return null;
  // 1) TEACHER_EMAILS 또는 TEACHER_UIDS 목록에 포함되어 있거나
  // 2) 로컬 스토리지에 교사 권한이 설정되어 있는 경우
  const isTeacher =
    (user.email && TEACHER_EMAILS.includes(user.email)) ||
    TEACHER_UIDS.includes(user.uid) ||
    localStorage.getItem("role_" + user.uid) === "teacher";

  return isTeacher ? "teacher" : "student";
}


// ===================================================
// 보드(Board) 상태 및 관리
// ===================================================

// URL 파라미터에서 공유된 보드 ID 확인 (?board=보드ID 또는 ?b=보드ID)
const urlParams = new URLSearchParams(window.location.search);
const sharedBoardFromUrl = urlParams.get("board") || urlParams.get("b");

let currentBoardId = sharedBoardFromUrl || localStorage.getItem("current_board_id") || "default";
let currentBoard = null;
let boardsList = [];

// Firestore의 boards 컬렉션에서 보드 목록을 가져옵니다.
async function loadBoards() {
  try {
    const q = query(collection(db, "boards"), orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 기본 보드가 없으면 기본 보드를 준비합니다.
    let defaultBoard = list.find(b => b.id === "default");
    if (!defaultBoard) {
      const defaultData = {
        title: "기본 담벼락",
        description: "우리 반 공통 이야기 공간",
        isLocked: false,
        createdAt: 1757030400000
      };
      const role = currentUser ? getUserRole(currentUser) : null;
      if (role === "teacher") {
        try {
          await setDoc(doc(db, "boards", "default"), defaultData);
        } catch (e) {
          console.warn("기본 보드 생성 건너뜀:", e);
        }
      }
      defaultBoard = { id: "default", ...defaultData };
      list.unshift(defaultBoard);
    }

    boardsList = list;

    // URL 공유 링크로 들어온 경우 해당 보드를 최우선 선택
    if (sharedBoardFromUrl) {
      currentBoard = boardsList.find(b => b.id === sharedBoardFromUrl) || boardsList[0] || defaultBoard;
    } else {
      currentBoard = boardsList.find(b => b.id === currentBoardId) || boardsList[0] || defaultBoard;
    }
    currentBoardId = currentBoard.id;
    localStorage.setItem("current_board_id", currentBoardId);

    updateBoardHeaderUI();
    return boardsList;
  } catch (err) {
    console.error("보드 목록 로드 실패 (기본 보드로 복구):", err);
    const fallbackBoard = {
      id: "default",
      title: "기본 담벼락",
      description: "우리 반 공통 이야기 공간",
      isLocked: false
    };
    boardsList = [fallbackBoard];
    currentBoard = fallbackBoard;
    currentBoardId = "default";
    updateBoardHeaderUI();
    return boardsList;
  }
}

// 새 보드를 생성합니다 (교사 전용)
async function createBoard(title, description, isLocked = false) {
  const newBoardRef = doc(collection(db, "boards"));
  const boardData = {
    title: title.trim(),
    description: (description || "").trim(),
    isLocked: Boolean(isLocked),
    createdAt: Date.now(),
    createdBy: currentUser ? currentUser.uid : null
  };
  await setDoc(newBoardRef, boardData);
  await loadBoards();
  return newBoardRef.id;
}

// 보드 설정을 업데이트합니다 (잠금 등)
async function updateBoardSettings(boardId, updates) {
  await updateDoc(doc(db, "boards", boardId), updates);
  await loadBoards();
}

// 보드를 삭제합니다 (기본 보드 제외)
async function deleteBoard(boardId) {
  if (boardId === "default") {
    alert("기본 담벼락은 삭제할 수 없습니다.");
    return;
  }
  await deleteDoc(doc(db, "boards", boardId));
  if (currentBoardId === boardId) {
    currentBoardId = "default";
    localStorage.setItem("current_board_id", "default");
  }
  await loadBoards();
  await render();
}

// ===================================================
// 첨부파일 (사진 & 파일) 상태 및 최적화 처리
// Spark 무료 요금제에서 별도 Storage 버킷 오류 없이 즉시 동작하도록
// 이미지는 Canvas로 최적 압축(50~150KB), 파일은 DataURL로 인라인 안전 처리
// ===================================================

let pendingAttachments = [];

// 이미지 리사이징 압축 (가로/세로 최대 1000px, JPEG 0.75 품질로 압축)
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 1000;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        resolve({
          type: "image",
          name: file.name,
          size: Math.round(dataUrl.length * 0.75),
          url: dataUrl
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 일반 문서/파일 처리 (1.5MB 이하)
function processGenericFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 1.5 * 1024 * 1024) {
      alert(`파일 '${file.name}'의 크기가 너무 큽니다. 1.5MB 이하 파일만 첨부 가능합니다.`);
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      resolve({
        type: "file",
        name: file.name,
        size: file.size,
        url: e.target.result
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 파일 용량 표기 포맷터
function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}



// ===================================================
// 이모지 반응 & 댓글 기능
// ===================================================

const REACTION_TYPES = [
  { key: "heart", emoji: "❤️", label: "좋아요" },
  { key: "light", emoji: "💡", label: "멋져요" },
  { key: "clap", emoji: "👏", label: "최고예요" },
  { key: "empathy", emoji: "🙌", label: "공감해요" }
];

// 이모지 반응 토글
async function toggleReaction(memoId, emojiKey) {
  if (!currentUser) {
    alert("로그인 후 반응을 남길 수 있습니다.");
    return;
  }
  const role = getUserRole(currentUser);
  if (currentBoard && currentBoard.isLocked && role !== "teacher") {
    alert("현재 담벼락이 잠겨 있어 반응을 남길 수 없습니다.");
    return;
  }

  const memoRef = doc(db, "memos", memoId);
  const snap = await getDoc(memoRef);
  if (!snap.exists()) return;

  const memoData = snap.data();
  const reactions = memoData.reactions || {};
  const userList = reactions[emojiKey] || [];
  const myUid = currentUser.uid;

  if (userList.includes(myUid)) {
    reactions[emojiKey] = userList.filter(uid => uid !== myUid);
  } else {
    reactions[emojiKey] = [...userList, myUid];
  }

  await updateDoc(memoRef, { reactions });
  await render();
}

// 친구 글에 한 줄 댓글 남기기
async function addComment(memoId, commentText) {
  if (!currentUser) {
    alert("로그인 후 댓글을 남길 수 있습니다.");
    return;
  }
  const role = getUserRole(currentUser);
  if (currentBoard && currentBoard.isLocked && role !== "teacher") {
    alert("현재 담벼락이 잠겨 있어 댓글을 남길 수 없습니다.");
    return;
  }
  if (!commentText || commentText.trim() === "") return;

  const memoRef = doc(db, "memos", memoId);
  const snap = await getDoc(memoRef);
  if (!snap.exists()) return;

  const memoData = snap.data();
  const comments = memoData.comments || [];
  comments.push({
    id: "c_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    uid: currentUser.uid,
    author: currentUser.displayName || (role === "teacher" ? "선생님" : "학생"),
    role: role,
    text: commentText.trim(),
    createdAt: Date.now()
  });

  await updateDoc(memoRef, { comments });
  await render();
}

// ===================================================
// 데이터를 다루는 함수 세 개 (Firestore 연동)
// ===================================================

// 메모를 읽어 옵니다.
// Firestore의 memos 컬렉션에서 올린 시각(createdAt) 순서대로 가져오며, 현재 활성 보드의 메모를 반환합니다.
async function loadMemos() {
  const q = query(collection(db, "memos"), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  const memoList = [];
  snapshot.forEach(function (docSnap) {
    const data = docSnap.data();
    const memoBoardId = data.boardId || "default";
    if (memoBoardId === currentBoardId) {
      memoList.push({
        id: docSnap.id,
        ...data
      });
    }
  });
  return memoList;
}

// 메모를 새로 씁니다.
// Firestore의 memos 컬렉션에 새 문서를 추가합니다 (5글자 이상, 로그인 사용자 정보, 보드 ID 및 사진/파일 첨부 포함).
async function addMemo(text, attachments = []) {
  if (!currentUser) {
    alert("로그인 후 메모를 쓸 수 있습니다.");
    return;
  }

  // 보드 잠금 확인: 교사가 아니고 보드가 잠겨있으면 작성을 제한합니다.
  const role = getUserRole(currentUser);
  if (currentBoard && currentBoard.isLocked && role !== "teacher") {
    alert("선생님이 담벼락을 잠가 두어 새로운 글을 쓸 수 없습니다.");
    return;
  }

  if (text.length < 5) {
    alert("메모는 5글자 이상 입력해 주세요.");
    return;
  }

  const images = (attachments || []).filter(a => a.type === "image");
  const files = (attachments || []).filter(a => a.type === "file");

  await addDoc(collection(db, "memos"), {
    text: text,
    createdAt: Date.now(),
    uid: currentUser.uid,
    author: currentUser.displayName || (role === "teacher" ? "선생님" : "학생"),
    role: role,
    boardId: currentBoardId,
    images: images,
    files: files,
    reactions: {},
    comments: []
  });

  // 첨부파일 초기화
  pendingAttachments = [];
  renderAttachmentPreview();
}

// 메모를 지웁니다.
// Firestore의 memos 컬렉션에서 해당 ID의 문서를 삭제합니다.
async function deleteMemo(id) {
  await deleteDoc(doc(db, "memos", id));
}


// ===================================================
// 화면 그리기
// ===================================================

// ===================================================
// UI 보조 함수: 보드 헤더 및 첨부파일 미리보기
// ===================================================

// 상단 보드 바 UI 갱신 (선택 드롭다운, 배지, 잠금 상태, 교사/학생 보드 격리 반영)
function updateBoardHeaderUI() {
  const boardSelect = document.getElementById("boardSelect");
  const boardDesc = document.getElementById("boardDesc");
  const lockBadge = document.getElementById("boardLockBadge");
  const lockedNotice = document.getElementById("lockedNotice");
  const openDashboardBtn = document.getElementById("openDashboardBtn");
  const inputEl = document.getElementById("input");
  const attachPhotoBtn = document.getElementById("btnAttachPhoto");
  const attachFileBtn = document.getElementById("btnAttachFile");
  const submitBtn = document.getElementById("btnSubmitMemo");

  const teacherControls = document.getElementById("teacherBoardControls");
  const studentIndicator = document.getElementById("studentBoardIndicator");
  const studentTitle = document.getElementById("studentBoardTitle");
  const shareBoardBtn = document.getElementById("shareBoardBtn");

  if (!boardSelect) return;

  const role = currentUser ? getUserRole(currentUser) : null;
  const isTeacher = role === "teacher";

  // 교사와 학생 화면 분기 (학생의 타 보드 접근 차단 & 단일 보드 고정 격리)
  if (isTeacher) {
    // 1) 교사: 전체 보드 전환 드롭다운 활성화 및 공유/대시보드 버튼 노출
    if (teacherControls) teacherControls.style.display = "inline-flex";
    if (studentIndicator) studentIndicator.style.display = "none";
    if (shareBoardBtn) shareBoardBtn.style.display = "inline-flex";
    if (openDashboardBtn) openDashboardBtn.style.display = "inline-flex";

    // 보드 드롭다운 옵션 채우기
    boardSelect.innerHTML = "";
    boardsList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = (b.isLocked ? "🔒 " : "📌 ") + b.title;
      if (b.id === currentBoardId) opt.selected = true;
      boardSelect.appendChild(opt);
    });
  } else {
    // 2) 학생: 다른 보드로의 전환 원천 차단 (드롭다운 숨김, 공유받은 보드 고정 배지 노출)
    if (teacherControls) teacherControls.style.display = "none";
    if (studentIndicator) {
      studentIndicator.style.display = "inline-flex";
      if (studentTitle) {
        studentTitle.textContent = currentBoard ? currentBoard.title : "기본 담벼락";
      }
    }
    // 학생에게는 공유 버튼 및 대시보드 버튼 숨김
    if (shareBoardBtn) shareBoardBtn.style.display = "none";
    if (openDashboardBtn) openDashboardBtn.style.display = "none";
  }

  if (currentBoard) {

    // 잠금 상태일 때 학생 글쓰기 비활성화
    const shouldLock = currentBoard.isLocked && !isTeacher;
    if (lockedNotice) {
      lockedNotice.style.display = shouldLock ? "flex" : "none";
    }
    if (inputEl) {
      inputEl.disabled = shouldLock;
      if (shouldLock) {
        inputEl.placeholder = "🔒 선생님이 이 담벼락을 잠가 두어 글을 작성할 수 없습니다 (읽기 전용)";
      } else if (currentUser) {
        inputEl.placeholder = `${isTeacher ? "[교사]" : "[학생]"} 메모를 쓰고 엔터 (5글자 이상, 사진·파일 첨부 가능)`;
      } else {
        inputEl.placeholder = "로그인 후 메모를 쓸 수 있습니다";
      }
    }
    if (attachPhotoBtn) attachPhotoBtn.disabled = shouldLock;
    if (attachFileBtn) attachFileBtn.disabled = shouldLock;
    if (submitBtn) submitBtn.disabled = shouldLock;
  }
}

// 첨부파일 미리보기 UI 렌더링
function renderAttachmentPreview() {
  const container = document.getElementById("attachmentPreview");
  if (!container) return;
  container.innerHTML = "";

  pendingAttachments.forEach((att, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    if (att.type === "image") {
      const img = document.createElement("img");
      img.src = att.url;
      img.className = "preview-thumb";
      item.appendChild(img);
    } else {
      const icon = document.createElement("span");
      icon.textContent = "📄";
      icon.style.fontSize = "20px";
      item.appendChild(icon);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "preview-name";
    nameSpan.textContent = `${att.name} (${formatFileSize(att.size)})`;
    item.appendChild(nameSpan);

    const delBtn = document.createElement("button");
    delBtn.className = "preview-del";
    delBtn.textContent = "×";
    delBtn.title = "첨부 삭제";
    delBtn.addEventListener("click", () => {
      pendingAttachments.splice(idx, 1);
      renderAttachmentPreview();
    });
    item.appendChild(delBtn);

    container.appendChild(item);
  });
}

// 이미지 확대 라이트박스 열기
function openLightbox(url) {
  const modal = document.getElementById("lightboxModal");
  const img = document.getElementById("lightboxImg");
  if (modal && img) {
    img.src = url;
    modal.style.display = "flex";
  }
}

// ===================================================
// 화면 그리기
// ===================================================

// 로그인/로그아웃 영역 그리기
function renderUserArea() {
  const userArea = document.getElementById("userArea");
  userArea.innerHTML = "";

  if (currentUser) {
    const role = getUserRole(currentUser);
    const isTeacher = role === "teacher";

    // 사용자 이름 및 역할 배지
    const welcomeSpan = document.createElement("span");
    welcomeSpan.innerHTML = `👋 <strong>${currentUser.displayName || "사용자"}</strong>님 <span style="background:${isTeacher ? '#e3f2fd' : '#e8f5e9'}; color:${isTeacher ? '#0d47a1' : '#1b5e20'}; padding: 3px 8px; border-radius: 12px; font-size: 13px; font-weight: bold; margin-left: 4px;">${isTeacher ? '선생님 🌟' : '학생'}</span> `;
    welcomeSpan.style.marginRight = "10px";
    userArea.appendChild(welcomeSpan);

    // 로그아웃 버튼
    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "로그아웃";
    logoutBtn.style.fontSize = "12px";
    logoutBtn.style.padding = "4px 10px";
    logoutBtn.style.cursor = "pointer";
    logoutBtn.addEventListener("click", async function () {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("로그아웃 실패:", err);
      }
    });
    userArea.appendChild(logoutBtn);
  } else {
    // 로그아웃 상태: 구글 로그인 버튼
    const loginBtn = document.createElement("button");
    loginBtn.textContent = "Google 계정으로 로그인";
    loginBtn.style.padding = "6px 12px";
    loginBtn.style.cursor = "pointer";
    loginBtn.addEventListener("click", async function () {
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error("로그인 실패:", err);
        alert("로그인에 실패했습니다: " + err.message);
      }
    });
    userArea.appendChild(loginBtn);
  }

  updateBoardHeaderUI();
}

async function render() {
  const wall = document.getElementById("wall");
  wall.innerHTML = "";

  const memoList = await loadMemos();
  if (memoList.length === 0) {
    const emptyNotice = document.createElement("div");
    emptyNotice.style.width = "100%";
    emptyNotice.style.padding = "40px 20px";
    emptyNotice.style.textAlign = "center";
    emptyNotice.style.color = "#adb5bd";
    emptyNotice.style.fontSize = "18px";
    emptyNotice.innerHTML = "🌱 아직 작성된 메모가 없습니다.<br>첫 번째 생각이나 질문을 남겨보세요!";
    wall.appendChild(emptyNotice);
    return;
  }

  memoList.forEach(function (memo) {
    wall.appendChild(makeMemo(memo));
  });
}

// 메모 한 장 만들기 (다양한 파스텔 색상과 모양 디자인, 사진/파일/반응/댓글 적용)
function makeMemo(memo) {
  const div = document.createElement("div");
  
  // 파스텔 색상 6가지와 다양한 모양 5가지
  const colors = ["color-yellow", "color-pink", "color-mint", "color-blue", "color-purple", "color-peach"];
  const shapes = ["shape-tape", "shape-pin", "shape-heart", "shape-clip", "shape-jelly"];

  let hash = 0;
  const seed = String(memo.id || memo.text);
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  const colorClass = colors[hash % colors.length];
  const shapeClass = shapes[(hash >> 2) % shapes.length];

  div.className = `memo ${colorClass} ${shapeClass}`;

  const role = currentUser ? getUserRole(currentUser) : null;
  const isTeacher = role === "teacher";
  const isMyMemo = currentUser && memo.uid === currentUser.uid;

  // 삭제 권한: 교사 또는 작성자
  const canDelete = isTeacher || isMyMemo || !memo.uid;
  if (canDelete) {
    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "×";
    del.title = isTeacher && !isMyMemo ? "선생님 권한으로 삭제" : "메모 삭제";
    del.addEventListener("click", async function () {
      if (confirm("이 메모를 삭제하시겠습니까?")) {
        await deleteMemo(memo.id);
        await render();
      }
    });
    div.appendChild(del);
  }

  // 귀여운 손글씨 폰트 메모 본문
  const textDiv = document.createElement("div");
  textDiv.className = "memo-text";
  textDiv.textContent = memo.text;
  div.appendChild(textDiv);

  // 첨부 사진 렌더링
  if (memo.images && memo.images.length > 0) {
    memo.images.forEach(img => {
      const imgWrap = document.createElement("div");
      imgWrap.className = "memo-image-wrap";
      imgWrap.title = "클릭하면 크게 봅니다";
      imgWrap.addEventListener("click", () => openLightbox(img.url));

      const imageEl = document.createElement("img");
      imageEl.className = "memo-image";
      imageEl.src = img.url;
      imageEl.alt = img.name || "첨부 사진";
      imgWrap.appendChild(imageEl);
      div.appendChild(imgWrap);
    });
  }

  // 첨부 파일 렌더링
  if (memo.files && memo.files.length > 0) {
    memo.files.forEach(file => {
      const fileCard = document.createElement("a");
      fileCard.className = "memo-file-card";
      fileCard.href = file.url;
      fileCard.download = file.name || "첨부파일";
      fileCard.target = "_blank";
      fileCard.innerHTML = `<span>📁</span> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${file.name}</span> <span style="font-size:11px; color:#868e96;">${formatFileSize(file.size)}</span>`;
      div.appendChild(fileCard);
    });
  }

  // 작성자 및 역할 표기
  if (memo.author) {
    const authorDiv = document.createElement("div");
    authorDiv.className = "memo-author";
    const isMemoTeacher = memo.role === "teacher";
    authorDiv.innerHTML = `${memo.author} ${isMemoTeacher ? '<span style="color:#1971c2; font-weight:bold; background:#e7f5ff; padding:1px 6px; border-radius:10px;">선생님 🌟</span>' : ''}`;
    div.appendChild(authorDiv);
  }

  // ===================================================
  // 상호 이모지 반응(Reactions) 바
  // ===================================================
  const reactionBar = document.createElement("div");
  reactionBar.className = "memo-reactions";

  REACTION_TYPES.forEach(item => {
    const countList = (memo.reactions && memo.reactions[item.key]) || [];
    const isAct = currentUser && countList.includes(currentUser.uid);

    const rBtn = document.createElement("button");
    rBtn.className = `reaction-btn ${isAct ? 'active' : ''}`;
    rBtn.title = `${item.label} (${countList.length}명)`;
    rBtn.innerHTML = `<span>${item.emoji}</span> <span>${countList.length > 0 ? countList.length : ''}</span>`;
    rBtn.addEventListener("click", async () => {
      await toggleReaction(memo.id, item.key);
    });
    reactionBar.appendChild(rBtn);
  });
  div.appendChild(reactionBar);

  // ===================================================
  // 친구 응원 댓글(Comments) 영역
  // ===================================================
  const commentsWrapper = document.createElement("div");
  commentsWrapper.className = "memo-comments-section";

  const comments = memo.comments || [];
  const toggleCommentsBtn = document.createElement("button");
  toggleCommentsBtn.className = "comments-toggle-btn";
  toggleCommentsBtn.textContent = `💬 댓글 ${comments.length}개 ${comments.length > 0 ? '▼' : '+'}`;
  
  const commentsContainer = document.createElement("div");
  commentsContainer.className = "comments-container";
  commentsContainer.style.display = "none";

  toggleCommentsBtn.addEventListener("click", () => {
    const isHidden = commentsContainer.style.display === "none";
    commentsContainer.style.display = isHidden ? "flex" : "none";
    toggleCommentsBtn.textContent = `💬 댓글 ${comments.length}개 ${isHidden ? '▲' : '▼'}`;
  });

  // 댓글 목록 렌더링
  comments.forEach(c => {
    const cItem = document.createElement("div");
    cItem.className = "comment-item";
    cItem.innerHTML = `<span class="comment-item-author">${c.author || '익명'}:</span> <span class="comment-item-text">${c.text}</span>`;
    commentsContainer.appendChild(cItem);
  });

  // 댓글 입력 창
  const commentInputRow = document.createElement("div");
  commentInputRow.className = "comment-input-row";
  const cInput = document.createElement("input");
  cInput.type = "text";
  cInput.placeholder = "친구에게 따뜻한 한 줄을 남겨보세요";

  const cBtn = document.createElement("button");
  cBtn.textContent = "작성";

  const handleSendComment = async () => {
    const cVal = cInput.value.trim();
    if (!cVal) return;
    await addComment(memo.id, cVal);
  };

  cBtn.addEventListener("click", handleSendComment);
  cInput.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
      e.preventDefault();
      await handleSendComment();
    }
  });

  commentInputRow.appendChild(cInput);
  commentInputRow.appendChild(cBtn);
  commentsContainer.appendChild(commentInputRow);

  commentsWrapper.appendChild(toggleCommentsBtn);
  commentsWrapper.appendChild(commentsContainer);
  div.appendChild(commentsWrapper);

  return div;
}

// ===================================================
// 교사 대시보드 관리 기능
// ===================================================

// 교사 대시보드 열기 및 초기 렌더링
async function openTeacherDashboard() {
  const modal = document.getElementById("dashboardModal");
  if (!modal) return;
  modal.style.display = "flex";
  await renderBoardListInDashboard();
  await renderAnalyticsInDashboard();
}

// 대시보드 탭 1: 보드 목록 렌더링
async function renderBoardListInDashboard() {
  const container = document.getElementById("boardListContainer");
  if (!container) return;
  container.innerHTML = "";

  boardsList.forEach(b => {
    const card = document.createElement("div");
    card.className = "board-item-card";

    const isCurrent = b.id === currentBoardId;

    const info = document.createElement("div");
    info.className = "board-item-info";
    info.innerHTML = `
      <div class="board-item-title">
        ${b.isLocked ? '🔒' : '📌'} ${b.title}
        ${isCurrent ? '<span style="font-size:12px; background:#d3f9d8; color:#2b8a3e; padding:2px 8px; border-radius:10px; font-weight:bold;">현재 선택됨</span>' : ''}
      </div>
      <div class="board-item-desc">${b.description || '설명 없음'}</div>
    `;
    card.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "board-item-actions";

    // 보드 이동 버튼
    if (!isCurrent) {
      const selectBtn = document.createElement("button");
      selectBtn.className = "btn-action-small";
      selectBtn.textContent = "👉 이 보드로 이동";
      selectBtn.addEventListener("click", async () => {
        currentBoardId = b.id;
        currentBoard = b;
        localStorage.setItem("current_board_id", b.id);
        updateBoardHeaderUI();
        await render();
        await renderBoardListInDashboard();
        await renderAnalyticsInDashboard();
      });
      actions.appendChild(selectBtn);
    }

    // 잠금 토글 버튼
    const lockBtn = document.createElement("button");
    lockBtn.className = `btn-action-small ${b.isLocked ? 'btn-action-active' : ''}`;
    lockBtn.textContent = b.isLocked ? "🔓 잠금 해제" : "🔒 보드 잠금";
    lockBtn.title = b.isLocked ? "학생들의 글쓰기를 다시 허용합니다" : "학생들이 글을 쓸 수 없도록 읽기 전용으로 잠급니다";
    lockBtn.addEventListener("click", async () => {
      await updateBoardSettings(b.id, { isLocked: !b.isLocked });
      await renderBoardListInDashboard();
      await renderAnalyticsInDashboard();
      await render();
    });
    actions.appendChild(lockBtn);

    // 학생 공유 (QR / 링크) 버튼
    const shareBtn = document.createElement("button");
    shareBtn.className = "btn-action-small";
    shareBtn.style.color = "#1971c2";
    shareBtn.style.borderColor = "#74c0fc";
    shareBtn.textContent = "🔗 학생 공유 (QR/링크)";
    shareBtn.title = "학생들에게 이 보드의 접속 QR코드와 링크를 안내합니다";
    shareBtn.addEventListener("click", () => {
      openShareModal(b.id);
    });
    actions.appendChild(shareBtn);

    // 삭제 버튼 (기본 보드는 삭제 불가)
    if (b.id !== "default") {
      const delBtn = document.createElement("button");
      delBtn.className = "btn-action-small";
      delBtn.style.color = "#e03131";
      delBtn.textContent = "🗑️ 삭제";
      delBtn.addEventListener("click", async () => {
        if (confirm(`'${b.title}' 보드를 정말 삭제하시겠습니까?`)) {
          await deleteBoard(b.id);
          await renderBoardListInDashboard();
          await renderAnalyticsInDashboard();
        }
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);
    container.appendChild(card);
  });
}

// 대시보드 탭 2: 참여 현황 집계 및 테이블 렌더링
async function renderAnalyticsInDashboard() {
  const memos = await loadMemos();

  let totalMemos = memos.length;
  let totalFiles = 0;
  let totalReactions = 0;
  const studentMap = {}; // uid -> { name, memos, files, reactions, lastTime }

  memos.forEach(m => {
    const imagesCount = (m.images || []).length;
    const filesCount = (m.files || []).length;
    totalFiles += (imagesCount + filesCount);

    let reactionsOnThisMemo = 0;
    if (m.reactions) {
      Object.keys(m.reactions).forEach(k => {
        reactionsOnThisMemo += (m.reactions[k] || []).length;
      });
    }
    reactionsOnThisMemo += (m.comments || []).length;
    totalReactions += reactionsOnThisMemo;

    const studentUid = m.uid || "anonymous";
    const studentName = m.author || "학생";

    if (!studentMap[studentUid]) {
      studentMap[studentUid] = {
        name: studentName,
        memos: 0,
        files: 0,
        reactions: 0,
        lastTime: m.createdAt || 0
      };
    }
    studentMap[studentUid].memos += 1;
    studentMap[studentUid].files += (imagesCount + filesCount);
    studentMap[studentUid].reactions += reactionsOnThisMemo;
    if (m.createdAt > studentMap[studentUid].lastTime) {
      studentMap[studentUid].lastTime = m.createdAt;
    }
  });

  const activeStudentsCount = Object.keys(studentMap).length;

  // 상단 지표 카드 업데이트
  const statTotalMemos = document.getElementById("statTotalMemos");
  const statTotalFiles = document.getElementById("statTotalFiles");
  const statTotalReactions = document.getElementById("statTotalReactions");
  const statActiveStudents = document.getElementById("statActiveStudents");

  if (statTotalMemos) statTotalMemos.textContent = totalMemos;
  if (statTotalFiles) statTotalFiles.textContent = totalFiles;
  if (statTotalReactions) statTotalReactions.textContent = totalReactions;
  if (statActiveStudents) statActiveStudents.textContent = activeStudentsCount;

  // 학생별 참여 테이블 렌더링
  const tbody = document.getElementById("participationTableBody");
  if (tbody) {
    tbody.innerHTML = "";
    if (activeStudentsCount === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #868e96;">현재 보드에 등록된 학생 활동이 없습니다.</td></tr>`;
    } else {
      Object.values(studentMap).forEach(st => {
        const tr = document.createElement("tr");
        const dateStr = st.lastTime ? new Date(st.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
        tr.innerHTML = `
          <td><strong>${st.name}</strong></td>
          <td><span style="color:#fd7e14; font-weight:bold;">${st.memos}</span>개</td>
          <td>${st.files}개</td>
          <td>${st.reactions}회</td>
          <td style="color:#868e96; font-size:12px;">${dateStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

// ===================================================
// 보드 공유 (QR 코드 및 링크) 기능
// ===================================================

// QR 코드 및 링크 공유 모달 열기
function openShareModal(targetBoardId = null) {
  const bId = targetBoardId || currentBoardId;
  const board = boardsList.find(b => b.id === bId) || currentBoard;
  if (!board) return;

  const modal = document.getElementById("shareModal");
  const titleEl = document.getElementById("shareBoardTitle");
  const descEl = document.getElementById("shareBoardDesc");
  const urlInput = document.getElementById("shareUrlInput");
  const qrBox = document.getElementById("qrcodeBox");

  if (titleEl) titleEl.textContent = board.title;
  if (descEl) descEl.textContent = board.description || "우리 반 공통 이야기 공간";

  // 현재 브라우저 주소 기반 공유 URL 생성 (?board=보드ID)
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?board=${encodeURIComponent(board.id)}`;
  if (urlInput) urlInput.value = shareUrl;

  // QR 코드 동적 렌더링
  if (qrBox) {
    qrBox.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      try {
        new QRCode(qrBox, {
          text: shareUrl,
          width: 190,
          height: 190,
          colorDark: "#212529",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        console.warn("QRCode 라이브러리 실행 오류, 이미지 폴백 적용:", e);
        renderQrFallback(qrBox, shareUrl);
      }
    } else {
      renderQrFallback(qrBox, shareUrl);
    }
  }

  if (modal) modal.style.display = "flex";
}

// QR 코드 생성 실패 또는 오프라인/지연 시 이미지 폴백 제공
function renderQrFallback(container, url) {
  container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(url)}" alt="QR 코드" style="width:190px; height:190px; border-radius:12px; display:block;">`;
}

// 링크 클립보드 복사 처리
async function handleCopyShareUrl() {
  const urlInput = document.getElementById("shareUrlInput");
  if (!urlInput) return;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(urlInput.value);
    } else {
      urlInput.select();
      document.execCommand("copy");
    }
    alert("담벼락 참여 링크가 복사되었습니다! 🎉\n학생들에게 링크를 안내해 주세요.");
  } catch (err) {
    prompt("아래 링크를 복사하여 학생들에게 공유하세요:", urlInput.value);
  }
}

// ===================================================
// 이벤트 리스너 등록
// ===================================================

const input = document.getElementById("input");
const btnSubmitMemo = document.getElementById("btnSubmitMemo");
const btnAttachPhoto = document.getElementById("btnAttachPhoto");
const imageInput = document.getElementById("imageInput");
const btnAttachFile = document.getElementById("btnAttachFile");
const fileInput = document.getElementById("fileInput");
const boardSelect = document.getElementById("boardSelect");
const openDashboardBtn = document.getElementById("openDashboardBtn");
const closeDashboardBtn = document.getElementById("closeDashboardBtn");
const tabBoardsBtn = document.getElementById("tabBoardsBtn");
const tabAnalyticsBtn = document.getElementById("tabAnalyticsBtn");
const createBoardBtn = document.getElementById("createBoardBtn");

// 메모 등록 공통 처리 함수
async function handleMemoSubmission() {
  if (!currentUser) {
    alert("로그인 후 메모를 쓸 수 있습니다.");
    return;
  }

  const role = getUserRole(currentUser);
  if (currentBoard && currentBoard.isLocked && role !== "teacher") {
    alert("선생님이 담벼락을 잠가 두어 새로운 글을 쓸 수 없습니다.");
    return;
  }

  const text = input.value.trim();
  if (text === "") {
    if (pendingAttachments.length === 0) {
      alert("메모 내용을 입력해 주세요.");
      return;
    }
  }

  if (text.length < 5) {
    alert("메모는 5글자 이상 입력해 주세요.");
    return;
  }

  await addMemo(text, pendingAttachments);
  input.value = "";
  await render();
}

// 엔터 키 입력 시 메모 등록 (Shift+Enter는 줄바꿈)
input.addEventListener("keydown", async function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.isComposing) return;
    e.preventDefault();
    await handleMemoSubmission();
  }
});

// 담벼락에 붙이기 버튼 클릭
if (btnSubmitMemo) {
  btnSubmitMemo.addEventListener("click", handleMemoSubmission);
}

// 사진 첨부 버튼 및 파일 인풋
if (btnAttachPhoto && imageInput) {
  btnAttachPhoto.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const att = await compressImage(file);
      if (att) pendingAttachments.push(att);
    }
    imageInput.value = "";
    renderAttachmentPreview();
  });
}

// 파일 첨부 버튼 및 파일 인풋
if (btnAttachFile && fileInput) {
  btnAttachFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const att = await processGenericFile(file);
      if (att) pendingAttachments.push(att);
    }
    fileInput.value = "";
    renderAttachmentPreview();
  });
}

// 보드 선택 드롭다운 변경 시
if (boardSelect) {
  boardSelect.addEventListener("change", async (e) => {
    currentBoardId = e.target.value;
    currentBoard = boardsList.find(b => b.id === currentBoardId) || boardsList[0];
    localStorage.setItem("current_board_id", currentBoardId);
    updateBoardHeaderUI();
    await render();
  });
}

// 교사 대시보드 열기 및 닫기
if (openDashboardBtn) {
  openDashboardBtn.addEventListener("click", openTeacherDashboard);
}
if (closeDashboardBtn) {
  closeDashboardBtn.addEventListener("click", () => {
    document.getElementById("dashboardModal").style.display = "none";
  });
}

// 대시보드 탭 전환
if (tabBoardsBtn && tabAnalyticsBtn) {
  tabBoardsBtn.addEventListener("click", () => {
    tabBoardsBtn.classList.add("active");
    tabAnalyticsBtn.classList.remove("active");
    document.getElementById("tabBoardsContent").style.display = "block";
    document.getElementById("tabAnalyticsContent").style.display = "none";
  });

  tabAnalyticsBtn.addEventListener("click", async () => {
    tabAnalyticsBtn.classList.add("active");
    tabBoardsBtn.classList.remove("active");
    document.getElementById("tabBoardsContent").style.display = "none";
    document.getElementById("tabAnalyticsContent").style.display = "block";
    await renderAnalyticsInDashboard();
  });
}

// 새 보드 생성 버튼
if (createBoardBtn) {
  createBoardBtn.addEventListener("click", async () => {
    const titleInput = document.getElementById("newBoardTitle");
    const descInput = document.getElementById("newBoardDesc");
    const lockCheck = document.getElementById("newBoardLocked");

    const title = titleInput.value.trim();
    if (!title) {
      alert("보드 제목을 입력해 주세요.");
      return;
    }

    await createBoard(title, descInput.value, lockCheck.checked);
    titleInput.value = "";
    descInput.value = "";
    lockCheck.checked = false;

    alert("새로운 담벼락 보드가 생성되었습니다! 🎉");
    await renderBoardListInDashboard();
    await render();
  });
}

// 보드 공유 모달 열기 및 닫기, 링크 복사 리스너
const shareBoardBtn = document.getElementById("shareBoardBtn");
const closeShareBtn = document.getElementById("closeShareBtn");
const shareModal = document.getElementById("shareModal");
const btnCopyUrl = document.getElementById("btnCopyUrl");

if (shareBoardBtn) {
  shareBoardBtn.addEventListener("click", () => openShareModal());
}
if (closeShareBtn && shareModal) {
  closeShareBtn.addEventListener("click", () => {
    shareModal.style.display = "none";
  });
}
if (shareModal) {
  shareModal.addEventListener("click", (e) => {
    if (e.target === shareModal) shareModal.style.display = "none";
  });
}
if (btnCopyUrl) {
  btnCopyUrl.addEventListener("click", handleCopyShareUrl);
}

// 전역 호출 지원
window.openShareModal = openShareModal;
window.openTeacherDashboard = openTeacherDashboard;

// ===================================================
// 인증 상태 변경 감지 및 초기화
// ===================================================

onAuthStateChanged(auth, async function (user) {
  currentUser = user;
  await loadBoards();
  renderUserArea();
  await render();
});

input.focus();
