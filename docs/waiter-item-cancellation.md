# Phục vụ hủy từng món

Phục vụ được hủy món chưa thanh toán, gồm món bếp đang làm, món đã ra và món không gửi bếp. Món đã thanh toán và phiên bàn đã đóng vẫn bị chặn. Nhóm có nhiều lượt gọi cùng món: mở dấu ba chấm để chọn đúng lượt rồi bấm Hủy → Xác nhận hủy món. Hủy áp dụng toàn bộ số lượng của dòng được chọn.

Món hủy không tính vào tiền còn phải trả; nhật ký ghi người hủy, số lượng và giá. Phiếu bếp đang làm giữ món bị gạch và giữ nguyên vị trí nhờ cơ chế giữ phiếu hiện có. Thử lại cùng dòng sau lỗi mạng không tạo nhật ký hủy lần hai.

Migration `20261110125215_waiter_item_cancellation.sql` bổ sung riêng `orders.cancel` cho `phuc_vu`, giữ toàn bộ quyền khác hiện có, và đổi kiểm tra RPC sang quyền tập trung. Tài khoản khóa, phải đổi mật khẩu, phiên bị thu hồi và khách chưa đăng nhập không được hủy. Bếp không được cấp quyền hủy từng món. Migration chỉ thay hàm, không hủy món hay sửa dữ liệu bán hàng. App đang mở nhận quyền ở lần đồng bộ tiếp theo.

Kiểm chứng: `node tests/bill-table-transfer-sql.mjs` chạy PGlite cùng các kiểm thử hồi quy; `POS_TEST_URL=http://localhost:5196 node tests/waiter-item-cancellation-flow.mjs` chạy giao diện với toàn bộ API giả lập. Không dùng đơn thật để thử hủy.
