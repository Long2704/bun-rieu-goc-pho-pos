# Tên nhân viên trên phiếu bếp

Phiếu gọi món đang làm và lịch sử hiển thị duy nhất tên nhân viên ở cuối nội dung, canh phải, màu đỏ #b42318 và đậm 700; không thêm tiền tố hoặc UID. Nếu phiếu không có tên hợp lệ, không hiện UID thay thế.

orders.ordered_by_name là ảnh chụp tên từ profiles.name của created_by khi tạo phiếu. Trigger máy chủ thay thế tên do client tự truyền; tên không đổi khi sửa ghi chú, hoàn thành hoặc nhân viên đổi tên. Fragment chuyển bill giữ tên của phiếu gốc. Phiếu cũ được điền theo tác giả còn lưu (tên hiện tại lúc migration), không thể suy ra tên cũ trước một lần đổi tên đã xảy ra.

Phiếu gom từ nhiều lượt chọn dùng tác giả của phiếu đại diện hiện có. Đây là tên người tạo phiếu, không phải người bấm Xong hoặc nhân viên đang xem màn hình. Phiếu ảnh chưa có nhãn người order vì tài khoản tải ảnh không nhất thiết là người order.

Không mở quyền đọc profiles, không thêm API/polling/Realtime channel. Cột tên đi cùng select * và to_jsonb của các luồng snapshot/delta hiện có. Backfill một lần chỉ cập nhật metadata tên; không đổi trạng thái, món, giá, thanh toán hoặc phát push mới. Có invalidation Realtime một lần do metadata cũ được cập nhật; các giao dịch mới chỉ tăng nhẹ số byte dữ liệu tên.

Kiểm tra: node tests/kitchen-order-staff-sql.mjs; node tests/kitchen-order-staff-flow.mjs (mock API); npm run build. Không tạo đơn hoặc hủy/hoàn thành đơn thật để kiểm thử.

Tên hiển thị của tài khoản owner đã đổi thành Admin. Snapshot phiếu cũ mang tên Chủ quán Bún Riêu Góc Phố được hiển thị bằng bí danh Admin; dữ liệu lịch sử gốc không bị viết lại. Tên thương hiệu của quán không đổi.
