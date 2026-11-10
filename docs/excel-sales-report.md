# Excel bán hàng chi tiết

Chỉ thay đổi file XLSX và đối số truyền trong hàm Xuất Excel (được người dùng cho phép). Không đổi giao diện Dashboard, bộ lọc, khoảng thời gian, khung đang cấu hình, tính KPI, CSV hoặc truy vấn dữ liệu. Không thêm SQL hay thay đổi dữ liệu bán hàng.

File có tổng quan đối soát; ma trận món theo 7 khung chuẩn của ảnh (06–09, 09–11, 11–13, 13–15, 15–17, 17–19, 19–22) cộng Ngoài khung; món theo ngày; thu tiền theo ngày/khung đang chọn trên Dashboard; tổng món; bàn/mang về; chi tiết hóa đơn và dòng món; quy tắc đọc số liệu. Các khung chuẩn riêng của Excel được ghi rõ; không ghi đè cấu hình khung Dashboard.

Món cùng tên nhưng khác giá tách dòng. Tiền món = giá × số lượng, trước giảm giá cấp hóa đơn. Không tự phân bổ giảm giá xuống món. Khăn/nước nằm trong tổng, không cộng thêm lần thứ hai. Mang về dùng cùng quy tắc tên điểm bán như Dashboard, và số phần mang về gồm tất cả món — không tự suy ra số tô. Chỉ ghi nhận dòng giá 0đ, không tự suy đoán chương trình tặng chả ốc.

Chỉ tính hóa đơn thanh toán trong khoảng lọc, theo giờ Việt Nam, gồm cả phần mili giây của giây cuối. Nguồn phải đối soát đủ số hóa đơn, tiền món, giảm giá, thực thu và phương thức thu. Từ chối xuất chi tiết bị trùng/thiếu. Không thay đổi dữ liệu nguồn.

Tiêu đề xanh, nhãn món màu kem, dòng tổng nổi bật, xen kẽ màu hàng, số tiền dạng số Excel có phân tách hàng nghìn; có bộ lọc, cố định hàng/cột và in A4 ngang vừa chiều rộng/lặp tiêu đề. Văn bản luôn dùng inlineStr để tên món không trở thành công thức.

Kiểm chứng: build, revenue-workbook, revenue-workbook-detailed, dashboard-model và dashboard-flow. Đọc độc lập bằng openpyxl kiểm tra tổng, số lượng theo giờ, giá khác nhau, dữ liệu rỗng/bộ lọc, định dạng, cấu hình in và văn bản an toàn. File mẫu trong artifacts mang nhãn MINH HỌA, không phải doanh số thật.

## Bảng chính theo 7 quy tắc đã xác nhận

Bảng Bán hàng theo giờ mở đầu tiên. Dòng đầu là ngày xuất file theo giờ Việt Nam, tách biệt kỳ dữ liệu ở dòng dưới. Cột trái liệt kê đủ menu đang dùng (kể cả món chưa bán), theo thứ tự menu; dòng bán cũ không còn menu được đánh dấu † và dùng giá hóa đơn.

Cột Giá dùng menu tải riêng lúc bấm xuất; Thành tiền = Giá × Tổng cộng. Dòng xanh chỉ cộng số lượng nhóm Món chính (category bun); cột Thành tiền trên dòng này cộng đủ tiền mọi món như ảnh. Có đối chiếu chênh lệch giá menu và giá hóa đơn, còn số thực thu/KPI Dashboard giữ nguyên.

Số lượng bill lấy cùng hóa đơn Dashboard và phân 7 khung chuẩn. Chả ốc (Tặng) đếm đúng tên món này, không thay bằng mọi món 0đ. Mang về (tô) đếm riêng số lượng món chính trên bàn/điểm bán tên bắt đầu bằng Mang về, đúng lựa chọn người dùng. Ngoài khung chỉ thêm cột nếu có hóa đơn phát sinh ngoài 7 khung.

Chỉ bổ sung truy vấn menu trong luồng xuất Excel, không thay đổi tải/tổng hợp Dashboard hay database. Kiểm chứng thêm revenue-reference-layout.mjs và revenue-reference-read.py.


## Bản rút gọn theo yêu cầu mới

File xuất chỉ chứa một sheet Bán hàng theo giờ; xóa các sheet phụ khỏi gói XLSX. Dòng đầu hiển thị đầy đủ khoảng ngày giờ đã chọn (giờ Việt Nam, có giây), không dùng ngày bấm tải. Giữ nguyên mọi quy tắc đếm, menu giá và đối soát ngay trên sheet này. Chức năng xuất cần nguồn hóa đơn chi tiết; không xuất một bảng tổng hợp khác khi thiếu nguồn. Dashboard và truy vấn menu không thay đổi.
