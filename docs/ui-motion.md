# Chuyển động giao diện

Tham khảo video người dùng cung cấp ngày 09/11/2026: mở màn món từ ô bàn, thu về ô bàn khi đóng và chuyển nhóm món nhẹ. Giữ giao diện kem–cam của quán.

- Mở/đóng bàn dùng chuyển cảnh giữa ô bàn và màn đơn/món (khoảng 340 ms) trên trình duyệt hỗ trợ View Transitions. Trình duyệt cũ vẫn mở/đóng bình thường. Chuyển nhóm món có hiệu ứng mờ/trượt nhẹ 200 ms.
- Vuốt phiếu bếp đi theo tay bằng transform; không giật về vị trí ban đầu khi thả đủ ngưỡng.
- Khi thả đủ ngưỡng hoặc bấm Xong: gửi yêu cầu và trượt phiếu 240 ms/thu khoảng trống 270 ms đồng thời. Không giữ phiếu đứng chờ mạng. Chỉ xác nhận hoàn thành khi server trả thành công; nếu lỗi, hiện lại phiếu trong 200 ms để thử lại. Thứ tự phiếu còn lại không đổi.
- Gửi lỗi: phiếu trở lại để thử lại. Vuốt ngắn hoặc cuộn dọc không hoàn thành phiếu. Khóa thao tác để mỗi lần vuốt chỉ gọi hoàn thành một lần.
- Áp dụng cho phiếu món và phiếu ảnh. Phiếu ảnh cũng ẩn tạm ngay, nhưng chỉ loại hẳn sau khi server xác nhận dọn ảnh xong; lỗi dọn ảnh sẽ hiện lại phiếu.
- Tôn trọng thiết lập giảm chuyển động của thiết bị; không đổi SQL, quyền truy cập hay dữ liệu hóa đơn.

Kiểm thử dùng Chromium/API giả: `POS_TEST_URL=http://localhost:5194 node tests/kitchen-motion-flow.mjs`, `tests/kitchen-images-flow.mjs`, `tests/kitchen-cancelled-items-flow.mjs`. Bài mới kiểm tra chuyển cảnh thực tế, fallback trình duyệt cũ, vuốt ngắn/dọc, lỗi/khôi phục, xác nhận trước khi rời, một request, FIFO và giảm chuyển động. Đã ghi và xem lại video thử; chưa kiểm tra trên iPhone thật.

## Sửa lỗi vuốt cảm ứng

Đã tái hiện lỗi bằng cảm ứng di động: trình duyệt ngầm giữ điểm chạm trên tên món/ghi chú rồi chuyển sang article của phiếu. Sự kiện mất capture từ phần tử con nổi lên và bị hiểu nhầm là hủy cử chỉ, nên vuốt dừng giữa chừng. Chỉ reset khi chính phiếu mất capture của đúng ngón tay đang theo dõi; không để ngón phụ thay cử chỉ hiện tại. Không thay đổi RPC hoặc SQL.

Bài kiểm tra cảm ứng: `POS_TEST_URL=http://localhost:5194 node tests/kitchen-touch-swipe-flow.mjs`. Dùng CDP touch input (khác với mouse), kiểm tra tên món/ghi chú/thời gian, cả hai chiều, vuốt ngắn/dọc/hủy, lỗi rồi thử lại một lần và FIFO. Bài này thất bại với bản trước và đạt sau sửa. Phiếu ảnh: `SWIPE_TOUCH=1 POS_TEST_URL=http://localhost:5194 node tests/kitchen-images-flow.mjs`. Chưa kiểm tra trên iPhone thật.

## Phiếu bếp gọn và vuốt liền mạch (12/11/2026)

Bỏ bộ đếm mới/nút đánh dấu đã xem và nhãn Mới trên từng phiếu; giữ chuông và chức năng bật/tắt âm thanh. Phiếu giảm padding còn 12 × 14 px, khoảng cách giữa phiếu 10 px, danh sách món cách tiêu đề 7 px, nút Xong tối thiểu 44 px. Ghi chú và tên món vẫn hiển thị đủ. CSS chỉ áp dụng trong trang bếp.

Animation trượt/thu chạy đồng thời với RPC. Hết chuyển động, phiếu ẩn khỏi bố cục để không giữ một ô trống chờ mạng. Mobile xếp cột, desktop chuyển vị trí các phiếu lân cận bằng transform để tránh cú nhảy khi loại phần tử. Khi server báo lỗi, phục hồi phiếu; khi server đã xác nhận thành công nhưng tải snapshot tiếp theo lỗi, không đưa phiếu đã xong trở lại. Không ghi thành công giả, không đổi RPC/SQL hoặc quyền; không tăng polling hay subscription. Mỗi phiếu khóa thao tác khi xử lý để tránh gửi đôi.

Kiểm thử browser giả lập HTTP/WebSocket: kitchen-compact-flow (kích thước, Xong/nhấp đôi, RPC chậm, vị trí phiếu tiếp theo trước/sau ACK, lỗi/phục hồi, snapshot lỗi sau ACK); kitchen-touch-swipe-flow (touch thật, trái/phải, ngắn/dọc/hủy, phản hồi chậm); kitchen-tools-flow (không badge/counter, chuông/dedup/âm thanh/lịch sử); kitchen-images-flow (phiếu ảnh, lỗi purge, retry). Hỗ trợ giảm chuyển động. Không tạo phiếu thử trong production.

Ảnh hưởng: chứa nhiều phiếu hơn và thao tác phản hồi ngay; không còn đánh dấu đơn mới bằng chữ, chuông vẫn tùy chọn. Trạng thái thành công ở dữ liệu vẫn phụ thuộc máy chủ, phiếu lỗi sẽ quay lại; thao tác hoàn thành kế tiếp chờ xác nhận yêu cầu đang chạy. Giao diện phục vụ, Dashboard, Excel, tiền và hóa đơn giữ nguyên.
