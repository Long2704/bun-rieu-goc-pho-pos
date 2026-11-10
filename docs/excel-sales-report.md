# Excel bán hàng chi tiết

Chỉ thay đổi file XLSX và đối số truyền trong hàm Xuất Excel (được người dùng cho phép). Không đổi giao diện Dashboard, bộ lọc, khoảng thời gian, khung đang cấu hình, tính KPI, CSV hoặc truy vấn dữ liệu. Không thêm SQL hay thay đổi dữ liệu bán hàng.

File có tổng quan đối soát; ma trận món theo 7 khung chuẩn của ảnh (06–09, 09–11, 11–13, 13–15, 15–17, 17–19, 19–22) cộng Ngoài khung; món theo ngày; thu tiền theo ngày/khung đang chọn trên Dashboard; tổng món; bàn/mang về; chi tiết hóa đơn và dòng món; quy tắc đọc số liệu. Các khung chuẩn riêng của Excel được ghi rõ; không ghi đè cấu hình khung Dashboard.

Món cùng tên nhưng khác giá tách dòng. Tiền món = giá × số lượng, trước giảm giá cấp hóa đơn. Không tự phân bổ giảm giá xuống món. Khăn/nước nằm trong tổng, không cộng thêm lần thứ hai. Mang về dùng cùng quy tắc tên điểm bán như Dashboard, và số phần mang về gồm tất cả món — không tự suy ra số tô. Chỉ ghi nhận dòng giá 0đ, không tự suy đoán chương trình tặng chả ốc.

Chỉ tính hóa đơn thanh toán trong khoảng lọc, theo giờ Việt Nam, gồm cả phần mili giây của giây cuối. Nguồn phải đối soát đủ số hóa đơn, tiền món, giảm giá, thực thu và phương thức thu. Từ chối xuất chi tiết bị trùng/thiếu. Không thay đổi dữ liệu nguồn.

Tiêu đề xanh, nhãn món màu kem, dòng tổng nổi bật, xen kẽ màu hàng, số tiền dạng số Excel có phân tách hàng nghìn; có bộ lọc, cố định hàng/cột và in A4 ngang vừa chiều rộng/lặp tiêu đề. Văn bản luôn dùng inlineStr để tên món không trở thành công thức.

Kiểm chứng: build, revenue-workbook, revenue-workbook-detailed, dashboard-model và dashboard-flow. Đọc độc lập bằng openpyxl kiểm tra tổng, số lượng theo giờ, giá khác nhau, dữ liệu rỗng/bộ lọc, định dạng, cấu hình in và văn bản an toàn. File mẫu trong artifacts mang nhãn MINH HỌA, không phải doanh số thật.
