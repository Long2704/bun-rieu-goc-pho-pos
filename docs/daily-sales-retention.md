# Giữ 7 ngày gần nhất, dọn mỗi ngày

Mốc giữ là **ngày hôm nay và 6 ngày trước theo giờ Việt Nam**. Lịch chạy lúc **03:00 mỗi ngày**. Ví dụ ngày 17 thì giữ ngày 11–17; dữ liệu trước 00:00 ngày 11 chỉ được dọn nếu mọi điều kiện nghiệp vụ đều đạt.

- Không dọn phiên bàn còn mở, món chưa thanh toán hoặc món bếp chưa xử lý xong.
- Có thanh toán, hoàn thành món, hủy món hoặc hoạt động liên quan còn mới thì giữ cả phiên. Phiên liên kết với dữ liệu cần giữ cũng được bảo vệ.
- Giữ tài khoản, bàn, nhóm món, thực đơn, cài đặt, phiếu ảnh và thứ tự/số hóa đơn tiếp theo.
- Giữ mã yêu cầu kỹ thuật tối thiểu để thiết bị cũ không gửi lại đơn đã dọn.
- Khi tạm dừng, lịch vẫn tồn tại nhưng không xóa dữ liệu; bật lại bằng nút hiện có trên Dashboard.

Áp dụng sau SQL 038/039 bằng `releases/daily_seven_day_retention.sql` (hoặc migration cùng tên chức năng trong supabase/migrations). File chỉ cập nhật hàm và đổi lịch; không gọi dọn ngay và không đổi trạng thái bật/tạm dừng đã lưu. Tên kỹ thuật của job/hàm cũ được giữ để không tạo hai lịch song song.

Kiểm tra sau áp dụng: job duy nhất `pos-weekly-sales-retention` phải có biểu thức `0 20 * * *` (20:00 UTC = 03:00 Việt Nam), status trả `retention_days=7`, `retention_mode=calendar_days`, `schedule_kind=daily`. Giao diện cũ chưa áp dụng SQL vẫn hiển thị lịch thực tế Thứ Hai, không tự báo thành mỗi ngày.

Lưu ý: đây là 7 ngày theo lịch, không phải 168 giờ trượt. Dữ liệu trước ngày thứ nhất có thể được giữ lâu hơn nếu phiên chưa kết thúc hoặc liên kết nghiệp vụ còn mới. Dữ liệu đã dọn không còn trong báo cáo hoặc kỳ so sánh.

Kiểm thử: `node tests/staff-table-cancellation-sql.mjs` chạy fixture đầy đủ, gồm ranh giới đầu ngày Việt Nam, timezone khác, giữ dữ liệu chưa hoàn tất, khóa ngoại, chống gửi lại, quyền Owner, tạm dừng, chạy lại, số hóa đơn liên tục và không xóa khi cài đặt. `tests/dashboard-flow.mjs` kiểm tra hiển thị và nút bật/tạm dừng với API giả.
