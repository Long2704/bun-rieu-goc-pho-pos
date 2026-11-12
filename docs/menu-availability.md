# Đang bán và Hết món tạm thời

Hai cờ sẵn có được giữ nguyên:

- Đang bán (is_active): bật để hiện ở menu gọi món; tắt để ẩn/ngừng bán.
- Hết món tạm thời (is_out): khi vẫn đang bán, món vẫn hiện tại đúng thứ tự/nhóm và tìm kiếm được, nhưng card có nền nhạt, tên/ảnh làm dịu, nhãn Tạm hết và nút thêm bị khóa. Bỏ cờ này để gọi món lại.
- Nếu cả hai cùng được đặt (ngừng bán + tạm hết), món vẫn ẩn khỏi menu phục vụ. Danh sách quản lý vẫn hiển thị để sửa.

Lỗi cũ nằm ở searchProducts: loại toàn bộ is_out khỏi menu dù dữ liệu vẫn có. Nay chỉ lọc theo nhóm/tên; truy vấn máy chủ hiện có vẫn chỉ tải món is_active=true. Không thêm API hay lọc đang bán tự động mới, không đổi cấu trúc cờ, quyền, RPC quản lý, cơ chế phiên bản/chống retry hoặc subscription Realtime.

Món tạm hết chưa chọn không thể thêm bằng nhấn card, nút + hoặc bàn phím, và không có animation bay giả. Nếu phần chưa gửi đã chọn trước khi món chuyển sang tạm hết, giữ nguyên số lượng/ghi chú, khóa tăng nhưng vẫn cho giảm/xóa qua điều khiển hiện có. Không tự hủy hoặc sửa món đã lưu/gửi bếp/thanh toán. Giữ nguyên kiểm tra món khả dụng khi lưu đơn mới và trạng thái lỗi/retry hiện có. Không tự động khôi phục món mỗi ngày; quản lý bỏ tick khi có hàng trở lại.

Màn sửa thực đơn bổ sung giải thích ngắn dưới mỗi ô tick để tránh nhầm hai trạng thái. Thay đổi vẫn được gửi qua RPC và luồng đồng bộ catalog sẵn có; không tăng polling hoặc message nền.

Kiểm thử: browser manager/phục vụ với HTTP/WebSocket giả lập kiểm tra lưu cờ, peer nhận catalog, tạm hết hiện trong nhóm/tìm kiếm nhưng không chọn/tăng/animation, phần đã chọn giữ nguyên và xóa được, có món lại mở chọn, tắt Đang bán thì ẩn kể cả cả hai cờ, responsive 320/390/1440. Hồi quy product-card-editor giữ ghi chú/qty/send chính xác. Không có mutation đơn hoặc dữ liệu thật trong kiểm thử.
