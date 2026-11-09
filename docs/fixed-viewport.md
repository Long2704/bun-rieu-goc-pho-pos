# Khóa zoom giao diện POS

Theo yêu cầu vận hành: viewport cố định 1x; html/body cho phép pan ngang/dọc nhưng không pinch/double-tap zoom. Chặn thêm gesturestart/gesturechange Safari, touchmove nhiều ngón, Ctrl+wheel và Ctrl/Cmd +/-; vẫn cho Ctrl/Cmd+0 khôi phục tỷ lệ. Ô nhập trên thiết bị cảm ứng tối thiểu 16px để tránh iOS tự zoom khi focus; tiền khách đưa giữ 21px.

Không khóa cuộn một ngón hoặc cử chỉ vuốt phiếu bếp. Không phải kiosk hệ điều hành: menu zoom của trình duyệt và tính năng phóng đại của OS nằm ngoài kiểm soát trang web.

Kiểm tra: build; tests/viewport-flow.mjs (pinch bằng Chromium CDP ở 390px, cuộn bằng chuỗi touch, input focus và các guard); quantity-touch-flow và payment-layout-flow dùng API giả. Chưa kiểm tra iPhone vật lý.
