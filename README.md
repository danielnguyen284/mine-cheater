# Mine Cheater

Chrome/Edge extension gợi ý ô an toàn tiếp theo trên bàn **No Guessing** của [minesweeper.online](https://minesweeper.online/), dựa trên đúng dữ liệu đang nhìn thấy trên bàn cờ. Người chơi tự bấm mọi ô.

Extension không đọc đáp án ẩn, không chạm vào state nội bộ của game và không gửi thao tác chuột nào vào trang. Nó đọc các ô đã mở, dựng ràng buộc Minesweeper, suy luận ô chắc chắn an toàn bằng rule cơ bản, subset-difference và exact CSP, rồi tô màu mọi ô cần xử lý để bạn tự bấm. Khi bàn còn nguyên, nó chỉ trỏ vào ô `.start` do No Guessing chỉ định.

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
- Chọn kiểu chơi trên panel:
  - **Hiệu suất** (mặc định): cắm cờ và chord theo kiểu ZiNi. Chỉ cắm cờ một mìn khi chord ở ô số bên cạnh mở được nhiều ô hơn số click bỏ ra (cờ còn thiếu + 1 click chord). Cờ đã cắm sẵn không tính phí.
  - **NF (không cờ)**: chỉ click trái từng ô an toàn.
- Mọi ô đã chứng minh được đều sáng cùng lúc, nên bạn bấm liên tục mà không phải chờ tính lại:
  - Xanh lá: click trái mở ô.
  - Đỏ: click phải cắm cờ.
  - Xanh dương: chord lên ô số đó sau khi đã cắm đủ cờ đỏ quanh nó.
  - Xanh lá viền đứt: ô an toàn mà chord sẽ tự mở, không cần bấm riêng.
  - Vàng: cờ cắm nhầm trên ô chắc chắn an toàn, gỡ cờ rồi mở.
- Dòng trạng thái cho biết số cờ, số chord và số click tiết kiệm so với bấm chay.
- Bấm **TẮT GỢI Ý** hoặc `Alt+S` để ẩn viền.

Extension không gợi ý khi rời No Guessing, gặp skin không đọc được, phát hiện trạng thái mâu thuẫn hoặc không còn nước logic chắc chắn. Nó không đoán xác suất. Chord chỉ được gợi ý khi mọi ô đóng quanh ô số đều đã được chứng minh và không có cờ cắm nhầm ở đó. Trong lúc bạn đang giữ chuột, nó tạm không đọc bàn để tránh nhầm ô đang bị nhấn thành ô đã mở.

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
- `src/planner.js`: biến kết quả solver thành kế hoạch click (NF hoặc cắm cờ + chord kiểu ZiNi), không phụ thuộc DOM.
- `src/content.js`: theo dõi bàn, tô màu các ô theo kế hoạch và panel điều khiển trong Shadow DOM.

## Quyền extension

- Chỉ chạy trên `https://minesweeper.online/*`.
- `storage`: lưu trạng thái bật gợi ý, kiểu chơi và thu gọn panel.
- Không có code tải từ xa, không đọc lịch sử, cookie, mật khẩu hoặc tab khác.

Tham khảo: [Gameplay / No Guessing](https://minesweeper.online/help/gameplay) và [Website rules](https://minesweeper.online/help/website-rules).
