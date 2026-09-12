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
// Firestore의 memos 컬렉션에 새 문서를 추가합니다 (5글자 이상, 로그인 사용자 정보 포함).
async function addMemo(text) {
  if (!currentUser) {
    alert("로그인 후 메모를 쓸 수 있습니다.");
    return;
  }

  if (text.length < 5) {
    alert("메모는 5글자 이상 입력해 주세요.");
    return;
  }

  await addDoc(collection(db, "memos"), {
    text: text,
    createdAt: Date.now(),
    uid: currentUser.uid,
    author: currentUser.displayName || "사용자"
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
    // 로그인 상태: 사용자 이름과 로그아웃 버튼
    const welcomeText = document.createElement("span");
    welcomeText.textContent = `👋 ${(currentUser.displayName || "사용자")}님으로 로그인 중 `;
    welcomeText.style.marginRight = "10px";
    userArea.appendChild(welcomeText);

    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "로그아웃";
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

  // 삭제 버튼: 내가 쓴 메모이거나 작성자 정보가 없는 기존 메모일 때만 표시
  const isMyMemo = currentUser && memo.uid === currentUser.uid;
  const isLegacyMemo = !memo.uid;

  if (isMyMemo || isLegacyMemo) {
    const del = document.createElement("button");
    del.textContent = "×";
    del.title = "메모 삭제";
    del.addEventListener("click", async function () {
      await deleteMemo(memo.id);
      await render();
    });
    div.appendChild(del);
  }

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  // 작성자가 있으면 메모 하단에 작게 표시
  if (memo.author) {
    const authorSpan = document.createElement("div");
    authorSpan.textContent = memo.author;
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
  if (e.key === "Enter" && !e.shiftKey) {
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
    input.placeholder = "메모를 쓰고 엔터 (5글자 이상)";
  } else {
    input.placeholder = "로그인 후 메모를 쓸 수 있습니다";
  }
});

input.focus();
