# Mine Cheater

Chrome/Edge extension tự giải bàn **No Guessing** trên [minesweeper.online](https://minesweeper.online/) bằng đúng dữ liệu đang nhìn thấy trên bàn cờ.

Extension không đọc đáp án ẩn và không chạm vào state nội bộ của game. Nó đọc các ô đã mở, dựng ràng buộc Minesweeper, suy luận ô chắc chắn an toàn bằng rule cơ bản, subset-difference và exact CSP, rồi mở từng ô một. Khi bàn còn nguyên, nó chỉ chọn ô `.start` do No Guessing chỉ định — tuyệt đối không tự click một ô ngẫu nhiên.

> [!WARNING]
> **Tài khoản dùng để test extension này đã bị minesweeper.online ban thật.** Luật của site ghi rõ solver, board analyser và chương trình tự click đều bị xem là gian lận; game master có toàn quyền xử lý theo quy định của họ. Extension không có cơ chế ẩn/né anti-cheat. Dùng nó đồng nghĩa với nguy cơ mất tài khoản; việc đăng xuất cũng không làm cách dùng này trở thành được phép hoặc an toàn. Không dùng trong PvP/Arena/giải đấu.

## Cài vào Chrome

1. Mở `chrome://extensions`.
2. Bật **Developer mode** ở góc phải.
3. Chọn **Load unpacked**.
4. Chọn chính thư mục `mine-cheater` này.
5. Mở [No Guessing mode](https://minesweeper.online/new-game/ng). Panel **Mine Cheater** sẽ xuất hiện ở góc phải dưới.

Nếu tab game đã mở từ trước lúc cài, hãy reload tab một lần.

Edge dùng quy trình tương tự tại `edge://extensions`.

Không cần `npm install` và không có bước build.

## Dùng

- Chọn độ khó No Guessing trên game.
- Bấm **PHÁ ĐẢO**. Extension sẽ tự bấm đúng ô mở đầu được game đánh dấu, sau đó chỉ mở các ô được chứng minh là an toàn.
- Bấm **TẠM DỪNG** hoặc `Alt+S` để dừng. `Alt+S` cũng có thể bắt đầu.
- Thanh **Độ trễ mỗi nước** điều chỉnh tốc độ. Mặc định `110 ms`; tăng lên nếu mạng chậm hoặc server bỏ qua thao tác.

Mỗi bàn phải được bật thủ công. Solver tự dừng nếu đổi/reset bàn, rời No Guessing, gặp skin không đọc được, phát hiện trạng thái mâu thuẫn, hoặc không còn nước logic chắc chắn. Nó không đoán xác suất trong No Guessing.

## Skin hỗ trợ

Các skin có số 1–8 ánh xạ trực tiếp trong class DOM được hỗ trợ, gồm các skin mặc định như HD/Windows XP. Các skin random-color (`rc`, `rcd`, `alr`, `alrd`, `gsr`) bị từ chối vì class hiển thị không còn ánh xạ chắc chắn tới clue thật. Hãy đổi về skin HD nếu panel báo không hỗ trợ.

## Kiểm tra mã

```powershell
npm test
npm run check
```

Các file chính:

- `src/adapter.js`: đọc DOM và gửi thao tác chuột theo event flow của site.
- `src/solver.js`: solver thuần, không phụ thuộc DOM.
- `src/content.js`: state machine và panel điều khiển Shadow DOM.

## Quyền extension

- Chỉ chạy trên `https://minesweeper.online/*`.
- `storage`: lưu độ trễ và trạng thái thu gọn của panel.
- Không có code tải từ xa, không đọc lịch sử, cookie, mật khẩu hoặc tab khác.

Tham khảo: [Gameplay / No Guessing](https://minesweeper.online/help/gameplay) và [Website rules](https://minesweeper.online/help/website-rules).
