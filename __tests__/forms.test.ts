import { FORMS, fieldLabel, formFields } from '../lib/forms';

test("each form's boxes, in the template's order, without the ticks", () => {
  const sales = formFields('sales_invoice');
  expect(sales).toHaveLength(65);
  expect(sales[0]).toBe('invoice_no');
  expect(sales).not.toContain('terms_cash');
  const service = formFields('service_invoice');
  expect(service).toHaveLength(39);
  expect(service[0]).toBe('date');
  expect(service).not.toContain('amount_words2');
  expect(service).toContain('withholding');
});

test("each form's words", () => {
  expect(FORMS.sales_invoice).toEqual({ title: 'MyBizMate Sales Invoice', cash: 'Cash', account: 'On account', number: 'SI no.' });
  expect(FORMS.service_invoice).toEqual({ title: 'Service Invoice', cash: 'Cash sales', account: 'Charge sales', number: 'Invoice no.' });
});

test("the BIR 2307's title and boxes, in the template's order", () => {
  expect(FORMS.bir_2307.title).toBe('BIR Form 2307');
  const bir = formFields('bir_2307');
  expect(bir).toHaveLength(160);
  expect(bir.slice(0, 3)).toEqual(['period_from', 'period_to', 'payee_tin']);
  expect(bir).toContain('ewt10_atc');
  expect(bir[bir.length - 1]).toBe('bt_total_tax');
});

test("the BIR 2307's labels are its template's, the official form's words", () => {
  expect(fieldLabel('bir_2307', 'period_from')).toBe('Period from');
  expect(fieldLabel('bir_2307', 'payee_tin')).toBe("Payee's TIN");
  expect(fieldLabel('bir_2307', 'payor_zip')).toBe("Payor's ZIP code");
  expect(fieldLabel('bir_2307', 'ewt10_atc')).toBe('Row 10 · ATC');
  expect(fieldLabel('bir_2307', 'ewt_total_tax')).toBe('Total row · Tax withheld');
  expect(fieldLabel('bir_2307', 'bt3_payment')).toBe('Business tax row 3 · Money payment');
  const template: { name: string; label: string }[] = require('../modules/scanner/assets/scanner/bir_2307.json').fields;
  for (const box of formFields('bir_2307')) {
    expect([box, fieldLabel('bir_2307', box)]).toEqual([box, template.find((f) => f.name === box)!.label]);
  }
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
