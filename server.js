import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3030);
const model = process.env.MODEL || "gpt-4o-mini";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "6mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, model });
});

app.post("/draft", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "thiếu OPENAI_API_KEY trong file .env" });
    }

    const question = String(req.body?.question || "").trim();
    const image = typeof req.body?.image === "string" ? req.body.image : null;
    if (!question) return res.status(400).json({ error: "không đọc được câu hỏi" });

    const content = [{ type: "input_text", text: question }];
    if (image?.startsWith("data:image/")) {
      content.push({ type: "input_image", image_url: image, detail: "low" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 220,
        instructions: [
          "Hãy tạo một bản nháp trả lời bằng tiếng Việt để người học tự kiểm tra trước khi gửi.",
          "Chỉ giải câu hỏi cuối cùng trong nội dung được cung cấp.",
          "Trả lời ngắn gọn, đúng trọng tâm; nếu đề yêu cầu giải thích thì nêu đủ ý chính.",
          "Dùng ngôi thứ nhất là 'tôi' khi ngôi xưng thực sự cần thiết.",
          "Không tự nhận là chatbot, AI hay trợ lý.",
          "Không thêm lời dẫn như 'đáp án là' nếu ô trả lời chỉ cần một giá trị.",
          "không dùng chữ hoa ở đầu, không ghi trả lời trong ngoặc kép, không thêm dấu chấm cuối câu.",
          "trả lời đúng ý không cần lặp lại câu hỏi, ngắn nhất có thể nhưng vẫn đủ ý đề yêu cầu",
          "Nếu dữ liệu không đủ hoặc không đọc được hình, đánh dấu needs_review=true.",
          "trả lời bằng tiếng anh nếu câu hỏi bằng tiếng anh"
        ].join(" "),
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "student_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                needs_review: { type: "boolean" }
              },
              required: ["answer", "needs_review"],
              additionalProperties: false
            }
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI API trả lỗi"
      });
    }

    const outputText = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("");

    if (!outputText) throw new Error("API không trả nội dung");
    const parsed = JSON.parse(outputText);
    res.json({ ...parsed, usage: data.usage || null });
  } catch (error) {
    res.status(500).json({ error: error?.message || String(error) });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`draft helper đang chạy tại http://127.0.0.1:${port}`);
});
