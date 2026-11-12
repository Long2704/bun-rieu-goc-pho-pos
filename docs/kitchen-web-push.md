# Push cho phiếu bếp mới

Phạm vi: phiếu gọi món được gửi từ Phục vụ vào Bếp. Không phát push cho bản nháp, món không gửi bếp, phiếu chuyển bill, sửa ghi chú, hủy hoặc hoàn thành. Phiếu ảnh tải thủ công không thuộc luồng này. Realtime và chuông trong app tiếp tục hoạt động.

## Bật và kiểm tra trên điện thoại

1. Đóng các cửa sổ/tab POS đang mở rồi mở lại để service worker mới được kích hoạt. Không tự tải lại cửa sổ đang thao tác đơn.
2. iPhone/iPad: iOS 16.4+, mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính. Mở từ biểu tượng POS. Android: dùng Chrome hỗ trợ push, có thể cài POS ra màn hình chính.
3. Đăng nhập tài khoản Chủ quán hoặc Bếp → Bếp → Thông báo.
4. Bấm Bật trên thiết bị này → Cho phép. Chỉ bật trên thiết bị thật sự cần nhận phiếu.
5. Bấm Gửi thông báo thử. Khi đang xem Bếp và đồng bộ bình thường, máy chủ bỏ qua push phiếu mới riêng cho thiết bị đó. Nút Gửi thông báo thử chủ động vẫn hiển thị push để kiểm tra. Thông báo thử không tạo món, hóa đơn hay số liệu bán hàng.
6. Đưa POS ra nền rồi gửi thử lại sau ít nhất 1 phút. Kiểm tra thông báo trên điện thoại, bấm vào để mở Bếp. Âm thanh tuân theo cài đặt hệ điều hành, chế độ Tập trung/Không làm phiền.
7. Trong lần gọi món thực tế tiếp theo, kiểm tra push ghi tên bàn và số phần. Không cần tạo đơn giả khi quán đang vận hành.
8. Tắt trên thiết bị này nếu không muốn nhận nữa. Đăng xuất sẽ hủy đăng ký của thiết bị và xóa liên kết tài khoản cục bộ. Đăng nhập lại cần bật lại.

Nếu không thấy: kiểm tra Internet, quyền thông báo, chế độ Tập trung, mở từ màn hình chính trên iOS và bản cập nhật PWA. Trình duyệt/hệ điều hành có thể trì hoãn push; không dùng push làm nguồn theo dõi đơn duy nhất.

## Kiến trúc và bảo mật

- Trigger orders chỉ xếp hàng trong giao dịch thành công, không gửi HTTP đồng bộ. Không có thiết bị hợp lệ thì không tạo hàng đợi. Không phát lại các phiếu trước lúc đăng ký.
- pg_net gọi Edge Function kitchen-push sau commit. Cron mỗi phút chỉ gọi worker khi có công việc đến hạn. Mỗi lần nhận tối đa 8 lượt gửi, đồng thời tối đa 4. Lease ngăn hai worker xử lý đồng thời, retry tối đa 3 lần, hết hạn sự kiện sau 10 phút; TTL tại nhà cung cấp 5 phút. Notification tag theo order tránh nhiều thông báo cùng phiếu, nhưng push không có cam kết exactly-once.
- Cron riêng dọn metadata sự kiện quá 7 ngày và thiết bị tắt quá 30 ngày; không thay đổi lịch giữ 7 ngày dữ liệu bán hàng.
- Khóa VAPID riêng và token worker nằm trong Supabase Vault. Worker tự tạo khóa khi bootstrap, không đưa khóa riêng vào repo, browser hoặc log. verify_jwt=false vì worker xác thực bằng token bí mật riêng; RPC worker chỉ cấp service_role. Client chỉ đọc public key.
- Chỉ tài khoản Chu/Bếp đang hoạt động, có phiên Auth còn hiệu lực được nhận. Endpoint allowlist Apple/Google/Mozilla/Windows, HTTPS, không theo redirect. Mỗi tài khoản tối đa 10 thiết bị; thử tối đa một sự kiện/phút/thiết bị.
- Browser lưu proof cục bộ để chống chiếm endpoint. Service worker chỉ lưu account ID và device ID, không lưu JWT hoặc dữ liệu món. Push không khớp liên kết tài khoản sẽ bị bỏ qua. Push đã chuyển cho hệ điều hành không thể thu hồi sau đăng xuất.
- Nội dung màn hình khóa chỉ gồm tên bàn và số phần; không gồm ghi chú/tên khách. Khi push tới, số phần là thông tin tại thời điểm worker đọc phiếu; mở app để xem trạng thái mới nhất.
- Muốn ngưng toàn bộ: vô hiệu hóa devices và để worker_url trống trong pos_push.settings bằng quyền quản trị; không ảnh hưởng lưu/đồng bộ phiếu. Không xóa khóa VAPID nếu muốn dùng lại đăng ký cũ.

## Usage

Không thêm subscription Realtime hoặc vòng tải đơn mới. Thiết bị đã bật push và đang xem Bếp có một RPC nhỏ gia hạn trạng thái mỗi 60 giây; khi ra nền/rời Bếp thì ngừng. Ví dụ mở Bếp 10 giờ là khoảng 600 lượt gia hạn/thiết bị, cộng thay đổi trạng thái. Push dùng Edge Function Invocations, egress, log hệ thống và lượng metadata database nhỏ. Một phiếu gửi tới N thiết bị tương đương N lượt giao push, không phải N Realtime Messages. Worker xử lý theo lô, nên số invocation không bằng số thiết bị. Ví dụ 200 phiếu/ngày, 2 máy: khoảng 400 lượt giao push/ngày; thường khoảng 200 lượt worker/ngày khi phiếu rải đều và không lỗi, cộng retry/kiểm tra cấu hình/thử. Đây là ước lượng; nhà cung cấp không đảm bảo mọi push được giao.

## Kiểm thử

- npm run test:kitchen-push: PGlite kiểm tra ACL, phiên đăng nhập, queue/lease/retry/dedup; worker giả lập endpoint/status; service worker kiểm tra binding, silent foreground và click.
- npm run test:kitchen-push-ui: Playwright chặn toàn bộ API bằng mock; không ghi vào production hay gửi push thật.
- npm run build; node tests/pwa-flow.mjs: cập nhật chờ đóng các cửa sổ, cache tĩnh, offline/reconnect.
- AES128GCM và VAPID của web-push@3.6.7 đã kiểm tra bằng khóa giả lập, không gửi mạng. Máy chủ bootstrap khóa thực đã kiểm tra qua trạng thái ready, không đọc/hiện khóa riêng.
- Cần người dùng kiểm tra giao push thật trên điện thoại bằng nút thử; môi trường kiểm thử không xác nhận thay được cài đặt iOS/Android của thiết bị.

## Chặn push khi đang xem Bếp

Client gửi trạng thái theo từng cửa sổ/tab và thiết bị, gắn với phiên Auth. Lease 90 giây được gia hạn mỗi 60 giây chỉ khi Bếp đang hiện, Internet online và đồng bộ orders sẵn sàng, không có lỗi đồng bộ. Ẩn app/chuyển màn hình/pagehide sẽ cố xóa lease ngay. Nếu hệ điều hành đóng đột ngột hoặc mạng lỗi, lease tự hết hạn sau tối đa 90 giây; trong khoảng đó có thể tạm bỏ qua push. Một tab ẩn không xóa trạng thái của tab Bếp còn hiện. Chưa bật push thì không phát sinh RPC trạng thái.

Worker đánh dấu lượt gửi phiếu thường là skipped/kitchen_visible khi có lease hợp lệ. Các thiết bị khác không bị ảnh hưởng. Nút gửi thử vẫn gửi vì đây là thao tác yêu cầu kiểm tra rõ ràng. Push đã giao cho nhà cung cấp trước lúc mở Bếp có thể vẫn hiện; không thể thu hồi. Service worker vẫn hiển thị push đã nhận (im lặng nếu đang xem Bếp), thay vì bỏ âm thầm có thể khiến Safari thu hồi quyền.

Nguồn: [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [WebKit Meet Web Push](https://webkit.org/blog/12945/meet-web-push/).
