# Lưu lượt chọn món vào bàn

Bấm **Xem đơn** lưu mỗi lượt chọn thành một phiếu trong phiên bàn, chưa báo bếp. Chỉ xóa phần chọn trên menu sau khi server xác nhận và tải được dữ liệu mới. **+ Thêm món** mở menu trống với danh mục Tất cả, không mang theo số lượng hay ghi chú lượt trước. Nếu đang có phần thêm nhanh chưa lưu, lưu phần đó trước rồi mở lượt mới.

Mỗi lượt giữ dòng món và ghi chú riêng, kể cả cùng món. Nút tăng/giảm hoặc **Chỉnh món** chỉ sửa dòng đó trước khi gửi; giảm về 0 trong cửa sổ chỉnh món để bỏ dòng. Món không gửi bếp không có ghi chú và vẫn thanh toán được ngay. Món bếp chưa gửi được đánh dấu trên sơ đồ bàn và phải **Gửi bếp** trước khi thu tiền. Pop-up thoát đơn vẫn cho phép Thông báo hoặc Không.

`save_menu_selection` dùng mã yêu cầu bền vững theo cơ chế gửi hiện có, giữ nguyên giá đã kiểm tra và bill chưa trả thấp nhất. `orders.is_draft` mặc định false nên dữ liệu cũ giữ nguyên. `send_saved_menu_selections` chỉ báo các UUID phiếu chụp tại lúc gửi; gửi lại không báo thêm lượt tạo sau đó. Thời gian vào hàng đợi bếp tính từ lúc thông báo. Phiếu tách khi chuyển bill giữ cờ chờ gửi. Các lệnh lưu/sửa/gửi yêu cầu quyền orders.create; không mở quyền ghi bảng trực tiếp. Trigger chặn thanh toán món bếp chưa gửi trên mọi client. Sửa dòng dùng kiểm tra số lượng/ghi chú cũ để tránh ghi đè thiết bị khác.

Triển khai migration `20261110161606_saved_menu_batches.sql` trước UI. Cờ `saved_menu_selections` trong get_my_access bật luồng mới; client cũ cần tải lại để dùng chức năng. Không reset hay sửa đơn bán hàng hiện có.

Kiểm chứng: `npm run build`, `node tests/bill-table-transfer-sql.mjs`, `node tests/saved-menu-selections-flow.mjs`, `npm run test:product-card-editor`. SQL chạy PGlite; mọi API trong kiểm thử trình duyệt được giả lập. Kiểm tra lưu/mở lại, hai màn hình, thử lại cùng mã sau mất phản hồi, menu reset, tách dòng/ghi chú, sửa đúng một dòng, không gửi nước, chỉ gửi các phiếu chờ đã chọn, bảo vệ thanh toán và chuyển bill.
