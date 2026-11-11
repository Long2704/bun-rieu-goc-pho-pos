# Hướng dẫn test Realtime trên hai thiết bị

Chuẩn bị: hoàn tất thao tác đang làm; khi thấy Có bản cập nhật mới, đóng mọi tab/cửa sổ POS trên từng thiết bị rồi mở lại để nhận bản mới. Máy A đăng nhập Phục vụ; máy B đăng nhập Bếp (hoặc Chủ quán, mở Bếp). Dùng cùng quán, một bàn trống riêng và lúc ít khách; báo cho bếp biết đây là đơn kiểm tra. Không xóa dữ liệu trình duyệt. Các bước dưới không yêu cầu sửa menu/giá/cài đặt. Thao tác thanh toán ghi doanh thu thật, nên kiểm tra bước đó trên một đơn bán thật.

1. **Lưu món trước khi gửi bếp.** A chọn một món chính, ghi “TEST ít bún”, bấm Xem đơn. Mở cùng bàn trên máy khác có quyền phục vụ: món/ghi chú/tổng tiền phải giống nhau. Máy B chưa có phiếu món đó ở Đang làm.
2. **Gửi bếp.** A bấm Gửi bếp một lần. B không bấm Đồng bộ: phải xuất hiện đúng một phiếu, đúng bàn, số lượng và ghi chú trong vài giây khi mạng ổn định. Không có phiếu trùng.
3. **Thêm lượt món tiếp theo.** A bấm +, chọn món khác hoặc cùng món với ghi chú khác, Xem đơn rồi Gửi bếp. Phiếu/lượt đã gửi trước giữ nguyên, lượt mới đúng số lượng. Các món chưa gửi cùng bàn được gom theo thao tác gửi như trước.
4. **Sửa ghi chú đã gửi.** A mở menu của dòng món và sửa ghi chú. B thấy ghi chú mới và nhãn “Đã chỉnh sửa”, giá/số lượng không đổi.
5. **Nước/Khác không gửi bếp.** A thêm nước hoặc món thuộc nhóm đã tắt gửi bếp, ghi chú rồi Xem đơn. Mở cùng bàn trên máy khác: món, ghi chú và tổng tiền đã lưu. B không phát sinh phiếu bếp mới chỉ vì món đó.
6. **Hủy món chưa ra.** A hủy một món đã gửi. B vẫn giữ dòng bị gạch và trạng thái hủy ở vị trí cũ theo chức năng hiện tại. Số tiền trên bàn loại món hủy, không tạo phiếu trùng.
7. **Hoàn thành phiếu.** B bấm Xong hoặc vuốt một lần. Phiếu rời Đang làm, vào Lịch sử theo mới hoàn thành trước. A thấy trạng thái đã ra món. Không cần tải lại thủ công.
8. **Hủy món đã ra và đối chiếu bàn khác.** Nếu cần kiểm tra quyền hủy món đã ra, dùng một món thử chưa thanh toán đã hoàn thành ở bước 7: hủy từ Phục vụ, kiểm tra số tiền bàn cập nhật và không ảnh hưởng bill đã thanh toán. Giữ một bàn khác có đơn hợp lệ. Thực hiện bước 4/7 ở bàn thử: bàn khác giữ đúng món, ghi chú, tiền và trạng thái. Không mở hay chỉnh đơn thật chỉ để thử.
9. **Mất mạng rồi trở lại.** Tắt Wi-Fi/dữ liệu mạng riêng máy B; A lưu/gửi một thay đổi. B bật mạng và trở lại app: dữ liệu mới được tải bù, không thiếu hoặc nhân đôi phiếu. Nếu cần phục hồi, nút Đồng bộ vẫn hoạt động. Không bấm Gửi bếp/Thanh toán nhiều lần để thử.
10. **Gộp/tách/chuyển bàn.** Dùng hai bàn thử không ảnh hưởng khách: gộp vào bàn trống, kiểm tra cả hai mở chung đơn; hủy gộp bằng −, bàn tháo ra trống và đơn ở nhóm còn lại. Nếu thử bàn đã có đơn, kiểm tra riêng hai lựa chọn dùng chung bill/giữ bill riêng. Tách hoặc chuyển bill: tiền và món đúng nơi, không sao chép phiếu bếp hoặc mất ghi chú.
11. **Thanh toán một đơn bán thật.** A đối chiếu tiền, thanh toán đúng một lần. Các máy thấy bill đã thanh toán/bàn trống khi đã trả hết. Nếu bếp còn phiếu chưa xong, phiếu đó vẫn tồn tại đến khi bếp hoàn thành. Không thu tiền lại chỉ vì một máy cập nhật chậm.
12. **Đồng bộ thủ công và mở lại.** Đóng/mở lại app, vào lại bàn và bếp; dữ liệu phải khớp. Nút Đồng bộ vẫn tải lại đầy đủ. Không xóa cache/localStorage nếu còn yêu cầu chờ xác nhận.

Các đơn thử chưa thanh toán cần được hủy theo chức năng hiện có sau khi test, tránh lẫn với đơn khách.

Nếu không đúng: ghi bước test, tên bàn, giờ xảy ra, vai trò/máy và kết quả mong đợi/thực tế; chụp cả hai màn hình. Ví dụ: “Bước 4, Bàn 2, 10:15, A đã đổi thành Không hành, B còn Ít bún sau 10 giây; bấm Đồng bộ thì cập nhật/cũng chưa cập nhật”. Điều này giúp phân biệt lỗi Realtime, mất mạng và lỗi dữ liệu. Không gửi mật khẩu.

Mục “Đã kết nối” hiện phản ánh trạng thái đồng bộ chung, không tự chứng minh WebSocket đang hoạt động. Bài test người dùng kiểm tra kết quả vận hành. Kiểm thử kỹ thuật đã mô phỏng riêng mất WebSocket nhưng mạng HTTP còn, kiểm tra fallback 5s, kiểm tra toàn bộ 60s, scope/malformed response và chống bỏ sót sự kiện.
