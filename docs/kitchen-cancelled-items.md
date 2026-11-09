# Hủy món và thông báo cho bếp

Khi hủy món đã lưu, món biến mất khỏi danh sách món trên bàn và không được tính tiền. Dữ liệu hủy vẫn còn để đối chiếu nhật ký.

Nếu bếp chưa hoàn thành phiếu, món hủy vẫn nằm ở vị trí cũ trong phiếu, có gạch ngang tên/ghi chú và nhãn **Đã hủy**. Thứ tự phiếu theo giờ gọi vẫn giữ nguyên; món chính vẫn đứng trước món phụ. Dòng món có thứ tự cố định trong từng nhóm, không bị đẩy xuống cuối sau khi cập nhật.

Hủy hết món hoặc hủy cả bàn vẫn giữ phiếu ở bếp, kể cả khi bàn đã đóng hoặc có khách mới. Bếp bấm **Xong** (hoặc vuốt hoàn thành) để xác nhận đã thấy thông báo hủy. Món đã ra trước khi hủy không được mở lại thành phiếu đang làm. Món thuộc nhóm không gửi bếp vẫn không xuất hiện ở bếp.

## Áp dụng SQL một lần

Frontend không tự chạy SQL. Mở SQL Editor của đúng dự án `uiwzinyckukaqlbznnam`, dán toàn bộ [kitchen_cancelled_items.sql](../releases/kitchen_cancelled_items.sql) rồi Run. Đóng và mở lại app sau Success.

Script thêm thứ tự dòng món và trigger giữ phiếu hủy đang làm. Nó giữ nguyên RPC hủy/hoàn thành, quyền tài khoản, khóa chống xung đột, nhật ký, hóa đơn và quy tắc không hủy món đã trả. Không xóa dữ liệu, không mở lại các phiếu đã bị kết thúc bởi cách xử lý cũ. Có thể chạy lại script.

Kết nối hiện tại của công cụ không có quyền truy cập dự án thật, nên chưa áp dụng SQL trực tiếp.

## Kiểm tra

- `node tests/kitchen-cancelled-items-sql.mjs`: PGlite với migration thật tới 033; hủy một phần/hết món/hủy bàn, thử lại, bàn đóng vẫn giữ phiếu, bếp xác nhận, không mở lại phiếu đã xong, không hủy món đã trả, giữ tổng tiền/nhật ký/quyền.
- `node tests/kitchen-main-first.mjs`: món chính trước, thứ tự dòng cố định kể cả kết quả đọc bị đảo, FIFO phiếu và dữ liệu gốc giữ nguyên.
- `POS_TEST_URL=http://localhost:5194 node tests/kitchen-cancelled-items-flow.mjs`: Chromium/API giả; món mất khỏi bàn, phiếu gạch ngang/nhãn/ghi chú, mất phản hồi và thử lại, tải lại trang, hủy hết/đóng bàn, chỉ Xong mới xóa phiếu khỏi đang làm, màn hình điện thoại/máy tính.

Chưa kiểm tra trên iPhone thật hoặc dữ liệu quán đang vận hành.
