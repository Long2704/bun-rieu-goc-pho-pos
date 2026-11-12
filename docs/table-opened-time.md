# Bộ đếm thời gian bàn đã mở

Ô bàn có khách hiển thị bộ đếm tăng dần HH:MM:SS ở góc trên bên trái, không kèm chữ hay icon. Ví dụ 00:12:34 là 12 phút 34 giây, không phải giờ trên đồng hồ. Dùng thời gian hiện tại trừ opened_at của phiên đang hoạt động, không cộng dồn theo số lần chạy interval. Không quay về 0 khi tải lại hoặc đổi thiết bị/múi giờ; quá 24 giờ vẫn tiếp tục đếm số giờ. Không hiển thị nếu bàn trống hoặc thiếu mốc hợp lệ; thời gian âm được giới hạn về 0.

Gọi thêm món không khởi động lại bộ đếm. Sau thanh toán kết thúc phiên, bộ đếm ẩn; phiên khách mới bắt đầu từ 0. Thanh toán riêng một bill nhưng còn bill khác thì phiên vẫn mở và tiếp tục đếm. Các bàn gộp dùng chung mốc của phiên đơn chung theo phép chiếu sẵn có. Chuyển/gộp bàn tiếp tục dùng opened_at của phiên nhận theo logic hiện tại; không ghi lại lịch sử hoặc suy đoán từ phiếu bếp.

Tối ưu: một interval UI 1 giây dùng chung cho tất cả ô bàn đang hiển thị, chỉ cập nhật các component time thông qua useSyncExternalStore; không render lại toàn bộ app. Khi tab ẩn hoặc không còn bộ đếm trên sơ đồ, interval và listener được dọn. Khi trở lại, tính ngay chênh lệch thời gian thực tế để không mất khoảng thời gian ở nền. Không lưu bộ đếm mỗi giây và không gọi API/Realtime theo nhịp đếm.

Dữ liệu: opened_at đã được bổ sung vào hai snapshot đọc hiện có (get_linked_table_snapshot và get_pos_sync_delta); truy vấn phiên trực tiếp cũng chọn cột này. Giữ nguyên migration đó, SECURITY INVOKER, RLS, quyền, phạm vi và số truy vấn. Không thêm polling/subscription/tín hiệu Realtime hoặc sửa dữ liệu giao dịch để đổi từ giờ mở bàn sang bộ đếm.

Kiểm thử: browser giả lập HTTP/WebSocket và thời gian kiểm tra một ticker cho nhiều bàn, tăng giây, tải lại, nền/hiện lại, dừng ticker khi rời sơ đồ, hơn 24 giờ, múi giờ thiết bị khác, bàn trống/bàn gộp, gọi thêm, kết thúc/mở phiên mới qua Realtime và cỡ 320/390/768/1440 không đè biểu tượng/nội dung. Không tạo giao dịch thử trong production.

Ảnh hưởng: góc ô bàn hiển thị thời lượng thay cho HH:mm giờ mở. Có một nhịp cập nhật giao diện cục bộ khi xem sơ đồ; không tăng lượt gọi máy chủ, lưu trữ, số message hoặc kết nối Realtime. Tiền, hóa đơn, Dashboard, báo cáo và thao tác bàn giữ nguyên.
