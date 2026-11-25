# Xóa món và xóa bàn

Trong **Quản lý thực đơn** và **Quản lý bàn**, nút **Xóa** nằm cạnh **Sửa**. Bấm Xóa, đọc tên và pop-up, rồi xác nhận. Admin, Admin phụ và Cashier dùng cùng quyền quản lý menu/bàn hiện có. Đây là xóa khỏi danh mục, không phải hủy món trong đơn; Admin phụ vẫn bị chặn hủy món/hủy bàn phục vụ.

Món bị xóa rời menu gọi món, danh sách quản lý và menu tải để xuất Excel. Dòng đã gọi, phiếu chế biến và hóa đơn giữ nguyên tên, giá, nhóm và trạng thái. Không nhận gọi mới và không cho trình duyệt cũ bật bán lại mục đã xóa. Món cũ trong Excel dùng giá/nhóm hóa đơn khi không còn trong menu, có dấu †, vẫn được đếm món chính nếu snapshot có category bun.

Bàn bị xóa rời sơ đồ và danh sách quản lý. Chặn khi có phiên mở, liên kết nhóm đang hoạt động hoặc món bếp còn làm trên đường chuyển bàn. Tên điểm bán trên hóa đơn cũ không thay đổi. Có thể tạo bàn mới dùng tên cũ; ID cũ không được tái sử dụng. Sắp xếp menu và bàn chỉ xét mục chưa xóa.

Server ghi deleted_at và is_active=false, giữ dòng gốc để các khóa ngoại/lịch sử không mất. Schema migration không xóa mục nào. Danh sách quản lý loại tombstone; các luồng gọi món hiện có tiếp tục kiểm tra is_active. Request ledger có RLS và không cấp truy cập trực tiếp; RPC kiểm quyền tài khoản, kiểm phiên bản, khóa và ghi nhật ký menu_deleted/table_deleted đúng một lần.

Yêu cầu xóa được lưu theo tài khoản/loại danh mục trước khi gửi. Nếu mất phản hồi hoặc đồng bộ thất bại, thử lại cùng UUID; tải lại trang vẫn phục hồi dù mục đã rời danh sách. Lỗi nghiệp vụ không tự gửi lại yêu cầu với phiên bản mới: tải lại danh sách và xác nhận lại. Các thao tác khác bị khóa khi có yêu cầu chờ.

Validation: build; bill-table-transfer-sql (helper catalog-deletion); catalog-deletion-flow cho 3 role, mất ACK/reload, xung đột và bàn bận; deleted-menu-workbook đọc độc lập bằng openpyxl; revenue-workbook/reference tests và admin-aggregated-flow. Tests dùng DB cục bộ và API giả, không xóa dữ liệu thật.
