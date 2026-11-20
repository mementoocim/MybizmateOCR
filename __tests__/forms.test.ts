import { FORMS, fieldLabel } from '../lib/forms';

test("each form's words", () => {
  expect(FORMS.sales_invoice).toEqual({ title: 'MyBizMate Sales Invoice', cash: 'Cash', account: 'On account', number: 'SI no.' });
  expect(FORMS.service_invoice).toEqual({ title: 'Service Invoice', cash: 'Cash sales', account: 'Charge sales', number: 'Invoice no.' });
});

test('field labels', () => {
  expect(fieldLabel('sales_invoice', 'invoice_no')).toBe('SI no.');
  expect(fieldLabel('service_invoice', 'invoice_no')).toBe('Invoice no.');
  expect(fieldLabel('sales_invoice', 'item10_unit_price')).toBe('Row 10 · Unit price');
  expect(fieldLabel('sales_invoice', 'item1_qty')).toBe('Row 1 · Qty');
  expect(fieldLabel('service_invoice', 'item3_description')).toBe('Row 3 · Description');
  expect(fieldLabel('service_invoice', 'total_due_2')).toBe('Total due (left column)');
  expect(fieldLabel('sales_invoice', 'customer_tin')).toBe('TIN');
  expect(fieldLabel('service_invoice', 'withholding')).toBe('Withholding tax');
});
