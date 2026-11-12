# Giờ bắt đầu phiên trên sơ đồ bàn

Ô bàn có khách hiển thị HH:mm ở góc trên bên trái, không thêm chữ Mở lúc hoặc icon. Dùng opened_at của phiên bàn đang hoạt động, hiển thị theo Asia/Ho_Chi_Minh; ngày đầy đủ nằm trong tooltip. Bàn trống hoặc thiếu mốc hợp lệ không hiển thị giờ. Thời gian của phiếu gọi món, thời điểm tạo cấu hình bàn và giờ mở phiên là các mốc khác nhau.

Gọi thêm món không thay giờ mở phiên. Sau khi phiên kết thúc, giờ ẩn; phiên khách mới dùng mốc mới. Các bàn gộp chia sẻ giờ của phiên đơn chung theo phép chiếu nhóm bàn sẵn có. Chuyển/gộp bàn tiếp tục dùng opened_at của phiên nhận theo logic hiện tại; không ghi lại lịch sử hoặc suy đoán từ đơn cũ.

Đồng bộ: bổ sung opened_at vào hai snapshot đọc hiện có (get_linked_table_snapshot và get_pos_sync_delta); truy vấn phiên trực tiếp của client cũ cũng chọn cột này. Giữ SECURITY INVOKER, RLS, quyền, phạm vi và số truy vấn; không thêm timer, polling, subscription hoặc tín hiệu Realtime. Payload có thêm một timestamp mỗi phiên. Không sửa opened_at hoặc bất kỳ dữ liệu giao dịch nào khi triển khai.

Kiểm thử: full local PostgreSQL regression thêm kiểm tra snapshot đầy đủ/scoped, không đổi phiên khi cài migration, thêm món và gộp bàn trống giữ giờ, giữ chặn anon/quyền. Browser giả lập HTTP/WebSocket kiểm tra múi giờ thiết bị khác Việt Nam, mốc qua ngày, bàn trống, bàn gộp, gọi thêm, đóng/mở phiên qua Realtime, cỡ 320/390/768/1440 và bấm tại vị trí giờ vẫn mở đơn. Không tạo giao dịch thử trong production.
