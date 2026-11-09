# Dashboard kinh doanh

Mở **Dashboard** trong menu quản lý. Chỉ tài khoản có quyền xem báo cáo mới thấy mục này.

## Xem số liệu

1. Chọn **Hôm nay**, **7 ngày**, **Tháng này** hoặc tự nhập ngày bắt đầu/kết thúc.
2. Bấm ô **Từ giờ / Đến giờ** để chọn giờ, phút và giây, kể cả trên iOS.
3. Bấm **Xem Dashboard**. Khi đổi ngày giờ, dữ liệu và nút xuất sẽ chờ bạn tải lại.
4. Chọn **Tất cả / Mang về / Ăn tại bàn**, rồi chọn một bàn nếu cần. Bộ lọc bàn áp dụng ngay cho toàn bộ số liệu và file xuất, không tải lại từng hóa đơn.

**Số hóa đơn** đếm các hóa đơn đã thanh toán. **Lượt bán** đếm phiên bàn có thanh toán trong khoảng chọn: cùng một phiên tại cùng một bàn chỉ tính một lượt dù tách thành nhiều bill. Nếu chuyển sang một phiên/bàn khác thì đó là lượt tại điểm bán nhận thanh toán. Đây không phải số khách hay số lần gửi bếp.

Bàn được nhận diện bằng mã bàn; tên ghi trên hóa đơn được ưu tiên khi phân loại Mang về. Doanh thu và thời gian tính theo lúc thanh toán, không phải lúc gửi bếp. Số phần là tổng số lượng món trên hóa đơn, gồm cả món thêm và đồ uống.

## Khung giờ và Excel

Mở **Tùy chỉnh khung giờ** để sửa các mốc hoặc thêm/xóa khung (tối đa 12). Nhập `HH:mm`, sắp theo thứ tự, không chồng nhau. Có thể dùng `24:00` cho mốc cuối. Khung được nhớ trên trình duyệt đang dùng.

Mặc định: 06–09, 09–11, 11–13, 13–15, 15–17, 17–22. Khung 06–09 tính đến 08:59:59; đúng 09:00:00 thuộc khung tiếp theo. Mọi khoản thu ngoài các khung vẫn được giữ trong **Ngoài khung**.

Bấm **Xuất Excel · tất cả khung** một lần để nhận file `.xlsx` gồm: theo ngày và khung, tổng theo khung, tổng theo ngày, món ăn, theo bàn/Mang về và thông tin bộ lọc. Tiền được lưu dưới dạng số để tính tiếp trong Excel. CSV cũng giữ thống kê ngày và bàn.

## Đọc biểu đồ

- Biểu đồ ngày so sánh kỳ trước có cùng độ dài. Đường kỳ trước hiển thị khi chọn trọn ngày; tổng kỳ trước vẫn được tính khi chọn giờ tùy ý.
- Món bán chạy xếp theo tiền món trước giảm giá hóa đơn. Doanh thu chưa trừ giá vốn/chi phí nên không phải lợi nhuận.
- Dữ liệu đã bị dọn theo lịch giữ 7 ngày không còn trong báo cáo. Kỳ trước bằng 0 có thể do lịch sử đã được dọn; không nên hiểu là quán không bán được.
- **Vận hành hiện tại** dùng lần đồng bộ gần nhất, không chịu bộ lọc báo cáo. Phiếu bếp tại đây chỉ gồm món gọi trên app, chưa gồm phiếu ảnh.

## Dữ liệu

Dashboard đọc các bảng hóa đơn hiện có qua quyền đăng nhập của bạn; không cần SQL mới. Dữ liệu được tải từng trang và kiểm tra tổng tiền món, tổng hóa đơn và tổng khung giờ. Khoảng quá 50.000 hóa đơn (gồm kỳ so sánh) yêu cầu thu hẹp; lỗi tải không hiển thị tổng một phần thành kết quả đầy đủ.

Kiểm thử: chạy app thử nghiệm, rồi `npm run test:dashboard` (hoặc đặt `POS_TEST_URL` theo cổng đang dùng). Các kiểm thử dùng API giả lập, không thanh toán dữ liệu thật.
