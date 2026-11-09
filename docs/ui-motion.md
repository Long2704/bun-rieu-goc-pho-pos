# Chuyển động giao diện

Tham khảo video người dùng cung cấp ngày 09/11/2026: mở màn món từ ô bàn, thu về ô bàn khi đóng và chuyển nhóm món nhẹ. Giữ giao diện kem–cam của quán.

- Mở/đóng bàn dùng chuyển cảnh giữa ô bàn và màn đơn/món (khoảng 340 ms) trên trình duyệt hỗ trợ View Transitions. Trình duyệt cũ vẫn mở/đóng bình thường. Chuyển nhóm món có hiệu ứng mờ/trượt nhẹ 200 ms.
- Vuốt phiếu bếp đi theo tay bằng transform; không giật về vị trí ban đầu khi thả đủ ngưỡng.
- Chờ server xác nhận trước khi báo hoàn thành. Thành công: trượt ra 230 ms, thu khoảng trống 190 ms rồi đồng bộ danh sách. Thứ tự phiếu còn lại không đổi.
- Gửi lỗi: phiếu trở lại để thử lại. Vuốt ngắn hoặc cuộn dọc không hoàn thành phiếu. Khóa thao tác để mỗi lần vuốt chỉ gọi hoàn thành một lần.
- Áp dụng cho phiếu món và phiếu ảnh. Luồng xóa ảnh vẫn chờ server xác nhận đã dọn trước khi chạy hiệu ứng kết thúc.
- Tôn trọng thiết lập giảm chuyển động của thiết bị; không đổi SQL, quyền truy cập hay dữ liệu hóa đơn.

Kiểm thử dùng Chromium/API giả: `POS_TEST_URL=http://localhost:5194 node tests/kitchen-motion-flow.mjs`, `tests/kitchen-images-flow.mjs`, `tests/kitchen-cancelled-items-flow.mjs`. Bài mới kiểm tra chuyển cảnh thực tế, fallback trình duyệt cũ, vuốt ngắn/dọc, lỗi/khôi phục, xác nhận trước khi rời, một request, FIFO và giảm chuyển động. Đã ghi và xem lại video thử; chưa kiểm tra trên iPhone thật.
