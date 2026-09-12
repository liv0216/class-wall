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

// 메모 한 장 만들기
function makeMemo(memo) {
  const div = document.createElement("div");
  div.className = "memo";

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

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  // 작성자 및 역할 표기
  if (memo.author) {
    const authorSpan = document.createElement("div");
    const isMemoTeacher = memo.role === "teacher";
    authorSpan.innerHTML = `${memo.author} ${isMemoTeacher ? '<span style="color:#0d47a1; font-weight:bold;">[선생님]</span>' : ''}`;
    authorSpan.style.fontSize = "12px";
    authorSpan.style.color = "#777";
    authorSpan.style.marginTop = "8px";
    authorSpan.style.textAlign = "right";
    div.appendChild(authorSpan);
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
