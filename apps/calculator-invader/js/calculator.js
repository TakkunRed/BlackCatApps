// 四則演算電卓のロジック(定数計算 K / パーセントキー対応の簡易実装)
// SL-880の説明書記載の挙動を参考にしつつ、簡略化したモデル。

const MAX_DIGITS = 10;

class Calculator {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = '0';
    this.accumulator = null;
    this.pendingOp = null;
    this.lastOperand = null; // 定数計算(K)用
    this.lastOp = null;
    this.freshEntry = true; // true の間は次の数字入力で current を新規に開始する
    this.error = false;
    this.percentStage = 0; // +/- の % キーで amount→total の2段階表示用
    this.percentAmount = 0;
  }

  get displayValue() {
    if (this.error) return 'E';
    return this.current;
  }

  inputDigit(d) {
    if (this.error) return;
    if (this.freshEntry) {
      this.current = '0';
      this.freshEntry = false;
    }
    if (this.current === '0') {
      this.current = d;
    } else if (this.current.replace('-', '').replace('.', '').length < MAX_DIGITS) {
      this.current += d;
    }
  }

  inputDot() {
    if (this.error) return;
    if (this.freshEntry) {
      this.current = '0';
      this.freshEntry = false;
    }
    if (!this.current.includes('.')) {
      this.current += '.';
    }
  }

  toggleSign() {
    if (this.error) return;
    if (this.current.startsWith('-')) {
      this.current = this.current.slice(1);
    } else if (this.current !== '0') {
      this.current = '-' + this.current;
    }
  }

  _compute(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  _applyPending() {
    const cur = parseFloat(this.current);
    if (this.pendingOp && this.accumulator !== null) {
      const result = this._compute(this.accumulator, this.pendingOp, cur);
      this.lastOp = this.pendingOp;
      this.lastOperand = cur;
      this.accumulator = result;
    } else {
      this.accumulator = cur;
    }
  }

  inputOperator(op) {
    if (this.error) return;
    this.percentStage = 0;
    this._applyPending();
    this._finishToCurrent();
    this.pendingOp = op;
    this.freshEntry = true;
  }

  _finishToCurrent() {
    if (!isFinite(this.accumulator) || Math.abs(this.accumulator) >= 1e10) {
      this.error = true;
      this.current = isFinite(this.accumulator) ? String((this.accumulator / 1e10).toFixed(2)) : '0';
      return;
    }
    this.current = this._format(this.accumulator);
  }

  _format(num) {
    if (Number.isInteger(num)) return String(num);
    return String(parseFloat(num.toFixed(8)));
  }

  equals() {
    if (this.error) return;
    this.percentStage = 0;
    const cur = parseFloat(this.current);
    if (this.pendingOp && this.accumulator !== null) {
      this.accumulator = this._compute(this.accumulator, this.pendingOp, cur);
      this.lastOp = this.pendingOp;
      this.lastOperand = cur;
    } else if (this.lastOp && this.lastOperand !== null) {
      // 定数計算(K): 直前の演算子・被演算数を繰り返す
      this.accumulator = this._compute(cur, this.lastOp, this.lastOperand);
    } else {
      this.accumulator = cur;
    }
    this._finishToCurrent();
    this.pendingOp = null;
    this.freshEntry = true;
  }

  percent() {
    if (this.error) return;
    const cur = parseFloat(this.current);
    if (this.pendingOp === '×' || this.pendingOp === '÷') {
      const b = cur / 100;
      this.accumulator = this._compute(this.accumulator, this.pendingOp, b);
      this._finishToCurrent();
      this.pendingOp = null;
      this.freshEntry = true;
      return;
    }
    if (this.pendingOp === '+' || this.pendingOp === '-') {
      if (this.percentStage === 0) {
        this.percentAmount = this.accumulator * (cur / 100);
        this.current = this._format(this.percentAmount);
        this.percentStage = 1;
        this.freshEntry = true;
      } else {
        const total = this._compute(this.accumulator, this.pendingOp, this.percentAmount);
        this.accumulator = total;
        this._finishToCurrent();
        this.pendingOp = null;
        this.freshEntry = true;
        this.percentStage = 0;
      }
      return;
    }
    // 演算子未入力時: そのまま /100 する
    this.accumulator = cur / 100;
    this._finishToCurrent();
    this.freshEntry = true;
  }

  allClear() {
    this.reset();
  }
}

export { Calculator };
