# Giao diện thanh toán gọn

Chi tiết món nằm đầu popup và mặc định mở mỗi khi vào thanh toán, gồm số lượng, giá và ghi chú. Có thể thu gọn thủ công; mở lại popup sẽ mở sẵn và cuộn về đầu. Khi có nhiều bill, chọn bill phía trên danh sách để xem đúng món.

Số tiền cần thu hiển thị gọn dưới danh sách, cùng khu vực tiền mặt/chuyển khoản, tiền khách đưa và tiền thối. Toàn bộ nội dung cuộn chung; nút xác nhận giữ ở footer riêng. Giao diện dùng nền kem–cam. Ô tiền khách đưa mặc định bằng số phải thu, chọn bill khác cập nhật đúng số tiền của bill đó.

Bỏ input giảm giá với mọi vai trò, dòng tạm tính lặp lại, legend Thông tin thanh toán và hướng dẫn nhập tiền dài. Danh sách món/ghi chú trong Chi tiết món mở sẵn, tổng số lượng luôn hiện. Giữ nhắc kiểm tra tiền vào tài khoản khi chọn chuyển khoản và cảnh báo trạng thái thanh toán chưa xác nhận. Nhãn số tiền đổi thành Chờ xác nhận hoặc Đã thanh toán cho giao dịch đang chờ; nếu snapshot bị server từ chối, hiển thị Kiểm tra lại đơn thay vì số 0đ gây hiểu nhầm.

## Tính tiền và giao dịch đang chờ

Yêu cầu mới luôn gửi discount_type=amount, discount_value=0. Không sửa backend/RLS hoặc quyền tài chính. Cơ chế server tính tiền, khóa, kiểm tra quyền, snapshot ID món và UUID chống trùng không đổi.

Yêu cầu đang chờ từ phiên bản cũ vẫn giữ toàn bộ payload gốc, kể cả giảm giá. UI hiện tổng tiền đã lưu và thông tin giảm giá chỉ đọc; không tính lại thành giá đầy đủ, không cho sửa phương thức/tiền khách đưa, không tạo UUID mới. Waiter/Kitchen không được tự tiếp tục yêu cầu giảm giá chưa có bill nếu thiếu quyền cũ. Nếu đã có billId, thử lại chỉ tải hóa đơn. Hóa đơn cũ có giảm giá vẫn hiện số liệu gốc; hóa đơn không giảm không lặp lại tạm tính/giảm 0đ. Không in hoặc xóa hóa đơn.

## Kiểm tra

- TypeScript/Vite build.
- npm run test:payment-layout: fixture tổng 291.000đ, 6 dòng/7 món, cuộn tới số tiền và nút luôn trong popup ở 375/390/414/desktop và viewport thấp 390×480, không tràn ngang, danh sách mở sẵn ở trên và hiện ghi chú, thu gọn/mở lại popup đặt lại trạng thái, tiền mặt/tiền thối/thiếu tiền/ký tự sai, chuyển khoản, Owner/Waiter/Kitchen, đổi bill, yêu cầu giảm giá cũ giữ nguyên và không nâng quyền cho staff. Viewport thấp chỉ giả lập không gian bàn phím, chưa kiểm tra bàn phím iOS thật.
- npm run test:payments: giao dịch mới không giảm giá, lost-response/reload giữ UUID, không thu trùng, receipt-only recovery, từ chối snapshot cũ, hóa đơn gần đây.
- POS reference suite: gọi món/ghi chú và thanh toán, 375/390/414/desktop.
- Ảnh cash/transfer được kiểm tra trên Chromium. Toàn bộ test dùng Auth/API giả, không tạo giao dịch thật.

## Phát hành và quay lại

Chỉ frontend; không cần SQL hoặc Edge Function. Phát hành qua main/Vercel/PWA hiện có. Hoàn tất thao tác đang chờ, nhận thông báo bản mới rồi đóng mọi cửa sổ POS và mở lại. Nếu cần rollback, revert commit giao diện, build/deploy lại với cơ chế worker hiện có; không xóa localStorage hoặc dữ liệu đơn/hóa đơn. Cả phiên bản trước và mới đều hiểu cấu trúc pending payment hiện tại.
