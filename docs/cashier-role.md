# Thu ngân — bản thử local

Chỉ nhánh `feature/cashier-role`. Chưa áp dụng SQL, Edge Functions hoặc code lên production. Không merge main trước khi chủ quán test và chốt.

## Quyền

Thu ngân: gọi món, ghi chú/mang về, huỷ món/bàn, chuyển/gộp bàn, tách/gộp bill, thu tiền; quản lý món (tạo, giá, ngừng bán/tạm hết, sắp xếp), nhóm món và bàn theo chức năng Admin hiện có. Không tạo/xoá/đổi quyền/đặt lại mật khẩu nhân viên; không sửa cài đặt hệ thống, dọn/reset dữ liệu, xem nhật ký tài chính hoặc hoàn thành phiếu bếp.

Theo yêu cầu giao diện mới: báo cáo dùng bố cục Dashboard Admin, bỏ toàn bộ KPI doanh thu và biểu đồ ngày/cơ cấu thanh toán. Giữ khung giờ, món bán chạy và bảng điểm bán với số hoá đơn/lượt/phần, tên món; bỏ mọi số tiền, thực thu và TB/lượt. Món bán chạy và thanh bar xếp theo số phần, không theo doanh thu. Các thẻ ngày/giờ nổi bật cũng dùng số phần. Vận hành hiện tại không có ô tiền món chưa thanh toán. Không hiển thị/cấp quyền lịch dọn dữ liệu.

Giữ bộ lọc ngày/giờ đến giây, Hôm nay/7 ngày/Tháng này, bàn và hình thức bán, tuỳ chỉnh 1–12 khung giờ; tối đa 366 ngày như Dashboard. API mới public.cashier_dashboard_window là invoker wrapper, triển khai đặc quyền ở schema private pos_cashier; trả aggregates thuần số lượng, không trả giá, tiền, mã hoá đơn hoặc dữ liệu giao dịch thô. Tổng hoá đơn đếm bill, lượt đếm phiên/bàn, phần bán ra gồm mọi dòng đã chốt bill (món chính/phụ/nước/tặng) và không gồm món huỷ. Hình thức bán lọc theo tên bàn snapshot trên bill, cùng cách Dashboard Admin hiện tại. Thanh toán và đầu/cuối khung giờ dùng giờ Việt Nam, bao gồm hết giây kết thúc chọn.

CSV và Excel chỉ xuất số lượng. Excel có một sheet Bán hàng theo giờ, tên món + từng khung giờ + tổng phần và số hoá đơn; không có Giá/Thành tiền. Các phần khác của Admin Dashboard/Excel không thay đổi. API cashier_operations_report cũ vẫn giữ để tương thích bản thử đầu tiên.

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
3. Cần hoàn thành bộ cài local nền đã cung cấp trước đó. Sau đó mở **http://127.0.0.1:54323 → SQL Editor**, chạy một lần file `supabase/migrations/20261115133832_cashier_operational_access.sql`. Không chạy lại bộ cài nền trên database đã có dữ liệu. Sau SQL quyền ban đầu, chạy thêm `supabase/migrations/20261115142345_cashier_dashboard_quantities.sql` để bật báo cáo theo bố cục mới. SQL lỗi thì dừng, gửi lỗi để xử lý.
4. Studio local → Authentication → Users → Create new user. Tạo email `cashier@pos.test`, mật khẩu thử riêng, Auto Confirm bật. Sau đó SQL Editor chạy `local/cashier-profile.sql`.
5. `npm.cmd run dev`. Đăng nhập bằng **email đầy đủ** `cashier@pos.test`, không dùng tên ngắn nếu chưa serve staff-login local.
6. Admin local ở cửa sổ thường; Thu ngân local ở cửa sổ ẩn danh. Kiểm tra:
   - Thu ngân mở bàn, chọn/lưu/gửi món, huỷ món, gộp/tách/chuyển bàn và thanh toán.
   - Đổi giá/thêm/ngừng bán món; thêm nhóm, đổi nhóm và thiết lập gửi bếp theo UI hiện có. Thiết bị khác đồng bộ lại menu. Giá đơn/hóa đơn cũ giữ nguyên.
   - Tạo ít nhất hai hoá đơn Thu ngân, một hoá đơn Admin. “Hoá đơn vừa thu” chỉ hiện hoá đơn Thu ngân gần nhất; Admin vẫn xem đủ lịch sử.
   - Báo cáo vận hành có tên món, số phần, hoá đơn/lượt; không có số tiền. So số hoá đơn, lượt và phần với Admin cùng bộ lọc; CSV/Excel chỉ có số lượng. “Số phần” gồm cả nước, món phụ và tặng giống Dashboard Admin, khác dòng “Mang về (tô)” trong API cũ.
   - Không có quản lý nhân viên, nhật ký hoạt động, cài đặt dọn dữ liệu; không hoàn thành phiếu bếp được.
   - Đăng xuất/đăng nhập, mất mạng và thử lại thanh toán cùng mã: không trùng bill.
7. Tạo/sửa/khóa/reset/xoá Thu ngân qua UI Admin cần Edge Function staff-admin bản nhánh này chạy ở LOCAL. Bộ local nền chưa serve Edge Functions, nên có thể dùng tài khoản Studio ở bước 4 để test POS trước. Không deploy function lên project thật để thử. Tạo/sửa/reset/xoá role đã có kiểm thử SQL/handler.

## Bảo vệ phía server

Không cấp reports.read, receipts.read_all, audit.read, employees.manage, settings.manage, kitchen.complete. API tổng hợp riêng trả allowlist số lượng; không tải doanh thu về browser rồi giấu bằng CSS. RLS restrictive giới hạn bills vào latest receipt, bill_items/bill_orders đi qua bills; orders/items/sessions hạn chế lịch sử đóng đã hoàn thành. Các phiên còn mở hoặc còn phiếu đang nấu vẫn cần đọc để vận hành.

Các role khác giữ quyền cũ; Admin thêm khả năng gọi API vận hành nếu cần nhưng Dashboard/Excel Admin không thay đổi. Owner lifecycle giữ kiểm tra Owner, phiên, version, request UUID và last-owner. Legacy role thu_ngan trở thành vai trò vận hành sau khi áp dụng migration; xem lại tài khoản cũ trước khi cân nhắc triển khai thật.

## Kiểm thử và ảnh hưởng

`npm run build`; `npm run test:cashier` với dev server tại localhost:5197 (hoặc POS_TEST_URL); regression payment, Realtime, employee create. SQL chạy PGlite cùng Auth/Realtime platform giả lập; browser/Edge mock HTTP, không tạo sales/push thật. Chưa kiểm chứng Docker Supabase end-to-end trên máy người dùng; chưa chạy Supabase production advisors vì không thay đổi project online.

Không tạo polling hoặc channel mới. Báo cáo gọi một RPC khi mở/lấy lại hoặc đổi bộ lọc bàn/hình thức; cùng một lần tải giữ khoá chống trùng. RLS có thêm phép kiểm tra scope/receipt khi đọc; chưa đo tải production. Không thay đổi bảng giá, dữ liệu bán hàng, retention hay push khi cài migration. Không hứa tiết kiệm usage từ tính năng phân quyền.
