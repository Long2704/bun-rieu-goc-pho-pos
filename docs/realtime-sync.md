# Đồng bộ Realtime cho POS

Kênh Broadcast riêng do database phát sau khi giao dịch commit:
- `pos:orders`: phiên bàn, món nháp/đã gửi, nước/khác, trạng thái bếp, hóa đơn, bill, bàn gộp, quyền nhân viên và data epoch.
- `pos:catalog`: menu, nhóm món, gán nhóm và cấu hình/sắp xếp bàn.
- `pos:images`: phiếu ảnh bếp; chỉ tài khoản có `kitchen_images.read` đăng ký.

Payload chỉ `{version:1}` (nền tảng bổ sung ID), không gửi tên, tiền, ghi chú hay URL ảnh. RLS dùng quyền hiện hành, trạng thái hoạt động, cổng đổi mật khẩu và kiểm tra phiên nhân viên sẵn có qua `has_permission`. Client không được cấp policy gửi Broadcast. Trigger ở schema `pos_sync` không phơi qua Data API, khóa EXECUTE với PUBLIC/anon/authenticated, search_path rỗng.

Một thông báo mỗi topic mỗi transaction, dù thao tác sửa nhiều dòng/nhiều bảng. UPDATE không thay đổi không gửi. Cờ transaction-local gồm txid và phục hồi theo savepoint. Rollback không phát thông báo. Không mở Postgres Changes hoặc Presence. Trigger chỉ gọi transport, không thay dữ liệu nghiệp vụ; lỗi transport không chặn việc bán hàng.

Client gom sự kiện trong 180ms, giữ hàng đợi khi đang tải và tải lại nếu có sự kiện trong lúc tải. Kết nối lại luôn tải snapshot để bù khoảng mất mạng. Sau đăng xuất/đổi người/đổi quyền đọc ảnh/reset, hủy kênh và bỏ callback cũ. SDK cập nhật token Realtime theo Auth client hiện có.

Kiểm tra quyền vẫn 5s. Khi cả hai kênh orders/catalog đã SUBSCRIBED và snapshot đọc thành công, snapshot bàn/bếp dự phòng 60s; khi chưa kết nối/lỗi kênh/lỗi tải thì đọc 5s. Thao tác tài chính và callback lưu vẫn gọi refresh cưỡng bức mới, không dựa vào thông báo để xác nhận thu tiền. Trở lại tab, online, nút Đồng bộ tải lại đầy đủ; menu save vẫn tải cưỡng bức. Phiếu ảnh cùng mô hình 60s khi kênh ảnh tốt, 5s nếu không; vẫn tải mới khi mở khu vực/đổi trạng thái/lưu ảnh.

Không đổi Dashboard, công thức tiền, RPC nghiệp vụ, dữ liệu bán hàng hoặc cơ chế cập nhật PWA. Tab cũ vẫn polling như trước. Bản mới dùng Realtime sau khi mở lại theo cơ chế PWA có sẵn; không ép reload trong lúc bán hàng.

Kiểm thử: coordinator giả lập (batching, event khi đang tải, rejoin, cleanup); browser với HTTP và WebSocket Phoenix giả lập (cập nhật đơn/menu, kiểm tra quyền, fallback/safety/manual/reconnect); PGlite với RPC thật, trigger, coalescing, no-op, rollback và RLS cho owner/kitchen/waiter/anon/inactive/password. Các luồng linked tables, saved selections, note edits, cancellation và payment được hồi quy. Không tạo đơn thử trong production.

Rollback client: trả về build trước; trigger vẫn tương thích. Nếu cần tắt riêng backend, drop các trigger `pos_realtime_invalidate`, policy `pos_receive_invalidations` và function `pos_sync.invalidate()`; không cần xóa dữ liệu. Khi kênh không đăng ký được client tự dùng polling 5s.

Usage: số message dựa trên transaction phát thông báo và số client nhận của từng topic, không phải số audit hay số dòng món. Mức tiết kiệm log cần đo sau khi các thiết bị chuyển sang bản mới.
