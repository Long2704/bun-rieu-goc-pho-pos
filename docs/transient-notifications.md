# Thông báo thao tác và ghi chú bếp

Thông báo kết quả như lưu/gửi đơn, hủy bàn, chuyển bàn, chuyển bill, lưu món/nhóm/bàn và thao tác nhân viên thành công hiển thị dạng pop-up nhỏ ở phía trên màn hình. Thông báo tự tắt sau **1 giây**, có nút × để đóng sớm và không đẩy nội dung trang xuống.

Mỗi thao tác mới được hiển thị trong 1 giây kể cả khi thông báo có cùng nội dung lần trước. Thông báo dùng `role=status` để trình đọc màn hình nhận biết.

Hộp xác nhận thao tác, lỗi cần kiểm tra, thông báo mất mạng và yêu cầu đang chờ xác nhận vẫn giữ cách xử lý hiện tại, bao gồm nút thử lại. Không tự xác nhận hoặc hủy thao tác sau 1 giây.

Ghi chú dưới món trong bếp dùng chữ nhỏ, nền trong suốt và vạch cam mảnh bên trái. Nội dung dài/multiple dòng vẫn hiện đầy đủ, tự xuống dòng; không cắt ghi chú. Ghi chú của món đã hủy vẫn gạch ngang.

Không cần SQL hoặc thay đổi dữ liệu.

Kiểm tra: `POS_TEST_URL=http://localhost:5194 node tests/toast-kitchen-notes-flow.mjs` với dev server cấu hình Supabase giả như fixture; kiểm tra thông báo lặp lại, tự tắt/đóng sớm, không dịch bố cục, hủy bàn, hộp xác nhận không tự đóng, ghi chú nhiều dòng và màn hình 375/390/414/desktop. `tests/kitchen-cancelled-items-flow.mjs` kiểm tra lại món hủy, ghi chú, thứ tự phiếu và Xong. Browser dùng Chromium/API giả; chưa kiểm tra iPhone thật.

Ảnh hưởng: thời gian đọc thông báo kết quả ngắn hơn. Không thay đổi đơn hàng, thanh toán, dữ liệu, API hoặc Realtime. Hộp xác nhận và lỗi cần xử lý không tự tắt.
