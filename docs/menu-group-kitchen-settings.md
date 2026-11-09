# Nhóm món có gửi bếp hay không

Owner mở Quản lý thực đơn → Thêm món mới (hoặc Sửa món). Chọn nhóm **Khác**, bấm **⚙** cạnh dấu +, tắt **Gửi món vào bếp** và **Xác nhận**. Nhóm mới tạo bằng dấu + cũng có công tắc này. Các món không gửi bếp vẫn nằm trong đơn và hóa đơn.

Bật/tắt cập nhật phân loại hiện hành của các món thuộc nhóm, giữ nhóm hiển thị và giá. Các dòng order_items/bill_items đã lưu không thay đổi. Khi bật lại, giữ loại món chính/phụ đã ghi trước đó; đồ uống bật gửi bếp được xếp như món phụ. Không tự chạy lại đơn đã hoàn thành hoặc xóa phiếu cũ.

Nếu đang sửa một món đã có khi đổi cấu hình nhóm, đóng và mở lại món để lấy version mới trước khi lưu. Món mới đang nhập vẫn giữ tên/giá. Lỗi mạng có nút thử lại cùng mã; replay cũ không đảo ngược cấu hình mới hơn.

## Cài đặt một lần

Sau phần nhóm món gốc, chạy [menu_group_kitchen_settings.sql](../releases/menu_group_kitchen_settings.sql) trên đúng project POS `uiwzinyckukaqlbznnam`. Script thêm metadata/ledger/RPC và trả danh sách nhóm với send_to_kitchen; không tự tắt nhóm Khác hoặc ghi lại giao dịch cũ. Sau đó mở lại app, thực hiện chọn Khác → ⚙ → tắt công tắc để áp dụng.

Trợ lý không có quyền vào project thật (kết nối chỉ thấy pos-new), nên chưa chạy SQL hoặc đổi Khác trên production. Frontend tương thích schema nhóm cũ: giữ tạo nhóm cũ, nút cấu hình khóa cho đến khi backend công bố capability kitchen_settings. Không chạy lại SQL cài nhóm gốc.

## Kiểm tra

Build; PGlite tests/menu-group-routing-sql.mjs: quyền Owner, replay, conflict version, tắt/bật nhóm mặc định và nhóm riêng, snapshot đơn cũ giữ nguyên, đơn mới không vào bếp, replay không ghi đè bật/tắt mới. Chromium tests/menu-group-routing-flow.mjs: tạo nhóm và sửa công tắc, ACK loss/retry, lọc ba vai trò và kéo món; tests/menu-groups-flow.mjs kiểm tra schema cũ. API/DB giả lập; không ghi dữ liệu thật.
