# Nhận biết bill sau tách/gộp

Màn đơn chia các món chưa thanh toán thành từng khu **Bill 1, Bill 2, ...**, kèm số món, tổng tiền và nút **Thanh toán Bill ...**. Một món xuất hiện ở hai bill được hiển thị riêng, không gộp số lượng hoặc ghi chú giữa hai bill. Bill 1 cũng có khu riêng khi tài khoản được chuyển bill sang bàn khác. Món đã thanh toán có nhãn số bill để đối chiếu; món hủy không tính vào bill.

## Tách hoặc gộp

1. Mở bàn → **Thao tác bàn → Tách/gộp bill**.
2. Chọn **Bill nguồn**; lựa chọn có số món và tổng tiền.
3. Chọn những dòng món muốn chuyển (chuyển toàn bộ số lượng trong mỗi dòng).
4. Chọn **Bill mới** để tách, hoặc một bill hiện có để gộp các món đã chọn.
5. Kiểm tra số tiền dự kiến còn lại của nguồn và số tiền bill đích, rồi xác nhận.
6. Đóng thao tác bàn để xem từng bill trong màn đơn. Bill nguồn không còn món chưa thanh toán sẽ không còn khu món đang tính tiền.

Không gửi lại món cho bếp khi tách/gộp. Không thanh toán tự động. Khi chọn thanh toán một bill, cửa sổ chỉ chứa món và tiền của bill đó; các bill còn lại giữ nguyên.

## Gọi thêm

Giữ quy tắc server hiện có: món mới vào bill chưa trả có số nhỏ nhất. Món gọi thêm chỉ hiển thị và tính một lần ở bill đó. Ở bill khác, nút **+ Bill N** ghi rõ bill sẽ nhận phần gọi thêm. Món chưa gửi phải được lưu trước khi thanh toán.

Nếu server đã nhận thao tác nhưng thiết bị chưa đồng bộ, giữ mã chờ để bấm **Thử lại cùng mã tách/gộp**. Không tạo thao tác mới khi kết quả còn chờ xác nhận. Riêng phần hiển thị và tách/gộp trong cùng bàn không cần SQL mới; chuyển bill sang bàn khác cần SQL bên dưới.

## Kiểm tra phát triển

- `node tests/bill-saved-groups.mjs`: món trùng loại ở các bill, tổng/số lượng, paid/cancelled, thiếu menu ID và không đổi dữ liệu gốc.
- `POS_TEST_URL=http://localhost:5194 node tests/bill-layout-flow.mjs`: API giả/Chromium; tách ba bill, gộp, dự kiến tiền, thanh toán riêng, cùng món ở hai bill, gọi thêm không đếm trùng, mất ACK/lỗi đồng bộ dùng lại UUID, giao diện điện thoại/máy tính.
- `node tests/bills-sql.mjs`: kiểm tra SQL hiện có bằng PGlite, không truy cập database thật.

Đã xem ảnh chụp giao diện thử; chưa kiểm tra trên iPhone thật.

## Chuyển riêng bill sang bàn khác

Bấm **Chuyển Bill N sang bàn khác** tại đầu khu bill, chọn bàn đích, đối chiếu danh sách và xác nhận. Bàn đích có khách nhận một bill riêng, không trộn với bill đang có; số bill tại bàn mới có thể khác số cũ. Các bill còn lại giữ ở bàn nguồn. Nếu hết món chưa trả ở nguồn, phiên bàn nguồn đóng. Hóa đơn và món đã trả giữ nguyên.

Món đang làm giữ trạng thái, thời điểm gọi và số lượng. Nếu một phiếu có món thuộc nhiều bill, phần được chuyển được tách sang phiếu vị trí mới cho bếp; không sao chép món, không phát chuông lại với món bếp đã nhận. Bill/phiếu đã xong không quay lại trạng thái đang làm.

Cần chạy thêm toàn bộ `releases/bill_table_transfer.sql` một lần trong SQL Editor dự án `uiwzinyckukaqlbznnam`. Chỉ tải frontend lên Vercel không tự áp dụng SQL. Kết nối hiện tại không có quyền chạy trên dự án thật. Script thêm cột nguồn phiếu chuyển, RPC và bảng mã chống chuyển trùng riêng (RLS, không cấp đọc/ghi cho client). Bảng chỉ lưu mã định danh/thông tin định tuyến để chống thử lại trùng, không lưu tên món hay tiền. Không thay đổi quyền tài khoản; cần cả quyền chuyển bàn và tách bill.
