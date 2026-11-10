"""Run after revenue-workbook-detailed.mjs; requires openpyxl for an independent XLSX reader."""
import json
import warnings
from openpyxl import load_workbook
with warnings.catch_warnings(record=True) as notices:
    workbook = load_workbook('/workspace/artifacts/Bao-cao-Excel-minh-hoa.xlsx')
    assert not notices, [str(n.message) for n in notices]
expected = json.load(open('/tmp/detailed-revenue-expected.json'))
sheet = workbook['Bán hàng theo giờ']
rows = list(sheet.values)
total = next(row for row in rows if row[0] == 'TỔNG MÓN')
assert total[9] == expected['qty'] and total[11] == expected['gross']
assert sheet.freeze_panes == 'B6' and sheet.auto_filter.ref
assert sheet.page_setup.orientation == 'landscape' and sheet.page_setup.fitToWidth == 1
assert sorted(row[10] for row in rows if row[0] == 'Bún riêu truyền thống') == [58000, 60000]
assert next(row for row in rows if row[0] == 'Số lượng bill')[9] == expected['invoices']
assert next(row for row in rows if row[0] == 'Số phần mang về¹')[9] == 2
assert next(row for row in rows if row[0] == 'Số phần giá 0đ²')[9] == 1
assert next(row for row in rows if row[0] == 'Bún riêu góc phố')[7] == 1
assert next(row for row in rows if row[0] == 'Nước sâm')[8] == 1
assert sheet['A5'].fill.fgColor.rgb == 'FF135B88'
assert '#,##0' in sheet['L6'].number_format
assert all(sheet.cell(sheet.max_row - i, 1).coordinate in sheet.merged_cells for i in range(4))
assert len(list(workbook['Chi tiết hóa đơn'].values)[5:]) == 8
assert all(cell.data_type != 'f' for tab in workbook for row in tab for cell in row)
for name in ['Theo ngày và khung', 'Tổng theo khung', 'Tổng theo ngày']:
    last = list(workbook[name].values)[-1]
    assert list(last[-6:]) == [expected[k] for k in ['invoices','gross','discount','total','cash','transfer']]
filtered = load_workbook('/tmp/revenue-workbook-filtered.xlsx')['Bán hàng theo giờ']
assert filtered['A6'].value == 'Bún riêu truyền thống' and filtered['J6'].value == 1
empty = load_workbook('/tmp/revenue-workbook-empty.xlsx')['Bán hàng theo giờ']
assert empty['A6'].value == 'TỔNG MÓN' and empty['L6'].value == 0
text = load_workbook('/tmp/revenue-workbook-text.xlsx')['Bán hàng theo giờ']['A6']
assert text.data_type == 's' and '<món>' in text.value
print('PASS independent XLSX reader: source totals/quantities, price splits, slots/boundaries, metadata, filters/freeze/print/styles, safe text, filtered and empty reports.')
