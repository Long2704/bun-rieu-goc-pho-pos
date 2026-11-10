# Chạm khung món để chọn và chỉnh sửa

Ở màn hình chọn món, có thể chạm vào khung hoặc dùng Enter/Space trên nút chọn/chỉnh món:

1. Chưa chọn: chạm bất kỳ chỗ nào trong khung để chọn đúng 1 phần.
2. Đã chọn: chạm lại khung để mở **Chi tiết món**, chỉnh ghi chú và dùng nút −/+ để đổi số lượng. Chạm khung không tự tăng thêm phần.
3. Bấm **Cập nhật món** để lưu chỉnh sửa vào phần món đang chọn. Đóng hoặc Esc bỏ thay đổi trong cửa sổ, giữ phần đã chọn trước đó.
4. Chọn số lượng 0 và bấm **Xóa khỏi đơn** để bỏ phần chưa gửi; lần chạm sau lại chọn 1 phần, ghi chú cũ được xóa.

Giới hạn số lượng 99 và ghi chú 500 ký tự như hiện có. Món không gửi bếp chỉ có số lượng, không có ô ghi chú món. Món hết tạm thời vẫn bị ẩn theo bộ lọc cũ. Đây là chỉnh sửa giỏ món chưa gửi, không sửa số lượng hoặc ghi chú của món đã gửi bếp. Việc gửi, thanh toán và tự lưu món không gửi bếp giữ nguyên.

Không cần SQL hoặc thay đổi quyền. Kiểm chứng: `npm run build` và `POS_TEST_URL=http://localhost:5196 node tests/product-card-editor-flow.mjs`. API trong kiểm thử được giả lập; bao gồm chạm khung/giá/icon, chạm nhanh hai lần, mở lại nhiều lần, lưu/hủy ghi chú và số lượng, bàn phím, xóa/giới hạn 99, món không gửi bếp và dữ liệu gửi đơn chính xác.

Nút − / số lượng / + vẫn hiện ngay trên khung món đã chọn để chỉnh nhanh, không mở cửa sổ ghi chú. Bấm phần còn lại của khung sẽ mở chi tiết mà không tăng số lượng. Giảm từ 1 giữ bước xác nhận bỏ món hiện có.
