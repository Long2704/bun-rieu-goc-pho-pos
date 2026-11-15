# Thu ngân — bản thử local

Chỉ nhánh `feature/cashier-role`. Chưa áp dụng SQL, Edge Functions hoặc code lên production. Không merge main trước khi chủ quán test và chốt.

## Quyền

Thu ngân: gọi món, ghi chú/mang về, huỷ món/bàn, chuyển/gộp bàn, tách/gộp bill, thu tiền; quản lý món (tạo, giá, ngừng bán/tạm hết, sắp xếp), nhóm món và bàn theo chức năng Admin hiện có. Không tạo/xoá/đổi quyền/đặt lại mật khẩu nhân viên; không sửa cài đặt hệ thống, dọn/reset dữ liệu, xem nhật ký tài chính hoặc hoàn thành phiếu bếp.

Báo cáo vận hành mới chỉ trả tổng tô món chính, tô mang về, Chả ốc (Tặng), số phần món huỷ và bảng khung giờ. Không có tiền, số bill, tên từng món, bảng bán từng món, CSV/Excel doanh thu hoặc lịch sử hoá đơn toàn ngày. Khung giờ cố định như báo cáo hiện tại, tính theo thời điểm thanh toán giờ Việt Nam; món huỷ theo thời điểm huỷ. Giới hạn 31 ngày mỗi truy vấn. Món chính là category bun tại lúc chốt hoá đơn; bún thêm/món phụ/nước không tính tô. Mang về lấy cờ từng dòng hoặc tên bàn snapshot bắt đầu “Mang về”. Phần tặng nhận diện tên snapshot “Chả ốc (Tặng)” / “Chả ốc tặng”.

Thu ngân vẫn thấy tiền ở bàn đang xử lý và chỉ được đọc/in lại hoá đơn gần nhất do chính mình thu. Không có cam kết ngăn suy đoán doanh thu từ việc trực tiếp bán hàng và biết giá thực đơn. “Xoá món” tiếp tục là ngừng bán/ẩn món, giữ lịch sử; không thêm cơ chế xoá cứng nhóm/món ngoài chức năng có sẵn.

## Cài thử trên máy Windows

1. Lưu thay đổi đang làm trước khi đổi nhánh. Trong thư mục code:
   ```powershell
   git fetch origin
   git switch feature/cashier-role
   git pull --ff-only origin feature/cashier-role
   npm.cmd ci
   ```
   Nếu chưa có nhánh local, `git switch` sẽ lấy nhánh cùng tên từ origin. Không ép reset/ghi đè nếu Git báo xung đột.
2. Giữ Docker và Supabase local chạy. `.env.local` phải là API `http://127.0.0.1:54321` cùng publishable/anon key LOCAL. Không dùng URL online, service_role trong VITE, git push main, supabase link/db push/deploy. Preview Vercel không thay thế môi trường local; không dùng nếu chưa xác nhận backend thử riêng.
3. Cần hoàn thành bộ cài local nền đã cung cấp trước đó. Sau đó mở **http://127.0.0.1:54323 → SQL Editor**, chạy một lần file `supabase/migrations/20261115133832_cashier_operational_access.sql`. Không chạy lại bộ cài nền trên database đã có dữ liệu. SQL lỗi thì dừng, gửi lỗi để xử lý.
4. Studio local → Authentication → Users → Create new user. Tạo email `cashier@pos.test`, mật khẩu thử riêng, Auto Confirm bật. Sau đó SQL Editor chạy `local/cashier-profile.sql`.
5. `npm.cmd run dev`. Đăng nhập bằng **email đầy đủ** `cashier@pos.test`, không dùng tên ngắn nếu chưa serve staff-login local.
6. Admin local ở cửa sổ thường; Thu ngân local ở cửa sổ ẩn danh. Kiểm tra:
   - Thu ngân mở bàn, chọn/lưu/gửi món, huỷ món, gộp/tách/chuyển bàn và thanh toán.
   - Đổi giá/thêm/ngừng bán món; thêm nhóm, đổi nhóm và thiết lập gửi bếp theo UI hiện có. Thiết bị khác đồng bộ lại menu. Giá đơn/hóa đơn cũ giữ nguyên.
   - Tạo ít nhất hai hoá đơn Thu ngân, một hoá đơn Admin. “Hoá đơn vừa thu” chỉ hiện hoá đơn Thu ngân gần nhất; Admin vẫn xem đủ lịch sử.
   - Báo cáo vận hành không có tiền, tên từng món hoặc xuất Excel doanh thu. So tổng tô/mang về với Admin cùng kỳ, thử nước và bún thêm để chắc chắn không cộng vào tô.
   - Không có quản lý nhân viên, nhật ký hoạt động, cài đặt dọn dữ liệu; không hoàn thành phiếu bếp được.
   - Đăng xuất/đăng nhập, mất mạng và thử lại thanh toán cùng mã: không trùng bill.
7. Tạo/sửa/khóa/reset/xoá Thu ngân qua UI Admin cần Edge Function staff-admin bản nhánh này chạy ở LOCAL. Bộ local nền chưa serve Edge Functions, nên có thể dùng tài khoản Studio ở bước 4 để test POS trước. Không deploy function lên project thật để thử. Tạo/sửa/reset/xoá role đã có kiểm thử SQL/handler.

## Bảo vệ phía server

Không cấp reports.read, receipts.read_all, audit.read, employees.manage, settings.manage, kitchen.complete. API tổng hợp riêng trả allowlist số lượng; không tải doanh thu về browser rồi giấu bằng CSS. RLS restrictive giới hạn bills vào latest receipt, bill_items/bill_orders đi qua bills; orders/items/sessions hạn chế lịch sử đóng đã hoàn thành. Các phiên còn mở hoặc còn phiếu đang nấu vẫn cần đọc để vận hành.

Các role khác giữ quyền cũ; Admin thêm khả năng gọi API vận hành nếu cần nhưng Dashboard/Excel Admin không thay đổi. Owner lifecycle giữ kiểm tra Owner, phiên, version, request UUID và last-owner. Legacy role thu_ngan trở thành vai trò vận hành sau khi áp dụng migration; xem lại tài khoản cũ trước khi cân nhắc triển khai thật.

## Kiểm thử và ảnh hưởng

`npm run build`; `npm run test:cashier` với dev server tại localhost:5197 (hoặc POS_TEST_URL); regression payment, Realtime, employee create. SQL chạy PGlite cùng Auth/Realtime platform giả lập; browser/Edge mock HTTP, không tạo sales/push thật. Chưa kiểm chứng Docker Supabase end-to-end trên máy người dùng; chưa chạy Supabase production advisors vì không thay đổi project online.

Không tạo polling hoặc channel mới. Báo cáo chỉ gọi khi mở/lấy lại; cùng một lần tải giữ khoá chống trùng. RLS có thêm phép kiểm tra scope/receipt khi đọc; chưa đo tải production. Không thay đổi bảng giá, dữ liệu bán hàng, retention hay push khi cài migration. Không hứa tiết kiệm usage từ tính năng phân quyền.
