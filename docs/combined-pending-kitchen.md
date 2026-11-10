# Một phiếu bếp cho mỗi lần thông báo

Khi Gửi bếp, các lượt đã lưu nhưng chưa thông báo của cùng phiên bàn trong lần gửi được gom vào một phiếu. Món thêm nhanh trong cùng lần gửi cũng vào phiếu này. Các phiếu đã gửi trước đó và món của bàn khác giữ nguyên. Bàn gộp dùng cùng phiên nên dùng cùng cơ chế.

RPC giữ lại các order cũ để mã lưu món vẫn thử lại an toàn. Chỉ chuyển dòng món bếp chưa thanh toán, chưa hủy vào phiếu chung; giữ nguyên ID dòng, số lượng, giá, ghi chú, bill và vị trí bếp. Món không gửi bếp, món đã trả tiền và món đã hủy không di chuyển. Không gộp tài chính giữa các bill. Phiếu vào hàng đợi tại thời điểm gửi. Gửi lại cùng danh sách không lấy thêm lượt tạo sau đó.

Phục vụ nhóm dòng theo ID dòng gốc khi bật separateSelections, nên cùng món vẫn có các dòng riêng sau khi gửi chung một phiếu. Giữ nguyên Hủy/Sửa ghi chú theo từng dòng.

Thay đổi hàm trong migration 20261110164247_combine_pending_kitchen_selections.sql chỉ áp dụng cho lần gửi sau triển khai; không gộp lại các phiếu bếp đang làm. UI tương thích với cả hàm cũ và mới.

Kiểm chứng: build, bill-saved-groups, bộ SQL bill-transfer (PGlite) và saved-menu-selections-flow (API giả lập). Bao gồm một phiếu, hai ghi chú cùng món, gửi lại, thêm nhanh, bàn khác, phiếu trước, dòng nước/hủy và bảo toàn ID/số tiền.
