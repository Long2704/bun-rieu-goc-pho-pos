# Món hủy trước gửi không xuất hiện ở bếp

Lỗi: send_saved_menu_selections chọn một batch nháp làm anchor. Nó chỉ chuyển các món còn hiệu lực từ batch khác, nhưng dòng đã hủy nằm sẵn trong anchor không được xóa (đúng để giữ audit). KitchenLines trước đây chỉ lọc nước, nên hiển thị cả dòng hủy chưa từng gửi.

Sửa: thêm cancelled_before_kitchen trên dòng món. Trigger trước khi ghi nhận hủy đọc is_draft của đơn đang được RPC khóa, phân biệt trạng thái thực tế chứ không dùng cancelled_at so với created_at (transaction có thể bắt đầu trước nhưng đợi gửi xong mới hủy). Khi batch nháp chuyển thành phiếu bếp, trigger cũng đánh dấu các dòng đã hủy sẵn, bao gồm batch đang chờ trước lúc cài bản vá.

Chỉ bếp và nhãn nhóm Mang về lọc các dòng cancelled_at + cancelled_before_kitchen. Dòng hủy sau gửi vẫn có marker false, tiếp tục hiển thị gạch theo hành vi hiện có. Không xóa dòng/audit, không đổi order_id, số lượng, giá, ghi chú, bill, FIFO hoặc tính tiền. Không sửa RPC hủy/gửi/thanh toán, không thay báo cáo hoặc Realtime protocol; metadata đi qua snapshot và invalidation sẵn có.

Các phiếu đã gửi từ trước khi có marker không được tự suy diễn lại lịch sử hủy, để tránh ẩn nhầm món đã báo bếp khi hai giao dịch từng chờ nhau. Các lượt đang nháp và lượt mới được phân loại chính xác từ bản vá.

Kiểm thử PGlite: tái hiện hủy trong chính anchor trước migration, gửi sau migration rồi xác nhận ẩn; hủy nháp mới, hủy sau gửi vẫn thấy gạch, nhiều batch, hủy hết không tạo phiếu, giữ nguyên dòng/qty/note/price/position, mô phỏng timestamp cũ nhưng trạng thái đã gửi, nhãn toàn Mang về bỏ qua dòng hủy ăn tại chỗ. Browser hai màn hình giả lập có dòng hủy trước gửi, không xuất hiện ở phiếu hỗn hợp/toàn mang về; hồi quy Realtime và lưu/gửi món. Không tạo dữ liệu thử trong production.

Cập nhật máy bếp để dùng bộ lọc mới. Migration chỉ thêm metadata và trigger, client cũ vẫn hoạt động nhưng chưa có bộ lọc mới. Không ép tải lại POS khi đang thao tác.
