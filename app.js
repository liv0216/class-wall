// ===================================================
// 우리 반 담벼락 - 시작점
//
// 메모를 쓰면 올린 순서대로 담벼락에 붙습니다.
// 지금은 데이터가 아래 배열에만 들어 있어서,
// 브라우저를 새로고침하면 전부 사라집니다.
// ===================================================


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
  query,
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
// 데이터를 다루는 함수 세 개 (Firestore 연동)
// ===================================================

// 메모를 읽어 옵니다.
// Firestore의 memos 컬렉션에서 올린 시각(createdAt) 순서대로 가져옵니다.
async function loadMemos() {
  const q = query(collection(db, "memos"), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  const memoList = [];
  snapshot.forEach(function (docSnap) {
    memoList.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });
  return memoList;
}

// 메모를 새로 씁니다.
// Firestore의 memos 컬렉션에 새 문서를 추가합니다 (5글자 이상, 로그인 사용자 정보 및 역할 포함).
async function addMemo(text) {
  if (!currentUser) {
    alert("로그인 후 메모를 쓸 수 있습니다.");
    return;
  }

  if (text.length < 5) {
    alert("메모는 5글자 이상 입력해 주세요.");
    return;
  }

  const role = getUserRole(currentUser);

  await addDoc(collection(db, "memos"), {
    text: text,
    createdAt: Date.now(),
    uid: currentUser.uid,
    author: currentUser.displayName || (role === "teacher" ? "선생님" : "학생"),
    role: role
  });
}

// 메모를 지웁니다.
// Firestore의 memos 컬렉션에서 해당 ID의 문서를 삭제합니다.
async function deleteMemo(id) {
  await deleteDoc(doc(db, "memos", id));
}


// ===================================================
// AI 코멘트 생성 기능 (Gemini API 연동)
// 교사가 버튼을 클릭하면 Vercel 서버리스 함수(/api/gemini)를 호출합니다.
// ===================================================

// 특정 메모 1개에 대해 AI 코멘트 생성
async function generateAiComment(memo, buttonElement) {
  const originalBtnText = buttonElement ? buttonElement.textContent : "";
  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.textContent = "🤖 AI 코멘트 작성 중...";
  }

  try {
    let response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: memo.text })
    });

    // 로컬 Live Server 환경(Vercel 서버리스 /api/gemini 가 로컬에 없는 경우) fallback
    if (!response.ok && response.status === 404) {
      let localKey = localStorage.getItem("local_gemini_api_key");
      if (!localKey) {
        localKey = prompt(
          "현재 로컬(Live Server) 환경이라 Vercel 서버리스 함수(/api/gemini)가 동작하지 않습니다.\n로컬에서 바로 테스트하려면 무료 Gemini API 키를 입력해 주세요.\n(Vercel에 배포된 환경에서는 설정된 환경 변수로 자동 동작합니다):"
        );
        if (localKey && localKey.trim()) {
          localStorage.setItem("local_gemini_api_key", localKey.trim());
          localKey = localKey.trim();
        }
      }

      if (localKey) {
        const model = "gemini-3.6-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${localKey}`;
        const promptText = `당신은 학생들을 따뜻하게 응원하는 친절한 초·중등학교 선생님입니다. 학생의 메모를 읽고 칭찬, 격려 또는 생각을 북돋워 주는 짧고 다정한 코멘트를 한국어로 1~2문장으로 작성해 주세요. 어울리는 이모지도 1~2개 포함해 주세요.\n\n[학생 메모]\n${memo.text}`;

        const directRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (directRes.ok) {
          const directData = await directRes.json();
          const comment = directData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (comment) {
            await updateDoc(doc(db, "memos", memo.id), { aiComment: comment });
            await render();
            return;
          }
        }
      }
      alert("AI 코멘트 생성을 위해 Vercel에 배포하거나 유효한 Gemini API 키가 필요합니다.");
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `서버 오류 (${response.status})`);
    }

    const data = await response.json();
    if (data.comment) {
      // Firestore 문서에 AI 코멘트 필드 추가 저장
      await updateDoc(doc(db, "memos", memo.id), {
        aiComment: data.comment
      });
      await render();
    }
  } catch (error) {
    console.error("AI 코멘트 생성 실패:", error);
    alert("AI 코멘트 생성에 실패했습니다: " + error.message);
  } finally {
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = originalBtnText;
    }
  }
}

// 담벼락의 모든 메모에 대해 AI 코멘트 일괄 생성
async function generateAllAiComments(btn) {
  const memos = await loadMemos();
  if (memos.length === 0) {
    alert("담벼락에 메모가 없습니다.");
    return;
  }

  btn.disabled = true;
  const originalText = btn.textContent;

  for (let i = 0; i < memos.length; i++) {
    btn.textContent = `🤖 AI 코멘트 작성 중 (${i + 1}/${memos.length})...`;
    await generateAiComment(memos[i]);
  }

  btn.disabled = false;
  btn.textContent = originalText;
  alert("모든 메모에 AI 코멘트 작성이 완료되었습니다! ✨");
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
    welcomeSpan.innerHTML = `👋 <strong>${currentUser.displayName || "사용자"}</strong>님 <span style="background:${isTeacher ? '#e3f2fd' : '#e8f5e9'}; color:${isTeacher ? '#0d47a1' : '#1b5e20'}; padding: 3px 8px; border-radius: 12px; font-size: 13px; font-weight: bold; margin-left: 4px;">${isTeacher ? '교사 (teacher)' : '학생 (student)'}</span> `;
    welcomeSpan.style.marginRight = "10px";
    userArea.appendChild(welcomeSpan);

    // 교사 전용: 전체 AI 코멘트 생성 버튼
    if (isTeacher) {
      const allAiBtn = document.createElement("button");
      allAiBtn.textContent = "🤖 전체 AI 코멘트 생성";
      allAiBtn.style.marginRight = "6px";
      allAiBtn.style.fontSize = "12px";
      allAiBtn.style.padding = "4px 8px";
      allAiBtn.style.background = "#eef4ff";
      allAiBtn.style.borderColor = "#90caf9";
      allAiBtn.style.color = "#0d47a1";
      allAiBtn.title = "담벼락에 있는 모든 메모에 AI 코멘트를 일괄 생성합니다";
      allAiBtn.addEventListener("click", async function () {
        await generateAllAiComments(allAiBtn);
      });
      userArea.appendChild(allAiBtn);
    }

    // UID 복사 버튼 (규칙 및 TEACHER_UIDS 등록용)
    const copyUidBtn = document.createElement("button");
    copyUidBtn.textContent = "내 UID 복사";
    copyUidBtn.style.marginRight = "6px";
    copyUidBtn.style.fontSize = "12px";
    copyUidBtn.style.padding = "4px 8px";
    copyUidBtn.title = "현재 로그인된 계정의 Firebase UID를 클립보드에 복사합니다";
    copyUidBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(currentUser.uid).then(function () {
        alert("UID가 복사되었습니다:\n" + currentUser.uid + "\n\nfirestore.rules의 TEACHER_UID_HERE 자리에 붙여넣으실 수 있습니다.");
      });
    });
    userArea.appendChild(copyUidBtn);

    // 역할 전환 버튼 (실습 편의용: 교사/학생 즉시 테스트)
    const toggleRoleBtn = document.createElement("button");
    toggleRoleBtn.textContent = isTeacher ? "학생 모드로 변경" : "교사 모드로 변경";
    toggleRoleBtn.style.marginRight = "6px";
    toggleRoleBtn.style.fontSize = "12px";
    toggleRoleBtn.style.padding = "4px 8px";
    toggleRoleBtn.addEventListener("click", function () {
      const nextRole = isTeacher ? "student" : "teacher";
      localStorage.setItem("role_" + currentUser.uid, nextRole);
      renderUserArea();
      render();
    });
    userArea.appendChild(toggleRoleBtn);

    // 로그아웃 버튼
    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "로그아웃";
    logoutBtn.style.fontSize = "12px";
    logoutBtn.style.padding = "4px 8px";
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
}

async function render() {
  const wall = document.getElementById("wall");
  wall.innerHTML = "";

  const memoList = await loadMemos();
  memoList.forEach(function (memo) {
    wall.appendChild(makeMemo(memo));
  });
}

// 메모 한 장 만들기 (다양한 파스텔 색상과 모양 디자인 적용)
function makeMemo(memo) {
  const div = document.createElement("div");
  
  // 파스텔 색상 6가지와 다양한 모양 5가지
  const colors = ["color-yellow", "color-pink", "color-mint", "color-blue", "color-purple", "color-peach"];
  const shapes = ["shape-tape", "shape-pin", "shape-heart", "shape-clip", "shape-jelly"];

  // 메모 ID나 내용을 기반으로 일관된 색상/모양 선택
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

  // 삭제 권한:
  // - 교사(teacher): 모든 권한(모든 메모 삭제 가능)
  // - 학생(student): 본인이 작성한 메모만 삭제 가능 (타인의 메모는 건들 수 없음)
  // - 작성자 없는 기존 메모: 삭제 허용
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

  // 작성자 및 역할 표기
  if (memo.author) {
    const authorDiv = document.createElement("div");
    authorDiv.className = "memo-author";
    const isMemoTeacher = memo.role === "teacher";
    authorDiv.innerHTML = `${memo.author} ${isMemoTeacher ? '<span style="color:#1971c2; font-weight:bold; background:#e7f5ff; padding:1px 6px; border-radius:10px;">선생님 🌟</span>' : ''}`;
    div.appendChild(authorDiv);
  }

  // AI 코멘트가 있는 경우 말풍선 표시
  if (memo.aiComment) {
    const aiCommentBox = document.createElement("div");
    aiCommentBox.className = "ai-comment";
    aiCommentBox.innerHTML = `
      <div class="ai-comment-title">🤖 AI 선생님 한마디 ✨</div>
      <div class="ai-comment-content">${memo.aiComment}</div>
    `;
    div.appendChild(aiCommentBox);
  }

  // 교사(teacher)에게만 AI 코멘트 생성 버튼 노출
  if (isTeacher) {
    const aiBtn = document.createElement("button");
    aiBtn.className = "ai-btn";
    aiBtn.textContent = memo.aiComment ? "🤖 코멘트 다시 달기" : "🤖 AI 코멘트 달기";
    aiBtn.addEventListener("click", async function () {
      await generateAiComment(memo, aiBtn);
    });
    div.appendChild(aiBtn);
  }

  return div;
}


// ===================================================
// 메모 쓰는 칸
// 엔터를 누르면 담벼락에 붙습니다 (줄바꿈은 Shift + 엔터)
// ===================================================

const input = document.getElementById("input");

input.addEventListener("keydown", async function (e) {
  // 엔터 키를 눌렀을 때 메모 추가 (Shift + Enter는 줄바꿈, 한글 조합 중 제외)
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.isComposing) return; // 한글 끝 글자 중복 입력 방지
    e.preventDefault();

    if (!currentUser) {
      alert("로그인 후 메모를 쓸 수 있습니다.");
      return;
    }

    const text = input.value.trim();
    if (text === "") return;

    // 5글자 미만이면 저장을 막고 안내합니다.
    if (text.length < 5) {
      alert("메모는 5글자 이상 입력해 주세요.");
      return;
    }

    await addMemo(text);
    input.value = "";
    await render();
  }
});


// ===================================================
// 인증 상태 변경 감지 및 초기화
// ===================================================

// 사용자가 로그인하거나 로그아웃할 때 자동으로 화면을 다시 그립니다.
onAuthStateChanged(auth, function (user) {
  currentUser = user;
  renderUserArea();
  render();

  if (currentUser) {
    const role = getUserRole(currentUser);
    input.placeholder = `${role === "teacher" ? "[교사]" : "[학생]"} 메모를 쓰고 엔터 (5글자 이상)`;
  } else {
    input.placeholder = "로그인 후 메모를 쓸 수 있습니다";
  }
});

input.focus();
