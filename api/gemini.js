// ===================================================
// Gemini에게 물어보는 서버 코드가 들어올 자리 (아직 비어 있습니다)
//
// 왜 서버가 필요한가요?
//   API 키를 브라우저 코드(app.js)에 적으면 누구나 볼 수 있습니다.
//   그래서 키는 서버에만 두고, 브라우저는 이 주소로 부탁만 합니다.
//
// 왜 Firebase Functions가 아니라 여기인가요?
//   Firebase Functions는 유료 요금제(Blaze)라야 씁니다.
//   이 프로젝트는 무료 요금제(Spark)로 진행하므로,
//   서버가 필요한 일은 Vercel의 무료 함수로 처리합니다.
//
// 이 파일의 규칙
//   api 폴더 안의 파일은 Vercel에서 자동으로 서버 주소가 됩니다.
//   이 파일은 /api/gemini 주소가 됩니다.
//   API 키는 코드에 적지 말고 Vercel 환경변수에 넣습니다. (process.env 로 꺼내 씁니다)
// ===================================================

export default async function handler(req, res) {
  // CORS 헤더 설정 (로컬 테스트 및 배포 환경 지원)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  // 개인정보 보호: uid나 이메일 등 식별 정보 없이 순수 메모 내용(text)만 받습니다.
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "메모 내용(text)이 필요합니다." });
  }

  // Vercel 환경 변수에서 API 키를 가져옵니다.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Vercel 환경 변수(GEMINI_API_KEY)가 설정되지 않았습니다. Vercel 프로젝트 설정 > Environment Variables에 키를 등록해 주세요."
    });
  }

  // 요청하신 3.6 모델 적용 (무료 티어 지원, 필요 시 호환 fallback)
  const primaryModel = "gemini-3.6-flash";
  const fallbackModel = "gemini-2.5-flash";

  // 초·중등 학생 메모에 대한 따뜻한 선생님 톤의 프롬프트
  const systemInstruction = "당신은 학생들을 따뜻하게 응원하는 친절한 초·중등학교 선생님입니다. 학생의 메모를 읽고 칭찬, 격려 또는 생각을 북돋워 주는 짧고 다정한 코멘트를 한국어로 1~2문장으로 작성해 주세요. 어울리는 이모지도 1~2개 포함해 주세요.";

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: `${systemInstruction}\n\n[학생 메모]\n${text}` }
        ]
      }
    ]
  });

  try {
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody
      }
    );

    // 만약 3.6 엔드포인트 응답이 404일 경우 호환 모델로 안전하게 재시도
    if (!response.ok && response.status === 404) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody
        }
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Gemini API Error:", response.status, errBody);
      return res.status(response.status).json({
        error: `Gemini API 호출 실패 (${response.status})`
      });
    }

    const data = await response.json();
    const comment = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "참 좋은 생각이에요! 선생님도 함께 응원할게요. ✨";

    return res.status(200).json({ comment });
  } catch (error) {
    console.error("서버리스 함수 실행 오류:", error);
    return res.status(500).json({
      error: "AI 코멘트를 생성하는 중 서버 오류가 발생했습니다."
    });
  }
}
