# Thêm nhóm món và kéo thứ tự thực đơn

## Dùng trong app

Owner → Quản lý → Quản lý thực đơn → **Thêm nhóm món**. Nhập tên nhóm (1–80 ký tự) và chọn loại **Món chính**, **Món phụ** hoặc **Đồ uống**, sau đó **Lưu nhóm món**. Nhóm mới được lưu chung trong database, không chỉ trên thiết bị hiện tại. Không cho trùng tên, không phân biệt hoa/thường.

Khi thêm/sửa món, chọn nhóm vừa tạo trong **Nhóm món**. Trên màn hình gọi món, các nhóm xuất hiện thành tab lọc. Món cũ chưa gán nhóm riêng vẫn ở ba nhóm mặc định.

Không còn ô nhập số thứ tự trong form. Kéo nút ⠿ cạnh tên món bằng chuột/cảm ứng, hoặc dùng ↑/↓ trên nút kéo. Bấm **Lưu thứ tự món** hoặc **Hủy sắp xếp món**. Thứ tự được lưu cho toàn bộ thực đơn; từng tab nhóm giữ thứ tự tương đối đó. Món mới mặc định thêm cuối. Thứ tự bàn không đổi.

Giá, số lượng và ghi chú trên đơn/hóa đơn đã lưu không thay đổi. Loại bếp của nhóm giữ ba mã nghiệp vụ hiện có: `bun`, `an_them`, `do_uong`; món chính vẫn lên trước món phụ, đồ uống không vào bếp. Chưa có chức năng đổi tên/xóa nhóm.

Nếu mất phản hồi, dùng nút thử lại cùng mã; yêu cầu tạo nhóm, sửa món hoặc sắp xếp đều được lưu theo tài khoản và khôi phục sau reload. Không xóa dữ liệu trình duyệt khi còn tác vụ chờ. Nếu thực đơn được sửa ở thiết bị khác, sắp xếp bị từ chối để tải lại; retry cũ đã hoàn tất không ghi đè chỉnh sửa mới hơn.

## Bước cài đặt database

App thật vẫn dùng project `uiwzinyckukaqlbznnam`. Kết nối trợ lý chỉ truy cập được `pos-new` và đã bị từ chối khi đọc project app thật. Không áp dụng SQL lên dự án khác.

1. Mở SQL Editor đúng project app thật; chạy toàn bộ [menu_groups_setup.sql](../releases/menu_groups_setup.sql) **một lần**. File bổ sung cấu hình nhóm, mapping, ledger và RPC; không đổi hoặc xóa món/đơn/hóa đơn cũ. Dùng schema hiện có sau các bản menu/phân quyền, không phải bộ cài database mới.
2. SQL trả ba nhóm mặc định. Sau đó chạy kiểm tra chỉ đọc: `select id,name,category,sort from public.menu_groups order by sort,id;`.
3. Dùng bản frontend mới. Hoàn tất tác vụ chờ, đóng các tab/PWA cũ rồi mở lại; hoặc bấm **Tải lại nhóm** trong quản lý thực đơn sau khi backend sẵn sàng.
4. Thử thêm nhóm và gán một món theo nhu cầu thật. Các thiết bị nhận nhóm/thứ tự ở lần đồng bộ tiếp theo.

Frontend tương thích database cũ: thiếu RPC chỉ hiện thông báo cần cập nhật và khóa phần mới. Ba nhóm cũ, sửa món cũ, gọi món và thanh toán vẫn hoạt động. Không tự áp dụng SQL khi Vercel deploy; chưa chạy SQL production trong phiên triển khai này. Sau khi phát hiện chưa có RPC, không truy vấn lại mỗi 5 giây cho đến khi người dùng bấm tải lại hoặc mở lại app.

## Phân quyền và thiết kế

- RLS trên mọi bảng mới; authenticated chỉ SELECT theo quyền hiện hành. Chặn ghi trực tiếp.
- Tạo nhóm, gán nhóm và sắp xếp kiểm tra `auth.uid()` cùng `has_permission('menu.manage')` phía server. Các vai trò POS được đọc catalog; anonymous/tài khoản không có quyền bị chặn.
- Wrapper sửa món gọi lại RPC cũ trong cùng transaction, giữ khóa/version/giá/ledger gốc. Group ledger chống ghi đè mapping khi retry sau một lần sửa mới hơn.
- Sắp xếp khóa bảng menu, đối chiếu toàn bộ snapshot id/version/sort và tập ID, cập nhật sort/version nguyên tử. Không thay đổi phiên khách hoặc order_items.
- Không thay đổi constraint category hoặc ghi lại snapshot hóa đơn; không dùng secret key trong frontend.

## Kiểm chứng

- Build TypeScript/Vite/PWA.
- `node tests/menu-groups-sql.mjs`: migration menu thật trong PGlite với fixture Auth/quyền; RLS, Owner-only, staff đọc, tên trùng, validation, replay, stale version, snapshot cũ, nhóm đồ uống không vào bếp, thứ tự và replay sau chỉnh sửa mới.
- `POS_TEST_URL=http://localhost:5173 node tests/menu-groups-flow.mjs`: Chromium/API mock, 3 vai trò, tạo/gán nhóm, reload/retry tạo/sửa/sắp xếp, filter; bàn phím/chuột/cảm ứng CDP và 375–1440px.
- Hồi quy menu SQL, bếp món chính trước, kéo thứ tự bàn, thanh toán và gọi thêm. API giả; không tạo giao dịch hoặc cấu hình thử trên Supabase thật. Chưa kiểm iPhone vật lý.
