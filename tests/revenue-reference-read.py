from openpyxl import load_workbook
w=load_workbook('/workspace/artifacts/Bao-cao-Excel-theo-mau.xlsx')
s=w.worksheets[0]
assert s.title=='Bán hàng theo giờ' and s.max_column==11
assert s['A1'].value=='NGÀY XUẤT FILE: 11/11/2026'
rows=list(s.values)
find=lambda label:next(r for r in rows if r[0]==label)
assert find('TỔNG MÓN CHÍNH')[8]==7
assert find('Mang về (tô)')[8]==3
assert find('Số lượng bill')[8]==4
assert find('Chả ốc (Tặng)')[8]==3
assert find('Bún riêu truyền thống')[8:]==(3,58000,174000)
assert find('Chênh lệch giá menu / hóa đơn')[10]==-2000
assert find('TỔNG MÓN CHÍNH')[10]==sum(r[10] for r in rows[5:13])
assert s['I5'].value=='Tổng cộng' and s['J5'].value=='Giá' and s['K5'].value=='Thành tiền'
assert s['A1'].fill.fgColor.rgb=='FF135B88'
o=load_workbook('/tmp/revenue-reference-outside.xlsx').worksheets[0]
assert o.max_column==12 and o['I5'].value=='Ngoài khung'
e=load_workbook('/tmp/revenue-reference-empty.xlsx').worksheets[0]
assert e['A6'].value=='Bún riêu truyền thống' and e['J6'].value==58000 and e['I6'].value==0
print('PASS independent reference XLSX: VN export date, all menu rows, 7 slots, main-only blue totals, exact gift, takeaway bowls, bill counts, menu price math and historical reconciliation, outside/empty.')
