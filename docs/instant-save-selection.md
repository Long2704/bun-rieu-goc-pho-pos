# Xem đơn mở ngay, lưu và xác nhận ở nền

Bấm Xem đơn chuyển ngay sang màn hình đơn, dùng các món/ghi chú hiện có để hiển thị và ghi rõ Đang lưu đơn…. Chỉ khi máy chủ xác nhận mới bỏ trạng thái chờ và cho gửi bếp, thanh toán, thêm/sửa/hủy món hay đổi thông tin bàn. Request lưu bị giới hạn chờ 15 giây để có đường thử lại khi mạng treo. Lỗi mạng/phản hồi không khớp giữ nguyên request UUID và dữ liệu chờ; có thể reload rồi Thử lưu lại cùng yêu cầu.

API save_menu_selection_snapshot ủy quyền cho save_menu_selection hiện có, rồi trả snapshot scoped của đúng phiên bàn trong cùng một giao dịch. Không thay đổi quyền, giá, khóa bàn, quy tắc món/nước, gộp phiếu hoặc tính idempotent. Nếu bước đọc snapshot lỗi thì giao dịch ghi cũng rollback. API cũ vẫn tồn tại cho cửa sổ POS chưa cập nhật; client chỉ fallback sang API cũ khi function chưa cài, không fallback khi lỗi mạng không rõ kết quả.

Client kiểm tra request/table/order/session và cấu trúc snapshot trước khi dọn mã chờ. Không ghi đè một snapshot mới hơn hoặc lượt đọc đang chạy bằng phản hồi cũ: khi có race sẽ lấy lại delta của phiên, hoặc full snapshot khi cần. Các invalidation Realtime được giữ chờ trong lúc lưu, rồi xử lý tiếp; không bỏ sự kiện của thiết bị khác. Full safety read 60s không bị dời bởi snapshot một bàn. Việc bếp hoàn thành đang chạy dùng đường full read để bảo toàn cập nhật lạc quan hiện có.

## Đo và kiểm thử

Đo bằng Playwright với API giả lập: lưu 400ms, kiểm tra quyền 200ms, đọc snapshot cũ 300ms. Bản trước đo màn hình mở sau khoảng 1003ms; bản mới đo khoảng 50–52ms. Đây là đo trong môi trường kiểm thử, không phải cam kết thời gian mạng của điện thoại thật. Lưu trên máy chủ vẫn cần thời gian và không được hiển thị là thành công trước xác nhận.

- tests/save-selection-latency-flow.mjs: SAVE_CASE=success/lost/malformed/race; màn hình mở trước phản hồi, một RPC trên critical path, lưu đúng một đơn, reload/retry cùng UUID, không đè món từ máy khác.
- tests/save-selection-model.mjs: xác minh receipt/scope và bảo toàn bàn khác.
- tests/support/save-selection-snapshot.mjs trong tests/bill-table-transfer-sql.mjs: kiểm tra PostgreSQL thật cục bộ về snapshot/rollback/ACL/replay, cùng hồi quy lưu món, chuyển/gộp/tách, ghi chú, hủy và tiền.
- tests/saved-menu-selections-flow.mjs giữ fixture máy chủ cũ để kiểm tra fallback và toàn bộ luồng món/nước/gửi bếp.

Không tạo đơn thử trên production hoặc gửi phiếu thật tới bếp để đo. Không thêm Realtime channel, heartbeat hoặc polling mới; đường lưu thông thường giảm các API xác nhận riêng và lượng dữ liệu toàn quán tải xuống. Khi có xung đột hoặc máy chủ cũ, đường đọc phục hồi vẫn có thể cần thêm request.
