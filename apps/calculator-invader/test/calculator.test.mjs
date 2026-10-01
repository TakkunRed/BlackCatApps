import { Calculator } from '../js/calculator.js';

function run(label, fn, expected) {
  const c = new Calculator();
  const result = fn(c);
  const pass = result === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: got=${result} expected=${expected}`);
}

run('4-6=', c => { c.inputDigit('4'); c.inputOperator('-'); c.inputDigit('6'); c.equals(); return c.displayValue; }, '-2');

run('200 x 5% = 10', c => { c.inputDigit('2');c.inputDigit('0');c.inputDigit('0'); c.inputOperator('×'); c.inputDigit('5'); c.percent(); return c.displayValue; }, '10');

run('100 +5% amount=5', c => { c.inputDigit('1');c.inputDigit('0');c.inputDigit('0'); c.inputOperator('+'); c.inputDigit('5'); c.percent(); return c.displayValue; }, '5');
run('100 +5% total=105', c => { c.inputDigit('1');c.inputDigit('0');c.inputDigit('0'); c.inputOperator('+'); c.inputDigit('5'); c.percent(); c.percent(); return c.displayValue; }, '105');

run('500 -20% amount=100', c => { c.inputDigit('5');c.inputDigit('0');c.inputDigit('0'); c.inputOperator('-'); c.inputDigit('2');c.inputDigit('0'); c.percent(); return c.displayValue; }, '100');
run('500 -20% total=400', c => { c.inputDigit('5');c.inputDigit('0');c.inputDigit('0'); c.inputOperator('-'); c.inputDigit('2');c.inputDigit('0'); c.percent(); c.percent(); return c.displayValue; }, '400');

run('constant calc 12+23=35 then 45 K+23=68', c => {
  c.inputDigit('1');c.inputDigit('2'); c.inputOperator('+'); c.inputDigit('2');c.inputDigit('3'); c.equals();
  const first = c.displayValue;
  c.inputDigit('4');c.inputDigit('5'); c.equals();
  return `${first},${c.displayValue}`;
}, '35,68');

run('chained 2+3+4=9', c => {
  c.inputDigit('2'); c.inputOperator('+'); c.inputDigit('3'); c.inputOperator('+'); c.inputDigit('4'); c.equals();
  return c.displayValue;
}, '9');

run('AC resets', c => { c.inputDigit('9'); c.allClear(); return c.displayValue; }, '0');

run('decimal 1.5+2.25=3.75', c => {
  c.inputDigit('1'); c.inputDot(); c.inputDigit('5');
  c.inputOperator('+');
  c.inputDigit('2'); c.inputDot(); c.inputDigit('2'); c.inputDigit('5');
  c.equals();
  return c.displayValue;
}, '3.75');

run('divide by zero -> error', c => {
  c.inputDigit('5'); c.inputOperator('÷'); c.inputDigit('0'); c.equals();
  return c.error;
}, true);
