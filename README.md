# Mine Cheater

Chrome/Edge extension gợi ý ô an toàn tiếp theo trên bàn **No Guessing** của [minesweeper.online](https://minesweeper.online/), dựa trên đúng dữ liệu đang nhìn thấy trên bàn cờ. Người chơi tự bấm mọi ô.

Extension không đọc đáp án ẩn, không chạm vào state nội bộ của game và không gửi thao tác chuột nào vào trang. Nó đọc các ô đã mở, dựng ràng buộc Minesweeper, suy luận ô chắc chắn an toàn bằng rule cơ bản, subset-difference và exact CSP, rồi viền sáng một ô để bạn tự bấm. Khi bàn còn nguyên, nó chỉ trỏ vào ô `.start` do No Guessing chỉ định.

> [!WARNING]
> **Tài khoản dùng để test extension này đã bị minesweeper.online ban thật.** Luật của site ghi rõ mọi chương trình tự click **hoặc giúp giải game** (ví dụ board analyser) đều là gian lận, nên chế độ chỉ gợi ý, bạn tự bấm vẫn vi phạm; game master có toàn quyền xử lý theo quy định của họ. Extension không có cơ chế ẩn/né anti-cheat. Dùng nó đồng nghĩa với nguy cơ mất tài khoản; việc đăng xuất cũng không làm cách dùng này trở thành được phép hoặc an toàn. Không dùng trong PvP/Arena/giải đấu.

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
- Bấm **BẬT GỢI Ý** hoặc `Alt+S`. Lựa chọn bật/tắt được nhớ cho các lần sau.
- Ô cần bấm được viền xanh nhấp nháy. Bạn tự bấm; khi bàn thay đổi, extension tính lại và chuyển viền sang ô an toàn kế tiếp, ưu tiên ô gần ô vừa gợi ý.
- Viền vàng nghĩa là ô đó đang cắm cờ nhưng chắc chắn an toàn: gỡ cờ rồi mở.
- Bấm **TẮT GỢI Ý** hoặc `Alt+S` để ẩn viền.

Extension không gợi ý khi rời No Guessing, gặp skin không đọc được, phát hiện trạng thái mâu thuẫn hoặc không còn nước logic chắc chắn. Nó không đoán xác suất. Trong lúc bạn đang giữ chuột, nó tạm không đọc bàn để tránh nhầm ô đang bị nhấn thành ô đã mở.

## Skin hỗ trợ

Các skin có số 1–8 ánh xạ trực tiếp trong class DOM được hỗ trợ, gồm các skin mặc định như HD/Windows XP. Các skin random-color (`rc`, `rcd`, `alr`, `alrd`, `gsr`) bị từ chối vì class hiển thị không còn ánh xạ chắc chắn tới clue thật. Hãy đổi về skin HD nếu panel báo không hỗ trợ.

## Kiểm tra mã

```powershell
npm test
npm run check
```

Các file chính:

- `src/adapter.js`: chỉ đọc DOM của bàn cờ, không phát sự kiện nào vào trang.
- `src/solver.js`: solver thuần, không phụ thuộc DOM.
- `src/content.js`: theo dõi bàn, chọn ô gợi ý, vẽ viền và panel điều khiển trong Shadow DOM.

## Quyền extension

- Chỉ chạy trên `https://minesweeper.online/*`.
- `storage`: lưu trạng thái bật gợi ý và thu gọn panel.
- Không có code tải từ xa, không đọc lịch sử, cookie, mật khẩu hoặc tab khác.

Tham khảo: [Gameplay / No Guessing](https://minesweeper.online/help/gameplay) và [Website rules](https://minesweeper.online/help/website-rules).
