# Giảm lượt đồng bộ dữ liệu ít thay đổi

Giữ kiểm tra quyền, snapshot phiên bàn/bàn gộp và phiếu bếp mỗi 5 giây. Menu và danh sách cấu hình bàn chỉ tải khi bản cache trong phiên đăng nhập đã đủ 60 giây. Nhóm món cũng có mốc tải thành công riêng 60 giây, kiểm tra theo nhịp live; không tải chồng một yêu cầu nền cùng người dùng. Chu kỳ dựa trên lần tải thành công nên có thể chạy ở nhịp 5 giây kế tiếp sau mốc 60 giây, cộng thời gian mạng.

Nút Đồng bộ và sự kiện online tải đủ ba nguồn ngay; lưu menu, nhóm, sắp xếp/bàn tải mới ngay. Lỗi menu/giá/hết món khi gửi cũng buộc tải catalog và nhóm để người dùng kiểm tra lại. Các callback xác nhận đơn/thu tiền vẫn luôn lấy snapshot sống mới, không được dùng cache snapshot. Cache không ghi localStorage, không chứa đơn/tiền và được xóa khi đổi tài khoản/tải lại hoặc reset epoch. Không thay nhịp chạy nền, Realtime, phiếu ảnh hay PWA cập nhật.

Lỗi tải không được đánh dấu đã mới; nhịp tiếp theo thử lại. Nhóm món có sequence và hàng đợi theo tài khoản để phản hồi cũ không ghi đè tài khoản/yêu cầu mới. Manual refresh và các thao tác lưu không bị chặn bởi thời hạn cache. Server vẫn kiểm tra quyền/giá/menu tại lúc thao tác.

Sửa đổi chỉ ở client, không có migration/SQL hay reset dữ liệu. Tab cũ tiếp tục bản cũ cho đến khi mở lại theo cơ chế PWA hiện tại; không ép tải lại giữa thao tác bán hàng.

Kiểm chứng: build, tests/sync-policy.mjs, tests/static-sync-flow.mjs; hồi quy linked-tables-flow (6 tình huống), saved-menu-selections-flow, menu-edit-popup-flow. API trình duyệt giả lập; không tạo đơn thật. Đo 11 nhịp trước lần refresh catalog: 66 request cũ tương ứng 33 request mới. Đây là số request trong tình huống thử, không phải cam kết giảm tương đương GB log. Chu kỳ catalog 60 giây, thao tác thật và phiếu ảnh làm tỷ lệ tổng thay đổi.
