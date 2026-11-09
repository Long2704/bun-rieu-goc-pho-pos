# Chuyển động giao diện

Tham khảo video người dùng cung cấp ngày 09/11/2026: mở màn món từ ô bàn, thu về ô bàn khi đóng và chuyển nhóm món nhẹ. Giữ giao diện kem–cam của quán.

- Mở/đóng bàn dùng chuyển cảnh giữa ô bàn và màn đơn/món (khoảng 340 ms) trên trình duyệt hỗ trợ View Transitions. Trình duyệt cũ vẫn mở/đóng bình thường. Chuyển nhóm món có hiệu ứng mờ/trượt nhẹ 200 ms.
- Vuốt phiếu bếp đi theo tay bằng transform; không giật về vị trí ban đầu khi thả đủ ngưỡng.
- Chờ server xác nhận trước khi báo hoàn thành. Thành công: trượt ra 230 ms, thu khoảng trống 190 ms rồi đồng bộ danh sách. Thứ tự phiếu còn lại không đổi.
- Gửi lỗi: phiếu trở lại để thử lại. Vuốt ngắn hoặc cuộn dọc không hoàn thành phiếu. Khóa thao tác để mỗi lần vuốt chỉ gọi hoàn thành một lần.
- Áp dụng cho phiếu món và phiếu ảnh. Luồng xóa ảnh vẫn chờ server xác nhận đã dọn trước khi chạy hiệu ứng kết thúc.
- Tôn trọng thiết lập giảm chuyển động của thiết bị; không đổi SQL, quyền truy cập hay dữ liệu hóa đơn.

Kiểm thử dùng Chromium/API giả: `POS_TEST_URL=http://localhost:5194 node tests/kitchen-motion-flow.mjs`, `tests/kitchen-images-flow.mjs`, `tests/kitchen-cancelled-items-flow.mjs`. Bài mới kiểm tra chuyển cảnh thực tế, fallback trình duyệt cũ, vuốt ngắn/dọc, lỗi/khôi phục, xác nhận trước khi rời, một request, FIFO và giảm chuyển động. Đã ghi và xem lại video thử; chưa kiểm tra trên iPhone thật.

## Sửa lỗi vuốt cảm ứng

Đã tái hiện lỗi bằng cảm ứng di động: trình duyệt ngầm giữ điểm chạm trên tên món/ghi chú rồi chuyển sang article của phiếu. Sự kiện mất capture từ phần tử con nổi lên và bị hiểu nhầm là hủy cử chỉ, nên vuốt dừng giữa chừng. Chỉ reset khi chính phiếu mất capture của đúng ngón tay đang theo dõi; không để ngón phụ thay cử chỉ hiện tại. Không thay đổi RPC hoặc SQL.

Bài kiểm tra cảm ứng: `POS_TEST_URL=http://localhost:5194 node tests/kitchen-touch-swipe-flow.mjs`. Dùng CDP touch input (khác với mouse), kiểm tra tên món/ghi chú/thời gian, cả hai chiều, vuốt ngắn/dọc/hủy, lỗi rồi thử lại một lần và FIFO. Bài này thất bại với bản trước và đạt sau sửa. Phiếu ảnh: `SWIPE_TOUCH=1 POS_TEST_URL=http://localhost:5194 node tests/kitchen-images-flow.mjs`. Chưa kiểm tra trên iPhone thật.
