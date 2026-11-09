# Thanh toán món không gửi bếp

- Nếu phần món vừa thêm chỉ có món thuộc nhóm **không gửi bếp**, bấm **Thanh toán**. App lưu toàn bộ phần thêm, đồng bộ lại bàn, rồi mở cửa sổ thanh toán. Chưa xác nhận thu tiền thì chưa ghi nhận thanh toán.
- Nếu phần thêm có bất kỳ món cần bếp làm, phải bấm **Gửi bếp**. Gửi thành công trở về sơ đồ bàn.
- Những món đã gửi bếp trước đó không bắt bạn gửi lại khi chỉ thêm khăn/nước/nhóm khác không gửi bếp.
- Ghi chú và số lượng được lưu cùng đơn. App không tự lưu mỗi lần bấm dấu cộng.
- Mất mạng hoặc chưa nhận được xác nhận: giữ nguyên yêu cầu, bấm **Thử gửi lại**. Không tạo đơn mới. Sau khi xác nhận và đồng bộ thành công, cửa sổ thanh toán mới mở.
- Nếu thiết bị khác đổi nhóm sang cần gửi bếp trong lúc thao tác, server từ chối đường thanh toán nhanh; món vẫn được giữ để kiểm tra và gửi bếp.

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
