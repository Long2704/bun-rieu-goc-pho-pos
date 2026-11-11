# Cập nhật theo bàn qua Realtime

Kế thừa kênh riêng và kiểm tra quyền của bản Realtime đầu tiên. Thông báo `pos:orders` phiên bản 2 chỉ thêm UUID của phiên bàn; không chứa tên, ghi chú, giá, tiền hoặc URL ảnh. Mỗi phiên bàn thay đổi phát tối đa một thông báo trong một giao dịch. Các bàn/phiên khác nhau có thể tạo nhiều thông báo; client gom tối đa 30 phiên thành một lần đọc. Server chặn quá 30 scope/giao dịch bằng một thông báo toàn bộ, sau đó không phát tiếp các scope; tránh bùng thông báo khi dọn dữ liệu cũ. Khi đã phát thông báo toàn bộ, các scope tiếp theo trong giao dịch được bỏ qua.

Client gọi `get_pos_sync_delta(uuid[])`, RPC chỉ đọc có kiểm tra quyền hiện hành, SECURITY INVOKER và giữ RLS. Response dùng cùng snapshot SQL: phiên bàn mở, món/bill trong các phiên được yêu cầu, liên kết bàn của chúng và phiếu bếp còn làm của các phiên đó. Phiên đã đóng/đã thanh toán có thể vẫn có phiếu đang làm. RPC không ghi dữ liệu, không sửa giá hoặc số tiền, không thay đổi mutation RPC cũ.

Client thay toàn bộ projection của các phiên trong scope, gồm mọi bàn alias trong nhóm, giữ nguyên dữ liệu bàn và phiếu khác; phiếu bếp sắp theo FIFO. Không nhận tiền/thao tác thành công chỉ từ Realtime. Callback sau lưu và thanh toán vẫn đọc snapshot đầy đủ như trước. Bản client cũ bỏ qua UUID và tải toàn bộ; thông báo cũ/generic cũng được client mới hỗ trợ.

Gộp/hủy gộp, chuyển quyền sở hữu bàn/phiên, thay đổi nhân viên/runtime hoặc không xác định được phiên nguồn phát thông báo toàn bộ. Nếu response thiếu scope, sai cấu trúc, trùng bàn/phiếu do đua dữ liệu, API chưa có hoặc lỗi mạng thì client trở về đọc toàn bộ. Một lỗi tải scope không được làm mất bàn khác hoặc tự xác nhận thanh toán.

Menu/nhóm/bàn cấu hình thay đổi chỉ tải catalog, không kéo lại toàn bộ đơn và bếp khi snapshot hiện tại tốt. Phiếu ảnh vẫn dùng kênh riêng và cơ chế dự phòng trước đó. Không thay giao diện/công thức Dashboard, Excel, PWA hay dữ liệu giao dịch.

Đăng nhập, kết nối lại, trở lại app và Đồng bộ vẫn tải đầy đủ. Kiểm tra quyền 5s; dữ liệu đầy đủ dự phòng 60s khi Realtime tốt, 5s khi lỗi kênh/lỗi snapshot. Cập nhật riêng từng bàn không gia hạn mốc 60s, tránh bỏ đói kiểm tra toàn bộ khi quán liên tục có thay đổi.

Kiểm chứng: build; coordinator kiểm tra union scope, generic supersede, UUID không hợp lệ và overflow; pure merge kiểm tra alias, bảng khác nguyên vẹn, phiếu đã thanh toán còn làm và ownership conflict; PGlite chạy RPC save/edit/send/pay/complete/link/unlink thật cùng RLS và trigger; browser giả lập HTTP/WebSocket xác nhận một RPC thay vì đọc toàn bộ đơn/bếp/menu, lỗi/malformed fallback và kiểm tra 60s dù scope liên tục cập nhật. Hồi quy lưu món, thanh toán và 6 tình huống gộp bàn. Không tạo dữ liệu thử trong production.

Triển khai migration trước client; giới hạn lock 3s và statement 20s. Rollback client về bản trước tương thích với payload mới; muốn rollback backend thì phục hồi `pos_sync.invalidate()` từ migration trước, không cần xóa dữ liệu bán hàng. Số message tính theo phiên bàn thay đổi và máy nhận; không suy ra GB log tiết kiệm từ số request thử nghiệm.
