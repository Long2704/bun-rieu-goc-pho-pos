# Ghi chú món nước

Mở ghi chú trên màn hình chọn món, dòng món chưa gửi và món nước đã lưu. Mỗi dòng giữ ghi chú riêng, giới hạn 500 ký tự. Có thể sửa trước khi thanh toán; món đã thanh toán hoặc đã hủy vẫn được bảo vệ. Ghi chú nước không bật gửi bếp, không đổi số lượng/giá hoặc tổng tiền.

Migration 20261111040957_drink_item_notes.sql bỏ việc xóa ghi chú của nhóm do_uong khi lưu/sửa, và cho RPC sửa ghi chú của món nước chưa trả tiền dù order đã done. Các kiểm tra quyền, phiên bàn, mã yêu cầu, phiên bản ghi chú và món bếp đã ra giữ nguyên. Không sửa ghi chú hoặc dữ liệu bán hàng hiện có.

Kiểm chứng: build, product-card-editor-flow, saved-menu-selections-flow (API giả lập), bill-table-transfer-sql với helper drink-item-notes (PGlite). Bản vá SQL phải triển khai trước UI.
