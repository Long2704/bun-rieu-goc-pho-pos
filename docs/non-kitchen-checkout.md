# Thanh toán món không gửi bếp

Món thuộc nhóm không gửi bếp không có ô nhập ghi chú món, kể cả khi gọi thêm từ món đã lưu. Ngoài sơ đồ bàn, dòng **Có món chưa xác nhận** chỉ xuất hiện khi còn món cần gửi bếp chưa được gửi; số tiền vẫn tính cả phần món không gửi bếp. Ghi chú đã lưu trong đơn cũ vẫn được giữ.

- Nếu phần món vừa thêm chỉ có món thuộc nhóm **không gửi bếp**, bấm **Thanh toán**. App lưu toàn bộ phần thêm, đồng bộ lại bàn, rồi mở cửa sổ thanh toán. Chưa xác nhận thu tiền thì chưa ghi nhận thanh toán.
- Nếu phần thêm có bất kỳ món cần bếp làm, phải bấm **Gửi bếp**. Gửi thành công trở về sơ đồ bàn.
- Những món đã gửi bếp trước đó không bắt bạn gửi lại khi chỉ thêm khăn/nước/nhóm khác không gửi bếp.
- Ghi chú và số lượng được lưu cùng đơn. App không tự lưu mỗi lần bấm dấu cộng.
- Mất mạng hoặc chưa nhận được xác nhận: giữ nguyên yêu cầu, bấm **Thử gửi lại**. Không tạo đơn mới. Sau khi xác nhận và đồng bộ thành công, cửa sổ thanh toán mới mở.
- Nếu thiết bị khác đổi nhóm sang cần gửi bếp trong lúc thao tác, server từ chối đường thanh toán nhanh; món vẫn được giữ để kiểm tra và gửi bếp.

## Thoát đơn hàng

Khi bấm quay lại sơ đồ bàn và còn món cần gửi bếp chưa gửi, app hỏi **Thoát đơn hàng**:

- **Thông báo:** lưu phần gọi thêm bằng luồng Gửi bếp hiện có, rồi về sơ đồ bàn sau khi nhận xác nhận và đồng bộ thành công. Các món đã lưu không được gửi lại. Trong đơn hỗn hợp, món không gửi bếp vẫn được lưu và tính tiền như trước.
- **Không:** về sơ đồ bàn, giữ phần món đang chọn và ghi chú để gửi sau trong phiên mở app hiện tại. Không gọi API gửi đơn.

Chỉ có món không gửi bếp hoặc không có món mới thì thoát thẳng. Mất mạng thì nút Thông báo bị vô hiệu hóa; lỗi gửi/đồng bộ giữ mã yêu cầu và phần món mới để thử lại an toàn. Bài kiểm tra: `node tests/exit-order-flow.mjs` với dev server/API giả giống bài kiểm tra thanh toán bên dưới. Không cần SQL mới cho pop-up này.

## Bật tính năng một lần trên Supabase

Frontend không tự áp dụng SQL. Trước khi có SQL, app vẫn dùng thao tác gửi đơn như cũ.

1. Mở SQL Editor của đúng dự án đang chạy: `uiwzinyckukaqlbznnam`.
2. Mở file [non_kitchen_checkout.sql](../releases/non_kitchen_checkout.sql), chép toàn bộ vào một truy vấn mới rồi Run.
3. Chờ thông báo thành công, đóng và mở lại app/đồng bộ.
4. Thử thêm riêng một món không gửi bếp: nút cuối phải là **Thanh toán**. Thử thêm cùng một món chính: nút phải là **Gửi bếp**.

Yêu cầu: dự án đã có module nhóm món (`menu_groups_setup.sql`) và RPC `submit_order`. Script không thay đổi thiết lập nhận đơn của các nhóm, không xóa đơn và không thu tiền. Có thể chạy lại script nếu cần. Không chạy lại các script cài nhóm cũ sau script này vì chúng có thể ghi đè catalog và tắt khả năng nhận diện tính năng mới.

## Kiểm tra phát triển

`node tests/non-kitchen-checkout-sql.mjs` kiểm tra SQL bằng PGlite với dữ liệu giả.

`POS_TEST_URL=http://localhost:5194 node tests/non-kitchen-checkout-flow.mjs` kiểm tra giao diện bằng Chromium và API giả; cần dev server có cấu hình Supabase giả trùng URL fixture. Bao gồm đơn hỗn hợp, mất ACK, tải lại trang, lỗi đồng bộ, thay đổi nhóm và chưa cài SQL. Không thay thế kiểm tra trên iPhone thật.
