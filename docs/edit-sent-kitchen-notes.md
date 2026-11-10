# Sửa ghi chú món đã gửi bếp

Trong đơn hàng, bấm **Sửa ghi chú** dưới món đang làm, nhập ghi chú rồi bấm **Lưu ghi chú**. Nếu món được gọi nhiều lượt, mở **Chi tiết lượt gọi** (dấu ba chấm) và sửa đúng lượt cần thay đổi.

Phiếu bếp đang làm tự đồng bộ theo chu kỳ tối đa khoảng 5 giây khi có mạng. Dòng **Đã chỉnh sửa** nhỏ ở góc phải bên dưới ghi chú giúp bếp nhận biết thay đổi; vẫn hiện nếu ghi chú được xóa. Thứ tự phiếu và món, số lượng, giá và bill được giữ nguyên.

Chỉ sửa món cần gửi bếp, còn đang làm, chưa hủy và chưa thanh toán. Món đã ra hoặc đã thanh toán giữ nguyên ghi chú; ảnh/hóa đơn đã lưu không bị sửa. Phục vụ dùng quyền gọi món hiện có.

Nếu một người khác vừa sửa hoặc bếp vừa hoàn thành, app yêu cầu đóng và mở lại dữ liệu mới nhất. Khi chưa xác nhận kết quả do mạng hoặc đồng bộ lỗi, bấm **Thử lại cùng yêu cầu**; mã yêu cầu giữ nguyên để không sửa/lưu nhật ký hai lần. Sửa ghi chú có nhật ký ghi nhận nhân viên cùng nội dung trước/sau.

## Cài đặt và kiểm chứng

Migration: `supabase/migrations/20261110001204_edit_sent_kitchen_notes.sql`; bản sao để triển khai: `releases/edit_sent_kitchen_notes.sql`. Áp dụng migration trước khi triển khai giao diện. Đây là thay đổi bổ sung, không sửa ghi chú cũ hay dữ liệu tiền. Bảng lưu mã thử lại được bảo vệ bằng RLS và không cấp quyền đọc/ghi trực tiếp; bản ghi được dọn cùng dòng món theo lịch lưu dữ liệu hiện tại.

Chạy `npm run build`; khi có máy chủ dev, chạy `POS_TEST_URL=http://localhost:5173 npm run test:sent-notes`. Kiểm thử SQL dùng PGlite và kiểm thử giao diện giả lập toàn bộ API, không gửi đơn hoặc sửa dữ liệu thật. Bao gồm sửa đúng dòng trùng món, xóa ghi chú, đồng bộ hai màn hình, mất phản hồi, xung đột phiên bản, quyền và trạng thái món, bảo toàn tiền/thứ tự, chuyển bill và dọn lịch sử.
