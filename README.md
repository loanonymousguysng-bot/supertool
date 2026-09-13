# School AI Draft Helper

Tool tạo nháp từ câu hỏi cuối cùng trên trang học. Tool **không tự bấm gửi**: người học phải kiểm tra nội dung và tự gửi. Khi trang phản hồi sai hai lần cho cùng một câu, tool khóa câu đó.

## Cài server

Yêu cầu Node.js 20 trở lên.

```bash
npm install
cp .env.example .env
```

Mở `.env`, thay `sk-your-key-here` bằng OpenAI API key, rồi chạy:

```bash
npm start
```

Kiểm tra bằng cách mở <http://127.0.0.1:3030/health>.

## Cài userscript

1. Cài Tampermonkey.
2. Tạo script mới và dán toàn bộ `school-ai-draft-helper.user.js`.
3. Nên sửa dòng `@match *://*/*` thành tên miền trang trường, ví dụ `@match https://example.edu.vn/*`.
4. Mở lại trang học. Góc trái dưới sẽ có nút **tạo nháp**.
5. Chờ câu hỏi xuất hiện, bấm **tạo nháp**, kiểm tra nội dung được điền vào ô chat rồi tự bấm nút gửi của trang.

## Selector đang dùng

- Tin nhắn: `.message-assistant`
- Ô nhập: `textarea.w-md-editor-text-input`
- Nút gửi của trang đã xác định là `button.w-send-btn.w-send-btn--active`, nhưng script cố ý không bấm nút này.

## Ảnh và token

Script chỉ lấy ảnh lớn nhất trong tin nhắn, resize cạnh dài còn tối đa 768 px và gửi ở `detail: low`. Nếu trang chặn đọc ảnh, nháp vẫn được tạo từ phần chữ và sẽ có thể được đánh dấu cần kiểm tra.

## Nếu phản hồi sai không được nhận diện

Thêm cụm từ phản hồi của trang vào mảng `WRONG` trong userscript. Trạng thái và số lần sai được lưu trong LocalStorage của trang.
# educrack
