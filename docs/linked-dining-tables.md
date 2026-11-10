# Gộp bàn dùng chung đơn

Mở bàn có đơn → dấu ba chấm **Thao tác bàn** → **Gộp bàn**. Danh sách có dấu **+** ở bên trái; bàn đã nằm cùng nhóm có dấu **−** trong mục **Gộp với**.

- Bàn trống: bấm **+** để gộp trực tiếp, không đổi các bill đang có.
- Bàn có đơn: pop-up có **Gộp vào đơn hiện tại** (đưa món chưa thanh toán vào **Bill 1**) và **Gộp bàn, tách đơn** (giữ bill riêng, cấp số mới tránh trùng với bill hiện có).
- Bấm **−**: bàn đó về trống; toàn bộ món và bill ở lại nhóm còn lại, không tự chuyển món ra bàn vừa tách. Nếu bỏ bàn đứng đầu, một bàn còn lại tiếp tục giữ phiên chung. Nhóm còn một bàn trở về hoạt động bình thường.
- Mở bất kỳ bàn trong nhóm đều xem và thao tác cùng một phiên: thêm món, ghi chú, hủy món, tách/gộp bill và thanh toán. Món không gửi bếp vẫn tự lưu khi quay về sơ đồ. Món cần gửi bếp vẫn phải xác nhận gửi như trước.
- Thẻ từng bàn hiện số tiền còn phải trả của cả nhóm và tên bàn đang gộp. Đây là cùng một khoản tiền, không phải nhiều khoản để thu lặp. Dashboard/hóa đơn vẫn dùng giao dịch gốc, không nhân đôi số liệu từ các thẻ bàn.
- Thanh toán một bill chỉ trừ bill đó ở mọi bàn trong nhóm; thanh toán hoặc hủy hết đơn giải phóng tất cả bàn. Hóa đơn đã trả được giữ nguyên.

## Dữ liệu và đồng bộ

`active_table_links` liên kết các bàn vật lý với một `table_sessions` đang mở. Dữ liệu món không được sao chép; số lượng, giá, ghi chú, ID dòng, thời điểm và thứ tự phiếu bếp được giữ nguyên. Hai nhóm cũng có thể gộp lại. Phiếu bếp hiện tên nhóm, còn lịch sử không bị nhân đôi theo số bàn.

Hai RPC `link_dining_tables`/`unlink_dining_table` kiểm tra quyền hiện có, phiên dự kiến và nhóm bàn; khóa bàn theo thứ tự tăng dần rồi phiên/đơn/dòng món. Cùng mã yêu cầu chỉ áp dụng một lần và không tái gộp khi nhóm đã thanh toán hoặc có khách mới. Bảng liên kết và bảng lưu mã thử lại có RLS, không cho client đọc/ghi trực tiếp. RPC đọc nhóm kiểm tra quyền đọc đơn. App đọc phiên và liên kết từ một snapshot SQL chung qua hàm SECURITY INVOKER để giữ RLS hiện có và tránh ghép dữ liệu cũ/mới khi nhóm vừa đổi.

Sau khi được máy chủ xác nhận, app giữ mã yêu cầu đến khi đồng bộ thành công. Mất phản hồi, lỗi đồng bộ hoặc mất mạng: thử lại cùng mã, kể cả sau khi tải lại trang. Các yêu cầu này cũng được dọn theo data epoch khi có reset dữ liệu được cấp phép. Bảng mã thử lại hết hạn cùng phiên khi lịch lưu dữ liệu hiện tại dọn phiên cũ.

Chuyển bill riêng vào/ra nhóm dùng phiên chính của nhóm. Thao tác **Chuyển toàn bộ bàn** hiện chỉ dùng cho bàn chưa gộp; với bàn đang gộp, dùng **−** để bỏ bàn vật lý rồi chuyển khi phù hợp. Máy chủ chặn cách chuyển cũ làm đứt liên kết nhóm. Không ngừng hoạt động bàn còn trong nhóm.

## Triển khai và kiểm chứng

Migration `supabase/migrations/20261110135803_linked_dining_tables.sql`, bản sao `releases/linked_dining_tables.sql`. Đây là thay đổi bổ sung; cài đặt không gộp bàn, sửa đơn hay thu tiền. `get_my_access` trả cờ `linked_tables` để bật giao diện, vì vậy phải áp dụng migration trước bản giao diện. Tải lại POS trên các thiết bị trước khi sử dụng nhóm bàn. Chỉ cân nhắc hoàn tác cấu trúc khi không còn nhóm đang sử dụng; không xóa bảng liên kết để cố hủy một nhóm có đơn.

`npm run build` kiểm tra TypeScript và bản dựng. `node tests/bill-table-transfer-sql.mjs` chạy PGlite với fixture nghiệp vụ, gồm tiền/bill đã trả, gộp bàn trống/có đơn/hai nhóm, thêm/hủy/sửa/ra món qua bàn phụ, bỏ bàn chính/phụ/cuối, thanh toán từng bill và giải phóng nhóm, thử lại sau khách mới, quyền và lỗi phiên cũ. `POS_TEST_URL=http://localhost:5196 node tests/linked-tables-flow.mjs` kiểm tra UI hai màn hình với toàn bộ API giả lập: +/−, pop-up hai lựa chọn, gộp bàn trống trực tiếp, thêm/hủy/thanh toán, mất phản hồi/thử lại/tải lại và lỗi đồng bộ. Không dùng đơn thật để kiểm thử. Kiểm thử PGlite chạy tuần tự; thứ tự khóa được rà soát trong SQL.
